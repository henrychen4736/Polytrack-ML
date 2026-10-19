// Checks of route mode in rl/racing_env.mjs (reference: 'route'), against the
// real simulator. One simulator at a time, about a minute.
//
//   node ideas/g2-1-reference-free-inputs/g2-1-route_mode_check.mjs
//
// 1. desert4: the observation is 334 finite numbers within +-3 everywhere a
//    random driver goes, with every kind of start switched on (part-way,
//    failure, own state, kick, rotating reference laps); the time limit is the
//    route's length / 30 units per second; a car that only holds W flies off
//    the first ledge at 2.85 s, lands on the road 15 units lower at 4.25 s
//    (the route takes the same drop) and is NOT ended in the air, then ends
//    against a wall (the README's smoke test saw "no road under it from
//    3050 ms": that is this flight); a part-way start begins with the
//    route progress the human had there; demo() of the fastest human lap
//    covers the whole lap, ends at exactly the route's length, and labels the
//    keys exactly as the default mode does; mark/rewind repeats exactly.
// 2. Speed: block decisions per second in one process, route against default.
// 3. A car on the ground beneath a raised road (the scenario of tests/test_3,
//    a g2-2 generated track with a piece taken out): the environment's own
//    'off track' rule (routeOffRoad) fires on it, and never for a car that
//    stays on the road.
// 4. A track with no human lap (the generated one, given as createCar): the
//    environment runs from the start line, ignores randomStart, and reports
//    humanFrames as null.
// Local use only: drives the local simulator; no network.
import { readFileSync } from 'node:fs';
import { RacingEnv, routeOffRoad, OBS_SIZE_ROUTE } from '../../rl/racing_env.mjs';
import { createRng } from '../shared/rng.mjs';
import { Env } from '../../sim/env.mjs';
import { decodeState } from '../../sim/state.mjs';
import { createController } from '../../sim/controller.mjs';
import { loadTrackInfo } from '../shared/track_info.mjs';
import { buildRoute } from './route.mjs';
import { createTracker, locate } from './progress.mjs';
import { generateTrack } from '../g2-2-track-generator/generate.mjs';
import { encodeSaveString } from '../g2-2-track-generator/codec.mjs';
import { routeToLine } from '../g2-2-track-generator/drive.mjs';

let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };
const sane = (obs) => obs.length === OBS_SIZE_ROUTE && obs.every((v) => Number.isFinite(v) && Math.abs(v) <= 3);
const blockDecision = (rng) => {
  const at = () => Math.floor(rng() * 5);
  return [Math.floor(rng() * 3), at(), rng() < 0.9 ? 1 : 0, at(), rng() < 0.1 ? 1 : 0, at()];
};
const W_ONLY = [0, 0, 1, 0, 0, 0];
const laps = JSON.parse(readFileSync(new URL('../../data/laps/desert4.json', import.meta.url), 'utf8'));

