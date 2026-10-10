// A REAL (not dry) launch of the driver on everything except the practice.
//
//   node ideas/g1-3-search-train-rounds/smoke_real.mjs [keep=1]
//
// test_restart.mjs checks what the driver decides; this checks that what it
// then runs actually works: the lock, the state file, laps_bc.py, noticing
// that practice is complete, making the end copy, rl/evaluate.py attempts and
// the removal of their lap files, the pick, rl/export_actor.py,
// scripts/search_rollout.mjs, Verify, the results file, running out of time
// and being launched again.
//
// It cannot train (an hour on the GPU, and training is not allowed while the
// other jobs run), so it sets up a round whose practice is already complete:
// desert4's real round-1 checkpoint, copied under this driver's names in a
// separate series (tag=smoke, so nothing here can collide with real rounds on
// desert4). Everything is cut down to stay light: 1 kept copy, 2 test
// attempts, one 30 s search with 2 simulator processes. The lap it finds
// means nothing; only "does every step run and restart" is being tested.
//
// Three launches:
//   1. minutes=1: makes the examples, sees practice is done, has no time for
//      the tests -> must exit with code 3 without starting anything else
//   2. full time: tests, pick, search, conclude -> exit 0
//   3. again: nothing left to do -> exit 0, runs nothing
// Everything it created is removed at the end unless keep=1.
import { spawnSync } from 'node:child_process';
import { mkdirSync, copyFileSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { paths, IDEA_DIR } from './lib.mjs';

const PROJECT = fileURLToPath(new URL('../../', import.meta.url));
const keep = process.argv.includes('keep=1');
const track = 'desert4', tag = 'smoke';
const p = paths(track, 1, tag);
const at = (f) => join(PROJECT, f);
let failed = 0;
const check = (what, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok ? '' : `\n${detail}`}`); };

/** Every file this script and the driver create, for the clean-up. */
function ours() {
  const inDir = (dir, test) => (existsSync(at(dir)) ? readdirSync(at(dir)).filter(test).map((n) => `${dir}/${n}`) : []);
  return [
    ...inDir('rl/checkpoints', (n) => n.startsWith(`g1-3-${tag}-${track}-r`)),
    ...inDir('runs', (n) => n.startsWith(`g1-3-${tag}r`) || n.startsWith(`g1-3-t${tag}-`)),
    p.work, p.results,
  ];
}
const cleanUp = () => { for (const f of ours()) rmSync(at(f), { recursive: true, force: true }); };
cleanUp();

// The round as it stands when practice has just finished and the machine is shut down.
const lap0 = 'runs/rollout_desert4.recording.json';
const frames0 = JSON.parse(readFileSync(at(lap0), 'utf8')).frames;
const startSteps = Number(/resumed .* at (\d+) steps/.exec(readFileSync(at('runs/rl_train_sr1_desert4.log'), 'utf8'))[1]);
const base = 'rl/checkpoints/ppo_gblk_desert4.final.pt';
copyFileSync(at('rl/checkpoints/ppo_sr1_desert4.pt'), at(p.checkpoint));
mkdirSync(at(p.work), { recursive: true });
writeFileSync(at(p.state), JSON.stringify({
  track, best: { file: lap0, frames: frames0, round: 0 }, laps: [{ file: lap0, frames: frames0, round: 0 }], base, strikes: 0, stopped: null,
  rounds: [{ n: 1, base, startLap: { file: lap0, frames: frames0 }, exampleLaps: [lap0], done: false, train: { startSteps, updates: 1220, batch: 2048 } }],
}, null, 2));

const SETTINGS = [`tag=${tag}`, 'rounds=1', 'seeds=1', 'maxCopies=1', 'minFinishes=1', 'testWorkers=2', 'searches=1', 'searchSeconds=30', 'searchWorkers=2'];
function launch(...extra) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [at(`${IDEA_DIR}/rounds.mjs`), track, ...SETTINGS, ...extra], { cwd: PROJECT, encoding: 'utf8' });
  const out = (r.stdout + r.stderr).split('\n').filter((l) => !/wasm streaming|falling back/.test(l)).join('\n');
  console.log(out.split('\n').map((l) => `    | ${l}`).join('\n'));
  console.log(`    (${((Date.now() - t0) / 1000).toFixed(0)} s, exit code ${r.status})`);
  return { out, code: r.status };
}

console.log('--- launch 1: one minute ---');
let r = launch('minutes=1');
check('launch 1 made the examples, saw practice as done, made the end copy and stopped for lack of time (exit 3)',
  r.code === 3 && existsSync(at(p.examples)) && r.out.includes('2 practice: done (1220 updates)') && existsSync(at(p.copy(1220))) && r.out.includes('not enough of this launch left'), r.out);
check('launch 1 started no practice', !r.out.includes('rl/train_ppo.py') && !existsSync(at(p.trainLog)));
check('launch 1 left no lock behind', !existsSync(at(p.lock)));

if (!failed) {
  console.log('--- launch 2: the rest of the round ---');
  r = launch();
  const state = JSON.parse(readFileSync(at(p.state), 'utf8'));
  const round = state.rounds[0];
  check('launch 2 skipped the examples and the practice', r.out.includes('1 examples: done') && r.out.includes('2 practice: done') && !r.out.includes('rl/train_ppo.py'), r.out);
  check('launch 2 ran the 2 test attempts and picked c1220', r.out.includes('0 of 2 attempts have a result, 2 to run') && round.picked?.copy === 1220);
  check('the test attempts\' lap files were removed from runs/', !readdirSync(at('runs')).some((n) => n.startsWith(`g1-3-t${tag}-`)));
  check('the search produced a lap that the driver verified', round.searches?.[1]?.frames > 0 && existsSync(at(p.searchLap(1))), JSON.stringify(round.searches));
  check('the round is recorded as complete with its gain, exit 0', r.code === 0 && round.done && round.gain === frames0 - round.lap.frames, JSON.stringify(round));
  check('the best lap carried forward is the faster of the two', state.best.frames === Math.min(frames0, round.lap.frames));
  check('the results file has the round\'s row', existsSync(at(p.results)) && /^\s+1\s+21\.907 s\s+c1220\s+1\/1/m.test(readFileSync(at(p.results), 'utf8')));
  if (existsSync(at(p.results))) console.log(readFileSync(at(p.results), 'utf8').split('\n').map((l) => `    | ${l}`).join('\n'));

  console.log('--- launch 3: nothing left to do ---');
  r = launch();
  check('launch 3 ran nothing and reported the target reached', r.code === 0 && r.out.includes('1 round(s) complete, the target') && !r.out.includes('$ '), r.out);
}

if (!keep) cleanUp();
console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
