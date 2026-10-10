// paths.mjs without a simulator: every function on small hand-made inputs
// with the expected numbers worked out by hand. (recordPath, which needs the
// simulator, is in test_follow.mjs.)
import { MOTION_GAP, angleBetween, crossings, MISMATCH_WEIGHTS, mismatch, stateAt, locate, sectionTimes, planRoute } from '../paths.mjs';
import { checker } from '../../shared/tests/harness.mjs';

const { check, eq } = checker();
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// ---- angleBetween ------------------------------------------------------------------
const ID = [0, 0, 0, 1], S = Math.SQRT1_2;
check(angleBetween(ID, ID) === 0, 'angleBetween: the same orientation is 0');
check(near(angleBetween(ID, [0, S, 0, S]), Math.PI / 2), 'angleBetween: a quarter turn about y is pi/2');
check(near(angleBetween(ID, [0, 1, 0, 0]), Math.PI), 'angleBetween: a half turn is pi');
check(near(angleBetween([0, S, 0, S], [0, -S, 0, -S]), 0, 1e-7), 'angleBetween: q and -q are the same orientation (0)');
check(MOTION_GAP === 4, 'MOTION_GAP is 4, the same as SimSession measures velocity across');

// ---- mismatch ----------------------------------------------------------------------
{
  const a = { position: [0, 0, 0], quaternion: ID, velocity: [10, 0, 0], spin: [0, 0, 0], steering: 0, wheels: 4 };
  const b = { position: [3, 4, 0], quaternion: [0, S, 0, S], velocity: [10, 0, 2], spin: [1, 0, 0], steering: -0.5, wheels: 2 };
  const m = mismatch(a, b);
  eq([m.distance, m.speedDiff, m.spinDiff, m.steerDiff, m.wheelDiff], [5, 2, 1, 0.5, 2], 'mismatch: distance 5 (3-4-5), velocity 2, spin 1, steering 0.5, wheels 2');
  // 20*5 + 4*2 + 150*(pi/2) + 20*1 + 10*0.5 + 15*2
  check(near(m.angle, Math.PI / 2) && near(m.cost, 100 + 8 + 75 * Math.PI + 20 + 5 + 30, 1e-6), `mismatch cost with the default weights: 163 + 75 pi = ${(163 + 75 * Math.PI).toFixed(3)} (got ${m.cost.toFixed(3)})`);
  eq(mismatch(a, a).cost, 0, 'mismatch of a state with itself costs 0');
  check(near(mismatch(a, b).cost, mismatch(b, a).cost), 'mismatch is symmetric');
  eq(mismatch(a, b, { ...MISMATCH_WEIGHTS, perUnit: 0, perRadian: 0 }).cost, 8 + 20 + 5 + 30, 'mismatch with weights of its own: position and orientation set to 0 leave 63');
}

// ---- a straight synthetic path: 1/16 unit per tick along x ----------------------------
// (1/16 so that every position is exact in floating point.)
function straight({ frames, perTick, z = 0, heading = [1, 0, 0], through = null }) {
  const path = { frames, position: [], velocity: [], quaternion: [], spin: [], steering: [], wheels: [] };
  for (let t = 0; t <= frames; t++) {
    const along = through ? (t - through.tick) * perTick : t * perTick;
    const origin = through ? through.point : [0, 0, z];
    path.position[t] = [origin[0] + along * heading[0], origin[1] + along * heading[1], origin[2] + along * heading[2]];
    path.velocity[t] = heading.map((h) => h * perTick * 1000);
    path.quaternion[t] = ID; path.spin[t] = [0, 0, 0]; path.steering[t] = t / 1000; path.wheels[t] = 4;
  }
  return path;
}
const lead = straight({ frames: 1000, perTick: 1 / 16 });

eq(stateAt(lead, 16), { position: [1, 0, 0], quaternion: ID, velocity: [62.5, 0, 0], spin: [0, 0, 0], steering: 0.016, wheels: 4 }, 'stateAt(path, 16): that tick of every list');

// ---- locate ---------------------------------------------------------------------------
eq(locate(lead, [40.4 / 16, 0, 0], 0, 1000).tick, 40, 'locate: the nearest tick to a point 0.4 ticks past tick 40 is 40');
check(near(locate(lead, [2.5, 0.3, 0.4], 0, 1000).distance, 0.5), 'locate: distance to the nearest tick (0.3, 0.4 off the line -> 0.5)');
eq(locate(lead, [2.5, 0, 0], 50, 60).tick, 50, 'locate only looks from `from` to `to`: a point at tick 40 searched in 50..60 gives 50');
eq([locate(lead, [-5, 0, 0], -100, 1000).tick, locate(lead, [1e6, 0, 0], 0, 1e9).tick], [1, 1000], 'locate clamps the range to ticks 1..frames');

