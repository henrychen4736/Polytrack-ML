// sim_session.mjs on desert4: one simulator, short deterministic runs.
// The questions: does load() really put back the car AND the bookkeeping
// (tick, keys, state, motion), is driving deterministic however the keys are
// cut into calls, and does the finish come out on the game's tick.
import { SimSession, CAR_TICK_BUDGET } from '../sim_session.mjs';
import { humanLaps, sameKeys } from '../laps.mjs';
import { loadTrack } from '../../../sim/env.mjs';
import { checker } from './harness.mjs';

const { check, eq, throws, note } = checker();
const human = humanLaps('desert4')[0];
const LEFT = { up: true, right: false, down: false, left: true, reset: false };
/** Everything about the car that must match for two states to be "the same". */
const car = (s) => JSON.stringify([s.position, s.quaternion, s.speedKmh, s.steering, s.nextCheckpointIndex, s.wheelContact]);

const sim = await SimSession.create('desert4');
check(sim.trackName === 'desert4', 'create(name): trackName is the name');

// ---- a new car ---------------------------------------------------------------
await sim.restart();
eq([sim.tick, sim.keys, sim.state, sim.finished, sim.motion(), sim.budgetLeft], [0, [], null, false, null, true], 'restart(): tick 0, no keys, no state, not finished, motion() null, budget left');
let r = await sim.drive([]);
eq([r.tick, r.finished, r.finishFrames, r.contactTicks], [0, false, null, 0], 'drive([]) does nothing');
r = await sim.hold(LEFT, 0);
eq(r.tick, 0, 'hold(keys, 0) does nothing');
r = await sim.drive(human.keys.slice(0, 1));
eq([r.tick, sim.keys.length, r.state.frames], [1, 1, 1], 'the first tick: tick 1, one key kept, the state\'s own frame counter says 1');
check(sim.motion() === null, 'motion() is still null with one state known');

// ---- determinism, however the keys are cut up ------------------------------------
await sim.restart();
r = await sim.drive(human.keys.slice(0, 3000));
const at3000 = car(r.state);
await sim.restart();
for (let t = 0; t < 3000;) { const n = 1 + ((t * 7) % 23); await sim.drive(human.keys.slice(t, Math.min(3000, t + n))); t += n; }
check(car(sim.state) === at3000 && sim.tick === 3000, 'the same 3000 keys in one drive() and in 261 uneven pieces leave the car in the identical state');
check(sameKeys(sim.keys, human.keys.slice(0, 3000)), 'sim.keys holds exactly the 3000 keys driven');
check(sim.state.frames === 3000, 'state.frames equals the lap clock');

// ---- save / load: the car ----------------------------------------------------------
const A = await sim.save();
const motionA = JSON.stringify(sim.motion());
eq([A.tick, A.bytes > 0 && A.bytes < 2e6], [3000, true], `save(): the point knows its tick and stores ${(A.bytes / 1e6).toFixed(2)} MB`);
r = await sim.drive(human.keys.slice(3000, 4000));
const at4000 = car(r.state);
const B = await sim.save();
await sim.load(A);
check(sim.tick === 3000 && car(sim.state) === at3000, 'load(A): clock back to 3000 and sim.state is the state saved');
check(JSON.stringify(sim.motion()) === motionA, 'load(A): motion() is what it was at the save');
r = await sim.drive(human.keys.slice(3000, 4000));
check(car(r.state) === at4000 && r.tick === 4000, 'the same 1000 keys from the loaded point end in the identical car state');
check(r.state.frames === 4000, 'after a load the state\'s own frame counter follows the lap clock again');
// motion() just after a load mixes states from before and after it: the velocity must still be right.
await sim.load(A);
await sim.hold(human.keys[3000], 1);
{
  const v = Math.hypot(...sim.motion().velocity) * 3.6;
  check(Math.abs(v - sim.state.speedKmh) < 0.02 * sim.state.speedKmh + 1, `motion() one tick after a load: ${v.toFixed(1)} km/h against the speedometer's ${sim.state.speedKmh.toFixed(1)}`);
}

