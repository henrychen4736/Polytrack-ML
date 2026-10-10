// raceline.mjs on cases with a known answer. No simulator.
//
// The speed profile is checked with a MADE-UP car whose numbers are constants
// (acceleration a, braking b, tightest curvature c / v), so every expected
// value below can be worked out by hand:
//   straight at constant acceleration   v^2 = v0^2 + 2 a s,  t = (v - v0) / a
//   constant-radius corner              v = c * R            (speedFor(1/R))
//   corner between two straights        the braking point is where the
//                                       accelerating curve meets the braking
//                                       curve into the corner
// and then once more with the fitted car, against the README's own numbers.
import { curvature, speedProfile, shiftedPoints, optimiseLine, optimiseTime, TOLERANCE } from '../raceline.mjs';
import { loadCarModel, GRAVITY } from '../car_model.mjs';
import { check, near, within, fmt, section } from './_check.mjs';

const UP = [0, 1, 0];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(...a); return a.map((x) => x / l); };

/** Points 1 unit apart: straight along +z for `before`, an arc of radius R turning
 *  LEFT (towards +x: the car frame is x = left, z = forward) through `angle`, then
 *  straight for `after`. R < 0 turns right. */
function straightArcStraight(before, R, angle, after) {
  const points = [];
  for (let k = 0; k <= before; k++) points.push([0, 0, k]);
  const sign = Math.sign(R), r = Math.abs(R), steps = Math.round(r * angle);
  for (let k = 1; k <= steps; k++) { const a = k / r; points.push([sign * r * (1 - Math.cos(a)), 0, before + r * Math.sin(a)]); }
  const end = points.at(-1), a = steps / r, dir = [sign * Math.sin(a), 0, Math.cos(a)];
  for (let k = 1; k <= after; k++) points.push([end[0] + dir[0] * k, 0, end[2] + dir[2] * k]);
  return points;
}

/** A corridor object with just the fields raceline.mjs reads. */
function makeCorridor(points, { kmh = 0, free = true, nearAir = false, room = 10, up = UP } = {}) {
  const n = points.length;
  const arr = (v) => (Array.isArray(v) || ArrayBuffer.isView(v) ? v : new Array(n).fill(v));
  const ups = Array.isArray(up[0]) ? up : new Array(n).fill(up);
  const left = points.map((_, k) => {
    const a = points[Math.max(0, k - 1)], b = points[Math.min(n - 1, k + 1)];
    return unit(cross(ups[k], unit([b[0] - a[0], b[1] - a[1], b[2] - a[2]])));
  });
  const fr = arr(free);
  return {
    points, up: ups, left, kmh: arr(kmh), free: fr, nearAir: arr(nearAir),
    lo: Float64Array.from(fr, (f) => (f ? -room : 0)), hi: Float64Array.from(fr, (f) => (f ? room : 0)),
  };
}

/** The made-up car: constant pedals, tightest curvature c / v. */
const fakeCar = ({ a = 10, b = 40, c = 0.4, top = 1000 } = {}) => ({
  topSpeed: top, accel: () => a, brake: () => -b, coast: () => 0,
  kappaMax: (v) => c / Math.max(v, 1e-12), speedFor: (kappa) => (kappa <= c / top ? top : c / kappa),
});

