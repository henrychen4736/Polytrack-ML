// calibrate.mjs as a command: one short run late in the lap (one process, a
// handful of states, rollouts of about one second of lap each). Its rank
// statistics are checked by hand-worked values in test_prune.mjs; here the
// script only has to run, repeat, and print a table that is consistent with
// itself.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { check, finish } from './harness.mjs';

const PROJECT = fileURLToPath(new URL('../../../', import.meta.url));
const run = () => {
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('../calibrate.mjs', import.meta.url)), 'desert4', 'at=420', 'n=6'], { cwd: PROJECT, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout + r.stderr).replaceAll('\r\n', '\n').split('\n').filter((l) => !/wasm streaming|falling back|rollouts to the finish in/.test(l)).join('\n') };
};
const a = run(), b = run();
check('calibrate.mjs at=420 n=6: runs to the end (exit code 0)', a.code === 0, a.out);
check('calibrate: starts from the policy\'s own 22.061 s lap', a.out.includes('the policy\'s own lap 22.061 s'));
const head = /start 420 decisions \(21\.0 s\) into the lap: (\d+) states, (\d+) finish, finish times ([\d.]+) \.\. ([\d.]+) s/.exec(a.out);
check('calibrate: at most the 6 states asked for, all at one start point, with their finish times', head != null && Number(head[1]) >= 2 && Number(head[1]) <= 6 && Number(head[2]) <= Number(head[1]) && Number(head[3]) <= Number(head[4]), a.out);
const rows = [...a.out.matchAll(/^ {2}(progress|value|look \d+|lookvalue \d+|\(finish time\))\s+(-?[\d.]+)\s+(-?\d+) ms$/gm)];
check('calibrate: one row per measure (progress, value, look and lookvalue at 5/10/20/40) and the finish time itself', rows.length === 11, `${rows.length} rows\n${a.out}`);
check('calibrate: every rank agreement lies in [-1, 1]', rows.length > 0 && rows.every((r) => Number(r[2]) >= -1 && Number(r[2]) <= 1));
{
  // Ranking by the finish time itself is the best any measure can do: its top
  // quarter is the fastest quarter, so no measure's top quarter can be faster.
  const perfect = rows.find((r) => r[1] === '(finish time)');
  check('calibrate: no measure\'s top quarter is faster than the true fastest quarter', perfect != null && Number(perfect[2]) === 1 && rows.every((r) => Number(r[3]) >= Number(perfect[3])), a.out);
}
check('calibrate: the same command twice prints the same table', a.out === b.out && a.out.length > 0, `${a.out}\n--- against ---\n${b.out}`);
finish();
