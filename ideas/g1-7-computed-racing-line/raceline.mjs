// A racing line inside a corridor, and the speed the fitted car can carry
// along it. No simulator: this is arithmetic on corridor.mjs's arrays and
// car_model.mjs's functions.
//
//   const shift = optimiseLine(corridor, { lengthWeight });   // units, + = left
//   const shift = optimiseTime(corridor, car).shift;          // or: search on predicted time
//   const points = shiftedPoints(corridor, shift);
//   const profile = speedProfile(corridor, points, car);       // { v, time, seconds, ... }
//
// THE LINE. Each point of the corridor's centre may move sideways by
// shift[k], between corridor.lo[k] and corridor.hi[k]. optimiseLine picks the
// shifts that make
//     sum of (bend at each point)^2  +  lengthWeight * sum of (step length)^2
// as small as possible. With lengthWeight 0 that is the classic
// "minimum-curvature" line (as straight as the road allows); raising it
// trades some straightness for a shorter way round. Which weight is fastest
// is decided by speedProfile's predicted lap time (compare_human.mjs sweeps it).
//
// Measured on desert4: that classic line is the WRONG target for this car.
// The human holds W for the whole lap and takes the long corners at exactly
// the radius the steering key gives at that speed (a constant 240 units at
// 450 km/h). The minimum-curvature line has a smaller SUM of squared bends
// (1.20e-2 against the human's 1.30e-2) but gets it by going straighter early
// and then turning at 176 units radius to rejoin, which this car can only do
// at 372 km/h: predicted 1.0 s SLOWER than the human's line. What matters for
// this car is never exceeding the steering limit, not the total bend. So
// optimiseTime below searches on the predicted lap time itself, starting from
// the reference lap's line.
//
// THE SPEED. The standard two passes over the line:
//   limit     at each point, the fastest the car can go round that bend
//             (car.speedFor(curvature))
//   forward   from the start, speed up as hard as the car can (W held), never
//             above the limit
//   backward  from the finish, make sure the car could have braked in time
//             for every limit
// The car model is for FLAT road. Where the corridor is pinned (in the air,
// near a jump, banked road, a loop) the model does not apply, so there the
// profile copies what the reference lap did, scaled: the speed keeps the
// ratio to the reference's speed that it arrived with.
// In the air and near a jump it also may not go faster than the reference
// did, because a faster take-off lands somewhere else.
// Consequence worth knowing: on the reference lap's own line, pinned
// stretches cost exactly the reference's time when entered at its speed, so
// any difference in predicted time comes from the free stretches. And the
// profile says nothing about whether a jump still WORKS at another speed.
import { GRAVITY } from './car_model.mjs';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The corridor's centre moved sideways by shift[k] at each point. */
export function shiftedPoints(corridor, shift) {
  return corridor.points.map((p, k) => [p[0] + corridor.left[k][0] * shift[k], p[1] + corridor.left[k][1] * shift[k], p[2] + corridor.left[k][2] * shift[k]]);
}

/**
 * Signed curvature of a path at each point, 1/units, positive = turning left.
 * Only the turn about the road's own up axis counts (what steering answers;
 * a crest bends the path too but is not a corner). Measured from the points
 * `window` either side: at 1-unit spacing a lap's positions carry float32
 * jitter, and 8 units is short against the 90 to 300 unit radii of real
 * corners here.
 */
export function curvature(points, up, window = 8) {
  const n = points.length, out = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const i = Math.max(0, k - window), j = Math.min(n - 1, k + window);
    if (i === k || j === k) continue;
    const u = up[k];
    const flat = (v) => { const d = dot(v, u); return [v[0] - d * u[0], v[1] - d * u[1], v[2] - d * u[2]]; };
    const a = flat(sub(points[k], points[i])), b = flat(sub(points[j], points[k]));
    const la = Math.hypot(...a), lb = Math.hypot(...b);
    if (la < 1e-6 || lb < 1e-6) continue;
    // sin of the turn angle = (a x b) . up / (|a||b|). Positive = a left
    // turn (checked by hand: up +y, heading +z, left is +x; a step towards
    // +x gives a x b along +y).
    const cx = a[1] * b[2] - a[2] * b[1], cy = a[2] * b[0] - a[0] * b[2], cz = a[0] * b[1] - a[1] * b[0];
    const sin = Math.max(-1, Math.min(1, (cx * u[0] + cy * u[1] + cz * u[2]) / (la * lb)));
    out[k] = Math.asin(sin) / ((la + lb) / 2);
  }
  return out;
}

