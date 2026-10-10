// Read the logs explore.mjs wrote (ideas/g2-3-explore-and-adapt/out/*.json)
// and print the two tables the design rests on:
//
//   1. For each track and mode: how many runs had a finished lap, and the
//      average furthest point reached, after 1, 2, 3, 5, 8 and 10 laps of
//      simulated time. This is "result as a function of attempts used".
//   2. For the explore runs: of the restarts made from each distance behind
//      the frontier, and with each kind of variation, how many moved the
//      frontier. This is the evidence for the BACK and KINDS settings.
//
// Usage: node ideas/g2-3-explore-and-adapt/analyze.mjs [filter]
//   filter   only logs whose file name contains this text (e.g. g2-3-s)
import { readdirSync, readFileSync } from 'node:fs';

const dir = new URL('./out/', import.meta.url);
const filter = process.argv[2] ?? '';
const runs = readdirSync(dir).filter((f) => f.endsWith('.json') && f.includes(filter))
  .map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')));
if (!runs.length) { console.log('no logs'); process.exit(1); }

// --- 1. progress against simulated laps used -----------------------------------
const BUDGETS = [1, 2, 3, 5, 8, 10];
const groups = new Map();
for (const r of runs) {
  const key = `${r.track} ${r.mode}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
}
console.log('finished runs / runs, and mean furthest point (% of lap), by laps of simulated time used');
console.log(`${'track mode'.padEnd(18)} runs  ${BUDGETS.map((b) => `${b} laps`.padStart(11)).join('')}`);
for (const [key, list] of [...groups].sort()) {
  const cols = BUDGETS.map((budget) => {
    let finished = 0, sum = 0;
    for (const r of list) {
      // The run's state after the last attempt that ended within the budget.
      const last = r.log.findLast((a) => a.laps <= budget);
      const frontier = last ? last.frontier : 0;
      if (frontier >= 1) finished++;
      sum += frontier;
    }
    return `${finished}/${list.length} ${(100 * sum / list.length).toFixed(0).padStart(3)}%`.padStart(11);
  });
  console.log(`${key.padEnd(18)} ${String(list.length).padStart(4)}  ${cols.join('')}`);
}

// --- 2. which restarts moved the frontier ---------------------------------------
const restarts = runs.filter((r) => r.mode === 'explore').flatMap((r) => r.log.filter((a) => a.back != null));
const table = (title, keyOf, order) => {
  const rows = new Map();
  for (const a of restarts) {
    const key = keyOf(a);
    const row = rows.get(key) ?? { n: 0, moved: 0 };
    row.n++; if (a.moved) row.moved++;
    rows.set(key, row);
  }
  console.log(`\n${title}: restarts, of which moved the frontier`);
  for (const key of order ?? [...rows.keys()].sort()) {
    const row = rows.get(key);
    if (row) console.log(`  ${String(key).padEnd(10)} ${String(row.n).padStart(4)}  ${String(row.moved).padStart(3)}  (${(100 * row.moved / row.n).toFixed(0)}%)`);
  }
};
const BACK_EDGES = [1.5, 3, 5, 8, 12];
table('seconds behind the frontier', (a) => {
  const edge = BACK_EDGES.find((e) => a.back <= e);
  return edge ? `<= ${edge} s` : `> 12 s`;
}, [...BACK_EDGES.map((e) => `<= ${e} s`), '> 12 s']);
table('kind of variation', (a) => a.kind);
table('sideways position of the starting cell', (a) => {
  const side = Math.abs(a.fromLateral);
  return side < 1 ? '< 1 unit' : side < 3 ? '1-3 units' : '> 3 units';
}, ['< 1 unit', '1-3 units', '> 3 units']);
