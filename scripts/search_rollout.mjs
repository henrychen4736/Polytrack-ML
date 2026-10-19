// Model-guided sectional search: make a specialist's lap faster one short
// stretch at a time, with the specialist itself driving the rest of the lap
// after every change.
//
// The plain searches (search_timeline.mjs, search_sections.mjs) change key
// timings in a recorded lap and replay the rest of the recording. A recording
// cannot react: once a change makes the car arrive somewhere a little sooner
// or a little wider, the old keys no longer fit and the lap usually crashes.
// Here the rest can be driven by the POLICY, which sees where the car really
// is and steers accordingly.
//
// A lap is a list of block decisions, one per 50 ms (BLOCK DECISIONS in
// rl/racing_env.mjs). The loop, in plain terms:
//
//   1. Start from the fastest lap the policy drives on its own (one lap with
//      its top choices and fifteen with its usual randomness): the "best lap".
//   2. Take a SECTION of the best lap, by default 30 decisions = 1.5 s. Every
//      simulator process drives the best lap up to the section's start and
//      marks that moment (a save state), so the part before it costs nothing
//      from then on.
//   3. Each process gets a candidate: the best lap with something changed
//      inside the section. It rewinds to the mark and drives to the finish.
//      Four kinds of change:
//        - one decision altered, the rest of the best lap replayed as it was
//        - a key change moved one block earlier or later, the rest replayed
//        - one decision altered, then the policy's top choices to the finish
//        - the policy's random choices to the end of the section, then its
//          top choices to the finish
//   4. If a candidate crosses the finish line sooner than the best lap, it
//      becomes the best lap. Nothing else is ever kept, so the best lap only
//      gets faster and is always a lap that really finishes.
//   5. When the section's share of the time is used, move on by `step`
//      decisions (sections overlap). After the last section, start again
//      from the first: that is the next pass.
//
// An earlier version scored a candidate by how far along the track it was one
// second after the section, to avoid driving to the finish. It was about four
// times cheaper per candidate and it did not work: measured on desert4, the
// lap built that way took 22.147 s against the policy's own 22.061 s. The
// distance measure rewards things that cost time later. So every candidate
// here is judged by the only number that matters, the finish time.
//
// Local use only: nothing here contacts Kodub's servers, and the result must
// not be submitted to the game's leaderboards.
//
// Usage: node scripts/search_rollout.mjs <track> actor=<file> [key=value ...]
//   actor=...      the policy's weights, written by
//                    python rl/export_actor.py rl/checkpoints/<name>.pt
//   seconds=600    time budget for the search itself
//   workers=8      parallel simulator processes
//   rngSeed=1      random seed
//   out=rollout    name of the result: runs/<out>_<track>.json, then
//                  runs/<out>_<track>.recording.json via export_recording.mjs
//   section=30     decisions per section
//   step=15        decisions between section starts
//   passes=2       how many times to go over the whole lap
//   maxOffLine=40  the environment's limit on distance from the reference line
//   temperature=1  how random the policy's random choices are
//   refFile=...    reference lap file for the environment, if the policy was
//                  trained with one (see refFile in rl/racing_env.mjs)
//   keep=0         if above 0: also write every different finished lap seen
//                  (the policy's own laps and every finished candidate) that
//                  is within this many ms of the final best lap to
//                  runs/<out>_<track>.candidates.json, as
//                    { track, best, keep, count,
//                      laps: [{ frames, decisions, recording }, ...] }
//                  fastest first, no two with the same keys. `recording` is the lap's keys
//                  (decisionsToKeys in ideas/shared/laps.mjs, exact for block
//                  decisions) in the game's string form, which is what
//                  rl/lap_bc.py and ideas/g1-3-search-train-rounds/laps_bc.py
//                  label through the environment's demo(). Why: one search
//                  finishes thousands of candidates, and the ones close to
//                  the best are many more imitation examples of nearly the
//                  same driving (ideas/g1-3-search-train-rounds/README.md,
//                  change 3). Off by default; with it off nothing else changes
//                  (checked: same seed, same lap, same output).
//                  The candidates are not verified one by one; their finish
//                  ticks are the simulator's, from the same environment as
//                  the best lap's.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPool } from '../sim/pool.mjs';
import { createRng } from '../sim/search.mjs';

// --- arguments ---------------------------------------------------------------
const args = process.argv.slice(2);
const name = args.find((a) => !a.includes('='));
const opt = Object.fromEntries(args.filter((a) => a.includes('=')).map((a) => a.split('=')));
if (!name || !opt.actor) { console.error('Usage: node scripts/search_rollout.mjs <track> actor=<weights file> [key=value ...]'); process.exit(1); }
const num = (key, fallback) => Number(opt[key] ?? fallback);
const seconds = num('seconds', 600), workers = num('workers', 8), passes = num('passes', 2);
const SECTION = num('section', 30), STEP = num('step', 15);
const temperature = num('temperature', 1);
const outName = opt.out ?? 'rollout';
const rng = createRng(num('rngSeed', 1));
const randInt = (n) => Math.floor(rng() * n); // 0 .. n-1