// ---- 1. desert4 --------------------------------------------------------------------
{
  const renv = await RacingEnv.create({ track: 'desert4', reference: 'route', block: 5, lapFraction: 0, randomStart: 0.5, failureStart: 0.3, ownStart: 0.5, kick: 0.3, refLaps: 3, refEvery: 4, seed: 3 });
  check(renv.obsSize === 334 && renv.cfg.maxTicks === Math.round(1000 * renv.route.length / 30) && renv.cfg.paceReward === 0 && renv.cfg.lanePenalty === 0,
    `desert4: obsSize ${renv.obsSize}, time limit ${renv.cfg.maxTicks} ms for a ${renv.route.length}-unit route, paceReward ${renv.cfg.paceReward}, lanePenalty ${renv.cfg.lanePenalty}`);

  // A car that holds only W, from the start line.
  let r = await renv.reset({ startFraction: 0 });
  check(sane(r.obs), 'the first observation from the start line: 334 finite numbers within +-3');
  do r = await renv.stepBlock(W_ONLY); while (!r.terminated && !r.truncated);
  check(r.info.frames > 4300 && r.info.reason !== 'time limit',
    `holding only W: not ended in the flight from 2.85 to 4.25 s; ended '${r.info.reason}' at ${(r.info.frames / 1000).toFixed(2)} s, ${r.info.offLine} units from the route, progress ${r.info.progress}`);

  // A random driver with every start kind.
  const rng = createRng(11);
  const reasons = {};
  let bad = 0, steps = 0, partWay = 0;
  r = await renv.reset();
  for (let k = 0; k < 1500; k++) {
    r = await renv.stepBlock(blockDecision(rng));
    steps++;
    if (!sane(r.obs) || !Number.isFinite(r.reward)) bad++;
    if (r.terminated || r.truncated) {
      reasons[r.info.reason] = (reasons[r.info.reason] ?? 0) + 1;
      r = await renv.reset();
      if (r.info.startTick > 1) partWay++;
      if (!sane(r.obs)) bad++;
    }
  }
  check(bad === 0 && Object.keys(reasons).length >= 2 && partWay > 0,
    `random driver, 1500 block decisions: ${bad} bad observations or rewards; episodes ended ${JSON.stringify(reasons)}; ${partWay} part-way starts`);

  // A part-way start: the route progress there should be the human's.
  r = await renv.reset({ startFraction: 0.5 });
  const fresh = locate(renv.route, renv.mesh, renv.state);
  check(Math.abs(r.info.progress - fresh.progress) < 2 && r.info.fraction > 0.3 && r.info.fraction < 0.7,
    `start half-way through the human's lap (tick ${r.info.startTick}): route progress ${r.info.progress} (${(100 * r.info.fraction).toFixed(1)}% of the route); a memoryless locate() says ${fresh.progress.toFixed(1)}`);

  // mark / rewind.
  const mark = await renv.mark();
  const drive = async () => { const g = createRng(9), out = []; for (let k = 0; k < 40; k++) { const x = await renv.stepBlock(blockDecision(g)); out.push(JSON.stringify([x.obs, x.reward, x.info])); if (x.terminated || x.truncated) break; } return out; };
  const first = await drive();
  await renv.rewind(mark);
  const second = await drive();
  check(JSON.stringify(first) === JSON.stringify(second), `mark / rewind: ${first.length} decisions driven twice from one mark are identical`);

  // demo() of the fastest human lap, against the default mode's labels.
  const demo = await renv.demo(laps[0]);
  const progressAtEnd = renv.progress, finishedAt = renv.state.finishFrames;
  let demoBad = 0;
  for (let k = 0; k < demo.count; k++) if (!sane(Array.from(demo.obs.subarray(k * 334, (k + 1) * 334)))) demoBad++;
  await renv.close();
  const plain = await RacingEnv.create({ track: 'desert4', block: 5, lapFraction: 0 });
  const plainDemo = await plain.demo(laps[0]);
  await plain.close();
  check(demo.count === plainDemo.count && demo.actions.every((a, k) => a === plainDemo.actions[k]) && demoBad === 0,
    `demo() of the fastest lap: ${demo.count} decisions (default mode ${plainDemo.count}), labels identical to the default mode's, ${demoBad} bad observations`);
  // demo() stops at the last whole block (434 x 50 ms = 21.70 s of a 21.75 s lap).
  check(progressAtEnd > 1984 - 10 && finishedAt == null, `demo() follows the lap to its last whole block: route progress ${progressAtEnd.toFixed(1)} of 1984`);

}

// ---- 2. speed, against the default mode ------------------------------------------
// Same options and the same driver in both modes; the ladder is built before
// the clock starts. Two drivers: the random one (short episodes, many resets)
// and one that holds W and steers a little (longer episodes).
for (const [name, make] of [['random driver', () => { const g = createRng(11); return () => blockDecision(g); }], ['W held', () => { const g = createRng(4); return () => [g() < 0.8 ? 0 : 1 + Math.floor(g() * 2), 0, 1, 0, 0, 0]; }]]) {
  const rates = {};
  for (const reference of ['human', 'route']) {
    const env = await RacingEnv.create({ track: 'desert4', reference, block: 5, lapFraction: 0, randomStart: 0.5, seed: 3 });
    await env.reset();
    const next = make();
    const t = performance.now();
    for (let k = 0; k < 1500; k++) {
      const x = await env.stepBlock(next());
      if (x.terminated || x.truncated) await env.reset();
    }
    rates[reference] = 1500 / ((performance.now() - t) / 1000);
    await env.close();
  }
  console.log(`     speed, ${name}: route mode ${rates.route.toFixed(0)} block decisions/s, default mode ${rates.human.toFixed(0)} (one process, desert4; the machine is shared with training)`);
}

