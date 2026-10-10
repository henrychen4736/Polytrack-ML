// An observation that needs no human lap: what RacingEnv._observe() gives the
// agent (rl/racing_env.mjs), with everything that came from the human's lap
// replaced by the same kind of information taken from the route of route.mjs.
//
//   const info = loadTrackInfo('desert4');              // ideas/shared/track_info.mjs
//   const observer = createObserver(info, routeFor(info));
//   observer.reset();                                   // car on the start line
//   const { obs, at } = observer.observe({ state, older, held, contact, pedalOpen });
//
//   state, older   two decoded car states (sim/state.mjs), `older` a few ticks
//                  before `state` (RacingEnv keeps exactly this pair; with
//                  SimSession use sim.recent[0] and sim.state)
//   held           the keys held during the last decision: { up, down, left, right }
//   contact        true if the car's body touched anything during the last step
//   pedalOpen      true if W and S will be read at the coming decision
//   at             progress.mjs: where the car is on the route (progress,
//                  offRoute, overRoad, ...), for reward and episode ends.
//                  An environment that has already called
//                  observer.tracker.update(state) for this step (to work out
//                  the reward) passes that result in as `at`, so the tracker
//                  is moved once per step, not twice.
//
// LAYOUT (OBS_SIZE = 334 numbers). "as now" = identical to the existing
// 352-number observation, entry for entry, so those weights could be kept.
//
//   [0]         speed, km/h / 300                                    as now
//   [1..3]      velocity in the car's frame (left, up, forward), units/s / 80, clipped to +-3   as now
//   [4..6]      world "up" in the car's frame                        as now
//   [7..9]      rotation rate about the car's axes, rad/s / 5, clipped   as now
//   [10..13]    each wheel touching (1) or not (0)                   as now
//   [14]        steering angle, rad / 0.45                           as now
//   [15]        W minus S held; [16] steering held: +1 left, -1 right   as now
//   [17..19]    nearest ROUTE point in the car's frame, units / 10, clipped   (was: nearest point of the human's line)
//   [20]        fraction of the route covered, or 0 if lapFraction is off     (was: fraction of the human's line)
//   [21..80]    20 route points ahead, each (left, up, forward) in the car's
//               frame divided by its distance along the route (k x gap), so
//               each is roughly a unit direction; gap = max(2, speed x 0.15 s)   (was: the human's line)
//   [81..100]   route CURVATURE at those points, rad per unit / 0.05, clipped:
//               +1 = a left bend of radius 20                         (was: the human's speed there)
//   [101..102]  room from the car to the road's edge, left and right, units / 10   as now, but measured at the car (progress.mjs)
//   [103]       body contact during the last step                    as now
//   [104..143]  room beside the route at the 20 points, left then right, / 10      as now, about the route
//   [144]       S held; [145] W and S are read at the coming decision   as now
//   [146..271]  at the nearest point and the 20 ahead: the route's forward
//               direction (3) and the road's "up" (3) in the car's frame   (was 9 numbers: the human car's forward and up, and the human's keys)
//   [272..291]  SLOPE at the 20 points: the route's climb per unit (+1 = straight up)   new
//   [292..311]  1 where the route is on the road at that point, 0 where it flies       new
//   [312]       distance along the route to the next flight, sqrt(d / 240), 1 if none within 240 units   new
//   [313]       that flight's length, sqrt(length / 240) (0 if none)      new
//   [314]       the take-off speed the route was computed for, km/h / 300 (0 if none)  new
//   [315]       distance along the route to the next gate, sqrt(d / 240) capped at 1   new
//   [316]       height of the car above the route, units / 10, clipped    new
//   [317..333]  the 16 rays from the car and the 1 straight down in world
//               terms, sqrt(distance / 120)                           as now (was [335..351])
//
// What is gone and not replaced: the human's SPEED at each point ahead, and
// the human's KEYS (W, S, steer). Nothing derived from the track alone says
// how fast a corner can be taken; curvature, slope and the flight numbers are
// what the agent has to work that out from.
import { rotate } from '../../sim/track.mjs';
import { MAX_CLEARANCE } from '../../sim/trackmesh.mjs';
import { createTracker } from './progress.mjs';

/** Route points ahead that the agent sees (LOOKAHEAD_POINTS in rl/racing_env.mjs). */
export const LOOKAHEAD_POINTS = 20;

