// Save-state rollouts on the bare simulator: "go to a moment, drive some keys
// from it, see where the car ended up", with NO reference lap involved.
//
// sim/env.mjs already has step / saveState / loadState, but every caller has
// to keep the same bookkeeping around them: which keys have been driven so
// far (so the lap can be saved), the tick, a base snapshot so later ones are
// small, the velocity (which the car state does not contain), and the limit
// on how many ticks one car can be stepped. This class keeps that in one place.
//
//   const sim = await SimSession.create('desert4');
//   await sim.restart();                       // car on the start line, tick 0
//   let r = await sim.drive(lap.keys.slice(0, 5000));
//   const here = await sim.save();             // a "point"
//   r = await sim.hold({ up: true, left: true }, 300);
//   await sim.load(here);                      // back at tick 5000, same car
//   sim.keys                                   // the 5000 keys driven so far
//
// For rollouts that need the POLICY's observation or the training reward, use
// rl/racing_env.mjs mark()/rewind() instead (see block_rollout.mjs); that
// environment needs a reference lap, this one does not.
//
// One SimSession = one simulator (a worker thread). To use several cores you
// need several PROCESSES (sim/pool.mjs explains why).
import { Env, loadTrack, CAR_TICK_BUDGET } from '../../sim/env.mjs';
import { decodeState, stateFinished } from '../../sim/state.mjs';

/** A car can be stepped about 6 million ticks of the game's own counter in
 *  total, and restoring a save state does not wind that counter back. Past
 *  this many (defined in sim/env.mjs), restart(). */
export { CAR_TICK_BUDGET };

/** Ticks between the two states that velocity and spin are measured across.
 *  A longer gap averages out float32 rounding in the positions (positions are
 *  hundreds of units, so one tick's difference carries about 0.03 units/s of
 *  noise); 4 is what rl/racing_env.mjs uses. */
const MOTION_GAP = 4;
/** Longest single step() call. Keys are sent in runs of equal keys, cut to
 *  this length so a run that crosses the finish stops soon after it. */
const CHUNK = 50;

const same = (a, b) => !!a.up === !!b.up && !!a.down === !!b.down && !!a.left === !!b.left && !!a.right === !!b.right && !!a.reset === !!b.reset;

export class SimSession {
  /**
   * Boot a simulator for `track` (a track name, or CreateCar inputs
   * { trackData, mountainVertices, mountainOffset } for a track of your own,
   * e.g. a generated one). Call restart() before driving.
   */
  static async create(track = 'summer1') {
    const sim = new SimSession();
    sim.env = await Env.create();
    sim.track = typeof track === 'string' ? loadTrack(track) : track;
    sim.trackName = typeof track === 'string' ? track : null;
    return sim;
  }

  /**
   * A new car on the start line at tick 0, nothing driven. Every point saved
   * before this call is dead (a save state only works for the car it was
   * taken from) and its memory is freed.
   */
  async restart() {
    this.env.dropAllStates();
    this.env.reset(this.track);
    this.keys = [];        // keys[t] = what was held during tick t, for every tick driven
    this.recent = [];      // the last few decoded states, newest last (for motion())
    this.state = null;     // newest decoded state (sim/state.mjs); null before the first tick
    // One full copy of the physics memory (about 24 MB); every later save is
    // stored as its difference from this, which is far smaller.
    this.base = await this.env.saveState();
  }

  /** Ticks driven since the start line (= the lap clock in ms). */
  get tick() { return this.keys.length; }
  /** True once the car has crossed the finish line. */
  get finished() { return this.state?.finishFrames != null; }
  /** False when this car is nearly used up; restart() then (points die). */
  get budgetLeft() { return this.env.frames < CAR_TICK_BUDGET; }

  /**
   * Hold `controls` for `n` ticks. Stops early (within CHUNK ticks) once the
   * car has finished. Returns the result object described at drive().
   */
  async hold(controls, n) {
    let contactTicks = 0, driven = 0;
    while (driven < n && !this.finished) {
      const m = Math.min(CHUNK, n - driven);
      const states = await this.env.step(controls, m);
      for (let k = 0; k < m; k++) {
        const s = decodeState(states[k]);
        if (s.collisionImpulses.length) contactTicks++;
        this.recent.push(s);
        this.keys.push(controls);
        // Stop counting at the finish tick itself: keys after it are not part of the lap.
        if (s.finishFrames != null) {
          driven += k + 1; this.state = s; this.keys.length = s.finishFrames;
          // Trim here too (this return skips the trim below), so motion() at
          // the finish is across MOTION_GAP ticks like everywhere else and not
          // across up to a whole CHUNK.
          if (this.recent.length > MOTION_GAP + 1) this.recent.splice(0, this.recent.length - MOTION_GAP - 1);
          return this._result(contactTicks);
        }
      }
      if (this.recent.length > MOTION_GAP + 1) this.recent.splice(0, this.recent.length - MOTION_GAP - 1);
      this.state = this.recent.at(-1);
      driven += m;
    }
    return this._result(contactTicks);
  }