// ---- crossings --------------------------------------------------------------------------
{
  // Second lap: half the speed, 1 unit to the side. Third: 9 units to the side
  // (beyond the 8-unit reach). Fourth: passes exactly through boundary 1's
  // point but heading 60 degrees off (cos 60 = 0.5 < 0.7).
  const slow = straight({ frames: 2000, perTick: 1 / 32, z: 1 });
  const wide = straight({ frames: 1000, perTick: 1 / 16, z: 9 });
  const across = straight({ frames: 1000, perTick: 1 / 16, heading: [0.5, 0, Math.sqrt(0.75)], through: { tick: 400, point: [31.25, 0, 0] } });
  const { boundaries, ticks } = crossings([lead, slow, wide, across], 250);
  eq(boundaries.map((b) => b.point[0]), [15.625, 31.25, 46.875], 'crossings: boundaries every 250 ticks of the first lap, none in its last 125 ticks (3 for a 1000-tick lap)');
  eq(boundaries[0].normal, [1, 0, 0], 'crossings: a boundary faces the way the first lap was moving');
  eq(ticks[0], [0, 250, 500, 750, 1000], 'crossings: the first lap crosses its own boundaries on ticks 250, 500, 750; first entry 0, last its finish');
  eq(ticks[1], [0, 500, 1000, 1500, 2000], 'crossings: a lap at half the speed, 1 unit to the side, crosses on ticks 500, 1000, 1500');
  eq(ticks[2], [0, null, null, null, 1000], 'crossings: a lap 9 units to the side (reach is 8) has no crossing anywhere');
  eq(ticks[3], [0, null, null, null, 1000], 'crossings: a lap through a boundary point but heading 60 degrees off does not count as crossing it');
  eq(crossings([lead, wide], 250, 10).ticks[1], [0, 250, 500, 750, 1000], 'crossings with reach 10: the lap 9 units to the side now crosses');
  // sectionTimes of these.
  const times = sectionTimes(ticks);
  eq(times, [[250, 250, 250, 250], [500, 500, 500, 500], [1000, 0, 0, 0], [1000, 0, 0, 0]], 'sectionTimes: differences of crossing ticks; a lap with no crossings has its whole time on the first section');
}

// ---- sectionTimes ------------------------------------------------------------------------
eq(sectionTimes([[0, 100, 200, 300]]), [[100, 100, 100]], 'sectionTimes: plain differences');
eq(sectionTimes([[0, null, 210, 320]]), [[210, 0, 110]], 'sectionTimes: a missed boundary books the whole stretch on the section before it');
eq(sectionTimes([[0, 100, null, null, 450]]), [[100, 350, 0, 0]], 'sectionTimes: two missed boundaries in a row');
{
  const rows = [[0, 90, null, 300, null, null, 700, 815], [0, null, null, null, null, null, null, 900]];
  check(sectionTimes(rows).every((row, i) => row.reduce((a, b) => a + b, 0) === rows[i].at(-1)), 'sectionTimes: every row adds up to the lap time, whatever was missed');
}

// ---- planRoute ---------------------------------------------------------------------------
{
  //            section 0  1    2
  const times = [[100, 100, 100],   // lap 0
                 [110, 80, 110]];   // lap 1
  // Every switch costs 5: best from lap 0 is 0 -> 1 -> 0 = 100 + (5 + 80) + (5 + 100) = 290.
  const plan = planRoute(times, () => 5);
  eq([plan.toGo[0][0], plan.choice[0][0], plan.choice[1][0], plan.choice[2][1]], [290, 0, 1, 0], 'planRoute: from lap 0 the cheapest is 0 -> 1 -> 0 at 290 (two switches at 5 each)');
  eq(plan.route(0, 0), { laps: [0, 1, 0], time: 280 }, 'planRoute.route: the laps per section, and the time WITHOUT the switch costs (280)');
  // No switch on the start line: starting on lap 1 costs 110 + 80 + 5 + 100 = 295, not 100 + ...
  eq([plan.toGo[0][1], plan.choice[0][1]], [295, 1], 'planRoute: no switch is possible at boundary 0 (a car "arriving" on lap 1 drives section 0 on lap 1)');
  eq(plan.toGo[3], [0, 0], 'planRoute: nothing to go at the finish');
  eq(plan.route(2, 1), { laps: [0], time: 100 }, 'planRoute.route from the middle: from boundary 2 on lap 1, switch to lap 0 for the last section');
  // Expensive switches: stay.
  eq(planRoute(times, () => 1000).route(0, 0), { laps: [0, 0, 0], time: 300 }, 'planRoute: switches that cost more than they gain are not planned');
  eq(planRoute(times, () => Infinity).toGo[0], [300, 300], 'planRoute: with switches forbidden each lap costs its own time');
  // The arguments of switchCost are (from, to, boundary): allow only 0 -> 1 at boundary 1.
  const calls = [];
  const only = planRoute(times, (i, j, k) => { calls.push([i, j, k]); return i === 0 && j === 1 && k === 1 ? 0 : Infinity; });
  eq([only.route(0, 0), only.toGo[0][1]], [{ laps: [0, 1, 1], time: 290 }, 300], 'planRoute calls switchCost(from, to, boundary): allowing only 0 -> 1 at boundary 1 gives 0, 1, 1');
  check(calls.every(([i, j, k]) => i !== j && k >= 1 && k <= 2), 'planRoute never asks for the cost of a switch on the start line or to the same lap');
  // One lap, one section.
  eq(planRoute([[42]], () => 0).route(0, 0), { laps: [0], time: 42 }, 'planRoute with a single lap and a single section');
}
