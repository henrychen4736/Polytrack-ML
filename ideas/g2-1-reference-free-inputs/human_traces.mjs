// The fastest human lap of a track as a list of car states, for VALIDATING a
// route (validate.mjs). Nothing in route.mjs / observation.mjs reads this:
// they must work on a track that has no human lap at all.
//
//   const trace = await humanTrace('desert4');      // replays once, then cached
//   trace.samples[k] = { tick, position, quaternion, speedKmh, grounded, checkpoint }
//
// One sample every EVERY ticks (10 ms). At 300 km/h the car moves 0.83 units
// in 10 ms, finer than the 1-unit route spacing it is compared against.
//
// The replay needs one simulator for about a second per track. The result is
// cached in cache/ (git-ignored: it is derived from the laps in data/laps and
// stays on this machine), so the validation table can be rebuilt without a
// simulator while the route code is being changed.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Env, loadTrack } from '../../sim/env.mjs';
import { decodeState } from '../../sim/state.mjs';
import { humanLaps } from '../shared/laps.mjs';

/** Ticks between kept samples. */
export const EVERY = 10;
const CACHE = new URL('./cache/', import.meta.url);

/**
 * Samples of human lap `lapNumber` (0 = fastest) of `track`.
 * `env`: an Env to replay on (its car is replaced); without one, a simulator
 * is booted and closed here. Returns { track, frames, finished, samples }.
 */
export async function humanTrace(track, { lapNumber = 0, env = null } = {}) {
  const file = new URL(`trace_${track}_${lapNumber}.json`, CACHE);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const lap = humanLaps(track)[lapNumber];
  const own = env ?? await Env.create();
  const run = await own.replay(loadTrack(track), lap.recording, lap.frames + 100);
  if (!env) await own.close();
  const samples = [];
  for (let t = 0; t < run.states.length; t += EVERY) {
    const s = decodeState(run.states[t]);
    samples.push({
      tick: s.frames, position: s.position, quaternion: s.quaternion, speedKmh: s.speedKmh,
      grounded: s.wheelContact.some(Boolean), wheels: s.wheelContact.filter(Boolean).length,
      checkpoint: s.nextCheckpointIndex,
    });
  }
  const trace = { track, frames: lap.frames, finished: run.finished, samples };
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(file, JSON.stringify(trace));
  return trace;
}

// Run directly: build the cache for every track (one simulator, about 20 s).
if (process.argv[1]?.endsWith('human_traces.mjs')) {
  const { TRACKS } = await import('../shared/laps.mjs');
  const env = await Env.create();
  for (const track of TRACKS) {
    const t = await humanTrace(track, { env });
    console.log(track, t.frames, t.finished, t.samples.length);
  }
  await env.close();
}