// ---- save / load: the record of keys (the defect g1-2 reported) -------------------------
// A at 3000 and B at 4000 are on the human lap. Drive ANOTHER branch from A,
// then go to B: sim.keys must be the human's first 4000 keys again.
await sim.load(A);
await sim.hold(LEFT, 1000);
check(car(sim.state) !== at4000, 'another branch from A (W + left for 1 s) ends somewhere else');
await sim.load(B);
check(sim.tick === 4000 && car(sim.state) === at4000, 'load(B) after the other branch: the car is B\'s');
check(sameKeys(sim.keys, human.keys.slice(0, 4000)), 'load(B) after a different branch of the same length was driven from A: sim.keys is B\'s keys, not the other branch\'s');
// The other branch shorter than B: the cut-back array must not have holes.
await sim.load(A);
await sim.hold(LEFT, 200);
await sim.load(B);
// (Array.from, because every() skips the holes of a sparse array.)
check(sim.keys.length === 4000 && Array.from(sim.keys).every((c) => c != null), 'load(B) after a SHORTER branch from A: no missing entries in sim.keys');
check(sameKeys(Array.from(sim.keys, (c) => c ?? {}), human.keys.slice(0, 4000)), 'load(B) after a shorter branch: sim.keys is B\'s keys');
// And the record must stay right when the lap is then driven on: what sim.keys
// says is what a search would save as its lap.
r = await sim.drive(human.keys.slice(4000));
check(r.finished && r.finishFrames === human.frames, `driven on from B the lap finishes on the human's tick (${r.finishFrames})`);
check(sameKeys(sim.keys, human.keys), 'after branch, load and finish, sim.keys is the lap that was actually driven (the human lap)');
// Loading an EARLIER point of the same branch only needs the cut, which always worked.
await sim.load(A);
check(sameKeys(sim.keys, human.keys.slice(0, 3000)), 'load(A) from further along the same branch: the first 3000 keys');
// The point's keys must not be shared with the live list.
await sim.hold(LEFT, 10);
await sim.load(B);
await sim.load(A);
await sim.hold(LEFT, 10);
await sim.load(B);
check(sameKeys(sim.keys, human.keys.slice(0, 4000)), 'loading the same points repeatedly, with driving in between, never corrupts a point\'s keys');

// ---- the finish ------------------------------------------------------------------
await sim.load(B);
check(!sim.finished, 'load() of a point before the finish, taken after the car had finished: not finished');
// More keys than the lap needs: the drive stops at the line.
r = await sim.drive([...human.keys.slice(4000), ...Array(500).fill(LEFT)]);
eq([r.finished, r.finishFrames, r.tick, sim.keys.length, sim.tick], [true, 21750, 21750, 21750, 21750], 'drive() with 500 keys too many stops at the finish: tick, finishFrames and keys.length all 21750');
{
  const span = sim.recent.at(-1).frames - sim.recent[0].frames, v = Math.hypot(...sim.motion().velocity) * 3.6;
  check(span <= 4, `motion() at the finish is measured across the last 4 ticks as documented (it spans ${span})`);
  check(Math.abs(v - sim.state.speedKmh) < 0.02 * sim.state.speedKmh + 1, `motion() at the finish: ${v.toFixed(1)} km/h against the speedometer's ${sim.state.speedKmh.toFixed(1)}`);
}
r = await sim.drive(Array(100).fill(LEFT));
eq([r.tick, r.finished, sim.keys.length], [21750, true, 21750], 'driving on after the finish does nothing');
r = await sim.hold(LEFT, 100);
eq([r.tick, sim.keys.length], [21750, 21750], 'hold() after the finish does nothing');
const F = await sim.save();
await sim.load(A);
await sim.load(F);
eq([sim.finished, sim.tick, sim.state.finishFrames], [true, 21750, 21750], 'a point saved after the finish loads as finished');
// One tick short is not a finish; the last tick is.
await sim.load(B);
r = await sim.drive(human.keys.slice(4000, 21749));
eq([r.finished, r.tick, r.finishFrames], [false, 21749, null], 'driven to tick 21749 the lap has NOT finished');
r = await sim.drive(human.keys.slice(21749, 21750));
eq([r.finished, r.finishFrames], [true, 21750], 'the 21750th tick finishes it');

// ---- contact, and a lap that does not finish ---------------------------------------
await sim.restart();
r = await sim.drive(human.keys);
check(r.contactTicks === 0 && r.finishFrames === 21750, 'the whole human lap from a fresh car: 21750 ticks, 0 body-contact ticks (CONTRACT: clean human laps have zero)');
await throws(() => sim.load(A), 'restart() kills earlier points: load() of one throws');
await sim.restart();
r = await sim.hold({}, 700);
eq([r.finished, r.finishFrames, r.tick, sim.keys.length], [false, null, 700, 700], 'no keys for 700 ticks: not finished, finishFrames null, 700 keys kept');
check(r.state.speedKmh < 1, 'and the car has not moved off');
await sim.drive(human.keys.slice(0, 5000));
// (the car was standing for 700 ticks, so this is not the human's line: expect the wall sooner or later)
r = await sim.hold(LEFT, 3000);
check(r.contactTicks > 0, `W + left for 3 s into the scenery: ${r.contactTicks} body-contact ticks counted`);
check(sim.budgetLeft && sim.env.frames < CAR_TICK_BUDGET, 'budgetLeft is true well inside the tick budget');
await sim.close();

// ---- a track given as CreateCar inputs ------------------------------------------------
const own = await SimSession.create(loadTrack('desert4'));
await own.restart();
r = await own.drive(human.keys.slice(0, 3000));
check(own.trackName === null && car(r.state) === at3000, 'create(CreateCar inputs): same car state after 3000 ticks as create(name), in a second simulator');
await own.close();
note('one simulator at a time throughout');