// ---- 3. a car on the ground beneath a raised road ------------------------------------
const track = generateTrack({ seed: 11, length: 400, difficulty: 0.3, slopes: false });
{
  const info = loadTrackInfo(track.createCar);
  const route = buildRoute(info);
  const brokenParts = track.parts.filter((_, i) => i !== 1);
  const broken = { trackData: encodeSaveString(brokenParts, track.environment), mountainVertices: new Float32Array(0), mountainOffset: { x: 0, y: 0, z: 0 } };
  const env = await Env.create();
  async function follow(createCar) {
    env.reset(createCar);
    const decide = createController(routeToLine(track.route), { crossTrackGain: 1 });
    let state = decodeState((await env.step({}, 1))[0]);
    const states = [state];
    let best = 0, bestTick = 0;
    while (state.frames < 60000) {
      const { controls, progress } = decide(state);
      state = decodeState((await env.step(controls, 5)).at(-1));
      states.push(state);
      if (progress > best) { best = progress; bestTick = state.frames; }
      if (state.finishFrames != null || state.frames - bestTick > 4000) break;
    }
    return states;
  }
  const count = (states) => {
    const tracker = createTracker(route, info.mesh);
    const under = (s) => s.position[1] < 1 && info.mesh.raycast([s.position[0], s.position[1] + 2, s.position[2]], [0, 1, 0], 12) !== Infinity;
    let fires = 0, underFour = 0, underFires = 0, firstUnder = null, firstFire = null;
    for (const s of states) {
      const at = tracker.update(s), off = routeOffRoad(at, s);
      if (off) { fires++; firstFire ??= s.frames; }
      if (under(s) && s.wheelContact.every(Boolean)) { underFour++; firstUnder ??= s.frames; if (off) underFires++; }
    }
    return { fires, underFour, underFires, firstUnder, firstFire };
  };
  const onRoad = count(await follow(track.createCar));
  check(onRoad.fires === 0, `generated track, a car that stays on the raised road: the 'off track' rule fires on ${onRoad.fires} samples`);
  const fallen = count(await follow(broken));
  check(fallen.underFour > 100 && fallen.underFires === fallen.underFour && fallen.firstFire <= fallen.firstUnder,
    `a car on the ground beneath the road: the rule fires on ${fallen.underFires} of ${fallen.underFour} four-wheels-down samples under the road, first at ${fallen.firstFire} ms (first such sample ${fallen.firstUnder} ms), so the episode would end there`);
  await env.close();
}

// ---- 4. a track with no human lap ------------------------------------------------------
{
  const renv = await RacingEnv.create({ track: 'g2-2-seed11', createCar: track.createCar, reference: 'route', block: 5, lapFraction: 0, randomStart: 1, seed: 1 });
  let r = await renv.reset();
  let n = 0;
  const startOk = r.info.startTick <= 1 && renv.human === null && sane(r.obs);
  do { r = await renv.stepBlock(W_ONLY); n++; } while (!r.terminated && !r.truncated && n < 400);
  check(startOk && renv.cfg.maxTicks === Math.round(1000 * renv.route.length / 30),
    `no human lap: starts on the start line despite randomStart 1, time limit ${renv.cfg.maxTicks} ms for ${renv.route.length} units; holding W for ${n} decisions ended '${r.info.reason ?? 'not yet'}' at ${(r.info.frames / 1000).toFixed(2)} s, progress ${r.info.progress}`);
  await renv.close();
}

console.log(failed ? `${failed} check(s) failed` : 'all checks passed');
process.exit(failed ? 1 : 0);
