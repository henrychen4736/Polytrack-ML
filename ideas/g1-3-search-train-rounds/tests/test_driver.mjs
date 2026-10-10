// rounds.mjs after an interruption at every step, on hand-built folders.
//
// Each scenario is a small folder under tests/scratch/ laid out as the
// project would be if the machine had stopped at one particular moment:
// a state file, stand-in checkpoints that hold only a step counter
// (make_ckpts.py), hand-written test output, and COPIES of two real searched
// laps of desert4 (21.907 s and 21.913 s). The driver is run on it with
// dry=1 root=<folder> and its printed decisions are compared with what the
// README says it should do. Nothing is trained or searched, and nothing
// under the real rl/checkpoints/ or runs/ is written: the real files are
// only read (the two laps, and one checkpoint's step counter in the last
// scenario).
//
// Every folder is hashed before and after its run: a dry run must change
// no file.
//
// Two drivers run at a time; each uses at most one simulator (for Verify).
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, copyFileSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { paths } from '../lib.mjs';
import { check, finish } from './harness.mjs';

const PROJECT = fileURLToPath(new URL('../../../', import.meta.url));
const IDEA = fileURLToPath(new URL('../', import.meta.url));
const SCRATCH = fileURLToPath(new URL('./scratch/driver/', import.meta.url));
const PY = join(PROJECT, '.venv/Scripts/python.exe');
rmSync(SCRATCH, { recursive: true, force: true });

const T = 'desert4';
const L0 = 'runs/rollout_desert4.recording.json';     // 21907 ticks
const L1 = 'runs/rollout_r1_desert4.recording.json';  // 21913 ticks
const BASE = 'rl/checkpoints/base.pt';
const S0 = 1_000_000;       // the base checkpoint's step counter
const BATCH = 2048, UPDATES = 1220;
const at = (updates) => S0 + updates * BATCH;
const P = paths(T, 1);
const realLap = (file) => JSON.parse(readFileSync(join(PROJECT, file), 'utf8'));
if (realLap(L0).frames !== 21907 || realLap(L1).frames !== 21913) throw new Error('the two real desert4 laps are not the 21.907 s and 21.913 s this test was written for');

// ---- building a scenario ---------------------------------------------------------------
const ckpts = {};   // absolute path -> steps, written in one Python call
/**
 *   state  the state file, or null for "never launched"
 *   ckpts  { path: steps }       stand-in checkpoints
 *   files  { path: text }        any other file
 *   laps   { path: [real lap, edit?] }  a copy of a real lap, optionally edited
 */
