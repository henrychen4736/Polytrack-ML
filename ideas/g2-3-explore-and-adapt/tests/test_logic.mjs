// The parts of g2-3 that need no simulator, against values worked out by hand:
//   1. the archive's cells and the choice of a restart cell (explore.mjs)
//   2. analyze.mjs on made-up logs
//   3. the README's table and figures, recomputed from the author's logs
//   4. what the logs say about the comparison (same seeds, same budget) and
//      about the restart rules being followed
//
// explore.mjs is a script with no exports, so for (1) the functions are cut
// out of its source text and run here with made-up surroundings. The test
// therefore runs the real code, and fails if the functions are renamed.
//
//   node ideas/g2-3-explore-and-adapt/tests/test_logic.mjs
import { readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { check, same, finish } from './check.mjs';

const HERE = new URL('./', import.meta.url);
const source = readFileSync(new URL('../explore.mjs', HERE), 'utf8').split('\r\n').join('\n');

/** The text of a top-level declaration, from its first line to the first
 *  line that is just a closing brace (with or without a semicolon). */
function cut(startsWith) {
  const from = source.indexOf(`\n${startsWith}`);
  if (from < 0) throw new Error(`explore.mjs has no "${startsWith}"`);
  const end = source.slice(from).search(/\n\};?\n/);
  return source.slice(from, from + end + 3);
}
const constant = (name) => Number(source.match(new RegExp(`const ${name} = ([0-9.]+);`))[1]);
const CELL_LENGTH = constant('CELL_LENGTH'), CELL_WIDTH = constant('CELL_WIDTH'), MAX_SIDE_CELLS = constant('MAX_SIDE_CELLS');
const MARK_EVERY = constant('MARK_EVERY'), GAIN = constant('GAIN');
check(CELL_LENGTH === 20 && CELL_WIDTH === 2 && MAX_SIDE_CELLS === 4 && MARK_EVERY === 5 && GAIN === 5,
  'the grid is as the README says: cells of 20 units by 2, 4 side cells each way, an offer every 5 decisions, a frontier move is more than 5 units');

// --- 1a. cellKey ------------------------------------------------------------------
const cellKey = new Function('CELL_LENGTH', 'CELL_WIDTH', 'MAX_SIDE_CELLS', `${cut('const cellKey =')}\nreturn cellKey;`)(CELL_LENGTH, CELL_WIDTH, MAX_SIDE_CELLS);
const keys = [
  // [progress, lateral, expected]: along the road, a cell is [20k, 20k + 20)
  [0, 0, '0:0'], [19.99, 0, '0:0'], [20, 0, '1:0'], [1234.5, 0, '61:0'],
  // sideways, cell s is [2s - 1, 2s + 1): the car's own width around the line
  [0, 0.99, '0:0'], [0, 1, '0:1'], [0, 2.99, '0:1'], [0, 3, '0:2'],
  [0, -0.99, '0:0'], [0, -1.01, '0:-1'], [0, -3.01, '0:-2'],
  // further out than 4 cells is all one cell
  [0, 7, '0:4'], [0, 8.9, '0:4'], [0, 9, '0:4'], [0, 500, '0:4'], [0, -9.01, '0:-4'], [0, -500, '0:-4'],
];
const wrong = keys.filter(([p, l, expected]) => cellKey(p, l) !== expected).map(([p, l, e]) => `(${p}, ${l}) -> ${cellKey(p, l)}, expected ${e}`);
check(wrong.length === 0, `cellKey: ${keys.length} hand-worked positions land in the right cell`, wrong.join('; '));
check(cellKey(100, 0) !== cellKey(100, 4) && cellKey(100, 4) === cellKey(119, 3.2), 'cellKey: a car 4 units left of the line is a different cell from the line\'s own, and shares one with a car 3.2 units left 19 units on');

