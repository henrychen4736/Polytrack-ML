// Reinforcement-learning environment on top of the headless simulator.
//
// sim/env.mjs gives us "hold these keys for n ticks, get n raw states back".
// An RL algorithm wants something more specific each time it acts:
//
//   observation  a fixed-length list of numbers describing what the driver can
//                "see": how the car is moving and where the road goes next
//   reward       one number saying how good the last action was
//   done flags   whether the episode (one attempt at a lap) is over, and why
//
// This file turns the simulator into that. It contains no learning; the
// learning code is in Python (rl/train_ppo.py) and reaches this class through
// rl/env_server.mjs, which wraps it in a text protocol.
//
//   const renv = await RacingEnv.create({ track: 'summer1' });
//   let { obs } = await renv.reset();
//   let { obs, reward, terminated, truncated, info } = await renv.step(0);
//
// ---------------------------------------------------------------------------
// ACTIONS: 9 key combinations, numbered 0..8
//
//   action = 3 * pedal + steer
//     pedal  0 = throttle (up key)   1 = coast (neither)   2 = brake (down key)
//     steer  0 = straight            1 = left              2 = right
//
//   So 0 = throttle straight, 1 = throttle + left, 2 = throttle + right,
//      3 = coast straight, ... 8 = brake + right.
//   The chosen keys are held for `ticks` physics ticks (default 10 = 10 ms),
//   then the agent is asked again.
//
// ---------------------------------------------------------------------------
// OBSERVATION: OBS_SIZE = 101 numbers, all scaled to be roughly within -1..1
//
// "Car frame" below means the car's own axes (measured, see sim/controller.mjs):
//   x = to the car's LEFT, y = up through the roof, z = FORWARD.
// Expressing things in the car frame means the same corner looks the same to
// the agent wherever it is on the map and whichever way it points.
//
//   index  count  what                                         scaling
//   0      1      speed (the game's own speedometer)           km/h / 300
//   1      3      velocity in the car frame (left, up, fwd)    m/s / 80
//                 fwd is normal driving; a large `left` value
//                 means the car is sliding sideways
//   4      3      world "up" seen from the car frame           unit vector
//                 (0,1,0) = level; tells roll and pitch
//   7      3      rotation rate about the car's x, y, z axes   rad/s / 5
//                 the y one is how fast the car is turning
//   10     4      wheel on the ground? one per wheel           0 or 1
//   14     1      front-wheel angle, positive = left           rad / 0.45
//   15     2      keys held during the previous decision:      -1, 0 or 1
//                 pedal (+1 throttle, -1 brake), steer (+1 left, -1 right)
//   17     3      nearest reference-line point, car frame      units / 10
//                 (its `left` part is how far off the line we are)
//   20     1      fraction of the lap completed                0..1
//                 (always 0 when the lapFraction option is off)
//   21     60     20 line points ahead, 3 numbers each         see below
//                 (left, up, fwd) in the car frame
//   81     20     the human's speed at each of those points    km/h / 300
//
// The 20 points ahead are spaced `gap` apart along the line, where
//   gap = max(2 units, 0.15 s x current speed)
// so at 100 km/h the agent sees about 83 units (3 seconds) ahead and at
// walking pace 40 units. Point k (k = 1..20) is divided by its distance along
// the line, k * gap. That makes every point's numbers about the same size
// regardless of speed: they are close to "which direction is that point in",
// e.g. left/(k*gap) = 0.5 means "30 degrees to my left".
//
// ---------------------------------------------------------------------------
// REWARD
//
//   every step:  0.1 x (distance gained along the reference line, in units)
//   on finish:   the rest of the line's length x 0.1 (so every finished lap
//                has collected exactly the same progress reward), plus
//                5 + 2 x (seconds left before the tick limit)
//
// Because the progress part is identical for every finished lap, the only
// thing that differs between two finished laps is the time bonus, and that is
// strictly larger for the faster lap: 2 reward per second saved, 0.002 per
// tick (one second is worth as much as 20 units of road). And any finished
// lap beats any unfinished one, because the bonus is always more than 5 and
// an unfinished lap misses it and some progress too.
// On summer1 a lap at the human's pace earns about 128 for progress and 50
// for the bonus. The bonus is kept to that size on purpose: a much larger
// lump at the very end is hard for the value network to fit.
//
// ---------------------------------------------------------------------------
// END OF EPISODE
//
//   terminated  the car crossed the finish line (info.reason = 'finished')
//   truncated   the attempt was cut off:
//     'stalled'     less than 1 unit of progress in `stallTicks` (2 s):
//                   crashed, flipped, stuck or driving the wrong way
//     'off line'    more than `maxOffLine` (20) units from the reference line
//     'time limit'  `maxTicks` reached (default: twice the human's lap time)
import { writeFileSync, mkdirSync } from 'node:fs';
import { Env, loadTrack } from '../sim/env.mjs';
import { decodeState } from '../sim/state.mjs';
import { loadHumanLap } from '../sim/drive.mjs';
import { buildLine, nearestIndex, SPACING } from '../sim/line.mjs';
import { rotate } from '../sim/track.mjs';
import { decodeRecording, toDense } from '../sim/recording.mjs';

