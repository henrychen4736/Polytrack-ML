// Fine-grained progress with no human lap: distance along a route built from
// the track's own geometry. PROMOTED in phase 2 from
// ideas/g2-1-reference-free-inputs/, where the code still lives (route.mjs,
// route_store.mjs, progress.mjs); this file is the supported way in.
//
// It sits BESIDE track_info.mjs progress(state), not in place of it:
//
//   info.progress(state)     coarse (straight line to the next gate), but it
//                            cannot be wrong about the road: there is no road
//                            in it. Use for "furthest point reached", for
//                            ranking attempts a gate or seconds apart.
//   route tracker (here)     advances every unit of road; right for a per-step
//                            reward or for ranking states 50 ms apart, PROVIDED
//                            the route is the way the car should go. See the
//                            three warnings below.
//
//   const info = loadTrackInfo('desert4');
//   const route = routeFor(info);                    // 2 to 15 s the first time, then cached on disk
//   const tracker = createTracker(route, info.mesh);
//   tracker.reset();                                 // car on the start line
//   const at = tracker.update(state);                // once per decision, in order
//   at.progress, at.fraction, at.offRoute, at.lateral, at.edgeLeft, at.edgeRight, at.overRoad
//
//   locate(route, info.mesh, state)                  // the same with no memory
//
// Units: progress and offRoute in world units along / from the 1-unit-spaced
// route; fraction 0..1; lateral positive = left of the route; edgeLeft /
// edgeRight 0..20 units of road beside the CAR; overRoad = some track surface
// within 2 units under the car. Order is fenced by the game's checkpoint
// counter, as in track_info.mjs, so a finished lap always ends at route.length.
//
// Checked by g2-1 and its tester against the fastest human lap of all 17
// tracks: progress never drops by more than 1 unit, and on 15 tracks the
// longest stall is 0.4 s.
//
// THREE WARNINGS
//
// 1. summer4 and desert5: the route goes a way the human does not. Progress
//    stalls for 11.5 s (summer4) and 2.5 s (desert5) of the human's lap there.
//    On those two tracks use info.progress(state), or a human-line measure.
//
// 2. OPEN DEFECT, left in place by the tester
//    (ideas/g2-1-reference-free-inputs/tests/TESTING.md): a car on the GROUND
//    underneath a raised road is credited progress between gates. The world
//    has a drivable ground plane at y = 0 (CONTRACT.md), the tracker matches
//    by nearest route point in 3D, and the checkpoint fence only bites at the
//    gates. A learner rewarded on at.progress alone can therefore earn reward
//    by driving along under the road (measured: 218 units credited, to 250
//    of 457, to a car 10 units below a generated road it was never on). The
//    guard is at.overRoad: treat `at.grounded && !at.overRoad` as "off the
//    track" and end the attempt or stop paying, as RacingEnv ends one on
//    'off track'. On all 2575 samples of that drive at.overRoad was false.
//
// 3. Where the route flies (jumps), its arc is a rough parabola, not the
//    car's real flight; offRoute and height are loose there.
//
// The route cache (ideas/g2-1-reference-free-inputs/cache/) is derived from
// Kodub's part geometry and stays on this machine.
export { routeFor, ROUTE_VERSION } from '../g2-1-reference-free-inputs/route_store.mjs';
export { createTracker, locate } from '../g2-1-reference-free-inputs/progress.mjs';
