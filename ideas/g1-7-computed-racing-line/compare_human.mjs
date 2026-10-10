// Compute a racing line for a track and compare it, on paper, with the
// fastest human lap.
//
//   node ideas/g1-7-computed-racing-line/compare_human.mjs [track] [lap index]
//   node ideas/g1-7-computed-racing-line/compare_human.mjs desert4
//
// One simulator for about a second (to replay the human lap), then
// arithmetic; about 10 s in all. Needs car_model.json (fit_car.mjs).
// Writes ideas/g1-7-computed-racing-line/out/line_<track>.json, which
// drive_line.mjs drives in the simulator.
//
// It prints, in order:
//   1. the corridor: how much of the lap is free to move and how much pinned
//   2. gravity, measured from the human's flight (used by the speed profile)
//   3. CALIBRATION: the car model run along the human's own line, stretch by
//      stretch, against what the human's car really did. This says how far
//      the model can be trusted before it is asked about any other line.
//   4. the lines: predicted lap time of minimum-curvature lines for a range of
//      length weights, then of a direct search on the predicted time
//   5. where the best computed line differs from the human's
import { writeFileSync, mkdirSync } from 'node:fs';
import { humanLaps } from '../shared/laps.mjs';
import { buildCorridor } from './corridor.mjs';
import { loadCarModel, GRAVITY } from './car_model.mjs';
import { optimiseLine, optimiseTime, shiftedPoints, speedProfile, curvature } from './raceline.mjs';

const [track = 'desert4', lapIndex = '0'] = process.argv.slice(2);
const lap = humanLaps(track)[Number(lapIndex)];
const car = loadCarModel();
const corridor = await buildCorridor(track, lap);
const n = corridor.points.length;
const f = (v, d = 2, w = 7) => v.toFixed(d).padStart(w);

// ---- 1. corridor ---------------------------------------------------------------
const st = corridor.stats, pct = (x) => `${(100 * x / st.points).toFixed(0)}%`;
console.log(`${track}, human lap ${lapIndex}: ${(lap.frames / 1000).toFixed(3)} s, ${n} points (1 unit apart)`);
console.log(`corridor: free ${pct(st.free)}, in the air ${pct(st.air)}, near a jump ${pct(st.airGuard)}, banked or loop ${pct(st.tilted)}; median road width where free ${st.medianWidth.toFixed(1)} units`);

