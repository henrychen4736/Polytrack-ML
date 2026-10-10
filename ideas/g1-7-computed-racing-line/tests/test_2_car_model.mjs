// car_model.mjs: the table functions, on a small made-up table with hand-worked
// answers, then sanity of the real car_model.json and of the README's table.
// No simulator. (test_4_car_vs_sim.mjs checks the real numbers against the game.)
import { writeFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadCarModel, GRAVITY } from '../car_model.mjs';
import { check, known, near, fmt, section } from './_check.mjs';

// ---------------------------------------------------------------------------
// A made-up table: speeds 0 / 36 / 72 / 108 km/h = 0 / 10 / 20 / 30 units/s.
// ---------------------------------------------------------------------------
await section('made-up table', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'g17-car-'));
  const file = path.join(dir, 'model.json');
  writeFileSync(file, JSON.stringify({
    speedsKmh: [0, 36, 72, 108], topSpeedKmh: 108,
    accelW: [10, null, 6, null],          // gap in the middle -> 8, gap at the end -> 6
    coast: [0, -1, -2, null],
    brake: [-20, -30, -40, -50],
    turnW: { kappa: [null, 0.1, 0.05, 0.025], along: [null, 4, 4, 2] },   // gap at the start -> carried back
    turnS: { along: [-10, -10, null, null] },
  }));
  const car = loadCarModel(file);
  rmSync(dir, { recursive: true });
  const eq = (name, got, want) => check(`car model (made-up table): ${name}`, near(got, want, 1e-9), `got ${fmt(got, 6)}, expected ${want}`);
  eq('top speed 108 km/h is 30 units/s', car.topSpeed, 30);
  eq('accel at 5 units/s interpolates 10 -> (filled) 8: 9', car.accel(5), 9);
  eq('accel at 15 units/s interpolates (filled) 8 -> 6: 7', car.accel(15), 7);
  eq('accel at 25 units/s: the missing last entry is carried from 6', car.accel(25), 6);
  eq('accel above the table is clamped to the last entry', car.accel(100), 6);
  eq('accel below 0 is clamped to the first entry', car.accel(-5), 10);
  eq('accel at full lock (share 1) at 25 units/s interpolates 4 -> 2: 3', car.accel(25, 1), 3);
  eq('accel at half lock is halfway between straight (6) and full lock (3): 4.5', car.accel(25, 0.5), 4.5);
  eq('share above 1 is clamped to 1', car.accel(25, 2), 3);
  eq('share below 0 is clamped to 0', car.accel(25, -1), 6);
  eq('full-lock accel at 5 units/s: the missing first entry is carried back from 4', car.accel(5, 1), 4);
  eq('brake at 15 units/s: -35', car.brake(15), -35);
  eq('brake at half lock at 15 units/s: halfway between -35 and (carried) -10: -22.5', car.brake(15, 0.5), -22.5);
  eq('coast at 5 units/s: -0.5', car.coast(5), -0.5);
  eq('coast at 30 units/s: carried -2', car.coast(30), -2);
  eq('kappaMax at 0: carried back from 0.1', car.kappaMax(0), 0.1);
  eq('kappaMax at 15 units/s: 0.075', car.kappaMax(15), 0.075);
  eq('kappaMax at 30 units/s: 0.025', car.kappaMax(30), 0.025);
  check('car model (made-up table): speedFor(0.075) = 15 units/s', near(car.speedFor(0.075), 15, 1e-6), fmt(car.speedFor(0.075), 6));
  check('car model (made-up table): speedFor(0.05) = 20 units/s', near(car.speedFor(0.05), 20, 1e-6), fmt(car.speedFor(0.05), 6));
  eq('speedFor of a bend the car takes at top speed is top speed', car.speedFor(0.025), 30);
  eq('speedFor of a straight (curvature 0) is top speed', car.speedFor(0), 30);
  eq('speedFor of a bend tighter than the tightest measured is 0 (cannot be followed)', car.speedFor(0.2), 0);
});

