// The car alone: a fitted model of what it can do, and a flat pad to measure
// it on. PROMOTED in phase 2 from ideas/g1-7-computed-racing-line/, where the
// code and its measurements still live (car_model.mjs, car_model.json,
// testpad.mjs, fit_car.mjs); this file is the supported way in for other
// folders, so that folder can keep changing its internals.
//
//   const car = loadCarModel();                 // no simulator needed
//   car.kappaMax(v)     tightest curvature (1/units) the steering key gives at speed v
//   car.speedFor(k)     fastest speed at which curvature k can still be followed
//   car.accel(v, share) W held; share 0..1 = how much of the turning limit is in use
//   car.coast(v)        no pedal (negative)
//   car.brake(v)        S held, STRAIGHT LINE ONLY (negative)
//   car.topSpeed
//   Speeds in UNITS PER SECOND (km/h / 3.6), accelerations in units/s^2.
//
//   const pad = buildPad({ wide: 9, long: 300 });   // CreateCar inputs: flat plates
//   const sim = await SimSession.create(pad);       // a car with nothing to hit
//
// What an independent tester confirmed against fresh measurements
// (ideas/g1-7-computed-racing-line/tests/TESTING.md): W acceleration within
// 0.4% at five speeds, coasting within 0.4%, straight-line braking within 2%
// from 0.4 s into the stop (the first 0.2 s brake about 7% weaker than the
// table), kappaMax within 0.8% from 134 to 512 km/h, full-lock acceleration
// within 1.5%, and that human laps turn at exactly this limit (ratio 0.98 to
// 1.02 on five tracks).
//
// What is NOT usable: braking with a steering key down. The table behind
// car.brake(v, share > 0) puts samples from different moments of different
// slides into speed bins; S + steering is not a steady state (the measured
// deceleration is about -80 units/s^2 in the first 100 ms, -25 to -37 for
// the next second, then -20, whatever the speed), and the model is 31% off
// at 216 km/h. Through this file brake() therefore refuses a share above 0
// rather than return a number that looks measured. g1-7's own car_model.mjs
// still has the two-argument form for its speed profile.
//
// Also known: kappaMax is stored to 4 decimals, which is +-1.4% at 500 km/h.
import { loadCarModel as loadFitted, GRAVITY } from '../g1-7-computed-racing-line/car_model.mjs';

export { GRAVITY };
/** CreateCar inputs for a track of flat plates (surface at y = 0.21), and the
 *  plate size. buildPad({ wide = 9, long = 300, startRow = 2 }), in plates of
 *  20 units; the car faces -z. Beyond the pad the car drops 0.21 onto the
 *  world's ground plane at y = 0 and keeps driving (see CONTRACT.md). */
export { buildPad, PLATE_UNITS, PLATE_CELLS } from '../g1-7-computed-racing-line/testpad.mjs';

/** The fitted car (see the top of this file). `file` defaults to g1-7's car_model.json. */
export function loadCarModel(file) {
  const car = file ? loadFitted(file) : loadFitted();
  return {
    ...car,
    brake(v, share = 0) {
      if (share > 0) throw new Error('car.brake(v, share > 0): braking while steering is not a function of speed and the fitted table is wrong (see ideas/shared/car_model.mjs)');
      return car.brake(v, 0);
    },
  };
}