function build(name, { state = null, ckpts: cks = {}, files = {}, laps = {} }) {
  const root = join(SCRATCH, name);
  const put = (file, text) => { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), text); };
  mkdirSync(root, { recursive: true });
  if (state) put(P.state, JSON.stringify(state, null, 2));
  for (const [file, steps] of Object.entries(cks)) ckpts[join(root, file)] = steps;
  for (const [file, text] of Object.entries(files)) put(file, text);
  for (const [file, [from, edit]] of Object.entries(laps)) put(file, JSON.stringify(edit ? edit(realLap(from)) : realLap(from)));
  return root;
}
/** The state file as the driver leaves it during round 1. */
const stateOf = (round = {}, top = {}) => ({
  track: T, best: { file: L0, frames: 21907, round: 0 }, laps: [{ file: L0, frames: 21907, round: 0 }],
  base: BASE, strikes: 0, stopped: null,
  rounds: [{ n: 1, base: BASE, startLap: { file: L0, frames: 21907 }, exampleLaps: [L0], done: false, ...round }],
  ...top,
});
const TRAIN = { train: { startSteps: S0, updates: UPDATES, batch: BATCH } };
const fin = (ms) => `loaded x.pt (1 training steps)\n  10% at 2.10 s, 150 km/h, 0.4 off the line\nbody contact on 0 of 440 decisions\nFINISHED in ${(ms / 1000).toFixed(3)} s (human 21.750 s, 1.01x), 440 decisions, total reward 60.00\nsaved runs/x.json\n`;
const DNF = 'loaded x.pt (1 training steps)\nbody contact on 3 of 109 decisions\nDID NOT FINISH (off line) at 5.45 s: reached 23.0% of the line, 120 km/h, 41.0 off the line, total reward 9.00\n';
const CUT = 'loaded x.pt (1 training steps)\n  10% at 2.10 s, 150 km/h, 0.4 off the line\n  20% at 4.';
/** Test output of one copy: ten sampled attempts (ms, null = did not finish, 'cut' = cut off) and the top-choices one. */
function tests(k, sampled, greedy) {
  const files = {};
  const text = (v) => (v === 'cut' ? CUT : v == null ? DNF : fin(v));
  sampled.forEach((v, i) => { if (v !== undefined) files[P.testOut(k, 'sample', 10 + i)] = text(v); });
  if (greedy !== undefined) files[P.testOut(k, 'greedy', 0)] = text(greedy);
  return files;
}
// The hand-worked test table (see test_lib.mjs for the same four rows):
//   c800   10/10  three fastest 22000 22010 22020 -> 22010
//   c1000   7/10  21900 21900 21900 -> 21900   (set aside: fewer than 8 finishes)
//   c1200   9/10  22004 22006 22008 -> 22006   (the lowest allowed score)
//   c1220  10/10  22010 22014 22018 -> 22014
// c800, c1200 and c1220 are within 10 ms of 22006; c800 and c1220 have more
// finishes; of those c800 has the lower score. Rule "best": c1000 (21.900 s).
const TABLE = {
  ...tests(800, [22100, 22020, 22100, 22000, 22100, 22100, 22010, 22100, 22100, 22100], 22050),
  ...tests(1000, [null, 21900, 22200, 21900, null, 22200, 22200, 21900, null, 22200], null),
  ...tests(1200, [22300, 22300, 22008, 22300, 22004, null, 22300, 22300, 22006, 22300], 22001),
  ...tests(1220, [22400, 22400, 22400, 22400, 22400, 22400, 22400, 22018, 22014, 22010], 22002),
};
const COPIES = Object.fromEntries([800, 1000, 1200, 1220].map((k) => [P.copy(k), '']));
/** Practice complete and all copies kept. */
const PRACTISED = { ckpts: { [BASE]: S0, [P.checkpoint]: at(1220) }, files: { [P.examples]: 'npz', ...COPIES } };
const PICKED = { tested: [800, 1000, 1200, 1220], picked: { copy: 800, finishes: 10, of: 10, best: 22000, top3: 22010, greedy: 22050, rule: 'top3' } };

