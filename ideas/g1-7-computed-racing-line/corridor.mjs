// The drivable corridor of a track: a centre line and how far the road
// reaches to its left and right at every point.
//
//   const corridor = await buildCorridor('desert4', humanLaps('desert4')[0]);
//   corridor.points[k], corridor.left[k], corridor.lo[k] .. corridor.hi[k]
//
// A racing line is then "the centre shifted sideways by a[k] units at each
// point", with lo[k] <= a[k] <= hi[k] (positive = to the left).
//
// WHERE THE CENTRE COMES FROM, AND WHERE THE WIDTH DOES. This is not a
// corridor found from the track alone. The ORDER of the road (which piece
// follows which, over jumps and through stacked levels) and the centre are
// taken from a lap that finishes: the path that lap drove, one point per
// unit. Any finishing lap will do (a human's, a policy's, a stitched one).
// The WIDTH is measured from the track's collision triangles and owes nothing
// to the lap: sideways rays for walls, downward probes for open road edges
// (the same two tests as sim/trackmesh.mjs clearanceProfile, but sideways is
// taken square to the PATH, not to where the car happened to be pointing).
//
// WHERE THE LINE MAY MOVE ("free" points) and where it is pinned to the lap:
//   free     wheels on the road, road within TILT_DEG of level, and no
//            airborne point within AIR_GUARD units before or after
//   pinned   in the air; within AIR_GUARD of a take-off or landing (the car
//            has to leave the ramp where and how the lap did, or it lands
//            somewhere else); banked road and wall rides (the flat-ground car
//            model in car_model.mjs says nothing true about them)
// At a pinned point lo = hi = 0. `stats` says how much of the track is which.
import { Env, loadTrack } from '../../sim/env.mjs';
import { decodeState } from '../../sim/state.mjs';
import { rotate } from '../../sim/track.mjs';
import { buildTrackMesh } from '../../sim/trackmesh.mjs';

/** Distance between corridor points along the lap, units. */
export const SPACING = 1;
/** Furthest the road edge is looked for, units. Wider reads as this. */
export const MAX_ROOM = 20;
/** Kept between the line and the road edge, units: half the car's width
 *  (the collision shape is 1.5 wide, so 0.75) plus about 1 for the tracker's
 *  error (the pure-pursuit driver runs up to about 1 unit off its line). */
export const MARGIN = 1.7;
/** Road steeper sideways or lengthways than this is not treated as flat. */
export const TILT_DEG = 15;
/** The line is pinned for this many units either side of any airborne point. */
export const AIR_GUARD = 15;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const along = (p, d, t) => [p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t];

/**
 * How far the road reaches from `p` in direction `dir` (a unit vector lying
 * in the road), with `up` the road's normal: the nearer of a wall and the end
 * of the surface. `onRoad` false (the lap was in the air here) skips the
 * surface test, because there is no surface under the point to follow.
 */
export function roomBeside(mesh, p, dir, up, onRoad) {
  // Walls: rays at two heights above the car's origin, so they pass over the
  // road itself but hit kerbs, barriers and walls.
  let edge = MAX_ROOM;
  for (const h of [0.15, 0.6]) edge = Math.min(edge, mesh.raycast(along(p, up, h), dir, MAX_ROOM));
  // Open edges: step sideways until two probes in a row find no road within
  // 2 units below (one miss can be a hairline gap between two parts).
  const down = [-up[0], -up[1], -up[2]];
  const roadBelow = (d) => mesh.raycast(along(along(p, dir, d), up, 0.5), down, 2) !== Infinity;
  if (onRoad && roadBelow(0)) {
    let misses = 0, d = 0.5;
    for (; d < edge; d += 0.5) {
      if (roadBelow(d)) { misses = 0; continue; }
      if (++misses === 2) { edge = d - 0.75; break; }
    }
    // The search stops at MAX_ROOM, and a road that ends within the last unit
    // before it (19.0 to 19.5 out) has had only ONE miss by then, so it read
    // as "20 or wider": up to 1 unit of road that is not there, which put a
    // car at the bound 0.05 to 0.3 units over the edge (3 points on desert4).
    // The next probe would be at MAX_ROOM or beyond, which counts as a miss
    // by definition, so that one miss is the edge. Only for the MAX_ROOM
    // stop: before a wall a single miss is still treated as a hairline gap.
    // (Found by tests/test_5_corridor_sim.mjs.)
    if (misses === 1 && edge === MAX_ROOM) edge = d - 0.75;
  }
  return edge;
}

