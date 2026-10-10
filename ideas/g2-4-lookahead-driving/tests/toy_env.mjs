// A hand-built stand-in for RacingEnv, small enough that every result of
// driveLap() on it can be worked out on paper. It has exactly the members
// lookahead.mjs (and shared fromStart / needsFreshCar) touch, and it is strict
// about save states: rewinding to a dropped or dead mark throws, so a
// bookkeeping slip in the driver fails loudly instead of passing silently.
//
// THE WORLD. A straight road of `length` positions and three lanes
// (-1 right, 0 middle, +1 left). One block decision = 50 ticks:
//   - steer 1 moves one lane left, steer 2 one lane right, 0 keeps the lane;
//     the lane cannot change while the car's position is in `sticky`
//     ([from, to) positions: "too late to do anything about it");
//   - the car then moves one position forward (always);
//   - if `walls` has "<position>:<lane>" for the new place the attempt ends
//     with reason 'off track' (truncated);
//   - `slow` maps "<position>:<lane>" to a speed reading (km/h); elsewhere
//     the speed is 100. The reference speed is 100 everywhere;
//   - reaching `finishAt[lane]` (default `length`) finishes the lap. The
//     finish lands 30 ticks into that block, so the last block steps 30 ticks
//     (as the real environment stops a block early at the finish).
// Reward per decision: 1, plus `laneBonus[lane]` (default 0).
// Observation: [position, lane]. The policy the tests use reads nothing else.
//
// CARS. env.frames counts every tick ever stepped and is NOT put back by a
// rewind (as sim/env.mjs). reset() with `ladder` set to null builds a new car:
// env.frames goes to 0 and every earlier mark is dead.

export class ToyEnv {
  constructor({ length = 20, walls = [], sticky = null, slow = {}, laneBonus = {}, finishAt = {}, frames = 0 } = {}) {
    this.cfgToy = { length, walls: new Set(walls), sticky, slow, laneBonus, finishAt };
    this.env = { frames };
    this.line = { length, speedKmh: new Array(length + 2).fill(100) };
    this.ladder = {};            // "a car exists"
    this.car = 1;
    this.contactTicks = 0;
    this.nextMark = 1;
    this.liveMarks = new Map();  // id -> car
    // What the tests read back.
    this.count = { steps: 0, ticks: 0, resets: 0, marks: 0, rewinds: 0, drops: 0, newCars: 0, tryOuts: 0 };
    this.history = [];           // the decisions that really led to the present state
    this._place(0, 0, 0);
    this.done = false;
  }

  _place(position, lane, frames) {
    this.position = position; this.lane = lane;
    this.progress = position; this.progressIndex = position;
    this.state = { frames, speedKmh: this.cfgToy.slow[`${position}:${lane}`] ?? 100, finishFrames: null };
  }

  _obs() { return [this.position, this.lane]; }

  async reset({ startFraction } = {}) {
    if (startFraction !== 0) throw new Error('toy: only starts on the line');
    if (this.ladder === null) {      // shared fromStart() asks for a new car this way
      this.ladder = {}; this.car++; this.env.frames = 0; this.count.newCars++;
    }
    this.count.resets++;
    this._place(0, 0, 0);
    this.done = false;
    this.history = [];
    return { obs: this._obs(), info: { reason: null } };
  }

  async stepBlock(decision) {
    if (this.done) throw new Error('toy: stepBlock on an ended attempt');
    const [steer] = decision;
    const { length, walls, sticky, laneBonus, finishAt } = this.cfgToy;
    let lane = this.lane;
    const stuck = sticky && this.position >= sticky[0] && this.position < sticky[1];
    if (!stuck) lane = Math.max(-1, Math.min(1, lane + (steer === 1 ? 1 : steer === 2 ? -1 : 0)));
    const position = this.position + 1;
    const finished = position >= (finishAt[lane] ?? length);
    const ticks = finished ? 30 : 50;
    this._place(position, lane, this.state.frames + ticks);
    this.env.frames += ticks;
    this.count.steps++; this.count.ticks += ticks;
    this.history.push(decision);
    let reason = null;
    if (finished) { reason = 'finished'; this.state.finishFrames = this.state.frames; }
    else if (walls.has(`${position}:${lane}`)) reason = 'off track';
    this.done = reason != null;
    return {
      obs: this._obs(), reward: 1 + (laneBonus[lane] ?? 0),
      terminated: reason === 'finished', truncated: this.done && reason !== 'finished',
      info: { reason, frames: this.state.frames, finishFrames: this.state.finishFrames },
    };
  }

  async mark() {
    const id = this.nextMark++;
    this.liveMarks.set(id, this.car);
    this.count.marks++;
    return { id, position: this.position, lane: this.lane, frames: this.state.frames, history: this.history.slice() };
  }

  async rewind(mark) {
    if (!this.liveMarks.has(mark.id)) throw new Error(`toy: rewind to mark ${mark.id}, which was dropped`);
    if (this.liveMarks.get(mark.id) !== this.car) throw new Error(`toy: rewind to mark ${mark.id}, which belongs to an earlier car`);
    this.count.rewinds++;
    this._place(mark.position, mark.lane, mark.frames);
    this.done = false;
    this.history = mark.history.slice();
    return { obs: this._obs(), info: { reason: null } };
  }

  dropMark(mark) {
    if (!this.liveMarks.has(mark.id)) throw new Error(`toy: mark ${mark.id} dropped twice`);
    this.liveMarks.delete(mark.id);
    this.count.drops++;
  }

  /** Marks of the present car that were never dropped. */
  get leaked() { return [...this.liveMarks.values()].filter((car) => car === this.car).length; }
}

/** The toy's policy: top choice = straight on with W; with an rng, steering is
 *  drawn 0 / 1 / 2 with equal chance (W stays down). */
export const toyPolicy = {
  decide(obs, rng = null) {
    return [rng ? Math.floor(rng() * 3) : 0, 0, 1, 0, 0, 0];
  },
};

/** Drive `decisions` on a fresh copy of a world; where and when it ends. */
export async function replayToy(options, decisions) {
  const env = new ToyEnv(options);
  await env.reset({ startFraction: 0 });
  let r = null;
  for (const d of decisions) r = await env.stepBlock(d);
  return { position: env.position, lane: env.lane, frames: env.state.frames, reason: r?.info.reason ?? null, finishFrames: env.state.finishFrames };
}
