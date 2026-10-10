// Human-seeded sectional search: start from the best HUMAN lap, exactly as
// the human pressed the keys (1 ms resolution), and make it faster one short
// section at a time. Any gain that survives the finish-line check is a lap
// faster than the human's.
//
// What happens to one candidate (change a key timing in the section, drive
// the section, drive on to the finish, keep it if the lap is faster by a
// measure finer than one tick) is described in section_worker.mjs, where it
// runs. This file only decides which section is worked on and for how long:
//
//   1. Load the human lap and cut it into overlapping sections (1.5 s long,
//      a new one every 0.75 s).
//   2. Go through them from the LAST to the first (order=back, the default).
//      Why backwards: every promising candidate has to be driven from its
//      section to the finish, so a late section costs a fraction of an early
//      one (desert4, 11 s per section on 2 processes: about 430 candidates
//      in the last section, about 100 in a section 6 s before the finish),
//      and a short test still covers several sections.
//   3. For each section every simulator process searches for a few seconds
//      with its own random seed. If one comes back with a faster lap, that
//      lap is given to all of them and the section is searched again until
//      its share of the time is used.
//   4. At the end the result is driven from the start line and checked with
//      the game's own Verify (ideas/shared/verify.mjs). It is saved under
//      runs/ only if it passes.
//
// Local use only: nothing here contacts Kodub's servers, and the result must
// not be submitted to the game's leaderboards.
//
// Usage: node ideas/g1-1-human-seed-search/search_human.mjs [track] [key=value ...]
//   track         desert4 (default)
//   seed=human:0  the lap to start from, anything loadLap() of
//                 ideas/shared/laps.mjs takes: human:<n> is lap n of
//                 data/laps/<track>.json (0 = fastest), or a path such as
//                 runs/g1-1-human_desert4.recording.json to continue a run
//   seconds=100   time budget for the search itself
//   workers=2     simulator processes (2 for a test; 8 for a real run)
//   out=human     result name: runs/g1-1-<out>_<track>.json and .recording.json
//   section=1500  section length, ms
//   step=750      distance between section starts, ms
//   order=back    back: last section first; front: first section first
//   from=0, to=   only sections starting in this range of the lap, ms
//   last=         or: only sections starting in the last so many ms of the lap
//   passes=1      times over the sections
//   slice=4       seconds a process searches before the processes compare notes
//   rngSeed=1     random seed
//   repairIters, repairRounds, minScore, maxShift, ... any setting in
//                 SEARCH_DEFAULTS of section_worker.mjs (repairIters=0
//                 switches the repair step off, for comparison)
import { writeFileSync, mkdirSync } from 'node:fs';
// The shared pool, not sim/pool.mjs: the same interface, but a worker that
// throws fails the request instead of leaving this process waiting for ever.
import { createPool } from '../shared/pool.mjs';
import { toDense } from '../../sim/recording.mjs';
import { countFlips } from '../../sim/search.mjs';
import { loadLap, recordingToTimeline, timelineToRecording } from '../shared/laps.mjs';
import { verifyAndSave } from '../shared/verify.mjs';

// --- arguments ---------------------------------------------------------------
const args = process.argv.slice(2);
const name = args.find((a) => !a.includes('=')) ?? 'desert4';
const opt = Object.fromEntries(args.filter((a) => a.includes('=')).map((a) => a.split('=')));
const num = (key, fallback) => Number(opt[key] ?? fallback);
const seedName = opt.seed ?? 'human:0';
const seconds = num('seconds', 100), workers = num('workers', 2), passes = num('passes', 1);
const sectionTicks = num('section', 1500), stepTicks = num('step', 750), slice = num('slice', 4);
const outName = `g1-1-${opt.out ?? 'human'}`;
// Everything else numeric goes to the workers as a search setting.
const OWN = ['seed', 'seconds', 'workers', 'passes', 'section', 'step', 'slice', 'out', 'order', 'from', 'to', 'last', 'rngSeed'];
const settings = Object.fromEntries(Object.entries(opt).filter(([k]) => !OWN.includes(k)).map(([k, v]) => [k, Number(v)]));

// --- starting lap ------------------------------------------------------------
const seedLap = loadLap(seedName, name);
let best = recordingToTimeline(seedLap.recording);
const pool = await createPool(name, workers, '../ideas/g1-1-human-seed-search/section_worker.mjs');
/** The same request to every process at once. */
const all = (request) => pool.runAll(Array.from({ length: workers }, () => request));

/** Give every process the best lap and a section start; returns the lap's
 *  time as the simulator drives it. */
async function prepare(start, limit) {
  const replies = await all({ cmd: 'prepare', recording: best, start, limit });
  return replies[0].finishFrames;
}

// Drive the starting lap rather than trusting the time in the file.
let bestFrames = await prepare(0, seedLap.frames + 1000);
if (bestFrames == null) { console.error('The starting lap does not finish.'); pool.close(); process.exit(1); }
const startFrames = bestFrames;
console.log(`${name}: starting from ${seedName}, ${(bestFrames / 1000).toFixed(3)} s, ${countFlips(best)} key flips`);

