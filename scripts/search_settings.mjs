// Settings search: make the controller's lap faster by tuning the controller,
// not the key presses.
//
// Why this instead of the timeline search (scripts/search_timeline.mjs)?
// A recording is a fixed list of key presses with nothing correcting the car,
// so almost any change early in the lap wrecks the rest of it. Here the thing
// being changed is the controller's settings, and the controller still steers
// every lap. It absorbs each change, so many more candidates finish, and the
// changes are the right size for the real losses: where to slow down, how far
// ahead to look.
//
// What is tuned (all in sim/controller.mjs):
//   - six global numbers: lookahead, wheelbase, steering deadband, brake
//     lead time and the coasting margin;
//   - one speed multiplier per section of the lap (SECTIONS equal stretches).
//     1.0 means "match the human's speed here"; 1.1 means "allow 10% more".
//
// The loop is the same shape as the timeline search:
//   1. Start from settings that finish (the defaults do on summer1).
//   2. Make one slightly altered copy of the settings per process.
//   3. Drive a full lap with each, in parallel, cut off at the best time so far.
//   4. Adopt the fastest finisher if it beats or ties the current best.
//   5. Repeat until the time budget runs out.
//
// At the end the best lap is driven once more in this process to record its
// key presses, so it can be exported and watched like the baseline:
//   node scripts/export_recording.mjs <track> tuned
//   node scripts/watch_ghost.mjs <track> tuned
//
// Usage: node scripts/search_settings.mjs [track] [key=value ...]
//   track        summer1 (default)
//   seconds=120  time budget
//   workers=8    parallel simulator processes
//   rngSeed=1    random seed; same seed and settings give the same run
//   resume=1     start from runs/tuned_<track>.json instead of the defaults
// Writes runs/tuned_<track>.json (settings on every improvement, plus the key
// presses at the end).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Env, loadTrack } from '../sim/env.mjs';
import { DEFAULTS } from '../sim/controller.mjs';
import { driveLap, loadReferenceLine } from '../sim/drive.mjs';
import { createPool } from '../sim/pool.mjs';
import { createRng } from '../sim/search.mjs';

/** How many stretches the lap is cut into for the per-section speed multipliers.
 *  summer1's line is about 1,280 units, so 24 sections are about 53 units each:
 *  short enough to treat one corner separately from the next. */
const SECTIONS = 24;

/**
 * The tunable settings. For each: `step` is the typical size of one random
 * nudge, and [min, max] keeps the value in a range that makes physical sense.
 */
const GLOBALS = {
  lookaheadMin:          { step: 0.5,   min: 2,    max: 15 },
  lookaheadPerKmh:       { step: 0.008, min: 0.02, max: 0.2 },
  wheelbase:             { step: 0.2,   min: 1.5,  max: 6 },
  steerDeadband:         { step: 0.001, min: 0,    max: 0.02 },
  brakeLookaheadSeconds: { step: 0.02,  min: 0,    max: 0.3 },
  brakeMarginKmh:        { step: 2,     min: 0,    max: 30 },
};
const SECTION_FACTOR = { step: 0.03, min: 0.8, max: 1.5 };

// --- arguments ---------------------------------------------------------------
const args = process.argv.slice(2);
const name = args.find((a) => !a.includes('=')) ?? 'summer1';
const opt = Object.fromEntries(args.filter((a) => a.includes('=')).map((a) => a.split('=')));
const seconds = Number(opt.seconds ?? 120);
const workers = Number(opt.workers ?? 8);
const rng = createRng(Number(opt.rngSeed ?? 1));

const runsDir = new URL('../runs/', import.meta.url);
mkdirSync(runsDir, { recursive: true });
const outFile = new URL(`tuned_${name}.json`, runsDir);

// --- random helpers ------------------------------------------------------------
/** Random number from a bell curve centred on 0 with spread 1 (Box-Muller). */
function gaussian() {
  return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
}
const clamp = (v, { min, max }) => Math.min(max, Math.max(min, v));

/**
 * A slightly altered copy of `settings`. Changes one thing, then another with
 * 50% probability, and so on. Few changes at a time for the same reason as in
 * the timeline search: the more is changed at once, the less likely the lap
 * still finishes, and the harder it is to tell which change helped.
 */
