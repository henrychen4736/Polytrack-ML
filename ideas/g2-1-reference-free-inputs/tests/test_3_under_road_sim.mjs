// Is the progress measure fooled by a car on the ground underneath a raised
// road? One simulator, about 10 s.
//
// The world has drivable ground at y = 0 (found by ideas g1-7 and g2-2). The
// test track is one of g2-2's generated tracks: a kerbed road 10 units up, with
// the route known from how it was laid. Two cars are driven:
//   - one that stays on the road all the way (g2-2's follower): the baseline;
//   - one on the same track with a single piece taken out. It falls through the
//     hole and keeps following the road's line on the ground, 10 units under
//     the road, to the end.
// The second car's positions are then given to the tracker of the INTACT
// track (route and mesh). Beyond the hole those positions are exactly "a car
// on the ground underneath a raised road".
//
// What must hold: the tracker says there is no road under that car and that it
// is 10 units below the route; it never credits a gate the game did not; and
// it does not count progress for the stretch driven on the ground.
import { Env } from '../../../sim/env.mjs';
import { decodeState } from '../../../sim/state.mjs';
import { createController } from '../../../sim/controller.mjs';
import { loadTrackInfo } from '../../shared/track_info.mjs';
import { buildRoute } from '../route.mjs';
import { createTracker, locate } from '../progress.mjs';
import { createObserver } from '../observation.mjs';
import { generateTrack } from '../../g2-2-track-generator/generate.mjs';
import { encodeSaveString } from '../../g2-2-track-generator/codec.mjs';
import { routeToLine, driveTrack } from '../../g2-2-track-generator/drive.mjs';
import { check, known, near, fmt, median, section } from './_check.mjs';

// A flat track, 400 units: Start, a wide turn, a straight, an S-bend, a checkpoint, ...
const track = generateTrack({ seed: 11, length: 400, difficulty: 0.3, slopes: false });
const info = loadTrackInfo(track.createCar);
const route = buildRoute(info);                        // from the track string alone, about 0.5 s
const mesh = info.mesh;
// Take out the first piece after the start: the car is on the ground for the whole first leg.
const HOLE = 1;
const brokenParts = track.parts.filter((_, i) => i !== HOLE);
const broken = { trackData: encodeSaveString(brokenParts, track.environment), mountainVertices: new Float32Array(0), mountainOffset: { x: 0, y: 0, z: 0 } };

await section('route on a generated track', () => {
  check('g2-1 builds a route for the generated track from its track string alone: every gate, no flights', route.ok && route.jumps.length === 0 && route.reached === route.gates, `${route.points.length} points, gates at ${route.gateIndex.join(', ')}`);
  // Against g2-2's route, which is known from how the track was laid.
  let worst = 0, sum = 0;
  for (const p of route.points) { let best = Infinity; for (const q of track.route.points) best = Math.min(best, Math.hypot(p[0] - q[0], p[2] - q[2])); worst = Math.max(worst, best); sum += best; }
  check('the route lies on the generated road: on average under 1 unit, at worst under 3.5 units, from the road\'s measured centre line (the road is 5.6 either side)', sum / route.points.length < 1 && worst < 3.5, `mean ${fmt(sum / route.points.length, 2)}, worst ${fmt(worst, 2)} units; length ${route.length} against ${track.route.length}`);
  // The route's room numbers, against a road whose width is known: 11.3 kerb to kerb.
  const widths = [];
  for (let k = 0; k < route.points.length; k++) if (track.pieces[track.route.piece[Math.min(track.route.piece.length - 1, k)]] === 'Straight') widths.push(route.edgeLeft[k] + route.edgeRight[k]);
  check('route.edgeLeft + edgeRight on the straight pieces is the road\'s width (11.1 to 11.4 units kerb to kerb)', widths.length > 10 && near(median(widths), 11.25, 0.2), `median ${fmt(median(widths), 2)} over ${widths.length} points`);
});

