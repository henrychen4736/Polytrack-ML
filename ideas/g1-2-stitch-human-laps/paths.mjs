// The parts of lap stitching that do not need save states: what each human lap
// did on every tick, where the laps can be compared (sections), how well two
// car states match, and which lap to follow in each section.
//
// Words used in this folder:
//   path      everything one lap did, per tick: path.position[t] is the car
//             after t ticks, likewise quaternion, velocity, spin, steering.
//   boundary  a plane across the road. Boundaries are laid along the FASTEST
//             lap, one every `sectionMs` of its driving, facing the way it was
//             moving. Every lap crosses every boundary at some tick of its own.
//   section   the road between two boundaries. A lap's section time is the
//             difference of its two crossing ticks, so section times of
//             different laps are comparable although the laps are never at
//             the same place at the same tick.
//   donor     the lap whose keys are being used after a switch.
import { decodeState } from '../../sim/state.mjs';

/** Ticks that velocity and spin are measured across. The same as MOTION_GAP in
 *  ideas/shared/sim_session.mjs, so a path's velocity and SimSession.motion()
 *  are the same quantity and can be subtracted. */
export const MOTION_GAP = 4;

/** Spin (rad/s, world axes) that turns orientation `a` into `b` in `dt` s.
 *  Same formula as SimSession.motion(). */
function spinBetween(a, b, dt) {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  const d = [
    -bw * ax + bx * aw - by * az + bz * ay,
    -bw * ay + bx * az + by * aw - bz * ax,
    -bw * az - bx * ay + by * ax + bz * aw,
    bw * aw + bx * ax + by * ay + bz * az,
  ];
  const sign = d[3] < 0 ? -1 : 1;
  return [0, 1, 2].map((k) => (2 * sign * d[k]) / dt);
}

/** Angle in radians between two orientations. */
export function angleBetween(a, b) {
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return 2 * Math.acos(Math.min(1, dot));
}

/**
 * Replay one lap from the start line and keep its whole path.
 *   env    a sim/env.mjs Env (its car is replaced: save states on it die)
 *   track  CreateCar inputs (loadTrack)
 *   lap    a lap object from ideas/shared/laps.mjs
 * Returns { frames, keys, position[], quaternion[], velocity[], spin[],
 *           steering[], wheels[] }, all indexed by tick (index 0 = the start
 * line, filled with the first state so nothing is undefined). `wheels` is how
 * many wheels touch the road.
 */
export async function recordPath(env, track, lap) {
  const run = await env.replay(track, lap.recording, lap.frames + 50);
  if (!run.finished || run.finishFrames !== lap.frames) {
    throw new Error(`${lap.source}: replay finished on ${run.finishFrames}, the file says ${lap.frames}`);
  }
  const path = { source: lap.source, frames: lap.frames, keys: lap.keys, position: [], quaternion: [], velocity: [], spin: [], steering: [], wheels: [] };
  for (const u8 of run.states) {
    const s = decodeState(u8);
    path.position[s.frames] = s.position;
    path.quaternion[s.frames] = s.quaternion;
    path.steering[s.frames] = s.steering;
    path.wheels[s.frames] = s.wheelContact.filter(Boolean).length;
  }
  path.position[0] = path.position[1]; path.quaternion[0] = path.quaternion[1];
  path.steering[0] = 0; path.wheels[0] = path.wheels[1];
  for (let t = 0; t <= path.frames; t++) {
    const a = Math.max(0, t - MOTION_GAP), dt = Math.max(1, t - a) / 1000;
    path.velocity[t] = [0, 1, 2].map((k) => (path.position[t][k] - path.position[a][k]) / dt);
    path.spin[t] = spinBetween(path.quaternion[a], path.quaternion[t], dt);
  }
  return path;
}

