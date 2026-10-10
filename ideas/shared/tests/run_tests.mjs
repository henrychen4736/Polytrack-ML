// Every test of ideas/shared/, one file after another (at most one simulator
// alive at a time). From the project root:
//
//   node ideas/shared/tests/run_tests.mjs
//
// One line per check (PASS / FAIL), a final count, exit 0 only if all pass.
// About 1.5 minutes with training running. What is covered: TESTING.md.
import { runAll } from './harness.mjs';

await runAll(new URL('.', import.meta.url), [
  'test_laps.mjs',            // conversions, by hand; no simulator
  'test_sim_session.mjs',     // save / load restores car and keys; determinism; the finish
  'test_verify.mjs',          // which tick Verify accepts; what is written
  'test_track_info.mjs',      // gates, progress(), ray casts
  'test_policy_rollout.mjs',  // policy sampling; roll / mark / rewind; three ways to drive one lap
  'test_pool.mjs',            // pool.mjs: a child that throws fails the request (no simulator)
  'test_export_critic.py',    // export_critic.py; policy.mjs against PyTorch
]);
