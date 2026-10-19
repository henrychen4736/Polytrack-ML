// A scripted driver for generated tracks: follow the route, slow for corners.
//
// This is the "is the track drivable?" test. It is NOT a fast driver and is
// not meant to be: its job is to finish, so that a finish proves the track
// can be driven and a failure can be looked at.
//
// The steering and pedal logic is the project's existing pure-pursuit
// controller (sim/controller.mjs), in the same loop as sim/drive.mjs. That
// controller follows a "line": points one unit apart with a target speed at
// each. On the official tracks the line and its speeds come from a human
// lap. A generated track has no human lap, so here the line is the
// generator's route (the measured middle of the road) and the speeds are
// worked out from the route's shape:
//
//   corner      v <= sqrt(sideGrip / curvature)      do not slide out
//   crest       v <= sqrt(crestGrip / crest curvature)  do not take off
//   before both braking at brakeGrip, worked backwards from the slow spot
//
// The three "grips" are accelerations in units/s^2 and are set by
// experiment; see README.md for the runs behind the defaults.
//
// JUMPS (tracks made with features.jumps; route.jumps and route.air). A jump
// needs a speed window, not a limit, so on the 40 units before each take-off
// the speed is held to the jump's target (generate.mjs / g2-2-features.mjs:
// between 1.25 x its minimum and 0.9 x its maximum) whatever the speed scale,
// and the corner and crest limits are not applied over the gap and the 15
// units before it (the take-off edge is a "crest" that would otherwise slow
// the car below the minimum). In the air the follower holds S (the air
// brake, as players do) and the off-road rules wait until it is down again.
import { DECISION_TICKS } from '../../sim/drive.mjs';
import { createController } from '../../sim/controller.mjs';
import { decodeState } from '../../sim/state.mjs';
import { writeFileSync } from 'node:fs';
import { keysToRecording } from '../shared/laps.mjs';
import { loadTrackInfo } from '../shared/track_info.mjs';

export const DRIVER_DEFAULTS = {
  /** Top speed, km/h. */
  maxKmh: 250,
  /** Sideways acceleration allowed in a corner, units/s^2. */
  sideGrip: 20,
  /** Downward acceleration allowed over a crest, units/s^2: below gravity,
   *  so the wheels stay loaded. */
  crestGrip: 5,
  /** Braking the profile plans for, units/s^2. */
  brakeGrip: 15,
  /** Multiplies every speed limit above; the drivability test steps this
   *  down (see driveTrack). */
  speedScale: 1,
};

/**
 * Turn a route (generate.mjs buildRoute) into a line for sim/controller.mjs:
 * { points, speedKmh, grounded } with one entry per route point.
 */