// ---- actions ---------------------------------------------------------------

export const NUM_ACTIONS = 9;

/** Action number -> the keys to hold (see the table at the top). */
export function actionToControls(action) {
  const pedal = Math.floor(action / 3), steer = action % 3;
  return { up: pedal === 0, down: pedal === 2, left: steer === 1, right: steer === 2, reset: false };
}

/** Keys -> action number. Used to drive this environment from a hand-written
 *  controller (rl/smoke_test.mjs). Throttle wins if both pedals are pressed,
 *  left wins if both steering keys are. */
export function controlsToAction(c) {
  const pedal = c.up ? 0 : c.down ? 2 : 1;
  const steer = c.left ? 1 : c.right ? 2 : 0;
  return 3 * pedal + steer;
}

// ---- observation layout ----------------------------------------------------

/** How many reference-line points ahead the agent sees. */
export const LOOKAHEAD_POINTS = 20;
/** Length of the observation vector: 21 car numbers + 3 per point + 1 speed per point. */
export const OBS_SIZE = 21 + 4 * LOOKAHEAD_POINTS;

// Divisors that bring each quantity to roughly -1..1. Neural networks learn
// badly when one input is around 200 and another around 0.01.
const SPEED_KMH_SCALE = 300;   // km/h; faster than anything on summer1
const VELOCITY_SCALE = 80;     // m/s; 80 m/s = 288 km/h
const SPIN_SCALE = 5;          // rad/s
const STEER_SCALE = 0.45;      // rad; the wheels' limit at low speed is about 0.41
const NEAR_SCALE = 10;         // world units
const CLIP = 3;                // nothing in the observation may exceed +-3

/** Ticks between the save states kept along the human's lap (see _buildLadder).
 *  250 ms: a reset then replays at most a quarter of a second of driving. */
const LADDER_STEP = 250;
/** Make a fresh car once the current one has been stepped this many ticks in
 *  total. The game refuses to step a car past 5,999,999 ticks of its own
 *  counter, which keeps counting across save-state restores. */
const CAR_TICK_BUDGET = 5_000_000;