function mutateSettings(settings) {
  const out = { ...settings, speedFactors: [...settings.speedFactors] };
  const globalNames = Object.keys(GLOBALS);
  do {
    // Half the changes go to a section multiplier, half to a global number.
    // Sections are where the lap time is; globals shape how the car steers.
    if (rng() < 0.5) {
      const k = Math.floor(rng() * SECTIONS);
      out.speedFactors[k] = clamp(out.speedFactors[k] + gaussian() * SECTION_FACTOR.step, SECTION_FACTOR);
    } else {
      const key = globalNames[Math.floor(rng() * globalNames.length)];
      out[key] = clamp(out[key] + gaussian() * GLOBALS[key].step, GLOBALS[key]);
    }
  } while (rng() < 0.5);
  return out;
}

// --- starting point ------------------------------------------------------------
let best = { ...Object.fromEntries(Object.keys(GLOBALS).map((k) => [k, DEFAULTS[k]])), speedFactors: new Array(SECTIONS).fill(1) };
if (opt.resume) {
  try { best = JSON.parse(readFileSync(outFile, 'utf8')).options; } catch { console.error(`resume=1 but runs/tuned_${name}.json could not be read.`); process.exit(1); }
}

const pool = await createPool(name, workers, 'drive_child.mjs');
// Drive the starting settings once to get the time to beat.
const [first] = await pool.runAll([{ options: best, maxTicks: 90000 }]);
if (!first.finished) { console.error(`The starting settings do not finish ${name} (reached ${(100 * first.fraction).toFixed(1)}%).`); pool.close(); process.exit(1); }
let bestFrames = first.finishFrames;
const startFrames = bestFrames;
console.log(`${name}: starting at ${(bestFrames / 1000).toFixed(3)} s; searching for ${seconds} s with ${workers} processes...`);

const save = (extra = {}) => writeFileSync(outFile, JSON.stringify({ track: name, finishFrames: bestFrames, options: best, ...extra }));

// --- search loop -----------------------------------------------------------------
const t0 = performance.now();
const elapsed = () => (performance.now() - t0) / 1000;
let tried = 0, finishedCount = 0, improvements = 0;
let lastStatus = 0;
while (elapsed() < seconds) {
  const candidates = Array.from({ length: pool.size }, () => mutateSettings(best));
  // maxTicks = the best time so far: a lap still running at that point cannot
  // be an improvement, so the child stops driving it.
  const results = await pool.runAll(candidates.map((options) => ({ options, maxTicks: bestFrames })));
  tried += results.length;

  let winner = -1;
  results.forEach((r, k) => {
    if (!r.finished) return;
    finishedCount++;
    if (winner === -1 || r.finishFrames < results[winner].finishFrames) winner = k;
  });
  if (winner !== -1 && results[winner].finishFrames <= bestFrames) {
    const frames = results[winner].finishFrames;
    best = candidates[winner];
    if (frames < bestFrames) {
      improvements++;
      console.log(`  ${elapsed().toFixed(0).padStart(4)} s  ${(frames / 1000).toFixed(3)} s  (-${bestFrames - frames} ms, after ${tried} laps)`);
      bestFrames = frames;
      save();
    }
  }
  if (elapsed() - lastStatus >= 30) {
    lastStatus = elapsed();
    console.log(`  ${elapsed().toFixed(0).padStart(4)} s  ... ${tried} laps tried, best ${(bestFrames / 1000).toFixed(3)} s`);
  }
}
pool.close();

// --- result ------------------------------------------------------------------------
console.log(`\ntried ${tried} laps in ${elapsed().toFixed(0)} s (${(tried / elapsed()).toFixed(1)} per second); ${finishedCount} finished in time, ${improvements} improvements`);
console.log(`${(startFrames / 1000).toFixed(3)} s -> ${(bestFrames / 1000).toFixed(3)} s (${startFrames - bestFrames} ms faster)`);

// Drive the best settings once more here, this time recording the keys. The
// simulation is deterministic, so this must reproduce the same lap time; if it
// does not, something is wrong and we say so rather than save a mismatched lap.
const env = await Env.create();
const track = loadTrack(name);
const { line, human } = await loadReferenceLine(env, track, name);
const lap = await driveLap(env, track, line, best);
await env.close();
const reproduced = lap.finishFrames === bestFrames;
console.log(`${reproduced ? 'PASS' : 'FAIL'} re-drive: ${lap.finishFrames == null ? 'did not finish' : (lap.finishFrames / 1000).toFixed(3) + ' s'} (human ${(human.frames / 1000).toFixed(3)} s)`);
if (reproduced) {
  save({ controlsPerTick: lap.controlsPerTick });
  console.log(`saved runs/tuned_${name}.json`);
  console.log('settings:', JSON.stringify({ ...best, speedFactors: best.speedFactors.map((f) => +f.toFixed(3)) }));
}
process.exit(reproduced ? 0 : 1);
