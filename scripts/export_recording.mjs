// Stage 2, step 3: turn a saved lap into a PolyTrack recording and prove the
// game accepts it.
//
// drive_baseline.mjs saves which keys were held on every physics tick. The
// game stores a lap differently: for each of the five keys, the list of ticks
// at which that key changed state (a "recording"). This script
//
//   1. converts the per-tick keys into that form and encodes it as the same
//      text string the game uses for ghosts and leaderboard entries,
//   2. decodes the string again and checks nothing was lost,
//   3. hands the string to the game's own Verify routine, which re-simulates
//      the lap from the start line and passes only if the car finishes on
//      exactly the tick we claim.
//
// Passing step 3 means the lap is a genuine, replayable run in the real
// physics, not an artefact of how our harness stepped the car.
//
// This is for local ghosts only. Nothing here contacts Kodub's servers, and
// bot laps must not be submitted to the leaderboards.
//
// Usage: node scripts/export_recording.mjs [track]     (default: summer1)
//   reads   runs/baseline_<track>.json            (from drive_baseline.mjs)
//   writes  runs/baseline_<track>.recording.json
import { readFileSync, writeFileSync } from 'node:fs';
import { bootWorker } from '../sim/host.mjs';
import { loadTrack } from '../sim/env.mjs';
import { CHANNELS, fromDense, toDense, encodeRecording, decodeRecording } from '../sim/recording.mjs';

const name = process.argv[2] ?? 'summer1';
const runsDir = new URL('../runs/', import.meta.url);

let saved;
try {
  saved = JSON.parse(readFileSync(new URL(`baseline_${name}.json`, runsDir), 'utf8'));
} catch {
  console.error(`No saved lap for ${name}. Run: node scripts/drive_baseline.mjs ${name}`);
  process.exit(1);
}
// controlsPerTick[k] is the set of keys held while the physics computed tick k.
// finishFrames is the tick count at which the game registered the finish; this
// is the lap time in milliseconds.
const { controlsPerTick, finishFrames } = saved;

// 1. Per-tick keys -> toggle lists -> recording string.
const recording = fromDense(controlsPerTick);
const recordingString = encodeRecording(recording);
console.log(`${name}: ${finishFrames} ticks (${(finishFrames / 1000).toFixed(3)} s)`);
for (const ch of CHANNELS) console.log(`  ${ch.padEnd(5)} ${String(recording[ch].length).padStart(5)} toggles`);
console.log(`  recording string: ${recordingString.length} characters`);

// 2. Round trip: decoding the string must give back the same keys on every tick.
const key = (c) => CHANNELS.map((ch) => (c[ch] ? 1 : 0)).join('');
const decoded = toDense(decodeRecording(recordingString), controlsPerTick.length);
const firstMismatch = decoded.findIndex((c, k) => key(c) !== key(controlsPerTick[k]));
const roundTripOk = firstMismatch === -1;
console.log(`${roundTripOk ? 'PASS' : 'FAIL'} round trip: decoded string ${roundTripOk ? 'matches the saved keys on every tick' : `differs at tick ${firstMismatch}`}`);

// 3. The game's own check. Verify steps a fresh car with the recording until
// it finishes or reaches targetFrames, and passes only if both happen at once.
const worker = await bootWorker();
const track = loadTrack(name);
const verify = (targetFrames) => worker.verify({ ...track, carRecording: recordingString, targetFrames });
const verified = await verify(finishFrames);
console.log(`${verified ? 'PASS' : 'FAIL'} Verify: the game ${verified ? 'finishes' : 'does NOT finish'} this recording on tick ${finishFrames}`);
// Control: claiming a lap one tick shorter must fail. If this passed too,
// Verify would not be checking what we think it checks.
const offByOne = await verify(finishFrames - 1);
console.log(`${!offByOne ? 'PASS' : 'FAIL'} control: claiming ${finishFrames - 1} ticks is ${offByOne ? 'wrongly accepted' : 'rejected'}`);
await worker.terminate();

const ok = roundTripOk && verified && !offByOne;
if (ok) {
  writeFileSync(new URL(`baseline_${name}.recording.json`, runsDir), JSON.stringify({ track: name, frames: finishFrames, recording: recordingString }, null, 2));
  console.log(`saved runs/baseline_${name}.recording.json`);
}
process.exit(ok ? 0 : 1);