const roots = {
  'no-state': build('no-state', {}),
  'first-launch': build('first-launch', { ckpts: { [BASE]: S0 }, laps: {
    [L0]: [L0], [L1]: [L1],
    'runs/early.recording.json': [L0, (lap) => ({ ...lap, frames: lap.frames - 1 })],
    'runs/late.recording.json': [L0, (lap) => ({ ...lap, frames: lap.frames + 1 })],
  }, files: { 'runs/half.recording.json': '{"track":"desert4","frames":219' } }),
  'examples-cut': build('examples-cut', { state: stateOf(), ckpts: { [BASE]: S0 }, files: { [P.examples.replace(/\.npz$/, '.tmp.npz')]: 'half' } }),
  'before-practice': build('before-practice', { state: stateOf(), ckpts: { [BASE]: S0, [P.checkpoint]: S0 }, files: { [P.examples]: 'npz' } }),
  'practice-20': build('practice-20', { state: stateOf(TRAIN), ckpts: { [BASE]: S0, [P.checkpoint]: at(20) }, files: { [P.examples]: 'npz' } }),
  'practice-400': build('practice-400', { state: stateOf(TRAIN), files: { [P.examples]: 'npz' },
    ckpts: { [BASE]: S0, [P.checkpoint]: at(400), [P.checkpoint.replace(/\.pt$/, '.u200.pt')]: at(200) } }),
  // A second interruption: the leg that started at update 400 kept copies it
  // called u200 and u400, which are the round's updates 600 and 800.
  'practice-900': build('practice-900', { state: stateOf(TRAIN), files: { [P.examples]: 'npz', [P.copy(200)]: '' },
    ckpts: { [BASE]: S0, [P.checkpoint]: at(900), [P.checkpoint.replace(/\.pt$/, '.u200.pt')]: at(600), [P.checkpoint.replace(/\.pt$/, '.u400.pt')]: at(800) } }),
  'practice-730': build('practice-730', { state: stateOf(TRAIN), ckpts: { [BASE]: S0, [P.checkpoint]: at(730) }, files: { [P.examples]: 'npz' } }),
  'checkpoint-gone': build('checkpoint-gone', { state: stateOf(TRAIN), ckpts: { [BASE]: S0 }, files: { [P.examples]: 'npz' } }),
  // Practice complete; the end copy not yet made; c800 and c1000 fully tested
  // (one attempt of c800 did not finish: that IS a result), c1200 has one
  // attempt cut off, c1220 has none.
  'testing-cut': build('testing-cut', { state: stateOf(TRAIN), ckpts: PRACTISED.ckpts,
    files: { [P.examples]: 'npz', [P.copy(600)]: '', [P.copy(800)]: '', [P.copy(1000)]: '', [P.copy(1200)]: '',
      ...tests(800, [22100, 22020, null, 22000, 22100, 22100, 22010, 22100, 22100, 22100], 22050),
      ...tests(1000, [null, 21900, 22200, 21900, null, 22200, 22200, 21900, null, 22200], null),
      ...tests(1200, [22300, 22300, 22008, 'cut', 22004, null, 22300, 22300, 22006, 22300], 22001) } }),
  tested: build('tested', { state: stateOf(TRAIN), ckpts: PRACTISED.ckpts, files: { ...PRACTISED.files, ...TABLE } }),
  // A copy was picked before the shutdown, and it is NOT the one the rule
  // would pick now; only the two copies tested then count.
  'picked-earlier': build('picked-earlier', { ckpts: PRACTISED.ckpts, files: { ...PRACTISED.files, ...tests(1000, TABLE_ROW(1000), null), ...tests(1200, TABLE_ROW(1200), 22001) },
    state: stateOf({ ...TRAIN, tested: [1000, 1200], picked: { copy: 1200, finishes: 9, of: 10, best: 22004, top3: 22006, greedy: 22001, rule: 'top3' } }) }),
  'none-finish': build('none-finish', { state: stateOf(TRAIN), ckpts: PRACTISED.ckpts,
    files: { ...PRACTISED.files, ...Object.assign({}, ...[800, 1000, 1200, 1220].map((k) => tests(k, Array(10).fill(null), null))) } }),
  // Three searches: 1 recorded in the state (its file since deleted), 2 has a
  // lap that verifies, 3 has a log and a lap claiming one tick too few.
  'search-mixed': build('search-mixed', { ckpts: PRACTISED.ckpts, files: { ...PRACTISED.files, ...TABLE, [P.searchLog(2)]: 'x', [P.searchLog(3)]: 'searching for 200 s\n' },
    state: stateOf({ ...TRAIN, ...PICKED, searches: { 1: { file: 'runs/gone.recording.json', frames: 21950, ownFrames: 22050 } } }),
    laps: { [L0]: [L0], [P.searchLap(2)]: [L1], [P.searchLap(3)]: [L0, (lap) => ({ ...lap, frames: lap.frames - 1 })] } }),
  'conclude-slower': build('conclude-slower', { ckpts: PRACTISED.ckpts, files: { ...PRACTISED.files, ...TABLE },
    state: stateOf({ ...TRAIN, ...PICKED }), laps: { [L0]: [L0], [P.searchLap(1)]: [L1] } }),
  'conclude-second-strike': build('conclude-second-strike', { ckpts: PRACTISED.ckpts, files: { ...PRACTISED.files, ...TABLE },
    state: stateOf({ ...TRAIN, ...PICKED }, { strikes: 1 }), laps: { [L0]: [L0], [P.searchLap(1)]: [L1] } }),
  // The best lap so far is the 21.913 s one; this round's three searches gave
  // 21.950 (recorded), 21.913 and 21.907 s.
  'conclude-faster': build('conclude-faster', { ckpts: PRACTISED.ckpts, files: { ...PRACTISED.files, ...TABLE },
    state: stateOf({ ...TRAIN, ...PICKED, startLap: { file: L1, frames: 21913 }, exampleLaps: [L1], searches: { 1: { file: 'runs/gone.recording.json', frames: 21950, ownFrames: 22050 } } },
      { best: { file: L1, frames: 21913, round: 0 }, laps: [{ file: L1, frames: 21913, round: 0 }] }),
    laps: { [L1]: [L1], [P.searchLap(2)]: [L1], [P.searchLap(3)]: [L0] } }),
  stopped: build('stopped', { state: stateOf({}, { stopped: 'round 1: no kept copy finished a lap in testing' }) }),
  'target-reached': build('target-reached', { state: stateOf({ done: true, lap: null, gain: null, ownFrames: null }, { base: P.copy(800) }) }),
};
function TABLE_ROW(k) { return { 1000: [null, 21900, 22200, 21900, null, 22200, 22200, 21900, null, 22200], 1200: [22300, 22300, 22008, 22300, 22004, null, 22300, 22300, 22006, 22300] }[k]; }