// --- keep=: finished laps close to the best ----------------------------------
// Only laps within keepMs of the best AT THE TIME are held: the best only
// gets faster, so a lap outside that band can never come within keepMs of
// the final best. That bounds the memory (a lap is about 5 KB of decisions).
const keepMs = num('keep', 0);
const near = new Map(); // decisions as text -> { frames, decisions }
function remember(decisions, frames) {
  if (frames > bestLap.frames + keepMs) return;
  const key = decisions.join(';');
  if (!near.has(key)) near.set(key, { frames, decisions });
}
function forgetSlow() {
  for (const [key, lap] of near) if (lap.frames > bestLap.frames + keepMs) near.delete(key);
}

// The environment as the block-decision specialists were trained and tested
// (rl/evaluate.py): 10 ms steps, 5 per decision.
const pool = await createPool(name, workers, '../rl/rollout_child.mjs', {
  actor: fileURLToPath(new URL(`../${opt.actor}`, import.meta.url)),
  env: { ticks: 10, block: 5, pedalEvery: 5, lapFraction: 0, maxOffLine: num('maxOffLine', 40), ...(opt.refFile ? { refFile: opt.refFile } : {}) },
});
/** The same request to every process at once. */
const all = (request) => pool.runAll(Array.from({ length: workers }, () => request));

// --- candidates ---------------------------------------------------------------
/** A copy of block decision `d` with one thing about it changed at random:
 *  where the steering ends up, or whether W or S is held, or the 10 ms slice
 *  in which one of them changes. */
function alter(d) {
  const out = d.slice();
  const what = randInt(5);
  if (what === 0) { out[0] = (out[0] + 1 + randInt(2)) % 3; out[1] = randInt(5); }  // other steering target
  else if (what === 1) { out[2] = 1 - out[2]; out[3] = randInt(5); }                // W on <-> off
  else if (what === 2) { out[4] = 1 - out[4]; out[5] = randInt(5); }                // S on <-> off
  else { const at = 1 + 2 * randInt(3); out[at] = randInt(5); }                     // a switch time
  return out;
}

/**
 * One candidate, as a request for a process (step 3 at the top).
 * `rest` is the best lap from the section's start to the finish, and the
 * change is made among its first `limit` decisions.
 * Returns { explicit, sampleUntil }: `explicit` are decisions to drive as
 * given; where that list has ended the policy chooses, at random before
 * decision `sampleUntil` and its top choice from there on.
 */
function variant(rest, limit) {
  const i = randInt(limit);
  const kind = rng();
  if (kind < 0.25) {
    // One decision altered, the rest of the best lap replayed.
    const explicit = rest.slice();
    explicit[i] = alter(rest[i]);
    return { explicit, sampleUntil: 0 };
  }
  if (kind < 0.45) {
    // A change of keys moved one block later (repeat the decision before it)
    // or one block earlier (use the next decision now), the rest replayed.
    const explicit = rest.slice();
    const source = rng() < 0.5 ? i - 1 : i + 1;
    explicit[i] = source >= 0 && source < rest.length ? rest[source] : alter(rest[i]);
    return { explicit, sampleUntil: 0 };
  }
  if (kind < 0.75) {
    // One decision altered, then the policy's top choices to the finish: it
    // reacts to whatever the change did.
    return { explicit: [...rest.slice(0, i), alter(rest[i])], sampleUntil: 0 };
  }
  // The policy's own random choices from decision i to the end of the
  // section, then its top choices.
  return { explicit: rest.slice(0, i), sampleUntil: limit };
}

// --- the policy's own laps ----------------------------------------------------
// One lap with its top choices and the rest with its usual randomness, twice
// over. The fastest that finishes is the lap the search starts from.
let bestLap = null; // { decisions, frames }
const consider = (decisions, frames, label) => {
  if (bestLap && frames >= bestLap.frames) return;
  bestLap = { decisions, frames };
  console.log(`  ${label}: ${(frames / 1000).toFixed(3)} s`);
};
await all({ cmd: 'prepare', prefix: [] });
console.log(`${name}: the policy's own laps`);
for (let round = 0; round < 2; round++) {
  const laps = await pool.runAll(Array.from({ length: workers }, (_, k) => ({
    cmd: 'roll', horizon: 100000, sampleUntil: round === 0 && k === 0 ? 0 : 100000, seed: 1000 * round + k + num('rngSeed', 1), temperature,
  })));
  laps.forEach((lap, k) => { if (lap.finished) consider(lap.decisions, lap.finishFrames, round === 0 && k === 0 ? 'top choices' : 'random choices'); });
  if (keepMs > 0 && bestLap) { for (const lap of laps) if (lap.finished) remember(lap.decisions, lap.finishFrames); forgetSlow(); }
}
if (!bestLap) { console.log('  none of them finished, so there is no lap to improve'); pool.close(); process.exit(1); }
const startFrames = bestLap.frames;

