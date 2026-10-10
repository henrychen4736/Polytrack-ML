// Every test of g1-1, one file after another. From the project root:
//
//   node ideas/g1-1-human-seed-search/tests/run_tests.mjs
//
// One line per check (PASS / FAIL), a final count, exit 0 only if all pass.
// About 2 minutes with training running; never more than 2 simulator
// processes at once. What is covered: TESTING.md.
import { runAll } from '../../shared/tests/harness.mjs';

await runAll(new URL('.', import.meta.url), [
  'test_headlines.mjs',  // the four claimed laps, replayed and verified independently (1 simulator)
  'test_worker.mjs',     // section_worker.mjs through its protocol (1 worker + 1 replay simulator)
  'test_script.mjs',     // search_human.mjs: exit codes and files (its own 2 workers)
]);