// --- 1b. offer: a cell keeps the state that got there soonest ---------------------------
{
  const dropped = [];
  let made = 0;
  const renv = { progress: 0, lateral: 0, mark: async () => ({ id: ++made }), dropMark: (k) => dropped.push(k.id) };
  const archive = new Map();
  const state = { carId: 0 };
  const build = new Function('renv', 'archive', 'cellKey', 'state', `
    const here = (info) => ({ progress: renv.progress, lateral: renv.lateral, tick: info.frames, speed: info.speedKmh });
    ${cut('async function offer').replace(/carId/g, 'state.carId')}
    return offer;`);
  const offer = build(renv, archive, cellKey, state);
  const at = (progress, lateral) => { renv.progress = progress; renv.lateral = lateral; };
  const decisions = [[0, 0, 1, 0, 0, 0]];
  at(105, 0.2); await offer(decisions, { frames: 5000, speedKmh: 200 });
  decisions.push([1, 0, 1, 0, 0, 0]);
  const first = archive.get('5:0');
  check(archive.size === 1 && first.tick === 5000 && first.tries === 0 && first.wins === 0 && first.mark.id === 1 && first.progress === 105,
    'offer: an empty cell takes the state, with a save state and zero tries');
  check(first.decisions.length === 1, 'offer: the cell holds its own copy of the decisions (later decisions of the attempt do not leak in)');
  at(110, -0.3); await offer(decisions, { frames: 5200, speedKmh: 250 });
  check(archive.get('5:0') === first && made === 1, 'offer: a later arrival in the same cell is not kept (and no save state is taken for it)');
  at(110, -0.3); await offer(decisions, { frames: 5000, speedKmh: 250 });
  check(archive.get('5:0') === first && made === 1, 'offer: an arrival on the same tick does not replace the cell');
  at(119, 0.9); await offer(decisions, { frames: 4999, speedKmh: 180 });
  const second = archive.get('5:0');
  check(second !== first && second.tick === 4999 && second.progress === 119 && second.decisions.length === 2 && same(dropped, [1]),
    'offer: an arrival one tick sooner replaces it, and the old save state is dropped');
  at(119, 1.0); await offer(decisions, { frames: 9000, speedKmh: 180 });
  check(archive.size === 2 && archive.has('5:1'), 'offer: one unit further left is a cell of its own, however late');
  // A cell whose save state belongs to an earlier car: replaced without
  // touching the dead save state.
  state.carId = 1;
  at(119, 1.0); await offer(decisions, { frames: 8000, speedKmh: 180 });
  check(archive.get('5:1').car === 1 && same(dropped, [1]), 'offer: a save state of an earlier car is not dropped on the new car');
}

// --- 1c. chooseCell ---------------------------------------------------------------------
{
  const archive = new Map();
  let draws = [];
  const rng = () => draws.shift();
  const BACK_MIN = Number(source.match(/num\('backMin', ([0-9.]+)\)/)[1]);
  const pace = 80;   // units per second: the window is 40 units per 0.5 s
  const chooseCell = new Function('archive', 'rng', 'BACK_MIN', 'paceUnitsPerSecond', `${cut('function chooseCell')}\nreturn chooseCell;`)(archive, rng, BACK_MIN, pace);
  check(BACK_MIN === 0.5, 'backMin defaults to 0.5 s');
  check(chooseCell(1000, 1.5) === null, 'chooseCell: an empty archive gives the start line (null)');
  // Frontier 1000, 1.5 s back at 80 units/s: the window is 880 .. 960, both ends included.
  const cell = (name, progress, tries) => { const c = { key: name, progress, tries }; archive.set(name, c); return c; };
  cell('tooFar', 879.9, 0); const a = cell('a', 880, 0); const b = cell('b', 930, 1); const c = cell('c', 960, 3); cell('tooClose', 960.1, 0);
  // Weights 1, 1/2, 1/4 (total 1.75): a up to 1.0, b up to 1.5, c above.
  const pick = (u) => { draws = [u]; return chooseCell(1000, 1.5).key; };
  check(pick(0) === 'a' && pick(0.57) === 'a' && pick(0.58) === 'b' && pick(0.85) === 'b' && pick(0.86) === 'c' && pick(0.999999) === 'c',
    'chooseCell: only cells 0.5 to 1.5 s behind the frontier, picked with weight 1 / (1 + tries) (boundaries at 1/1.75 and 1.5/1.75)');
  let n = { a: 0, b: 0, c: 0 };
  for (let k = 0; k < 7000; k++) n[pick((k + 0.5) / 7000)]++;
  check(n.a === 4000 && n.b === 2000 && n.c === 1000, `chooseCell: over evenly spread draws the shares are 4 : 2 : 1 (${n.a}, ${n.b}, ${n.c})`);
  check(pick(0) === 'a' && (draws = [0], chooseCell(1000, 0.6)?.key) === 'c', 'chooseCell: a shorter window (0.6 s) leaves only the nearest cell');
  draws = [0];
  check(chooseCell(900, 0.6) === null, 'chooseCell: a window with no cell in it gives the start line');
  a.tries = 1e9; b.tries = 1e9; c.tries = 0;
  check(pick(0.5) === 'c', 'chooseCell: cells that keep failing give way to an untried neighbour');
}