// --- search ------------------------------------------------------------------
const t0 = performance.now();
const elapsed = () => (performance.now() - t0) / 1000;
// The same share of the time for every section of every pass.
const secondsPerSection = seconds / (passes * Math.ceil(bestLap.decisions.length / STEP));
console.log(`searching for ${seconds} s with ${workers} processes: ${passes} passes, sections of ${SECTION} decisions ` +
  `every ${STEP}, ${secondsPerSection.toFixed(1)} s per section`);
let tried = 0, finishedCount = 0, improvements = 0;

for (let pass = 1; pass <= passes; pass++) {
  const passStart = bestLap.frames;
  for (let start = 0; start < bestLap.decisions.length - 1; start += STEP) {
    const prefix = bestLap.decisions.slice(0, start);
    await all({ cmd: 'prepare', prefix });
    const sectionEnd = elapsed() + secondsPerSection;
    const before = bestLap.frames;
    while (elapsed() < sectionEnd) {
      const rest = bestLap.decisions.slice(start);
      const limit = Math.min(SECTION, rest.length);
      // No candidate needs more decisions than the best lap has left: one
      // that has not finished by then is not faster.
      const runs = await pool.runAll(Array.from({ length: workers }, () => ({
        cmd: 'roll', horizon: rest.length, seed: randInt(2 ** 31), temperature, ...variant(rest, limit),
      })));
      tried += runs.length;
      let winner = null;
      for (const r of runs) {
        if (!r.finished) continue;
        finishedCount++;
        if (r.finishFrames < bestLap.frames && (!winner || r.finishFrames < winner.finishFrames)) winner = r;
      }
      if (winner) {
        improvements++;
        bestLap = { decisions: [...prefix, ...winner.decisions], frames: winner.finishFrames };
      }
      if (keepMs > 0) {
        for (const r of runs) if (r.finished) remember([...prefix, ...r.decisions], r.finishFrames);
        if (winner) forgetSlow();
      }
    }
    if (bestLap.frames < before) {
      console.log(`  ${elapsed().toFixed(0).padStart(4)} s  pass ${pass}, ${(start * 0.05).toFixed(2)} s into the lap: ` +
        `${(bestLap.frames / 1000).toFixed(3)} s  (-${before - bestLap.frames} ms)`);
    }
  }
  console.log(`pass ${pass}: ${(passStart / 1000).toFixed(3)} s -> ${(bestLap.frames / 1000).toFixed(3)} s`);
}

// --- result ------------------------------------------------------------------
console.log(`\ntried ${tried} candidates in ${elapsed().toFixed(0)} s (${(tried / elapsed()).toFixed(0)} per second); ` +
  `${finishedCount} finished in time, ${improvements} improvements`);
console.log(`${(startFrames / 1000).toFixed(3)} s -> ${(bestLap.frames / 1000).toFixed(3)} s (${startFrames - bestLap.frames} ms faster than the policy's own best)`);
// Save the lap's keys, then encode them and run the game's own Verify
// (scripts/export_recording.mjs does both).
const [saved] = await pool.runAll([{ cmd: 'save', decisions: bestLap.decisions, run: outName }]);
pool.close();
if (!saved.finished || saved.finishFrames !== bestLap.frames) {
  console.log(`FAIL: driven again from the start line, the lap ${saved.finished ? `takes ${saved.finishFrames} ticks, not ${bestLap.frames}` : 'does not finish'}`);
  process.exit(1);
}
if (keepMs > 0) {
  // Loaded only here, so that without keep= the script runs exactly as before.
  const { decisionsToKeys, keysToRecording } = await import('../ideas/shared/laps.mjs');
  forgetSlow();
  near.set(bestLap.decisions.join(';'), { frames: bestLap.frames, decisions: bestLap.decisions });
  // Different decisions can hold the same keys on every tick (a switch slice
  // means nothing when the control is already at its target): measured on a
  // short desert4 search, 64 different decision lists were 15 different laps.
  // Only the first (fastest) of each set of identical laps is written.
  const seenKeys = new Set();
  const laps = [...near.values()].sort((a, b) => a.frames - b.frames)
    .map(({ frames, decisions }) => ({ frames, decisions, recording: keysToRecording(decisionsToKeys(decisions)) }))
    .filter((lap) => !seenKeys.has(lap.recording) && seenKeys.add(lap.recording));
  const file = `runs/${outName}_${name}.candidates.json`;
  writeFileSync(new URL(`../${file}`, import.meta.url), JSON.stringify({ track: name, best: bestLap.frames, keep: keepMs, count: laps.length, laps }));
  console.log(`kept ${laps.length} different finished laps within ${keepMs} ms of ${(bestLap.frames / 1000).toFixed(3)} s (slowest ${(laps.at(-1).frames / 1000).toFixed(3)} s): ${file}`);
}
const exported = spawnSync(process.execPath, [fileURLToPath(new URL('./export_recording.mjs', import.meta.url)), name, outName], { encoding: 'utf8' });
console.log(exported.stdout.trim().split('\n').slice(-3).join('\n'));
process.exit(exported.status ?? 1);
