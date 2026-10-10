// The lock: one launch per track at a time.
//
// The lock is only taken by a real launch (a dry run takes none), so these
// are real launches, made harmless in two ways: they use a series of their
// own (tag=tstlock..., so their state and lock live in work/desert4-tstlock*/
// inside this idea's folder), and they can never get as far as a round,
// because they have no state and are given either no base= and lap= (the
// driver then stops with "the first launch needs ...") or only laps that do
// not verify ("none of the laps given verifies"). Both stops come before
// anything is written other than the lock file. As a second guard the
// launch with laps also gets minutes=1, with which the driver starts no
// practice.
//
// At most 1 simulator: the "holder" launch verifying its laps.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { paths, IDEA_DIR } from '../lib.mjs';
import { check, finish } from './harness.mjs';

const PROJECT = fileURLToPath(new URL('../../../', import.meta.url));
const DRIVER = join(PROJECT, IDEA_DIR, 'rounds.mjs');
const T = 'desert4';
const TAGS = ['tstlockA', 'tstlockB', 'tstlockC', 'tstlockD', 'tstlockE', 'tstlockF'];
const clean = () => { for (const tag of TAGS) rmSync(join(PROJECT, paths(T, 1, tag).work), { recursive: true, force: true }); };
clean();
const realNames = () => ['rl/checkpoints', 'runs'].map((d) => readdirSync(join(PROJECT, d)).filter((n) => n.includes('g1-3')).sort().join('|')).join('||');
const before = realNames();

const launch = (tag, ...args) => spawnSync(process.execPath, [DRIVER, T, `tag=${tag}`, ...args], { cwd: PROJECT, encoding: 'utf8' });
const lockFile = (tag) => join(PROJECT, paths(T, 1, tag).lock);
function writeLock(tag, lock) { mkdirSync(dirname(lockFile(tag)), { recursive: true }); writeFileSync(lockFile(tag), JSON.stringify(lock)); }
/** A process id that is certainly not running: one that has just ended. */
const deadPid = spawnSync(process.execPath, ['-e', '0']).pid;
const said = (r) => `exit ${r.status}\n${r.stdout}${r.stderr}`;

