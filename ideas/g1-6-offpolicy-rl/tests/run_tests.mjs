// Entry point: runs every test of this folder and prints one line per check.
//
//   node ideas/g1-6-offpolicy-rl/tests/run_tests.mjs
//
// Each test file prints "PASS <check>" or "FAIL <check>"; this script runs
// them one after the other (each keeps to two simulators at most), repeats
// their lines, counts, and exits 0 only if every check passed. A test file
// that dies without reporting counts as one failure. Checks listed in KNOWN
// are defects that were found and NOT fixed: they are marked as such, and
// still make the exit code non-zero.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PROJECT = fileURLToPath(new URL('../../../', import.meta.url));
const HERE = fileURLToPath(new URL('./', import.meta.url));
const PY = existsSync(`${PROJECT}.venv/Scripts/python.exe`) ? `${PROJECT}.venv/Scripts/python.exe` : 'python';
import { TESTS, KNOWN } from './tests_list.mjs';

let pass = 0, fail = 0, known = 0;
const t0 = Date.now();
for (const file of TESTS) {
  console.log(`\n=== ${file} ===`);
  const exe = file.endsWith('.py') ? PY : process.execPath;
  const lines = await new Promise((done) => {
    const child = spawn(exe, [HERE + file], { cwd: PROJECT, stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '';
    child.stdout.on('data', (c) => { text += c; });
    child.stderr.on('data', (c) => { text += c; });
    child.on('close', (code) => done({ code, text }));
  });
  let seen = 0;
  for (const line of lines.text.split(/\r?\n/)) {
    if (line.startsWith('PASS ')) { pass++; seen++; console.log(line); }
    else if (line.startsWith('FAIL ')) {
      seen++;
      const isKnown = KNOWN.some((k) => line.includes(k));
      if (isKnown) { known++; console.log(line.replace(/^FAIL/, 'FAIL (known defect, not fixed)')); } else { fail++; console.log(line); }
    } else if (line.trim() && (line.startsWith('       ') || process.argv.includes('verbose=1'))) console.log(line);
  }
  if (lines.code !== 0 && !lines.text.split(/\r?\n/).some((l) => l.startsWith('FAIL '))) {
    fail++;
    console.log(`FAIL ${file} ended with code ${lines.code} without reporting a failed check\n${lines.text.split(/\r?\n/).slice(-15).map((l) => `       ${l}`).join('\n')}`);
  } else if (!seen) { fail++; console.log(`FAIL ${file} reported no checks`); }
}
console.log(`\n${pass} passed, ${fail + known} failed${known ? ` (${known} of them known defects, not fixed)` : ''}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(fail + known ? 1 : 0);