// ---------------------------------------------------------------------------
// curvature()
// ---------------------------------------------------------------------------
await section('curvature', () => {
  // Straight: exactly zero everywhere.
  const straight = Array.from({ length: 60 }, (_, k) => [3, 1, 2 * k]);
  const ks = curvature(straight, straight.map(() => UP));
  check('curvature: a straight line has curvature exactly 0 at every point', ks.every((v) => v === 0));

  // Circle of radius 100, left turn, 1 unit per point. The estimate uses chords
  // 8 points long, so by hand it is (4/R) / sin(4/R) / R = 1.00027 / R.
  for (const [R, tol] of [[100, 0.001], [-100, 0.001], [240, 0.001], [25, 0.01]]) {
    const pts = straightArcStraight(0, R, Math.PI, 0);
    const k = curvature(pts, pts.map(() => UP));
    const mid = k[pts.length >> 1];
    check(`curvature: circle of radius ${Math.abs(R)} turning ${R > 0 ? 'left gives +' : 'right gives -'}1/R within ${tol * 100}%`,
      within(mid, 1 / R, tol) && Math.sign(mid) === Math.sign(R), `got ${fmt(mid, 6)}, expected ${fmt(1 / R, 6)}`);
    // Every interior point (a full window either side) must agree with the middle one.
    let worst = 0; for (let i = 8; i < pts.length - 8; i++) worst = Math.max(worst, Math.abs(k[i] - mid));
    check(`curvature: radius ${Math.abs(R)} circle is uniform away from the ends`, worst < Math.abs(mid) * 1e-6, `largest difference ${worst.toExponential(2)}`);
  }

  // The ends: fewer points are available than the window. A circle's curvature is
  // the same everywhere, so the answer should still be 1/R there (first and last
  // point excepted, which have only one neighbour).
  {
    const pts = straightArcStraight(0, 100, 1, 0);
    const k = curvature(pts, pts.map(() => UP));
    check('curvature: points 1..7 of a circle (short window before) still give 1/R within 1%', [1, 2, 4, 7].every((i) => within(k[i], 0.01, 0.01)), `k[1]=${fmt(k[1], 5)} k[4]=${fmt(k[4], 5)}`);
    check('curvature: first and last point report 0 (no neighbour on one side)', k[0] === 0 && k.at(-1) === 0);
  }

  // A crest (the path bends about a sideways axis) is not a corner: 0 with up = +y.
  {
    const pts = Array.from({ length: 80 }, (_, k) => [0, 50 * (1 - Math.cos(k / 50)) * -1, 50 * Math.sin(k / 50)]);
    const k = curvature(pts, pts.map(() => UP));
    check('curvature: a crest (bend in the vertical plane) counts as 0', k.every((v) => Math.abs(v) < 1e-12));
  }

  // The same radius-100 circle drawn on a plane banked 30 degrees: with the plane's
  // normal as "up" the answer must not change, and the sign must follow that up.
  {
    const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
    const tilt = (p) => [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]];   // rotate about z
    const pts = straightArcStraight(0, 100, 1.5, 0).map(tilt), up = tilt(UP);
    const k = curvature(pts, pts.map(() => up));
    check('curvature: circle on a 30-degree banked plane, with the plane normal as up, still gives +1/R', within(k[60], 0.01, 0.001), `got ${fmt(k[60], 6)}`);
    const flipped = curvature(pts, pts.map(() => up.map((x) => -x)));
    check('curvature: the sign follows the up vector (up reversed gives -1/R)', within(flipped[60], -0.01, 0.001));
  }

  // Corner between straights: zero well inside the straights, 1/R well inside the arc.
  {
    const pts = straightArcStraight(100, 50, Math.PI / 2, 100);
    const k = curvature(pts, pts.map(() => UP));
    check('curvature: straight-arc-straight is 0 on the straights and 1/50 in the arc', k[50] === 0 && Math.abs(k[pts.length - 50]) < 1e-9 && within(k[140], 0.02, 0.002), `straight ${k[50]}, arc ${fmt(k[140], 5)}`);
    // The window smears the corner's entry over 8 points either side and no further.
    check('curvature: the corner entry is smeared over exactly the 8-point window', k[91] === 0 && k[93] > 0 && within(k[108], k[140], 1e-6), `k[91]=${k[91]} k[93]=${fmt(k[93], 5)} k[108]=${fmt(k[108], 5)}`);
  }
});

// ---------------------------------------------------------------------------
// shiftedPoints()
// ---------------------------------------------------------------------------
await section('shiftedPoints', () => {
  const corridor = { points: [[0, 0, 0], [0, 0, 1], [5, 2, 2]], left: [[1, 0, 0], [0, 0, -1], [0.6, 0, 0.8]] };
  const out = shiftedPoints(corridor, [2, -3, 5]);
  const want = [[2, 0, 0], [0, 0, 4], [8, 2, 6]];
  check('shiftedPoints: point + left * shift, worked by hand for three points', out.every((p, i) => p.every((v, c) => near(v, want[i][c], 1e-12))), JSON.stringify(out));
  // Handedness the corridor relies on: up = +y, heading +z, left must be +x.
  check('left = up x forward is +x for up = +y, forward = +z (car frame x = left)', cross(UP, [0, 0, 1]).join() === '1,0,0');
});