{
  const list = join(SCRATCH, 'ckpts.json');
  writeFileSync(list, JSON.stringify(ckpts));
  const made = spawnSync(PY, [fileURLToPath(new URL('./make_ckpts.py', import.meta.url)), list], { cwd: PROJECT, encoding: 'utf8' });
  if (made.status !== 0) throw new Error(`make_ckpts.py failed:\n${made.stderr}`);
  rmSync(list);
}

// ---- running the driver -------------------------------------------------------------------
/** A hash of every file (name and content) under a folder. */
function hashTree(dir, skip = () => false) {
  const h = createHash('sha1');
  if (!existsSync(dir)) return 'absent';
  for (const name of readdirSync(dir, { recursive: true }).map(String).sort()) {
    if (skip(name.replaceAll('\\', '/'))) continue;
    const full = join(dir, name);
    h.update(name);
    if (statSync(full).isFile()) h.update(readFileSync(full));
  }
  return h.digest('hex');
}
/** Names under the REAL rl/checkpoints and runs that this driver could have made. */
const realNames = () => ['rl/checkpoints', 'runs'].map((d) => readdirSync(join(PROJECT, d)).filter((n) => n.includes('g1-3')).sort().join('|')).join('||');
const ideaHash = () => hashTree(IDEA, (name) => name.startsWith('tests/') || name === 'tests');

const realBefore = realNames(), ideaBefore = ideaHash();
const drives = []; // { name, root, args, out, code, unchanged }
const run = (name, rootName, ...args) => drives.push({ name, root: rootName ? roots[rootName] : null, args });
run('no-state', 'no-state');
run('first-launch', 'first-launch', `base=${BASE}`, `lap=${L1},runs/early.recording.json,${L0},runs/late.recording.json,runs/half.recording.json,runs/none.recording.json`);
run('examples-cut', 'examples-cut');
run('before-practice', 'before-practice');
run('practice-20', 'practice-20');
run('practice-400', 'practice-400');
run('practice-900', 'practice-900', 'minutes=10');
run('practice-730', 'practice-730');
run('practice-730 minutes=3', 'practice-730', 'minutes=3');
run('checkpoint-gone', 'checkpoint-gone');
run('testing-cut', 'testing-cut');
run('tested', 'tested');
run('tested pick=best', 'tested', 'pick=best', 'searches=1', 'searchSeconds=600');
run('picked-earlier', 'picked-earlier');
run('none-finish', 'none-finish', 'rounds=3');
run('search-mixed', 'search-mixed');
run('conclude-slower', 'conclude-slower', 'searches=1', 'rounds=2');
run('conclude-slower rounds=1', 'conclude-slower', 'searches=1', 'rounds=1');
run('conclude-second-strike', 'conclude-second-strike', 'searches=1', 'rounds=5');
run('conclude-faster minGain=6', 'conclude-faster', 'rounds=2', 'minGain=6', 'extraLaps=2');
run('conclude-faster minGain=7', 'conclude-faster', 'rounds=2', 'minGain=7');
run('stopped', 'stopped', 'rounds=9');
run('target-reached', 'target-reached', 'rounds=1');
// The dry run as the README gives it, on the REAL project (no root=): reads one real checkpoint and one real lap.
const REAL_BASE = 'rl/checkpoints/ppo_sr1_desert4.u800.pt';
if (existsSync(join(PROJECT, REAL_BASE))) run('real project', null, 'tag=tstdry', `base=${REAL_BASE}`, `lap=${L0}`);

