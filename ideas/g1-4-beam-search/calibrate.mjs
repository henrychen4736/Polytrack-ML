// What should a beam rank partial laps by? This measures it instead of
// assuming: take a set of candidate states that are all at the same lap tick,
// find each one's TRUE worth (the finish time when the policy drives on from
// it), and see how well each cheap measure would have ordered them.
//
// For each start point (a moment on the policy's own lap):
//   1. branch twice with child.mjs's candidates (top choice, random choices,
//      systematic alternatives): up to `n` states two decisions (100 ms)
//      after the start point, all at the same tick;
//   2. the policy's top choices drive every one of them to the finish;
//   3. compare the finish times with
//        progress      distance along the reference line at the state
//        value         reward so far + the critic's estimate at the state
//        look H        distance after H more decisions of policy driving
//        lookvalue H   reward so far + critic's estimate after H more
//      (the last two are read off the rollout in step 2, so every horizon
//      costs nothing extra here).
//
// Reported per measure:
//   rank agreement   Spearman rank correlation with "finishes sooner"
//                    (+1 = the measure orders the states exactly by finish
//                    time, 0 = no better than chance, negative = backwards)
//   top-quarter      mean finish time of the quarter the measure likes best,
//                    against the mean of all (ms; negative = it picks faster
//                    ones). This is what pruning a beam to a quarter would do.
// States from which the lap does not finish count as slower than all that do.
//
// Usage: node ideas/g1-4-beam-search/calibrate.mjs <track> [key=value ...]
//   at=60,240      start points, in decisions into the policy's lap; one per
//                  process, so this also sets the number of processes (max 2
//                  while training is running)
//   n=24           states per start point
//   actor= critic= rngSeed=   as beam.mjs
// The shared pool, not sim/pool.mjs: the same interface, but a worker that
// throws fails the request instead of leaving this process waiting for ever.
import { createPool } from '../shared/pool.mjs';
import { createRng } from '../shared/policy.mjs';

const args = process.argv.slice(2);
const track = args.find((a) => !a.includes('='));
const opt = Object.fromEntries(args.filter((a) => a.includes('=')).map((a) => a.split('=')));
if (!track) { console.error('Usage: node ideas/g1-4-beam-search/calibrate.mjs <track> [key=value ...]'); process.exit(1); }
const actor = opt.actor ?? `rl/checkpoints/ppo_sr1_${track}.u800.actor.bin`;
const critic = opt.critic ?? actor.replace('.actor.bin', '.critic.bin');
const starts = (opt.at ?? '60,240').split(',').map(Number);
const N = Number(opt.n ?? 24);
const rng = createRng(Number(opt.rngSeed ?? 1));
const HORIZONS = [5, 10, 20, 40];
const workers = starts.length;

const pool = await createPool(track, workers, '../ideas/g1-4-beam-search/child.mjs', { actor, critic });
const all = (make) => pool.runAll(Array.from({ length: workers }, (_, w) => make(w)));
const seed = () => Math.floor(rng() * 2 ** 31);

// The policy's own lap gives the start points.
const roots = await all(() => ({ cmd: 'root' }));
const [{ laps: [policyLap] }] = await pool.runAll([{ cmd: 'finish', runs: [{ node: roots[0].node }] }]);
console.log(`${track}: the policy's own lap ${(policyLap.finishFrames / 1000).toFixed(3)} s`);

// 1. two rounds of branching from each start point
const base = await all((w) => ({ cmd: 'adopt', decisions: policyLap.decisions.slice(0, starts[w]) }));
const first = await all((w) => ({ cmd: 'expand', parents: [{ node: base[w].node }], samples: 4, alts: true, mark: true, seed: seed() }));
const second = await all((w) => ({
  cmd: 'expand', samples: 3, alts: true, mark: true, seed: seed(),
  parents: first[w].children.filter((c) => c.node != null).map((c) => ({ node: c.node })),
}));
// Up to N of them, picked at random (a fixed seed, so a run repeats).
const states = second.map((reply) => {
  const live = reply.children.filter((c) => c.node != null);
  for (let i = live.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [live[i], live[j]] = [live[j], live[i]]; }
  return live.slice(0, N);
});

// 2. every state to the finish
const t0 = performance.now();
const finished = await all((w) => ({ cmd: 'finish', runs: states[w].map((s) => ({ node: s.node })) }));
console.log(`${states.flat().length} rollouts to the finish in ${((performance.now() - t0) / 1000).toFixed(0)} s`);
pool.close();

// --- 3. the comparison ----------------------------------------------------------
/** Ranks 1..n of `xs`, ties sharing their mean rank. */
function ranks(xs) {
  const order = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
  const out = new Array(xs.length);
  for (let i = 0; i < order.length;) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    for (let k = i; k <= j; k++) out[order[k][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return out;
}
/** Spearman rank correlation: Pearson correlation of the ranks. */
function spearman(a, b) {
  const ra = ranks(a), rb = ranks(b), n = a.length;
  const mid = (n + 1) / 2;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { sab += (ra[i] - mid) * (rb[i] - mid); saa += (ra[i] - mid) ** 2; sbb += (rb[i] - mid) ** 2; }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : 0;
}
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

for (let w = 0; w < workers; w++) {
  const laps = finished[w].laps;
  const times = laps.filter((l) => l.finished).map((l) => l.finishFrames);
  if (times.length < 4) { console.log(`\nstart ${starts[w]}: only ${times.length} of ${laps.length} states finish; nothing to compare`); continue; }
  // Non-finishers: one second slower than the slowest finisher, so they rank
  // last and count in the means without swamping them.
  const worst = Math.max(...times) + 1000;
  const frames = laps.map((l) => (l.finished ? l.finishFrames : worst));
  const sooner = frames.map((f) => -f);
  // A rollout that ended before H decisions: use where it ended.
  const after = (lap, key, H) => lap[key][Math.min(H, lap[key].length) - 1];
  const measures = [
    ['progress', states[w].map((s) => s.progress)],
    ['value', states[w].map((s) => s.reward + s.value)],
    ...HORIZONS.map((H) => [`look ${H}`, laps.map((l) => after(l, 'trace', H))]),
    ...HORIZONS.map((H) => [`lookvalue ${H}`, laps.map((l, i) => states[w][i].reward + after(l, 'valueTrace', H))]),
  ];
  console.log(`\nstart ${starts[w]} decisions (${(starts[w] * 0.05).toFixed(1)} s) into the lap: ${laps.length} states, ${times.length} finish, ` +
    `finish times ${(Math.min(...times) / 1000).toFixed(3)} .. ${(Math.max(...times) / 1000).toFixed(3)} s (the policy's own lap: ${(policyLap.finishFrames / 1000).toFixed(3)} s)`);
  console.log(`  ${'measure'.padEnd(14)} rank agreement   top quarter against all`);
  const quarter = Math.max(1, Math.round(laps.length / 4));
  const line = (name, agreement, picked) => console.log(`  ${name.padEnd(14)} ${agreement.toFixed(2).padStart(8)}        ${(mean(picked) - mean(frames)).toFixed(0).padStart(6)} ms`);
  for (const [name, xs] of measures) {
    line(name, spearman(xs, sooner), xs.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]).slice(0, quarter).map(([, i]) => frames[i]));
  }
  line('(finish time)', 1, frames.slice().sort((a, b) => a - b).slice(0, quarter));
}
process.exit(0);