// ---------------------------------------------------------------------------
// speedProfile(): the made-up car
// ---------------------------------------------------------------------------
/** Largest and smallest acceleration the profile asks for anywhere: d(v^2) / (2 ds). */
function pedalRange(points, v) {
  let most = -Infinity, least = Infinity;
  for (let k = 0; k < points.length - 1; k++) {
    const ds = Math.hypot(points[k + 1][0] - points[k][0], points[k + 1][1] - points[k][1], points[k + 1][2] - points[k][2]);
    const acc = (v[k + 1] ** 2 - v[k] ** 2) / (2 * ds);
    most = Math.max(most, acc); least = Math.min(least, acc);
  }
  return { most, least };
}

await section('speedProfile straight', () => {
  // 500 units of straight, entered at 36 km/h = 10 units/s, a = 5.
  const pts = straightArcStraight(500, 100, 0, 0);
  const car = fakeCar({ a: 5 });
  const p = speedProfile(makeCorridor(pts, { kmh: 36 }), pts, car);
  let worst = 0; for (let k = 0; k <= 500; k++) worst = Math.max(worst, Math.abs(p.v[k] - Math.sqrt(100 + 10 * k)));
  check('profile: straight at constant acceleration follows v^2 = v0^2 + 2 a s at every point', worst < 1e-9, `largest error ${worst.toExponential(2)} units/s`);
  // t = (v_end - v0) / a = (sqrt(5100) - 10) / 5 = 12.28286 s
  check('profile: straight lap time is (v_end - v0) / a = 12.28286 s', near(p.seconds, (Math.sqrt(5100) - 10) / 5, 1e-9), `got ${fmt(p.seconds, 6)}`);
  check('profile: length of a 500-unit straight is 500', near(p.length, 500, 1e-9));
  check('profile: time[] starts at 0, rises strictly, ends at seconds', p.time[0] === 0 && p.time.every((t, k) => k === 0 || t > p.time[k - 1]) && p.time.at(-1) === p.seconds);
  // From rest: the start speed is floored at 0.1 units/s.
  const rest = speedProfile(makeCorridor(pts, { kmh: 0 }), pts, car);
  check('profile: a standing start begins at the 0.1 units/s floor and reaches sqrt(0.01 + 2 a s)', rest.v[0] === 0.1 && near(rest.v[500], Math.sqrt(0.01 + 5000), 1e-9), `v[500]=${fmt(rest.v[500], 4)}`);
  // Top speed caps the straight.
  const capped = speedProfile(makeCorridor(pts, { kmh: 36 }), pts, fakeCar({ a: 5, top: 40 }));
  check('profile: speed on a straight never exceeds the car\'s top speed', Math.max(...capped.v) === 40 && capped.v[500] === 40, `max ${Math.max(...capped.v)}`);
});

await section('speedProfile slope', () => {
  // A car with no engine rolling down a 10% slope (0.1 down per unit of road)
  // gains v^2 = 2 g h: after 100 units of road, v^2 = 10^2 + 2 * GRAVITY * 10.
  const dz = Math.sqrt(1 - 0.01);
  const down = Array.from({ length: 101 }, (_, k) => [0, -0.1 * k, dz * k]);
  const car = fakeCar({ a: 0, b: 0 });
  const p = speedProfile(makeCorridor(down, { kmh: 36 }), down, car);
  check('profile: rolling down a 10% slope gains v^2 = 2 g h (gravity along the road, downhill speeds up)', near(p.v[100] ** 2, 100 + 2 * GRAVITY * 10, 1e-6), `v^2 = ${fmt(p.v[100] ** 2, 3)}, expected ${fmt(100 + 20 * GRAVITY, 3)}`);
  const upHill = down.map((q) => [q[0], -q[1], q[2]]);
  const q = speedProfile(makeCorridor(upHill, { kmh: 360 }), upHill, car);
  check('profile: climbing the same slope loses the same v^2', near(q.v[100] ** 2, 10000 - 2 * GRAVITY * 10, 1e-6), `v^2 = ${fmt(q.v[100] ** 2, 3)}`);
});

