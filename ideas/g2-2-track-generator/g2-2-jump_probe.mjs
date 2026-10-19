// How far does the car fly? The measurement behind the jumps in generate.mjs.
//
//   node ideas/g2-2-track-generator/g2-2-jump_probe.mjs                 # the standard grid, about 2 minutes, one simulator
//   node ideas/g2-2-track-generator/g2-2-jump_probe.mjs --quick          # 3 speeds per jump
//
// A jump needs a speed window: too slow and the car falls into the gap, too
// fast and it overshoots the landing. Nothing in the project measured that
// window, so this script does, on straight test tracks built from the game's
// parts: start, a run-up of straights, the take-off, a gap of G cells (5
// units each) with nothing in it, a landing of straights, the finish. The
// road is 10 units above the world's ground (baseLevel 2), so a car that
// falls short ends on the ground below and does not finish.
//
// Two take-offs:
//   drop    the run-up ends at a flat edge and the landing road is D levels
//           (5 units each) lower
//   kicker  the run-up ends with a SlopeUp (the road rises 5 units over 20
//           and leaves at 26 degrees) and the landing road is at the top of
//           the kicker, or D levels below it
// For each, the car is driven by sim/controller.mjs down the middle at a
// fixed target speed, with and without the air brake (S held in the air),
// and the script prints where it came down, whether it finished, and the
// fall over the flight, from which gravity follows.
//
// Local use only: drives the local simulator; no network.
import { Env } from '../../sim/env.mjs';
import { decodeState } from '../../sim/state.mjs';
import { createController } from '../../sim/controller.mjs';
import { DECISION_TICKS } from '../../sim/drive.mjs';
import { encodeSaveString } from './codec.mjs';

const START = 5, FINISH = 6, STRAIGHT = 0, SLOPE_UP = 2;

/** Parts of a straight jump track, heading -z from the origin. Each piece is 4
 *  cells long; positions in cells. Returns { parts, gapFrom, gapTo, landY }:
 *  gapFrom / gapTo are the z (units) of the take-off edge and of the start of
 *  the landing road, landY its surface height. */
export function jumpTrack({ runUp = 6, kicker = false, gap = 6, drop = 0, landing = 6, level = 2 + drop } = {}) {
  const parts = [];
  let z = 0;
  const put = (typeId, y, extra = {}) => { parts.push({ typeId, x: 0, y, z, rotation: 0, rotationAxis: 0, checkpointOrder: null, startOrder: null, ...extra }); z -= 4; };
  put(START, level, { startOrder: 0 });
  for (let k = 0; k < runUp; k++) put(STRAIGHT, level);
  let top = level;
  if (kicker) { put(SLOPE_UP, level); top = level + 1; }
  const gapFrom = (z + 2) * 5;          // the last piece's -z edge
  z -= gap;                             // nothing in the gap
  const landLevel = top - drop;
  const gapTo = (z + 2) * 5;
  for (let k = 0; k < landing; k++) put(STRAIGHT, landLevel);
  put(FINISH, landLevel);
  return { parts, gapFrom, gapTo, landY: landLevel * 5 + 0.21, length: -(z + 2) * 5 };
}