// --- the restart level rule, read off the source ------------------------------------------
check(/level = Math\.floor\(stale \/ PER_LEVEL\) % BACK\.length/.test(source) && /\(opt\.back \?\? '1\.5,3,5'\)/.test(source) && /num\('perLevel', 4\)/.test(source),
  'the level is floor(attempts without a new frontier / 4), going round the levels 1.5, 3, 5 s (checked against the logs below)');

// --- 2. analyze.mjs on made-up logs --------------------------------------------------------
{
  const outDir = new URL('../out/', HERE);
  const names = ['g2-3-test-zz1_explore_toytrack.json', 'g2-3-test-zz2_explore_toytrack.json'];
  const entry = (laps, frontier, extra = {}) => ({ laps, frontier, back: null, moved: false, kind: 'greedy', fromLateral: 0, ...extra });
  // Run 1 finishes at 3.1 laps. Run 2 finishes at 10.01 laps, which must NOT count as "within 10".
  writeFileSync(new URL(names[0], outDir), JSON.stringify({ track: 'toytrack', mode: 'explore', log: [
    entry(0.9, 0.3), entry(2.0, 0.5, { back: 1.5, moved: true, kind: 'kick', fromLateral: 0.5 }), entry(3.1, 1, { back: 1.51, moved: true, kind: 'kick', fromLateral: -2 })] }));
  writeFileSync(new URL(names[1], outDir), JSON.stringify({ track: 'toytrack', mode: 'explore', log: [
    entry(1.5, 0.4), entry(9.99, 0.6, { back: 5, moved: false, kind: 'lift', fromLateral: 3 }), entry(10.01, 1, { back: 13, moved: true, kind: 'hot', fromLateral: -7 })] }));
  let text = '';
  try {
    text = spawnSync(process.execPath, [fileURLToPath(new URL('../analyze.mjs', HERE)), 'g2-3-test-zz'], { encoding: 'utf8' }).stdout;
  } finally { for (const n of names) rmSync(new URL(n, outDir), { force: true }); }
  const row = text.split('\n').find((l) => l.startsWith('toytrack explore'));
  const cells = [...(row ?? '').matchAll(/(\d+)\/(\d+)\s+(\d+)%/g)].map((x) => [Number(x[1]), Number(x[2]), Number(x[3])]);
  // By hand, budgets 1, 2, 3, 5, 8, 10 laps: run 1 is at 30, 50, 50, 100, 100, 100 %; run 2 at 0, 40, 40, 40, 40, 60 %.
  check(same(cells, [[0, 2, 15], [0, 2, 45], [0, 2, 45], [1, 2, 70], [1, 2, 70], [1, 2, 80]]),
    'analyze: finished runs and mean furthest point by budget match the hand-worked table (a lap finished at 10.01 laps does not count within 10)', row);
  const line = (label) => (text.split('\n').find((l) => l.trim().startsWith(label)) ?? '').trim().split(/\s+/).slice(-3, -1).map(Number);
  check(same(line('<= 1.5 s'), [1, 1]) && same(line('<= 3 s'), [1, 1]) && same(line('<= 5 s'), [1, 0]) && same(line('> 12 s'), [1, 1]),
    'analyze: restarts are counted in the right "seconds behind the frontier" row (1.5 s in the first, 1.51 s in the second), start-line attempts left out', text);
  check(same(line('kick'), [2, 2]) && same(line('lift'), [1, 0]) && same(line('hot'), [1, 1]) && same(line('< 1 unit'), [1, 1]) && same(line('1-3 units'), [1, 1]) && same(line('> 3 units'), [2, 1]),
    'analyze: the tables by kind and by sideways position of the starting cell are right', text);
}