/** Defaults for everything that can be set per environment. */
export const DEFAULTS = {
  track: 'summer1',
  // Physics ticks (ms) each action is held for.
  ticks: 10,
  // Episode limits. maxTicks null = twice the human's lap time.
  maxTicks: null,
  stallTicks: 2000,
  maxOffLine: 20,
  // Reward weights (see REWARD above).
  progressReward: 0.1,     // per world unit gained along the line
  finishBonus: 5,          // for finishing at all
  timeBonusPerSecond: 2,   // per second left before maxTicks at the finish
  // Lookahead spacing: gap between seen line points = max(minGap, speed x gapSeconds).
  minGap: 2,
  gapSeconds: 0.15,
  // Probability that reset() starts the car part-way round the lap instead of
  // on the start line (see reset()). 0 = always the start line.
  randomStart: 0,
  // Seed for the random start choice, so runs can be repeated exactly.
  seed: 0,
  // Of the episodes that start part-way round (randomStart), the share that
  // start shortly BEFORE a place where a recent episode of this environment
  // crashed, instead of at a uniformly random place. 0 = never.
  // Why: a trained agent tends to fail at a few specific spots on each track
  // (the same obstacle or jump every time). Uniform starts spend most practice
  // on road it already drives well. Starting 1.5 to 4 seconds before a known
  // failure point puts the practice where it is needed, and lets the agent
  // arrive at the trouble spot under its own control.
  failureStart: 0,
  // Whether observation [20] carries the fraction of the lap completed
  // (1) or is always 0 (0). On a single track it helps: the agent can learn
  // "at 40% of the lap, do this". For an agent meant to drive tracks it has
  // never seen, that is exactly the wrong habit, so multi-track training
  // switches it off and the agent has to go by the line ahead of it.
  lapFraction: 1,
};

// ---- small maths helpers ---------------------------------------------------

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const clip = (v, lim = CLIP) => Math.max(-lim, Math.min(lim, v));

/** World-space vector -> the car's frame (left, up, forward). The inverse of
 *  a unit quaternion is its conjugate, so rotate by that. */
const toCarFrame = (v, q) => rotate(v, [-q[0], -q[1], -q[2], q[3]]);

