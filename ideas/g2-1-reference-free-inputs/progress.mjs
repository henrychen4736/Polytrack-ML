// "How far round is the car?" measured along the route of route.mjs: a
// fine-grained progress measure that needs no human lap. It is the route-based
// twin of RacingEnv._locate() in rl/racing_env.mjs and returns the same
// quantities (nearest point, distance from the line, progress with a
// fractional part, room to each road edge from the car).
//
//   const tracker = createTracker(route, info.mesh);     // info = loadTrackInfo(track)
//   tracker.reset();                      // car on the start line
//   const at = tracker.update(state);     // state: sim/state.mjs decodeState
//   at.progress    units along the route (0 .. route.length), fractional
//   at.fraction    progress / route.length
//   at.index       nearest route point
//   at.offRoute    distance from that point, units
//   at.lateral     how far LEFT of the route the car is (negative = right)
//   at.height      how far above the route's surface the car is
//   at.edgeLeft, at.edgeRight   room from the CAR to the road's edge on each side, 0..20 units
//   at.overRoad    whether there is any surface within 2 units under the car
//   at.grounded    whether the route itself is on the road at that point
//
// The room numbers are measured at the car, with ray casts, every time
// (about 0.1 ms). RacingEnv instead looks them up in a table made along the
// human's line and shifts them by how far the car is to the side of the
// line; that works while the car is within a few units of the line it was
// made for. A car is often 15 to 35 units from the route on an open floor
// (the route cuts a corner tight, a fast car takes it wide), and the shifted
// table then said "15 units beyond the edge" for a human car in the middle of
// the floor. So where RacingEnv ends an episode on "beyond the edge by 2
// units", the reference-free test is `!at.overRoad` while the car's wheels
// are down and the route is on the road: the car has run off the surface.
//
// Two things keep it honest about ORDER where the road runs back beside or
// over itself:
//   1. like sim/line.mjs nearestIndex, the tracker only searches FORWARD from
//      where it last was, over a limited window;
//   2. the game's own checkpoint counter (state.nextCheckpointIndex) fences
//      the search: the index may not run past the next gate's point until the
//      game says that gate is taken, and jumps up to a gate's point the moment
//      it is. So a car cannot score by cutting to a later stretch of road
//      without taking the gates in between, and a finished lap always ends at
//      route.length.
//
// locate(route, mesh, state) answers the same question with no memory (for a car
// placed part-way round, or as a check on the tracker): the nearest point of
// the stretch between the last gate taken and the next one.
import { rotate } from '../../sim/track.mjs';
import { SPACING, roomBeside } from './route.mjs';

/** How many points ahead of the last index the tracker searches. 60 is what
 *  rl/racing_env.mjs uses; at 400 km/h and one update per 50 ms block the
 *  car moves under 6 points per update. */
export const WINDOW = 60;
/** The index may be this many points past the next gate's point before the
 *  game has counted the gate (the gate's box is 1 to 2 units thick and the
 *  route's gate point is only accurate to a node, 2 units). */
const GATE_SLACK = 6;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The stretch of route points a car with `checkpoint` gates taken can be on. */
function fence(route, checkpoint) {
  const last = route.points.length - 1;
  const g = route.gateIndex;
  const lo = checkpoint > 0 ? (g[checkpoint - 1] ?? 0) : 0;
  const hi = checkpoint < g.length ? (g[checkpoint] ?? last) + GATE_SLACK : last;
  return [Math.min(lo, last), Math.min(hi, last)];
}

/** Nearest route point to `position` among points lo..hi. */
function nearest(route, position, lo, hi) {
  let index = lo, best = Infinity;
  for (let k = lo; k <= hi; k++) {
    const p = route.points[k];
    const d = (p[0] - position[0]) ** 2 + (p[1] - position[1]) ** 2 + (p[2] - position[2]) ** 2;
    if (d < best) { best = d; index = k; }
  }
  return { index, distance: Math.sqrt(best) };
}

/** Everything that follows from "the car is nearest to route point `index`". */
function describe(route, mesh, state, index, distance) {
  const offset = sub(state.position, route.points[index]);
  // Fractional part, as in RacingEnv._locate: how far past (or short of) the
  // nearest point the car is, along the route's direction there.
  const along = Math.max(-0.5 * SPACING, Math.min(0.5 * SPACING, dot(offset, route.forward[index])));
  const finished = state.finishFrames != null;
  const progress = finished ? route.length : Math.max(0, Math.min(route.length, index * SPACING + along));
  const lateral = dot(offset, route.left[index]);
  // Sideways for the room measurement: square to the route's direction, in
  // the plane the car is standing on (its own "up"; the route's if the car
  // is flying or tumbling, when its own says nothing about the road).
  const carUp = state.quaternion && state.wheelContact?.some(Boolean) ? rotate([0, 1, 0], state.quaternion) : route.up[index];
  const f = route.forward[index];
  let side = [carUp[1] * f[2] - carUp[2] * f[1], carUp[2] * f[0] - carUp[0] * f[2], carUp[0] * f[1] - carUp[1] * f[0]];
  const l = Math.hypot(side[0], side[1], side[2]);
  side = l > 0.2 ? [side[0] / l, side[1] / l, side[2] / l] : route.left[index];
  const room = roomBeside(mesh, state.position, side, carUp);
  return {
    index, progress, fraction: progress / route.length, offRoute: distance, lateral,
    height: dot(offset, route.up[index]),
    edgeLeft: room.left, edgeRight: room.right, overRoad: room.overRoad,
    grounded: route.grounded[index],
  };
}

/** Stateless: where is this car on the route? (mesh: loadTrackInfo(track).mesh) */
export function locate(route, mesh, state) {
  const [lo, hi] = fence(route, state.nextCheckpointIndex);
  const near = nearest(route, state.position, lo, hi);
  return describe(route, mesh, state, near.index, near.distance);
}

/** A tracker that follows one car round the route. */
export function createTracker(route, mesh) {
  let index = 0;
  return {
    /** Start again: at the start line, or at `fromIndex` for a car placed there. */
    reset(fromIndex = 0) { index = fromIndex; },
    get index() { return index; },
    update(state) {
      const [lo, hi] = fence(route, state.nextCheckpointIndex);
      // A gate just taken pulls the index up to it; an untaken one holds it back.
      const from = Math.min(hi, Math.max(lo, index));
      const near = nearest(route, state.position, from, Math.min(hi, from + WINDOW));
      index = near.index;
      return describe(route, mesh, state, near.index, near.distance);
    },
  };
}
