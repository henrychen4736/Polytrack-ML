// The author's scripts, run as the README says, and the lap times the README
// reports. About 75 s; never more than one simulator at a time (each script is
// awaited before the next thing starts).
//
//   check_turn_limit.mjs (5 tracks)   run; its printed medians are checked
//   fit_car.mjs                       run; must reproduce car_model.json
//   compare_human.mjs desert4         run; the README's predicted times are
//                                     checked, and that it rewrites
//                                     out/line_desert4.json byte for byte
//   drive_line.mjs desert4 human      run at the default settings, where the
//                                     README says this line does NOT finish
//                                     (so the script saves nothing)
//   the three laps under runs/        replayed and verified here, without saving
//   the 22.083 s lap                  driven again from the line file with the
//                                     README's settings, in this process
//
// drive_line.mjs is NOT run with settings that finish: a finished lap makes it
// write runs/g1-7-*_desert4.json, and this tester may not write outside ideas/.
// What it would do there (driveLap with those settings, then Verify) is done
// below with save switched off.
import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Env, loadTrack } from '../../../sim/env.mjs';
import { driveLap } from '../../../sim/drive.mjs';
import { verifyAndSave } from '../../shared/verify.mjs';
import { check, known, near, fmt, section } from './_check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const folder = 'ideas/g1-7-computed-racing-line';
const lineFile = path.join(root, folder, 'out/line_desert4.json');
/** Run one of the author's scripts from the project root; resolves with { code, out }. */
const run = (script, args, timeoutMs = 110000) => new Promise((resolve) => {
  execFile(process.execPath, [path.join(folder, script), ...args], { cwd: root, timeout: timeoutMs, maxBuffer: 1 << 24 }, (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, out: stdout, err: stderr }));
});
/** First real error line of a script's stderr (the simulator's harmless "wasm streaming compile failed" notice aside). */
const firstError = (err) => err.split(/\r?\n/).filter((l) => /Error/.test(l) && !/wasm streaming/.test(l))[0] ?? '';
const number = (text, pattern) => { const m = text.match(pattern); return m ? Number(m[1]) : NaN; };

await section('check_turn_limit.mjs', async () => {
  // The README's five tracks, as its "How to run" gives them (about 12 s).
  const tracks = ['desert4', 'summer1', 'summer4', 'winter2', 'desert1'];
  const r = await run('check_turn_limit.mjs', tracks);
  check('check_turn_limit.mjs (five tracks): runs and exits 0', r.code === 0, firstError(r.err));
  for (const track of tracks) {
    const line = r.out.split(/\r?\n/).find((l) => l.startsWith(`${track} (`)) ?? '';
    const bands = [...line.matchAll(/(\d+) km\/h: (\d+) points, median ([\d.]+), 90th ([\d.]+)/g)].map((m) => ({ band: +m[1], points: +m[2], median: +m[3], p90: +m[4] }));
    check(`check_turn_limit.mjs ${track}: every speed band has a median of 0.98 to 1.02 and a 90th percentile of at most 1.04 (README)`, bands.length >= 1 && bands.every((b) => b.median >= 0.98 && b.median <= 1.02 && b.p90 <= 1.04), bands.map((b) => `${b.band} km/h: ${b.points} points, median ${b.median}, 90th ${b.p90}`).join(' | ') || line || 'no output line');
  }
});

await section('fit_car.mjs', async () => {
  // The fit is the source of car_model.json. Run it (about 20 s, one simulator at a
  // time) and require the file it writes to be the file that is there. If it is
  // not, the original is put back so the rest of the folder keeps its numbers.
  const modelFile = path.join(root, folder, 'car_model.json');
  const before = readFileSync(modelFile, 'utf8');
  const r = await run('fit_car.mjs', []);
  const after = readFileSync(modelFile, 'utf8');
  if (after !== before) writeFileSync(modelFile, before);
  check('fit_car.mjs: runs and exits 0', r.code === 0, firstError(r.err));
  check('fit_car.mjs: writes car_model.json byte for byte as it stands (the fit is repeatable and the file is its output)', after === before, after === before ? '' : 'the file it wrote differs; the original was restored');
  check('fit_car.mjs: reports the top speed (668.9 km/h after 45 s) and stop from 600 km/h (1780 ms) the README gives', /668\.9 km\/h/.test(r.out) && /stop: 1780 ms/.test(r.out), r.out.split(/\r?\n/)[0]);
});

