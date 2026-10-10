// recordPath (paths.mjs) and follow / compare / carState (follow.mjs) on
// desert4 with ONE simulator. The questions: is a recorded path really what
// the car does tick for tick; does following a lap from exactly on it
// reproduce it; does the repair bring a car that is off the path back; and,
// after all the save / load of a repair, is sim.keys the lap that was driven.
import { loadTrack } from '../../../sim/env.mjs';
import { humanLaps, sameKeys } from '../../shared/laps.mjs';
import { SimSession } from '../../shared/sim_session.mjs';
import { recordPath, MOTION_GAP } from '../paths.mjs';
import { follow, compare, carState, FOLLOW_DEFAULTS } from '../follow.mjs';
import { checker } from '../../shared/tests/harness.mjs';

const { check, eq, throws, note } = checker();
const human = humanLaps('desert4')[0];
const F = human.frames;
const car = (s) => JSON.stringify([s.position, s.quaternion, s.speedKmh, s.steering, s.nextCheckpointIndex]);
const maxDiff = (a, b) => Math.max(...a.map((x, k) => Math.abs(x - b[k])));

const sim = await SimSession.create('desert4');
const track = loadTrack('desert4');

// ---- recordPath ---------------------------------------------------------------------
const path = await recordPath(sim.env, track, human);
eq([path.frames, path.source, path.keys === human.keys], [F, 'human:0', true], `recordPath: ${F} ticks, the lap's source and keys`);
{
  let holes = 0;
  for (const list of [path.position, path.quaternion, path.velocity, path.spin, path.steering, path.wheels]) {
    if (list.length !== F + 1) holes++;
    for (let t = 0; t <= F; t++) if (list[t] == null || (Array.isArray(list[t]) && list[t].some((x) => !Number.isFinite(x)))) holes++;
  }
  check(holes === 0, 'recordPath: position, quaternion, velocity, spin, steering and wheels are filled for every tick 0..frames, all finite');
}
eq([path.position[0], path.velocity[0], path.steering[0]], [path.position[1], [0, 0, 0], 0], 'recordPath: tick 0 (no state exists yet) is filled with the first state, velocity 0');
await throws(() => recordPath(sim.env, track, { ...human, frames: F - 5 }), 'recordPath throws when the lap does not finish on the tick its file states');

// The recorded path against the car driven tick by tick.
await sim.restart();
await sim.drive(human.keys.slice(0, 2));
eq(sim.state.position, path.position[2], 'path.position[2] is the car after 2 ticks');
await sim.drive(human.keys.slice(2, 5000));
eq([sim.state.position, sim.state.quaternion, sim.state.steering, sim.state.wheelContact.filter(Boolean).length], [path.position[5000], path.quaternion[5000], path.steering[5000], path.wheels[5000]],
  'path.position / quaternion / steering / wheels [5000] are exactly the car after 5000 ticks');
{
  const m = sim.motion();
  check(maxDiff(m.velocity, path.velocity[5000]) < 1e-9 && maxDiff(m.spin, path.spin[5000]) < 1e-9, `path.velocity and path.spin are the same quantities as SimSession.motion() (both across ${MOTION_GAP} ticks)`);
  const cs = carState(sim);
  eq([cs.position, cs.quaternion, cs.steering, cs.wheels, cs.velocity, cs.spin], [sim.state.position, sim.state.quaternion, sim.state.steering, path.wheels[5000], m.velocity, m.spin], 'carState(sim): the car now, in the form mismatch() takes');
  const c = compare(sim, path, 5000, FOLLOW_DEFAULTS.slack);
  // Not exactly 0: the game's quaternions are float32 and not exactly unit
  // length, so angleBetween(q, q) comes out as up to about 0.0007 rad
  // (0.1 ms of "mismatch"). Far below anything the costs are compared with.
  check(c.tick === 5000 && c.cost < 0.2 && c.distance === 0, `compare() of the lap with itself: donor tick 5000, distance 0, mismatch ${c.cost.toFixed(3)} ms (rounding only)`);
  eq(compare(sim, path, 5300, 80).tick, 5220, 'compare() only looks within `slack` of the expected tick (expected 5300, slack 80: nearest is 5220)');
}
const at5000 = await sim.save();

// ---- follow: from exactly on the donor lap ----------------------------------------------
let r = await follow(sim, path, 5000, 7000, 'raw');
eq([r.donorTick, r.finished, r.lost, sim.tick, r.tried, r.contactTicks], [7000, false, false, 7000, 0, 0], 'follow raw, from on the lap, until donor tick 7000: stops exactly there, not lost, nothing tried');
check(r.cost < 0.2 && r.distance === 0 && sameKeys(sim.keys, human.keys.slice(0, 7000)), 'and the car is still exactly on the lap, with the lap\'s keys in sim.keys');
r = await follow(sim, path, 7000, 7050, 'raw');
eq([r.donorTick, sim.tick], [7050, 7050], 'follow does not overshoot `until` when it is less than one window away (50 ticks)');
r = await follow(sim, path, 7050, 7050, 'raw');
eq([r.donorTick, sim.tick, r.lost], [7050, 7050, false], 'follow with `until` already reached drives nothing');
r = await follow(sim, path, 7050, Infinity, 'raw');
eq([r.finished, sim.state.finishFrames, r.lost], [true, F, false], `follow raw to the finish (until = Infinity): finishes on the lap's tick ${F}`);
check(sameKeys(sim.keys, human.keys), 'and sim.keys is the whole lap');

