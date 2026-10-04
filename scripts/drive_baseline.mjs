// Stage 2, step 2: drive a lap with the pure-pursuit baseline controller.
//
// What it does:
//   1. Replays a human leaderboard lap and turns its trajectory into the
//      reference line.
//   2. Puts a fresh car on the start line and lets the controller drive it,
//      making one decision every DECISION_TICKS physics ticks (1 tick = 1 ms).
//   3. Reports whether the car finished, its time against the human's, and how
//      far it strayed from the line.
//
// Usage: node scripts/drive_baseline.mjs [track] [key=value ...]
//   track       summer1 (default) or winter1
//   key=value   override a controller setting, e.g. speedFactor=0.85
//               (see DEFAULTS in sim/controller.mjs)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Env, loadTrack } from '../sim/env.mjs';
import { decodeState } from '../sim/state.mjs';
import { buildLine } from '../sim/line.mjs';
import { createController } from '../sim/controller.mjs';

/** Physics ticks per controller decision. 5 ms is fast enough to hold a
 *  steering angle steady by tapping keys, and keeps step calls cheap. */
const DECISION_TICKS = 5;
/** Give up if the car makes no progress along the line for this many ticks
 *  (it has crashed, flipped or driven off the track). */
const STALL_TICKS = 3000;

const name = process.argv[2] && !process.argv[2].includes('=') ? process.argv[2] : 'summer1';
const options = Object.fromEntries(process.argv.slice(2).filter((a) => a.includes('=')).map((a) => { const [k, v] = a.split('='); return [k, Number(v)]; }));

const track = loadTrack(name);
const env = await Env.create();

// 1. Reference line from the first human run in the fixtures.
const human = JSON.parse(readFileSync(new URL(`../vendor/polyrl/fixtures/leaderboard_${name}.json`, import.meta.url), 'utf8'))[0];
const humanRun = await env.replay(track, human.recording, human.frames + 100);
const line = buildLine(humanRun.states);
console.log(`${name}: reference line has ${line.points.length} points over ${line.length} units (human lap ${(human.frames / 1000).toFixed(3)} s)`);

// 2. Drive.
env.reset(track);
const drive = createController(line, options);
// Every tick's controls, kept so step 3 can turn the lap into a recording.
const controlsPerTick = [];
// The first decision needs a state, and a state only exists after a tick, so
// take one tick with no keys pressed.
let state = decodeState((await env.step({}, 1))[0]);
controlsPerTick.push({});

const maxTicks = human.frames * 3; // a lap three times slower than the human is a failure anyway
let worstOffLine = 0, bestProgress = 0, lastProgressTick = 0, nextReport = 0.1;
let outcome = 'ran out of time';
while (state.frames < maxTicks) {
  const { controls, progress, offLine } = drive(state);
  const states = await env.step(controls, DECISION_TICKS);
  for (let k = 0; k < DECISION_TICKS; k++) controlsPerTick.push(controls);
  state = decodeState(states.at(-1));

  worstOffLine = Math.max(worstOffLine, offLine);
  if (progress > bestProgress) { bestProgress = progress; lastProgressTick = state.frames; }
  // One progress line per 10% of the lap.
  if (progress / (line.points.length - 1) >= nextReport) {
    console.log(`  ${Math.round(nextReport * 100)}% at ${(state.frames / 1000).toFixed(2)} s, ${state.speedKmh.toFixed(0)} km/h, ${offLine.toFixed(1)} off the line`);
    nextReport += 0.1;
  }
  if (state.finishFrames != null) { outcome = 'finished'; break; }
  if (state.frames - lastProgressTick > STALL_TICKS) { outcome = 'stalled'; break; }
}

// 3. Report.
const percent = (100 * bestProgress / (line.points.length - 1)).toFixed(1);
if (outcome === 'finished') {
  console.log(`FINISHED in ${(state.finishFrames / 1000).toFixed(3)} s (human ${(human.frames / 1000).toFixed(3)} s, ${(state.finishFrames / human.frames).toFixed(2)}x). Worst distance off the line: ${worstOffLine.toFixed(1)}`);
  // Save the inputs for step 3 (encoding as a recording and verifying it).
  mkdirSync(new URL('../runs/', import.meta.url), { recursive: true });
  const out = new URL(`../runs/baseline_${name}.json`, import.meta.url);
  writeFileSync(out, JSON.stringify({ track: name, finishFrames: state.finishFrames, controlsPerTick: controlsPerTick.slice(0, state.finishFrames) }));
  console.log(`saved inputs to runs/baseline_${name}.json`);
} else {
  console.log(`DID NOT FINISH (${outcome}) at ${(state.frames / 1000).toFixed(2)} s: reached ${percent}% of the line, checkpoint ${state.nextCheckpointIndex}, position (${state.position.map((v) => v.toFixed(0)).join(', ')}), ${state.speedKmh.toFixed(0)} km/h`);
}
await env.close();
process.exit(outcome === 'finished' ? 0 : 1);
