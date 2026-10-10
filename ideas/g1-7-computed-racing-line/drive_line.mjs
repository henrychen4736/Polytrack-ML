// Drive a line from compare_human.mjs in the real simulator, and time it.
//
//   node ideas/g1-7-computed-racing-line/drive_line.mjs [track] [which] [key=value ...]
//   node ideas/g1-7-computed-racing-line/drive_line.mjs desert4 all
//
//   which   human     the human's path with the human's speeds as targets
//           computed  the computed path with the model's speeds as targets
//           model     the human's path with the model's speeds as targets
//                     (separates "the line moved" from "the speeds changed")
//           all       the three in turn (default)
//   key=value  settings of the driver, sim/controller.mjs DEFAULTS, e.g.
//           crossTrackGain=2 speedFactor=1.05 brakeMarginKmh=20
//   sweep=1    instead of one lap per line, try 9 driver settings per line
//           (crossTrackGain 1 / 2 / 4 x lookaheadPerKmh 0.06 / 0.09 / 0.12)
//           and report how many finish and the fastest. About 80 s for
//           three lines. Why: one setting is a coin toss on desert4. The
//           second jump is taken at 450 km/h off a banked climb, and whether
//           the car lands on the road depends on a few km/h and a fraction of
//           a unit at take-off, which the settings change. Only the fastest
//           lap of each line is verified and saved.
//
// One simulator, about 5 s per lap. The driver is the project's existing
// pure-pursuit controller (sim/controller.mjs, sim/drive.mjs): it steers at a
// point ahead on the line and holds W while below the line's speed there. It
// is a plain tracker, not a fast driver; the comparison that means something
// is between the three lines under the SAME tracker, and of each with the
// human's own 21.750 s.
//
// A lap that finishes is checked with the game's Verify and saved as
// runs/g1-7-<which>_<track>.json (ideas/shared/verify.mjs).
import { readFileSync } from 'node:fs';
import { Env, loadTrack } from '../../sim/env.mjs';
import { driveLap } from '../../sim/drive.mjs';
import { verifyAndSave } from '../shared/verify.mjs';

const args = process.argv.slice(2);
const options = Object.fromEntries(args.filter((a) => a.includes('=')).map((a) => { const [k, v] = a.split('='); return [k, Number(v)]; }));
const [track = 'desert4', which = 'all'] = args.filter((a) => !a.includes('='));
const file = JSON.parse(readFileSync(new URL(`./out/line_${track}.json`, import.meta.url), 'utf8'));

// The three lines in the form the controller follows.
const lines = {
  human: { points: file.human.points, speedKmh: file.human.speedKmh },
  computed: { points: file.computed.points, speedKmh: file.computed.speedKmh },
  model: { points: file.human.points, speedKmh: file.human.modelSpeedKmh },
};
// Defaults that differ from sim/controller.mjs, with the reason:
//   crossTrackGain 2    plain pure pursuit runs about 1 unit beside the line
//                       (see the note in controller.mjs); the computed line is
//                       placed 1.7 units from the road edge, so that matters
//   brakeMarginKmh 30   every line here is driven flat out (the human holds W
//                       for 100% of desert4, and the model's profile is "W
//                       held" wherever no corner limit binds). The model's
//                       speeds are a few km/h below the real car's in places,
//                       and with no margin the driver would tap S there.
const { sweep = 0, ...given } = options;
const settings = { crossTrackGain: 2, brakeMarginKmh: 30, ...given };
const variants = sweep
  ? [1, 2, 4].flatMap((crossTrackGain) => [0.06, 0.09, 0.12].map((lookaheadPerKmh) => ({ crossTrackGain, lookaheadPerKmh })))
  : [{}];

/** Distance from the line, in units, at which a lap is given up. */
const LOST = 25;

const env = await Env.create();
const createCar = loadTrack(track);
console.log(`${track}: human ${(file.humanFrames / 1000).toFixed(3)} s; model predicts ${file.predicted.humanLine} s on the human's line and ${file.predicted.computed} s on the computed one (${file.method})`);
console.log(`driver settings: ${JSON.stringify(settings)}`);
for (const name of which === 'all' ? ['human', 'model', 'computed'] : [which]) {
  const line = { ...lines[name], grounded: file.grounded };
  let best = null, finished = 0;
  for (const variant of variants) {
    // Where the car first strays more than 4 units from its line (if it does):
    // that is where a failed lap went wrong, long before it stalls.
    let strayed = null;
    // Past LOST units from the line the lap is over (the car has left the
    // road); driveLap has no such stop of its own and would drive the wreck
    // around for another 20 s of lap time, so the callback throws to end it.
    let last = null;
    const onDecision = ({ state, progress, offLine }) => {
      if (!strayed && offLine > 4) strayed = { point: progress, tick: state.frames, kmh: state.speedKmh };
      last = { state, progress, offLine };
      if (offLine > LOST) throw new Error('lost');
    };
    let run;
    try {
      run = await driveLap(env, createCar, line, { ...settings, ...variant }, { maxTicks: 2 * file.humanFrames, stallTicks: 1500, onDecision });
    } catch (error) {
      if (error.message !== 'lost') throw error;
      run = { outcome: 'left the road', finishFrames: null, fraction: last.progress / (line.points.length - 1), worstOffLine: last.offLine, state: last.state };
    }
    const done = run.outcome === 'finished';
    if (done) finished++;
    if (sweep) console.log(`  ${name.padEnd(9)} ${JSON.stringify(variant)}: ${done ? `${(run.finishFrames / 1000).toFixed(3)} s` : `${run.outcome}${strayed ? `, off its line from point ${strayed.point}` : ''}`}`);
    if (done ? !best?.done || run.finishFrames < best.run.finishFrames : !best) best = { run, variant, strayed, done };
  }
  const { run, strayed } = best;
  let text = `${name.padEnd(9)} ${sweep ? `${finished} of ${variants.length} settings finish; best ${JSON.stringify(best.variant)}: ` : ''}${run.outcome}`;
  if (best.done) {
    const keys = run.controlsPerTick;
    const v = await verifyAndSave({ track, keys, name: `g1-7-${name}`, env });
    let w = 0, s = 0, steer = 0;
    for (const c of keys) { if (c.up) w++; if (c.down) s++; if (c.left || c.right) steer++; }
    text += ` in ${(run.finishFrames / 1000).toFixed(3)} s (${((run.finishFrames - file.humanFrames) / 1000).toFixed(3)} s against the human), Verify ${v.ok ? 'passed' : 'FAILED'}; W ${(100 * w / keys.length).toFixed(0)}%, S ${(100 * s / keys.length).toFixed(1)}%, steering ${(100 * steer / keys.length).toFixed(0)}%`;
  } else text += ` at ${(100 * run.fraction).toFixed(0)}% of the line, tick ${run.state.frames}`;
  console.log(`${text}; furthest from its line ${run.worstOffLine.toFixed(1)} units${strayed ? `; first 4 units off at point ${strayed.point} (tick ${strayed.tick}, ${strayed.kmh.toFixed(0)} km/h)` : ''}`);
}
await env.close();
