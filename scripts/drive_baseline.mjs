// Stage 2, step 2: drive a lap with the pure-pursuit baseline controller.
//
// What it does:
//   1. Replays a human leaderboard lap and turns its trajectory into the
//      reference line.
//   2. Puts a fresh car on the start line and lets the controller drive it
//      (the loop itself is in sim/drive.mjs).
//   3. Reports whether the car finished, its time against the human's, and how
//      far it strayed from the line.
//
// Usage: node scripts/drive_baseline.mjs [track] [key=value ...]
//   track       summer1 (default) or winter1
//   key=value   override a controller setting, e.g. lookaheadMin=4
//               (see DEFAULTS in sim/controller.mjs)
// Writes runs/baseline_<track>.json when the lap finishes.
import { writeFileSync, mkdirSync } from 'node:fs';
import { Env, loadTrack } from '../sim/env.mjs';
import { driveLap, loadReferenceLine } from '../sim/drive.mjs';

const name = process.argv[2] && !process.argv[2].includes('=') ? process.argv[2] : 'summer1';
const options = Object.fromEntries(process.argv.slice(2).filter((a) => a.includes('=')).map((a) => { const [k, v] = a.split('='); return [k, Number(v)]; }));

const track = loadTrack(name);
const env = await Env.create();

const { line, human } = await loadReferenceLine(env, track, name);
console.log(`${name}: reference line has ${line.points.length} points over ${line.length} units (human lap ${(human.frames / 1000).toFixed(3)} s)`);

// One progress line per 10% of the lap.
let nextReport = 0.1;
const lap = await driveLap(env, track, line, options, {
  maxTicks: human.frames * 3, // a lap three times slower than the human is a failure anyway
  onDecision: ({ state, progress, offLine }) => {
    if (progress / (line.points.length - 1) >= nextReport) {
      console.log(`  ${Math.round(nextReport * 100)}% at ${(state.frames / 1000).toFixed(2)} s, ${state.speedKmh.toFixed(0)} km/h, ${offLine.toFixed(1)} off the line`);
      nextReport += 0.1;
    }
  },
});

if (lap.outcome === 'finished') {
  console.log(`FINISHED in ${(lap.finishFrames / 1000).toFixed(3)} s (human ${(human.frames / 1000).toFixed(3)} s, ${(lap.finishFrames / human.frames).toFixed(2)}x). Worst distance off the line: ${lap.worstOffLine.toFixed(1)}`);
  // Save the inputs so export_recording.mjs can turn them into a recording.
  mkdirSync(new URL('../runs/', import.meta.url), { recursive: true });
  writeFileSync(new URL(`../runs/baseline_${name}.json`, import.meta.url), JSON.stringify({ track: name, finishFrames: lap.finishFrames, options, controlsPerTick: lap.controlsPerTick }));
  console.log(`saved inputs to runs/baseline_${name}.json`);
} else {
  const s = lap.state;
  console.log(`DID NOT FINISH (${lap.outcome}) at ${(s.frames / 1000).toFixed(2)} s: reached ${(100 * lap.fraction).toFixed(1)}% of the line, checkpoint ${s.nextCheckpointIndex}, position (${s.position.map((v) => v.toFixed(0)).join(', ')}), ${s.speedKmh.toFixed(0)} km/h`);
}
await env.close();
process.exit(lap.outcome === 'finished' ? 0 : 1);
