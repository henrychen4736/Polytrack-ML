// The few lines every test file here shares: one line per check, PASS or
// FAIL, and an exit code. `known` marks a check that is expected to fail
// because of a defect described in TESTING.md; it still counts as a failure.
let passed = 0, failed = 0;

export function check(ok, text, detail = '') {
  if (ok) passed++; else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${text}${!ok && detail ? `\n       ${detail}` : ''}`);
  return ok;
}

export function known(ok, text, defect) {
  if (ok) passed++; else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL (known defect)'} ${text}${ok ? '' : `\n       ${defect}`}`);
  return ok;
}

/** Deep equality by JSON, good enough for arrays of numbers and plain objects. */
export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function finish() {
  console.log(`# ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
