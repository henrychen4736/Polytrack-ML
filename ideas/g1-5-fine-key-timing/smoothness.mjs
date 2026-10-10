// How smooth is lap time as a function of ONE key change's time?
//
// This decides the search method. If moving a flip by 1 ms changes the lap
// time a little and in a consistent direction, a line search (or even a
// slope-following method) finds the best time in a few tries. If the lap time
// jumps about from one millisecond to the next, nothing short of trying every
// millisecond in the window is safe.
//
// For a sample of flips spread over the lap, each is moved by every d in
// -window .. +window ticks (everything else untouched) and the lap is driven
// to the finish from a save state just before. Recorded per (flip, d):
//   frames   finish tick, or null if the lap no longer finishes within
//            `slack` ticks of the input's time
//   fine     sub-tick lap time (subTick in fine.mjs)
//   ahead    for each horizon H: how many ms ahead of the unmoved lap the car
//            is H ms after the flip, and how far to the side (units). This is
//            the "short horizon" score a cheaper search would use; the output
//            says how well it predicts the real lap time.
//
// Usage: node ideas/g1-5-fine-key-timing/smoothness.mjs <lap file> [key=value ...]
//   lap file     e.g. runs/rollout_desert4.recording.json, or human:0 with track=desert4
//   flips=8      how many flips to sample, evenly spread in time
//   window=10    largest move, ticks
//   horizons=300,1000   short horizons to compare, ms after the flip
//   from=0 to=Infinity  only flips between these ticks
//   slack=300    a lap this many ticks slower than the input counts as lost
//   workers=2    simulator processes
//   out=...      output file (default ideas/g1-5-fine-key-timing/smoothness_<track>.json)
// Cost: flips * (2 * window + 1) drives, each to the finish. Measured with
// training running: 10 flips at window 10 took 130 s on 2 processes, and 16 at
// window 20 took 226 s, so the defaults (8, 10) are about 100 s.
import { writeFileSync } from 'node:fs';
import { loadLap, keysToTimeline, ROOT } from '../shared/laps.mjs';
import { listFlips, nudge, subTick, makePlane, openSims, parseArgs } from './fine.mjs';

const { words, opt } = parseArgs();
if (!words[0]) { console.error('usage: node ideas/g1-5-fine-key-timing/smoothness.mjs <lap file> [key=value ...]'); process.exit(1); }
const lap = loadLap(words[0], opt.track ?? null);
const count = Number(opt.flips ?? 8), window = Number(opt.window ?? 10), slack = Number(opt.slack ?? 300);
const horizons = (opt.horizons ?? '300,1000').split(',').map(Number);
const from = Number(opt.from ?? 0), to = Number(opt.to ?? Infinity);
const workers = Number(opt.workers ?? 2);
const outFile = opt.out ?? `ideas/g1-5-fine-key-timing/smoothness_${lap.track}.json`;

const timeline = keysToTimeline(lap.keys);
const inRange = listFlips(timeline).filter((f) => f.tick >= Math.max(from, window + 1) && f.tick <= to);
// Evenly spread sample (all of them if there are no more than `count`).
// (Math.max: with flips=1 the step would be 0 / 0 = NaN, inRange[NaN] is
// undefined and the script crashed on its first flip.)
const sample = inRange.length <= count ? inRange : Array.from({ length: count }, (_, k) => inRange[Math.round(k * (inRange.length - 1) / Math.max(1, count - 1))]);

const sims = await openSims(lap.track, workers);
const t0 = performance.now();
await sims.prepare(timeline, 0);
const [whole] = await sims.tryAll([timeline], lap.frames + slack);
if (!whole.finished) { console.error('the input lap does not finish'); sims.close(); process.exit(1); }
const baseFrames = whole.finishFrames, plane = makePlane(whole);
console.log(`${lap.track}: ${words[0]} finishes on tick ${baseFrames}; moving ${sample.length} of ${inRange.length} flips by -${window}..+${window} ticks`);

/** Spearman rank correlation of two equal-length lists. */
function rankCorrelation(x, y) {
  const rank = (v) => { const order = v.map((value, k) => [value, k]).sort((a, b) => a[0] - b[0]); const r = []; order.forEach(([, k], pos) => { r[k] = pos; }); return r; };
  const a = rank(x), b = rank(y), n = x.length, mean = (n - 1) / 2;
  let top = 0, da = 0, db = 0;
  for (let k = 0; k < n; k++) { top += (a[k] - mean) * (b[k] - mean); da += (a[k] - mean) ** 2; db += (b[k] - mean) ** 2; }
  return top / Math.sqrt(da * db);
}