// Scales and limits, copied from rl/racing_env.mjs (they are not exported
// there). smoke_test.mjs checks the "as now" entries against RacingEnv's own
// observation, so a change over there will show up.
const SPEED_KMH_SCALE = 300, VELOCITY_SCALE = 80, SPIN_SCALE = 5, STEER_SCALE = 0.45, NEAR_SCALE = 10, CLIP = 3, EDGE_SCALE = 10;
const RAY_RANGE = 120, RAY_HEIGHT = 0.5;
const RAY_DIRECTIONS = (() => {
  const rad = (degrees) => (degrees * Math.PI) / 180;
  const out = [[0, 0, 1]];
  for (const a of [5, 10, 20, 35, 55, 90]) {
    out.push([Math.sin(rad(a)), 0, Math.cos(rad(a))]);
    out.push([-Math.sin(rad(a)), 0, Math.cos(rad(a))]);
  }
  out.push([0, -1, 0]);
  for (const a of [20, 45]) out.push([0, -Math.sin(rad(a)), Math.cos(rad(a))]);
  return out;
})();
/** Curvature that reads as 1: a bend of radius 20 units. The tightest bends
 *  on the official routes are about radius 10 (reads 2). */
const CURVATURE_SCALE = 0.05;
/** How far ahead the flight and gate distances look, units along the route. */
const AHEAD_RANGE = 240;

// Where each block starts.
export const OBS_NEAR = 17, OBS_FRACTION = 20, OBS_POINTS = 21;
export const OBS_CURVATURE = OBS_POINTS + 3 * LOOKAHEAD_POINTS;          // 81
export const OBS_EDGE_NOW = OBS_CURVATURE + LOOKAHEAD_POINTS;             // 101
export const OBS_CONTACT = OBS_EDGE_NOW + 2;                              // 103
export const OBS_EDGE_AHEAD = OBS_CONTACT + 1;                            // 104
export const OBS_S_HELD = OBS_EDGE_AHEAD + 2 * LOOKAHEAD_POINTS;          // 144
export const OBS_PEDAL_OPEN = OBS_S_HELD + 1;                             // 145
export const OBS_FRAME = OBS_PEDAL_OPEN + 1;                              // 146
export const OBS_SLOPE = OBS_FRAME + 6 * (1 + LOOKAHEAD_POINTS);          // 272
export const OBS_ON_ROAD = OBS_SLOPE + LOOKAHEAD_POINTS;                  // 292
export const OBS_FLIGHT = OBS_ON_ROAD + LOOKAHEAD_POINTS;                 // 312
export const OBS_GATE = OBS_FLIGHT + 3;                                   // 315
export const OBS_HEIGHT = OBS_GATE + 1;                                   // 316
export const OBS_RAYS = OBS_HEIGHT + 1;                                   // 317
export const OBS_SIZE = OBS_RAYS + RAY_DIRECTIONS.length + 1;             // 334

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const clip = (v, lim = CLIP) => Math.max(-lim, Math.min(lim, v));
const toCarFrame = (v, q) => rotate(v, [-q[0], -q[1], -q[2], q[3]]);
function quatMultiply(a, b) {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
}

/**
 * An observer for one car on one track.
 *   info    loadTrackInfo(track): its mesh is used for the rays
 *   route   route.mjs buildRoute / route_store.mjs routeFor
 *   options lapFraction (default 0: off, as in multi-track training),
 *           minGap (2), gapSeconds (0.15): as in rl/racing_env.mjs DEFAULTS
 */
