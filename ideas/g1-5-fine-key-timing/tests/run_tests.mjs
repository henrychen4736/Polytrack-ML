// Every test of g1-5, one file after another. From the project root:
//
//   node ideas/g1-5-fine-key-timing/tests/run_tests.mjs
//
// One line per check (PASS / FAIL), a final count, exit 0 only if all pass.
// About 2 minutes with training running; never more than 2 simulator
// processes at once. What is covered: TESTING.md.
import { runAll } from '../../shared/tests/harness.mjs';

await runAll(new URL('.', import.meta.url), [
  'test_fine.mjs',      // the two moves, sub-tick time: by hand; README numbers against the data files
  'test_headline.mjs',  // the claimed 21.722 s lap, replayed and verified independently (1 simulator)
  'test_child.mjs',     // child.mjs: save-state answers against replays from the start line (1 worker + 1 replay simulator)
  'test_scripts.mjs',   // refine.mjs and smoothness.mjs: exit codes, files, the README log reproduced (2 workers)
]);