async function driveOne(d) {
  const before = d.root ? hashTree(d.root) : null;
  const args = [join(IDEA, 'rounds.mjs'), T, 'dry=1', ...(d.root ? [`root=${d.root}`] : []), ...d.args];
  await new Promise((done) => {
    const child = spawn(process.execPath, args, { cwd: PROJECT, stdio: ['ignore', 'pipe', 'pipe'] });
    d.out = '';
    child.stdout.on('data', (c) => { d.out += c; });
    child.stderr.on('data', (c) => { d.out += c; });
    child.on('close', (code) => { d.code = code; done(); });
  });
  d.out = d.out.replaceAll('\r\n', '\n');
  d.unchanged = d.root ? hashTree(d.root) === before : null;
}
{ // two at a time
  let next = 0;
  await Promise.all([0, 1].map(async () => { while (next < drives.length) await driveOne(drives[next++]); }));
}
const D = Object.fromEntries(drives.map((d) => [d.name, d]));

/** The run printed all of `has`, none of `not`, and ended with `code`. */
function expect(what, name, { has = [], not = [], code = 0 }) {
  const d = D[name];
  const hit = (p) => (p instanceof RegExp ? p.test(d.out) : d.out.includes(p));
  const missing = has.filter((p) => !hit(p)), unwanted = not.filter(hit);
  check(what, !missing.length && !unwanted.length && d.code === code,
    () => `exit code ${d.code} (want ${code})${missing.length ? `\nmissing: ${missing.join('  |  ')}` : ''}${unwanted.length ? `\nmust not appear: ${unwanted.join('  |  ')}` : ''}\n--- output ---\n${d.out}`);
}
const ck = 'rl/checkpoints/g1-3-desert4-r1';

// ---- first launch ------------------------------------------------------------------------------
expect('never launched and no base=/lap= given: an error, nothing started', 'no-state', { has: ['first launch needs base='], code: 1 });
expect('first launch: both real laps verify (21.913 s and 21.907 s)', 'first-launch', { has: [`${L1}: 21.913 s, verified`, `${L0}: 21.907 s, verified`] });
expect('first launch: a lap claiming one tick too FEW is left out', 'first-launch', { has: ['runs/early.recording.json: does NOT verify'] });
expect('first launch: a lap claiming one tick too MANY is left out', 'first-launch', { has: ['runs/late.recording.json: does NOT verify'] });
expect('first launch: a half-written lap file and a missing one are left out, not fatal', 'first-launch', { has: ['runs/half.recording.json: does NOT verify', 'runs/none.recording.json: does NOT verify'] });
expect('first launch: the FASTER lap is carried forward although the slower one was listed first', 'first-launch',
  { has: [`best lap 21.907 s (${L0})`, 'round 1: from rl/checkpoints/base.pt, towards 21.907 s', new RegExp(`laps_bc\\.py desert4 ${ck}-bc\\.tmp\\.npz ${L0.replaceAll('.', '\\.')}\\n`)] });

// ---- examples ------------------------------------------------------------------------------------
expect('shut down while the examples were being written (only the .tmp.npz exists): they are made again', 'examples-cut', { has: ['laps_bc.py desert4'], not: ['1 examples: done'] });

// ---- practice ---------------------------------------------------------------------------------------
expect('examples exist, practice not recorded as begun: the base is copied (again) and one leg covers all 1220 updates', 'before-practice',
  { has: ['1 examples: done', `cp ${BASE} ${ck}.pt`, '(1000000 steps); 1220 updates of 2048 decisions', '0 of 1220 updates done, 1220 left', '--total-steps 2498560 --lr 0.00005 --lr-end 0 --critic-warmup 30'] });
