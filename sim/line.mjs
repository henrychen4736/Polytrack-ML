// Reference line: the trajectory of a real lap, resampled by distance.
//
// Stage 2, step 2. The gate path from sim/track.mjs is too coarse to steer by
// (a handful of points per lap), so the controller follows the line a human
// actually drove. We replay a leaderboard recording, take the car's position
// every frame, and keep one point per SPACING world units of travel. At each
// point we also keep how fast the human was going there, which the controller
// uses as its speed target.
import { decodeState } from './state.mjs';

/** Distance between consecutive line points, in world units (roughly metres). */
export const SPACING = 1;

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Build a reference line from the per-frame states of a replayed lap
 * (the `states` array returned by Env.replay).
 *
 * Returns:
 *   points    [[x,y,z], ...]  one every SPACING units along the lap
 *   speedKmh  [number, ...]   the lap's speed at each point
 *   grounded  [boolean, ...]  whether any wheel was touching the road there
 *   quaternions [[x,y,z,w], ...] how the human's car was oriented there (used
 *             by sim/trackmesh.mjs to know which way is sideways and up)
 *   length    total length of the line
 * Because points are evenly spaced, point k is k * SPACING along the line.
 */
export function buildLine(states) {
  const first = decodeState(states[0]);
  const points = [first.position];
  const speedKmh = [first.speedKmh];
  const grounded = [first.wheelContact.some(Boolean)];
  const quaternions = [first.quaternion];
  for (const u8 of states) {
    const s = decodeState(u8);
    // Keep this frame only once the car has travelled SPACING since the last
    // kept point. At 1000 frames/s the car moves far less than SPACING per
    // frame, so kept points end up almost exactly SPACING apart.
    if (dist(s.position, points.at(-1)) >= SPACING) {
      points.push(s.position);
      speedKmh.push(s.speedKmh);
      grounded.push(s.wheelContact.some(Boolean));
      quaternions.push(s.quaternion);
    }
  }
  return { points, speedKmh, grounded, quaternions, length: (points.length - 1) * SPACING };
}

/**
 * Where is the car along the line?
 *
 * Returns the index of the line point nearest to `position`, searching only
 * from `fromIndex` to `fromIndex + window`. Searching forward only is
 * deliberate: where the track crosses over or runs back beside itself, the
 * globally nearest point can belong to a later (or earlier) part of the lap,
 * and jumping to it would send the car the wrong way.
 */
export function nearestIndex(line, position, fromIndex, window = 60) {
  let best = fromIndex;
  let bestDist = Infinity;
  const end = Math.min(line.points.length - 1, fromIndex + window);
  for (let k = fromIndex; k <= end; k++) {
    const d = dist(line.points[k], position);
    if (d < bestDist) { bestDist = d; best = k; }
  }
  return { index: best, distance: bestDist };
}

/** Index of the point `metres` further along the line than `index` (clamped to the end). */
export function indexAhead(line, index, metres) {
  return Math.min(line.points.length - 1, index + Math.round(metres / SPACING));
}

/**
 * How straight is the road at each line point? Returns a Float32Array with
 * one number per point, from 1 (dead straight here and for a little way ahead)
 * down to 0 (in or just before a real corner).
 *
 * Used to price steering changes (rl/racing_env.mjs): tapping left and right
 * is the right technique through some corners and pure loss on a straight,
 * so a change costs the full amount where this is 1 and nothing where it is 0.
 *
 * How it is measured. At point k, compare the direction the line arrives
 * from (k - window to k) with the direction it leaves in (k to k + window).
 * Only the turn ABOUT THE CAR'S OWN UP AXIS counts: that is what steering
 * does. A crest or a dip bends the line too, but not in a way a steering key
 * answers. The angle divided by the distance is the curvature, in radians per
 * unit; 1 / curvature is the corner's radius.
 *
 * A point then takes the WORST (largest) curvature found from `before` units
 * behind it to `ahead` units in front, so that the approach to a corner and
 * its exit count as corner too: that is where a driver sets the car up.
 *
 *   full   curvature at which straightness reaches 0. 0.01 = a radius of
 *          100 units. That sounds gentle, but these tracks are driven at 200
 *          to 500 km/h, where even such a bend needs real steering. Checked
 *          against the human laps: on stretches this rates above 0.8 the
 *          human has no steering key down 91 to 98% of the time and changes
 *          steering 0 to 4 times a second; such stretches are only about 5 to
 *          25% of a lap.
 */
export function lineStraightness(line, lineUp, { window = 16, before = 10, ahead = 40, full = 0.01 } = {}) {
  const n = line.points.length;
  const curvature = new Float32Array(n);
  for (let k = window; k < n - window; k++) {
    const p = line.points[k], a = line.points[k - window], b = line.points[k + window], up = lineUp[k];
    // Arriving and leaving directions with their "up" part removed.
    const flat = (v) => { const d = v[0] * up[0] + v[1] * up[1] + v[2] * up[2]; return [v[0] - d * up[0], v[1] - d * up[1], v[2] - d * up[2]]; };
    const d1 = flat([p[0] - a[0], p[1] - a[1], p[2] - a[2]]), d2 = flat([b[0] - p[0], b[1] - p[1], b[2] - p[2]]);
    const l1 = Math.hypot(...d1), l2 = Math.hypot(...d2);
    if (l1 < 1e-6 || l2 < 1e-6) continue;
    const cos = Math.max(-1, Math.min(1, (d1[0] * d2[0] + d1[1] * d2[1] + d1[2] * d2[2]) / (l1 * l2)));
    curvature[k] = Math.acos(cos) / window;
  }
  const straight = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    let worst = 0;
    for (let j = Math.max(0, k - before); j <= Math.min(n - 1, k + ahead); j++) worst = Math.max(worst, curvature[j]);
    straight[k] = 1 - Math.min(1, worst / full);
  }
  return straight;
}
