// Drive one lap with the pure-pursuit controller.
//
// This is the loop that used to live in scripts/drive_baseline.mjs, pulled out
// so the settings search can run the same lap thousands of times.
import { readFileSync, existsSync } from 'node:fs';
import { decodeState } from './state.mjs';
import { buildLine } from './line.mjs';
import { createController } from './controller.mjs';

/** Physics ticks per controller decision. 5 ms is fast enough to hold a
 *  steering angle steady by tapping keys, and keeps step calls cheap. */
export const DECISION_TICKS = 5;

/** The human lap we take the reference line from: the first leaderboard run
 *  in polyrl's fixtures for this track. Returns { frames, recording, ... }. */
export function loadHumanLap(trackName) {
  // Two sources, tried in this order:
  //   1. polyrl's fixtures (summer1 and winter1 only). Kept first so that
  //      everything tuned or trained against those two laps stays reproducible.
  //   2. data/laps/<track>.json, written by scripts/fetch_laps.mjs, fastest
  //      lap first. This covers every other official track.
  const sources = [
    new URL(`../vendor/polyrl/fixtures/leaderboard_${trackName}.json`, import.meta.url),
    new URL(`../data/laps/${trackName}.json`, import.meta.url),
  ];
  for (const file of sources) {
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))[0];
  }
  throw new Error(`no human lap for ${trackName}; run: node scripts/fetch_laps.mjs ${trackName}`);
}

/** Replay the human lap in `env` and turn its trajectory into a reference line. */
export async function loadReferenceLine(env, track, trackName) {
  const human = loadHumanLap(trackName);
  const run = await env.replay(track, human.recording, human.frames + 100);
  return { line: buildLine(run.states), human };
}

/**
 * Put a fresh car on the start line and let the controller drive it.
 *
 *   options   controller settings (see DEFAULTS in sim/controller.mjs)
 *   limits.maxTicks     give up after this many ticks (1 tick = 1 ms)
 *   limits.stallTicks   give up if the car makes no progress along the line
 *                       for this long: it has crashed, flipped or left the track
 *   limits.keepControls record the keys held on every tick (needed to export
 *                       the lap as a recording; skipped during a search)
 *   limits.onDecision   optional callback after each decision, for progress output
 *
 * Returns:
 *   outcome       'finished' | 'stalled' | 'out of time'
 *   finishFrames  lap time in ticks, or null if it did not finish
 *   fraction      how far along the line the car got, 0..1
 *   worstOffLine  largest distance from the line during the lap
 *   state         the last decoded car state
 *   controlsPerTick  keys per tick up to the finish (if keepControls)
 */
export async function driveLap(env, track, line, options = {}, limits = {}) {
  const { maxTicks = 90000, stallTicks = 3000, keepControls = true, onDecision = null } = limits;
  env.reset(track);
  const decide = createController(line, options);
  const controlsPerTick = [];

  // The first decision needs a state, and a state only exists after a tick, so
  // take one tick with no keys pressed.
  let state = decodeState((await env.step({}, 1))[0]);
  if (keepControls) controlsPerTick.push({});

  let worstOffLine = 0, bestProgress = 0, lastProgressTick = 0;
  let outcome = 'out of time';
  while (state.frames < maxTicks) {
    const { controls, progress, offLine } = decide(state);
    const states = await env.step(controls, DECISION_TICKS);
    if (keepControls) for (let k = 0; k < DECISION_TICKS; k++) controlsPerTick.push(controls);
    state = decodeState(states.at(-1));

    worstOffLine = Math.max(worstOffLine, offLine);
    if (progress > bestProgress) { bestProgress = progress; lastProgressTick = state.frames; }
    onDecision?.({ state, progress, offLine });
    if (state.finishFrames != null) { outcome = 'finished'; break; }
    if (state.frames - lastProgressTick > stallTicks) { outcome = 'stalled'; break; }
  }

  const finished = outcome === 'finished';
  return {
    outcome,
    finishFrames: finished ? state.finishFrames : null,
    fraction: bestProgress / (line.points.length - 1),
    worstOffLine,
    state,
    // The finish can land mid-decision; keep only the ticks up to it.
    controlsPerTick: keepControls && finished ? controlsPerTick.slice(0, state.finishFrames) : null,
  };
}
