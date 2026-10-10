// The fitted car model against a FRESH, independent measurement in the simulator.
// This is the claim other ideas would rely on: car.accel / coast / brake /
// kappaMax say what the real car does on flat road.
//
// One simulator at a time, two pads, about 10 s.
//
// Independent of fit_car.mjs on purpose:
//   - speed comes from POSITIONS (distance covered in 100 ms), not from the
//     speedometer fit_car.mjs reads;
//   - a turn's curvature is "change of the path's direction per unit of path",
//     with direction taken from positions 60 ms apart, not from
//     SimSession.motion() and not binned by speed;
//   - each number is taken at one chosen speed, from one run, and compared
//     with the model's function at that speed.
// Tolerances: 3% on straight-line acceleration, 4% on turning (the table is
// stored at 25 km/h steps and 4 decimals), wider where stated.
import { SimSession } from '../../shared/sim_session.mjs';
import { rotate } from '../../../sim/track.mjs';
import { buildPad } from '../testpad.mjs';
import { loadCarModel } from '../car_model.mjs';
import { check, known, near, within, fmt, section } from './_check.mjs';

const car = loadCarModel();
const EVERY = 10;   // ticks between samples

/** Hold `controls` for `ms`, one sample per 10 ticks: { t, p, state }. Sample 0 is the state before the hold. */
async function record(sim, controls, ms) {
  const out = [{ t: 0, p: sim.state.position, state: sim.state }];
  for (let t = EVERY; t <= ms; t += EVERY) { await sim.hold(controls, EVERY); out.push({ t, p: sim.state.position, state: sim.state }); }
  return out;
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** Speed at sample k, units/s: path covered between 50 ms before and 50 ms after. */
const speedAt = (run, k) => dist(run[k + 5].p, run[k - 5].p) / 0.1;
/** Acceleration at sample k from speeds `half` ms either side. */
const accelAt = (run, k, half = 250) => (speedAt(run, k + half / EVERY) - speedAt(run, k - half / EVERY)) / (2 * half / 1000);
/** First sample at which the speed has crossed `kmh` (rising or falling). */
function crossing(run, kmh, rising = true) {
  for (let k = 5; k < run.length - 5; k++) if (rising ? speedAt(run, k) * 3.6 >= kmh : speedAt(run, k) * 3.6 <= kmh) return k;
  return -1;
}

// ---------------------------------------------------------------------------
// Straight line: a strip 60 wide and 1300 long.
// ---------------------------------------------------------------------------
await section('straight line', async () => {
  const pad = buildPad({ wide: 3, long: 65, startRow: 1 });
  const sim = await SimSession.create(pad);
  try {
    await sim.restart();
    await sim.hold({}, 500);                       // settle on the suspension first
    const run = await record(sim, { up: true }, 9000);
    check('straight: the whole W run stayed on the pad and on four wheels', run.at(-1).p[2] > pad.bounds.zMin + 150 && run.every((s) => s.state.wheelContact.every(Boolean)), `ended at z = ${fmt(run.at(-1).p[2], 0)} of ${pad.bounds.zMin}`);
    // Speedometer against positions: they must agree, or "km/h" is not units/s * 3.6.
    const k6 = 600;
    check('straight: the speedometer (km/h) is 3.6 x the speed measured from positions', within(run[k6].state.speedKmh, speedAt(run, k6) * 3.6, 0.003), `speedometer ${fmt(run[k6].state.speedKmh, 2)}, positions ${fmt(speedAt(run, k6) * 3.6, 2)} km/h`);
    for (const kmh of [50, 100, 200, 300, 400]) {
      const k = crossing(run, kmh);
      const measured = accelAt(run, k, kmh <= 50 ? 150 : 250), v = speedAt(run, k), model = car.accel(v);
      check(`straight: W acceleration at ${kmh} km/h matches car.accel within 3%`, within(model, measured, 0.03), `measured ${fmt(measured, 2)}, model ${fmt(model, 2)} units/s^2 (${fmt(100 * (model / measured - 1), 1)}%)`);
    }
    // README: "From rest: about 100 km/h in 1.5 s, 300 in 5.6 s"; "320 km/h after 6 s of W" on the plates.
    const t100 = run[crossing(run, 100)].t / 1000, t300 = run[crossing(run, 300)].t / 1000;
    // ("about": measured here 1.51 s and 5.49 s, so the README's 5.6 is 2% long.)
    check('straight: from rest, 100 km/h in about 1.5 s and 300 km/h in about 5.6 s (README, within 0.15 s)', near(t100, 1.5, 0.08) && near(t300, 5.6, 0.15), `100 at ${fmt(t100, 2)} s, 300 at ${fmt(t300, 2)} s`);
    check('straight: 6 s of W on the plates gives about 320 km/h (README)', near(run[600].state.speedKmh, 320, 3), `${fmt(run[600].state.speedKmh, 1)} km/h`);
    // The whole curve at once: integrate the model's acceleration from the measured
    // speed at 0.5 s and see where it says the car is 8 s later.
    let v = speedAt(run, 50), s = 0;
    for (let t = 0; t < 8000; t++) { const a = car.accel(v); s += v * 0.001 + a * 0.0000005; v += a * 0.001; }
    const realV = speedAt(run, 850), realS = Math.abs(run[850].p[2] - run[50].p[2]);
    check('straight: the model integrated over 8 s of W lands within 1% of the real speed and distance', within(v, realV, 0.01) && within(s, realS, 0.01), `speed ${fmt(v * 3.6, 1)} vs ${fmt(realV * 3.6, 1)} km/h, distance ${fmt(s, 1)} vs ${fmt(realS, 1)} units`);

    // Coast and brake from the end of that run (about 410 km/h).
    const fast = await sim.save();
    const coastRun = await record(sim, {}, 1500);
    {
      const k = 75, measured = accelAt(coastRun, k, 500), model = car.coast(speedAt(coastRun, k));
      check(`straight: coasting deceleration at ${fmt(speedAt(coastRun, k) * 3.6, 0)} km/h matches car.coast within 4%`, within(model, measured, 0.04) && measured < 0, `measured ${fmt(measured, 2)}, model ${fmt(model, 2)} units/s^2`);
    }
    await sim.load(fast);
    const brakeRun = await record(sim, { down: true }, 1400);
    // The brake takes a moment to bite: 350 km/h is passed only 0.15 s after S goes
    // down (from 410), and there the real car brakes 7% less than the table, which
    // was fitted on one long stop from 600 km/h. So 10% is allowed at 350 and 5%
    // once the stop is 0.4 s old.
    for (const [kmh, tol] of [[350, 0.10], [250, 0.05], [150, 0.05]]) {
      const k = crossing(brakeRun, kmh, false);
      const measured = accelAt(brakeRun, k, 50), model = car.brake(speedAt(brakeRun, k));
      check(`straight: S braking at ${kmh} km/h (${brakeRun[k].t} ms after S went down) matches car.brake within ${tol * 100}%`, within(model, measured, tol), `measured ${fmt(measured, 1)}, model ${fmt(model, 1)} units/s^2 (${fmt(100 * (model / measured - 1), 1)}%)`);
    }
    // Braking distance, as a whole: model integrated from the first sample to 100 km/h.
    {
      const k0 = 10, k1 = crossing(brakeRun, 100, false);
      let v = speedAt(brakeRun, k0), s = 0, t = 0;
      while (v * 3.6 > 100 && t < 5000) { const a = car.brake(v); s += v * 0.001; v += a * 0.001; t++; }
      const real = dist(brakeRun[k1].p, brakeRun[k0].p), realT = brakeRun[k1].t - brakeRun[k0].t;
      check('straight: braking from about 400 to 100 km/h, the model\'s distance and time are within 4% of the real ones', within(s, real, 0.04) && within(t, realT, 0.04), `distance ${fmt(s, 1)} vs ${fmt(real, 1)} units, time ${t} vs ${realT} ms`);
    }
  } finally { await sim.close(); }
});

// ---------------------------------------------------------------------------
// Turning: a pad 620 wide and 1600 long (500 km/h takes 1150 units of run-up).
// ---------------------------------------------------------------------------
await section('turning', async () => {
  const pad = buildPad({ wide: 31, long: 80, startRow: 1 });
  const sim = await SimSession.create(pad);
  const b = pad.bounds;
  const onPad = (p) => p[0] > b.xMin + 2 && p[0] < b.xMax - 2 && p[2] > b.zMin + 2 && p[2] < b.zMax - 2;
  /** Direction of travel (radians, in the ground plane) at sample k, from positions 30 ms either side. */
  const heading = (run, k) => Math.atan2(run[k + 3].p[0] - run[k - 3].p[0], run[k + 3].p[2] - run[k - 3].p[2]);
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  /** Curvature of the path between samples k0 and k1: turn of the heading / path length. Also the speed there. */
  function turnOf(run, k0, k1) {
    let length = 0, turned = 0;
    for (let k = k0; k < k1; k++) { length += dist(run[k + 1].p, run[k].p); turned += wrap(heading(run, k + 1) - heading(run, k)); }
    return { kappa: turned / length, v: length / ((k1 - k0) * EVERY / 1000), accel: (speedAt(run, k1) - speedAt(run, k0)) / ((k1 - k0) * EVERY / 1000) };
  }
  try {
    await sim.restart();
    await sim.hold({}, 500);
    for (const entry of [100, 200, 300, 400, 500]) {
      while (sim.state.speedKmh < entry) await sim.hold({ up: true }, 10);
      const point = await sim.save();
      const run = await record(sim, { up: true, left: true }, 900);
      const ok = run.every((s) => onPad(s.p) && s.state.wheelContact.every(Boolean));
      // 0.5 to 0.8 s after the key went down: the wheels are at their limit by then.
      const m = turnOf(run, 50, 80);
      const model = car.kappaMax(m.v);
      check(`turning: W+A from ${entry} km/h, the path's curvature at ${fmt(m.v * 3.6, 0)} km/h matches car.kappaMax within 4%`, ok && within(model, Math.abs(m.kappa), 0.04),
        `measured radius ${fmt(1 / Math.abs(m.kappa), 1)}, model ${fmt(1 / model, 1)} units (${fmt(100 * (model / Math.abs(m.kappa) - 1), 1)}%)${ok ? '' : '; LEFT THE PAD OR LIFTED A WHEEL'}`);
      // "A" is left: heading -z, left is -x (left = up x forward).
      if (entry === 100) check('turning: the A key turns the car to its left (towards -x when heading -z)', run.at(-1).p[0] < -1, `x after 0.9 s: ${fmt(run.at(-1).p[0], 2)}`);
      // With W held the car keeps gaining speed at full lock, at the model's full-lock rate.
      const modelAccel = car.accel(m.v, 1);
      check(`turning: W+A from ${entry} km/h, the car still gains speed, at car.accel(v, 1) within 10%`, m.accel > 0 && within(modelAccel, m.accel, 0.10), `measured ${fmt(m.accel, 2)}, model ${fmt(modelAccel, 2)} units/s^2; straight-line model ${fmt(car.accel(m.v), 2)}`);
      // The wheels reach their limit within 100 ms (README), i.e. 95% of the angle they hold at 0.5 s.
      const settled = Math.abs(run[50].state.steering), at100 = Math.abs(run[10].state.steering), at50 = Math.abs(run[5].state.steering);
      if (entry === 100 || entry === 300) check(`turning: at ${entry} km/h the wheels are at 95% of their limit 100 ms after the key goes down, and not yet at 50 ms`, at100 >= 0.95 * settled && at50 < 0.95 * settled, `50 ms ${fmt(at50, 4)}, 100 ms ${fmt(at100, 4)}, 500 ms ${fmt(settled, 4)} rad`);
      // No slide: the car points where it goes (README: slip under 1 degree above 200 km/h).
      if (entry >= 300) {
        const fwd = rotate([0, 0, 1], run[70].state.quaternion);
        const slip = Math.abs(wrap(Math.atan2(fwd[0], fwd[2]) - heading(run, 70))) * 180 / Math.PI;
        check(`turning: at ${entry} km/h holding a steering key does not make the car slide (slip angle under 1 degree)`, slip < 1, `${fmt(slip, 2)} degrees`);
      }
      // Braking while steering. The README gives one number per speed for S+A
      // (-39 at 300 km/h, -16 to -24 below) and car.brake(v, 1) returns it.
      if (entry === 300) {
        await sim.load(point);
        const sRun = await record(sim, { down: true, left: true }, 900);
        const s = turnOf(sRun, 50, 80);
        const modelBrake = car.brake(s.v, 1);
        check('turning: S+A from 300 km/h brakes far less than S alone (under 60% of the straight-line brake)', s.accel < 0 && s.accel > 0.6 * car.brake(s.v), `measured ${fmt(s.accel, 1)} at ${fmt(s.v * 3.6, 0)} km/h, straight-line model ${fmt(car.brake(s.v), 1)} units/s^2`);
        // KNOWN FAILURE (TESTING.md, defect 5): S+A is not a steady state. The wheels
        // swing to the OPPOSITE lock within half a second (the car is sliding and the
        // game counter-steers), and the deceleration depends on how long the keys have
        // been down, not on the speed alone. The table bins samples from several runs
        // by speed, so it mixes early and late parts of different slides.
        known('turning: S+A from 300 km/h, the deceleration 0.5 to 0.8 s in matches car.brake(v, 1) within 15%', within(modelBrake, s.accel, 0.15), `measured ${fmt(s.accel, 1)} at ${fmt(s.v * 3.6, 0)} km/h, model ${fmt(modelBrake, 1)} units/s^2 (${fmt(100 * (modelBrake / s.accel - 1), 0)}%)`);
        const early = sRun[10].state.steering, late = sRun[80].state.steering;
        check('turning: S+A is a slide, not a steady turn: the wheel angle reverses sign within 0.8 s (which is why one number per speed cannot describe it)', Math.sign(early) !== Math.sign(late) && Math.abs(late) > 0.1, `wheel angle ${fmt(early, 3)} rad at 100 ms, ${fmt(late, 3)} rad at 800 ms`);
      }
      await sim.load(point);
      sim.drop(point);
    }
  } finally { await sim.close(); }
});
