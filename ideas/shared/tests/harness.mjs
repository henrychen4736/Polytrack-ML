// Test plumbing shared by the four tests/ folders (shared, g1-1, g1-2, g1-5).
//
// A TEST FILE is a plain script. It prints one line per check:
//   PASS <what was checked>
//   FAIL <what was checked>            a defect, or a wrong test
//   FAIL (known defect) <...>          a defect that is written up in TESTING.md
//                                      and deliberately left failing
// and exits 0. A crash (non-zero exit) is counted by the runner as one FAIL.
//
// A RUNNER (run_tests.mjs in each tests/ folder) calls runAll() with its test
// files; they run ONE AFTER ANOTHER, so the number of simulator processes
// alive at once is whatever the single running test file uses (never more
// than 2 in these suites).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT = new URL('../../../', import.meta.url);
export const rootPath = fileURLToPath(ROOT);
/** The project's Python (BRIEF.md: .venv/Scripts/python). */
export const PYTHON = fileURLToPath(new URL('.venv/Scripts/python.exe', ROOT));

/** const { check, known, eq, note } = checker(); see the top of this file. */
export function checker() {
  const check = (ok, text) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${text}`); return !!ok; };
  return {
    check,
    /** A check that is expected to fail because of a written-up defect. */
    known: (ok, text) => { console.log(`${ok ? 'PASS' : 'FAIL (known defect)'} ${text}`); return !!ok; },
    /** Deep equality by JSON, with both values printed when they differ. */
    eq: (got, want, text) => {
      const a = JSON.stringify(got), b = JSON.stringify(want);
      return check(a === b, a === b ? text : `${text}\n       got  ${a?.slice(0, 300)}\n       want ${b?.slice(0, 300)}`);
    },
    /** check() of "this function throws" (sync or async). */
    throws: async (fn, text) => {
      let threw = false;
      try { await fn(); } catch { threw = true; }
      return check(threw, text);
    },
    note: (text) => console.log(`     ${text}`),
  };
}

/** Kill a process we started and everything it started (pool children). On
 *  Windows child.kill() would leave a test's simulator processes running. */
function killTree(pid) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
  else try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
}

/**
 * Run a command from the project root and capture its output.
 * Returns { code, out, seconds, timedOut }. `out` is stdout and stderr
 * together. Used by tests that check a script's exit code.
 */
export function run(command, args, { timeout = 150_000 } = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(command, args, { cwd: rootPath, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', timedOut = false;
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const timer = setTimeout(() => { timedOut = true; killTree(child.pid); }, timeout);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out, seconds: (Date.now() - t0) / 1000, timedOut }); });
  });
}
/** run() of a Node script given relative to the project root. */
export const runNode = (script, args = [], options = {}) => run(process.execPath, [script, ...args], options);

/** Delete files given relative to the project root, if they exist. Tests use
 *  this for the runs/ files THEY wrote (names containing "test"). */
export function removeFiles(files) {
  for (const file of files) {
    if (!/test/.test(file)) throw new Error(`removeFiles: refusing to delete ${file} (not a test file)`);
    const url = new URL(file, ROOT);
    if (existsSync(url)) unlinkSync(url);
  }
}

/**
 * Run every test file of one folder, one after another, echoing each check
 * line, then print the count and exit 0 only if nothing failed.
 *   dir     the tests/ folder (a URL: new URL('.', import.meta.url))
 *   files   test file names in it: *.mjs run with node, *.py with the venv's python
 *   timeout per file, ms
 */
export async function runAll(dir, files, { timeout = 200_000 } = {}) {
  let pass = 0, fail = 0, knownFail = 0;
  const t0 = Date.now();
  for (const file of files) {
    const path = fileURLToPath(new URL(file, dir));
    console.log(`\n== ${file}`);
    const started = Date.now();
    const r = await run(file.endsWith('.py') ? PYTHON : process.execPath, [path], { timeout });
    let lines = 0;
    for (const line of r.out.split(/\r?\n/)) {
      // The simulator prints two harmless lines per boot (CONTRACT.md / sim/pool.mjs).
      if (/wasm streaming compile failed|falling back to ArrayBuffer/.test(line) || !line.trim()) continue;
      console.log(line);
      if (line.startsWith('PASS')) { pass++; lines++; }
      else if (line.startsWith('FAIL')) { fail++; lines++; if (line.startsWith('FAIL (known defect)')) knownFail++; }
    }
    if (r.code !== 0 || r.timedOut) {
      fail++;
      console.log(`FAIL ${file} ${r.timedOut ? `did not end within ${timeout / 1000} s and was stopped` : `crashed (exit code ${r.code})`} after ${lines} checks`);
    }
    console.log(`   (${file}: ${((Date.now() - started) / 1000).toFixed(0)} s)`);
  }
  console.log(`\n${pass} passed, ${fail} failed${knownFail ? ` (${knownFail} of them known defects, see TESTING.md)` : ''}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  process.exit(fail ? 1 : 0);
}
