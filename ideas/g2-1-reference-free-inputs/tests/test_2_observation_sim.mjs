// observation.mjs: size, layout and scaling against its documentation. One
// simulator, about 6 s.
//
// The fastest human lap's keys are driven on desert4 with SimSession (no
// reference lap anywhere), and 20 times a second the observation is built and
// every documented block is worked out again here, from the car state, the
// route's arrays and ray casts, with this file's own vector code. A block that
// was in the wrong place, in the wrong frame, or scaled by the wrong number
// would not match.
import { readFileSync } from 'node:fs';
import { SimSession } from '../../shared/sim_session.mjs';
import { humanLaps } from '../../shared/laps.mjs';
import { loadTrackInfo } from '../../shared/track_info.mjs';
import { routeFor } from '../route_store.mjs';
import * as O from '../observation.mjs';
import { check, near, fmt, section } from './_check.mjs';

const TRACK = 'desert4';
const info = loadTrackInfo(TRACK), route = routeFor(info), mesh = info.mesh;
const pts = route.points, lastIndex = pts.length - 1;

// Our own vector code (not sim/track.mjs rotate): a quaternion [x, y, z, w] as a matrix.
const matrix = ([x, y, z, w]) => [
  [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
];
const toWorld = (v, q) => { const m = matrix(q); return m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]); };
/** World vector in the car's frame (x = left, y = up, z = forward): the transpose. */
const toCar = (v, q) => { const m = matrix(q); return [0, 1, 2].map((c) => m[0][c] * v[0] + m[1][c] * v[1] + m[2][c] * v[2]); };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const clip = (v, lim = 3) => Math.max(-lim, Math.min(lim, v));

await section('documented layout', () => {
  check('observation: OBS_SIZE is 334', O.OBS_SIZE === 334);
  // The block starts in the file's header and in the README's table.
  const starts = { OBS_NEAR: 17, OBS_FRACTION: 20, OBS_POINTS: 21, OBS_CURVATURE: 81, OBS_EDGE_NOW: 101, OBS_CONTACT: 103, OBS_EDGE_AHEAD: 104, OBS_S_HELD: 144, OBS_PEDAL_OPEN: 145, OBS_FRAME: 146, OBS_SLOPE: 272, OBS_ON_ROAD: 292, OBS_FLIGHT: 312, OBS_GATE: 315, OBS_HEIGHT: 316, OBS_RAYS: 317 };
  const wrong = Object.entries(starts).filter(([name, at]) => O[name] !== at).map(([name, at]) => `${name} is ${O[name]}, documented ${at}`);
  check('observation: every block starts where the header documents it (17, 20, 21, 81, 101, 103, 104, 144, 145, 146, 272, 292, 312, 315, 316, 317)', wrong.length === 0, wrong.join('; '));
  // README table: the ranges must tile 0..333 with no gap or overlap.
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const ranges = [];
  for (const line of readme.split(/\r?\n/)) {
    const m = line.match(/^\| (\d+)(?: to (\d+)|, (\d+))? \|/);
    if (m && line.split('|').length >= 4 && !/of \d+ \|/.test(line)) ranges.push([+m[1], +(m[2] ?? m[3] ?? m[1])]);
  }
  let tiles = ranges.length > 10 && ranges[0][0] === 0 && ranges.at(-1)[1] === 333;
  for (let k = 1; k < ranges.length; k++) tiles &&= ranges[k][0] === ranges[k - 1][1] + 1;
  check('observation: the README\'s table of entries covers 0 to 333 with no gap and no overlap', tiles, ranges.map((r) => r.join('-')).join(' '));
  check('observation: 20 points ahead (LOOKAHEAD_POINTS), as the existing 352-number observation has', O.LOOKAHEAD_POINTS === 20);
});

