// Refine a finished lap's key timings at 1 ms resolution.
//
// The searched laps come from block decisions, so every key change sits on a
// 10 ms slice; a human can press on any millisecond. This takes each key
// change ("flip") in turn and tries EVERY time within +-window ticks of where
// it is, driving each candidate from a save state just before the flip to the
// finish line, and keeps the best one if the lap finishes sooner.
//
// Why every millisecond and not a line search: smoothness.mjs measured lap
// time against one flip's time and it is jagged at the 1 ms level (README,
// "Smoothness"): moving a flip 1 ms typically moves the finish by several ms
// in either direction, with the input lap sitting in a one-tick-wide dip. A
// method that follows a slope or brackets a minimum has nothing to follow, so
// the systematic thing left is to enumerate the window. That is affordable
// because these laps have only 80 to 140 flips.
//
// Why to the finish and not a short horizon: the same measurement found that
// how far ahead the car is 0.3 s or 1 s after the flip does not predict the
// lap time (README), as search_rollout.mjs found for its own search.
//
// Two moves are tried at each flip (fine.mjs):
//   nudge       this flip alone moves by d
//   tail shift  this flip and every later one move by d together, for the
//               case where the car now arrives everywhere later d ms sooner
// Order: by default from the LAST flip backwards. Each drive then starts
// close to the finish while the early, cheap-to-break part of the lap is
// still as it was, and a change never invalidates the save states the next
// (earlier) flip needs. A change at an early flip does leave the later flips
// tuned for a car that no longer arrives the same way, which is why the pass
// is repeated until one whole pass finds nothing (or passes / seconds run out).
//
// The result is checked with the game's Verify and can never be slower than
// the input: a candidate is only accepted on a finish tick at or before the
// current best, and the script exits with an error rather than save anything
// slower.
// Local use only: nothing here contacts Kodub's servers, and the result must
// not be submitted to the game's leaderboards.
//
// Usage: node ideas/g1-5-fine-key-timing/refine.mjs <lap file> [key=value ...]
//   lap file      e.g. runs/rollout_desert4.recording.json, or human:0 with track=desert4
//   workers=2     simulator processes (8 for a real run)
//   window=10     try each flip this many ticks either side
//   from=0 to=Infinity   only flips between these ticks (to=... of the INPUT lap)
//   order=back    back | forward
//   moves=nudge,shift    which moves to try
//   passes=3      at most this many passes over the flips
//   seconds=Infinity     stop starting new flips after this long
//   ties=0        1 = between equal finish ticks, also accept the lap that is
//                 further past the line on that tick (subTick in fine.mjs).
//                 Off by default: that measure disagreed with the tick count
//                 by more than a tick in the smoothness data.
//   name=g1-5-fine       result goes to runs/<name>_<track>.recording.json
//                        and runs/<name>_<track>.json
//   log=...       optional JSON file for every accepted change
import { writeFileSync } from 'node:fs';
import { loadLap, keysToTimeline, timelineToKeys, ROOT } from '../shared/laps.mjs';
import { verifyAndSave } from '../shared/verify.mjs';
import { listFlips, nudge, shiftTail, subTick, makePlane, better, openSims, parseArgs } from './fine.mjs';

const { words, opt } = parseArgs();
if (!words[0]) { console.error('usage: node ideas/g1-5-fine-key-timing/refine.mjs <lap file> [key=value ...]'); process.exit(1); }
const lap = loadLap(words[0], opt.track ?? null);
const workers = Number(opt.workers ?? 2), window = Number(opt.window ?? 10);
const from = Number(opt.from ?? 0), to = Number(opt.to ?? Infinity);
const order = opt.order ?? 'back', moves = (opt.moves ?? 'nudge,shift').split(',');
const passes = Number(opt.passes ?? 3), seconds = Number(opt.seconds ?? Infinity);
const ties = Number(opt.ties ?? 0) === 1, name = opt.name ?? 'g1-5-fine';

let best = keysToTimeline(lap.keys);
const sims = await openSims(lap.track, workers);
const t0 = performance.now();
const elapsed = () => (performance.now() - t0) / 1000;

