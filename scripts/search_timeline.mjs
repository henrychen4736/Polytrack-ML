// Stage 3: timeline search. Make a finishing lap faster by randomly nudging
// its key timings and keeping the changes that help.
//
// The loop, in plain terms:
//   1. Start from a lap that finishes (the "best so far").
//   2. Make one slightly altered copy per simulator process (sim/search.mjs).
//   3. Simulate every copy from the start line, all processes in parallel
//      (sim/pool.mjs).
//      Each simulation is cut off at the best time so far: a copy that has not
//      finished by then cannot be an improvement, so there is no point going on.
//   4. If the fastest copy finished sooner than the best so far, it becomes
//      the new best. A copy that ties is also adopted: it costs nothing and
//      lets the search drift to laps from which other improvements are reachable.
//   5. Repeat until the time budget runs out.
//
// There are no save states, so every candidate is a full lap (about 0.3 s of
// computing each). That is the main limit on how fast this search goes.
//
// The final lap is checked with the game's own Verify before it is saved.
// Local use only: nothing here contacts Kodub's servers.
//
// Usage: node scripts/search_timeline.mjs [track] [key=value ...]
//   track        summer1 (default)
//   seed=...     which lap to start from:
//                  baseline  runs/baseline_<track>.recording.json (default)
//                  search    runs/search_<track>.recording.json (continue a previous search)
//                  human     the first leaderboard lap in polyrl's fixtures
//   seconds=60   time budget
//   workers=8    parallel simulator processes
//   rngSeed=1    random seed; same seed and settings give the same run
//   out=search   name of the result: runs/<out>_<track>.recording.json
//   maxShift, removeChance, windowStart, windowEnd, extraChangeChance
//                mutation settings, see MUTATE_DEFAULTS in sim/search.mjs
// Writes runs/search_<track>.recording.json (updated on every improvement).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { bootWorker } from '../sim/host.mjs';
import { loadTrack } from '../sim/env.mjs';
import { createPool } from '../sim/pool.mjs';
import { decodeRecording, encodeRecording } from '../sim/recording.mjs';
import { createRng, mutate, countFlips } from '../sim/search.mjs';

// --- arguments ---------------------------------------------------------------
const args = process.argv.slice(2);
const name = args.find((a) => !a.includes('=')) ?? 'summer1';
const opt = Object.fromEntries(args.filter((a) => a.includes('=')).map((a) => a.split('=')));
const seedName = opt.seed ?? 'baseline';
const seconds = Number(opt.seconds ?? 60);
const workers = Number(opt.workers ?? 8);
const rng = createRng(Number(opt.rngSeed ?? 1));
// Everything else numeric is passed through as a mutation setting.
const outName = opt.out ?? 'search';
const mutateOptions = Object.fromEntries(Object.entries(opt).filter(([k]) => !['seed', 'seconds', 'workers', 'rngSeed', 'out'].includes(k)).map(([k, v]) => [k, Number(v)]));

// --- starting lap --------------------------------------------------------------
const runsDir = new URL('../runs/', import.meta.url);
mkdirSync(runsDir, { recursive: true });
let seedLap;
try {
  seedLap = seedName === 'human'
    ? JSON.parse(readFileSync(new URL(`../vendor/polyrl/fixtures/leaderboard_${name}.json`, import.meta.url), 'utf8'))[0]
    : JSON.parse(readFileSync(new URL(`${seedName}_${name}.recording.json`, runsDir), 'utf8'));
} catch {
  console.error(`Could not load the "${seedName}" lap for ${name}.`);
  process.exit(1);
}

const track = loadTrack(name);
const pool = await createPool(name, workers);

// Re-simulate the starting lap rather than trusting the saved time.
let best = decodeRecording(seedLap.recording);
const [first] = await pool.evaluateAll([seedLap.recording], seedLap.frames + 1000);
if (!first.finished) { console.error('The starting lap does not finish.'); process.exit(1); }
let bestFrames = first.finishFrames;
const startFrames = bestFrames;
console.log(`${name}: starting from the ${seedName} lap, ${(bestFrames / 1000).toFixed(3)} s, ${countFlips(best)} key flips`);
console.log(`searching for ${seconds} s with ${workers} processes...`);

const outFile = new URL(`${outName}_${name}.recording.json`, runsDir);
const save = () => writeFileSync(outFile, JSON.stringify({ track: name, frames: bestFrames, recording: encodeRecording(best) }, null, 2));

// --- search loop -----------------------------------------------------------------
const t0 = performance.now();
const elapsed = () => (performance.now() - t0) / 1000;
let evaluated = 0, finishedCount = 0, improvements = 0, ties = 0;
let lastStatus = 0;
while (elapsed() < seconds) {
  // One altered copy of the current best per process.
  const candidates = Array.from({ length: pool.size }, () => mutate(best, rng, mutateOptions));
  // Simulate them all. `bestFrames` as the limit means "stop if you have not
  // finished by the time the current best would have".
  const results = await pool.evaluateAll(candidates.map(encodeRecording), bestFrames);
  evaluated += results.length;

  // Pick the fastest finisher of the batch, if any.
  let winner = -1;
  results.forEach((r, k) => {
    if (!r.finished) return;
    finishedCount++;
    if (winner === -1 || r.finishFrames < results[winner].finishFrames) winner = k;
  });
  if (winner !== -1) {
    const frames = results[winner].finishFrames;
    if (frames < bestFrames) {
      improvements++;
      console.log(`  ${elapsed().toFixed(0).padStart(4)} s  ${(frames / 1000).toFixed(3)} s  (-${bestFrames - frames} ms, after ${evaluated} laps)`);
      best = candidates[winner];
      bestFrames = frames;
      save();
    } else {
      // Same time: adopt it anyway (see step 4 at the top).
      ties++;
      best = candidates[winner];
    }
  }
  // A heartbeat every 30 s, so a quiet stretch is visibly not a hang.
  if (elapsed() - lastStatus >= 30) {
    lastStatus = elapsed();
    console.log(`  ${elapsed().toFixed(0).padStart(4)} s  ... ${evaluated} laps tried, best ${(bestFrames / 1000).toFixed(3)} s`);
  }
}

// --- result ------------------------------------------------------------------------
save();
const finalString = encodeRecording(best);
pool.close();
// Final check with the game's own Verify, in this process.
const verifier = await bootWorker();
const verified = await verifier.verify({ ...track, carRecording: finalString, targetFrames: bestFrames });
await verifier.terminate();
console.log(`\ntried ${evaluated} laps in ${elapsed().toFixed(0)} s (${(evaluated / elapsed()).toFixed(1)} per second); ${finishedCount} finished in time, ${improvements} improvements, ${ties} ties`);
console.log(`${(startFrames / 1000).toFixed(3)} s -> ${(bestFrames / 1000).toFixed(3)} s (${startFrames - bestFrames} ms faster), ${countFlips(best)} key flips`);
console.log(`${verified ? 'PASS' : 'FAIL'} Verify: the game ${verified ? 'finishes' : 'does NOT finish'} the result on tick ${bestFrames}`);
console.log(`saved runs/${outName}_${name}.recording.json`);
process.exit(verified ? 0 : 1);
