// Smoke test: the route, the progress measure and the observation, run against
// the real simulator. ONE simulator at a time, about a minute in all.
//
//   node ideas/g2-1-reference-free-inputs/smoke_test.mjs [track]     (default desert4)
//
// 1. The "as now" entries of the new observation (the car's own numbers and
//    the rays) are the same, number for number, as RacingEnv's on the same
//    car states. That is the proof that observation.mjs mirrors the existing
//    conventions, and it will fail if rl/racing_env.mjs changes them.
// 2. Driving the fastest human lap's keys on the bare simulator (SimSession,
//    which has no reference lap), the observation is built 20 times a second
//    from the car state alone: every number finite and within the clip
//    limits, route progress never dropping, ending at exactly the route's
//    length when the game says the lap is finished.
// 3. A car that just holds W leaves the road; the route-based measures say so
//    (edge room negative, distance from the route growing) with no human lap
//    to compare against.
import { loadTrackInfo } from '../shared/track_info.mjs';
import { humanLaps, keysToDecisions } from '../shared/laps.mjs';
import { SimSession } from '../shared/sim_session.mjs';
import { openBlockEnv, fromStart } from '../shared/block_rollout.mjs';
import { actionToControls } from '../../rl/racing_env.mjs';
import { routeFor } from './route_store.mjs';
import { createObserver, OBS_SIZE, OBS_RAYS, OBS_NEAR, OBS_EDGE_NOW } from './observation.mjs';

const track = process.argv[2] ?? 'desert4';
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };

const info = loadTrackInfo(track);
let t0 = Date.now();
const route = routeFor(info);
console.log(`route for ${track}: ${route.points.length} points, ${route.jumps.length} flights, gates at ${route.gateIndex.join(' ')} (${Date.now() - t0} ms, cached after the first time)`);
check(route.ok, 'the route reaches every gate and the finish');
const human = humanLaps(track)[0];

// ---- 1. against RacingEnv -----------------------------------------------------
{
  const renv = await openBlockEnv(track);
  await fromStart(renv);
  const observer = createObserver(info, route);
  observer.reset();
  const { decisions } = keysToDecisions(human.keys);
  const ENV_RAYS = 335; // where the rays start in the 352-number observation
  let worst = 0, compared = 0, done = false;
  const rows = [];
  for (let k = 0; k < Math.min(decisions.length, 240) && !done; k++) {
    const r = await renv.stepBlock(decisions[k]);
    done = r.terminated || r.truncated;
    const { obs, at } = observer.observe({
      state: renv.state, older: renv.older, held: actionToControls(renv.previousAction),
      contact: renv.contactTicks > 0, pedalOpen: true,
    });
    for (let i = 0; i < OBS_NEAR; i++) worst = Math.max(worst, Math.abs(obs[i] - r.obs[i]));
    for (let i = 0; i < 17; i++) worst = Math.max(worst, Math.abs(obs[OBS_RAYS + i] - r.obs[ENV_RAYS + i]));
    worst = Math.max(worst, Math.abs(obs[OBS_EDGE_NOW + 2] - r.obs[103]), Math.abs(obs[144] - r.obs[144]), Math.abs(obs[145] - r.obs[145]));
    compared++;
    if (k % 40 === 39) rows.push(`    t=${(renv.state.frames / 1000).toFixed(1)}s  human-line progress ${renv.progress.toFixed(0)} (off ${renv.offLine.toFixed(1)})   route progress ${at.progress.toFixed(0)} (off ${at.offRoute.toFixed(1)})   room L/R: human-line table ${renv.edgeLeft.toFixed(1)}/${renv.edgeRight.toFixed(1)}  measured at the car ${at.edgeLeft.toFixed(1)}/${at.edgeRight.toFixed(1)}`);
  }
  check(worst < 1e-9, `car numbers [0..16], contact, pedal flags and the 17 rays equal RacingEnv's over ${compared} decisions (largest difference ${worst.toExponential(1)})`);
  console.log(rows.join('\n'));
  await renv.env.close();
}

// ---- 2. the human lap on the bare simulator ------------------------------------
{
  const sim = await SimSession.create(track);
  await sim.restart();
  const observer = createObserver(info, route);
  observer.reset();
  let bad = 0, back = 0, best = 0, n = 0, ms = 0, last = null, biggest = 0;
  for (let t = 0; t < human.keys.length && !sim.finished; t += 50) {
    await sim.drive(human.keys.slice(t, t + 50));
    const held = human.keys[Math.min(human.keys.length - 1, t + 49)];
    t0 = performance.now();
    last = observer.observe({ state: sim.state, older: sim.recent[0], held, contact: false, pedalOpen: true });
    ms += performance.now() - t0;
    n++;
    for (const v of last.obs) { if (!Number.isFinite(v) || Math.abs(v) > 3) bad++; biggest = Math.max(biggest, Math.abs(v)); }
    back = Math.max(back, best - last.at.progress);
    best = Math.max(best, last.at.progress);
  }
  check(last.obs.length === OBS_SIZE, `observation has ${OBS_SIZE} numbers`);
  check(bad === 0, `${n} observations along the human lap: all finite and within +-3 (largest ${biggest.toFixed(2)})`);
  check(back < 1, `route progress never drops along the human lap (largest drop ${back.toFixed(2)} units)`);
  check(sim.finished && last.at.progress === route.length, `finished in ${sim.state.finishFrames} ms; progress at the finish = ${last.at.progress} of ${route.length}`);
  console.log(`    ${(ms / n).toFixed(2)} ms per observation`);

  // ---- 3. a car that does not steer ---------------------------------------------
  await sim.restart();
  observer.reset();
  let leftRoad = null, at = null;
  for (let t = 0; t < 12000; t += 50) {
    await sim.hold({ up: true }, 50);
    at = observer.observe({ state: sim.state, older: sim.recent[0], held: { up: true } }).at;
    if (leftRoad == null && at.grounded && !at.overRoad) leftRoad = sim.tick;
  }
  console.log(`    holding W only for 12 s: progress ${at.progress.toFixed(0)}, ${at.offRoute.toFixed(0)} units from the route, room L/R ${at.edgeLeft.toFixed(1)}/${at.edgeRight.toFixed(1)}`);
  check(leftRoad != null || at.offRoute > 20, `with no human lap, the car is seen to leave the road (${leftRoad != null ? `no surface under it from ${leftRoad} ms` : `${at.offRoute.toFixed(0)} units from the route`})`);
  await sim.close();
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
