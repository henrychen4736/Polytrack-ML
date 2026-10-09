// Sectional search: make a finishing lap faster one short stretch at a time.
//
// Why this exists, and the two ideas behind it (save states; rejoin the old
// path and shift the rest of the lap earlier), are explained at the top of
// sim/sectional.mjs. The loop, in plain terms:
//
//   1. Start from a lap that finishes (the "best so far") and record the path
//      it drives: where the car is after every tick.
//   2. Take a section of the lap, by default 1.5 s long. Every simulator
//      process drives the best lap up to the start of the section and saves
//      that state.
//   3. Each process gets a copy of the lap with a few key timings changed
//      INSIDE the section, restores the save state, and drives only the
//      section. Cost: 1.5 s of driving, not a whole lap.
//   4. For each result: where on the best lap's path is the car now, and how
//      well does it match that point (position, velocity, heading)? If it is
//      ahead and matches well, build a "splice": the changed keys up to the
//      end of the section, then the rest of the best lap moved earlier by the
//      time gained.
//   5. Drive each promising splice from the save state to the finish. If one
//      really finishes sooner than the best so far, it becomes the new best,
//      and its path replaces the old one from the section on.
//   6. Repeat 3 to 5 until the section's share of the time is used, then move
//      on to the next section (they overlap by half). After the last section,
//      start again from the first: later passes work on an already faster lap.
//
// The last stretch of the lap has no "later path" to rejoin, so there a
// changed lap is simply driven to the finish and kept if it is faster.
//
// Only step 5 decides what is kept, so the result is always a lap that
// finishes; it is checked once more with the game's own Verify before saving.
// Local use only: nothing here contacts Kodub's servers, and the result must
// not be submitted to the game's leaderboards.
//
// Usage: node scripts/search_sections.mjs [track] [key=value ...]
//   track         summer1 (default)
//   seed=...      which lap to start from:
//                   human    the first leaderboard lap in polyrl's fixtures
//                   <name>   runs/<name>_<track>.recording.json
//                            (default: sections, i.e. continue a previous run)
//   seconds=600   time budget
//   workers=8     parallel simulator processes
//   rngSeed=1     random seed; same seed and settings give the same run
//   out=sections  name of the result: runs/<out>_<track>.recording.json
//   section=1500  length of a section, ticks (1 tick = 1 ms)
//   step=750      distance between section starts
//   passes=2      how many times to go over the whole lap
//   minScore=0    a splice is driven to the finish if its rejoin score (ms
//                 gained minus mismatch penalties) is above this
//   perUnit, perUnitPerSecond, perRadian, maxGain, maxLoss
//                 rejoin settings, see REJOIN_DEFAULTS in sim/sectional.mjs
//   maxShift, removeChance, extraChangeChance
//                 mutation settings, see MUTATE_DEFAULTS in sim/search.mjs
// Writes runs/<out>_<track>.recording.json (updated on every improvement).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { bootWorker } from '../sim/host.mjs';
import { loadTrack } from '../sim/env.mjs';
import { createPool } from '../sim/pool.mjs';
import { decodeRecording, encodeRecording } from '../sim/recording.mjs';
import { createRng, mutate, countFlips } from '../sim/search.mjs';
import { splice, rejoin, REJOIN_DEFAULTS } from '../sim/sectional.mjs';

// --- arguments ---------------------------------------------------------------
const args = process.argv.slice(2);
const name = args.find((a) => !a.includes('=')) ?? 'summer1';
const opt = Object.fromEntries(args.filter((a) => a.includes('=')).map((a) => a.split('=')));
const seedName = opt.seed ?? 'sections';
const seconds = Number(opt.seconds ?? 600);
const workers = Number(opt.workers ?? 8);
const rng = createRng(Number(opt.rngSeed ?? 1));
const outName = opt.out ?? 'sections';
const sectionTicks = Number(opt.section ?? 1500);
const stepTicks = Number(opt.step ?? 750);
const passes = Number(opt.passes ?? 2);
const minScore = Number(opt.minScore ?? 0);
// The remaining numeric options go to rejoin() or mutate(), by name.
const rejoinOptions = {}, mutateOptions = {};
for (const [k, v] of Object.entries(opt)) {
  if (k in REJOIN_DEFAULTS) rejoinOptions[k] = Number(v);
  else if (['maxShift', 'removeChance', 'extraChangeChance'].includes(k)) mutateOptions[k] = Number(v);
}

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
const pool = await createPool(name, workers, 'section_child.mjs');
/** The same request to every process at once. */
const all = (request) => pool.runAll(Array.from({ length: workers }, () => request));

let best = decodeRecording(seedLap.recording);
let bestFrames = null;
// The best lap's path: position[t] and quaternion[t] are the car after t
// ticks. Filled from tick `first` to tick `last` (see rejoin()).
const path = { first: 0, last: 0, position: [], quaternion: [] };

/**
 * Drive the best lap from the processes' save state (tick `start`) to the
 * finish in process 0, and store its path from there on. The part of the path
 * before `start` is left as it is: a change inside or after a section cannot
 * alter what happened before it.
 */
async function refreshPath(maxFrames) {
  const [run] = await pool.runAll([{ cmd: 'run', recording: best, maxFrames, path: true }]);
  if (!run.finished) return null;
  for (let k = 0; k < run.position.length; k++) {
    path.position[run.first + k] = run.position[k];
    path.quaternion[run.first + k] = run.quaternion[k];
  }
  path.last = run.first + run.position.length - 1;
  path.position.length = path.quaternion.length = path.last + 1;
  return run.finishFrames;
}