/** Drive one jump track at `kmh` (target speed). Returns what happened. */
export async function driveJump(env, spec, kmh, airBrake) {
  const { parts, gapFrom, gapTo, length } = jumpTrack(spec);
  const createCar = { trackData: encodeSaveString(parts, 0), mountainVertices: new Float32Array(0), mountainOffset: { x: 0, y: 0, z: 0 } };
  const n = Math.ceil(length) + 20;
  // The line: straight down x = 0, one point per unit, the target speed everywhere.
  const line = { points: Array.from({ length: n }, (_, k) => [0, 0, 10 - k]), speedKmh: new Array(n).fill(kmh), grounded: new Array(n).fill(true) };
  const decide = createController(line, { crossTrackGain: 1, airBrake: airBrake ? 1 : 0 });
  env.reset(createCar);
  let s = decodeState((await env.step({}, 1))[0]);
  let takeoff = null, landed = null, minY = Infinity, wasAir = false, peakY = -Infinity;
  const track = [];
  while (s.frames < 30000) {
    const { controls } = decide(s);
    const states = await env.step(controls, DECISION_TICKS);
    for (const u8 of states) {
      const t = decodeState(u8);
      const air = t.wheelContact.every((c) => !c);
      // Take-off: the first tick with no wheel down beyond the edge's last 10 units.
      if (!takeoff && air && t.position[2] < gapFrom + 10) takeoff = { z: t.position[2], y: t.position[1], kmh: t.speedKmh, frames: t.frames };
      if (takeoff && !landed && !air && t.position[2] < gapFrom) landed = { z: t.position[2], y: t.position[1], kmh: t.speedKmh, frames: t.frames };
      if (takeoff && !landed) { peakY = Math.max(peakY, t.position[1]); track.push([t.frames, t.position[1], t.position[2]]); }
      minY = Math.min(minY, t.position[1]);
      wasAir = air;
    }
    s = decodeState(states.at(-1));
    if (s.finishFrames != null || s.position[1] < 3) break;
  }
  void wasAir;
  return {
    finished: s.finishFrames != null, takeoff, landed, peakY,
    // Distance flown past the edge, and where the car came down relative to the landing road.
    flown: landed ? gapFrom - landed.z : null, intoLanding: landed ? gapTo - landed.z : null,
    fellShort: !!landed && landed.y < 3, track,
  };
}

/** Gravity from a flight: fit y = a + b t + c t^2 over the airborne ticks (t in s); g = -2c. */
export function fitGravity(track) {
  if (track.length < 20) return null;
  const t0 = track[0][0];
  let S = [0, 0, 0, 0, 0], Y = [0, 0, 0];
  for (const [f, y] of track.slice(2, -2)) {
    const t = (f - t0) / 1000;
    for (let k = 0; k < 5; k++) S[k] += t ** k;
    for (let k = 0; k < 3; k++) Y[k] += y * t ** k;
  }
  // Normal equations for [a, b, c].
  const M = [[S[0], S[1], S[2]], [S[1], S[2], S[3]], [S[2], S[3], S[4]]];
  const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(M);
  const Mc = M.map((row, i) => [row[0], row[1], Y[i]]);
  return -2 * det(Mc) / D;
}

if (process.argv[1]?.endsWith('g2-2-jump_probe.mjs')) {
  const quick = process.argv.includes('--quick');
  const env = await Env.create();
  const cases = [
    { name: 'drop 1 level, gap 4 cells', spec: { gap: 4, drop: 1 } },
    { name: 'drop 2 levels, gap 6 cells', spec: { gap: 6, drop: 2 } },
    { name: 'drop 2 levels, gap 8 cells', spec: { gap: 8, drop: 2 } },
    { name: 'kicker, gap 4, landing at its top', spec: { kicker: true, gap: 4, drop: 0 } },
    { name: 'kicker, gap 8, landing at its top', spec: { kicker: true, gap: 8, drop: 0 } },
    { name: 'kicker, gap 8, landing 1 level below its top', spec: { kicker: true, gap: 8, drop: 1 } },
  ];
  const speeds = quick ? [100, 160, 220] : [50, 70, 90, 110, 130, 160, 190, 220, 260];
  const gs = [];
  for (const c of cases) {
    for (const airBrake of [false, true]) {
      const row = [];
      for (const kmh of speeds) {
        const r = await driveJump(env, c.spec, kmh, airBrake);
        const g = fitGravity(r.track);
        if (g && r.landed && !r.fellShort) gs.push(g);
        row.push(`${kmh}:${r.finished ? 'F' : r.fellShort ? 'short' : 'x'}${r.takeoff ? `(${r.takeoff.kmh.toFixed(0)}km/h,+${r.intoLanding?.toFixed(0)})` : ''}`);
      }
      console.log(`${c.name.padEnd(46)} ${airBrake ? 'S in air' : 'no keys '}  ${row.join(' ')}`);
    }
  }
  gs.sort((a, b) => a - b);
  console.log(`gravity from ${gs.length} flights: median ${gs[gs.length >> 1]?.toFixed(2)} units/s^2 (range ${gs[0]?.toFixed(2)} to ${gs.at(-1)?.toFixed(2)})`);
  console.log('F = finished; short = came down on the ground below; x = landed on the road but did not finish. (takeoff speed, units past the start of the landing road)');
  await env.close();
}
