// Laps in one consistent form, and the conversions between the four ways this
// project writes a lap down.
//
// The four forms, and where each is used:
//
//   keys       one { up, right, down, left, reset } object PER TICK (1 tick =
//              1 ms). keys[t] is what was held while the physics computed tick
//              t. This is what the simulator is stepped with and what
//              runs/<run>_<track>.json stores as `controlsPerTick`.
//   timeline   { up: [ticks], right: [...], down, left, reset }: for each key,
//              the ticks at which it flips (all keys start released). What
//              sim/recording.mjs calls a decoded recording and what
//              scripts/search_timeline.mjs mutates.
//   recording  the timeline packed into the text string the game itself uses
//              for ghosts and leaderboard entries. What Env.replay / evaluate /
//              Verify take, and what data/laps/<track>.json holds.
//   decisions  block decisions, [steer, steerAt, w, wAt, s, sAt] per 50 ms
//              (BLOCK DECISIONS in rl/racing_env.mjs). What the block policies
//              output and scripts/search_rollout.mjs searches over.
//
// keys <-> timeline <-> recording are exact both ways. keys -> decisions is
// NOT: a block decision allows one change per control per 50 ms, on a 10 ms
// grid, and human laps change keys on any tick. keysToDecisions() therefore
// reports how many ticks its answer gets wrong.
//
// Nothing here starts a simulator; every function is plain data in, data out.
import { readFileSync, existsSync } from 'node:fs';
import { decodeRecording, encodeRecording, toDense, fromDense, CHANNELS } from '../../sim/recording.mjs';

/** The project root, so paths can be given as 'runs/x.json' from anywhere. */
export const ROOT = new URL('../../', import.meta.url);

/** The 17 official tracks that have human laps in data/laps/. */
export const TRACKS = [
  'summer1', 'summer2', 'summer3', 'summer4', 'summer5', 'summer6', 'summer7',
  'winter1', 'winter2', 'winter3', 'winter4', 'winter5',
  'desert1', 'desert2', 'desert3', 'desert4', 'desert5',
];

// ---- exact conversions -------------------------------------------------------

/** recording string -> keys per tick, `frames` of them. */
export const recordingToKeys = (recording, frames) => toDense(decodeRecording(recording), frames);
/** keys per tick -> recording string. */
export const keysToRecording = (keys) => encodeRecording(fromDense(keys));
/** keys per tick -> timeline (flip ticks per key). */
export const keysToTimeline = (keys) => fromDense(keys);
/** timeline -> keys per tick, `frames` of them. */
export const timelineToKeys = (timeline, frames) => toDense(timeline, frames);
export { decodeRecording as recordingToTimeline, encodeRecording as timelineToRecording };

/** True if two per-tick key lists hold the same keys on every tick. */
export function sameKeys(a, b) {
  if (a.length !== b.length) return false;
  for (let t = 0; t < a.length; t++) for (const ch of CHANNELS) if (!!a[t][ch] !== !!b[t][ch]) return false;
  return true;
}

// ---- loading -----------------------------------------------------------------

/**
 * The ten human laps of a track, fastest first, each as a full lap object
 * (see loadLap for the fields). `source` is 'human:<n>'.
 * Lap 0 of data/laps/ is the lap the block specialists are measured against
 * EXCEPT on summer1 and winter1, where the trainers' default reference
 * (sim/drive.mjs loadHumanLap) is polyrl's fixture instead; use
 * loadLap('fixture:summer1') for that one.
 */
export function humanLaps(track) {
  const file = new URL(`data/laps/${track}.json`, ROOT);
  if (!existsSync(file)) throw new Error(`no data/laps/${track}.json`);
  return JSON.parse(readFileSync(file, 'utf8')).map((lap, n) => normalise(lap, track, `human:${n}`));
}

/**
 * Load one lap from anywhere, in one form:
 *
 *   { track, frames, finished, recording, keys, source }
 *     frames     lap time in ticks = ms (for an unfinished attempt: where it ended)
 *     finished   false only for files saved as crashed attempts
 *     recording  the game's string
 *     keys       per-tick keys, exactly `frames` long
 *
 * `what` may be:
 *   'human:3', track         lap 3 (0 = fastest) of data/laps/<track>.json
 *   'fixture:summer1'        the first lap of vendor/polyrl's leaderboard fixture
 *   'runs/x_desert4.json'    a file with { finishFrames, controlsPerTick }
 *                            (RacingEnv.save, rollout_child 'save')
 *   'runs/x_desert4.recording.json'   a file with { frames, recording }
 *                            (export_recording.mjs, search_timeline.mjs)
 *   an object in either of those two shapes
 * Paths are relative to the project root.
 */
export function loadLap(what, track = null) {
  if (typeof what === 'object') return normalise(what, track ?? what.track, 'object');
  if (what.startsWith('human:')) {
    const lap = humanLaps(track)[Number(what.slice(6))];
    if (!lap) throw new Error(`no lap ${what} for ${track}`);
    return lap;
  }
  if (what.startsWith('fixture:')) {
    const name = what.slice(8);
    return normalise(JSON.parse(readFileSync(new URL(`vendor/polyrl/fixtures/leaderboard_${name}.json`, ROOT), 'utf8'))[0], name, what);
  }
  const saved = JSON.parse(readFileSync(new URL(what, ROOT), 'utf8'));
  return normalise(saved, track ?? saved.track, what);
}

