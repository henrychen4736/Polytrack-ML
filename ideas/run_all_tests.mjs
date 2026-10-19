// Every test suite under ideas/, one folder after another. From the project root:
//
//   node ideas/run_all_tests.mjs              # all thirteen folders, about 25 minutes
//   node ideas/run_all_tests.mjs g1-4 g2-1    # only folders whose name contains one of these
//
// Each folder's tests/run_tests.mjs was written by a tester who did not write
// that folder's code. This script only runs them and adds up what they print.
//
// NEVER IN PARALLEL: the suites start simulators (up to 2 at a time each), and
// the machine is usually training as well. One folder runs, finishes, and
// only then does the next start.
//
// One line per folder:
//   ok     g1-4-beam-search              100 passed    0 failed   0 known    212 s
//   KNOWN  g1-7-computed-racing-line     220 passed    0 failed   3 known    101 s
//   FAIL   ...
// "known" are failures the tester found, wrote up in that folder's
// tests/TESTING.md and deliberately left failing because the fix belongs to
// the folder's author. They are counted apart from new failures and listed in
// full at the end; they are not hidden, and they still make the exit code
// non-zero, as each folder's own runner does.
//
// How results are counted: by the lines the suites print, which all four
// testers' harnesses agree on:
//   PASS ...                                      a check that passed
//   KNOWN FAIL ... / FAIL (known defect...) ...   a written-up defect
//   FAIL ...                                      anything else that failed
// A runner that exits non-zero without printing any failure (it crashed), or
// that prints no PASS at all, counts as one failure for its folder.
//
// The full output of every folder is kept in ideas/test_logs/<folder>.log
// (on this machine only: the folder is in .gitignore since 18 October 2026).
// Exit code 0 only if every folder had no failure of either kind.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const IDEAS = new URL('./', import.meta.url);
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const LOGS = new URL('./test_logs/', IDEAS);
/** A folder that takes longer than this is killed and counted as failed. The
 *  slowest suite takes about 5 minutes with training running. */
const TIMEOUT_MS = 20 * 60 * 1000;

const wanted = process.argv.slice(2);
// shared first: if the shared modules are broken, everything after it is noise.
const folders = readdirSync(IDEAS, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(new URL(`${d.name}/tests/run_tests.mjs`, IDEAS)))
  .map((d) => d.name)
  .filter((name) => !wanted.length || wanted.some((w) => name.includes(w)))
  .sort((a, b) => (a === 'shared' ? -1 : b === 'shared' ? 1 : a.localeCompare(b)));

/** Kill a runner and everything it started (test files, pool children). On
 *  Windows child.kill() alone would leave the simulators running. */
function killTree(pid) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
  else try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
}

/** Run one folder's suite; resolves with { code, out, seconds, timedOut }. */
function runFolder(name) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [`ideas/${name}/tests/run_tests.mjs`], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', timedOut = false;
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const timer = setTimeout(() => { timedOut = true; killTree(child.pid); }, TIMEOUT_MS);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out, seconds: (Date.now() - t0) / 1000, timedOut }); });
  });
}

mkdirSync(LOGS, { recursive: true });
const t0 = Date.now();
const results = [];
for (const name of folders) {
  const r = await runFolder(name);
  writeFileSync(new URL(`${name}.log`, LOGS), r.out);
  const lines = r.out.split(/\r?\n/);
  const isKnown = (line) => line.startsWith('KNOWN FAIL') || line.startsWith('FAIL (known defect');
  const known = lines.filter(isKnown);
  const failed = lines.filter((line) => line.startsWith('FAIL') && !isKnown(line));
  const passed = lines.filter((line) => line.startsWith('PASS')).length;
  if (r.timedOut) failed.push(`FAIL the suite was killed after ${TIMEOUT_MS / 60000} minutes`);
  else if (r.code !== 0 && failed.length + known.length === 0) failed.push(`FAIL the runner exited with code ${r.code} without reporting a failed check (it crashed; see test_logs/${name}.log)`);
  else if (passed === 0) failed.push('FAIL the suite printed no PASS line at all');
  const status = failed.length ? 'FAIL ' : known.length ? 'KNOWN' : 'ok   ';
  console.log(`${status}  ${name.padEnd(30)} ${String(passed).padStart(4)} passed ${String(failed.length).padStart(4)} failed ${String(known.length).padStart(3)} known ${r.seconds.toFixed(0).padStart(6)} s`);
  results.push({ name, passed, failed, known, code: r.code });
}

const sum = (f) => results.reduce((n, r) => n + f(r), 0);
const totalFailed = sum((r) => r.failed.length), totalKnown = sum((r) => r.known.length);
console.log(`\n${results.length} folders: ${sum((r) => r.passed)} passed, ${totalFailed} failed, ${totalKnown} known failures, ${((Date.now() - t0) / 60000).toFixed(1)} minutes`);
for (const [title, pick] of [['Failures', (r) => r.failed], ['Known failures (written up in each folder\'s tests/TESTING.md, left in place)', (r) => r.known]]) {
  if (!results.some((r) => pick(r).length)) continue;
  console.log(`\n${title}:`);
  for (const r of results) for (const line of pick(r)) console.log(`  ${r.name}: ${line.slice(0, 400)}`);
}
process.exit(totalFailed + totalKnown ? 1 : 0);