// --- 3. the README's table, recomputed from the author's logs -------------------------------
const outDir = new URL('../out/', HERE);
const logs = readdirSync(outDir).filter((f) => f.endsWith('.json')).map((f) => ({ file: f, ...JSON.parse(readFileSync(new URL(f, outDir), 'utf8')) }));
const group = (prefix, mode, track) => logs.filter((r) => new RegExp(`^g2-3-${prefix}\\d+_${mode}_${track}\\.json$`).test(r.file));
const BUDGETS = [1, 2, 3, 5, 8, 10];
function table(runs) {
  const finished = [], percent = [];
  for (const budget of BUDGETS) {
    let done = 0, sum = 0;
    for (const r of runs) {
      let frontier = 0;
      for (const a of r.log) if (a.laps <= budget) frontier = a.frontier;
      if (frontier >= 1) done++;
      sum += frontier;
    }
    finished.push(done); percent.push(Math.round(100 * sum / runs.length));
  }
  return { runs: runs.length, finished, percent };
}
const README = [
  ['b', 'explore', 'winter4', 8, [0, 0, 3, 3, 7, 8], [36, 36, 75, 79, 96, 100]],
  // The README prints 53 % at 2 laps for this row. The eight logs give 51.6;
  // 53.3 is what analyze.mjs prints for the filter "g2-3-s", which also picks
  // up g2-3-smoke_plain_winter4.json (seed 1 a second time) as a ninth run.
  ['s', 'plain', 'winter4', 8, [0, 0, 0, 0, 0, 0], [36, 52, 67, 67, 67, 67]],
  ['b', 'explore', 'desert3', 5, [0, 1, 3, 4, 5, 5], [31, 48, 86, 91, 100, 100]],
  ['s', 'plain', 'desert3', 5, [0, 0, 2, 2, 2, 3], [18, 44, 88, 88, 90, 94]],
  ['b', 'explore', 'summer3', 5, [0, 5, 5, 5, 5, 5], [66, 100, 100, 100, 100, 100]],
  ['s', 'plain', 'summer3', 5, [0, 2, 4, 5, 5, 5], [66, 80, 93, 100, 100, 100]],
];
for (const [prefix, mode, track, runs, finished, percent] of README) {
  const t = table(group(prefix, mode, track));
  check(t.runs === runs && same(t.finished, finished) && same(t.percent, percent),
    `README table, ${track} ${mode}: ${runs} runs, finished ${finished.join(' ')}, furthest ${percent.join(' ')} % is what the logs give`, JSON.stringify(t));
}
{
  const w = group('b', 'explore', 'winter4');
  const laps = w.map((r) => r.lapsUsed).sort((x, y) => x - y), attempts = w.map((r) => r.attempts), times = w.map((r) => r.finishFrames);
  const median = (laps[3] + laps[4]) / 2;
  check(laps[0].toFixed(1) === '2.7' && laps[7].toFixed(1) === '9.4' && median.toFixed(1) === '5.5' && Math.min(...attempts) === 9 && Math.max(...attempts) === 62,
    `README: winter4 explore found a lap after 2.7 to 9.4 laps (median 5.5), 9 to 62 attempts (logs: ${laps[0]} to ${laps[7]}, median ${median.toFixed(2)}, ${Math.min(...attempts)} to ${Math.max(...attempts)})`);
  check(Math.min(...times) === 19920 && Math.max(...times) === 25539, `README: winter4 laps of 19.920 to 25.539 s (logs: ${Math.min(...times)} to ${Math.max(...times)})`);
  const range = (track) => { const t = group('b', 'explore', track).map((r) => r.finishFrames); return [Math.min(...t), Math.max(...t)]; };
  check(same(range('desert3'), [20976, 25781]) && same(range('summer3'), [21678, 21749]), 'README: desert3 laps 20.976 to 25.781 s, summer3 21.678 to 21.749 s');
  const plain = group('s', 'plain', 'winter4');
  const ends = plain.map((r) => r.frontier);
  check(plain.every((r) => !r.finished) && Math.min(...ends) >= 0.6665 && Math.max(...ends) <= 0.6725,
    `README: winter4 plain, 0 of 8 runs finished, all stopped at 66.7 to 67.2% (logs: ${(100 * Math.min(...ends)).toFixed(2)} to ${(100 * Math.max(...ends)).toFixed(2)}%)`);
  const plainAttempts = plain.reduce((s, r) => s + r.attempts, 0);
  check(plainAttempts >= 100 && plainAttempts <= 110, `README: "about 105" plain attempts on winter4 in all (logs: ${plainAttempts})`);
}

