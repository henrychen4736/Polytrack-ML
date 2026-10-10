// child.mjs through openSims() of fine.mjs: ONE worker process, plus one Env
// in this process that replays the same timelines from the START LINE. The
// child answers "when does this lap finish" from a save state part-way round
// (and from a ladder of older save states), so every answer here is compared
// with the plain replay. This is also where a fault in SimSession.load()
// would show: the child loads a save state before every single try.
import { readFileSync } from 'node:fs';
import { openSims, nudge, listFlips } from '../fine.mjs';
import { Env, loadTrack } from '../../../sim/env.mjs';
import { encodeRecording } from '../../../sim/recording.mjs';
import { decodeState } from '../../../sim/state.mjs';
import { humanLaps, recordingToTimeline } from '../../shared/laps.mjs';
import { checker } from '../../shared/tests/harness.mjs';

const { check, eq, note } = checker();
const human = humanLaps('desert4')[0];
const F = human.frames; // 21750
const lap = recordingToTimeline(human.recording);

const sims = await openSims('desert4', 1);
const env = await Env.create();
const inputs = loadTrack('desert4');
/** Plain replay from the start line: finish tick, or null if not finished by `limit`. */
const replay = async (timeline, limit) => { const r = await env.evaluate(inputs, encodeRecording(timeline), limit); return r.finished ? r.finishFrames : null; };
const tryOne = async (timeline, maxFrames, samples) => (await sims.tryAll([timeline], maxFrames, samples))[0];

// ---- prepare / try on the unchanged lap --------------------------------------------------
eq(await sims.prepare(lap, 0), [{ tick: 0 }], 'prepare(lap, 0): one reply per worker, tick 0');
let r = await tryOne(lap, F + 1000);
eq([r.finished, r.finishFrames, r.contactTicks, r.samples], [true, F, 0, []], `try from the start line: finishes on ${F}, no contact, no samples asked for`);
check(r.position.length === 3 && r.velocity.length === 3 && Math.hypot(...r.velocity) > 30, `the reply carries the car's position and velocity on the finish tick (${(Math.hypot(...r.velocity) * 3.6).toFixed(0)} km/h)`);
eq(await sims.prepare(lap, 18000), [{ tick: 18000 }], 'prepare(lap, 18000): the car is put at tick 18000');
const first = await tryOne(lap, F + 1000);
const second = await tryOne(lap, F + 1000);
eq([first.finishFrames, JSON.stringify(first) === JSON.stringify(second)], [F, true], 'try from the save state at 18000: the same finish tick, and twice gives the identical reply');
eq(JSON.stringify(first.position), JSON.stringify(r.position), 'and the car is in the identical place on the finish tick as when driven from the start line');
r = await tryOne(lap, F - 1);
eq([r.finished, r.finishFrames], [false, null], 'try with maxFrames one tick short of the finish: not finished');
r = await tryOne(lap, F);
eq([r.finished, r.finishFrames], [true, F], 'try with maxFrames exactly the finish tick: finished');
eq(sims.tries, 5, 'sims.tries counts the timelines tried (5 so far)');

// ---- samples ---------------------------------------------------------------------------------
{
  const run = await env.replay(inputs, human.recording, F + 10);
  const at = (tick) => decodeState(run.states.find((u8) => decodeState(u8).frames === tick)).position;
  r = await tryOne(lap, F, [18500, 19000, 99999]);
  eq(r.samples.map((s) => s.frames), [18500, 19000], 'samples: one report per requested tick on the way; a tick beyond maxFrames is skipped');
  eq(r.samples.map((s) => s.position), [at(18500), at(19000)], 'and the sampled positions are exactly the car\'s positions on those ticks in a plain replay');
  check(r.samples.every((s) => s.quaternion.length === 4 && Math.hypot(...s.velocity) > 10), 'each sample has a quaternion and a velocity');
  r = await tryOne(lap, F, [17000, 18000]);
  eq(r.samples, [], 'samples at or before the prepared tick are skipped');
}