/**
 * Build the corridor of `track` (a track name) around `lap` (a lap object
 * from ideas/shared/laps.mjs, or anything with { recording, frames }).
 * Boots one simulator for the replay unless `env` is given (its car is replaced).
 *
 * Returns arrays with one entry per point (point k is k * SPACING along the lap):
 *   points    [x,y,z] where the lap's car was
 *   tangent   unit vector along the lap's path
 *   up        the car's up there (the road's normal while on the road)
 *   left      unit vector square to both: the direction a shift moves the line
 *   grounded  any wheel touching
 *   tick      lap clock when the lap's car was there, ms
 *   kmh       the lap's speed there
 *   roomLeft, roomRight   distance to the road edge, units (up to MAX_ROOM)
 *   nearAir   in the air, or within AIR_GUARD units of a point that is
 *   free      true where the line may be shifted
 *   lo, hi    allowed shift: -(roomRight - MARGIN) .. roomLeft - MARGIN, never
 *             excluding 0 (the lap itself got through at 0); 0..0 where pinned
 * and
 *   frames    the lap's time in ticks
 *   stats     { points, free, air, airGuard, tilted, medianWidth }
 */
export async function buildCorridor(track, lap, { env = null, mesh = null } = {}) {
  const createCar = loadTrack(track);
  const own = env ?? await Env.create();
  const run = await own.replay(createCar, lap.recording, lap.frames + 100);
  if (!env) await own.close();
  if (!run.finished) throw new Error('buildCorridor: the lap does not finish');
  mesh ??= buildTrackMesh(createCar.trackData);

  // One point per SPACING units of travel (the rule of sim/line.mjs buildLine,
  // kept here because the tick at each point is needed too).
  const points = [], up = [], grounded = [], tick = [], kmh = [];
  for (const u8 of run.states) {
    const s = decodeState(u8);
    if (points.length && Math.hypot(...sub(s.position, points.at(-1))) < SPACING) continue;
    points.push(s.position); up.push(rotate([0, 1, 0], s.quaternion));
    grounded.push(s.wheelContact.some(Boolean)); tick.push(s.frames); kmh.push(s.speedKmh);
  }
  const n = points.length;

  // Direction of travel from the points 3 either side (the path, not the
  // car's nose: the two differ by the slip angle and by any air rotation).
  const tangent = points.map((_, k) => unit(sub(points[Math.min(n - 1, k + 3)], points[Math.max(0, k - 3)])));
  // Car frame: x = left, y = up, z = forward, so left = up x forward.
  const left = tangent.map((t, k) => unit(cross(up[k], t)));

  // Which points are free.
  const cosTilt = Math.cos(TILT_DEG * Math.PI / 180);
  const nearAir = new Uint8Array(n);
  for (let k = 0; k < n; k++) if (!grounded[k]) for (let j = Math.max(0, k - AIR_GUARD); j <= Math.min(n - 1, k + AIR_GUARD); j++) nearAir[j] = 1;
  const stats = { points: n, free: 0, air: 0, airGuard: 0, tilted: 0, medianWidth: 0 };
  const free = new Array(n), roomLeft = new Float32Array(n), roomRight = new Float32Array(n);
  const lo = new Float32Array(n), hi = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const flat = up[k][1] > cosTilt;
    free[k] = grounded[k] && !nearAir[k] && flat;
    if (!grounded[k]) stats.air++; else if (nearAir[k]) stats.airGuard++; else if (!flat) stats.tilted++; else stats.free++;
    roomLeft[k] = roomBeside(mesh, points[k], left[k], up[k], grounded[k]);
    roomRight[k] = roomBeside(mesh, points[k], [-left[k][0], -left[k][1], -left[k][2]], up[k], grounded[k]);
    if (free[k]) { hi[k] = Math.max(0, roomLeft[k] - MARGIN); lo[k] = -Math.max(0, roomRight[k] - MARGIN); }
  }
  const widths = [];
  for (let k = 0; k < n; k++) if (free[k]) widths.push(roomLeft[k] + roomRight[k]);
  widths.sort((a, b) => a - b);
  stats.medianWidth = widths.length ? widths[widths.length >> 1] : 0;
  return { track, frames: run.finishFrames, points, tangent, up, left, grounded, tick, kmh, roomLeft, roomRight, nearAir, free, lo, hi, stats };
}