await section('speedProfile constant-radius corner', () => {
  // A long arc of radius 50; the made-up car's limit there is c * R = 0.4 * 50 = 20
  // units/s. Entered at 5 units/s: it must speed up to 20 and hold it.
  const pts = straightArcStraight(0, 50, 2 * Math.PI * 0.9, 0);
  const car = fakeCar();
  const p = speedProfile(makeCorridor(pts, { kmh: 18 }), pts, car, { tolerance: 0 });
  const mid = pts.length >> 1;
  // The 8-point chords overestimate a radius-50 curvature by 0.107% (worked in
  // the curvature test), so the limit comes out 0.107% under 20.
  check('profile: in a constant-radius corner the speed equals the car\'s limit for that radius (20 units/s for R = 50)', within(p.v[mid], 20, 0.002), `got ${fmt(p.v[mid], 4)}`);
  let flat = true; for (let k = 60; k < pts.length - 10; k++) flat &&= Math.abs(p.v[k] - p.v[mid]) < 1e-6;
  check('profile: that speed is held all the way round once reached', flat);
  check('profile: limit[] in the corner is speedFor(curvature)', near(p.limit[mid], car.speedFor(Math.abs(p.kappa[mid])), 1e-12));
  check('profile: share is 1 while cornering at the limit', near(p.share[mid], 1, 1e-9), `share ${fmt(p.share[mid], 6)}`);
  // With the default allowance the limit is the speed for a bend 3% gentler.
  const q = speedProfile(makeCorridor(pts, { kmh: 18 }), pts, car);
  check(`profile: the default tolerance (${TOLERANCE}) lets the car go exactly ${TOLERANCE * 100}% over the limit here (c/v model)`, within(q.v[mid], p.v[mid] * (1 + TOLERANCE), 1e-9), `ratio ${fmt(q.v[mid] / p.v[mid], 5)}`);
});

await section('speedProfile corner between straights', () => {
  // 300 units straight, a radius-50 quarter turn, 200 units straight.
  // a = 10, b = 40, corner limit 20 units/s, start 10 units/s.
  //   accelerating: v^2 = 100 + 20 s
  //   braking into a corner that begins at s_c: v^2 = 400 + 80 (s_c - s)
  //   they meet at s = (300 + 80 s_c) / 100 = 243 for s_c = 300.
  // The curvature window makes the corner bite between 8 units early and 8
  // units late, so the braking point must lie between 236.6 and 249.4.
  const pts = straightArcStraight(300, 50, Math.PI / 2, 200);
  const car = fakeCar();
  const corridor = makeCorridor(pts, { kmh: 36 });
  const p = speedProfile(corridor, pts, car, { tolerance: 0 });
  let peak = 0; for (let k = 0; k < 300; k++) if (p.v[k] > p.v[peak]) peak = k;
  check('profile: braking point before the corner is where the hand calculation puts it (s = 243, +-7 for the curvature window)', peak >= 236 && peak <= 250, `braking starts at s = ${peak}, top speed there ${fmt(p.v[peak], 2)} (hand: 70.4)`);
  let ok = true; for (let k = 0; k <= peak; k++) ok &&= Math.abs(p.v[k] - Math.sqrt(100 + 20 * k)) < 1e-9;
  check('profile: before the braking point it is flat out (v^2 = 100 + 20 s)', ok);
  // Braking is at exactly b: v^2 falls by 80 per unit until the limit is met.
  let braking = true; for (let k = peak + 1; k < 290; k++) braking &&= Math.abs((p.v[k] ** 2 - p.v[k + 1] ** 2) - 80) < 1e-6;
  check('profile: from the braking point the car brakes at exactly b (v^2 falls 2 b per unit)', braking);
  check('profile: through the corner it holds the corner limit (20 units/s)', [320, 340, 360].every((k) => within(p.v[k], 20, 0.002)), `v[340] = ${fmt(p.v[340], 3)}`);
  // After the exit (arc ends at index 300 + 79): flat out again from 20.
  const exit = 300 + Math.round(50 * Math.PI / 2);
  const k = exit + 100;
  check('profile: after the corner it accelerates at a again', near((p.v[k] ** 2 - p.v[k - 50] ** 2) / 100, 10, 1e-6), `acceleration ${fmt((p.v[k] ** 2 - p.v[k - 50] ** 2) / 100, 4)}`);
  // Never over the limit, never asking for more than the pedals give.
  let over = 0; for (let i = 1; i < pts.length; i++) over = Math.max(over, p.v[i] - p.limit[i]);
  const range = pedalRange(pts, p.v);
  check('profile: nowhere above the cornering limit', over <= 1e-9, `largest excess ${over.toExponential(2)}`);
  check('profile: never accelerates harder than a nor brakes harder than b', range.most <= 10 + 1e-6 && range.least >= -40 - 1e-6, `most ${fmt(range.most, 4)}, least ${fmt(range.least, 4)}`);
  // An independent forward-backward pass over the same limit array must agree exactly.
  // (Steps on the arc are chords, a hair under 1 unit, so the step lengths are measured.)
  const ds = (i) => Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][2] - pts[i][2]);
  const v = new Float64Array(pts.length); v[0] = 10;
  for (let i = 0; i < pts.length - 1; i++) v[i + 1] = Math.min(p.limit[i + 1], Math.sqrt(v[i] ** 2 + 20 * ds(i)));
  for (let i = pts.length - 2; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] ** 2 + 80 * ds(i)));
  let diff = 0; for (let i = 0; i < pts.length; i++) diff = Math.max(diff, Math.abs(v[i] - p.v[i]));
  check('profile: agrees with an independently written forward-backward pass over the same limits', diff < 1e-9, `largest difference ${diff.toExponential(2)}`);
  // Entering the lap too fast for a corner right at the start: the first point must come down too.
  const hot = straightArcStraight(20, 50, Math.PI / 2, 50);
  const h = speedProfile(makeCorridor(hot, { kmh: 360 }), hot, car, { tolerance: 0 });
  check('profile: a start speed too high for the first corner is cut back by the backward pass', h.v[0] < 100 && h.v[0] <= Math.sqrt(h.v[40] ** 2 + 80 * 40) + 1e-9, `v[0] = ${fmt(h.v[0], 2)} (reference said 100)`);
});

