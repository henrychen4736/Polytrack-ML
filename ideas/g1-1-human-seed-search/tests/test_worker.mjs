// section_worker.mjs through its message protocol: one worker process (one
// simulator) plus one Env in this process to replay what the worker claims
// from the START LINE. The worker only ever drives from a save state at the
// section's start, so "the lap it returns, replayed from tick 0, finishes on
// the tick it says" is the check everything else rests on.
import { createPool } from '../../../sim/pool.mjs';
import { Env, loadTrack } from '../../../sim/env.mjs';
import { encodeRecording, CHANNELS } from '../../../sim/recording.mjs';
import { humanLaps, recordingToTimeline } from '../../shared/laps.mjs';
import { checker } from '../../shared/tests/harness.mjs';

const { check, eq, note } = checker();
const TRACK = 'desert4';
const human = humanLaps(TRACK)[0];
const F = human.frames; // 21750
const lap0 = recordingToTimeline(human.recording);
const before = (timeline, tick) => JSON.stringify(CHANNELS.map((ch) => timeline[ch].filter((t) => t < tick)));
const valid = (timeline) => CHANNELS.every((ch) => timeline[ch].every((t, i) => Number.isInteger(t) && t >= 0 && (i === 0 || t > timeline[ch][i - 1])));

const pool = await createPool(TRACK, 1, '../ideas/g1-1-human-seed-search/section_worker.mjs');
const ask = async (request) => (await pool.runAll([request]))[0];
const env = await Env.create();
const inputs = loadTrack(TRACK);
/** The finish tick of a timeline replayed from the start line, or null. */
const replay = async (timeline, limit = F + 500) => { const r = await env.evaluate(inputs, encodeRecording(timeline), limit); return r.finished ? r.finishFrames : null; };

// ---- prepare ---------------------------------------------------------------------
eq((await ask({ cmd: 'prepare', recording: lap0, start: 0, limit: F + 1000 })).finishFrames, F, `prepare(human lap, start 0): finishes on ${F}`);
eq((await ask({ cmd: 'prepare', recording: lap0, start: 20000, limit: F + 1 })).finishFrames, F, 'prepare(start 20000): the lap driven on from the save state finishes on the same tick');
eq((await ask({ cmd: 'prepare', recording: lap0, start: 20000, limit: F - 1 })).finishFrames, null, 'prepare with a limit one tick short of the finish: finishFrames null');
eq((await ask({ cmd: 'prepare', recording: { ...lap0, up: [] }, start: 0, limit: 3000 })).finishFrames, null, 'prepare(a lap that never presses W): finishFrames null');
eq(await ask({ cmd: 'noop' }), {}, "an unknown command ('noop') is answered with an empty reply");

/** Search one section and check everything a reply must satisfy. */
async function searchSection(label, start, end, seconds, settings = {}) {
  const prepared = await ask({ cmd: 'prepare', recording: lap0, start, limit: F + 1 });
  const r = await ask({ cmd: 'search', end, seconds, seed: 1, ...settings });
  const s = r.stats, kept = s.small + s.big + s.repaired;
  note(`${label}: ${s.tried} tried, ${s.followed} driven on, ${kept} kept, ${F - r.frames} ms on the clock, ${r.gained.toFixed(2)} ms measured`);
  check(prepared.finishFrames === F && s.tried > 0 && s.followed <= s.tried && kept <= s.followed + s.spliced + s.repairDrives, `${label}: counts are consistent (tried >= driven on >= kept)`);
  check(valid(r.recording), `${label}: the returned lap is a valid timeline (every key's flips strictly increasing)`);
  check(r.frames <= F && (kept > 0) === (r.gained > 0) && (kept > 0 || JSON.stringify(r.recording) === JSON.stringify(lap0)),
    `${label}: never slower than the input; "gained" is positive exactly when a step was kept; with none kept the lap is returned unchanged`);
  const real = await replay(r.recording);
  check(real === r.frames, `${label}: the returned lap replayed from the START LINE finishes on tick ${real}; the worker says ${r.frames}`);
  check(before(r.recording, start) === before(lap0, start), `${label}: no key change before the section start (tick ${start}) was touched`);
  return r;
}

// ---- search, default settings -------------------------------------------------------
// The last section (candidates driven straight to the finish) and a mid-lap
// one (driven to the section end, compared with the old path, then on).
const last = await searchSection('last section, 20250 to the finish, 5 s', 20250, 21750, 5);
await searchSection('section 18000 to 19500, 6 s', 18000, 19500, 6);
// The time limit is honoured (a candidate in flight may finish: allow 2 s).
{
  await ask({ cmd: 'prepare', recording: lap0, start: 20250, limit: F + 1 });
  const t0 = Date.now();
  await ask({ cmd: 'search', end: 21750, seconds: 1, seed: 2 });
  const took = (Date.now() - t0) / 1000;
  check(took >= 1 && took < 3, `search(seconds: 1) returns after ${took.toFixed(1)} s`);
}

// ---- adopt ------------------------------------------------------------------------------
// Another process's faster lap (the one found above), same keys before the section start.
if (last.frames < F || last.gained > 0) {
  await ask({ cmd: 'prepare', recording: lap0, start: 20250, limit: F + 1 });
  eq((await ask({ cmd: 'adopt', recording: last.recording, limit: last.frames + 1 })).finishFrames, last.frames, `adopt(the lap found above): finishes on ${last.frames} from this worker's save state too`);
} else note('SKIP adopt: the 5 s search found nothing to adopt');

// ---- changes must not reach back before the save state -------------------------------------
// The save state at `start` already contains everything before it, so a
// candidate whose change moves a key flip to BEFORE `start` is driven as one
// lap and written down as another. mutate() of sim/search.mjs moves a flip up
// to maxShift = 20 ticks and only requires the flip to START inside the
// window. To make that case certain rather than rare: a section that starts
// exactly on a flip of the human lap (21180, with another at 21194), and
// minLead = -1e9 so that every candidate that still finishes in time is kept.
{
  const start = 21180;
  check(CHANNELS.some((ch) => lap0[ch].includes(start)), `the human lap has a key flip exactly on tick ${start} (what this case needs)`);
  // Seeds 1 and 5 are two that produced flips at 21177 to 21179 before the fix
  // (seeds 2, 3, 4 and 6 happened to delete the two flips instead).
  for (const seed of [1, 5]) {
    await ask({ cmd: 'prepare', recording: lap0, start, limit: F + 1 });
    const r = await ask({ cmd: 'search', end: F, seconds: 4, seed, minLead: -1e9, insertChance: 0 });
    const kept = r.stats.small + r.stats.big + r.stats.repaired;
    note(`forced acceptance from tick ${start}, seed ${seed}: ${r.stats.tried} tried, ${kept} kept, worker says ${r.frames}; left flips after 21100: ${r.recording.left.filter((t) => t > 21100).join(' ')}`);
    check(kept >= 5, `seed ${seed}: forced acceptance keeps many steps (${kept}), so the lap has been changed many times`);
    check(before(r.recording, start) === before(lap0, start), `seed ${seed}: after ${kept} kept steps no key flip has been moved to before the section start`);
    const real = await replay(r.recording);
    check(real === r.frames, `seed ${seed}: the lap replayed from the START LINE finishes on tick ${real}; the worker says ${r.frames}`);
  }
}

pool.close();
await env.close();