// --- 4. the comparison, and the rules, as the logs record them --------------------------------
{
  const finishedLogs = logs.filter((r) => r.finished);
  check(finishedLogs.length > 0 && finishedLogs.every((r) => r.verified === true && r.files.length === 2),
    `every finished lap in the logs (${finishedLogs.length}) is marked as verified, with its two files`);
  for (const track of ['winter4', 'desert3', 'summer3']) {
    const e = group('b', 'explore', track), p = group('s', 'plain', track);
    const seeds = (list) => list.map((r) => r.seed).sort((x, y) => x - y);
    check(same(seeds(e), seeds(p)) && new Set([...e, ...p].map((r) => r.actor)).size === 1 && new Set([...e, ...p].map((r) => r.humanFrames)).size === 1,
      `${track}: explore and plain used the same seeds (${seeds(e).join(',')}), the same policy file and the same unit of budget`);
    // Same stopping rule: a run ends at its first finish or when the budget of
    // simulated time is used; none was ended early by the wall-clock limit.
    const cut = [...e, ...p].filter((r) => !r.finished && r.lapsUsed < 10);
    check(cut.length === 0, `${track}: no unfinished run stopped before 10 laps of simulated time (the wall-clock limit never cut one short)`, cut.map((r) => r.file).join(', '));
    // The first attempt is the same in both modes: top choices from the line.
    const firstSame = e.every((r) => { const q = p.find((x) => x.seed === r.seed); return q && r.log[0].endTick === q.log[0].endTick && r.log[0].reached === q.log[0].reached && r.log[0].kind === 'greedy'; });
    check(firstSame, `${track}: attempt 1 is the same top-choice attempt in both modes`);
  }
  // Plain mode: every attempt from the line, and its cost is its own length.
  // An attempt of n decisions is charged 50 n ticks; the lap clock at its end
  // is 1 (the empty first tick) + the ticks really driven, which is within
  // one block of that.
  const plainRuns = logs.filter((r) => r.mode === 'plain');
  let badCost = 0, badStart = 0;
  for (const r of plainRuns) {
    let before = 0;
    for (const a of r.log) {
      const charged = Math.round((a.laps - before) * r.humanFrames);
      before = a.laps;
      const driven = a.endTick - 1;
      // laps is rounded to 3 decimals: allow 2 x 0.0005 laps of rounding.
      if (charged - driven < -r.humanFrames * 0.001 || charged - driven >= 50 + r.humanFrames * 0.001) badCost++;
      if (a.from !== 0 || a.back !== null) badStart++;
    }
  }
  check(badStart === 0 && badCost === 0, `plain mode (${plainRuns.length} logs): every attempt starts on the line and is charged its own driven ticks, rounded up to a whole decision`, `${badCost} attempts with a cost that does not match their end tick`);
  // Explore mode with the final settings (the b and c runs): the level follows
  // the stale count, a restart is never from closer than 0.5 s or further than
  // the level allows, the frontier never goes back, and "moved" means what
  // the README says.
  const final = logs.filter((r) => /^g2-3-[bc]\d+_explore/.test(r.file));
  const BACK = [1.5, 3, 5];
  const bad = { level: 0, window: 0, frontier: 0, moved: 0, first: 0 };
  let restarts = 0;
  for (const r of final) {
    let stale = 0, frontier = 0;
    for (const [k, a] of r.log.entries()) {
      if (k === 0) { if (a.kind !== 'greedy' || a.from !== 0 || a.back !== null) bad.first++; }
      else {
        if (a.level !== Math.floor(stale / 4) % 3) bad.level++;
        if (a.back !== null) { restarts++; if (a.back < 0.5 - 0.006 || a.back > BACK[a.level] + 0.006) bad.window++; }
      }
      if (a.frontier < frontier - 1e-9) bad.frontier++;
      const gain = a.reason === 'finished' ? Infinity : a.reached - frontier * r.lineLength;
      // 0.1 units of slack either way for the rounding in the log
      if (a.moved !== (gain > 5) && Math.abs(gain - 5) > 0.1) bad.moved++;
      stale = a.moved ? 0 : stale + 1;
      frontier = Math.max(frontier, a.frontier);
    }
  }
  check(Object.values(bad).every((n) => n === 0),
    `explore logs with the final settings (${final.length} runs, ${restarts} restarts): levels, restart windows (0.5 s to 1.5 / 3 / 5 s behind the frontier), frontier and "moved" all follow the stated rules`, JSON.stringify(bad));
}