/**
 * Boundaries along the fastest lap and the tick at which every lap crosses
 * each of them.
 *
 * Returns { boundaries: [{ point, normal }], ticks } where ticks[i][k] is the
 * tick of lap i just after it crossed boundary k. ticks[i][0] is 0 (the start
 * line) and the last entry is the lap's finish tick, so
 * ticks[i][k + 1] - ticks[i][k] is lap i's time in section k.
 *
 * A crossing is the first tick, at or after the lap's previous crossing, on
 * which the car has gone from behind the plane to in front of it while within
 * `reach` units of the boundary point and heading the same way. The reach and
 * heading tests stop a plane from catching another piece of road: with a
 * reach of 15 units and no heading test, summer1's laps on the other line
 * "crossed" boundaries 11 units away at a 43 units/s different velocity. A lap that never does so
 * (another line or another route: on summer1 the two fastest laps are more
 * than 8 units from the other eight for most of the lap) gets null there and
 * cannot switch at that boundary; sectionTimes() explains how its time is
 * still counted in full.
 */
export function crossings(paths, sectionMs = 250, reach = 8) {
  const lead = paths[0];
  const boundaries = [];
  for (let t = sectionMs; t < lead.frames - sectionMs / 2; t += sectionMs) {
    const v = lead.velocity[t], n = Math.hypot(...v);
    boundaries.push({ point: lead.position[t], normal: v.map((x) => x / n) });
  }
  const ticks = paths.map((path) => {
    const out = [0];
    let from = 1;
    for (const { point, normal } of boundaries) {
      const ahead = (t) => normal[0] * (path.position[t][0] - point[0]) + normal[1] * (path.position[t][1] - point[1]) + normal[2] * (path.position[t][2] - point[2]);
      let found = null;
      // Laps on one leaderboard are within 2% of each other, so the crossing
      // is within a few hundred ticks of the previous one plus sectionMs.
      for (let t = Math.max(2, from); t <= Math.min(path.frames, from + 4 * sectionMs + 1000); t++) {
        if (ahead(t) < 0 || ahead(t - 1) >= 0) continue;
        if (Math.hypot(...[0, 1, 2].map((k) => path.position[t][k] - point[k])) >= reach) continue;
        // Moving the same way as the fastest lap was (within 45 degrees).
        const v = path.velocity[t];
        if (v[0] * normal[0] + v[1] * normal[1] + v[2] * normal[2] < 0.7 * Math.hypot(...v)) continue;
        found = t; break;
      }
      out.push(found);
      if (found != null) from = found;
    }
    out.push(path.frames);
    return out;
  });
  return { boundaries, ticks };
}

/** What each kind of mismatch between two car states costs, in "milliseconds
 *  of gain it cancels". Position, velocity and orientation use the weights of
 *  REJOIN_DEFAULTS in sim/sectional.mjs. Spin, steering angle and wheels on
 *  the road are the ones that file leaves out; their weights are guesses, not
 *  tuned. Measured between pairs of desert4 human laps at the same boundary
 *  (median / 95th percentile): distance 0.65 / 3.2 units, velocity 1.4 / 5.4
 *  units/s, orientation 0.02 / 0.07 rad, spin 0.08 / 0.52 rad/s, steering
 *  0.00 / 0.02, total cost 28 / 91 ms. So position and velocity decide the
 *  cost and steering angle hardly counts. */
export const MISMATCH_WEIGHTS = {
  perUnit: 20,          // ms per unit of distance
  perUnitPerSecond: 4,  // ms per unit/s of velocity difference
  perRadian: 150,       // ms per radian of orientation difference
  perRadianPerSecond: 20, // ms per rad/s of spin difference
  perSteer: 10,         // ms per unit of steering-angle difference
  perWheel: 15,         // ms per wheel that is on the road in one state and off it in the other
};

/**
 * How far apart are two car states? Each is
 * { position, quaternion, velocity, spin, steering, wheels }.
 * Returns { distance, speedDiff, angle, spinDiff, steerDiff, wheelDiff, cost }.
 */
export function mismatch(a, b, w = MISMATCH_WEIGHTS) {
  const norm = (x, y) => Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
  const m = {
    distance: norm(a.position, b.position),
    speedDiff: norm(a.velocity, b.velocity),
    angle: angleBetween(a.quaternion, b.quaternion),
    spinDiff: norm(a.spin, b.spin),
    steerDiff: Math.abs(a.steering - b.steering),
    wheelDiff: Math.abs(a.wheels - b.wheels),
  };
  m.cost = w.perUnit * m.distance + w.perUnitPerSecond * m.speedDiff + w.perRadian * m.angle +
    w.perRadianPerSecond * m.spinDiff + w.perSteer * m.steerDiff + w.perWheel * m.wheelDiff;
  return m;
}