// ---- candidates: the answer from the save state must be the answer from the start line -----------
{
  const flip = listFlips(lap).filter((f) => f.tick >= 19000 && f.tick <= 21200).at(-1); // the last steering flip before the line
  await sims.prepare(lap, flip.tick - 10);
  const ds = [-10, -6, -3, -1, 1, 3, 6, 10];
  const moved = ds.map((d) => nudge(lap, flip.ch, flip.i, d));
  const fromState = (await sims.tryAll(moved, F + 300)).map((x) => x.finishFrames);
  const fromStart = [];
  for (const timeline of moved) fromStart.push(await replay(timeline, F + 300));
  eq(fromState, fromStart, `flip ${flip.ch} at ${flip.tick} moved by ${ds.join(', ')}: finish ticks from the save state = finish ticks replayed from the start line`);
  note(`those finish ticks, minus ${F}: ${fromStart.map((x) => (x == null ? 'lost' : x - F)).join(', ')}`);
  check(new Set(fromStart).size > 1, 'and the moves really change the finish tick (the comparison is not of eight equal numbers)');
  eq((await sims.tryAll(moved.slice(0, 3), F + 300)).map((x) => x.finishFrames), fromStart.slice(0, 3), 'tryAll with several timelines on one worker returns the results in order');
}

// ---- the ladder of save states -----------------------------------------------------------------------
// After the tries above the child holds save states every 500 ticks made with
// the human lap. A lap that differs EARLIER than a save state must not be
// started from it.
{
  // A change about 10 s in that alters the lap's outcome (the README: nearly every move there loses the lap).
  const early = listFlips(lap).filter((f) => f.tick > 9000 && f.tick < 10500);
  let changed = null, truth = null;
  for (const f of early) for (const d of [5, -5, 8]) {
    if (changed) break;
    const candidate = nudge(lap, f.ch, f.i, d);
    if (!candidate) continue;
    const t = await replay(candidate, F + 300);
    if (t !== F) { changed = candidate; truth = t; note(`changed lap: ${f.ch} flip at ${f.tick} moved by ${d}; replayed from the start line it ${t == null ? 'does not finish within 300 ticks of the human time' : `finishes on ${t}`}`); }
  }
  if (check(changed != null, 'found an early key change that alters the outcome of the lap (needed for the next checks)')) {
    await sims.prepare(changed, 17000);
    r = await tryOne(changed, F + 300);
    eq(r.finishFrames, truth, 'prepare(changed lap, 17000) after the ladder was built with the unchanged lap: the try gives the changed lap\'s own result, not the old lap\'s');
    await sims.prepare(lap, 17000);
    eq((await tryOne(lap, F + 300)).finishFrames, F, 'and back to the unchanged lap: its own result again (21750)');
  }
  // A change exactly ON a ladder tick, and one tick before it. The state saved
  // at tick 16500 was made by keys 0..16499: a flip at 16500 does not invalidate it, one at 16499 does.
  for (const at of [16500, 16499]) {
    const tapped = { ...lap, down: [...lap.down, at, at + 30].sort((a, b) => a - b) };
    const want = await replay(tapped, F + 300);
    await sims.prepare(lap, 17000);
    await sims.prepare(tapped, 17000);
    eq((await tryOne(tapped, F + 300)).finishFrames, want, `a 30 ms brake tap starting on tick ${at} (${at % 500 === 0 ? 'exactly a ladder tick' : 'one tick before a ladder tick'}): same result as from the start line (${want == null ? 'lost' : want})`);
  }
  // Going backwards along the lap, as refine.mjs does by default.
  await sims.prepare(lap, 20000);
  await sims.prepare(lap, 12345);
  eq((await tryOne(lap, F)).finishFrames, F, 'prepare at 20000 and then at 12345 (a tick that is not a ladder tick): the try from 12345 finishes on 21750');
}

// ---- could the SimSession.load() defect have reached this folder's results? ---------------------------
{
  const source = readFileSync(new URL('../child.mjs', import.meta.url), 'utf8');
  const uses = source.match(/sim\.keys[^\n]*/g) ?? [];
  check(uses.length === 1 && /sim\.keys === undefined/.test(uses[0]), 'child.mjs reads sim.keys only to ask "has a car been made yet"; the laps it scores come from the parent\'s timeline, so wrong CONTENT in sim.keys after load() could not change a result');
}
sims.close();
await env.close();
