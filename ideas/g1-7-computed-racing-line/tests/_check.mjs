// Tiny reporting helper shared by every test file in this folder.
//
// Each check prints exactly one line that starts with PASS, FAIL or
// KNOWN FAIL; run_tests.mjs counts those prefixes, so a test file needs no
// framework and can also be run on its own:
//   node ideas/<folder>/tests/test_x.mjs
//
// A KNOWN FAIL is a defect in the code under test that was found, written up
// in TESTING.md and deliberately left unfixed. It still makes the suite exit
// non-zero.

/** One check. `detail` is printed either way so a PASS line shows the measured number too. */
export function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` | ${detail}` : ''}`);
  return !!ok;
}

/** A check whose failure is a written-up, unfixed defect (see TESTING.md). */
export function known(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'KNOWN FAIL'} ${name}${detail ? ` | ${detail}` : ''}`);
  return !!ok;
}

/** |a - b| <= tol */
export const near = (a, b, tol) => Math.abs(a - b) <= tol;
/** a within `fraction` of b (relative) */
export const within = (a, b, fraction) => Math.abs(a - b) <= Math.abs(b) * fraction;
export const fmt = (v, d = 3) => (v == null || Number.isNaN(v) ? String(v) : Number(v).toFixed(d));
export const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
export const percentile = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

/** Run `fn`; a throw becomes one FAIL line instead of killing the other checks in the file. */
export async function section(name, fn) {
  try { await fn(); } catch (error) { check(`${name}: ran without throwing`, false, String(error?.stack ?? error).split('\n').slice(0, 3).join(' / ')); }
}
