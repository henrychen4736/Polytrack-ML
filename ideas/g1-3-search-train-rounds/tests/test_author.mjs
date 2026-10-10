// The author's own tests, run as they are and reported in this suite's
// format: every "ok" line becomes a PASS, every "FAIL" line a FAIL, and a
// script that ends with an error counts as a failure even if it printed none.
// They are here so that one command runs everything in the folder; what they
// do and do not show is discussed in TESTING.md.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { check, finish } from './harness.mjs';

const PROJECT = fileURLToPath(new URL('../../../', import.meta.url));
const PY = existsSync(`${PROJECT}.venv/Scripts/python.exe`) ? `${PROJECT}.venv/Scripts/python.exe` : 'python';
// [label, program, arguments]; paths from the project root.
const SCRIPTS = [
  // smoke_real.mjs is NOT run here: it is a real launch that writes g1-3-smoke-* files under the real
  // rl/checkpoints/ and runs/ and takes 3.5 minutes (see TESTING.md).
  ['test_restart.mjs', process.execPath, ['ideas/g1-3-search-train-rounds/test_restart.mjs']],
];
for (const [label, exe, args] of SCRIPTS) {
  // CUDA hidden: these are CPU tests and the GPU is training.
  const r = spawnSync(exe, args, { cwd: PROJECT, encoding: 'utf8', env: { ...process.env, CUDA_VISIBLE_DEVICES: '' } });
  const lines = (r.stdout ?? '').replaceAll('\r\n', '\n').split('\n');
  let seen = 0;
  for (const line of lines) {
    const m = /^(ok|FAIL)\s+(.*)$/.exec(line);
    if (m) { seen++; check(`author's ${label}: ${m[2]}`, m[1] === 'ok'); }
  }
  check(`author's ${label}: ran to the end without an error (${seen} checks reported)`, r.status === 0 && seen > 0, `exit code ${r.status}\n${(r.stderr ?? '').split('\n').slice(-8).join('\n')}`);
}
finish();