export function createObserver(info, route, { lapFraction = 0, minGap = 2, gapSeconds = 0.15 } = {}) {
  const mesh = info.mesh;
  const tracker = createTracker(route, mesh);
  const last = route.points.length - 1;
  const spacing = route.spacing;
  // For "distance to the next flight" and "to the next gate": for every
  // route point, the first flight that starts at or after it.
  const nextFlight = new Int32Array(route.points.length).fill(-1);
  for (let k = last, j = route.jumps.length - 1, current = -1; k >= 0; k--) {
    while (j >= 0 && route.jumps[j].from >= k) current = j--;
    nextFlight[k] = current;
  }
  const gatePoints = route.gateIndex.map((g) => g ?? last);

  return {
    tracker,
    /** Start again at the start line (or at route point `fromIndex`). */
    reset(fromIndex = 0) { tracker.reset(fromIndex); },

    observe({ state, older, held = {}, contact = false, pedalOpen = true, at = tracker.update(state) }) {
      const q = state.quaternion;
      const obs = new Array(OBS_SIZE).fill(0);
      let o = 0;

      // ---- [0..16] the car itself: exactly as RacingEnv._observe -----------
      obs[o++] = state.speedKmh / SPEED_KMH_SCALE;
      const dTicks = state.frames - older.frames;
      const perSecond = dTicks > 0 ? 1000 / dTicks : 0;
      for (const v of toCarFrame(sub(state.position, older.position).map((x) => x * perSecond), q)) obs[o++] = clip(v / VELOCITY_SCALE);
      for (const v of toCarFrame([0, 1, 0], q)) obs[o++] = v;
      const oq = older.quaternion;
      const turn = quatMultiply([-oq[0], -oq[1], -oq[2], oq[3]], q);
      const sign = turn[3] < 0 ? -1 : 1;
      for (let k = 0; k < 3; k++) obs[o++] = clip((2 * sign * turn[k] * perSecond) / SPIN_SCALE);
      for (const touching of state.wheelContact) obs[o++] = touching ? 1 : 0;
      obs[o++] = clip(state.steering / STEER_SCALE);
      obs[o++] = (held.up ? 1 : 0) - (held.down ? 1 : 0);
      obs[o++] = held.left ? 1 : held.right ? -1 : 0;

      // ---- [17..20] where the route is, and how far round ------------------
      const index = at.index;
      for (const v of toCarFrame(sub(route.points[index], state.position), q)) obs[o++] = clip(v / NEAR_SCALE);
      obs[o++] = lapFraction ? at.fraction : 0;

      // ---- the route ahead ---------------------------------------------------
      const frame = (k, slot) => {
        const f = toCarFrame(route.forward[k], q), u = toCarFrame(route.up[k], q);
        obs[slot] = f[0]; obs[slot + 1] = f[1]; obs[slot + 2] = f[2];
        obs[slot + 3] = u[0]; obs[slot + 4] = u[1]; obs[slot + 5] = u[2];
      };
      frame(index, OBS_FRAME);
      const gap = Math.max(minGap, (state.speedKmh / 3.6) * gapSeconds);
      for (let k = 1; k <= LOOKAHEAD_POINTS; k++) {
        // Past the end of the route the last point is repeated, as now.
        const i = Math.min(last, index + Math.round((k * gap) / spacing));
        const local = toCarFrame(sub(route.points[i], state.position), q);
        for (let c = 0; c < 3; c++) obs[OBS_POINTS + 3 * (k - 1) + c] = clip(local[c] / (k * gap));
        obs[OBS_CURVATURE + k - 1] = clip(route.curvature[i] / CURVATURE_SCALE);
        obs[OBS_EDGE_AHEAD + 2 * (k - 1)] = route.edgeLeft[i] / EDGE_SCALE;
        obs[OBS_EDGE_AHEAD + 2 * (k - 1) + 1] = route.edgeRight[i] / EDGE_SCALE;
        frame(i, OBS_FRAME + 6 * k);
        obs[OBS_SLOPE + k - 1] = route.slope[i];
        obs[OBS_ON_ROAD + k - 1] = route.grounded[i] ? 1 : 0;
      }

      // ---- room beside the car, contact, held pedals -------------------------
      const room = (d) => Math.max(-CLIP, Math.min(MAX_CLEARANCE, d) / EDGE_SCALE);
      obs[OBS_EDGE_NOW] = room(at.edgeLeft);
      obs[OBS_EDGE_NOW + 1] = room(at.edgeRight);
      obs[OBS_CONTACT] = contact ? 1 : 0;
      obs[OBS_S_HELD] = held.down ? 1 : 0;
      obs[OBS_PEDAL_OPEN] = pedalOpen ? 1 : 0;

      // ---- the next flight and the next gate ---------------------------------
      const far = (d) => Math.sqrt(Math.max(0, Math.min(AHEAD_RANGE, d)) / AHEAD_RANGE);
      const flight = nextFlight[index] >= 0 ? route.jumps[nextFlight[index]] : null;
      const toFlight = flight ? (flight.from - index) * spacing : Infinity;
      obs[OBS_FLIGHT] = far(toFlight);
      if (flight && toFlight <= AHEAD_RANGE) {
        obs[OBS_FLIGHT + 1] = far((flight.to - flight.from + 1) * spacing);
        obs[OBS_FLIGHT + 2] = (flight.speed * 3.6) / SPEED_KMH_SCALE;
      }
      const gate = gatePoints[Math.min(state.nextCheckpointIndex, gatePoints.length - 1)];
      obs[OBS_GATE] = far((gate - index) * spacing);
      obs[OBS_HEIGHT] = clip(at.height / NEAR_SCALE);

      // ---- rays: exactly as RacingEnv._observe -------------------------------
      const carUp = rotate([0, 1, 0], q);
      const eye = [state.position[0] + carUp[0] * RAY_HEIGHT, state.position[1] + carUp[1] * RAY_HEIGHT, state.position[2] + carUp[2] * RAY_HEIGHT];
      const reading = (direction) => Math.sqrt(Math.min(RAY_RANGE, mesh.raycastFar(eye, direction, RAY_RANGE)) / RAY_RANGE);
      for (let k = 0; k < RAY_DIRECTIONS.length; k++) obs[OBS_RAYS + k] = reading(rotate(RAY_DIRECTIONS[k], q));
      obs[OBS_RAYS + RAY_DIRECTIONS.length] = reading([0, -1, 0]);
      return { obs, at };
    },
  };
}
