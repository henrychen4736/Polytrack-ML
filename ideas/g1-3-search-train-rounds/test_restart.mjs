// Test of the driver's decisions and its restart logic against the real
// round-1 data on disk.
//
//   node ideas/g1-3-search-train-rounds/test_restart.mjs
//
// Round 1 was run by scripts/search_round.sh, which names its files
// differently from this driver. Each scenario below therefore builds a small
// folder (test_tmp/<scenario>/) holding COPIES of the real round-1 files under
// the names the driver would have given them, arranged as they would be if
// the machine had been shut down at a particular moment. The driver is then
// run on that folder with dry=1 root=<folder>, and its printed decisions and
// commands are checked.
//
// What this does and does not prove: the driver reads real checkpoints, real
// test output, real search logs and real laps (which it really verifies), and
// decides. It does not prove that the commands it prints work when run; for
// that see smoke_real.mjs and the README.
//
// Light: no training, no search; one simulator at a time for Verify and a
// CPU-only Python to read step counters. About one minute. test_tmp/ is
// removed at the end unless keep=1 is given.
import { spawnSync } from 'node:child_process';
import { mkdirSync, copyFileSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { paths, parseAttempt, summariseCopy, pickCopy, copiesToTest, trainPlan, concludeRound, chooseExamples, parseSearchLog } from './lib.mjs';

const PROJECT = fileURLToPath(new URL('../../', import.meta.url));
const TMP = fileURLToPath(new URL('./test_tmp/', import.meta.url));
const keep = process.argv.includes('keep=1');
rmSync(TMP, { recursive: true, force: true });

let passed = 0, failed = 0;
function check(what, ok, detail = '') {
  if (ok) passed++; else failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !detail ? '' : `\n       ${detail}`}`);
}

// ---- 1. the decision functions on the real round-1 test output ---------------------
console.log('--- decisions on the round-1 data ---');
const legacyRows = (track) => ['u800', 'u1000', 'u1200', 'final'].map((copy) => {
  const attempts = [];
  for (let seed = 10; seed < 20; seed++) attempts.push({ policy: 'sample', ...parseAttempt(readFileSync(join(PROJECT, `runs/search_round/${track}.r1.${copy}.sample.${seed}.txt`), 'utf8')) });
  attempts.push({ policy: 'greedy', ...parseAttempt(readFileSync(join(PROJECT, `runs/search_round/${track}.r1.${copy}.greedy.0.txt`), 'utf8')) });
  return summariseCopy(copy, attempts);
});
// What search_round.sh printed and picked in round 1 (its rule is pick=best).
const round1 = { desert4: ['u800', 22001, 'u1000'], summer1: ['u1000', 22481, 'u1000'], summer4: ['u1000', 34741, 'u1000'], winter2: ['u1000', 27172, 'u1000'] };
for (const [track, [stock, stockTime, mine]] of Object.entries(round1)) {
  const rows = legacyRows(track);
  const best = pickCopy(rows, { pick: 'best' });
  check(`${track}: rule "best" picks what search_round.sh picked (${stock}, ${stockTime} ms)`, best.copy === stock && best.row.best === stockTime, JSON.stringify(best));
  const top3 = pickCopy(rows);
  check(`${track}: rule "top3" picks ${mine}`, top3.copy === mine, top3.why);
}
const s4 = legacyRows('summer4');
check('summer4: finishes counted 8, 10, 9, 9 of ten', s4.map((r) => r.finishes).join() === '8,10,9,9');
check('summer4: with minFinishes=10 only u1000 is allowed', pickCopy(s4, { minFinishes: 10 }).copy === 'u1000');
check('no copy finished -> no pick', pickCopy([summariseCopy('a', [{ policy: 'sample', finished: false }])]) === null);
check('an attempt cut off mid-output has no result', parseAttempt('loaded x.pt (1 training steps)\n  10% at 5.45 s').done === false);
check('copies to test: 200..1200 and the end -> 800, 1000, 1200, 1220', copiesToTest([200, 400, 600, 800, 1000, 1200], 1220).join() === '800,1000,1200,1220');
const plan = trainPlan({ startSteps: 1000, steps: 1000 + 400 * 2048, updates: 1220, batch: 2048 });
check('practice interrupted at 400 of 1220: 820 left, learning rate 5e-5 * 820/1220, no second warm-up',
  plan.remaining === 820 && Math.abs(plan.lr - 5e-5 * 820 / 1220) < 1e-12 && plan.lrEnd === 0 && plan.warmup === 0 && plan.totalSteps === 820 * 2048, JSON.stringify(plan));
check('desert4 round 1 (21.907 -> 21.913): gain -6, does not pay, 1 strike, no stop yet',
  JSON.stringify(concludeRound({ bestFrames: 21907, lapFrames: 21913, strikes: 0 })) === JSON.stringify({ gain: -6, paid: false, strikes: 1, stop: false }));
check('a second such round stops the track', concludeRound({ bestFrames: 21907, lapFrames: 21905, strikes: 1 }).stop === true);
check('summer4 round 1 (34.689 -> 34.500): gain 189, pays, strikes cleared', (({ gain, paid, strikes }) => gain === 189 && paid && strikes === 0)(concludeRound({ bestFrames: 34689, lapFrames: 34500, strikes: 1 })));
const three = [{ file: 'a', frames: 21913 }, { file: 'b', frames: 21907 }, { file: 'c', frames: 22000 }];
check('examples: the fastest lap of any round, alone by default', chooseExamples(three).map((l) => l.file).join() === 'b');
check('examples: extraLaps=2 adds only laps within 50 ms', chooseExamples(three, { extraLaps: 2, extraWithin: 50 }).map((l) => l.file).join() === 'b,a');
// (Changed by the tester, 2026-10-10.) This used to read winter2's real
// round-1 log as the example of an interrupted search. That search was run
// again at 02:09 today and its log is now complete (27.241 -> 27.020 s), so
// the check failed with no change to the code. An interrupted log is now
// made from desert4's complete one by cutting it off before its summary.
const fullText = readFileSync(join(PROJECT, 'runs/rollout_r1_desert4.log'), 'utf8');
const cutLog = parseSearchLog(fullText.slice(0, fullText.indexOf('\ntried ')));
const fullLog = parseSearchLog(fullText);
check('a search log cut off before its summary is recognised as interrupted, desert4\'s whole log as complete (22.035 -> 21.913)',
  !cutLog.complete && fullLog.complete && fullLog.ownFrames === 22035 && fullLog.finalFrames === 21913);

// ---- 2. restart scenarios ------------------------------------------------------------
console.log('\n--- restart scenarios (driver run with dry=1 on copies of the round-1 files) ---');
/** Copy a project file into a scenario folder under the driver's name for it. */
function put(root, from, to) {
  mkdirSync(dirname(join(root, to)), { recursive: true });
  copyFileSync(join(PROJECT, from), join(root, to));
}
/** The step counter the round-1 practice started from, read from its log. */
const startSteps = (track) => Number(/resumed .* at (\d+) steps/.exec(readFileSync(join(PROJECT, `runs/rl_train_sr1_${track}.log`), 'utf8'))[1]);
const BASES = { desert4: 'ppo_gblk_desert4.final.pt', summer4: 'ppo_gblk_summer4.u2000.pt', winter2: 'ppo_gblk_winter2.u2000.pt' };

/**
 * A scenario folder: the state file as the driver leaves it once round 1's
 * practice has begun, and the round-0 lap. `stage` adds what exists by then:
 *   examples   the imitation file
 *   ckpt       which round-1 file stands in for the round's checkpoint ('u400', 'final', ...)
 *   trainer    trainer-named kept copies still to be renamed, e.g. ['u200']
 *   copies     kept copies already renamed, as { 800: 'u800', ... }
 *   tests      { 800: 'u800', ... }: test output present for those copies
 *   search     true: the finished round-1 search (lap and log); 'cut': only its log
 */
function scenario(name, track, stage, stateEdits = {}) {
  const root = join(TMP, name);
  const p = paths(track, 1);
  const lap0 = `runs/rollout_${track}.recording.json`;
  const frames0 = JSON.parse(readFileSync(join(PROJECT, lap0), 'utf8')).frames;
  put(root, lap0, lap0);
  put(root, `rl/checkpoints/${BASES[track]}`, `rl/checkpoints/${BASES[track]}`);
  if (stage.state !== false) {
    const state = {
      track, best: { file: lap0, frames: frames0, round: 0 }, laps: [{ file: lap0, frames: frames0, round: 0 }],
      base: `rl/checkpoints/${BASES[track]}`, strikes: 0, stopped: null,
      rounds: [{ n: 1, base: `rl/checkpoints/${BASES[track]}`, startLap: { file: lap0, frames: frames0 }, exampleLaps: [lap0], done: false,
        ...(stage.ckpt ? { train: { startSteps: startSteps(track), updates: 1220, batch: 2048 } } : {}) }],
      ...stateEdits,
    };
    mkdirSync(join(root, p.work), { recursive: true });
    writeFileSync(join(root, p.state), JSON.stringify(state, null, 2));
  }
  const sr1 = (copy) => `rl/checkpoints/ppo_sr1_${track}${copy === 'last' ? '' : `.${copy}`}.pt`;
  if (stage.examples) put(root, `rl/checkpoints/bc_search_r1_${track}.npz`, p.examples);
  if (stage.ckpt) put(root, sr1(stage.ckpt), p.checkpoint);
  for (const u of stage.trainer ?? []) put(root, sr1(u), p.checkpoint.replace(/\.pt$/, `.${u}.pt`));
  for (const [k, u] of Object.entries(stage.copies ?? {})) put(root, sr1(u), p.copy(k));
  for (const [k, u] of Object.entries(stage.tests ?? {})) {
    for (let seed = 10; seed < 20; seed++) put(root, `runs/search_round/${track}.r1.${u}.sample.${seed}.txt`, p.testOut(k, 'sample', seed));
    put(root, `runs/search_round/${track}.r1.${u}.greedy.0.txt`, p.testOut(k, 'greedy', 0));
  }
  if (stage.search) put(root, `runs/rollout_r1_${track}.log`, p.searchLog(1));
  if (stage.search === true) put(root, `runs/rollout_r1_${track}.recording.json`, p.searchLap(1));
  return root;
}
/** Run the driver dry on a scenario; returns what it printed. */
function drive(root, track, ...settings) {
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('./rounds.mjs', import.meta.url)), track, 'dry=1', `root=${root}`, ...settings], { cwd: PROJECT, encoding: 'utf8' });
  return r.stdout + r.stderr;
}
const expect = (what, out, ...patterns) => {
  const missing = patterns.filter((p) => !(p instanceof RegExp ? p.test(out) : out.includes(p)));
  check(what, !missing.length, `missing: ${missing.join(' | ')}\n${out.split('\n').map((l) => `       > ${l}`).join('\n')}`);
};
const ALL = { 800: 'u800', 1000: 'u1000', 1200: 'u1200', 1220: 'final' };
const COPIES = { 800: 'u800', 1000: 'u1000', 1200: 'u1200', 1220: 'last' };
let out;

// A. Nothing yet; two laps offered, the SLOWER one being the later round's.
{
  const root = scenario('A-first-launch', 'desert4', { state: false });
  put(root, 'runs/rollout_r1_desert4.recording.json', 'runs/rollout_r1_desert4.recording.json');
  out = drive(root, 'desert4', 'base=rl/checkpoints/ppo_gblk_desert4.final.pt', 'lap=runs/rollout_r1_desert4.recording.json,runs/rollout_desert4.recording.json');
  expect('A first launch: both laps verified, the faster (round 0, 21.907 s) is the one trained towards', out,
    'runs/rollout_r1_desert4.recording.json: 21.913 s, verified', 'best lap 21.907 s (runs/rollout_desert4.recording.json)',
    /laps_bc\.py desert4 rl\/checkpoints\/g1-3-desert4-r1-bc\.tmp\.npz runs\/rollout_desert4\.recording\.json\n/);
}
// B. Shut down before practice began.
out = drive(scenario('B-before-practice', 'desert4', { examples: true }), 'desert4');
expect('B examples exist, practice not begun: copy the base, one leg of all 1220 updates with the warm-up', out,
  '1 examples: done', 'cp rl/checkpoints/ppo_gblk_desert4.final.pt rl/checkpoints/g1-3-desert4-r1.pt', `(${startSteps('desert4')} steps)`,
  '--total-steps 2498560 --lr 0.00005 --lr-end 0 --critic-warmup 30');
// C. Shut down 400 updates into practice, one trainer-named copy lying about.
{
  const root = scenario('C-practice-400', 'desert4', { examples: true, ckpt: 'u400', trainer: ['u200'] });
  out = drive(root, 'desert4');
  expect('C practice interrupted at update 400: continue with the 820 left, not from the start', out,
    'kept copy rl/checkpoints/g1-3-desert4-r1.u200.pt is the round\'s update 200', 'mv rl/checkpoints/g1-3-desert4-r1.u200.pt rl/checkpoints/g1-3-desert4-r1.c200.pt',
    '400 of 1220 updates done, 820 left', '--total-steps 1679360 --lr 0.0000336066 --lr-end 0 --critic-warmup 0', '--resume --checkpoint rl/checkpoints/g1-3-desert4-r1.pt');
  check('C no command copies the base over the interrupted checkpoint', !/\$ cp rl\/checkpoints\/ppo_gblk/.test(out));
  out = drive(root, 'desert4', 'minutes=20');
  expect('C with 20 minutes: a leg of 510 updates whose learning rate ends where the next leg starts', out,
    'leg of 510 updates', '--total-steps 1044480 --lr 0.0000336066 --lr-end 0.0000127049 --critic-warmup 0');
  out = drive(root, 'desert4', 'minutes=3');
  expect('C with 3 minutes: no leg is started', out, 'not enough of this launch left for a useful leg of practice');
}
// D. Shut down at update 1000: late enough for the interrupted checkpoint to be kept for testing.
out = drive(scenario('D-practice-1000', 'desert4', { examples: true, ckpt: 'u1000', copies: { 800: 'u800' } }), 'desert4');
expect('D practice interrupted at update 1000: the checkpoint is kept as copy c1000 before continuing', out,
  '1000 of 1220 updates done, 220 left', 'cp rl/checkpoints/g1-3-desert4-r1.pt rl/checkpoints/g1-3-desert4-r1.c1000.pt', '--total-steps 450560');
// E. Practice complete, shut down during testing: two copies tested, one attempt of the third cut off.
{
  const root = scenario('E-testing', 'desert4', { examples: true, ckpt: 'last', copies: { 800: 'u800', 1000: 'u1000', 1200: 'u1200' }, tests: { 800: 'u800', 1000: 'u1000', 1200: 'u1200' } });
  const cut = join(root, paths('desert4', 1).testOut(1200, 'sample', 13));
  writeFileSync(cut, readFileSync(cut, 'utf8').split('\n').slice(0, 4).join('\n'));
  out = drive(root, 'desert4');
  expect('E testing interrupted: practice is seen as done, the end copy is made, only the 12 missing attempts are run', out,
    '2 practice: done (1220 updates)', 'cp rl/checkpoints/g1-3-desert4-r1.pt rl/checkpoints/g1-3-desert4-r1.c1220.pt',
    '32 of 44 attempts have a result, 12 to run', '--checkpoint rl/checkpoints/g1-3-desert4-r1.c1200.pt --policy sample --seed 13 --run g1-3-t-r1-c1200-sample13');
  check('E attempts that already have a result are not run again', !out.includes('--run g1-3-t-r1-c800-') && (out.match(/evaluate\.py --track/g) ?? []).length === 12);
}
// F. Testing complete, search not started.
{
  const root = scenario('F-tested', 'desert4', { examples: true, ckpt: 'last', copies: COPIES, tests: ALL });
  out = drive(root, 'desert4');
  expect('F tests complete: copy c1000 picked, three searches of 200 s with their own seeds from it', out,
    '3 test: done (44 attempts on copies c800, c1000, c1200, c1220)', 'picked c1000', 'rl/export_actor.py rl/checkpoints/g1-3-desert4-r1.c1000.pt',
    'actor=rl/checkpoints/g1-3-desert4-r1.c1000.actor.bin seconds=200 passes=1 workers=8 rngSeed=101 out=g1-3-r1s1', 'rngSeed=103 out=g1-3-r1s3');
  out = drive(root, 'desert4', 'pick=best', 'searches=1', 'searchSeconds=600');
  expect('F with pick=best searches=1 searchSeconds=600: search_round.sh\'s own choice and search', out, 'picked c800: fastest single sampled lap (22.001 s)', 'c800.actor.bin seconds=600');
}
// G. Shut down during the search: winter2's real round 1, whose search log stops at 502 s and left no lap.
out = drive(scenario('G-search-cut', 'winter2', { examples: true, ckpt: 'last', copies: COPIES, tests: ALL, search: 'cut' }), 'winter2', 'searches=1');
expect('G search interrupted (winter2 round 1): the search is run again from the start', out,
  'picked c1000', '5 search 1: was started but left no verified lap (interrupted): run it again from the start', 'out=g1-3-r1s1 > ');
// H. A lap file whose claimed time is wrong must not be accepted.
{
  const root = scenario('H-bad-lap', 'desert4', { examples: true, ckpt: 'last', copies: COPIES, tests: ALL, search: true });
  const file = join(root, paths('desert4', 1).searchLap(1));
  const lap = JSON.parse(readFileSync(file, 'utf8'));
  writeFileSync(file, JSON.stringify({ ...lap, frames: lap.frames - 1 }));
  out = drive(root, 'desert4', 'searches=1');
  expect('H a search lap claiming one tick less than the game finishes it in is not accepted', out, 'left no verified lap');
}
// I. Round 1 complete on desert4, where the searched lap (21.913 s) is slower than the one before (21.907 s).
{
  const root = scenario('I-desert4-done', 'desert4', { examples: true, ckpt: 'last', copies: COPIES, tests: ALL, search: true });
  out = drive(root, 'desert4', 'searches=1', 'rounds=2');
  expect('I desert4 round 1 complete: gain -6 ms, the older, faster lap is carried forward into round 2', out,
    '5 search 1: done, 21.913 s, verified', 'searched to 21.913 s against 21.907 s before: gain -6 ms, did not pay',
    'best lap stays 21.907 s (runs/rollout_desert4.recording.json)', '1 of 2 rounds in a row that did not pay',
    'round 2: from rl/checkpoints/g1-3-desert4-r1.c1000.pt, towards 21.907 s',
    /laps_bc\.py desert4 rl\/checkpoints\/g1-3-desert4-r2-bc\.tmp\.npz runs\/rollout_desert4\.recording\.json\n/);
  out = drive(root, 'desert4', 'searches=1', 'rounds=1');
  expect('I with rounds=1: stops at the target without planning round 2', out, '1 round(s) complete, the target');
  check('I with rounds=1: no round 2', !out.includes('round 2'));
  out = drive(root, 'desert4', 'searches=1', 'rounds=2', 'extraLaps=1');
  expect('I with extraLaps=1: round 2 trains towards the best lap and the round-1 lap (6 ms slower)', out,
    'r2-bc.tmp.npz runs/rollout_desert4.recording.json runs/g1-3-r1s1_desert4.recording.json');
  out = drive(scenario('I2-desert4-second-strike', 'desert4', { examples: true, ckpt: 'last', copies: COPIES, tests: ALL, search: true }, { strikes: 1 }), 'desert4', 'searches=1', 'rounds=5');
  expect('I after an earlier round that did not pay: the track stops, no round 2', out, '2 rounds in a row gained less than 10 ms (after round 1): stopping', 'desert4 has stopped');
  check('I stopped: no round 2', !out.includes('round 2'));
}
// J. Round 1 complete on summer4, which gained 189 ms.
out = drive(scenario('J-summer4-done', 'summer4', { examples: true, ckpt: 'last', copies: COPIES, tests: ALL, search: true }), 'summer4', 'searches=1', 'rounds=2');
expect('J summer4 round 1 complete: gain 189 ms, the new lap becomes the best and round 2 trains towards it', out,
  'searched to 34.500 s against 34.689 s before: gain 189 ms, paid', 'best lap is now 34.500 s (runs/g1-3-r1s1_summer4.recording.json)',
  'round 2: from rl/checkpoints/g1-3-summer4-r1.c1000.pt, towards 34.500 s', 'r2-bc.tmp.npz runs/g1-3-r1s1_summer4.recording.json');
// K. A dry run writes nothing.
{
  const listing = (dir) => (existsSync(dir) ? readdirSync(dir, { recursive: true }).sort().join('\n') : '');
  const root = join(TMP, 'J-summer4-done');
  const before = listing(root), stateBefore = readFileSync(join(root, paths('summer4', 1).state), 'utf8');
  drive(root, 'summer4', 'searches=1', 'rounds=2');
  check('K a dry run adds, renames and changes no file', listing(root) === before && readFileSync(join(root, paths('summer4', 1).state), 'utf8') === stateBefore);
}

if (!keep) rmSync(TMP, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