// Progress is written here on every improvement, so a long run that is
// stopped early still leaves its lap. It is unverified until the end.
const outDir = new URL('./out/', import.meta.url);
mkdirSync(outDir, { recursive: true });
const saveProgress = () => writeFileSync(new URL(`${outName}_${name}.recording.json`, outDir),
  JSON.stringify({ track: name, frames: bestFrames, recording: timelineToRecording(best) }, null, 2));

// --- sections ----------------------------------------------------------------
// last=6000 means the same as from=<lap time - 6000>.
const from = opt.last ? bestFrames - num('last', 0) : num('from', 0), to = num('to', Infinity);
const starts = [];
for (let s = 0; s < bestFrames - 200; s += stepTicks) if (s >= from && s <= to) starts.push(s);
if ((opt.order ?? 'back') === 'back') starts.reverse();
const secondsPerSection = seconds / (passes * starts.length);
console.log(`searching for ${seconds} s with ${workers} processes: ${passes} pass(es) over ${starts.length} sections ` +
  `(${sectionTicks} ms long, ${(opt.order ?? 'back') === 'back' ? 'last first' : 'first first'}), ${secondsPerSection.toFixed(1)} s each`);

// --- search ------------------------------------------------------------------
const t0 = performance.now();
const elapsed = () => (performance.now() - t0) / 1000;
const total = { tried: 0, followed: 0, spliced: 0, small: 0, big: 0, repaired: 0, repairTries: 0, repairDrives: 0 };
let totalGained = 0; // ms with fractions, summed from the workers' own measure
let seedCounter = num('rngSeed', 1) * 1000;

for (let pass = 1; pass <= passes; pass++) {
  for (const start of starts) {
    if (start >= bestFrames - 200) continue; // the lap has got shorter than this section's start
    const sectionEnd = elapsed() + secondsPerSection;
    const before = bestFrames;
    const sum = { tried: 0, followed: 0, spliced: 0, small: 0, big: 0, repaired: 0 };
    let sectionGained = 0;
    await prepare(start, bestFrames + 1);
    while (elapsed() < sectionEnd) {
      const replies = await pool.runAll(Array.from({ length: workers }, () => ({
        cmd: 'search', end: start + sectionTicks, seconds: Math.min(slice, sectionEnd - elapsed()), seed: seedCounter++, ...settings,
      })));
      for (const r of replies) {
        for (const k in total) total[k] += r.stats[k];
        for (const k in sum) sum[k] += r.stats[k];
      }
      // The processes searched apart, each from the same lap. Take the one
      // that gained most (most of the gains are fractions of a millisecond,
      // so the finish tick alone would not tell them apart) and give its lap
      // to the others. Their save states at the section start stay valid: the
      // lap is unchanged before it.
      const winner = replies.reduce((a, b) => (b.frames < a.frames || (b.frames === a.frames && b.gained > a.gained) ? b : a));
      if (winner.gained > 0) {
        best = winner.recording;
        bestFrames = winner.frames;
        sectionGained += winner.gained;
        saveProgress();
        await pool.runAll(replies.map((r) => (r === winner ? { cmd: 'noop' } : { cmd: 'adopt', recording: best, limit: bestFrames + 1 })));
      }
    }
    totalGained += sectionGained;
    console.log(`  ${elapsed().toFixed(0).padStart(4)} s  ${(start / 1000).toFixed(2)} s into the lap: ${(bestFrames / 1000).toFixed(3)} s ` +
      `(-${before - bestFrames} ms on the clock, ${sectionGained.toFixed(2)} ms measured)  ` +
      `[${sum.tried} tried, ${sum.followed + sum.spliced} driven on; steps kept: ${sum.small} small, ${sum.big} big, ${sum.repaired} repaired]`);
  }
}
pool.close();

// --- result ------------------------------------------------------------------
console.log(`\n${total.tried} changes tried in ${elapsed().toFixed(0)} s; driven on to the finish: ${total.followed} as small steps, ${total.spliced} as big steps (later keys shifted); ` +
  `steps kept: ${total.small} small, ${total.big} big, ${total.repaired} big after repair (${total.repairTries} repair tries, ${total.repairDrives} repaired laps driven on)`);
console.log(`gain by the sub-tick measure, summed over sections: ${totalGained.toFixed(2)} ms`);
console.log(`${(startFrames / 1000).toFixed(3)} s -> ${(bestFrames / 1000).toFixed(3)} s (${startFrames - bestFrames} ms faster than ${seedName})`);
if (bestFrames === startFrames) { console.log('no improvement, nothing saved'); process.exit(0); }
// From the start line, in a fresh simulator, with the game's own Verify.
const checked = await verifyAndSave({ track: name, keys: toDense(best, bestFrames), name: outName });
if (!checked.ok || checked.finishFrames !== bestFrames) {
  console.log(`FAIL: from the start line the lap ${checked.finished ? `takes ${checked.finishFrames} ticks (search said ${bestFrames}), Verify ${checked.verified ? 'passes' : 'fails'}` : 'does not finish'}`);
  process.exit(1);
}
console.log(`PASS Verify: the game finishes the result on tick ${bestFrames} and not on tick ${bestFrames - 1}`);
console.log(`saved ${checked.files.join(', ')}`);
