// Building blocks for the SECTIONAL search (scripts/search_sections.mjs).
//
// The plain timeline search (sim/search.mjs, scripts/search_timeline.mjs)
// changes a key timing and re-drives the whole lap with every later key press
// left at its old time. That has a built-in ceiling: if a change makes the car
// reach the next corner 30 ms sooner, every later key press is now 30 ms late,
// and the lap crashes. Only changes that gain almost nothing survive, which is
// why that search finds tens of milliseconds and no more (measured: 43 to
// 90 ms in ten minutes on four tracks).
//
// The sectional search removes that ceiling with two ideas:
//
//   1. SAVE STATES. To try a change in seconds 8 to 9.5 of a lap, the car is
//      put back to its saved state at second 8 and only those 1.5 seconds are
//      driven, not the whole lap.
//
//   2. REJOIN AND SHIFT. At the end of the section we ask: where on the OLD
//      lap's path is the car now? If, at tick 9500, it is where the old lap
//      was at tick 9530 (same place, same speed, same heading), the change
//      gained 30 ms, and the rest of the old lap can be reused by moving all
//      its later key presses 30 ms EARLIER. This file calls that a splice.
//
// A splice is only a promise: the car is never in exactly the old state, and
// small differences grow. So every promising splice is then driven to the
// finish line (again from the save state, so the part of the lap before the
// section costs nothing) and is kept only if the lap really finishes sooner.
//
// This file holds the parts that do not touch the simulator.
import { CHANNELS } from './recording.mjs';

/** Is `channel` held while the physics computes tick `tick`? A key is down
 *  after an odd number of flips; a flip at tick t counts from tick t on
 *  (the same rule as toDense in sim/recording.mjs). */
export function heldAt(recording, channel, tick) {
  let n = 0;
  for (const t of recording[channel]) { if (t > tick) break; n++; }
  return n % 2 === 1;
}

/** The keys held while the physics computes tick `tick`. */
export function controlsAt(recording, tick) {
  const out = {};
  for (const ch of CHANNELS) out[ch] = heldAt(recording, ch, tick);
  return out;
}

/** The first tick after `tick` at which any key flips, or Infinity. */
export function nextFlipAfter(recording, tick) {
  let next = Infinity;
  for (const ch of CHANNELS) {
    for (const t of recording[ch]) { if (t > tick) { if (t < next) next = t; break; } }
  }
  return next;
}

/**
 * Join the start of one lap to the rest of another, shifted in time.
 *
 *   head    the lap whose keys are used for ticks 0 .. cut-1
 *   tail    the lap whose keys are used from then on
 *   cut     the tick at which the switch happens
 *   gain    how many ticks ahead of the tail lap the car is at `cut`: the
 *           tail's keys for tick cut+gain, cut+gain+1, ... are used at ticks
 *           cut, cut+1, ...
 *
 * A recording stores flips, not key states, so each key needs a check at the
 * join: if the head leaves a key down at `cut` and the tail expects it up at
 * cut+gain (or the other way round), one extra flip at `cut` puts it right.
 */
export function splice(head, tail, cut, gain) {
  const out = {};
  for (const ch of CHANNELS) {
    const flips = head[ch].filter((t) => t < cut);
    const rest = tail[ch].filter((t) => t >= cut + gain).map((t) => t - gain);
    // Key state just before the join in each lap: down after an odd number of flips.
    const headDown = flips.length % 2 === 1;
    const tailDown = (tail[ch].length - rest.length) % 2 === 1;
    if (headDown !== tailDown) {
      // An extra flip at `cut`. If the tail also flips exactly there, the two
      // cancel, and dropping both keeps the list strictly increasing.
      if (rest.length && rest[0] === cut) rest.shift();
      else flips.push(cut);
    }
    out[ch] = flips.concat(rest);
  }
  return out;
}

/** Angle in radians between two orientations given as quaternions. */
function angleBetween(a, b) {
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return 2 * Math.acos(Math.min(1, dot));
}

/** Default weights of rejoin(): how many milliseconds of gain each kind of
 *  mismatch is treated as cancelling. They decide which candidates are worth
 *  the cost of driving to the finish, nothing more: the finish-line check is
 *  what accepts or rejects a change. */
export const REJOIN_DEFAULTS = {
  // Search for the matching point from this many ticks behind to this many
  // ahead of where the old lap was at the same moment.
  maxLoss: 60,
  maxGain: 400,
  perUnit: 20,          // ms per unit of distance from the old path
  perUnitPerSecond: 4,  // ms per unit/s of difference in velocity
  perRadian: 150,       // ms per radian of difference in orientation
};

/**
 * Where on the old lap's path is the car, and how well does it match?
 *
 *   path   the old lap: path.position[t] and path.quaternion[t] are the car
 *          after t ticks (arrays of [x,y,z] and [x,y,z,w]); path.first and
 *          path.last are the first and last tick it covers
 *   end    the candidate's car now: { frames, position, velocity, quaternion }
 *
 * Returns { gain, distance, speedDiff, angle, score }:
 *   gain       ticks ahead of the old lap (the old lap was here at frames+gain)
 *   distance   units between the car and that point of the old path
 *   speedDiff  size of the velocity difference there, units per second
 *   angle      orientation difference there, radians
 *   score      gain minus the mismatch penalties, in milliseconds
 * or null if the car is nowhere near the stretch of path that was searched.
 */
export function rejoin(path, end, options = {}) {
  const o = { ...REJOIN_DEFAULTS, ...options };
  const from = Math.max(path.first + 1, end.frames - o.maxLoss);
  const to = Math.min(path.last, end.frames + o.maxGain);
  let best = -1, bestD2 = Infinity;
  for (let t = from; t <= to; t++) {
    const p = path.position[t];
    const d2 = (p[0] - end.position[0]) ** 2 + (p[1] - end.position[1]) ** 2 + (p[2] - end.position[2]) ** 2;
    if (d2 < bestD2) { bestD2 = d2; best = t; }
  }
  if (best === -1) return null;
  // The old lap's velocity at that tick, from its last step (1 tick = 1 ms).
  const a = path.position[best - 1], b = path.position[best];
  const speedDiff = Math.hypot(...[0, 1, 2].map((k) => (b[k] - a[k]) * 1000 - end.velocity[k]));
  const distance = Math.sqrt(bestD2);
  const angle = angleBetween(path.quaternion[best], end.quaternion);
  const gain = best - end.frames;
  return {
    gain, distance, speedDiff, angle,
    score: gain - o.perUnit * distance - o.perUnitPerSecond * speedDiff - o.perRadian * angle,
  };
}
