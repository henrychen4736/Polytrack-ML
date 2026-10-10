// attempts.mjs as it is used: the README's own measurement (the memory-blind
// generalist on desert3, 3 sessions of 5 sampled attempts), run twice side by
// side, once with memory=1 and once with memory=0. Two simulators.
//
//   node ideas/g2-5-memory-policy/tests/test_attempts.mjs
//
// seed=2: the README's figures for this measurement are those of seed 2. The
// command the README prints has no seed, so it runs seed 1, which gives other
// numbers (14 of 15 crashed, one finish, 6 of 11 repeats); see TESTING.md.
//
// The generalist's actor has 352 inputs and never sees the memory, so both
// runs must drive the same 15 attempts: that checks that the runs repeat and
// that the memory wrapper does not disturb the driving. The table attempts.mjs
// prints is recomputed here from its own per-attempt lines.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { check, same, finish } from './check.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const run = (memory) => new Promise((resolve) => {
  const child = spawn(process.execPath, ['ideas/g2-5-memory-policy/attempts.mjs', 'track=desert3', 'policy=rl/checkpoints/ppo_blkgen.best2.actor.bin',
    'attempts=5', 'sessions=3', 'sample=1', 'seed=2', `memory=${memory}`], { cwd: ROOT });
  let stdout = '', stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('close', (code) => resolve({ code, stdout, stderr }));
});

/** The per-attempt lines of the output, as numbers. */
function attempts(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^session (\d+) attempt (\d+): (.+?)(?: in ([\d.]+) s| at ([\d.]+)% of the lap \(progress ([\d.-]+) units\)); memory inputs during it: largest ([\d.]+), crash-ahead ([\d.]+)/);
    if (m) rows.push({ session: +m[1], attempt: +m[2], reason: m[3], seconds: m[4] ? +m[4] : null, share: m[5] ? +m[5] : 100, crashAt: m[6] && m[6] !== '-' ? +m[6] : null, memoryPeak: +m[7], crashAhead: +m[8] });
  }
  return rows;
}

const [on, off] = await Promise.all([run(1), run(0)]);
check(on.code === 0 && off.code === 0, 'attempts.mjs ran with memory=1 and memory=0', (on.stderr + off.stderr).slice(-500));
const a = attempts(on.stdout), b = attempts(off.stdout);
console.log(on.stdout.split('\n').filter((l) => /^session|^\s+attempt|crashes after|decisions in/.test(l)).map((l) => `     ${l.trim()}`).join('\n'));
check(a.length === 15 && b.length === 15 && same(a.map((r) => [r.session, r.attempt]), [1, 2, 3].flatMap((s) => [1, 2, 3, 4, 5].map((k) => [s, k]))), '3 sessions of 5 attempts each are reported, in order');
const outcome = (rows) => rows.map((r) => [r.reason, r.seconds, r.share, r.crashAt]);
check(same(outcome(a), outcome(b)), 'a 352-input policy drives the same 15 attempts whether the memory inputs are filled in or held at zero (the runs repeat, and the wrapper does not disturb the driving)');
check(a.every((r) => (r.attempt === 1) === (r.memoryPeak === 0)), 'memory=1: the memory inputs are all zero during attempt 1 of every session and non-zero during every later attempt');
check(b.every((r) => r.memoryPeak === 0 && r.crashAhead === 0), 'memory=0: the memory inputs stay at zero on all 15 attempts');
check(a.filter((r) => r.attempt > 1 && r.crashAhead > 0).length >= 6, `memory=1: an earlier crash shows ahead during most later attempts (${a.filter((r) => r.attempt > 1 && r.crashAhead > 0).length} of 12)`);

// --- the README's reading of this run -------------------------------------------------
const crashed = a.filter((r) => r.crashAt != null);
const within = (lo, hi) => crashed.filter((r) => r.crashAt >= lo && r.crashAt <= hi).length;
check(a.every((r) => r.seconds == null) && crashed.length === 15, `README (seed 2): 15 of 15 attempts crashed (${crashed.length} crashed, ${a.filter((r) => r.seconds != null).length} finished)`);
check(within(268, 322) === 8 && within(748, 812) === 2 && within(1156, 1220) === 5,
  `README (seed 2): all at three places, 268 to 322 units (8), 748 to 812 (2), 1156 to 1220 (5); got ${within(268, 322)}, ${within(748, 812)}, ${within(1156, 1220)}`, crashed.map((r) => r.crashAt).join(' '));

// --- the table, recomputed from the lines above it -----------------------------------------
const table = [...on.stdout.matchAll(/attempt (\d+): finished (\d+)\/(\d+)(?:, mean lap ([\d.]+) s)?, mean share of the lap ([\d.]+)%/g)].map((m) => [+m[1], +m[2], +m[3], +m[5]]);
const expected = [1, 2, 3, 4, 5].map((k) => {
  const these = a.filter((r) => r.attempt === k);
  return [k, these.filter((r) => r.seconds != null).length, these.length, these.reduce((s, r) => s + r.share, 0) / these.length];
});
check(table.length === 5 && table.every((row, k) => row[0] === expected[k][0] && row[1] === expected[k][1] && row[2] === expected[k][2] && Math.abs(row[3] - expected[k][3]) < 0.11),
  'the table by attempt number (finished n / 3, mean share of the lap) is what the 15 lines give', JSON.stringify({ table, expected }));
// "crashes after attempt 1 that ended within 20 units of an earlier crash of the same session"
let later = 0, repeated = 0;
for (const r of a) {
  if (r.attempt === 1 || r.crashAt == null) continue;
  later++;
  if (a.some((e) => e.session === r.session && e.attempt < r.attempt && e.crashAt != null && Math.abs(e.crashAt - r.crashAt) <= 20)) repeated++;
}
const printed = on.stdout.match(/earlier crash of the same session: (\d+)\/(\d+)/);
check(printed && +printed[1] === repeated && +printed[2] === later, `the crash-repeat count printed (${printed?.[1]}/${printed?.[2]}) is what the lines give (${repeated}/${later})`);
check(repeated === 4 && later === 12, `README (seed 2): the script's own count is 4 of 12 on desert3 (got ${repeated} of ${later})`);
finish();