/**
 * Choose the shifts. Returns a Float64Array, one per corridor point.
 *
 *   lengthWeight  0 = minimum curvature; larger = prefer a shorter path
 *   step          the line is solved on every `step`-th point and filled in
 *                 between. Solving on all 1900 points directly does not
 *                 converge in any reasonable time: the method below smooths a
 *                 stretch of L points in about L^4 sweeps.
 *   sweeps        passes of the solver at the finest level
 *
 * Method: coordinate descent. The cost is a sum of squares of expressions
 * that are linear in the shifts, so with every other shift held fixed the
 * best value of one shift has a closed form; clamp it to its bounds and move
 * on (Gauss-Seidel with projection). It is run first on every 4*step-th
 * point, then 2*step, then step, each starting from the coarser answer, so
 * the long gentle shape is found where it is cheap.
 */
export function optimiseLine(corridor, { lengthWeight = 0, step = 4, sweeps = 3000 } = {}) {
  const n = corridor.points.length;
  const shift = new Float64Array(n);
  for (const s of [step * 4, step * 2, step]) {
    // Stations of this level, always including the last point.
    const idx = [];
    for (let k = 0; k < n; k += s) idx.push(k);
    if (idx.at(-1) !== n - 1) idx.push(n - 1);
    const m = idx.length;
    // Bounds at a station: the tightest of the fine points it stands for, so
    // the filled-in line between stations stays inside too.
    const lo = new Float64Array(m), hi = new Float64Array(m);
    for (let i = 0; i < m; i++) {
      let l = -Infinity, h = Infinity;
      for (let k = Math.max(0, idx[i] - (s >> 1)); k <= Math.min(n - 1, idx[i] + (s >> 1)); k++) { l = Math.max(l, corridor.lo[k]); h = Math.min(h, corridor.hi[k]); }
      lo[i] = l; hi[i] = h;
    }
    const c = idx.map((k) => corridor.points[k]), d = idx.map((k) => corridor.left[k]);
    const a = Float64Array.from(idx, (k, i) => Math.max(lo[i], Math.min(hi[i], shift[k])));
    const p = c.map((q, i) => [q[0] + d[i][0] * a[i], q[1] + d[i][1] * a[i], q[2] + d[i][2] * a[i]]);
    // Cost terms that contain a[i]:
    //   bend at j = p[j-1] - 2 p[j] + p[j+1], for j = i-1 (weight +1 on p[i]),
    //                                           j = i (weight -2), j = i+1 (weight +1)
    //   step j = p[j+1] - p[j], for j = i-1 (weight +1) and j = i (weight -1)
    // Each is (rest + w * d[i] * a[i]); the cost is quadratic in a[i] with
    // curvature sum(w^2) (d is a unit vector) and slope sum(w * rest . d).
    // The first and last stations stay where the lap started and finished.
    for (let sweep = 0; sweep < sweeps; sweep++) {
      let moved = 0;
      for (let i = 1; i < m - 1; i++) {
        if (lo[i] === hi[i]) continue;
        let quad = 0, lin = 0;
        const term = (w, r, weight) => { quad += weight * w * w; lin += weight * w * (dot(r, d[i]) - w * a[i]); };
        const bend = (j) => [p[j - 1][0] - 2 * p[j][0] + p[j + 1][0], p[j - 1][1] - 2 * p[j][1] + p[j + 1][1], p[j - 1][2] - 2 * p[j][2] + p[j + 1][2]];
        if (i >= 2) term(1, bend(i - 1), 1);
        term(-2, bend(i), 1);
        if (i <= m - 3) term(1, bend(i + 1), 1);
        if (lengthWeight) { term(1, sub(p[i], p[i - 1]), lengthWeight); term(-1, sub(p[i + 1], p[i]), lengthWeight); }
        // dot(r, d) includes this point's own contribution w * a[i]; `lin` has it removed.
        const best = Math.max(lo[i], Math.min(hi[i], -lin / quad));
        moved = Math.max(moved, Math.abs(best - a[i]));
        a[i] = best;
        p[i] = [c[i][0] + d[i][0] * best, c[i][1] + d[i][1] * best, c[i][2] + d[i][2] * best];
      }
      if (moved < 1e-5) break;
    }
    // Fill in between stations (straight interpolation of the shift), then
    // clamp each fine point to its own bounds.
    for (let i = 0; i < m - 1; i++) for (let k = idx[i]; k <= idx[i + 1]; k++) {
      const f = (k - idx[i]) / (idx[i + 1] - idx[i]);
      shift[k] = Math.max(corridor.lo[k], Math.min(corridor.hi[k], a[i] + (a[i + 1] - a[i]) * f));
    }
  }
  return shift;
}

