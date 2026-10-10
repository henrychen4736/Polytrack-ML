// The two Python scripts the driver runs: ckpt_steps.py and laps_bc.py.
//
// ckpt_steps.py is given stand-in checkpoints with known step counters.
// laps_bc.py is run for real (one simulator, a few seconds, CPU) on the two
// real searched laps of desert4, which it only reads; its output goes to
// tests/scratch/. Its examples are compared with
//   - the file rl/lap_bc.py wrote from the same lap (the README's claim), and
//   - the lap's own decisions, worked out here from its keys with
//     ideas/shared/laps.mjs (independent of the environment's labelling code).
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, rmdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLap, keysToDecisions } from '../../shared/laps.mjs';
import { IDEA_DIR } from '../lib.mjs';
import { check, same, finish } from './harness.mjs';

const PROJECT = fileURLToPath(new URL('../../../', import.meta.url));
const PY = join(PROJECT, '.venv/Scripts/python.exe');
const SCRATCH = `${IDEA_DIR}/tests/scratch/python`;
rmSync(join(PROJECT, SCRATCH), { recursive: true, force: true });
mkdirSync(join(PROJECT, SCRATCH), { recursive: true });
const py = (...args) => spawnSync(PY, args, { cwd: PROJECT, encoding: 'utf8' });

// ---- ckpt_steps.py ------------------------------------------------------------------
{
  const a = join(PROJECT, SCRATCH, 'a.pt'), b = join(PROJECT, SCRATCH, 'b.pt');
  writeFileSync(join(PROJECT, SCRATCH, 'list.json'), JSON.stringify({ [a]: 107726848, [b]: 0 }));
  const made = py(`${IDEA_DIR}/tests/make_ckpts.py`, join(PROJECT, SCRATCH, 'list.json'));
  const r = py(`${IDEA_DIR}/ckpt_steps.py`, a, b);
  let got = null;
  try { got = JSON.parse(r.stdout.trim().split('\n').at(-1)); } catch { /* reported below */ }
  same('ckpt_steps.py: prints each file\'s step counter under the path it was given', got, { [a]: 107726848, [b]: 0 });
  check('ckpt_steps.py: a file that is not a checkpoint is an error (non-zero exit), not a guess', made.status === 0 && py(`${IDEA_DIR}/ckpt_steps.py`, join(PROJECT, SCRATCH, 'list.json')).status !== 0);
}

// ---- laps_bc.py ------------------------------------------------------------------------
const L0 = 'runs/rollout_desert4.recording.json', L1 = 'runs/rollout_r1_desert4.recording.json';
const REF = 'rl/checkpoints/bc_search_r1_desert4.npz'; // written by rl/lap_bc.py from L0 in round 1
{
  const one = py(`${IDEA_DIR}/laps_bc.py`, 'desert4', `${SCRATCH}/one.npz`, L0);
  const three = py(`${IDEA_DIR}/laps_bc.py`, 'desert4', `${SCRATCH}/three.npz`, L0, L1, L1);
  check('laps_bc.py: runs on one lap and on three', one.status === 0 && three.status === 0, `${one.stderr}\n${three.stderr}`);
  check('laps_bc.py: no arguments -> usage, non-zero exit, nothing started', py(`${IDEA_DIR}/laps_bc.py`, 'desert4', `${SCRATCH}/none.npz`).status !== 0 && !existsSync(join(PROJECT, SCRATCH, 'none.npz')));
  const facts = py(`${IDEA_DIR}/tests/npz_check.py`, `${SCRATCH}/one.npz`, `${SCRATCH}/three.npz`, existsSync(join(PROJECT, REF)) ? REF : `${SCRATCH}/one.npz`);
  let f = {};
  try { f = JSON.parse(facts.stdout.trim().split('\n').at(-1)); } catch { check('npz_check.py ran', false, facts.stderr); }
  // A 21907-tick lap: one empty tick, then whole 50-tick blocks that end at or before the last key: floor((21907 - 1) / 50) = 438.
  check('laps_bc.py: the 21.907 s lap gives 438 examples of 352 inputs', f.n === 438 && JSON.stringify(f.obs_shape) === '[438,352]', JSON.stringify(f.obs_shape));
  check('laps_bc.py: stored as float16 inputs and uint8 decisions, the layout train_ppo.py --bc-data reads', JSON.stringify(f.dtypes) === '["float16","uint8"]', JSON.stringify(f.dtypes));
  check('laps_bc.py: the previous-keys inputs (15, 16, 144) are hidden', f.previous_keys_hidden === true);
  if (existsSync(join(PROJECT, REF))) check('laps_bc.py: with one lap the arrays are identical to what rl/lap_bc.py wrote from the same lap (bc_search_r1_desert4.npz)', f.same_as_reference === true);

  // The labels against the lap's own decisions. The searched lap was built
  // from block decisions, so its keys convert back without a wrong tick, and
  // every example's three targets (steer, W, S) must be that decision's.
  const { decisions, wrongTicks } = keysToDecisions(loadLap(L0).keys);
  const targets = (rows) => rows.map((d) => [d[0], d[2], d[4]].join('')).join(' ');
  check('laps_bc.py: every example\'s steer / W / S target is the lap\'s own decision at that block (438 of 438)',
    wrongTicks === 0 && f.actions?.length === 438 && targets(f.actions) === targets(decisions.slice(0, 438)),
    () => `wrong ticks ${wrongTicks}; first difference at ${f.actions?.findIndex((a, i) => [a[0], a[2], a[4]].join() !== [decisions[i][0], decisions[i][2], decisions[i][4]].join())}`);
  // Switch slices: where a control changes, the slice must match too (where it does not change, the label is 5 = "no change").
  let sliceWrong = 0, before = [0, 0, 0];
  (f.actions ?? []).forEach((a, i) => {
    [0, 1, 2].forEach((c) => {
      const changed = a[2 * c] !== before[c];
      if (changed ? a[2 * c + 1] !== decisions[i][2 * c + 1] : a[2 * c + 1] !== 5) sliceWrong++;
    });
    before = [a[0], a[2], a[4]];
  });
  check('laps_bc.py: the switch slice is the decision\'s where a control changes and 5 ("no change") where it does not', f.actions?.length === 438 && sliceWrong === 0, `${sliceWrong} wrong`);

  check('laps_bc.py: three laps -> the first lap twice, then the two others (4 x 438 rows here)', f.three_n === 4 * 438 && f.three_obs_rows === f.three_n && f.three_first_twice === true && f.three_rest_is_two_equal_laps === true && f.three_rest_differs_from_first === true, JSON.stringify({ ...f, actions: undefined }));
  check('laps_bc.py: the first lap is at least half of the examples', 2 * 438 * 2 >= f.three_n);
  check('laps_bc.py: its printed total is the number of rows written', three.stdout.includes(`${f.three_n} examples from 3 lap(s)`), three.stdout);
}
rmSync(join(PROJECT, SCRATCH), { recursive: true, force: true });
try { rmdirSync(join(PROJECT, `${IDEA_DIR}/tests/scratch`)); } catch { /* not empty: another test's files */ }
finish();
