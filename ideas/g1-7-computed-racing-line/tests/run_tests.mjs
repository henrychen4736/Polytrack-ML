// Entry point: runs every test in this folder and prints a final count.
//
//   node ideas/g1-7-computed-racing-line/tests/run_tests.mjs [name filter]
//
// Every file named test_*.mjs is run with node and every test_*.py with
// .venv/Scripts/python, one after another (so never more than one simulator
// of ours at a time; a test that launches one of the author's scripts waits
// for it before doing anything else). Each check prints one line starting with
// PASS, FAIL or KNOWN FAIL (see _check.mjs); this file relays them, counts
// them, and exits 0 only if every check passed. A test file that crashes or
// exits non-zero without printing a FAIL counts as one failure.
import { spawn } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const filter = process.argv[2] ?? '';
const files = readdirSync(here).filter((f) => /^test_.*\.(mjs|py)$/.test(f) && f.includes(filter)).sort();
const python = [path.join(root, '.venv/Scripts/python.exe'), path.join(root, '.venv/bin/python')].find(existsSync) ?? 'python';

let pass = 0, fail = 0, knownFail = 0;
const failures = [];
const started = Date.now();
for (const file of files) {
  const t0 = Date.now();
  console.log(`\n=== ${file}`);
  const [cmd, args] = file.endsWith('.py') ? [python, [path.join(here, file)]] : [process.execPath, [path.join(here, file)]];
  const code = await new Promise((resolve) => {
    // Always from the project root: the code under test resolves data/ and runs/ from there.
    const child = spawn(cmd, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let buffer = '';
    const onLine = (line) => {
      if (line.startsWith('PASS')) pass++;
      else if (line.startsWith('KNOWN FAIL')) { knownFail++; failures.push(`${file}: ${line}`); }
      else if (line.startsWith('FAIL')) { fail++; failures.push(`${file}: ${line}`); }
      console.log(line);
    };
    child.stdout.on('data', (d) => { buffer += d; const lines = buffer.split(/\r?\n/); buffer = lines.pop(); lines.forEach(onLine); });
    child.stderr.on('data', (d) => process.stdout.write(String(d)));
    // A hung simulator must not hang the suite: 4 minutes per file is far more than any needs.
    const timer = setTimeout(() => { console.log(`FAIL ${file}: timed out after 240 s, killed`); fail++; failures.push(`${file}: timed out`); child.kill(); }, 240000);
    child.on('close', (c) => { clearTimeout(timer); if (buffer) onLine(buffer); resolve(c); });
  });
  if (code !== 0) { fail++; failures.push(`${file}: exited with code ${code}`); console.log(`FAIL ${file}: exited with code ${code} (crashed before finishing its checks)`); }
  console.log(`--- ${file}: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
console.log(`\n${'='.repeat(60)}`);
if (failures.length) { console.log('Failures:'); for (const f of failures) console.log(`  ${f}`); }
console.log(`${pass} passed, ${fail} failed, ${knownFail} known failures (defects written up in TESTING.md), ${files.length} test files, ${((Date.now() - started) / 1000).toFixed(0)} s`);
process.exit(fail + knownFail === 0 && pass > 0 ? 0 : 1);