/** The state of a recorded lap after `t` ticks, in the form mismatch() takes. */
export const stateAt = (path, t) => ({
  position: path.position[t], quaternion: path.quaternion[t], velocity: path.velocity[t],
  spin: path.spin[t], steering: path.steering[t], wheels: path.wheels[t],
});

/**
 * Which tick of a recorded lap is nearest to `position`, looking only from
 * `from` to `to`? Returns { tick, distance }. Used to ask "where on the
 * donor's lap is my car now".
 */
export function locate(path, position, from, to) {
  let best = -1, bestD2 = Infinity;
  // A window that starts past the donor's last tick (a car that has driven
  // on beyond the end of the donor lap; seen on desert3 with judge=finish,
  // 17 Oct 2026) would be empty and return tick -1, which crashed stateAt.
  // Start it no later than the last tick, so the end of the lap is used.
  for (let t = Math.max(1, Math.min(from, path.frames)); t <= Math.min(path.frames, Math.max(to, from)); t++) {
    const p = path.position[t];
    const d2 = (p[0] - position[0]) ** 2 + (p[1] - position[1]) ** 2 + (p[2] - position[2]) ** 2;
    if (d2 < bestD2) { bestD2 = d2; best = t; }
  }
  return { tick: best, distance: Math.sqrt(bestD2) };
}

/**
 * Section times: times[i][k] is lap i's ticks in section k.
 *
 * Where a lap missed boundaries, the whole stretch from the last boundary it
 * crossed to the next one it crossed is booked on the FIRST section of that
 * stretch and the others get 0. A lap cannot be joined or left at a boundary
 * it missed (planRoute's switch cost is infinite there), so a route either
 * takes the whole stretch or none of it, and every route's sum is a true
 * time. (An earlier version left such sections out, and on summer1 the
 * best-of-sections came out 918 ms "faster" than the best lap, all of it
 * false.) Each lap's row adds up to its lap time.
 */
export function sectionTimes(ticks) {
  return ticks.map((row) => row.slice(0, -1).map((tick, k) => {
    if (tick == null) return 0;
    let next = k + 1;
    while (row[next] == null) next++;
    return row[next] - tick;
  }));
}

/**
 * Choose which lap to follow in each section: the cheapest route through the
 * table of section times, where changing from lap i to lap j at boundary k
 * costs `switchCost(i, j, k)` extra milliseconds (Infinity = not allowed).
 * Plain dynamic programming, worked backwards from the finish; 10 laps and
 * about 90 boundaries, so nothing clever is needed.
 *
 * Returns { toGo, choice, route(k, lap) }:
 *   toGo[k][i]    cheapest cost from boundary k to the finish for a car that
 *                 arrives at boundary k on lap i (section times plus the
 *                 switch costs of the switches it would still make)
 *   choice[k][i]  the lap to drive section k on, for that car
 *   route(k, i)   { laps: [lap for section k, k+1, ...], time } following the
 *                 choices from there; `time` is section times only, without
 *                 switch costs (those are a judgement of risk, not time lost)
 * Working backwards is what lets the stitcher re-plan in the middle of a lap:
 * after a switch fails it bans that switch, plans again, and reads off the
 * route from the boundary and lap the car is actually at.
 */
export function planRoute(times, switchCost) {
  const n = times.length, sections = times[0].length;
  const toGo = [], choice = [];
  toGo[sections] = new Array(n).fill(0);
  for (let k = sections - 1; k >= 0; k--) {
    toGo[k] = new Array(n).fill(Infinity); choice[k] = new Array(n).fill(-1);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        // No switch is possible on the start line (k = 0): the first section
        // is a free choice of lap, made by the caller.
        const c = (i === j ? 0 : k === 0 ? Infinity : switchCost(i, j, k)) + times[j][k] + toGo[k + 1][j];
        if (c < toGo[k][i]) { toGo[k][i] = c; choice[k][i] = j; }
      }
    }
  }
  const route = (k, lap) => {
    const laps = []; let time = 0;
    for (; k < sections; k++) { lap = choice[k][lap]; laps.push(lap); time += times[lap][k]; }
    return { laps, time };
  };
  return { toGo, choice, route };
}