await section('speedProfile pinned stretches', () => {
  const n = 201, pts = straightArcStraight(n - 1, 100, 0, 0);
  const ref = Array.from({ length: n }, (_, k) => 200 + 80 * Math.sin(k / 20));   // km/h
  const car = fakeCar();
  // Wholly pinned and entered at the reference's speed: the reference's speeds and time come back.
  const p = speedProfile(makeCorridor(pts, { kmh: ref, free: false }), pts, car);
  let worst = 0, t = 0;
  for (let k = 0; k < n; k++) worst = Math.max(worst, Math.abs(p.v[k] * 3.6 - ref[k]));
  for (let k = 0; k < n - 1; k++) t += 1 / ((ref[k] + ref[k + 1]) / 7.2);
  check('profile: a pinned stretch entered at the reference speed copies the reference speeds exactly', worst < 1e-9, `largest difference ${worst.toExponential(2)} km/h`);
  check('profile: and so costs the reference\'s time', near(p.seconds, t, 1e-9));
  // Free for 100 points at a = 10 from 10 units/s, then pinned with the reference at a
  // constant 360 km/h = 100 units/s: the car arrives at sqrt(100 + 2000) = 45.83 and
  // keeps that (ratio 0.4583 of a constant reference).
  const free = Array.from({ length: n }, (_, k) => k < 100);
  const kmh = Array.from({ length: n }, (_, k) => (k === 0 ? 36 : 360));
  const q = speedProfile(makeCorridor(pts, { kmh, free }), pts, car);
  // Point 99 is the last free one; step 99 -> 100 touches a pinned point, so it is a pinned step.
  check('profile: arriving slower than the reference at a pinned stretch, the car keeps its ratio (constant reference: constant speed)', near(q.v[99], Math.sqrt(100 + 20 * 99), 1e-9) && near(q.v[200], q.v[99], 1e-9), `v[99] = ${fmt(q.v[99], 3)}, v[200] = ${fmt(q.v[200], 3)}`);
  // Near a jump the car may not be faster than the reference. The reference crawled
  // the whole way at 36 km/h = 10 units/s; our car is free for 100 points and then
  // within reach of a jump. It must be back down to 10 by the boundary, braking at
  // b = 40: flat out v^2 = 100 + 20 s meets braking v^2 = 100 + 80 (99 - s) at s = 79.2.
  const air = Array.from({ length: n }, (_, k) => k >= 100);
  const r = speedProfile(makeCorridor(pts, { kmh: 36, free, nearAir: air }), pts, car);
  check('profile: within reach of a jump the speed is capped at the reference speed', near(r.v[99], 10, 1e-9) && near(r.v[100], 10, 1e-9) && near(r.v[180], 10, 1e-9), `v[99] = ${fmt(r.v[99], 3)}, v[100] = ${fmt(r.v[100], 3)} (reference 10)`);
  let peak = 0; for (let k = 0; k < 100; k++) if (r.v[k] > r.v[peak]) peak = k;
  check('profile: and the free road before it is braked for, from the hand-worked point (s = 79.2)', (peak === 79 || peak === 80) && near(r.v[90] ** 2, 100 + 80 * 9, 1e-6), `braking starts at s = ${peak}; v[90]^2 = ${fmt(r.v[90] ** 2, 2)} (hand: 820)`);
});

