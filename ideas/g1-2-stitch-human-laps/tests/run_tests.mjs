// Every test of g1-2, one file after another. From the project root:
//
//   node ideas/g1-2-stitch-human-laps/tests/run_tests.mjs
//
// One line per check (PASS / FAIL), a final count, exit 0 only if all pass.
// About 3 minutes with training running; one simulator at a time. What is
// covered: TESTING.md.
import { runAll } from '../../shared/tests/harness.mjs';

await runAll(new URL('.', import.meta.url), [
  'test_paths.mjs',     // sections, mismatch, planning: by hand, no simulator
  'test_headline.mjs',  // the claimed 21.730 s lap, replayed and verified independently
  'test_follow.mjs',    // recordPath against the car; follow raw / resync / repair; sim.keys after a repair
  'test_script.mjs',    // stitch_laps.mjs: tables, the headline reproduced, exit codes
], { timeout: 280_000 });