/** Quaternion product a * b ("b first, then a"), both as [x, y, z, w]. */
function quatMultiply(a, b) {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/** Small repeatable random number generator (mulberry32): returns a function
 *  giving numbers in [0, 1). Math.random cannot be seeded. */
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One string per key combination, to compare two ticks' keys cheaply. */
const controlsKey = (c) => `${+!!c.up}${+!!c.right}${+!!c.down}${+!!c.left}${+!!c.reset}`;

// ---- the environment -------------------------------------------------------

export class RacingEnv {
  /**
   * Boot a simulator, load the track and build the reference line.
   * `options` overrides DEFAULTS. Takes about a second.
   */
  static async create(options = {}) {
    const renv = new RacingEnv();
    const cfg = renv.cfg = { ...DEFAULTS, ...options };
    renv.env = await Env.create();
    renv.track = loadTrack(cfg.track);

    // Replay the human lap once. Its trajectory becomes the reference line
    // (as in sim/drive.mjs), and we also keep, for every tick of that lap,
    // which line point the human had reached. reset() uses that table to
    // start an episode part-way round the lap.
    const human = renv.human = loadHumanLap(cfg.track);
    const run = await renv.env.replay(renv.track, human.recording, human.frames + 100);
    renv.line = buildLine(run.states);
    renv.humanIndexAtTick = new Int32Array(run.states.length);
    for (let t = 0, index = 0; t < run.states.length; t++) {
      // The car moves a few centimetres per tick, so checking every 20th
      // tick is plenty to keep `index` within the forward search window.
      if (t % 20 === 0) index = nearestIndex(renv.line, decodeState(run.states[t]).position, index).index;
      renv.humanIndexAtTick[t] = index;
    }
    // The human's keys on every tick: humanControls[t] is held while tick t is computed.
    renv.humanControls = toDense(decodeRecording(human.recording), human.frames);

    cfg.maxTicks ??= 2 * human.frames;
    renv.rng = makeRng(cfg.seed);
    renv.done = true; // step() is refused until reset() has been called
    return renv;
  }

  /**
   * Hold `controls` for `n` ticks and remember the result.
   * Keeps two decoded states: `state` (the newest) and `older` (a few ticks
   * earlier), because velocity and rotation rate are not in the state and
   * have to be worked out from how position and orientation changed.
   */
  async _advance(controls, n) {
    const states = await this.env.step(controls, n);
    for (let k = 0; k < n; k++) this.controlsPerTick.push(controls);
    const newest = decodeState(states[n - 1]);
    // Compare with the state 4 ticks back when this call produced that many
    // (a longer gap averages out float32 rounding in the positions);
    // otherwise with the newest state of the previous call.
    this.older = n >= 2 ? decodeState(states[Math.max(0, n - 5)]) : (this.state ?? newest);
    this.state = newest;
  }

  /**
   * Start a new episode. Returns { obs, info }.
   *
   *   seed           re-seed the random start choice
   *   startFraction  0..1: start this far through the HUMAN's lap (by time)
   *                  instead of on the start line. If not given, a random
   *                  fraction in 0..0.9 is used with probability
   *                  cfg.randomStart, and the start line otherwise.
   *
   * Why start part-way round: an agent that only ever starts on the line has
   * to survive the first corner before it can practise the second, and so
   * on, so the end of the lap gets almost no practice early in training.
   * The simulator cannot place a car at an arbitrary spot, but it is
   * deterministic, so we get the same effect by replaying the human's own
   * keys up to the chosen tick and handing over from there. The agent's lap
   * time then includes the human's time for the first part.
   */
  async reset({ seed = null, startFraction = null } = {}) {
    if (seed != null) this.rng = makeRng(seed);
    // Line indices where recent episodes of this environment ended without
    // finishing (see step()). Created on first use.
    this.failures ??= [];
    let startTick;
    if (startFraction != null) {
      startTick = Math.floor(Math.max(0, Math.min(0.95, startFraction)) * this.human.frames);
    } else if (this.rng() >= this.cfg.randomStart) {
      startTick = 0; // the start line
    } else if (this.failures.length && this.rng() < this.cfg.failureStart) {
      // Start shortly before a recent failure point. The failure is stored as
      // a line index; find the first tick at which the human had reached it
      // (humanIndexAtTick only ever increases, so a binary search works) ...
      const failIndex = this.failures[Math.floor(this.rng() * this.failures.length)];
      let lo = 0, hi = this.humanIndexAtTick.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (this.humanIndexAtTick[mid] < failIndex) lo = mid + 1; else hi = mid; }
      // ... then back off by 1.5 to 4 seconds of the human's driving.
      startTick = Math.max(0, lo - Math.floor(1500 + 2500 * this.rng()));
    } else {
      startTick = Math.floor(0.9 * this.rng() * this.human.frames); // anywhere in the first 90%
    }

    // Put the car at the chosen start by restoring a save state (see
    // _buildLadder). The game stops stepping a car after about 6 million
    // ticks of its own counter, which save states do not rewind, so well
    // before that we make a fresh car and rebuild the ladder for it.
    if (!this.ladder || this.env.frames > CAR_TICK_BUDGET) await this._buildLadder();
    this.previousAction = 3; // coast straight: no keys held before the first decision

    if (startTick === 0) {
      await this._restore(this.ladder.startLine);
      this.progressIndex = 0;
    } else {
      // The latest rung at or before the chosen tick ...
      const rung = this.ladder.rungs[Math.min(this.ladder.rungs.length - 1, Math.floor(startTick / LADDER_STEP))];
      await this._restore(rung);
      // ... then the human's keys for the few ticks left (under LADDER_STEP),
      // so the start lands exactly on the chosen tick.
      await this._replayHuman(rung.tick, startTick);
      // We know which line point the human had reached by this tick. Start
      // the search a little before it; nearestIndex only looks forward.
      this.progressIndex = Math.max(0, this.humanIndexAtTick[Math.max(0, startTick - 1)] - 5);
    }

    this._locate();
    this.startTick = this.state.frames;
    this.startProgress = this.progress;
    this.stallProgress = this.progress;   // progress when the stall clock last restarted
    this.stallTick = this.state.frames;   // tick when it restarted
    this.episodeReward = 0;
    this.done = false;
    return { obs: this._observe(), info: this._info(null) };
  }

  /**
   * Replay the human's keys for ticks [from, to), one step() call per run of
   * ticks with the same keys held.
   */
  async _replayHuman(from, to) {
    for (let t = from; t < to;) {
      let n = 1;
      while (t + n < to && controlsKey(this.humanControls[t + n]) === controlsKey(this.humanControls[t])) n++;
      await this._advance(this.humanControls[t], n);
      t += n;
    }
  }

  /**
   * Build the "ladder": save states along the human's lap, so that reset()
   * can put the car anywhere on it almost for free.
   *
   * Before this existed, starting an episode part-way round meant creating a
   * new car and replaying the human's keys from the start line up to the
   * chosen tick, every single time: up to several hundred milliseconds of
   * simulation per episode, and the main cost of training with many part-way
   * starts. Now the human's lap is replayed ONCE, pausing every LADDER_STEP
   * ticks to take a save state (a "rung"). A reset restores the nearest rung
   * (about 1 to 2 ms) and replays at most LADDER_STEP ticks.
   *
   * A save state only works for the car it was taken from (see
   * sim/worker_entry.mjs), so one car is kept for the whole ladder and reused
   * for every episode. Rungs are stored as differences from one full copy of
   * the memory, which keeps hundreds of them small.
   *
   * this.ladder = {
   *   base       full snapshot of the new car before any tick (kept because
   *              every other snapshot is stored relative to it)
   *   startLine  the car after one tick with no keys: where an episode from
   *              the start line begins (same first tick as sim/drive.mjs)
   *   rungs      rungs[k] = the car after the human's first k * LADDER_STEP
   *              ticks; rungs[0] is the untouched new car
   * }
   * Each entry also keeps the bookkeeping that goes with that moment
   * (`state`, `older`, the keys so far), which _restore puts back.
   */
  async _buildLadder() {
    this.env.reset(this.track); // a new car; snapshots of the previous car are now useless
    this.controlsPerTick = [];
    this.state = this.older = null;
    const base = await this.env.saveState();
    const remember = async (tick) => ({
      tick,
      handle: tick === 0 && this.controlsPerTick.length === 0 ? base : await this.env.saveState(base),
      state: this.state,
      older: this.older,
      controls: this.controlsPerTick.slice(),
    });

    // Rung 0 is the untouched car; then the start-line state, one empty tick in.
    const rungs = [await remember(0)];
    await this._advance({}, 1);
    const startLine = await remember(1);

    // Back to the untouched car, then the human's lap with a rung every
    // LADDER_STEP ticks. Starts are never placed in the last 5% of the lap.
    await this._restore(rungs[0]);
    const lastTick = Math.floor(0.95 * this.human.frames);
    for (let tick = LADDER_STEP; tick <= lastTick; tick += LADDER_STEP) {
      await this._replayHuman(tick - LADDER_STEP, tick);
      rungs.push(await remember(tick));
    }
    this.ladder = { base, startLine, rungs };
    this.ladderBytes = base.bytes + startLine.handle.bytes + rungs.reduce((n, r) => n + (r.handle === base ? 0 : r.handle.bytes), 0);
  }

  /** Put the simulator and our own bookkeeping back to a ladder entry. */
  async _restore(entry) {
    await this.env.loadState(entry.handle);
    this.state = entry.state;
    this.older = entry.older;
    this.controlsPerTick = entry.controls.slice();
  }

  /**
   * Work out where the car is along the reference line.
   * Sets progressIndex (nearest line point), offLine (distance to it, units)
   * and progress (distance along the line in units, with a fractional part).
   */
  _locate() {
    const { line, state } = this;
    const near = nearestIndex(line, state.position, this.progressIndex);
    this.progressIndex = near.index;
    this.offLine = near.distance;
    // The index alone moves in whole units, and at 10 ms per decision the car
    // covers well under one unit, so most steps would show zero progress and
    // an occasional one a full unit. Add how far the car is past (or short
    // of) the nearest point, measured along the line's direction there.
    const last = line.points.length - 1;
    const before = line.points[Math.max(0, near.index - 1)], after = line.points[Math.min(last, near.index + 1)];
    const along = sub(after, before);
    const length = Math.hypot(...along) || 1;
    const offset = dot(sub(state.position, line.points[near.index]), along) / length;
    this.progress = near.index * SPACING + Math.max(-0.5 * SPACING, Math.min(0.5 * SPACING, offset));
  }

  /** Build the observation vector described at the top of this file. */
  _observe() {
    const { line, state, older, cfg } = this;
    const q = state.quaternion;
    const obs = new Array(OBS_SIZE);
    let o = 0;

    // [0] speed
    obs[o++] = state.speedKmh / SPEED_KMH_SCALE;

    // [1..3] velocity in the car frame. Positions are per tick and a tick is
    // 1 ms, so (change in position) / (ticks apart) x 1000 is units per second.
    const dTicks = state.frames - older.frames;
    const perSecond = dTicks > 0 ? 1000 / dTicks : 0;
    const velocity = toCarFrame(sub(state.position, older.position).map((v) => v * perSecond), q);
    for (const v of velocity) obs[o++] = clip(v / VELOCITY_SCALE);

    // [4..6] which way is "up" from the car's point of view.
    for (const v of toCarFrame([0, 1, 0], q)) obs[o++] = v;

    // [7..9] rotation rate. The rotation that takes the older orientation to
    // the newer one, expressed in the car's frame, is inverse(older) * newer.
    // For a small rotation its x, y, z parts are half the rotation angle
    // about each axis, so angle per second = 2 x part x ticks-per-second.
    const oq = older.quaternion;
    const turn = quatMultiply([-oq[0], -oq[1], -oq[2], oq[3]], q);
    const sign = turn[3] < 0 ? -1 : 1; // q and -q are the same rotation; pick the short way round
    for (let k = 0; k < 3; k++) obs[o++] = clip((2 * sign * turn[k] * perSecond) / SPIN_SCALE);

    // [10..13] wheels on the ground, [14] steering angle.
    for (const touching of state.wheelContact) obs[o++] = touching ? 1 : 0;
    obs[o++] = clip(state.steering / STEER_SCALE);

    // [15..16] previous action as pedal and steer in -1, 0, 1. The steering
    // angle lags behind the keys, so the agent needs to know what it last asked for.
    const pedal = Math.floor(this.previousAction / 3), steer = this.previousAction % 3;
    obs[o++] = pedal === 0 ? 1 : pedal === 2 ? -1 : 0;
    obs[o++] = steer === 1 ? 1 : steer === 2 ? -1 : 0;

    // [17..19] nearest line point in the car frame, [20] lap fraction.
    const last = line.points.length - 1;
    for (const v of toCarFrame(sub(line.points[this.progressIndex], state.position), q)) obs[o++] = clip(v / NEAR_SCALE);
    obs[o++] = this.cfg.lapFraction ? this.progress / line.length : 0;

    // [21..80] the line ahead, [81..100] the human's speed at those points.
    // Past the end of the line the last point is repeated.
    const gap = Math.max(cfg.minGap, (state.speedKmh / 3.6) * cfg.gapSeconds);
    const speeds = o + 3 * LOOKAHEAD_POINTS;
    for (let k = 1; k <= LOOKAHEAD_POINTS; k++) {
      const index = Math.min(last, this.progressIndex + Math.round((k * gap) / SPACING));
      const local = toCarFrame(sub(line.points[index], state.position), q);
      for (const v of local) obs[o++] = clip(v / (k * gap));
      obs[speeds + k - 1] = line.speedKmh[index] / SPEED_KMH_SCALE;
    }
    return obs;
  }

  /** Numbers about the episode so far, for logging. Not seen by the agent. */
  _info(reason) {
    const s = this.state;
    return {
      frames: s.frames,                         // ticks since the start line (ms)
      progress: +this.progress.toFixed(2),      // units along the line
      fraction: +(this.progress / this.line.length).toFixed(4),
      offLine: +this.offLine.toFixed(2),        // units from the line
      speedKmh: +s.speedKmh.toFixed(1),
      checkpoint: s.nextCheckpointIndex,
      reason,                                   // null while the episode is running
      finishFrames: s.finishFrames,             // lap time in ticks, or null
      episodeReward: +this.episodeReward.toFixed(3),
      startTick: this.startTick,                // 0-ish unless the episode started part-way round
    };
  }

  /**
   * Hold the keys for action `action` for cfg.ticks ticks.
   * Returns { obs, reward, terminated, truncated, info }.
   */
  async step(action) {
    if (this.done) throw new Error('step() called on a finished episode; call reset() first');
    if (!Number.isInteger(action) || action < 0 || action >= NUM_ACTIONS) throw new Error(`bad action ${action}`);
    const { cfg } = this;

    const before = this.progress;
    await this._advance(actionToControls(action), cfg.ticks);
    this.previousAction = action;
    this._locate();
    const s = this.state;

    // Reward for the ground gained this step (negative if the car slid back).
    let reward = cfg.progressReward * (this.progress - before);

    // Stall clock: restart it whenever the car has gained a full unit.
    if (this.progress >= this.stallProgress + 1) { this.stallProgress = this.progress; this.stallTick = s.frames; }

    let reason = null;
    if (s.finishFrames != null) {
      reason = 'finished';
      // Top the progress reward up to the full line so it is the same for
      // every finished lap, then add the bonus that depends only on the time.
      reward += cfg.progressReward * (this.line.length - this.progress);
      reward += cfg.finishBonus + cfg.timeBonusPerSecond * Math.max(0, cfg.maxTicks - s.finishFrames) / 1000;
    } else if (this.offLine > cfg.maxOffLine) reason = 'off line';
    else if (s.frames - this.stallTick > cfg.stallTicks) reason = 'stalled';
    else if (s.frames >= cfg.maxTicks) reason = 'time limit';

    this.done = reason != null;
    this.episodeReward += reward;
    // Remember where the car came to grief, for failureStart (see reset()).
    // Running out of time is not a crash, so it is not recorded. Keep the
    // last 40, so the list follows the agent as it gets past old trouble spots.
    if (reason === 'off line' || reason === 'stalled') {
      this.failures ??= [];
      this.failures.push(this.progressIndex);
      if (this.failures.length > 40) this.failures.shift();
    }
    return {
      obs: this._observe(),
      reward,
      terminated: reason === 'finished',
      truncated: this.done && reason !== 'finished',
      info: this._info(reason),
    };
  }

  /**
   * Save the finished lap's keys as runs/<run>_<track>.json in the format
   * scripts/export_recording.mjs reads: { track, finishFrames, controlsPerTick }.
   * Only a lap that crossed the finish line can be saved. Returns the path.
   */
  save(run = 'rl') {
    const finishFrames = this.state?.finishFrames;
    if (finishFrames == null) throw new Error('nothing to save: the last episode did not finish');
    if (!/^[A-Za-z0-9_-]+$/.test(run)) throw new Error('run name may only contain letters, digits, "_" and "-"');
    const dir = new URL('../runs/', import.meta.url);
    mkdirSync(dir, { recursive: true });
    const file = `${run}_${this.cfg.track}.json`;
    writeFileSync(new URL(file, dir), JSON.stringify({
      track: this.cfg.track,
      finishFrames,
      // The finish can land mid-decision; keep only the ticks up to it.
      controlsPerTick: this.controlsPerTick.slice(0, finishFrames),
    }));
    return `runs/${file}`;
  }

  close() { return this.env.close(); }
}