const env = await Env.create();
try {
  /** Follow g2-2's route with the plain controller and no off-road rule; returns the decoded states, one per 5 ticks. */
  async function follow(createCar) {
    env.reset(createCar);
    const decide = createController(routeToLine(track.route), { crossTrackGain: 1 });
    let state = decodeState((await env.step({}, 1))[0]);
    const states = [state];
    let best = 0, bestTick = 0;
    while (state.frames < 60000) {
      const { controls, progress } = decide(state);
      state = decodeState((await env.step(controls, 5)).at(-1));
      states.push(state);
      if (progress > best) { best = progress; bestTick = state.frames; }
      if (state.finishFrames != null || state.frames - bestTick > 4000) break;
    }
    return states;
  }

  await section('a car that stays on the road', async () => {
    const drive = await driveTrack(env, track);
    const states = await follow(track.createCar);
    const tracker = createTracker(route, mesh);
    let drop = 0, best = 0, noRoad = 0, grounded = 0, worstHeight = 0;
    for (const s of states) {
      const at = tracker.update(s);
      drop = Math.max(drop, best - at.progress); best = Math.max(best, at.progress);
      if (s.wheelContact.every(Boolean)) { grounded++; if (!at.overRoad) noRoad++; worstHeight = Math.max(worstHeight, Math.abs(at.height)); }
    }
    check('on the road: the follower finishes, progress never drops and ends at the route\'s length', drive.finished && states.at(-1).finishFrames != null && drop < 1 && best === route.length, `drop ${fmt(drop, 2)}, final progress ${best} of ${route.length}`);
    check('on the road: "road under the car" is true on every four-wheels-down sample and the car is within 0.5 units of the route\'s height', noRoad === 0 && worstHeight < 0.5, `${noRoad} of ${grounded} without road, largest height difference ${fmt(worstHeight, 2)}`);
  });

  await section('a car on the ground under the road', async () => {
    const states = await follow(broken);
    const tracker = createTracker(route, mesh);
    // The stretch of interest: on the ground (y under 1) with the INTACT track's road above the car.
    const under = (s) => s.position[1] < 1 && mesh.raycast([s.position[0], s.position[1] + 2, s.position[2]], [0, 1, 0], 12) !== Infinity;
    let onGround = 0, saysNoRoad = 0, heights = [], gained = 0, previous = null, furthest = 0, offRoutes = [], statelessNoRoad = 0, finalAt = null, credited = 0;
    for (const s of states) {
      const at = tracker.update(s);
      credited = Math.max(credited, at.progress);
      if (under(s)) {
        onGround++;
        if (!at.overRoad) saysNoRoad++;
        if (!locate(route, mesh, s).overRoad) statelessNoRoad++;
        heights.push(at.height); offRoutes.push(at.offRoute);
        if (previous != null && at.progress > previous) gained += at.progress - previous;
        furthest = Math.max(furthest, at.progress);
      }
      previous = at.progress; finalAt = at;
    }
    const last = states.at(-1);
    check('under the road: the test really put a car on the ground beneath the intact road for a long stretch (over 300 samples, the game counting no checkpoint and no finish)', onGround > 300 && last.finishFrames == null && last.nextCheckpointIndex === 0, `${onGround} samples under the road, lowest y ${fmt(Math.min(...states.map((s) => s.position[1])), 2)}, checkpoint counter ${last.nextCheckpointIndex}`);
    check('under the road: the tracker says there is no road under the car on every one of those samples (at.overRoad false)', saysNoRoad === onGround && statelessNoRoad === onGround, `${saysNoRoad} of ${onGround} (stateless locate(): ${statelessNoRoad})`);
    check('under the road: it reports the car about 10 units below the route (at.height) and 10 or more from it (at.offRoute)', near(median(heights), -10.2, 0.5) && Math.min(...offRoutes) > 9.5, `median height ${fmt(median(heights), 2)}, nearest ${fmt(Math.min(...offRoutes), 2)} units from the route`);
    // Gates: the game counted none, so progress may not pass the first gate's point (plus the tracker's 6 points of slack).
    check('under the road: progress never passes the first gate, which the game did not count', credited <= route.gateIndex[0] + 6.5, `largest progress ${fmt(credited, 1)}; first gate at ${route.gateIndex[0]}; route length ${route.length}`);
    // The observation says so too: entry 316 (height / 10) and the room entries.
    const observer = createObserver(info, route);
    const sample = states.filter(under)[150], k = states.indexOf(sample);
    observer.reset();
    for (const s of states.slice(0, k)) observer.tracker.update(s);
    const { obs } = observer.observe({ state: sample, older: states[k - 1] });
    check('under the road: the observation shows it: entry 316 (height above the route / 10) is about -1', near(obs[316], -1.02, 0.06), `entry 316 = ${fmt(obs[316], 3)}`);
    // KNOWN FAILURE (TESTING.md, defect 1): progress itself keeps counting. The car drove from
    // the hole to the first gate on the grass and was credited with every unit of it.
    known('under the road: no progress is credited for distance driven on the ground beneath the road', gained < 5, `${fmt(gained, 0)} units of progress credited while under the road (progress reached ${fmt(furthest, 0)} of ${route.length}); only the gate the game did not count stopped it`);
    void finalAt;
  });
} finally { await env.close(); }