// ---------------------------------------------------------------------------
// speedProfile(): the fitted car, against the README
// ---------------------------------------------------------------------------
await section('speedProfile with the fitted car', () => {
  const car = loadCarModel();
  // README: "a corner of radius R has one top speed: 125 units, 300 km/h; 200 units, 400 km/h".
  for (const [R, kmh] of [[125, 300], [200, 400]]) {
    const pts = straightArcStraight(0, R, 2 * Math.PI * 0.95, 0);
    const p = speedProfile(makeCorridor(pts, { kmh: 0.5 * kmh }), pts, car, { tolerance: 0 });
    // Far enough round to have reached the limit, but not the last points (the run-out to the end).
    const at = Math.round(pts.length * 0.8);
    check(`profile (fitted car): radius ${R} is taken at the model's limit, which the README gives as ${kmh} km/h`, within(p.v[at] * 3.6, kmh, 0.02) && near(p.v[at], car.speedFor(Math.abs(p.kappa[at])), 1e-9), `profile holds ${fmt(p.v[at] * 3.6, 1)} km/h`);
  }
  // README: "From rest: about 100 km/h in 1.5 s, 300 in 5.6 s, 500 in 12.6 s."
  const pts = straightArcStraight(1600, 100, 0, 0);
  const p = speedProfile(makeCorridor(pts, { kmh: 0 }), pts, car);
  const timeTo = (kmh) => { const k = p.v.findIndex((v) => v * 3.6 >= kmh); return k < 0 ? null : p.time[k]; };
  check('profile (fitted car): standing start reaches 100 km/h in about 1.5 s and 300 km/h in about 5.6 s (README section 1)', near(timeTo(100), 1.5, 0.12) && near(timeTo(300), 5.6, 0.15), `100 km/h at ${fmt(timeTo(100), 2)} s, 300 at ${fmt(timeTo(300), 2)} s, 500 at ${fmt(timeTo(500), 2)} s`);
  check('profile (fitted car): 500 km/h in about 12.6 s', near(timeTo(500), 12.6, 0.25), `${fmt(timeTo(500), 2)} s`);
  // A bend tighter than the car can take at any speed (radius 5; the tightest measured
  // is 7.5 at 25 km/h) must still give a finite, positive lap time.
  const hairpin = straightArcStraight(30, 5, Math.PI, 30);
  const h = speedProfile(makeCorridor(hairpin, { kmh: 0 }), hairpin, car);
  check('profile (fitted car): a hairpin tighter than the car\'s tightest turn still gives a finite lap time', Number.isFinite(h.seconds) && h.seconds > 0 && h.v.every((v) => v > 0), `seconds = ${h.seconds}, slowest ${Math.min(...h.v)}`);
});

// ---------------------------------------------------------------------------
// optimiseLine() and optimiseTime()
// ---------------------------------------------------------------------------
const bendCost = (pts) => { let s = 0; for (let k = 1; k < pts.length - 1; k++) for (let c = 0; c < 3; c++) s += (pts[k - 1][c] - 2 * pts[k][c] + pts[k + 1][c]) ** 2; return s; };