expect('the practice command has the options of train_block_specialist_from.sh as search_round.sh calls it', 'before-practice',
  { has: ['python -u rl/train_ppo.py --track desert4 --envs 8 ', ' --block 5 --device cuda --no-lap-fraction --resume --checkpoint rl/checkpoints/g1-3-desert4-r1.pt ',
    ' --random-start 0.5 --failure-start 0.3 --own-start 0.5 --gamma 0.995 --gae-lambda 0.9 ', ' --max-off-line 40 ', ` --bc-data ${ck}-bc.npz --bc-coef 0.05 --bc-coef-end 0.05 `, ' --keep-every 200 '] });
expect('the practice checkpoint is never a ppo_* name', 'before-practice', { not: [/--checkpoint rl\/checkpoints\/ppo_/] });
expect('interrupted at update 20, inside the 30-update critic warm-up: 1200 left at 5e-5 x 1200/1220, and the 10 warm-up updates still owed', 'practice-20',
  { has: ['20 of 1220 updates done, 1200 left', '--total-steps 2457600 --lr 0.0000491803 --lr-end 0 --critic-warmup 10'], not: [`cp ${BASE}`] });
expect('interrupted at update 400: the 820 left, learning rate 5e-5 x 820/1220, no warm-up', 'practice-400',
  { has: ['400 of 1220 updates done, 820 left (interrupted; continuing, not starting again)', '--total-steps 1679360 --lr 0.0000336066 --lr-end 0 --critic-warmup 0'] });
expect('interrupted at update 400: the base is NOT copied over the checkpoint', 'practice-400', { not: [`cp ${BASE}`] });
expect('interrupted at update 400: the trainer\'s u200 copy is renamed c200; update 400 (before 60% of the round) is not kept for testing', 'practice-400',
  { has: [`mv ${ck}.u200.pt ${ck}.c200.pt`], not: [`${ck}.c400.pt`] });
expect('second interruption, at update 900: the second leg\'s u200/u400 are the round\'s updates 600/800 and are renamed so', 'practice-900',
  { has: [`mv ${ck}.u200.pt ${ck}.c600.pt`, `mv ${ck}.u400.pt ${ck}.c800.pt`], not: [`${ck}.c400.pt`] });
expect('interrupted at update 900 (past 60%): the checkpoint as it stands is kept as c900', 'practice-900', { has: [`cp ${ck}.pt ${ck}.c900.pt`, '900 of 1220 updates done, 320 left'] });
expect('with minutes=10: a leg of 210 updates (7 min x 30) from 5e-5 x 320/1220 to 5e-5 x 110/1220', 'practice-900',
  { has: ['leg of 210 updates', '--total-steps 430080 --lr 0.0000131148 --lr-end 0.0000045082 --critic-warmup 0'] });
expect('interrupted at update 730 (60% of 1220 is 732): not kept for testing', 'practice-730', { has: ['730 of 1220 updates done, 490 left', '--total-steps 1003520'], not: [`${ck}.c730.pt`] });
expect('with minutes=3 no leg is started and the launch asks to be run again (exit code 3)', 'practice-730 minutes=3', { has: ['not enough of this launch left for a useful leg of practice', 'launch again to continue'], not: ['train_ppo.py --track'], code: 3 });
expect('practice recorded as begun but the checkpoint is gone: an error, not a silent restart from the base', 'checkpoint-gone', { has: ['is gone'], not: [`cp ${BASE}`, 'train_ppo.py --track'], code: 1 });

