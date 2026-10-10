// The fitted car model as functions (no simulator needed).
//
// fit_car.mjs measures the car on a flat pad and writes car_model.json: tables
// at every 25 km/h. This file turns those tables into the few functions a
// speed profile needs. Speeds here are in UNITS PER SECOND (km/h / 3.6),
// accelerations in units/s^2, curvature in 1/units.
//
//   const car = loadCarModel();
//   car.accel(v, share)     W held; share = how much of the turning limit is in use (0..1)
//   car.brake(v, share)     S held (negative)
//   car.coast(v)            no pedal (negative)
//   car.kappaMax(v)         tightest curvature the car follows at speed v
//   car.speedFor(kappa)     fastest speed at which it can still follow that curvature
//
// What the measurements say about this car (see the README for the table):
//   - Holding a steering key never makes it slide. The front-wheel angle the
//     key reaches shrinks with speed (0.41 rad standing, 0.023 at 300 km/h,
//     0.010 at 500), the slip angle stays under 1 degree above 200 km/h, and
//     the turning radius comes out close to proportional to speed: about
//     0.42 units per km/h up to 300 (125 units at 300 km/h) and 0.5 to 0.6
//     above (200 at 400, 286 at 500). So "grip limit" here means "how tight
//     the steering key can turn at this speed", and that is what kappaMax is.
//   - With W held the car still gains speed at full lock, about 75% of its
//     straight-line acceleration (8.4 against 11.3 units/s^2 at 300 km/h).
//   - Brakes are strong in a straight line (-61 units/s^2 at rest rising to
//     -117 above 500 km/h, 6 to 12 g) and much weaker with a steering key
//     down (-41 at full lock at 300 km/h and above, -16 to -24 below).
//
// `share` blends between the straight-line number and the full-lock number.
// Only those two ends were measured; in between is a straight-line guess.
import { readFileSync } from 'node:fs';

/** Gravity in units/s^2: how fast a car in flight falls, from a parabola
 *  fitted to the height of the human's car over its longest flight
 *  (compare_human.mjs prints it: 14.32 on desert4's 1.3 s flight). This is
 *  not 9.8; whether the game's gravity is simply stronger or the car is also
 *  pushed down in the air was not separated. The profile only uses it for
 *  the slope of "free" road, which is level to within 15 degrees. */
export const GRAVITY = 14.3;

/** Fill the gaps (null) of a table by carrying the nearest measured value outwards
 *  and interpolating between measured neighbours. */
function fill(values) {
  const out = values.slice();
  const known = out.map((v, k) => (v == null ? -1 : k)).filter((k) => k >= 0);
  for (let k = 0; k < out.length; k++) {
    if (out[k] != null) continue;
    const before = known.filter((j) => j < k).at(-1), after = known.find((j) => j > k);
    if (before == null) out[k] = out[after];
    else if (after == null) out[k] = out[before];
    else out[k] = out[before] + (out[after] - out[before]) * (k - before) / (after - before);
  }
  return out;
}

export function loadCarModel(file = new URL('./car_model.json', import.meta.url)) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const step = (raw.speedsKmh[1] - raw.speedsKmh[0]) / 3.6;   // table spacing in units/s
  const n = raw.speedsKmh.length;
  /** Linear interpolation of a filled table at speed v (clamped to the table's ends). */
  const table = (values) => {
    const filled = fill(values);
    return (v) => {
      const x = Math.max(0, Math.min(n - 1, v / step)), k = Math.min(n - 2, Math.floor(x));
      return filled[k] + (filled[k + 1] - filled[k]) * (x - k);
    };
  };
  const accelStraight = table(raw.accelW), accelLock = table(raw.turnW.along);
  const brakeStraight = table(raw.brake), brakeLock = table(raw.turnS.along);
  const coast = table(raw.coast);
  // The 0 km/h bin has no turning sample (the car is not moving); the radius
  // at walking pace is the 25 km/h one, about 7 units.
  const kappaMax = table(raw.turnW.kappa);

  /**
   * Fastest speed at which the car can follow curvature `kappa`. kappaMax
   * falls as speed rises, so this is the speed where kappaMax(v) = kappa,
   * found by bisection. Above the top of the table (curvature gentler than
   * the car's turn at top speed) there is no limit: returns top speed.
   */
  const top = raw.topSpeedKmh / 3.6;
  function speedFor(kappa) {
    if (kappa <= kappaMax(top)) return top;
    let lo = 0, hi = top;
    for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (kappaMax(mid) > kappa) lo = mid; else hi = mid; }
    return lo;
  }
  const blend = (a, b, share) => a + (b - a) * Math.max(0, Math.min(1, share));
  return {
    raw, topSpeed: top, coast, kappaMax, speedFor,
    // Full lock is never allowed MORE acceleration than a straight line. The
    // full-lock table stops at 575 km/h and its last value (3.05) is carried
    // up from there, while the straight-line table keeps falling (0.29 at
    // 675), so without the min() the model said steering at 650 km/h quadruples
    // the car's acceleration. Where both were measured the min changes nothing
    // beyond 0.05 units/s^2. (Found by tests/test_2_car_model.mjs.)
    accel: (v, share = 0) => blend(accelStraight(v), Math.min(accelStraight(v), accelLock(v)), share),
    brake: (v, share = 0) => blend(brakeStraight(v), brakeLock(v), share),
  };
}
