// Checks of the memory map and of the session logic.
//
//   node ideas/g2-5-memory-policy/memory_test.mjs          (one simulator, about 15 s)
//
// Part 1 needs no simulator: made-up attempt traces go into a TrackMemory and
// the numbers that come out are compared with what they must be.
// Part 2 runs MemoryEnv on desert4 with short attempts (the car is steered
// off the road from the first decision, so each lasts a second or two) and
// checks that sessions begin, count and end as memory_env.mjs says, including
// after a change of reference lap.
import assert from 'node:assert/strict';
import { TrackMemory, MEM_SIZE, BIN, DOOM_MS, POINTS, PER_POINT } from './track_memory.mjs';
import { MemoryEnv, MEMORY_OBS_SIZE } from './memory_env.mjs';
import { OBS_SIZE } from '../../rl/racing_env.mjs';
import { BLOCK_ENV } from '../shared/block_rollout.mjs';

let passed = 0;
const check = (ok, what) => { assert.ok(ok, what); passed++; console.log('  ok    ' + what); };

// ---- part 1: the map -------------------------------------------------------
console.log('1. TrackMemory on made-up traces');
// A car at a steady 40 units/s (144 km/h), one sample per 50 ms, from
// progress 0. `until` in units; lateral fixed.
const steady = (until, speedKmh, lateral, from = 0) => {
  const trace = [], perStep = (speedKmh / 3.6) * 0.05;
  for (let p = from, tick = 1; p <= until; p += perStep, tick += 50) trace.push({ progress: p, speedKmh, lateral, tick });
  return trace;
};
const memory = new TrackMemory(1000);
check(MEM_SIZE === POINTS * PER_POINT + 4 && MEM_SIZE === 130, 'MEM_SIZE is 21 x 6 + 4 = 130');

// Attempt 1: 144 km/h, 1.5 units left of the line, crashes at 400 units.
const crash = steady(400, 144, 1.5);
const first = memory.commit(crash, { crashed: true });
const doomUnits = 40 * DOOM_MS / 1000;                       // 120 units driven in the last 3 s
check(first.crashBin === Math.floor(400 / BIN) || first.crashBin === Math.floor(400 / BIN) - 1, `the crash is recorded in the bin at 400 units (bin ${first.crashBin})`);
check(Math.abs(first.doomedBins * BIN - doomUnits) <= 2 * BIN, `the last ${DOOM_MS} ms before it are doomed: ${first.doomedBins * BIN} units (expected about ${doomUnits})`);
check(memory.passSpeed[memory.bin(200)] === 144 && memory.failSpeed[memory.bin(200)] === 0, 'at 200 units: a surviving speed of 144, nothing doomed');
check(memory.failSpeed[memory.bin(350)] === 144 && memory.passSpeed[memory.bin(350)] === 0, 'at 350 units: a doomed speed of 144, nothing surviving');
check(memory.visits[memory.bin(350)] === 1 && memory.visits[memory.bin(500)] === 0, 'visited up to the crash and not beyond');

// Attempt 2: slower (108 km/h), on the line, finishes.
memory.commit(steady(1000, 108, 0), { finished: true, finishFrames: 33334 });
check(memory.passSpeed[memory.bin(350)] === 108 && memory.failSpeed[memory.bin(350)] === 144, 'after a slower finished attempt, 350 units holds the bracket: 108 got through, 144 did not');
check(memory.passSpeed[memory.bin(200)] === 144, 'at 200 units the faster of the two surviving speeds is kept');
check(memory.attempts === 2 && memory.finishes === 1 && memory.bestFinish === 33334, 'two attempts, one finish, its lap time');

// The read-out from 250 units at 144 km/h: lookahead gap 0.15 s x 40 = 6 units.
const edges = Array.from({ length: POINTS + 1 }, (_, k) => 250 + 6 * k);
const out = memory.features(edges, 9999, new Float32Array(MEM_SIZE));
const stretch = (k) => Array.from(out.subarray(PER_POINT * k, PER_POINT * (k + 1)));
check(stretch(0)[0] === 0.5 && stretch(0)[1] === 0 && Math.abs(stretch(0)[2] - 144 / 300) < 1e-6 && Math.abs(stretch(0)[3] - 0.15) < 1e-6 && stretch(0)[4] === 0,
  'stretch 0 (250..256 units): 2 visits, no crash, surviving speed 144 at 1.5 units left, nothing doomed');
