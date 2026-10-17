// Child process for the sectional search (scripts/search_sections.mjs): owns
// one simulator, holds one save state part-way round a lap, and drives short
// stretches from it on request. Started through sim/pool.mjs.
//
// Protocol (Node's built-in parent/child messaging; a recording here is the
// decoded form, { up: [ticks], right: [...], ... }, see sim/recording.mjs):
//   parent -> child  { track: 'summer1' }                 once, to choose the track
//   child -> parent  { ready: true }
//
//   { id, cmd: 'prepare', recording, start }
//       New car, drive `recording` for ticks 0 .. start-1, and save that
//       state. Every later request starts from it. Reply { id, ok: true }.
//
//   { id, cmd: 'try', recording, until }
//       Back to the saved state, drive ticks start .. until-1 with
//       `recording`, and report where the car ended up:
//       { id, frames, position, velocity, quaternion, finished, finishFrames, contactTicks }
//       (velocity in units per second, from the last tick's movement).
//
//   { id, cmd: 'run', recording, maxFrames, path }
//       Back to the saved state and drive `recording` until the finish or
//       until tick maxFrames. Reply { id, finished, finishFrames } and, if
//       `path` is set, also { first, position: [...], quaternion: [...] }:
//       the car after every tick from `first` on, which the parent uses as
//       the "old lap's path" (see sim/sectional.mjs).
//
// Local use only: nothing here contacts Kodub's servers.
import { Env, loadTrack, CAR_TICK_BUDGET } from './env.mjs';
import { decodeState, stateFinished } from './state.mjs';
import { controlsAt, nextFlipAfter } from './sectional.mjs';

const env = await Env.create();
let track = null;
let saved = null;   // save-state handle at tick `start`
let start = 0;
let prepared = null; // the recording the save state was made from

// A long section uses millions of ticks, so well before the game's limit on
// one car (CAR_TICK_BUDGET in env.mjs) the car is replaced and the save state
// rebuilt, which costs one drive from the start line.

/** New car, drive the prepared lap to tick `start`, save that state. */
async function prepare() {
  // A new car makes the old save state useless (see sim/env.mjs), so free it.
  env.dropAllStates();
  env.reset(track);
  await drive(prepared, 0, start);
  saved = await env.saveState();
}

// Never hold one set of keys for more than this many ticks in a single call
// to the simulator, so a lap that has finished is noticed promptly.
const CHUNK = 250;

/**
 * Drive `recording` for ticks from .. to-1 from wherever the car is now.
 * Keys only change at flips, so the simulator is called once per stretch of
 * unchanged keys, not once per tick. Stops early once the lap has finished.
 * `onState(bytes)` is called with the raw car state after every tick.
 * Returns the last raw state and the one before it (or null).
 */
async function drive(recording, from, to, onState) {
  let last = null, previous = null;
  for (let t = from; t < to;) {
    const n = Math.min(to, nextFlipAfter(recording, t), t + CHUNK) - t;
    const states = await env.step(controlsAt(recording, t), n);
    for (const s of states) { onState?.(s); }
    previous = n > 1 ? states[n - 2] : last;
    last = states[n - 1];
    t += n;
    if (states.some(stateFinished)) break;
  }
  return { last, previous };
}

process.on('message', async (msg) => {
  if (msg.track) {
    track = loadTrack(msg.track);
    process.send({ ready: true });
    return;
  }
  if (msg.cmd === 'prepare') {
    start = msg.start;
    prepared = msg.recording;
    await prepare();
    process.send({ id: msg.id, ok: true });
    return;
  }
  if (env.frames > CAR_TICK_BUDGET) await prepare();
  await env.loadState(saved);
  if (msg.cmd === 'try') {
    let contactTicks = 0;
    const { last, previous } = await drive(msg.recording, start, msg.until, (s) => {
      if (decodeState(s).collisionImpulses.length) contactTicks++;
    });
    const end = decodeState(last);
    // Velocity is not in the car state; one tick is 1 ms, so the movement
    // over the last tick times 1000 is units per second.
    const before = previous ? decodeState(previous).position : end.position;
    process.send({
      id: msg.id,
      frames: end.frames,
      position: end.position,
      velocity: end.position.map((v, k) => (v - before[k]) * 1000),
      quaternion: end.quaternion,
      finished: end.finishFrames != null,
      finishFrames: end.finishFrames,
      contactTicks,
    });
    return;
  }
  if (msg.cmd === 'run') {
    const position = [], quaternion = [];
    let first = null, finishFrames = null;
    await drive(msg.recording, start, msg.maxFrames, (s) => {
      const d = decodeState(s);
      if (finishFrames == null && d.finishFrames != null) finishFrames = d.finishFrames;
      if (!msg.path) return;
      first ??= d.frames;
      position.push(d.position);
      quaternion.push(d.quaternion);
    });
    process.send({
      id: msg.id, finished: finishFrames != null, finishFrames,
      ...(msg.path ? { first, position, quaternion } : {}),
    });
  }
});