// --- 5. finetune_plan.sh: a dry run that prints commands which could be run ---------------------
{
  const root = fileURLToPath(new URL('../../../', HERE));
  const before = readdirSync(new URL('../out/', HERE)).length;
  const run = spawnSync('sh', ['ideas/g2-3-explore-and-adapt/finetune_plan.sh', 'winter4'], { cwd: root, encoding: 'utf8' });
  const text = run.stdout ?? '';
  check(run.status === 0 && readdirSync(new URL('../out/', HERE)).length === before && !readdirSync(`${root}rl/checkpoints`).some((f) => f.startsWith('g2-3-adapt')),
    'finetune_plan.sh runs nothing: no training log and no g2-3-adapt checkpoint appear');
  // Every option it would pass must be one the target script accepts.
  const joined = text.replace(/\\\n/g, ' ');
  const unknown = [];
  for (const script of ['rl/train_ppo.py', 'rl/evaluate.py', 'rl/lap_bc.py', 'rl/export_actor.py']) {
    const code = readFileSync(`${root}${script}`, 'utf8');
    for (const line of joined.split('\n').filter((l) => l.includes(script))) {
      for (const flag of line.match(/--[a-z-]+/g) ?? []) if (!code.includes(`"${flag}"`)) unknown.push(`${script} ${flag}`);
    }
  }
  check(text.includes('rl/lap_bc.py winter4 runs/g2-3-explore_winter4.recording.json rl/checkpoints/g2-3-bc_winter4.npz') && unknown.length === 0,
    'finetune_plan.sh: every option in the printed commands is one the target script defines', unknown.join(', '));
  check(/--checkpoint rl\/checkpoints\/g2-3-adapt_winter4\.pt/.test(joined) && !/--checkpoint rl\/checkpoints\/ppo_blkgen\.best2\.pt --resume|--resume --checkpoint rl\/checkpoints\/ppo_/.test(joined),
    'finetune_plan.sh: training writes to a g2-3- checkpoint (a copy), never to the generalist\'s own file');
}

finish();