/** Allowance on the cornering limit: a bend counts as takeable at speed v if
 *  its curvature is within this fraction above the car's measured limit.
 *  The curvature of a path sampled from float32 positions is noisy: where
 *  human drivers hold a steering key steadily (so the car is exactly at its
 *  limit), check_turn_limit.mjs measures curvature / limit with a median of
 *  0.98 to 1.02 and a 90th percentile up to 1.04 on five tracks. Without an
 *  allowance that noise reads as "too fast here" and the profile brakes. */
export const TOLERANCE = 0.03;

/**
 * Search for the shifts with the lowest PREDICTED LAP TIME (speedProfile).
 *
 * Plain local search: push the line sideways by a smooth bump (a bell shape
 * `width` units wide, `size` units high, left or right) centred on one point
 * after another, and keep the push if the predicted lap gets shorter. Wide
 * bumps first, then narrower and smaller ones; repeat until a whole pass
 * gains under 1 ms or `maxPasses` is reached. Starts from `start` (default:
 * the reference lap's own line), so the result is never predicted slower
 * than where it started.
 *
 * Returns { shift, seconds, startSeconds, evaluations, passes }.
 * Cost: one speedProfile per try, about 0.5 ms for 1900 points; a pass is
 * about 2600 tries.
 */
export function optimiseTime(corridor, car, { start = null, widths = [60, 30, 15], sizes = [1.5, 0.5, 0.15], maxPasses = 12, log = null } = {}) {
  const n = corridor.points.length;
  let shift = start ? Float64Array.from(start) : new Float64Array(n);
  const predict = (a) => speedProfile(corridor, shiftedPoints(corridor, a), car).seconds;
  let seconds = predict(shift);
  const startSeconds = seconds;
  let evaluations = 1, passes = 0;
  for (; passes < maxPasses; passes++) {
    const before = seconds;
    for (const width of widths) for (const size of sizes) for (let centre = 0; centre < n; centre += width >> 1) {
      if (!corridor.free[centre]) continue;
      for (const sign of [1, -1]) {
        const trial = Float64Array.from(shift);
        let changed = false;
        for (let k = Math.max(0, centre - 3 * width); k <= Math.min(n - 1, centre + 3 * width); k++) {
          const moved = Math.max(corridor.lo[k], Math.min(corridor.hi[k], shift[k] + sign * size * Math.exp(-0.5 * ((k - centre) / (width / 2)) ** 2)));
          if (moved !== shift[k]) { trial[k] = moved; changed = true; }
        }
        if (!changed) continue;
        const t = predict(trial); evaluations++;
        if (t < seconds - 1e-5) { seconds = t; shift = trial; break; } // took this side; do not try the other
      }
    }
    log?.(`pass ${passes + 1}: ${seconds.toFixed(3)} s predicted`);
    if (before - seconds < 0.001) { passes++; break; }
  }
  return { shift, seconds, startSeconds, evaluations, passes };
}

