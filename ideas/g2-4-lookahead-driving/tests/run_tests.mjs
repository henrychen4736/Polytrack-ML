// Every test of this folder, one line per check, a final count, exit code 0
// only if all pass.
//
//   node ideas/g2-4-lookahead-driving/tests/run_tests.mjs        (from the project root)
//
// STAGES run one after another; the files inside a stage run side by side.
// No stage starts more than two simulator processes. About 2 minutes with
// training running on the machine.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const HERE = 'ideas/g2-4-lookahead-driving/tests/';
const node = (file, ...args) => ({ name: file, command: process.execPath, args: [HERE + file, ...args] });
const STAGES = [
  [node('test_logic.mjs'), node('test_logs.mjs')],       // no simulator
  [node('test_sim_a.mjs'), node('test_sim_b.mjs')],      // one simulator each
  [node('test_drive.mjs')],                              // drive.mjs as a child process, one simulator at a time
];

/** Run one test file; resolves with its lines and exit code. */
function run({ name, command, args }) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(command, args, { cwd: ROOT });
    let text = '';
    child.stdout.on('data', (d) => { text += d; });
    child.stderr.on('data', (d) => { text += d; });
    child.on('close', (code) => resolve({ name, code, seconds: (Date.now() - started) / 1000,
      lines: text.split(/\r?\n/).filter((l) => l && !/wasm streaming|falling back/.test(l) && !l.startsWith('# ')) }));
  });
}

let passed = 0, failed = 0, knownFailures = 0;
const t0 = Date.now();
for (const stage of STAGES) {
  for (const r of await Promise.all(stage.map(run))) {
    console.log(`\n== ${r.name} (${r.seconds.toFixed(0)} s) ==`);
    let fails = 0;
    for (const line of r.lines) {
      console.log(line);
      if (line.startsWith('PASS')) passed++;
      else if (line.startsWith('FAIL')) { failed++; fails++; if (line.startsWith('FAIL (known defect)')) knownFailures++; }
    }
    // A file that died without reporting a failed check is a failure too.
    if (r.code !== 0 && fails === 0) { failed++; console.log(`FAIL ${r.name} ended with exit code ${r.code} before finishing its checks`); }
  }
}
console.log(`\n${passed} passed, ${failed} failed${knownFailures ? ` (${knownFailures} of the failures are known defects, see TESTING.md)` : ''}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(failed ? 1 : 0);