function normalise(saved, track, source) {
  const finished = saved.finished !== false;
  if (saved.controlsPerTick) {
    const keys = saved.controlsPerTick;
    return { track, frames: saved.finishFrames ?? keys.length, finished, recording: keysToRecording(keys), keys, source };
  }
  if (saved.recording && saved.frames) {
    return { track, frames: saved.frames, finished, recording: saved.recording, keys: recordingToKeys(saved.recording, saved.frames), source };
  }
  throw new Error(`${source}: neither { finishFrames, controlsPerTick } nor { frames, recording }`);
}

// ---- block decisions -----------------------------------------------------------

/** Ticks per 10 ms slice, slices per block, and the tick a lap's first block
 *  starts on. LEAD is 1 because an episode from the start line begins with one
 *  tick of no keys (the simulator has no state to observe before a tick has
 *  run; see _buildLadder in rl/racing_env.mjs), so block k covers ticks
 *  1 + 50k .. 50 + 50k. */
export const SLICE_TICKS = 10, BLOCK_SLICES = 5, LEAD = 1;
export const BLOCK_TICKS = SLICE_TICKS * BLOCK_SLICES;

const steerOf = (c) => (c.left ? 1 : c.right ? 2 : 0);   // left wins, as in controlsToAction
const controlsOf = (steer, w, s) => ({ up: w === 1, right: steer === 2, down: s === 1, left: steer === 1, reset: false });

/**
 * decisions -> the keys per tick that RacingEnv.stepBlock would hold for them
 * from the start line: LEAD empty ticks, then 50 per decision. Exact.
 *   before   [steer, w, s] held as the first decision begins (default none)
 *   lead     0 to get only the 50-per-decision part (a stretch mid-lap)
 */
export function decisionsToKeys(decisions, { before = [0, 0, 0], lead = LEAD } = {}) {
  const keys = [];
  for (let t = 0; t < lead; t++) keys.push(controlsOf(0, 0, 0));
  let [steer0, w0, s0] = before;
  for (const [steer, steerAt, w, wAt, s, sAt] of decisions) {
    for (let slice = 0; slice < BLOCK_SLICES; slice++) {
      const c = controlsOf(slice >= steerAt ? steer : steer0, slice >= wAt ? w : w0, slice >= sAt ? s : s0);
      for (let k = 0; k < SLICE_TICKS; k++) keys.push(c);
    }
    steer0 = steer; w0 = w; s0 = s;
  }
  return keys;
}

/**
 * keys -> the block decisions closest to them (the rule demo() uses to label
 * human laps, _blockLabel in rl/racing_env.mjs): each control's target is its
 * state on the block's last tick, and its switch slice is where its final run
 * of that state began, rounded to 10 ms.
 *
 * Returns { decisions, wrongTicks, before }:
 *   wrongTicks  on how many ticks decisionsToKeys(decisions) differs from
 *               `keys`. 0 for a lap a block policy drove; for human laps,
 *               measured on the fastest lap of each of desert4 / summer1 /
 *               winter2: 2.8%, 1.7% and 5.7% of ticks, which is
 *               enough to change the lap, so DO NOT assume the decisions
 *               reproduce a human lap: drive them and see.
 *   before      [steer, w, s] after the last decision (to continue from).
 * A last block shorter than 50 ticks is filled by holding the final keys.
 * Where a control ends a block as it began, its switch slice is written as 0
 * (stepBlock ignores it then).
 */
export function keysToDecisions(keys, { before = [0, 0, 0], lead = LEAD } = {}) {
  const read = [steerOf, (c) => (c.up ? 1 : 0), (c) => (c.down ? 1 : 0)];
  const decisions = [];
  let was = before.slice();
  for (let t = lead; t < keys.length; t += BLOCK_TICKS) {
    const end = Math.min(keys.length, t + BLOCK_TICKS) - 1;
    const decision = [];
    for (let control = 0; control < 3; control++) {
      const target = read[control](keys[end]);
      let at = 0;
      if (target !== was[control]) {
        let first = end;
        while (first > t && read[control](keys[first - 1]) === target) first--;
        at = Math.min(BLOCK_SLICES - 1, Math.round((first - t) / SLICE_TICKS));
      }
      decision.push(target, at);
    }
    decisions.push(decision);
    was = [decision[0], decision[2], decision[4]];
  }
  const back = decisionsToKeys(decisions, { before, lead });
  let wrongTicks = 0;
  for (let t = 0; t < keys.length; t++) {
    const a = keys[t], b = back[t];
    if (steerOf(a) !== steerOf(b) || !!a.up !== b.up || !!a.down !== b.down) wrongTicks++;
  }
  return { decisions, wrongTicks, before: was };
}