// Drive the input once rather than trust the time in the file.
await sims.prepare(best, 0);
const [whole] = await sims.tryAll([best], lap.frames + 1000);
if (!whole.finished) { console.error('the input lap does not finish'); sims.close(); process.exit(1); }
const plane = makePlane(whole);
const scoreOf = (r) => ({ frames: r.finishFrames, fine: ties ? subTick(plane, r) : r.finishFrames });
let bestScore = scoreOf(whole);
const inputFrames = whole.finishFrames;
console.log(`${lap.track}: ${words[0]} finishes on tick ${inputFrames}, ${listFlips(best).length} flips`);
console.log(`window +-${window} ticks, moves ${moves.join(' + ')}, order ${order}, ${workers} processes`);

const accepted = [];
let pass = 0;
for (pass = 1; pass <= passes && elapsed() < seconds; pass++) {
  const passStart = bestScore.frames, triesBefore = sims.tries;
  // The flips to visit, named by key and position in that key's list: an
  // accepted move changes ticks but never the number or order of flips.
  let todo = listFlips(best).filter((f) => f.tick >= from && f.tick <= to);
  if (order === 'back') todo.reverse();
  let changed = 0;
  for (const { ch, i } of todo) {
    if (elapsed() >= seconds) break;
    const tick = best[ch][i];
    // Every candidate equals the best lap before tick - window.
    const start = Math.max(0, tick - window);
    const candidates = [];
    for (let d = -window; d <= window; d++) {
      if (d === 0) continue;
      if (moves.includes('nudge')) { const t = nudge(best, ch, i, d); if (t) candidates.push({ move: 'nudge', d, timeline: t }); }
      // A tail shift of the very last flip is the same lap as its nudge.
      if (moves.includes('shift') && tick + d >= start) { const t = shiftTail(best, tick, d); if (t && JSON.stringify(t) !== JSON.stringify(candidates.at(-1)?.timeline)) candidates.push({ move: 'shift', d, timeline: t }); }
    }
    if (!candidates.length) continue;
    await sims.prepare(best, start);
    // Driven only up to the best finish tick: a lap still running then is not faster.
    const results = await sims.tryAll(candidates.map((c) => c.timeline), bestScore.frames);
    let winner = -1, winnerScore = bestScore;
    results.forEach((r, k) => {
      if (r.finished && better(scoreOf(r), winnerScore)) { winner = k; winnerScore = scoreOf(r); }
    });
    if (winner === -1) continue;
    const c = candidates[winner];
    accepted.push({ pass, key: ch, tick, move: c.move, d: c.d, before: bestScore.frames, after: winnerScore.frames });
    console.log(`  ${elapsed().toFixed(0).padStart(4)} s  pass ${pass}  ${ch} at ${tick}: ${c.move} ${c.d > 0 ? '+' : ''}${c.d} ms  ->  ${(winnerScore.frames / 1000).toFixed(3)} s  (-${bestScore.frames - winnerScore.frames} ms)`);
    best = c.timeline; bestScore = winnerScore; changed++;
  }
  console.log(`pass ${pass}: ${(passStart / 1000).toFixed(3)} s -> ${(bestScore.frames / 1000).toFixed(3)} s, ${changed} changes, ${sims.tries - triesBefore} drives, ${elapsed().toFixed(0)} s so far`);
  if (!changed) break;
}
sims.close();

// --- result: the game's own Verify, on a simulator of its own ----------------
const r = await verifyAndSave({ track: lap.track, keys: timelineToKeys(best, bestScore.frames), name });
const ok = r.ok && r.finishFrames === bestScore.frames && r.finishFrames <= inputFrames;
if (opt.log) writeFileSync(new URL(opt.log, ROOT), JSON.stringify({ track: lap.track, input: words[0], inputFrames, frames: bestScore.frames, verified: ok, window, moves, order, workers, seconds: elapsed(), drives: sims.tries, accepted }, null, 1));
console.log(`\n${sims.tries} drives in ${elapsed().toFixed(0)} s; ${accepted.length} changes`);
console.log(`${(inputFrames / 1000).toFixed(3)} s -> ${(bestScore.frames / 1000).toFixed(3)} s (${inputFrames - bestScore.frames} ms faster)`);
console.log(`${ok ? 'PASS' : 'FAIL'} Verify: the game ${r.verified ? 'finishes' : 'does NOT finish'} the result on tick ${bestScore.frames}`);
if (ok) console.log(`saved ${r.files.join(' and ')}`);
process.exit(ok ? 0 : 1);
