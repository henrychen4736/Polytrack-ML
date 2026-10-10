// Shared by the test files of this folder: one line per check, PASS or FAIL.
// run_tests.mjs counts the lines, so a check must print exactly one of them.
export let passed = 0, failed = 0;

/** One check. `detail` (string or function) is printed only on failure. */
export function check(name, ok, detail = '') {
  if (ok) passed++; else failed++;
  const extra = ok ? '' : (typeof detail === 'function' ? detail() : detail);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? `\n       ${String(extra).split('\n').join('\n       ')}` : ''}`);
}
/** Deep equality through JSON, with both values shown on failure. */
export function same(name, got, want) {
  check(name, JSON.stringify(got) === JSON.stringify(want), () => `got  ${JSON.stringify(got)}\nwant ${JSON.stringify(want)}`);
}
/** The call must throw, and the message must match. */
export function throws(name, fn, pattern = /./) {
  try { fn(); check(name, false, 'did not throw'); } catch (e) { check(name, pattern.test(e.message), `threw "${e.message}"`); }
}
export const finish = () => process.exit(failed ? 1 : 0);