// ---------------------------------------------------------------------------
// The real table.
// ---------------------------------------------------------------------------
await section('car_model.json', () => {
  const car = loadCarModel(), raw = car.raw;
  const n = raw.speedsKmh.length;
  check('car_model.json: speed bins are evenly spaced from 0 (the lookup assumes it)', raw.speedsKmh.every((s, k) => s === k * raw.speedsKmh[1]), `${n} bins of ${raw.speedsKmh[1]} km/h`);
  check('car_model.json: every table has one entry per speed bin', [raw.accelW, raw.coast, raw.brake, raw.turnW.kappa, raw.turnW.along, raw.turnS.along].every((t) => t.length === n));
  // speedFor() finds the speed by bisection, which is only right if kappaMax never rises with speed.
  let rising = 0, flatBelowTop = 0;
  for (let kmh = 1; kmh <= raw.topSpeedKmh; kmh++) {
    const a = car.kappaMax((kmh - 1) / 3.6), b = car.kappaMax(kmh / 3.6);
    if (b > a + 1e-12) rising++;
    if (b === a && kmh > 25 && kmh <= 575) flatBelowTop++;
  }
  check('car_model.json: kappaMax never rises with speed (speedFor\'s bisection needs this)', rising === 0, `${rising} rising steps`);
  check('car_model.json: kappaMax strictly falls between 25 and 575 km/h (the measured range)', flatBelowTop === 0, `${flatBelowTop} flat steps`);
  let worst = 0;
  for (let kmh = 30; kmh <= 570; kmh += 7) worst = Math.max(worst, Math.abs(car.speedFor(car.kappaMax(kmh / 3.6)) * 3.6 - kmh));
  check('car_model.json: speedFor(kappaMax(v)) returns v across 30..570 km/h', worst < 0.01, `largest error ${worst.toExponential(2)} km/h`);
  let signs = true, weaker = true;
  for (let kmh = 0; kmh <= 650; kmh += 10) {
    const v = kmh / 3.6;
    signs &&= car.accel(v) > 0 && car.accel(v, 1) > 0 && car.brake(v) < 0 && car.brake(v, 1) < 0 && car.coast(v) < 0;
    weaker &&= car.accel(v, 1) <= car.accel(v) + 0.3 && car.brake(v, 1) >= car.brake(v) && car.brake(v) < car.coast(v) && car.coast(v) < car.accel(v);
  }
  check('car_model.json: W speeds up, S and coasting slow down, at every speed', signs);
  check('car_model.json: full lock never helps (accel no higher, braking no stronger), and S < coast < W', weaker);
  // How fine is the stored turning limit? It is written with 4 decimals.
  const k500 = raw.turnW.kappa[20];
  // KNOWN FAILURE (TESTING.md, defect 6): fit_car.mjs rounds kappa to 4 decimals.
  known('car_model.json: the turning limit is stored finely enough to be good to 0.5% at 500 km/h', 0.00005 / k500 <= 0.005,
    `stored as ${k500}: 4 decimals is +-${(100 * 0.00005 / k500).toFixed(1)}% at 500 km/h (and +-${(100 * 0.00005 / raw.turnW.kappa[12]).toFixed(1)}% at 300)`);
  check('GRAVITY is the documented 14.3', GRAVITY === 14.3);
});

// ---------------------------------------------------------------------------
// The README's table (section 1) must be what car_model.json says.
// ---------------------------------------------------------------------------
await section('README table', () => {
  const car = loadCarModel(), raw = car.raw;
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const rows = readme.split(/\r?\n/).filter((l) => /^\| \d+ \|/.test(l)).map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
  check('README: the car table has 13 rows of 11 columns', rows.length === 13 && rows.every((r) => r.length === 11), `${rows.length} rows`);
  const bad = [];
  let compared = 0;
  for (const r of rows) {
    const kmh = Number(r[0]), k = raw.speedsKmh.indexOf(kmh), v = kmh / 3.6;
    const kw = raw.turnW.kappa[k], ks = raw.turnS.kappa[k];
    const want = [kmh, raw.accelW[k], raw.coast[k], raw.brake[k], kw ? 1 / kw : null, kw ? v * v * kw : null, raw.turnW.along[k],
      raw.turnW.slip[k] == null ? null : raw.turnW.slip[k] * 180 / Math.PI, raw.turnW.steer[k], ks ? 1 / ks : null, raw.turnS.along[k]];
    for (let c = 1; c < 11; c++) {
      if (r[c] === '') continue;                     // the README leaves the cell empty
      compared++;
      const digits = (r[c].split('.')[1] ?? '').length;
      // Allow one unit of the last printed digit (rounding of a rounded number).
      if (want[c] == null || Math.abs(Number(r[c]) - want[c]) > 10 ** -digits) bad.push(`${kmh} km/h column ${c + 1}: README ${r[c]}, json ${want[c] == null ? 'null' : want[c].toFixed(digits + 1)}`);
    }
  }
  check(`README: every number in the car table matches car_model.json (${compared} cells, to the last printed digit)`, bad.length === 0, bad.slice(0, 6).join('; '));
  // Sentences of section 1.
  check('README: "drag proportional to speed (0.029 units/s^2 per km/h)"', near((raw.coast[4] - raw.coast[20]) / 400, 0.029, 0.001), fmt((raw.coast[4] - raw.coast[20]) / 400, 4));
  check('README: W thrust is "about 20 units/s^2 that does not depend on speed" (accel minus coast)', [2, 8, 14, 20].every((k) => near(raw.accelW[k] - raw.coast[k], 20, 0.3)), [2, 8, 14, 20].map((k) => fmt(raw.accelW[k] - raw.coast[k], 2)).join(', '));
  check('README: "600 km/h to a stop in 1.78 s"', raw.brakeFrom600ToStopMs === 1780);
  check('README: "75% of its straight-line acceleration at 300 km/h" at full lock', near(raw.turnW.along[12] / raw.accelW[12], 0.75, 0.01), fmt(raw.turnW.along[12] / raw.accelW[12], 3));
  check('README: "wheels reach their limit 100 ms after the key goes down, at every speed"', raw.steerRamp.every((r) => r.ms === 100), raw.steerRamp.map((r) => r.ms).join(','));
});