// ---- testing ------------------------------------------------------------------------------------------
expect('practice complete: no more practice; the end of practice is kept as c1220', 'testing-cut', { has: ['2 practice: done (1220 updates)', `cp ${ck}.pt ${ck}.c1220.pt`], not: ['train_ppo.py --track'] });
expect('testing interrupted: c800..c1220 are the copies (c600 is before 60%); 32 of 44 attempts have a result', 'testing-cut', { has: ['3 test: copies c800, c1000, c1200, c1220; 32 of 44 attempts have a result, 12 to run'] });
expect('testing interrupted: the cut-off attempt is run again', 'testing-cut', { has: [`--checkpoint ${ck}.c1200.pt --policy sample --seed 13 --run g1-3-t-r1-c1200-sample13 > `] });
check('testing interrupted: exactly the 12 missing attempts are run (1 cut off + 11 of c1220); an attempt that did not finish is not repeated',
  (D['testing-cut'].out.match(/evaluate\.py --track/g) ?? []).length === 12 && (D['testing-cut'].out.match(/c1220\.pt --policy/g) ?? []).length === 11 && !/c800\.pt --policy/.test(D['testing-cut'].out) && !/c1000\.pt --policy/.test(D['testing-cut'].out), D['testing-cut'].out);
expect('the test command is search_round.sh\'s: --max-off-line 40, sampled seeds 10..19 and top choices with seed 0', 'testing-cut',
  { has: [`rl/evaluate.py --track desert4 --max-off-line 40 --checkpoint ${ck}.c1220.pt --policy sample --seed 10 `, '--policy sample --seed 19 ', `--checkpoint ${ck}.c1220.pt --policy greedy --seed 0 `], not: ['--policy sample --seed 20', '--policy sample --seed 9 '] });

// ---- pick ---------------------------------------------------------------------------------------------
expect('tests complete: nothing is tested again', 'tested', { has: ['3 test: done (44 attempts on copies c800, c1000, c1200, c1220)'], not: ['evaluate.py --track'] });
expect('the test table is read as written (finishes, fastest, three fastest, top choices)', 'tested',
  { has: [/c800\s+10\/10\s+22\.000\s+22\.010\s+22\.050/, /c1000\s+7\/10\s+21\.900\s+21\.900\s+did not finish/, /c1200\s+9\/10\s+22\.004\s+22\.006\s+22\.001/, /c1220\s+10\/10\s+22\.010\s+22\.014\s+22\.002/] });
expect('pick: c1000 (fastest, 7 of 10) is set aside by the gate; of the three within 10 ms, c800 wins on finishes then score', 'tested', { has: ['picked c800:'] });
expect('three searches of 200 s from the picked copy, each with its own seed and file', 'tested',
  { has: [`rl/export_actor.py ${ck}.c800.pt`, `node scripts/search_rollout.mjs desert4 actor=${ck}.c800.actor.bin seconds=200 passes=1 workers=8 rngSeed=101 out=g1-3-r1s1 > `, 'rngSeed=102 out=g1-3-r1s2 > ', 'rngSeed=103 out=g1-3-r1s3 > '], not: ['6 conclude:'] });
expect('pick=best searches=1 searchSeconds=600: the shell script\'s pick (c1000, 21.900 s) and one 600 s search', 'tested pick=best',
  { has: ['picked c1000: fastest single sampled lap (21.900 s)', `actor=${ck}.c1000.actor.bin seconds=600 passes=1 workers=8 rngSeed=101 out=g1-3-r1s1 > `], not: ['out=g1-3-r1s2'] });
expect('a copy picked before the shutdown stays picked, and only the copies tested then count', 'picked-earlier',
  { has: ['3 test: done (22 attempts on copies c1000, c1200)', 'picked earlier: c1200', `actor=${ck}.c1200.actor.bin`], not: ['evaluate.py --track', 'picked c1000', 'c800.actor.bin'] });
expect('no copy finished a sampled lap: the round fails and the track stops (no search, no round 2)', 'none-finish',
  { has: ['no copy finished a sampled lap', 'desert4 has stopped: round 1: no kept copy finished a lap in testing'], not: ['search_rollout.mjs desert4', 'round 2'] });

// ---- search ---------------------------------------------------------------------------------------------
expect('search recorded in the state is not looked at again; a lap on disk that verifies is done', 'search-mixed',
  { has: ['5 search 2: done, 21.913 s, verified'], not: ['5 search 1:', 'out=g1-3-r1s1 ', 'out=g1-3-r1s2 '] });
expect('a search with a log and a lap that does not verify (one tick too few) is run again, with its own seed', 'search-mixed',
  { has: ['5 search 3: was started but left no verified lap (interrupted): run it again from the start', 'rngSeed=103 out=g1-3-r1s3 > '] });