const sim = await SimSession.create(TRACK);
try {
  await sim.restart();
  const lap = humanLaps(TRACK)[0];
  const observer = O.createObserver(info, route), withFraction = O.createObserver(info, route, { lapFraction: 1 });
  observer.reset(); withFraction.reset();
  // Mismatches per block, over the whole lap.
  const bad = {}; const note = (block, ok) => { bad[block] ??= 0; if (!ok) bad[block]++; };
  let count = 0, largest = 0, notFinite = 0, wrongSize = 0, forwardChecked = 0, forwardOff = 0, upright = 0, fractionRises = true, previousFraction = 0;
  let levelSamples = 0, unitish = 0, unitChecked = 0;
  for (let t = 0; t < lap.frames && !sim.finished; t += 50) {
    await sim.drive(lap.keys.slice(t, t + 50));
    const state = sim.state, older = sim.recent[0];
    const held = lap.keys[Math.min(lap.frames - 1, t + 49)];
    const contact = count % 7 === 3, pedalOpen = count % 5 !== 2;     // arbitrary but known flags
    const { obs, at } = observer.observe({ state, older, held, contact, pedalOpen });
    const second = withFraction.observe({ state, older, held });
    count++;
    if (obs.length !== 334) wrongSize++;
    for (const v of obs) { if (!Number.isFinite(v)) notFinite++; else largest = Math.max(largest, Math.abs(v)); }
    const q = state.quaternion, pos = state.position, eq = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

    // [0..16] the car
    note('[0] speed, km/h / 300', eq(obs[0], state.speedKmh / 300));
    const dt = (state.frames - older.frames) / 1000;
    const velocity = toCar(sub(pos, older.position).map((v) => v / dt), q);
    note('[1..3] velocity in the car frame (left, up, forward) / 80', [0, 1, 2].every((c) => eq(obs[1 + c], clip(velocity[c] / 80), 1e-6)));
    // What the block MEANS: on its wheels and moving, "forward" is the speedometer's speed.
    if (state.wheelContact.every(Boolean) && state.speedKmh > 100) { forwardChecked++; if (Math.abs(obs[3] * 80 - state.speedKmh / 3.6) > 0.03 * state.speedKmh / 3.6) forwardOff++; }
    const up = toCar([0, 1, 0], q);
    note('[4..6] world up in the car frame', [0, 1, 2].every((c) => eq(obs[4 + c], up[c], 1e-6)));
    if (toWorld([0, 1, 0], q)[1] > 0.999) { levelSamples++; if (obs[5] > 0.999 && Math.abs(obs[4]) < 0.05 && Math.abs(obs[6]) < 0.05) upright++; }
    // Rotation rate: SimSession.motion() measures the spin over the same two states, in WORLD
    // axes; turned into the car's frame and divided by 5 it must be entries 7 to 9 (to 0.02:
    // the car's frame itself turns a little between the two states).
    const spin = toCar(sim.motion().spin, q);
    note('[7..9] rotation rate about the car\'s axes, rad/s / 5', [0, 1, 2].every((c) => Math.abs(obs[7 + c] - clip(spin[c] / 5)) < 0.02));
    note('[10..13] wheel contacts', [0, 1, 2, 3].every((c) => obs[10 + c] === (state.wheelContact[c] ? 1 : 0)));
    note('[14] steering angle / 0.45', eq(obs[14], clip(state.steering / 0.45)));
    note('[15] W minus S, [16] steering held (+1 left, -1 right)', obs[15] === (held.up ? 1 : 0) - (held.down ? 1 : 0) && obs[16] === (held.left ? 1 : held.right ? -1 : 0));
    // [17..20]
    const nearestLocal = toCar(sub(pts[at.index], pos), q);
    note('[17..19] nearest route point in the car frame / 10', [0, 1, 2].every((c) => eq(obs[17 + c], clip(nearestLocal[c] / 10), 1e-6)));
    note('[20] is 0 with lapFraction off', obs[20] === 0);
    note('[20] is the fraction of the route covered with lapFraction on', eq(second.obs[20], second.at.fraction) && eq(second.at.fraction, second.at.progress / route.length));
    if (second.at.fraction < previousFraction - 1e-3) fractionRises = false; previousFraction = second.at.fraction;
    // the 20 points ahead
    const gap = Math.max(2, state.speedKmh / 3.6 * 0.15);
    let pointsOk = true, curvatureOk = true, edgesOk = true, frameOk = true, slopeOk = true, roadOk = true;
    for (let k = 1; k <= 20; k++) {
      const i = Math.min(lastIndex, at.index + Math.round(k * gap));
      const local = toCar(sub(pts[i], pos), q);
      for (let c = 0; c < 3; c++) pointsOk &&= eq(obs[21 + 3 * (k - 1) + c], clip(local[c] / (k * gap)), 1e-6);
      curvatureOk &&= eq(obs[81 + k - 1], clip(route.curvature[i] / 0.05), 1e-6);
      edgesOk &&= eq(obs[104 + 2 * (k - 1)], route.edgeLeft[i] / 10, 1e-6) && eq(obs[105 + 2 * (k - 1)], route.edgeRight[i] / 10, 1e-6);
      const f = toCar(route.forward[i], q), u = toCar(route.up[i], q);
      for (let c = 0; c < 3; c++) frameOk &&= eq(obs[146 + 6 * k + c], f[c], 1e-6) && eq(obs[146 + 6 * k + 3 + c], u[c], 1e-6);
      slopeOk &&= eq(obs[272 + k - 1], route.slope[i], 1e-6);
      roadOk &&= obs[292 + k - 1] === (route.grounded[i] ? 1 : 0);
      // "each is roughly a unit direction": on the route, close to it, the vector to a point k gaps ahead is about k gaps long.
      if (k === 10 && at.offRoute < 3 && i < lastIndex) { unitChecked++; if (Math.abs(Math.hypot(obs[21 + 27], obs[21 + 28], obs[21 + 29]) - 1) < 0.15) unitish++; }
    }
    note('[21..80] 20 route points ahead in the car frame, each / (k x gap), gap = max(2, speed x 0.15 s)', pointsOk);
    note('[81..100] curvature at those points / 0.05', curvatureOk);
    note('[104..143] room beside the route at those points, left then right, / 10', edgesOk);
    const f0 = toCar(route.forward[at.index], q), u0 = toCar(route.up[at.index], q);
    note('[146..271] route forward (3) and road up (3) in the car frame, nearest point then the 20 ahead', frameOk && [0, 1, 2].every((c) => eq(obs[146 + c], f0[c], 1e-6) && eq(obs[149 + c], u0[c], 1e-6)));
    note('[272..291] slope at the 20 points', slopeOk);
    note('[292..311] 1 where the route is on the road', roadOk);
    // room at the car, flags
    const room = (d) => Math.max(-3, Math.min(20, d) / 10);
    note('[101, 102] room from the car to the road edge, left and right, / 10', eq(obs[101], room(at.edgeLeft)) && eq(obs[102], room(at.edgeRight)));
    note('[103] body contact, [144] S held, [145] pedals read at the coming decision', obs[103] === (contact ? 1 : 0) && obs[144] === (held.down ? 1 : 0) && obs[145] === (pedalOpen ? 1 : 0));
    // flights and gate
    const far = (d) => Math.sqrt(Math.max(0, Math.min(240, d)) / 240);
    const flight = route.jumps.find((j) => j.from >= at.index);
    note('[312] distance to the next flight, sqrt(d / 240), 1 if none within 240', eq(obs[312], flight ? far(flight.from - at.index) : 1, 1e-6));
    note('[313, 314] that flight\'s length and take-off speed (0 if none within 240)', flight && flight.from - at.index <= 240 ? eq(obs[313], far(flight.to - flight.from + 1), 1e-6) && eq(obs[314], flight.speed * 3.6 / 300, 1e-6) : obs[313] === 0 && obs[314] === 0);
    const gate = route.gateIndex[Math.min(state.nextCheckpointIndex, route.gateIndex.length - 1)];
    note('[315] distance along the route to the next gate, sqrt(d / 240) capped at 1', eq(obs[315], far(gate - at.index), 1e-6));
    note('[316] height of the car above the route / 10', eq(obs[316], clip(at.height / 10), 1e-6));
    // rays: the first is straight ahead from 0.5 above the car's origin, the last is straight down in world terms.
    const carUp = toWorld([0, 1, 0], q), eye = [0, 1, 2].map((c) => pos[c] + carUp[c] * 0.5);
    const reading = (dir) => Math.sqrt(Math.min(120, mesh.raycastFar(eye, dir, 120)) / 120);
    note('[317] the ray straight ahead, sqrt(distance / 120)', eq(obs[317], reading(toWorld([0, 0, 1], q)), 1e-6));
    note('[330] the ray straight down from the car, [333] the ray straight down in world terms', eq(obs[330], reading(toWorld([0, -1, 0], q)), 1e-6) && eq(obs[333], reading([0, -1, 0]), 1e-6));
    note('[317..333] every ray reading is between 0 and 1', obs.slice(317).every((v) => v >= 0 && v <= 1));
  }
  check(`observation: ${count} observations along the human lap are 334 finite numbers each`, count > 400 && wrongSize === 0 && notFinite === 0, `${count} observations, ${wrongSize} of the wrong size, ${notFinite} non-finite numbers`);
  check('observation: every number is within the documented clip of +-3', largest <= 3 + 1e-9, `largest magnitude ${fmt(largest, 3)}`);
  for (const [block, n] of Object.entries(bad)) check(`observation ${block}: matches our own computation on all ${count} observations`, n === 0, n ? `${n} mismatches` : '');
  check('observation: the "forward" velocity entry really is forward: within 3% of the speedometer whenever the car is on four wheels above 100 km/h', forwardChecked > 100 && forwardOff === 0, `${forwardOff} of ${forwardChecked} samples differ`);
  check('observation: with the car level, "world up in the car frame" reads (0, 1, 0)', levelSamples > 20 && upright === levelSamples, `${upright} of ${levelSamples} level samples`);
  check('observation: a route point 10 gaps ahead is about a unit direction (length 0.85 to 1.15) when the car is within 3 units of the route', unitChecked > 20 && unitish >= 0.95 * unitChecked, `${unitish} of ${unitChecked}`);
  check('observation: with lapFraction on, entry 20 rises along the lap and ends at 1', fractionRises && near(previousFraction, 1, 0.005), `ends at ${fmt(previousFraction, 4)}`);
  check('observation: the lap finished on the human\'s tick (so the whole route was observed)', sim.finished && sim.state.finishFrames === lap.frames, `${sim.state.finishFrames}`);
} finally { await sim.close(); }