await section('optimiseLine', () => {
  // A straight centre line needs no shift.
  const straight = straightArcStraight(200, 100, 0, 0);
  const s0 = optimiseLine(makeCorridor(straight), { sweeps: 200 });
  check('optimiseLine: a straight centre line is left where it is', s0.every((v) => Math.abs(v) < 1e-9));
  // A wavy centre (amplitude 3) in a corridor 10 wide either side: the straightest
  // line is close to the straight chord, so the bends must nearly vanish.
  const wavy = Array.from({ length: 401 }, (_, k) => [3 * Math.sin(k / 25), 0, k]);
  const corridor = makeCorridor(wavy, { room: 10 });
  const shift = optimiseLine(corridor, { sweeps: 3000 });
  // Judged the way the speed profile judges a line: by curvature() (chords 8 points
  // long). The centre's sharpest bend is 3 / 25^2 = 0.0048.
  const sumSq = (pts) => curvature(pts, pts.map(() => UP)).reduce((s, k) => s + k * k, 0);
  const sharpest = (pts) => Math.max(...curvature(pts, pts.map(() => UP)).map(Math.abs));
  const moved = shiftedPoints(corridor, shift);
  const before = sumSq(wavy), after = sumSq(moved);
  check('optimiseLine: a wavy centre in a wide corridor is straightened (sum of squared curvature falls by over 95%)', after < 0.05 * before, `${before.toExponential(2)} -> ${after.toExponential(2)}; sharpest bend ${fmt(sharpest(wavy), 5)} -> ${fmt(sharpest(moved), 5)}`);
  // The cost the solver itself minimises (bends between every 4th point) must fall too.
  const stations = (pts) => pts.filter((_, k) => k % 4 === 0);
  check('optimiseLine: the cost the solver minimises (bends between every 4th point) falls by over 90%', bendCost(stations(moved)) < 0.1 * bendCost(stations(wavy)), `${bendCost(stations(wavy)).toExponential(2)} -> ${bendCost(stations(moved)).toExponential(2)}`);
  check('optimiseLine: every shift is inside its bounds', shift.every((v, k) => v >= corridor.lo[k] - 1e-9 && v <= corridor.hi[k] + 1e-9));
  check('optimiseLine: first and last point stay on the lap', shift[0] === 0 && shift.at(-1) === 0, `${shift[0]}, ${shift.at(-1)}`);
  // The same with only 1 unit of room: the line uses the room but never more.
  const narrow = makeCorridor(wavy, { room: 1 });
  const s1 = optimiseLine(narrow, { sweeps: 500 });
  check('optimiseLine: with 1 unit of room no shift exceeds 1 unit, and the room is used', Math.max(...s1.map(Math.abs)) <= 1 + 1e-9 && Math.max(...s1.map(Math.abs)) > 0.9, `largest ${fmt(Math.max(...s1.map(Math.abs)), 3)}`);
  check('optimiseLine: the narrow corridor still improves on the centre', sumSq(shiftedPoints(narrow, s1)) < before, `${before.toExponential(2)} -> ${sumSq(shiftedPoints(narrow, s1)).toExponential(2)}`);
  // Pinned points (lo = hi = 0) do not move.
  const free = wavy.map((_, k) => k < 150 || k > 250);
  const pinned = makeCorridor(wavy, { room: 10, free });
  const s2 = optimiseLine(pinned, { sweeps: 500 });
  let most = 0; for (let k = 150; k <= 250; k++) most = Math.max(most, Math.abs(s2[k]));
  check('optimiseLine: pinned points are not shifted', most === 0, `largest shift at a pinned point ${most}`);
});

await section('optimiseTime', () => {
  // A quarter turn of radius 60 in a corridor 8 wide either side: cutting the corner
  // (a larger radius) is faster for a car limited to v = c R.
  const pts = straightArcStraight(120, 60, Math.PI / 2, 120);
  const car = fakeCar({ a: 10, b: 40, c: 0.4 });
  const free = pts.map((_, k) => k > 5 && k < pts.length - 40);   // the last 40 points pinned
  const corridor = makeCorridor(pts, { kmh: 100, free, room: 8 });
  const found = optimiseTime(corridor, car, { maxPasses: 4 });
  const again = speedProfile(corridor, shiftedPoints(corridor, found.shift), car).seconds;
  check('optimiseTime: the reported time is the speed profile\'s time for the returned line', near(found.seconds, again, 1e-9), `${fmt(found.seconds, 4)} vs ${fmt(again, 4)}`);
  check('optimiseTime: startSeconds is the profile of the unshifted line', near(found.startSeconds, speedProfile(corridor, pts, car).seconds, 1e-12));
  check('optimiseTime: finds a faster line through a corner with room to cut it', found.seconds < found.startSeconds - 0.05, `${fmt(found.startSeconds, 3)} -> ${fmt(found.seconds, 3)} s in ${found.evaluations} tries`);
  check('optimiseTime: every shift is inside its bounds and pinned points are not moved', found.shift.every((v, k) => v >= corridor.lo[k] - 1e-9 && v <= corridor.hi[k] + 1e-9 && (free[k] || v === 0)));
  // On a straight there is nothing to gain: nothing may change.
  const straight = straightArcStraight(300, 100, 0, 0);
  const none = optimiseTime(makeCorridor(straight, { kmh: 100 }), car, { maxPasses: 2 });
  check('optimiseTime: on a straight nothing is gained and the line is not moved', none.seconds === none.startSeconds && none.shift.every((v) => v === 0));
});