/**
 * The speed the fitted car can carry along `points` (one per corridor point).
 *
 * Returns
 *   v        speed at each point, units/s
 *   limit    the cornering limit at each point, units/s (Infinity where pinned)
 *   kappa    signed curvature, 1/units
 *   share    |kappa| / the car's tightest curvature at v: 1 = steering key held all the time
 *   time     seconds from the start to each point
 *   seconds  predicted lap time
 *   length   path length, units
 */
export function speedProfile(corridor, points, car, { tolerance = TOLERANCE } = {}) {
  const n = points.length;
  const kappa = curvature(points, corridor.up);
  const ds = new Float64Array(n - 1);
  let length = 0;
  for (let k = 0; k < n - 1; k++) { ds[k] = Math.hypot(...sub(points[k + 1], points[k])); length += ds[k]; }
  const ref = Float64Array.from(corridor.kmh, (kmh) => kmh / 3.6);  // the reference lap's speed
  const limit = new Float64Array(n), v = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    // Floored at 0.1 units/s (the floor the start line and ratio() use below):
    // speedFor() returns 0 for a bend tighter than the car's tightest turn
    // (radius 7.5 units at 25 km/h), and two points at speed 0 made the lap
    // time Infinity, which optimiseTime cannot search its way out of (no
    // trial is ever "shorter"). With the floor such a bend costs a very long
    // but finite time. (Found by tests/test_1_raceline.mjs, hairpin case.)
    if (corridor.free[k]) limit[k] = Math.max(0.1, car.speedFor(Math.abs(kappa[k]) / (1 + tolerance)));
    // In the air or within reach of a jump: not faster than the reference.
    // Banked road and loops (grounded, pinned): no limit of ours applies.
    else limit[k] = corridor.nearAir[k] ? ref[k] : Infinity;
  }
  // One step of road, k -> k+1.
  //   free road   v^2 changes by 2 * distance * acceleration, with the pedal's
  //               acceleration from the car model and gravity along the slope
  //   pinned      the speed keeps its RATIO to the reference lap's: a car
  //               that arrives 3% slower than the reference leaves 3% slower.
  //               (Copying the reference's change of v^2 instead was tried
  //               first and breaks: a car arriving slower than the reference
  //               at a climb or a flight that costs speed runs out of v^2 and
  //               stops, which gave "4882 s" on summer1.)
  const pinnedStep = (k) => !corridor.free[k] || !corridor.free[k + 1];
  const ratio = (k) => Math.max(ref[k + 1], 0.1) / Math.max(ref[k], 0.1);
  const change = (k, speed, pedal) => {
    const share = Math.abs(kappa[k]) / car.kappaMax(speed);
    // Gravity along the road: climbing costs speed.
    const slope = (points[k + 1][1] - points[k][1]) / (ds[k] || 1);
    return 2 * ds[k] * (pedal(speed, share) - GRAVITY * slope);
  };
  // Forward: W held.
  // (0.1 units/s at the start line, the same floor ratio() uses: some tracks
  // start on a pinned stretch, and a smaller start than the floor would be
  // carried along as a tiny fraction of the reference's speed.)
  v[0] = Math.max(ref[0], 0.1);
  for (let k = 0; k < n - 1; k++) {
    const next = pinnedStep(k) ? v[k] * ratio(k) : Math.sqrt(Math.max(1e-4, v[k] ** 2 + change(k, v[k], car.accel)));
    v[k + 1] = Math.min(limit[k + 1], next);
  }
  // Backward: could the car have got from v[k] down to v[k+1] over this step
  // (S held on free road; the reference's ratio where pinned)?
  for (let k = n - 2; k >= 0; k--) {
    const most = pinnedStep(k) ? v[k + 1] / ratio(k) : Math.sqrt(Math.max(1e-4, v[k + 1] ** 2 - change(k, v[k + 1], car.brake)));
    if (v[k] > most) v[k] = most;
  }
  const time = new Float64Array(n);
  for (let k = 0; k < n - 1; k++) time[k + 1] = time[k] + ds[k] / ((v[k] + v[k + 1]) / 2);
  const share = Float64Array.from(kappa, (c, k) => Math.abs(c) / car.kappaMax(v[k]));
  return { v, limit, kappa, share, time, seconds: time[n - 1], length };
}