// ---------------------------------------------------------------------------
// What the route's own arrays mean, checked from its points.
// ---------------------------------------------------------------------------
await section('route arrays', () => {
  const n = pts.length;
  // left = up x forward (car frame: x = left, y = up, z = forward).
  let handed = 0;
  for (let k = 0; k < n; k++) {
    const u = route.up[k], f = route.forward[k], l = [u[1] * f[2] - u[2] * f[1], u[2] * f[0] - u[0] * f[2], u[0] * f[1] - u[1] * f[0]];
    if (l[0] * route.left[k][0] + l[1] * route.left[k][1] + l[2] * route.left[k][2] > 0.95) handed++;
  }
  check('route: "left" is up x forward at every point (so + lateral is to the car\'s left)', handed >= 0.99 * n, `${handed} of ${n}`);
  // curvature: + = left, in radians per unit. Ours: turn of the path over 6 points either side, about the road's up.
  let agree = 0, compared = 0, ratioSum = 0;
  for (let k = 6; k < n - 6; k++) {
    if (!route.grounded[k] || Math.abs(route.curvature[k]) < 0.01) continue;
    const a = sub(pts[k], pts[k - 6]), b = sub(pts[k + 6], pts[k]), u = route.up[k];
    const cx = a[1] * b[2] - a[2] * b[1], cy = a[2] * b[0] - a[0] * b[2], cz = a[0] * b[1] - a[1] * b[0];
    const mine = Math.asin(Math.max(-1, Math.min(1, (cx * u[0] + cy * u[1] + cz * u[2]) / (Math.hypot(...a) * Math.hypot(...b))))) / ((Math.hypot(...a) + Math.hypot(...b)) / 2);
    compared++; if (Math.sign(mine) === Math.sign(route.curvature[k])) { agree++; ratioSum += mine / route.curvature[k]; }
  }
  check('route: curvature is + for a left bend and in radians per unit (sign agrees with our own from the points at 95% of bends, mean ratio 0.8 to 1.25)', compared > 100 && agree >= 0.95 * compared && ratioSum / agree > 0.8 && ratioSum / agree < 1.25, `${agree} of ${compared} agree in sign, mean ratio ${fmt(ratioSum / Math.max(1, agree), 2)}`);
  // slope: climb per unit of route.
  let slopeBad = 0, slopes = 0;
  for (let k = 4; k < n - 4; k++) { if (!route.grounded[k]) continue; slopes++; const mine = (pts[k + 4][1] - pts[k - 4][1]) / 8; if (Math.abs(mine - route.slope[k]) > 0.12) slopeBad++; }
  check('route: slope is the climb per unit along the route (within 0.12 of the height change over 8 points, at 97% of on-road points)', slopeBad <= 0.03 * slopes, `${slopeBad} of ${slopes} differ`);
  check('route: room beside the route is between 0 and 20 units on both sides everywhere', route.edgeLeft.every((v) => v >= 0 && v <= 20) && route.edgeRight.every((v) => v >= 0 && v <= 20));
});