  /**
   * Drive a list of per-tick keys (see laps.mjs for the form). Returns
   *   { tick, finished, finishFrames, contactTicks, state }
   *     tick          lap clock after the drive, ms
   *     finishFrames  lap time in ticks if the car finished, else null
   *     contactTicks  ticks of this drive on which the car's BODY touched
   *                   something (walls, obstacles, bottoming out; top human
   *                   laps have none)
   *     state         decoded car state (sim/state.mjs): position [x,y,z] in
   *                   world units (about metres), quaternion [x,y,z,w],
   *                   speedKmh, nextCheckpointIndex, wheelContact, ...
   */
  async drive(keys) {
    let contactTicks = 0;
    for (let t = 0; t < keys.length && !this.finished;) {
      let n = 1;
      while (t + n < keys.length && same(keys[t + n], keys[t])) n++;
      contactTicks += (await this.hold(keys[t], n)).contactTicks;
      t += n;
    }
    return this._result(contactTicks);
  }

  _result(contactTicks) {
    return { tick: this.tick, finished: this.finished, finishFrames: this.state?.finishFrames ?? null, contactTicks, state: this.state };
  }

  /**
   * How the car is moving now, which the state itself does not say:
   *   { velocity: [x,y,z] world units per second,
   *     spin:     [x,y,z] rotation rate, radians per second, world axes }
   * Measured across the last MOTION_GAP ticks (fewer just after restart() or
   * load() of a point saved that early; null if under two states are known).
   * Position + quaternion + velocity + spin is everything needed to compare
   * two cars' states, e.g. to decide whether one lap's keys can take over
   * from another's.
   */
  motion() {
    if (this.recent.length < 2) return null;
    const a = this.recent[0], b = this.recent.at(-1);
    const dt = (b.frames - a.frames) / 1000;
    const velocity = [0, 1, 2].map((k) => (b.position[k] - a.position[k]) / dt);
    // Rotation from a to b: d = qb * conj(qa). For a small turn, its vector
    // part is (axis * sin(angle / 2)), so 2 * vector / dt is the spin.
    const [ax, ay, az, aw] = a.quaternion, [bx, by, bz, bw] = b.quaternion;
    const d = [
      -bw * ax + bx * aw - by * az + bz * ay,
      -bw * ay + bx * az + by * aw - bz * ax,
      -bw * az - bx * ay + by * ax + bz * aw,
      bw * aw + bx * ax + by * ay + bz * az,
    ];
    const sign = d[3] < 0 ? -1 : 1; // q and -q are the same rotation; take the short way round
    return { velocity, spin: [0, 1, 2].map((k) => (2 * sign * d[k]) / dt) };
  }

  /**
   * Save this moment. Returns a "point" to pass to load(). Costs a few ms and
   * (measured on desert4) about 0.18 MB of memory each; point.bytes
   * says exactly. drop() points you no longer need.
   */
  async save() {
    const handle = await this.env.saveState(this.base);
    // The keys are copied into the point (one reference per tick: 0.17 MB and
    // well under 0.1 ms for a 22 s lap). The point's tick alone is not enough
    // to restore them: see load().
    return { handle, bytes: handle.bytes, tick: this.tick, keys: this.keys.slice(), state: this.state, recent: this.recent.slice() };
  }

  /**
   * Put the car back exactly as it was at save(), and `keys` with it.
   *
   * `keys` is restored from the point's own copy, not just cut back to the
   * point's tick. Cutting is only right when the point lies on the branch
   * being driven now. After "save A, drive, save B, load A, drive other keys,
   * load B" a cut left the OTHER branch's keys in `keys` (or holes, if that
   * branch was shorter), so a lap saved from `keys` was not the lap driven
   * (found by g1-2; ideas/shared/tests/test_sim_session.mjs reproduces it).
   * The array object stays the same one, for callers that hold on to it.
   */
  async load(point) {
    await this.env.loadState(point.handle);
    this.keys.length = point.tick;
    for (let t = 0; t < point.tick; t++) this.keys[t] = point.keys[t];
    this.state = point.state;
    this.recent = point.recent.slice();
  }

  /** Free a point's memory. */
  drop(point) { this.env.dropState(point.handle); }

  close() { return this.env.close(); }
}