await sim.load(at5000);
r = await follow(sim, path, 5000, 6000, 'resync');
eq([r.donorTick, sim.tick, r.lost, r.tried], [6000, 6000, false, 0], 'follow resync from on the lap: same as raw');
await sim.load(at5000);
r = await follow(sim, path, 5000, 6000, 'repair');
eq([r.donorTick, sim.tick, r.lost], [6000, 6000, false], 'follow repair from on the lap: stays on the lap');
eq(r.tried, 5, 'repair with the car already on the path scores only the uncorrected keys: 5 windows, 5 drives');
check(sameKeys(sim.keys, human.keys.slice(0, 6000)) && car(sim.state) === JSON.stringify([path.position[6000], path.quaternion[6000], sim.state.speedKmh, path.steering[6000], sim.state.nextCheckpointIndex]),
  'and after its save / load cycles sim.keys and the car are exactly the lap at tick 6000');

// ---- follow: from OFF the donor lap -------------------------------------------------------
// The human's car at 5000, then 60 ms with the throttle lifted and a steering
// tap. That is only about 2 cm and 18 ms of mismatch off the lap, and it is
// already enough for the donor's keys played blind to lose the path.
const OFF = { up: false, right: false, down: false, left: true, reset: false };
async function knockedOff() { await sim.load(at5000); await sim.hold(OFF, 60); return compare(sim, path, 5060, FOLLOW_DEFAULTS.slack); }
const start = await knockedOff();
note(`knocked off the lap: ${start.distance.toFixed(2)} units and ${start.cost.toFixed(0)} ms of mismatch from the donor at its tick ${start.tick}`);
check(start.cost > FOLLOW_DEFAULTS.good, 'the knocked-off car is far enough off that repair has to search (mismatch above `good`)');
const rawRun = await follow(sim, path, start.tick, start.tick + 3000, 'raw');
await knockedOff();
const resyncRun = await follow(sim, path, start.tick, start.tick + 3000, 'resync');
await knockedOff();
const tickBefore = sim.tick;
const repairRun = await follow(sim, path, start.tick, start.tick + 3000, 'repair');
note(`3 s later: raw ${rawRun.lost ? 'LOST' : `${rawRun.distance.toFixed(2)} units off`}, resync ${resyncRun.lost ? 'LOST' : `${resyncRun.distance.toFixed(2)} units off`}, repair ${repairRun.lost ? 'LOST' : `${repairRun.distance.toFixed(2)} units off`} (${repairRun.tried} candidates driven)`);
check(!repairRun.lost && repairRun.distance < 1.5 && repairRun.donorTick >= start.tick + 3000, 'follow repair brings the knocked-off car along the donor lap for 3 s: not lost, within 1.5 units ("on path" in the README)');
check(repairRun.tried > 15, `the repair really searched (${repairRun.tried} candidate drives, against 15 windows)`);
check(repairRun.cost <= start.cost, `and the mismatch at the end (${repairRun.cost.toFixed(0)} ms) is no worse than at the start (${start.cost.toFixed(0)} ms)`);
check(sim.tick - tickBefore <= 3000 + 2 * FOLLOW_DEFAULTS.slack + FOLLOW_DEFAULTS.window, `the car's clock moved ${sim.tick - tickBefore} ticks for 3000 donor ticks (bounded by slack and one window)`);
// The bookkeeping after about 100 save / load cycles: sim.keys, replayed from
// the start line on a new car, must put the car in the same state.
{
  const keys = sim.keys.slice(), end = car(sim.state), tick = sim.tick;
  check(keys.length === tick && Array.from(keys).every((c) => c != null) && sameKeys(keys.slice(0, 5000), human.keys.slice(0, 5000)), 'after the repair sim.keys has one key per tick, no holes, and starts with the 5000 human keys');
  await sim.restart();
  const replayed = await sim.drive(keys);
  check(car(replayed.state) === end && replayed.tick === tick, 'sim.keys after a repaired follow, replayed from the start line on a new car, ends in the identical car state');
}

// ---- follow: lost ---------------------------------------------------------------------------
await sim.restart();
await sim.drive(human.keys.slice(0, 5000));
r = await follow(sim, path, 9000, 12000, 'repair');
check(r.lost === true && r.finished === false && r.distance > FOLLOW_DEFAULTS.lostDistance, `a car told to follow the lap from a donor tick 4 s away from where it is: lost (${r.distance.toFixed(0)} units off)`);
check(sim.tick <= 5000 + FOLLOW_DEFAULTS.window, 'and the follow gives up after one window, not at the end of the lap');
await sim.close();
