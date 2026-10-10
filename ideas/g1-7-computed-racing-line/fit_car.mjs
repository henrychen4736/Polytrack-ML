// Fit a simple model of the car by experiment, on a flat pad (testpad.mjs).
//
//   node ideas/g1-7-computed-racing-line/fit_car.mjs
//
// One simulator, about 15 s. Writes ideas/g1-7-computed-racing-line/car_model.json
// and prints the table. Everything is in world units (about metres) and
// seconds unless it says km/h; 1 unit/s = 3.6 km/h.
//
// What is measured, and why these things:
//
//   STRAIGHT LINE (no steering key)
//     accelW(v)   acceleration with W held, from a standing start to top speed
//     coast(v)    acceleration with no key (negative: drag)
//     brake(v)    acceleration with S held (negative)
//   These three are the limits a speed profile along a line is built from.
//
//   TURNING (A held from a straight run at a chosen speed, with W, with no
//   pedal, and with S)
//     kappa(v)    curvature of the path the car then follows, 1 / radius.
//                 This is the tightest corner the car can take at that speed
//                 by holding a steering key: the "grip limit" for a line.
//     along(v)    what the speed does meanwhile (does cornering cost speed?)
//     slip(v)     angle between where the car points and where it goes
//     steer(v)    the front-wheel angle the key settles at; it shrinks with speed
//     rampMs      how long the wheels take to get there
//
// The turning samples are taken from 0.5 s after the key goes down (the
// wheels have reached their limit well before then, see rampMs) and binned by
// the speed the car has AT THAT MOMENT, not the speed it entered at, because
// with W held the car keeps accelerating round the turn.
import { writeFileSync } from 'node:fs';
import { SimSession } from '../shared/sim_session.mjs';
import { buildPad } from './testpad.mjs';

const OUT = new URL('./car_model.json', import.meta.url);
/** Speed bins of the tables, km/h. Top speed is about 680 (measured below). */
const BIN = 25;
const SPEEDS = Array.from({ length: 28 }, (_, k) => k * BIN); // 0 .. 675

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const round = (v, d = 3) => (v == null ? null : Number(v.toFixed(d)));

/** Median of `value` over the samples whose speed falls in each bin. */
function binBySpeed(samples, value) {
  return SPEEDS.map((kmh) => round(median(samples.filter((s) => Math.abs(s.kmh - kmh) <= BIN / 2).map(value)), 4));
}

/**
 * Hold `controls` for `ms`, sampling every `every` ticks. Each sample:
 *   t (ms since the hold began), kmh, v (units/s, horizontal), heading (rad,
 *   direction of travel in the ground plane), yaw (rad, where the car points),
 *   steering (rad), position, grounded (all four wheels down)
 */
async function record(sim, controls, ms, every = 10) {
  const samples = [];
  for (let t = 0; t < ms; t += every) {
    await sim.hold(controls, every);
    const m = sim.motion(), s = sim.state;
    // Car forward (+z in its own frame) in world axes, from the quaternion.
    const [qx, qy, qz, qw] = s.quaternion;
    const fwd = [2 * (qx * qz + qw * qy), 1 - 2 * (qx * qx + qy * qy)]; // world x and z parts
    samples.push({
      // Speed from the speedometer, not from positions: 4000 units down the
      // strip a float32 position is only good to 0.0005 units, which over the
      // 4 ticks motion() spans is 0.1 units/s of noise, as large as the drag
      // being measured. (On the flat the two agree to under 1%.)
      t: t + every, kmh: s.speedKmh, v: s.speedKmh / 3.6,
      heading: Math.atan2(m.velocity[0], m.velocity[2]), yaw: Math.atan2(fwd[0], fwd[1]),
      steering: s.steering, position: s.position, grounded: s.wheelContact.every(Boolean),
    });
  }
  return samples;
}