expect('the round is not concluded while a search is still to run', 'search-mixed', { not: ['6 conclude:', 'round 2'] });

// ---- conclude ---------------------------------------------------------------------------------------------
expect('round complete with a SLOWER lap (21.913 against 21.907): gain -6, one strike, 21.907 stays the best', 'conclude-slower',
  { has: ['searched to 21.913 s against 21.907 s before: gain -6 ms, did not pay (needs 10 ms)', `best lap stays 21.907 s (${L0})`, '1 of 2 rounds in a row that did not pay'] });
expect('... round 2 starts from the picked copy and trains towards the older, faster lap', 'conclude-slower',
  { has: [`round 2: from ${ck}.c800.pt, towards 21.907 s`, new RegExp(`laps_bc\\.py desert4 rl/checkpoints/g1-3-desert4-r2-bc\\.tmp\\.npz ${L0.replaceAll('.', '\\.')}\\n`)] });
expect('rounds=1 is a total: the target is reached, no round 2', 'conclude-slower rounds=1', { has: ['1 round(s) complete, the target. Best lap 21.907 s'], not: ['round 2'] });
expect('a second round in a row that does not pay stops the track, whatever rounds= says', 'conclude-second-strike',
  { has: ['2 rounds in a row gained less than 10 ms (after round 1): stopping', 'desert4 has stopped'], not: ['round 2'] });
expect('three searches (21.950, 21.913, 21.907): the fastest is the round\'s lap; a gain of exactly minGain pays', 'conclude-faster minGain=6',
  { has: ['5 search 2: done, 21.913 s', '5 search 3: done, 21.907 s', 'searched to 21.907 s against 21.913 s before: gain 6 ms, paid', `best lap is now 21.907 s (${P.searchLap(3)})`] });
expect('... round 2 trains towards the new lap; extraLaps=2 adds the two next fastest within 50 ms', 'conclude-faster minGain=6',
  { has: [`round 2: from ${ck}.c800.pt, towards 21.907 s`, `r2-bc.tmp.npz ${P.searchLap(3)} ${L1} ${P.searchLap(2)}\n`] });
expect('a faster lap that gained less than minGain does not pay, but IS carried forward as the best lap', 'conclude-faster minGain=7',
  { has: ['gain 6 ms, did not pay (needs 7 ms)', `best lap is now 21.907 s (${P.searchLap(3)})`, '1 of 2 rounds in a row that did not pay', `r2-bc.tmp.npz ${P.searchLap(3)}\n`] });

// ---- nothing left to do --------------------------------------------------------------------------------------
expect('a stopped track does nothing more, whatever rounds= says', 'stopped', { has: ['desert4 has stopped: round 1: no kept copy finished a lap in testing'], not: ['round 1: from', 'round 2'] });
expect('target reached: nothing to do', 'target-reached', { has: ['1 round(s) complete, the target'], not: ['round 2', 'round 1: from'] });

// ---- a dry run changes nothing ---------------------------------------------------------------------------------
const changed = drives.filter((d) => d.root && !d.unchanged).map((d) => d.name);
check(`a dry run changes no file: ${drives.filter((d) => d.root).length} runs, each folder hashed (names and contents) before and after`, changed.length === 0, `changed: ${changed.join(', ')}`);
if (D['real project']) {
  expect('dry run on the real project (the README\'s command, a tag of its own): plans round 1 from the real checkpoint and lap', 'real project',
    { has: [`${L0}: 21.907 s, verified`, 'laps_bc.py desert4 rl/checkpoints/g1-3-tstdry-desert4-r1-bc.tmp.npz', 'DRY RUN ends here'] });
}
check('after all runs: no g1-3 file was added to or removed from the real rl/checkpoints/ and runs/', realNames() === realBefore);
check('after all runs: the idea folder outside tests/ (work/, results/, the code) is byte for byte as before', ideaHash() === ideaBefore);

if (!process.argv.includes('keep=1')) rmSync(SCRATCH, { recursive: true, force: true });
finish();