// Drive the starting lap once from the start line rather than trusting the
// saved time, and record its path.
await all({ cmd: 'prepare', recording: best, start: 0 });
bestFrames = await refreshPath(seedLap.frames + 1000);
if (bestFrames == null) { console.error('The starting lap does not finish.'); process.exit(1); }
path.first = 1;
const startFrames = bestFrames;
console.log(`${name}: starting from the ${seedName} lap, ${(bestFrames / 1000).toFixed(3)} s, ${countFlips(best)} key flips`);

const outFile = new URL(`${outName}_${name}.recording.json`, runsDir);
const save = () => writeFileSync(outFile, JSON.stringify({ track: name, frames: bestFrames, recording: encodeRecording(best) }, null, 2));

// --- search ------------------------------------------------------------------
const t0 = performance.now();
const elapsed = () => (performance.now() - t0) / 1000;
// Every section gets the same share of the time. The number of sections is
// taken from the starting lap; a faster lap later has slightly fewer.
const sectionsPerPass = Math.ceil(bestFrames / stepTicks);
const secondsPerSection = seconds / (passes * sectionsPerPass);
console.log(`searching for ${seconds} s with ${workers} processes: ${passes} passes of ${sectionsPerPass} sections ` +
  `(${sectionTicks} ms long, every ${stepTicks} ms), ${secondsPerSection.toFixed(1)} s each`);

let tried = 0, verified = 0, accepted = 0;

for (let pass = 1; pass <= passes && elapsed() < seconds; pass++) {
  const passStart = bestFrames;
  for (let start = 0; start < bestFrames - 200 && elapsed() < seconds; start += stepTicks) {
    const sectionEnd = elapsed() + secondsPerSection;
    // Near the end of the lap there is not enough path left to rejoin, so
    // the section runs to the finish and candidates are judged by lap time.
    const toFinish = start + sectionTicks + 300 >= bestFrames;
    const until = toFinish ? Infinity : start + sectionTicks;
    await all({ cmd: 'prepare', recording: best, start });
    const before = bestFrames;
    let sectionTried = 0, sectionVerified = 0;

    while (elapsed() < sectionEnd) {
      // One altered copy of the best lap per process, changed only inside
      // the section.
      const candidates = Array.from({ length: workers }, () =>
        mutate(best, rng, { ...mutateOptions, windowStart: start, windowEnd: until - 1 }));
      tried += workers; sectionTried += workers;

      // Laps worth driving to the finish, as [lap, expected gain] pairs.
      let finalists;
      if (toFinish) {
        finalists = candidates;
      } else {
        const ends = await pool.runAll(candidates.map((recording) => ({ cmd: 'try', recording, until })));
        finalists = [];
        ends.forEach((end, k) => {
          if (end.finished) return; // cannot happen this far from the finish
          const r = rejoin(path, end, rejoinOptions);
          if (r && r.gain >= 1 && r.score > minScore) finalists.push(splice(candidates[k], best, until, r.gain));
        });
        if (!finalists.length) continue;
      }

      // The real test: drive to the finish. The limit is the best time so
      // far, because a lap that has not finished by then is not faster.
      const runs = await pool.runAll(finalists.map((recording) => ({ cmd: 'run', recording, maxFrames: bestFrames })));
      verified += runs.length; sectionVerified += runs.length;
      let winner = -1;
      runs.forEach((r, k) => {
        if (r.finished && r.finishFrames < bestFrames && (winner === -1 || r.finishFrames < runs[winner].finishFrames)) winner = k;
      });
      if (winner === -1) continue;

      accepted++;
      best = finalists[winner];
      // The new lap's path from the section on. It is driven again here
      // rather than sent back by every finalist, because paths are large and
      // improvements are rare.
      const frames = await refreshPath(bestFrames);
      console.log(`  ${elapsed().toFixed(0).padStart(4)} s  pass ${pass}, ${(start / 1000).toFixed(2)} s into the lap: ` +
        `${(frames / 1000).toFixed(3)} s  (-${bestFrames - frames} ms)`);
      bestFrames = frames;
      save();
    }
    if (bestFrames === before) {
      console.log(`  ${elapsed().toFixed(0).padStart(4)} s  pass ${pass}, ${(start / 1000).toFixed(2)} s into the lap: nothing ` +
        `(${sectionTried} tried, ${sectionVerified} driven to the finish)`);
    }
  }
  console.log(`pass ${pass}: ${(passStart / 1000).toFixed(3)} s -> ${(bestFrames / 1000).toFixed(3)} s`);
}

// --- result ------------------------------------------------------------------
save();
const finalString = encodeRecording(best);
pool.close();
// Final check with the game's own Verify, in this process.
const verifier = await bootWorker();
const ok = await verifier.verify({ ...track, carRecording: finalString, targetFrames: bestFrames });
await verifier.terminate();
console.log(`\ntried ${tried} changes in ${elapsed().toFixed(0)} s (${(tried / elapsed()).toFixed(0)} per second); ` +
  `${verified} driven to the finish, ${accepted} improvements`);
console.log(`${(startFrames / 1000).toFixed(3)} s -> ${(bestFrames / 1000).toFixed(3)} s (${startFrames - bestFrames} ms faster), ${countFlips(best)} key flips`);
console.log(`${ok ? 'PASS' : 'FAIL'} Verify: the game ${ok ? 'finishes' : 'does NOT finish'} the result on tick ${bestFrames}`);
console.log(`saved runs/${outName}_${name}.recording.json`);
process.exit(ok ? 0 : 1);