// ---- 2. gravity ----------------------------------------------------------------
// Longest airborne run: fit height = a + b t + c t^2 by least squares; gravity = -2c.
{
  let best = [0, 0];
  for (let k = 0, start = -1; k <= n; k++) {
    if (k < n && !corridor.grounded[k]) { if (start < 0) start = k; }
    else if (start >= 0) { if (k - start > best[1] - best[0]) best = [start, k]; start = -1; }
  }
  if (best[1] - best[0] > 10) {
    const ts = [], ys = [];
    for (let k = best[0]; k < best[1]; k++) { ts.push((corridor.tick[k] - corridor.tick[best[0]]) / 1000); ys.push(corridor.points[k][1]); }
    // Normal equations for a quadratic.
    const S = (p) => ts.reduce((s, t) => s + t ** p, 0), Sy = (p) => ts.reduce((s, t, i) => s + ys[i] * t ** p, 0);
    const A = [[S(0), S(1), S(2), Sy(0)], [S(1), S(2), S(3), Sy(1)], [S(2), S(3), S(4), Sy(2)]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (j !== i) { const m = A[j][i] / A[i][i]; for (let c = 0; c < 4; c++) A[j][c] -= m * A[i][c]; }
    console.log(`gravity from the longest flight (${(ts.at(-1)).toFixed(2)} s, points ${best[0]}..${best[1]}): ${(-2 * A[2][3] / A[2][2]).toFixed(2)} units/s^2 (the profile uses ${GRAVITY})`);
  }
}

// ---- 3. calibration ------------------------------------------------------------
// For each free stretch: start at the human's speed, hold W along the human's
// own path, and compare time and exit speed with what happened.
const human = speedProfile(corridor, corridor.points, car);
console.log('\ncalibration: the model along the human\'s own line, each free stretch entered at the human\'s speed');
console.log('  points       human s  model s   diff   exit km/h human/model   W held  steering held  turn share');
const kappaHuman = curvature(corridor.points, corridor.up);
let humanFree = 0, modelFree = 0;
for (let k = 0; k < n;) {
  if (!corridor.free[k]) { k++; continue; }
  let end = k; while (end + 1 < n && corridor.free[end + 1]) end++;
  if (end - k >= 20) {
    let v = Math.max(corridor.kmh[k] / 3.6, 0.01), t = 0, shareSum = 0;
    for (let j = k; j < end; j++) {
      const ds = Math.hypot(...[0, 1, 2].map((c) => corridor.points[j + 1][c] - corridor.points[j][c]));
      const share = Math.abs(kappaHuman[j]) / car.kappaMax(v);
      shareSum += Math.min(share, 2);
      const slope = (corridor.points[j + 1][1] - corridor.points[j][1]) / ds;
      const next = Math.sqrt(Math.max(1e-4, v * v + 2 * ds * (car.accel(v, share) - GRAVITY * slope)));
      t += ds / ((v + next) / 2); v = next;
    }
    const t0 = corridor.tick[k], t1 = corridor.tick[end];
    let w = 0, steer = 0;
    for (let tick = t0; tick < t1; tick++) { if (lap.keys[tick].up) w++; if (lap.keys[tick].left || lap.keys[tick].right) steer++; }
    const hs = (t1 - t0) / 1000;
    humanFree += hs; modelFree += t;
    console.log(`  ${String(k).padStart(4)}..${String(end).padEnd(4)}  ${f(hs, 3)}  ${f(t, 3)} ${f(t - hs, 3)}      ${f(corridor.kmh[end], 0, 4)} / ${f(v * 3.6, 0, 4)}        ${f(100 * w / (t1 - t0), 0, 3)}%     ${f(100 * steer / (t1 - t0), 0, 3)}%        ${f(shareSum / (end - k), 2, 5)}`);
  }
  k = end + 1;
}
console.log(`  free stretches in total: human ${humanFree.toFixed(3)} s, model ${modelFree.toFixed(3)} s`);
console.log(`whole lap along the human's line, model's own speeds throughout: ${human.seconds.toFixed(3)} s predicted against ${(lap.frames / 1000).toFixed(3)} s real (${(human.seconds - lap.frames / 1000 >= 0 ? '+' : '')}${(human.seconds - lap.frames / 1000).toFixed(3)} s)`);

// ---- 4. the lines ---------------------------------------------------------------
console.log('\ncomputed lines (lengthWeight 0 = minimum curvature; larger = shorter path)');
console.log('  weight   predicted s   vs human-line prediction   length   largest shift   mean turn share where free');
let best = null;
for (const lengthWeight of [0, 0.001, 0.003, 0.01, 0.03, 0.1]) {
  const shift = optimiseLine(corridor, { lengthWeight });
  const points = shiftedPoints(corridor, shift);
  const profile = speedProfile(corridor, points, car);
  let shareSum = 0, count = 0, most = 0;
  for (let k = 0; k < n; k++) { most = Math.max(most, Math.abs(shift[k])); if (corridor.free[k]) { shareSum += Math.min(profile.share[k], 2); count++; } }
  console.log(`  ${f(lengthWeight, 3, 6)}   ${f(profile.seconds, 3, 9)}    ${f(profile.seconds - human.seconds, 3, 12)}             ${f(profile.length, 1)}   ${f(most, 1, 8)}          ${f(shareSum / count, 2, 6)}`);
  if (!best || profile.seconds < best.profile.seconds) best = { lengthWeight, shift, points, profile };
}
console.log(`  (human's line: length ${human.length.toFixed(1)}, predicted ${human.seconds.toFixed(3)} s)`);

// The search on predicted time itself, from the human's line.
{
  const t0 = Date.now();
  const found = optimiseTime(corridor, car, { log: (text) => console.log(`  ${text}`) });
  const points = shiftedPoints(corridor, found.shift);
  const profile = speedProfile(corridor, points, car);
  let most = 0; for (const a of found.shift) most = Math.max(most, Math.abs(a));
  console.log(`search on predicted time: ${found.startSeconds.toFixed(3)} -> ${found.seconds.toFixed(3)} s (${(found.seconds - found.startSeconds).toFixed(3)} s), length ${profile.length.toFixed(1)}, largest shift ${most.toFixed(1)}, ${found.evaluations} tries in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (profile.seconds < best.profile.seconds) best = { lengthWeight: 'time search', shift: found.shift, points, profile };
}

// ---- 5. where they differ --------------------------------------------------------
console.log(`\nbest computed line (${best.lengthWeight === 'time search' ? 'time search' : `lengthWeight ${best.lengthWeight}`}) against the human, every 100 units`);
console.log('  point  state   shift   human km/h  computed km/h   human s   computed s   gain so far');
for (let k = 0; k < n; k += 100) {
  const state = corridor.free[k] ? 'free' : !corridor.grounded[k] ? 'air' : corridor.nearAir[k] ? 'jump' : 'bank';
  console.log(`  ${String(k).padStart(5)}  ${state.padEnd(5)} ${f(best.shift[k], 1, 6)}   ${f(corridor.kmh[k], 0, 8)}  ${f(best.profile.v[k] * 3.6, 0, 11)}   ${f(corridor.tick[k] / 1000, 2, 9)}   ${f(best.profile.time[k], 2, 9)}   ${f(corridor.tick[k] / 1000 - best.profile.time[k], 2, 9)}`);
}
console.log(`  finish                                          ${f(lap.frames / 1000, 2, 9)}   ${f(best.profile.seconds, 2, 9)}   ${f(lap.frames / 1000 - best.profile.seconds, 2, 9)}`);

// ---- the file for drive_line.mjs ------------------------------------------------
// Both lines in the form sim/controller.mjs follows: points, a target speed
// per point, and whether the wheels are down there.
const round = (a, d) => Array.from(a, (v) => Number(v.toFixed(d)));
const pack = (points, v, shift) => ({ points: points.map((p) => round(p, 3)), speedKmh: round(Array.from(v, (x) => x * 3.6), 1), shift: round(shift, 2) });
mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
const out = new URL(`./out/line_${track}.json`, import.meta.url);
writeFileSync(out, JSON.stringify({
  track, humanFrames: lap.frames, lapIndex: Number(lapIndex), method: String(best.lengthWeight),
  predicted: { humanLine: Number(human.seconds.toFixed(3)), computed: Number(best.profile.seconds.toFixed(3)) },
  grounded: corridor.grounded, free: corridor.free,
  human: { points: corridor.points.map((p) => round(p, 3)), speedKmh: round(corridor.kmh, 1), modelSpeedKmh: round(Array.from(human.v, (x) => x * 3.6), 1) },
  computed: pack(best.points, best.profile.v, best.shift),
}));
console.log(`\nwrote ideas/g1-7-computed-racing-line/out/line_${track}.json`);