const rows = [];
for (const flip of sample) {
  const start = Math.max(0, flip.tick - window);
  await sims.prepare(timeline, start);
  const ds = [], candidates = [];
  for (let d = -window; d <= window; d++) {
    const moved = nudge(timeline, flip.ch, flip.i, d);
    if (moved) { ds.push(d); candidates.push(moved); }
  }
  // Short-horizon samples only where the lap still has that long to run.
  const at = horizons.map((h) => flip.tick + h).filter((tick) => tick < baseFrames - 50);
  const results = await sims.tryAll(candidates, baseFrames + slack, at);
  const unmoved = results[ds.indexOf(0)];
  const points = results.map((r, k) => {
    const ahead = r.samples.map((s, j) => {
      // The unmoved lap's car at the same tick: how far ahead of it along its
      // direction of travel (in ms at its speed), and how far off to the side.
      const b = unmoved.samples[j], speed = Math.hypot(...b.velocity);
      const diff = [0, 1, 2].map((a) => s.position[a] - b.position[a]);
      const along = [0, 1, 2].reduce((sum, a) => sum + diff[a] * b.velocity[a] / speed, 0);
      return { horizon: s.frames - flip.tick, ms: along / speed * 1000, side: Math.sqrt(Math.max(0, diff.reduce((sum, v) => sum + v * v, 0) - along * along)) };
    });
    return { d: ds[k], frames: r.finishFrames, fine: r.finished ? subTick(plane, r) : null, contactTicks: r.contactTicks, ahead };
  });

  // --- per-flip summary ---
  const done = points.filter((p) => p.fine != null);
  const fine = done.map((p) => p.fine - (unmoved.finished ? subTick(plane, unmoved) : baseFrames));
  // Roughness: the typical change between neighbouring milliseconds, against
  // the spread over the whole window. A smooth bowl has small steps compared
  // with its range; noise has steps as big as the range.
  const steps = [];
  for (let k = 1; k < points.length; k++) if (points[k].fine != null && points[k - 1].fine != null && points[k].d === points[k - 1].d + 1) steps.push(Math.abs(points[k].fine - points[k - 1].fine));
  steps.sort((a, b) => a - b);
  // Local minima among finished neighbours: 1 means one bowl.
  let minima = 0;
  for (let k = 0; k < points.length; k++) {
    const here = points[k].fine ?? Infinity, left = points[k - 1]?.fine ?? Infinity, right = points[k + 1]?.fine ?? Infinity;
    if (here < Infinity && here <= left && here <= right && (here < left || here < right)) minima++;
  }
  const bestPoint = done.reduce((a, b) => (b.fine < a.fine ? b : a), done[0]);
  const summary = {
    tick: flip.tick, key: flip.ch, tried: points.length, lost: points.length - done.length,
    bestD: bestPoint?.d, bestGain: bestPoint ? -(bestPoint.fine - subTick(plane, unmoved)) : 0,
    range: fine.length ? Math.max(...fine) - Math.min(...fine) : null,
    medianStep: steps.length ? steps[Math.floor(steps.length / 2)] : null,
    maxStep: steps.length ? steps.at(-1) : null,
    minima,
    // Does being ahead at the short horizon predict a faster lap? +1 = perfectly.
    horizonCorrelation: at.map((_, j) => {
      const both = done.filter((p) => p.ahead[j]);
      return both.length > 4 ? rankCorrelation(both.map((p) => p.ahead[j].ms), both.map((p) => -p.fine)) : null;
    }),
  };
  rows.push({ ...summary, points });
  const f = (v, n = 2) => (v == null ? '   -' : v.toFixed(n).padStart(7));
  console.log(`  ${String(flip.tick).padStart(6)} ${flip.ch.padEnd(5)} lost ${String(summary.lost).padStart(2)}/${summary.tried}  best d=${String(summary.bestD).padStart(3)} gain ${f(summary.bestGain)} ms  range ${f(summary.range)}  step median ${f(summary.medianStep)} max ${f(summary.maxStep)}  minima ${summary.minima}  corr ${summary.horizonCorrelation.map((c) => f(c)).join(' ')}`);
}
sims.close();

const seconds = (performance.now() - t0) / 1000;
const med = (list) => { const v = list.filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; };
const overall = {
  flips: rows.length, window, horizons,
  lostFraction: rows.reduce((n, r) => n + r.lost, 0) / rows.reduce((n, r) => n + r.tried, 0),
  medianRange: med(rows.map((r) => r.range)), medianStep: med(rows.map((r) => r.medianStep)), medianMinima: med(rows.map((r) => r.minima)),
  medianHorizonCorrelation: horizons.map((_, j) => med(rows.map((r) => r.horizonCorrelation[j]))),
  flipsWithGain: rows.filter((r) => r.bestGain > 0.5).length,
};
writeFileSync(new URL(outFile, ROOT), JSON.stringify({ track: lap.track, lap: words[0], baseFrames, overall, flips: rows }));
console.log(`\n${sims.tries} drives in ${seconds.toFixed(0)} s on ${workers} processes`);
console.log(`lost laps ${(100 * overall.lostFraction).toFixed(1)}%;  median over flips: range ${overall.medianRange?.toFixed(2)} ms, 1 ms step ${overall.medianStep?.toFixed(2)} ms, local minima ${overall.medianMinima}`);
console.log(`rank correlation of "ms ahead at horizon" with lap time: ${horizons.map((h, j) => `${h} ms: ${overall.medianHorizonCorrelation[j]?.toFixed(2)}`).join(', ')}`);
console.log(`saved ${outFile}`);
process.exit(0);
