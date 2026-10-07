// Check of the block-decision scheme (see BLOCK DECISIONS in racing_env.mjs):
// can a top human lap be driven through it?
//
// For each track, the human lap is turned into block decisions (one per
// 50 ms: for each control, what it should be at the end of the block and in
// which 10 ms slice it changes), and those decisions are then driven from the
// start line with stepBlock(). If one change per control per 50 ms, timed to
// 10 ms, really is enough to express what the human did, the car should
// follow the human's line and finish in about the human's time.
//
// It will not be exact: the human's key changes fall on any millisecond and
// are moved here to the nearest 10 ms, and the rare block with two changes of
// one control keeps only the last. The simulator is exact, so those small
// timing shifts add up over a lap. What this test shows is how far the lap
// gets and how far off the line it drifts.
//
// Usage: node rl/block_test.mjs [track ...]     (default: four tracks)
import { RacingEnv } from './racing_env.mjs';

const tracks = process.argv.slice(2);
for (const track of tracks.length ? tracks : ['desert4', 'summer4', 'summer1', 'winter2']) {
  const renv = await RacingEnv.create({ track, block: Number(process.env.BLOCK ?? 5) });
  const demo = await renv.demo(renv.human);
  // How often the human's blocks change each control, and how many blocks
  // the labels could not express exactly is not known here; report the mix.
  let steerChanges = 0, pedalChanges = 0;
  for (let k = 0; k < demo.count; k++) {
    if (demo.actions[6 * k + 1] !== 5) steerChanges++;
    if (demo.actions[6 * k + 3] !== 5 || demo.actions[6 * k + 5] !== 5) pedalChanges++;
  }
  await renv.reset({ startFraction: 0 });
  let r, worstOff = 0, reward = 0, k = 0;
  for (; k < demo.count; k++) {
    // "at" 5 means no change; any value does for stepBlock then.
    const d = Array.from(demo.actions.subarray(6 * k, 6 * k + 6), (v, i) => (i % 2 === 1 && v === 5 ? 0 : v));
    r = await renv.stepBlock(d);
    reward += r.reward;
    worstOff = Math.max(worstOff, r.info.offLine);
    if (r.terminated || r.truncated) break;
  }
  const info = r.info;
  console.log(`${track}: ${demo.count} blocks (steering changes in ${steerChanges}, W or S changes in ${pedalChanges}); ` +
    (info.reason === 'finished'
      ? `FINISHED in ${(info.finishFrames / 1000).toFixed(3)} s (human ${(renv.human.frames / 1000).toFixed(3)} s)`
      : `${info.reason ?? 'ran out of blocks'} at ${(100 * info.fraction).toFixed(1)}% of the lap`) +
    `, furthest from the human's line ${worstOff.toFixed(1)} units, reward ${reward.toFixed(1)}`);
  await renv.close();
}
process.exit(0);
