// Smoke test for the RL environment, Node side only (no Python needed).
//
// Usage: node rl/smoke_test.mjs [track] [ticks]   (run from the project root)
//   track   summer1 (default) or winter1
//   ticks   physics ticks per decision for checks 1 and 2 (default 10)
//
// It checks four things and prints PASS/FAIL for each:
//   1. Random actions: the environment runs, observations have the right
//      length, contain no NaN and stay within the clip range. Also measures
//      how many agent decisions per second one process manages.
//   2. Starting part-way round the lap (reset's startFraction) puts the car
//      on the reference line where the human was.
//   3. The hand-written pure-pursuit controller (sim/controller.mjs), forced
//      through the 9 discrete actions, drives a whole lap. This proves the
//      episode loop, the finish detection and the saved-lap format against a
//      lap we already know (sim/drive.mjs gets 23835 ticks on summer1). It
//      runs at 5 ticks per decision, the interval that controller was tuned
//      for; at 10 it oscillates and crashes about a quarter of the way round
//      on summer1, which says nothing about what a learned policy can do at
//      10. It saves runs/rl_smoke_<track>.json, which
//        node scripts/export_recording.mjs <track> rl_smoke
//      then checks with the game's own Verify.
//   4. Reward ordering: of the laps that finished in step 3, the faster one
//      earned the larger total reward.
import { RacingEnv, NUM_ACTIONS, OBS_SIZE, controlsToAction } from './racing_env.mjs';
import { createController } from '../sim/controller.mjs';

const trackName = process.argv[2] ?? 'summer1';
let failures = 0;
const check = (ok, text) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${text}`); if (!ok) failures++; };

const ticks = Number(process.argv[3] ?? 10);
const renv = await RacingEnv.create({ track: trackName, ticks });
const { line, human, cfg } = renv;
console.log(`${trackName}: line ${line.length} units, human lap ${human.frames} ticks, human top speed ${Math.max(...line.speedKmh).toFixed(0)} km/h, ${cfg.ticks} ticks per decision, tick limit ${cfg.maxTicks}`);

// ---- 1. random policy ------------------------------------------------------
{
  const STEPS = 3000;
  let lowest = Infinity, highest = -Infinity, bad = 0, episodes = 0;
  const reasons = {};
  const look = (obs) => {
    if (obs.length !== OBS_SIZE) bad++;
    for (const v of obs) { if (!Number.isFinite(v)) bad++; lowest = Math.min(lowest, v); highest = Math.max(highest, v); }
  };
  look((await renv.reset({ seed: 1 })).obs);
  const t0 = performance.now();
  for (let k = 0; k < STEPS; k++) {
    const r = await renv.step(Math.floor(Math.random() * NUM_ACTIONS));
    look(r.obs);
    if (r.terminated || r.truncated) {
      episodes++;
      reasons[r.info.reason] = (reasons[r.info.reason] ?? 0) + 1;
      look((await renv.reset()).obs);
    }
  }
  const seconds = (performance.now() - t0) / 1000;
  console.log(`random policy: ${STEPS} steps in ${seconds.toFixed(2)} s = ${Math.round(STEPS / seconds)} steps/s (${Math.round(STEPS * cfg.ticks / seconds)} ticks/s), ${episodes} episodes ended: ${JSON.stringify(reasons)}`);
  check(bad === 0, `observations: length ${OBS_SIZE}, all finite (range seen ${lowest.toFixed(2)} .. ${highest.toFixed(2)})`);
  check(lowest >= -3 && highest <= 3, 'observations stay within +-3');
}

// ---- 2. start part-way round ----------------------------------------------
{
  const t0 = performance.now();
  const { info } = await renv.reset({ startFraction: 0.5 });
  const ms = performance.now() - t0;
  console.log(`start at 50% of the human lap: tick ${info.frames}, ${info.progress} units along (${(100 * info.fraction).toFixed(1)}%), ${info.offLine} off the line, ${info.speedKmh} km/h, reset took ${ms.toFixed(0)} ms`);
  check(info.offLine < 1 && info.frames === Math.floor(0.5 * human.frames), 'the car is on the line at the requested tick');
  // From there, full throttle straight for one second must gain ground.
  let gained = 0;
  for (let k = 0; k < 1000 / cfg.ticks && !renv.done; k++) gained += (await renv.step(0)).reward;
  check(gained > 0, `one second of throttle from there earns progress reward (${gained.toFixed(2)})`);
}

// ---- 3 and 4. a full lap by the pure-pursuit controller -----------------------
// A second environment at the controller's own decision interval. Only one
// simulator is alive at a time, so close the first before booting it.
await renv.close();
const cenv = await RacingEnv.create({ track: trackName, ticks: 5 });
/** Drive one lap with the controller, picking the nearest of the 9 actions. */
async function controllerLap(options) {
  let { info } = await cenv.reset({ startFraction: 0 });
  const decide = createController(cenv.line, options);
  let total = 0, steps = 0, r;
  do {
    r = await cenv.step(controlsToAction(decide(cenv.state).controls));
    total += r.reward; steps++;
  } while (!r.terminated && !r.truncated);
  ({ info } = r);
  console.log(`controller ${JSON.stringify(options)}: ${info.reason} after ${steps} steps, ${info.finishFrames ?? info.frames} ticks, ${(100 * info.fraction).toFixed(1)}% of the line, total reward ${total.toFixed(2)}`);
  return { finishFrames: info.finishFrames, total };
}
const laps = [];
for (const options of [{}, { brakeMarginKmh: 5 }, { minTargetKmh: 60 }]) {
  const lap = await controllerLap(options);
  if (lap.finishFrames != null) {
    // Keep the first finished lap on disk for export_recording.mjs.
    if (laps.length === 0) console.log(`saved ${cenv.save('rl_smoke')}`);
    laps.push(lap);
  }
}
// The controller is only known to get round summer1 (sim/drive.mjs has the
// same result there), so a lap that does not finish is a failure of this
// environment only on that track.
if (laps.length > 0 || trackName === 'summer1') check(laps.length > 0, 'the controller finishes a lap through the 9 discrete actions');
else console.log(`SKIP controller lap: the pure-pursuit controller does not get round ${trackName}, so there is no lap to compare with`);
if (laps.length >= 2) {
  laps.sort((a, b) => a.finishFrames - b.finishFrames);
  const ordered = laps.every((lap, k) => k === 0 || lap.finishFrames === laps[k - 1].finishFrames || lap.total < laps[k - 1].total);
  check(ordered, `faster finished laps earn more reward (${laps.map((l) => `${l.finishFrames} ticks -> ${l.total.toFixed(2)}`).join(', ')})`);
} else {
  console.log('SKIP reward ordering: fewer than two finished laps to compare');
}

await cenv.close();
process.exit(failures ? 1 : 0);
