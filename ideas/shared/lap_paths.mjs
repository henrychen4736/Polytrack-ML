// A lap as a path (what the car did on every tick), comparing car states, and
// keeping a car on a recorded lap's path from a state that is not on it.
// PROMOTED in phase 2 from ideas/g1-2-stitch-human-laps/ (paths.mjs,
// follow.mjs), where the code still lives; this file is the supported way in.
//
//   const env = await Env.create();
//   const path = await recordPath(env, loadTrack('desert4'), humanLaps('desert4')[0]);
//   path.position[t], path.quaternion[t], path.velocity[t], path.spin[t],
//   path.steering[t], path.wheels[t], path.keys[t]        // all indexed by tick
//
//   mismatch(a, b)        how far apart two car states are, in ms-equivalent
//                         (position, velocity, orientation, spin, steering;
//                         weights in MISMATCH_WEIGHTS); stateAt(path, t) gives
//                         a path's state in the form it takes
//   locate(path, position, from, to)    the tick of the path nearest a position
//   crossings(paths, sectionMs) + sectionTimes(ticks)
//                         comparable section times for several laps of one
//                         track (boundaries laid along the fastest lap)
//
//   // sim: a SimSession whose car is near the donor's path at donorTick
//   const r = await follow(sim, path, donorTick, Infinity, 'repair');
//   r.finished, r.lost, r.cost, r.donorTick; the keys driven are in sim.keys
//
// follow modes: 'raw' (the donor's keys from the matched tick), 'resync'
// (re-match the tick every 200 ticks; free), 'repair' (every 200 ticks, try
// small corrections to the next keys from a save state and keep the one that
// ends closest to the donor's state). Velocity and spin use the same 4-tick
// gap as SimSession.motion(), so the two can be subtracted.
//
// What it is for outside stitching: any search that plays a recorded lap's
// keys from a state that is not exactly that lap's (a human lap after an
// altered section in g1-1 or g1-5; the rest of a lap after a branch). Blind
// replay drifts and usually crashes; g1-2's README has the measured numbers.
// recordPath replaces the Env's car, so save states on that Env die.
export {
  recordPath, crossings, sectionTimes, mismatch, stateAt, locate, angleBetween, planRoute,
  MISMATCH_WEIGHTS, MOTION_GAP,
} from '../g1-2-stitch-human-laps/paths.mjs';
export { follow, carState, compare, FOLLOW_DEFAULTS } from '../g1-2-stitch-human-laps/follow.mjs';