// A. A lock held by a live driver (this test process stands in for it).
{
  const lock = { pid: process.pid, child: null, time: Date.now() };
  writeLock(TAGS[0], lock);
  const r = launch(TAGS[0]);
  check('a lock held by a running driver: the second launch refuses with exit code 2', r.status === 2 && /is still running/.test(r.stderr) && r.stderr.includes('the driver'), said(r));
  check('... and leaves the holder\'s lock file exactly as it was', existsSync(lockFile(TAGS[0])) && readFileSync(lockFile(TAGS[0]), 'utf8') === JSON.stringify(lock));
  check('... and creates no state', !existsSync(join(PROJECT, paths(T, 1, TAGS[0]).state)));
  const dry = launch(TAGS[0], 'dry=1');
  check('a dry run next to a held lock still answers (it runs nothing), and does not touch the lock', dry.status === 1 && /first launch needs/.test(dry.stderr) && readFileSync(lockFile(TAGS[0]), 'utf8') === JSON.stringify(lock), said(dry));
}
// B. The driver is gone but a program it started (the trainer) lives on.
{
  writeLock(TAGS[1], { pid: deadPid, child: process.pid, time: Date.now() });
  const r = launch(TAGS[1]);
  check('the driver died but the trainer it started is still running: refuses with exit code 2', r.status === 2 && r.stderr.includes('a program it started'), said(r));
}
// C. A stale lock: neither process exists any more.
{
  writeLock(TAGS[2], { pid: deadPid, child: null, time: Date.now() });
  const r = launch(TAGS[2]);
  check('a lock whose processes are gone is taken over (the launch gets to "first launch needs", exit code 1)', r.status === 1 && /first launch needs/.test(r.stderr), said(r));
  check('... and the lock is removed when the launch ends', !existsSync(lockFile(TAGS[2])));
}
// D. A lock from before the machine last booted: its process ids mean nothing.
{
  writeLock(TAGS[3], { pid: process.pid, child: null, time: Date.now() - os.uptime() * 1000 - 3_600_000 });
  const r = launch(TAGS[3]);
  check('a lock written before the last boot is ignored even though its process id is in use now', r.status === 1 && /first launch needs/.test(r.stderr), said(r));
}
// E. No lock at all.
{
  const r = launch(TAGS[4]);
  check('no lock: the launch runs, and leaves no lock behind', r.status === 1 && /first launch needs/.test(r.stderr) && !existsSync(lockFile(TAGS[4])), said(r));
}
// F. Two live launches. The first is kept busy verifying laps that cannot
// verify (a real lap claiming one tick too few, four times: about 2 s each).
{
  const scratch = `${IDEA_DIR}/tests/scratch/lock`;
  mkdirSync(join(PROJECT, scratch), { recursive: true });
  const lap = JSON.parse(readFileSync(join(PROJECT, 'runs/rollout_desert4.recording.json'), 'utf8'));
  writeFileSync(join(PROJECT, scratch, 'early.recording.json'), JSON.stringify({ ...lap, frames: lap.frames - 1 }));
  writeFileSync(join(PROJECT, scratch, 'base.pt'), 'not a checkpoint'); // only its existence is checked before the laps
  const bad = `${scratch}/early.recording.json`;
  const holder = spawn(process.execPath, [DRIVER, T, `tag=${TAGS[5]}`, 'minutes=1', `base=${scratch}/base.pt`, `lap=${bad},${bad},${bad},${bad}`], { cwd: PROJECT, stdio: ['ignore', 'pipe', 'pipe'] });
  let text = '';
  holder.stdout.on('data', (c) => { text += c; });
  holder.stderr.on('data', (c) => { text += c; });
  const ended = new Promise((done) => holder.on('close', done));
  // Wait for the first launch to write its lock (it does so before anything else).
  const t0 = Date.now();
  while (!existsSync(lockFile(TAGS[5])) && Date.now() - t0 < 20_000 && holder.exitCode == null) await new Promise((r) => setTimeout(r, 50));
  const held = existsSync(lockFile(TAGS[5])) ? JSON.parse(readFileSync(lockFile(TAGS[5]), 'utf8')) : null;
  check('a running launch holds a lock naming its own process', held?.pid === holder.pid, `lock ${JSON.stringify(held)}, launch ${holder.pid}`);
  const second = launch(TAGS[5]);
  const stillRunning = holder.exitCode == null;
  check('a second launch on the same track while the first is running: refused, exit code 2', stillRunning && second.status === 2 && second.stderr.includes(String(holder.pid)), `first still running: ${stillRunning}\n${said(second)}`);
  check('... and the first launch\'s lock is still in place afterwards', existsSync(lockFile(TAGS[5])) && JSON.parse(readFileSync(lockFile(TAGS[5]), 'utf8')).pid === holder.pid);
  const other = launch(TAGS[4]);
  check('... while a launch of ANOTHER series (its own tag) is not refused', other.status === 1 && /first launch needs/.test(other.stderr), said(other));
  const code = await ended;
  check('the first launch ends by itself with "none of the laps given verifies" (exit code 1) and removes its lock', code === 1 && /none of the laps given verifies/.test(text) && !existsSync(lockFile(TAGS[5])), `exit ${code}\n${text}`);
  const third = launch(TAGS[5]);
  check('once it has ended, a new launch is accepted', third.status === 1 && /first launch needs/.test(third.stderr), said(third));
  rmSync(join(PROJECT, scratch), { recursive: true, force: true });
}
check('none of these launches made a file under the real rl/checkpoints/ or runs/', realNames() === before);
clean();
// The author's folder had no work/ before these tests; leave none behind if it is empty.
try { const w = join(PROJECT, IDEA_DIR, 'work'); if (existsSync(w) && !readdirSync(w).length) rmSync(w, { recursive: true }); } catch { /* not ours to remove */ }
finish();