export function routeToLine(route, options = {}) {
  const cfg = { ...DRIVER_DEFAULTS, ...options };
  const pts = route.points, n = pts.length;
  const W = 5; // points either side that a direction is measured over
  const limit = new Float64Array(n).fill((cfg.maxKmh / 3.6) * cfg.speedScale); // units/s
  for (let k = W; k < n - W; k++) {
    const a = pts[k - W], p = pts[k], b = pts[k + W];
    // Heading change over W units = sideways curvature (radians per unit).
    const h1 = Math.atan2(p[0] - a[0], p[2] - a[2]), h2 = Math.atan2(b[0] - p[0], b[2] - p[2]);
    let turn = h2 - h1;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn)); // wrap to -pi..pi
    const side = Math.abs(turn) / W;
    // Change of climb angle over W units. Negative = the road falls away
    // (a crest); positive = a dip, which only presses the car down.
    const flat = (u, v) => Math.hypot(v[0] - u[0], v[2] - u[2]) || 1e-9;
    const crest = Math.max(0, -(Math.atan2(b[1] - p[1], flat(p, b)) - Math.atan2(p[1] - a[1], flat(a, p))) / W);
    if (side > 1e-4) limit[k] = Math.min(limit[k], Math.sqrt(cfg.sideGrip / side) * cfg.speedScale);
    if (crest > 1e-4) limit[k] = Math.min(limit[k], Math.sqrt(cfg.crestGrip / crest) * cfg.speedScale);
  }
  // JUMPS: no corner or crest limit over the gap and the 15 units before it;
  // the target speed on the 40 units before the edge.
  for (const j of route.jumps ?? []) {
    for (let k = Math.max(0, j.from - 15); k <= Math.min(n - 1, j.to); k++) limit[k] = (cfg.maxKmh / 3.6) * cfg.speedScale;
    for (let k = Math.max(0, j.from - 40); k <= j.from; k++) limit[k] = j.targetKmh / 3.6;
  }
  // Braking, worked backwards: the speed here may not exceed what can be
  // shed by the next point (v^2 = v_next^2 + 2 * braking * distance).
  for (let k = n - 2; k >= 0; k--) limit[k] = Math.min(limit[k], Math.sqrt(limit[k + 1] ** 2 + 2 * cfg.brakeGrip * route.spacing));
  // Over a gap the controller ignores the speeds (it only reads speeds where
  // the line is on the ground).
  return { points: pts, speedKmh: Array.from(limit, (v) => v * 3.6), grounded: route.air ? route.air.map((a) => !a) : new Array(n).fill(true) };
}

/** Speed scales tried in turn by driveTrack: the full profile, then slower. */
export const SPEED_LADDER = [1, 0.7, 0.45];
/** Further than this from the centre line, the car is off the road. The
 *  kerbs are 5.57 from the centre and the car is about 2 wide, so its side
 *  meets the kerb at about 4.5; clean attempts stay within 2.1. */
export const OFF_ROAD = 5;
/** Further than this from the last place the car had track surface under
 *  it, the car is off the road (see attempt()). The shortest piece is 20
 *  units long, so any missing piece is far longer than this. */
export const OFF_SURFACE = 3;

/**
 * One attempt at one speed scale. Returns { outcome, finishFrames, fraction,
 * worstOffLine, index, keys }:
 *   outcome   'finished' | 'left the road' | 'stalled' | 'out of time'
 *   fraction  how far along the route the car got, 0..1; index = route point
 *   keys      the keys held on every tick up to the finish (null otherwise)
 *
 * The loop is sim/drive.mjs driveLap's, with one more way to stop: being
 * further than OFF_ROAD from the route. That matters because the simulator
 * has ground at height 0: a car that falls off a raised road keeps driving
 * underneath it, and without this rule would count as making progress.
 */
