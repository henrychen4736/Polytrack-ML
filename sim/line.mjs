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
