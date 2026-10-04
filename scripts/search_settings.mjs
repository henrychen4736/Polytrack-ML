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
//   - seven global numbers: lookahead, wheelbase, steering deadband,
//     cross-track gain, brake lead time and the coasting margin;
//   - one speed multiplier per section of the lap (SECTIONS equal stretches).
//     1.0 means "match the human's speed here"; 1.1 means "allow 10% more".
//
// The loop is the same shape as the timeline search:
//   1. Start from settings that finish (the defaults do on summer1).
//   2. Make one altered copy of the settings per process.
//   3. Drive a full lap with each, in parallel, cut off once it can no longer
//      be useful.
//   4. Move to the fastest finisher if it beats or ties the lap we are
//      standing on (or, when annealing, sometimes even if it is slower).
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
//   airBrake=1   hold brake while airborne (lands the car flat). An on/off
//                choice, so it is fixed for the run and not tuned.
//
//   Escaping a plateau. With the defaults below the search only ever takes a
//   small step to a faster lap, so it stops at the first settings where no
//   single small change helps. These loosen that:
//   stepScale=1       multiplies the size of every nudge
//   bigMoveChance=0   chance that a candidate uses nudges 3x larger still
//   extraChance=0.5   chance of adding another change to a candidate (and
//                     another, ...). Higher = more settings changed together.
//   temperature=0     in ms. Above 0, the search will sometimes move to a
//                     SLOWER lap ("simulated annealing"): a lap d ms slower is
//                     adopted with probability exp(-d / temperature). The
//                     temperature falls steadily to 0 over the run, so the
//                     search roams at first and settles at the end. The best
//                     lap ever seen is kept separately and is what gets saved.
//
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
  crossTrackGain:        { step: 0.3,   min: 0,    max: 8 },
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
const stepScale = Number(opt.stepScale ?? 1);
const bigMoveChance = Number(opt.bigMoveChance ?? 0);
const extraChance = Number(opt.extraChance ?? 0.5);
const startTemperature = Number(opt.temperature ?? 0);

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
 * An altered copy of `settings`. Changes one thing, then another with
 * probability `extraChance`, and so on. By default that means few changes at
 * a time, for the same reason as in the timeline search: the more is changed
 * at once, the less likely the lap still finishes. Raising extraChance,
 * stepScale or bigMoveChance trades that safety for reach.
 */
function mutateSettings(settings) {
  const out = { ...settings, speedFactors: [...settings.speedFactors] };
  const globalNames = Object.keys(GLOBALS);
  // One size multiplier for the whole candidate: normally stepScale, now and
  // then three times that, to jump clear of the current neighbourhood.
  const scale = stepScale * (rng() < bigMoveChance ? 3 : 1);
  do {
    // Half the changes go to a section multiplier, half to a global number.
    // Sections are where the lap time is; globals shape how the car steers.
    if (rng() < 0.5) {
      const k = Math.floor(rng() * SECTIONS);
      out.speedFactors[k] = clamp(out.speedFactors[k] + gaussian() * SECTION_FACTOR.step * scale, SECTION_FACTOR);
    } else {
      const key = globalNames[Math.floor(rng() * globalNames.length)];
      out[key] = clamp(out[key] + gaussian() * GLOBALS[key].step * scale, GLOBALS[key]);
    }
  } while (rng() < extraChance);
  return out;
}

// --- starting point ------------------------------------------------------------
// Two sets of settings are tracked:
//   current  where the search is standing; candidates are copies of this.
//   best     the fastest lap seen so far; this is what gets saved.
// Without annealing (temperature=0) they are always the same.
let current = { ...Object.fromEntries(Object.keys(GLOBALS).map((k) => [k, DEFAULTS[k]])), speedFactors: new Array(SECTIONS).fill(1) };
if (opt.resume) {
  // Saved settings are laid over the defaults, so a file written before a
  // setting existed still loads (the new setting starts at its default).
  try { current = { ...current, ...JSON.parse(readFileSync(outFile, 'utf8')).options }; } catch { console.error(`resume=1 but runs/tuned_${name}.json could not be read.`); process.exit(1); }
}
// On/off settings given on the command line are fixed for the whole run.
if (opt.airBrake != null) current.airBrake = Number(opt.airBrake);

const pool = await createPool(name, workers, 'drive_child.mjs');
// Drive the starting settings once to get the time to beat.
const [first] = await pool.runAll([{ options: current, maxTicks: 90000 }]);
if (!first.finished) { console.error(`The starting settings do not finish ${name} (reached ${(100 * first.fraction).toFixed(1)}%).`); pool.close(); process.exit(1); }
let currentFrames = first.finishFrames;
let best = current, bestFrames = currentFrames;
const startFrames = bestFrames;
console.log(`${name}: starting at ${(bestFrames / 1000).toFixed(3)} s; searching for ${seconds} s with ${workers} processes...`);

const save = (extra = {}) => writeFileSync(outFile, JSON.stringify({ track: name, finishFrames: bestFrames, options: best, ...extra }));

// --- search loop -----------------------------------------------------------------
const t0 = performance.now();
const elapsed = () => (performance.now() - t0) / 1000;
let tried = 0, finishedCount = 0, improvements = 0, slowerAdopted = 0;
let lastStatus = 0;
while (elapsed() < seconds) {
  // Temperature falls in a straight line from its starting value to 0.
  const temperature = startTemperature * Math.max(0, 1 - elapsed() / seconds);
  const candidates = Array.from({ length: pool.size }, () => mutateSettings(current));
  // Cut-off: a lap still running this many ticks in is of no use. That is the
  // current lap's time, plus (when annealing) the margin by which a slower lap
  // could still plausibly be adopted: 3 temperatures is a 5% chance.
  const maxTicks = currentFrames + Math.ceil(3 * temperature);
  const results = await pool.runAll(candidates.map((options) => ({ options, maxTicks })));
  tried += results.length;

  // Fastest finisher of the batch, if any.
  let winner = -1;
  results.forEach((r, k) => {
    if (!r.finished) return;
    finishedCount++;
    if (winner === -1 || r.finishFrames < results[winner].finishFrames) winner = k;
  });
  if (winner !== -1) {
    const frames = results[winner].finishFrames;
    const slower = frames - currentFrames; // negative = faster
    // Faster or equal: always move there. Slower: only by the annealing rule.
    const adopt = slower <= 0 || (temperature > 0 && rng() < Math.exp(-slower / temperature));
    if (adopt) {
      if (slower > 0) slowerAdopted++;
      current = candidates[winner];
      currentFrames = frames;
      if (frames < bestFrames) {
        improvements++;
        console.log(`  ${elapsed().toFixed(0).padStart(4)} s  ${(frames / 1000).toFixed(3)} s  (-${bestFrames - frames} ms, after ${tried} laps)`);
        best = current;
        bestFrames = frames;
        save();
      }
    }
  }
  if (elapsed() - lastStatus >= 30) {
    lastStatus = elapsed();
    const annealing = startTemperature ? `, standing on ${(currentFrames / 1000).toFixed(3)} s, temperature ${temperature.toFixed(0)} ms` : '';
    console.log(`  ${elapsed().toFixed(0).padStart(4)} s  ... ${tried} laps tried, best ${(bestFrames / 1000).toFixed(3)} s${annealing}`);
  }
}
pool.close();

// --- result ------------------------------------------------------------------------
console.log(`\ntried ${tried} laps in ${elapsed().toFixed(0)} s (${(tried / elapsed()).toFixed(1)} per second); ${finishedCount} finished in time, ${improvements} improvements, ${slowerAdopted} slower laps adopted`);
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