const doomedFrom = Array.from({ length: POINTS }, (_, k) => k).find((k) => stretch(k)[4] > 0);
check(Math.abs(250 + 6 * doomedFrom - (400 - doomUnits)) <= 8, `the doomed speed first shows in stretch ${doomedFrom}, i.e. ${250 + 6 * doomedFrom} units (the doomed stretch starts at about ${400 - doomUnits})`);
check(Math.abs(stretch(doomedFrom + 1)[4] - 144 / 300) < 1e-6 && Math.abs(stretch(doomedFrom + 1)[2] - 108 / 300) < 1e-6, 'there the inputs read: 108 got through, 144 did not');
check(out[126] === 0.25 && out[127] === 1 && out[129] === 3, 'globals: 2 attempts (2/8), a finish exists, furthest attempt is far ahead (clipped at 3)');
// A crash exactly between two lookahead points must still be seen.
const sparse = Array.from({ length: POINTS + 1 }, (_, k) => 340 + 12 * k);   // 12-unit stretches, as at 290 km/h
const far = memory.features(sparse, 0, new Float32Array(MEM_SIZE));
check(Array.from({ length: POINTS }, (_, k) => far[PER_POINT * k + 1]).filter((v) => v > 0).length === 1, 'with 12-unit stretches the single crash bin shows in exactly one stretch');
// Part-way starts do not claim the road before them.
const partWay = new TrackMemory(1000);
partWay.commit(steady(900, 144, 0, 600), { finished: true });
check(partWay.visits[partWay.bin(300)] === 0 && partWay.visits[partWay.bin(700)] === 1, 'an attempt started at 600 units leaves the road before it unvisited');
memory.clear();
check(memory.attempts === 0 && memory.features(edges, 0, new Float32Array(MEM_SIZE)).every((v) => v === 0), 'after clear() every input is 0');

// ---- part 2: sessions in the real environment -------------------------------
console.log('2. MemoryEnv sessions on desert4 (attempts steered off the road at once)');
const menv = await MemoryEnv.create({ track: 'desert4', ...BLOCK_ENV, sessionMax: 3, sessionSeed: 5 });
const OFF = [1, 0, 1, 0, 0, 0];   // W and left
const log = [];
async function attempt() {
  const { obs, info } = await menv.reset({ startFraction: 0 });
  const memoryAtStart = obs.slice(OBS_SIZE).reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  let r;
  do r = await menv.stepBlock(OFF); while (!r.terminated && !r.truncated);
  log.push({ attempt: info.attempt, memoryAtStart, sessionEnd: r.info.sessionEnd, obsLength: r.obs.length, reason: r.info.reason });
  return log.at(-1);
}
for (let k = 0; k < 9; k++) await attempt();
console.log('     attempt numbers: ' + log.map((a) => a.attempt + (a.sessionEnd ? '|' : '')).join(' ') + '   (| = session end)');
check(log.every((a) => a.obsLength === MEMORY_OBS_SIZE && MEMORY_OBS_SIZE === 482), 'every observation is 482 long');
check(log.every((a) => (a.attempt === 1) === (a.memoryAtStart === 0)), 'the memory inputs are all zero at the start of attempt 1 of a session and never otherwise');
check(log.every((a, k) => k === 0 || (a.attempt === 1) === !!log[k - 1].sessionEnd), 'attempt 1 follows exactly the attempts flagged sessionEnd');
check(Math.max(...log.map((a) => a.attempt)) <= 3 && new Set(log.filter((a) => a.sessionEnd).map((a) => a.attempt)).size > 1, 'sessions last 1 to 3 attempts, and not all the same length');
// A new reference line empties the memory even in the middle of a session.
while (log.at(-1).sessionEnd) await attempt();                // make sure a session is under way
await menv.setReference(1);
const afterSwitch = await attempt();
check(afterSwitch.attempt === 1 && afterSwitch.memoryAtStart === 0, 'after setReference() the next attempt is attempt 1 with an empty memory');
await menv.close();
console.log(`all ${passed} checks passed`);