await section('compare_human.mjs', async () => {
  const before = existsSync(lineFile) ? readFileSync(lineFile, 'utf8') : null;
  const r = await run('compare_human.mjs', ['desert4']);
  check('compare_human.mjs desert4: runs and exits 0', r.code === 0, firstError(r.err));
  const o = r.out;
  // README section 4.
  check('compare_human.mjs: calibration on the flat stretches is human 15.067 s, model 15.084 s (README)', near(number(o, /free stretches in total: human ([\d.]+)/), 15.067, 0.0015) && near(number(o, /free stretches in total: human [\d.]+ s, model ([\d.]+)/), 15.084, 0.0015), o.match(/free stretches in total.*/)?.[0] ?? 'line not found');
  check('compare_human.mjs: the human\'s line is predicted at 21.919 s against 21.750 s real (README)', near(number(o, /model's own speeds throughout: ([\d.]+) s predicted/), 21.919, 0.0015) && near(number(o, /predicted against ([\d.]+) s real/), 21.750, 0.0005), o.match(/whole lap along.*/)?.[0] ?? 'line not found');
  check('compare_human.mjs: the minimum-curvature line is predicted at 22.841 s, slower than the human\'s (README)', near(number(o, /\n\s+0\.000\s+([\d.]+)/), 22.841, 0.0015), o.match(/\n\s+0\.000\s+.*/)?.[0].trim() ?? 'line not found');
  check('compare_human.mjs: the time search goes 21.919 -> 21.792 s, largest shift 2.2 units, length 1984.3 (README)', near(number(o, /search on predicted time: [\d.]+ -> ([\d.]+)/), 21.792, 0.0015) && near(number(o, /largest shift ([\d.]+),/), 2.2, 0.05) && near(number(o, /s\), length ([\d.]+)/), 1984.3, 0.05), o.match(/search on predicted time.*/)?.[0] ?? 'line not found');
  check('compare_human.mjs: "gravity" from the longest flight is 14.3 (README)', near(number(o, /points \d+\.\.\d+\): ([\d.]+) units/), 14.3, 0.05), o.match(/gravity from.*/)?.[0] ?? 'line not found');
  // README's calibration table, row by row.
  const rows = [...o.matchAll(/^\s+(\d+)\.\.(\d+)\s+([\d.]+)\s+([\d.]+)/gm)].map((m) => m.slice(1, 5).map(Number));
  const want = [[0, 56, 2.488, 2.486], [147, 492, 4.829, 4.903], [706, 1162, 4.240, 4.227], [1407, 1843, 3.510, 3.468]];
  check('compare_human.mjs: the four calibration stretches match the README\'s table', rows.length === 4 && rows.every((row, i) => row.every((v, c) => near(v, want[i][c], 0.0015))), rows.map((r2) => r2.join(' ')).join(' | '));
  const after = readFileSync(lineFile, 'utf8');
  check('compare_human.mjs: rewrites out/line_desert4.json byte for byte (the computation is repeatable)', before != null && before === after, before == null ? 'the file did not exist before' : before === after ? '' : 'the file changed');
});

const file = JSON.parse(readFileSync(lineFile, 'utf8'));

await section('line file', () => {
  const n = file.human.points.length;
  check('line file: human and computed lines have one point, one speed and one shift per corridor point', file.computed.points.length === n && file.computed.speedKmh.length === n && file.computed.shift.length === n && file.human.speedKmh.length === n && file.human.modelSpeedKmh.length === n && file.grounded.length === n && file.free.length === n, `${n} points`);
  let worst = 0, pinnedMoved = 0;
  for (let k = 0; k < n; k++) {
    const d = Math.hypot(...[0, 1, 2].map((c) => file.computed.points[k][c] - file.human.points[k][c]));
    worst = Math.max(worst, Math.abs(d - Math.abs(file.computed.shift[k])));
    if (!file.free[k] && d > 1e-9) pinnedMoved++;
  }
  check('line file: each computed point is its human point moved by |shift| (to the 0.01 the file is rounded to)', worst < 0.011, `largest mismatch ${fmt(worst, 4)}`);
  check('line file: the computed line is the human\'s line wherever the corridor is pinned', pinnedMoved === 0, `${pinnedMoved} pinned points moved`);
  check('line file: predicted times stored are the README\'s (21.919 and 21.792)', file.predicted.humanLine === 21.919 && file.predicted.computed === 21.792 && file.method === 'time search');
  check('line file: no speed is NaN, negative or above the car\'s top speed', file.computed.speedKmh.every((v) => v >= 0 && v < 700) && file.human.modelSpeedKmh.every((v) => v >= 0 && v < 700));
  // KNOWN FAILURE (TESTING.md, defect 7): optimiseTime moves the first point of the
  // line, but the car starts where the start line puts it.
  known('line file: the computed line starts where the car starts (shift 0 at the first point)', file.computed.shift[0] === 0, `shift at point 0 is ${file.computed.shift[0]} units`);
});

// ---------------------------------------------------------------------------
// The laps the README reports (section 4, "In the simulator").
// ---------------------------------------------------------------------------
const env = await Env.create();
try {
  await section('saved laps', async () => {
    for (const [name, frames] of [['computed', 22083], ['model', 22133], ['human', 22441]]) {
      const saved = path.join(root, `runs/g1-7-${name}_desert4.json`);
      if (!existsSync(saved)) { check(`saved lap ${name}: runs/g1-7-${name}_desert4.json exists`, false); continue; }
      const lap = JSON.parse(readFileSync(saved, 'utf8'));
      const v = await verifyAndSave({ track: 'desert4', keys: lap.controlsPerTick, name: `g1-7-${name}`, env, save: false });
      check(`saved lap "${name}": replays to a finish on tick ${frames} (${(frames / 1000).toFixed(3)} s, README) and passes the game's Verify`, v.ok && v.finishFrames === frames && v.files.length === 0, `finished ${v.finished} on tick ${v.finishFrames}; Verify ${v.verified}, one tick early rejected ${v.offByOneRejected}, round trip ${v.roundTrip}`);
      if (name === 'computed') check('saved lap "computed": slower than the human\'s 21.750 s by the README\'s 0.333 s (the verdict "not faster" holds)', v.finishFrames - file.humanFrames === 333, `${v.finishFrames - file.humanFrames} ms`);
    }
  });

  await section('drive the computed line again', async () => {
    // What `drive_line.mjs desert4 computed crossTrackGain=2 lookaheadPerKmh=0.06` does, without the save.
    const line = { points: file.computed.points, speedKmh: file.computed.speedKmh, grounded: file.grounded };
    const result = await driveLap(env, loadTrack('desert4'), line, { crossTrackGain: 2, brakeMarginKmh: 30, lookaheadPerKmh: 0.06 }, { maxTicks: 2 * file.humanFrames, stallTicks: 1500 });
    check('drive: the computed line, driven by sim/controller.mjs with the README\'s settings, finishes in 22.083 s', result.outcome === 'finished' && result.finishFrames === 22083, `${result.outcome}, tick ${result.finishFrames}, furthest from the line ${fmt(result.worstOffLine, 1)} units`);
    if (result.outcome === 'finished') {
      const saved = JSON.parse(readFileSync(path.join(root, 'runs/g1-7-computed_desert4.json'), 'utf8')).controlsPerTick;
      const same = saved.length === result.controlsPerTick.length && saved.every((c, t) => ['up', 'down', 'left', 'right'].every((key) => !!c[key] === !!result.controlsPerTick[t][key]));
      check('drive: and presses exactly the keys of the saved lap runs/g1-7-computed_desert4.json', same);
    }
  });
} finally { await env.close(); }

await section('drive_line.mjs', async () => {
  // README: at the default settings only "model" finishes. So "human" must not, and nothing is saved.
  const stamp = (name) => { const f = path.join(root, `runs/g1-7-${name}_desert4.json`); return existsSync(f) ? readFileSync(f, 'utf8').length : -1; };
  const before = stamp('human');
  const r = await run('drive_line.mjs', ['desert4', 'human']);
  check('drive_line.mjs desert4 human: runs and exits 0', r.code === 0, firstError(r.err));
  const line = r.out.split(/\r?\n/).find((l) => l.startsWith('human')) ?? '';
  check('drive_line.mjs desert4 human: at the default settings this line does not finish (README: only "model" does)', /left the road|stalled|out of time/.test(line) && !/Verify/.test(line), line.trim().slice(0, 160));
  check('drive_line.mjs: a lap that does not finish saves nothing', stamp('human') === before);
  // A line that does not exist must fail loudly, not drive something else.
  const bad = await run('drive_line.mjs', ['no_such_track']);
  check('drive_line.mjs: a track with no line file exits non-zero', bad.code !== 0);
});