async function attempt(env, track, line, mesh) {
  env.reset(track.createCar);
  // Where the car last had the track's own surface under it (see the loop).
  let lastOnRoad = null;
  const jumps = !!track.route.jumps?.length;
  const decide = createController(line, { crossTrackGain: 1, ...(jumps ? { airBrake: 1 } : {}) });
  // The first decision needs a state, and a state only exists after a tick.
  let state = decodeState((await env.step({}, 1))[0]);
  const keys = [{}];
  // Time limit: the slowest the controller ever aims for is 40 km/h (11
  // units/s); allow half that pace over the whole route.
  const maxTicks = Math.ceil((track.route.length / 5.5) * 1000);
  let worstOffLine = 0, best = 0, bestTick = 0, outcome = 'out of time';
  while (state.frames < maxTicks) {
    const { controls, progress, offLine } = decide(state);
    state = decodeState((await env.step(controls, DECISION_TICKS)).at(-1));
    for (let k = 0; k < DECISION_TICKS; k++) keys.push(controls);
    worstOffLine = Math.max(worstOffLine, offLine);
    if (progress > best) { best = progress; bestTick = state.frames; }
    // Is the track's own surface under the car? The distance-from-the-route
    // rule below cannot tell on a road at ground level (baseLevel 0): the
    // world's ground plane is 0.21 below the road, so a car crossing a hole in
    // the road on the grass stays within a unit or two of the route, and a
    // track with a 60-unit piece missing was reported "finished" at full
    // speed (tests/test_4_sim.mjs). The mesh holds only the track's parts,
    // never the ground plane, so a ray down from the car answers it: no
    // surface within 4 units below for OFF_SURFACE units of travel = off the
    // road. (One miss is not enough: a ray can slip through the seam between
    // two parts; 4 units down allows for a hop over a crest.)
    const p = state.position;
    // JUMPS: in the air (no wheel down) on a track with jumps, neither rule
    // applies; they apply again from the first tick a wheel is down, so a
    // car that came down short, on the ground below, is caught there.
    const flying = jumps && !state.wheelContact.some(Boolean);
    if (mesh.raycast([p[0], p[1] + 0.5, p[2]], [0, -1, 0], 4.5) !== Infinity) lastOnRoad = p;
    else if (!flying && lastOnRoad && Math.hypot(p[0] - lastOnRoad[0], p[1] - lastOnRoad[1], p[2] - lastOnRoad[2]) > OFF_SURFACE) { outcome = 'left the road'; break; }
    if (state.finishFrames != null) { outcome = 'finished'; break; }
    if (!flying && offLine > OFF_ROAD) { outcome = 'left the road'; break; }
    if (state.frames - bestTick > 3000) { outcome = 'stalled'; break; } // 3 s without getting further
  }
  const finished = outcome === 'finished';
  return {
    outcome, finishFrames: finished ? state.finishFrames : null, fraction: best / (line.points.length - 1), worstOffLine, index: best,
    keys: finished ? keys.slice(0, state.finishFrames) : null,
  };
}

/**
 * Try to drive a generated track from the start to the finish.
 *
 *   env      a sim/env.mjs Env (one simulator); its car is replaced
 *   track    { createCar, route } as generate.mjs returns or loads
 *   options  DRIVER_DEFAULTS overrides; `ladder` replaces SPEED_LADDER
 *
 * The lap is attempted at each speed scale of the ladder until one finishes.
 * Returns { finished, finishFrames, speedScale, keys, attempts }: `keys` is
 * the finishing lap (one { up, down, left, right } per tick), and attempts
 * has one entry per scale tried: { speedScale, outcome, finishFrames,
 * fraction, worstOffLine, piece } (`piece` = index into track.pieces of the
 * piece the car had reached when the attempt ended).
 */
export async function driveTrack(env, track, options = {}) {
  const { ladder = SPEED_LADDER, ...driver } = options;
  const attempts = [];
  // The track's collision mesh (0.1 to 0.5 s to build), for the "is there
  // road under the car" rule in attempt().
  const mesh = loadTrackInfo(track.createCar).mesh;
  for (const speedScale of ladder) {
    const run = await attempt(env, track, routeToLine(track.route, { ...driver, speedScale }), mesh);
    attempts.push({ speedScale, outcome: run.outcome, finishFrames: run.finishFrames, fraction: run.fraction, worstOffLine: run.worstOffLine, piece: track.route.piece[run.index] });
    if (run.outcome === 'finished') return { finished: true, finishFrames: run.finishFrames, speedScale, keys: run.keys, attempts };
  }
  return { finished: false, finishFrames: null, speedScale: null, keys: null, attempts };
}

/**
 * Write a finishing lap next to its track as <name>.lap.json:
 * { track, frames, recording, source, speedScale }. `frames` and `recording`
 * are the two fields the project's lap files carry (data/laps/, the
 * `refFile` option of rl/racing_env.mjs), so the lap can stand in for the
 * human lap the training environment needs. It is a SLOW lap: see README.md.
 * Returns the path.
 */
export function saveLap(track, drive, dir) {
  const file = `${dir}/${track.name}.lap.json`;
  writeFileSync(file, JSON.stringify({ track: track.name, frames: drive.finishFrames, recording: keysToRecording(drive.keys), source: 'g2-2 scripted follower', speedScale: drive.speedScale }));
  return file;
}