/** Difference of two angles, wrapped to (-pi, pi]. */
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Acceleration along the direction of travel at each sample (central difference over 2 samples each way). */
function withAccel(samples, gap = 2) {
  const out = [];
  for (let k = gap; k < samples.length - gap; k++) {
    const a = samples[k - gap], b = samples[k + gap];
    const dt = (b.t - a.t) / 1000;
    out.push({ ...samples[k], along: (b.v - a.v) / dt, turnRate: wrap(b.heading - a.heading) / dt });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. Straight line, on a strip 180 units wide and 6600 long.
// ---------------------------------------------------------------------------
const strip = buildPad({ wide: 9, long: 330, startRow: 2 });
let sim = await SimSession.create(strip);
await sim.restart();
const t0 = Date.now();

// W from rest for 45 s. 40 s reaches 668.6 km/h and is still creeping up.
const accelRun = withAccel(await record(sim, { up: true }, 45000, 50));
const topSpeedKmh = accelRun.at(-1).kmh;
// Save points on the way up to start the coast, brake and (later) nothing else from.
// Coast and brake from 600 km/h: restart, run W to 600, then let go / press S.
await sim.restart();
while (sim.state == null || sim.state.speedKmh < 600) await sim.hold({ up: true }, 50);
const fast = await sim.save();
const coastRun = withAccel(await record(sim, {}, 40000, 50));
await sim.load(fast);
const brakeRun = withAccel(await record(sim, { down: true }, 4000, 10));
const brakeStopMs = brakeRun.find((s) => s.kmh < 5)?.t ?? null;
await sim.close();

const accelW = binBySpeed(accelRun, (s) => s.along);
const coast = binBySpeed(coastRun, (s) => s.along);
const brake = binBySpeed(brakeRun.filter((s) => s.kmh > 5), (s) => s.along);

// ---------------------------------------------------------------------------
// 2. Turning, on a pad 1620 units wide and 3000 long (the run-up to 550 km/h
//    takes 1500 units, and the circle there is about 700 across).
// ---------------------------------------------------------------------------
const pad = buildPad({ wide: 81, long: 150, startRow: 2 });
sim = await SimSession.create(pad);
await sim.restart();
const onPad = (p) => p[0] > pad.bounds.xMin && p[0] < pad.bounds.xMax && p[2] > pad.bounds.zMin && p[2] < pad.bounds.zMax;

const MODES = { W: { up: true, left: true }, coast: { left: true }, S: { down: true, left: true } };
const turn = { W: [], coast: [], S: [] };
const ramps = [];      // { kmh, ms, limit } per W run
const entries = [];    // per run summary, printed below
// Entry speeds: a standing start, then every 50 km/h up to 550.
for (const entryKmh of [0, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550]) {
  while (entryKmh > 0 && (sim.state == null || sim.state.speedKmh < entryKmh)) await sim.hold({ up: true }, 10);
  if (entryKmh === 0) await sim.hold({}, 10); // one state to start from
  const point = await sim.save();
  for (const [mode, controls] of Object.entries(MODES)) {
    if (entryKmh === 0 && mode !== 'W') continue; // nothing to measure standing still
    await sim.load(point);
    const run = withAccel(await record(sim, controls, 3000, 10)).filter((s) => onPad(s.position) && s.grounded && s.kmh > 5);
    for (const s of run) {
      if (s.t < 500) continue;
      turn[mode].push({ ...s, kappa: Math.abs(s.turnRate) / s.v, slip: Math.abs(wrap(s.yaw - s.heading)) });
    }
    if (mode === 'W') {
      // Ramp: first sample at which the wheel angle is within 5% of the largest it reaches.
      const limit = Math.max(...run.slice(0, 60).map((s) => Math.abs(s.steering)));
      ramps.push({ kmh: entryKmh, ms: run.find((s) => Math.abs(s.steering) >= 0.95 * limit)?.t ?? null, limit: round(limit, 4) });
    }
    const late = run.filter((s) => s.t >= 500 && s.t <= 1500);
    if (late.length) {
      entries.push({
        entryKmh, mode, kmh: round(median(late.map((s) => s.kmh)), 1),
        radius: round(median(late.map((s) => s.v / Math.abs(s.turnRate))), 1),
        lateral: round(median(late.map((s) => s.v * Math.abs(s.turnRate))), 1),
        along: round(median(late.map((s) => s.along)), 1),
        slipDeg: round(median(late.map((s) => Math.abs(wrap(s.yaw - s.heading)) * 180 / Math.PI)), 2),
        steering: round(median(late.map((s) => Math.abs(s.steering))), 4),
      });
    }
  }
  await sim.load(point);
  sim.drop(point);
}
await sim.close();

const table = (mode) => ({
  kappa: binBySpeed(turn[mode], (s) => s.kappa),
  along: binBySpeed(turn[mode], (s) => s.along),
  slip: binBySpeed(turn[mode], (s) => s.slip),
  steer: binBySpeed(turn[mode], (s) => Math.abs(s.steering)),
});

const model = {
  note: 'Fitted by fit_car.mjs on a flat pad. Units and seconds; kappa in 1/units; angles in radians. null = not measured at that speed.',
  speedsKmh: SPEEDS,
  topSpeedKmh: round(topSpeedKmh, 1),
  accelW, coast, brake,
  brakeFrom600ToStopMs: brakeStopMs,
  turnW: table('W'), turnCoast: table('coast'), turnS: table('S'),
  steerRamp: ramps,
  runs: entries,
};
writeFileSync(OUT, JSON.stringify(model, null, 1));

// ---------------------------------------------------------------------------
// Print.
// ---------------------------------------------------------------------------
const f = (v, d = 1, w = 7) => (v == null ? '-' : v.toFixed(d)).padStart(w);
console.log(`top speed with W after 45 s: ${topSpeedKmh.toFixed(1)} km/h; S from 600 km/h to a stop: ${brakeStopMs} ms`);
console.log('\nkm/h   accelW   coast   brake | W+A: radius  lateral   along  slip deg  wheel rad | A only: radius lateral along | S+A: radius lateral along');
for (let k = 0; k < SPEEDS.length; k++) {
  const row = (t) => {
    const kappa = t.kappa[k], v = SPEEDS[k] / 3.6;
    return kappa ? `${f(1 / kappa, 0)} ${f(v * v * kappa)} ${f(t.along[k])}` : `${f(null)} ${f(null)} ${f(null)}`;
  };
  console.log(`${String(SPEEDS[k]).padStart(4)} ${f(accelW[k], 2, 8)} ${f(coast[k], 2)} ${f(brake[k], 1)} |     ${row(model.turnW)} ${f(model.turnW.slip[k] == null ? null : model.turnW.slip[k] * 180 / Math.PI, 2, 9)} ${f(model.turnW.steer[k], 4, 10)} |       ${row(model.turnCoast)} |    ${row(model.turnS)}`);
}
console.log('\nsteering ramp (W+A): ' + ramps.map((r) => `${r.kmh} km/h: ${r.ms} ms to ${r.limit} rad`).join('; '));
console.log(`wrote ${OUT.pathname.split('/').slice(-2).join('/')} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
