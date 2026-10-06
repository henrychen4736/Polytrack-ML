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
// ACTIONS: 12 key combinations, numbered 0..11
//
//   action = steer + 3 * W + 6 * S
//     steer  0 = straight   1 = left (A)   2 = right (D)
//     W      0 or 1: the up key (throttle)
//     S      0 or 1: the down key (brake)
//
//   So 0 = no keys, 3 = W, 4 = W + left, 6 = S, 9 = W + S, 11 = W + S + right.
//   W and S are separate keys and can be held TOGETHER. Human laps do that all
//   the time: over a jump they keep W down and add S, which tilts the car so
//   it lands flat. (The first version of this file had one three-way "pedal"
//   choice, throttle / coast / brake, which could not express that.)
//
//   The chosen keys are held for `ticks` physics ticks (default 10 = 10 ms),
//   then the agent is asked again.
//
//   HOLDING KEYS. A human holds W for nearly the whole lap (98 to 100% of it,
//   pressing or releasing it once every few seconds). An agent that is asked
//   every 10 ms and answers with some randomness "feathers" the key instead:
//   measured on the previous agent, W was down 60 to 75% of the time with 30
//   presses or releases per second. That costs acceleration everywhere and was
//   the reason it arrived at every big jump 20 to 45 km/h too slow. Two things
//   here work against it:
//     - W and S are only read every `pedalEvery`-th decision (default 5, so
//       every 50 ms). In between, the W and S parts of the action are ignored
//       and the keys stay as they are. Steering is read on every decision.
//       Observation [145] tells the agent which kind of decision this is.
//     - Every press or release costs a little reward (see REWARD): W and S
//       much more than A and D.
//
// ---------------------------------------------------------------------------
// OBSERVATION: OBS_SIZE = 144 numbers, all scaled to be roughly within -1..1
// (The first 101 are unchanged from the first version of this file; the road
// edge numbers were added after them, so a network trained on the first 101
// can still be run by cutting the observation short.)
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
//                 [15] W minus S (+1 W only, -1 S only, 0 both or
//                 neither; [144] tells those two apart),
//                 [16] steer (+1 left, -1 right)
//   17     3      nearest reference-line point, car frame      units / 10
//                 (its `left` part is how far off the line we are)
//   20     1      fraction of the lap completed                0..1
//                 (always 0 when the lapFraction option is off)
//   21     60     20 line points ahead, 3 numbers each         see below
//                 (left, up, fwd) in the car frame
//   81     20     the human's speed at each of those points    km/h / 300
//   101    2      room to the road's edge right now: on the    units / 10
//                 car's left, then right. 0 = the car's centre
//                 is on the edge; a scrape starts at about 1 unit
//                 (half the car's width). 2 = 20 units or more.
//   103    1      did the body touch anything during the       0 or 1
//                 previous decision
//   104    40     for each of the 20 points ahead: room from   units / 10
//                 the LINE to the edge on its left, then right
//   144    1      was S held during the previous decision      0 or 1
//   145    1      will W and S be read at this decision?       0 or 1
//                 (see HOLDING KEYS above)
//   146    9      what the human was DOING at the nearest      unit vectors,
//                 line point: which way the human's car        key shares
//                 pointed (its forward, then its up, in our
//                 car frame), and the keys held there:
//                 W (0..1), S (0..1), steer (+1 left, -1 right)
//   155    180    the same 9 numbers for each of the 20
//                 points ahead
//   335    17     distance to the first solid surface along    sqrt(units / 120),
//                 17 rays cast FROM THE CAR (see RAYS below)   1 = nothing within 120
//
// RAYS (335 onwards). The road-edge numbers at 101..143 are measured sideways
// from the human's line. They say how wide the road is where the human drove,
// but not what is in front of this car's own nose: a car angled towards a
// wall, or well off the line, or facing a pillar the line passes beside, was
// blind to it. In the air there was nothing at all about where the landing
// surface is. The rays fill that in, lidar-style, against the game's real
// collision geometry (sim/trackmesh.mjs):
//   13 in the car's own plane, from half a unit above its origin, fanned at
//      0, +-5, +-10, +-20, +-35, +-55 and +-90 degrees from straight ahead
//      (left first, then right, for each angle)
//   3  in the car's vertical plane: straight down through the floor, and
//      20 and 45 degrees below straight ahead (the road just ahead; in a
//      flight, where the car is heading to come down)
//   1  straight down in WORLD terms, whatever the car's attitude: height
//      above whatever is underneath
// The square root spreads out the short distances, where a unit matters most:
// 1 unit reads 0.09, 5 units 0.2, 30 units 0.5.
//
// Why the human's orientation and keys are shown (146 onwards): position and
// speed say where the human went, not how. A drift is the car pointing one
// way while travelling another; a long jump needs the car held at a certain
// attitude in the air; an air brake is S held for the whole flight. None of
// that can be read from positions. With these inputs the reference is a full
// description of the lap, and the agent's job becomes following it.
//
// "Edge" is a wall, a barrier, or the end of the road surface, whichever is
// nearer (sim/trackmesh.mjs). The edge numbers at 101 are measured from the
// car; those at 104 from the line, so together with where the line points are
// they tell the agent how wide the road ahead is and which side has room.
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
//                  x pace, where pace = our speed / the human's speed at
//                  this point of the line, limited to 0..1 (paceReward, paceCap).
//                  A unit of road covered at the human's speed is worth
//                  0.1; covered at half that speed, 0.05. This pays for
//                  carrying speed everywhere, not only for getting there.
//                minus a penalty while the car's body is touching anything:
//                  0.1 x (share of this step's ticks in contact)
//                  + 0.05 x log10(1 + how hard the contacts pushed)
//                  A full second of scraping costs about 10, twice what a
//                  second of driving at 200 km/h earns. Top human laps have
//                  no body contact at all, so this never punishes good driving.
//                minus a small cost for every key pressed or released:
//                  0.05 for W or S (pedalTogglePenalty), 0.005 for a change
//                  of steering (steerTogglePenalty). Holding a key is free.
//                  Tapping W on and off ten times a second would cost 1 per
//                  second, a fifth of what driving at 200 km/h earns; the
//                  few dozen key changes of a human lap cost about 1 in total.
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
//     'off line'    more than `maxOffLine` (20) units from the reference line,
//                   or `maxOffLineAir` (60) over a stretch the human flew
//     'off track'   more than `edgeMargin` (2) units beyond the road's edge
//                   while over a stretch where the human was on the ground:
//                   over an open edge, or outside the barriers
//     'time limit'  `maxTicks` reached (default: twice the human's lap time)
import { writeFileSync, mkdirSync } from 'node:fs';
import { Env, loadTrack } from '../sim/env.mjs';
import { decodeState } from '../sim/state.mjs';
import { readFileSync } from 'node:fs';
import { loadHumanLap } from '../sim/drive.mjs';
import { buildLine, nearestIndex, SPACING } from '../sim/line.mjs';
import { rotate } from '../sim/track.mjs';
import { buildTrackMesh, clearanceProfile, MAX_CLEARANCE } from '../sim/trackmesh.mjs';
import { decodeRecording, toDense } from '../sim/recording.mjs';

// ---- actions ---------------------------------------------------------------

export const NUM_ACTIONS = 12;

/** Action number -> the keys to hold (see the table at the top). */
export function actionToControls(action) {
  const steer = action % 3;
  return { up: Math.floor(action / 3) % 2 === 1, down: action >= 6, left: steer === 1, right: steer === 2, reset: false };
}

/** Keys -> action number. Used to drive this environment from a hand-written
 *  controller (rl/smoke_test.mjs) and to label human laps (demo()). Left wins
 *  if both steering keys are pressed. */
export function controlsToAction(c) {
  return (c.left ? 1 : c.right ? 2 : 0) + (c.up ? 3 : 0) + (c.down ? 6 : 0);
}

// ---- observation layout ----------------------------------------------------

/** How many reference-line points ahead the agent sees. */
export const LOOKAHEAD_POINTS = 20;
/** Length of the observation vector: 21 car numbers + 3 per point + 1 speed per point. */
/** Numbers describing what the human was doing at one line point: forward
 *  (3), up (3), keys (3). */
const REF_NUMBERS = 9;
/** Where the reference's "what the human was doing" block starts. */
const OBS_REF = 21 + 4 * LOOKAHEAD_POINTS + 3 + 2 * LOOKAHEAD_POINTS + 2;
/** Where the ray distances start (see RAYS at the top). */
const OBS_RAYS = OBS_REF + REF_NUMBERS * (1 + LOOKAHEAD_POINTS);
/** Furthest a ray looks, in units. At 300 km/h that is about 1.4 seconds away. */
const RAY_RANGE = 120;
/** Height above the car's origin that the rays start from, so that they pass
 *  over the road surface the car is standing on. */
const RAY_HEIGHT = 0.5;
/** Ray directions in the car's frame (x = left, y = up, z = forward). */
const RAY_DIRECTIONS = (() => {
  const rad = (degrees) => (degrees * Math.PI) / 180;
  const out = [[0, 0, 1]];
  for (const a of [5, 10, 20, 35, 55, 90]) {
    out.push([Math.sin(rad(a)), 0, Math.cos(rad(a))]);   // to the left
    out.push([-Math.sin(rad(a)), 0, Math.cos(rad(a))]);  // to the right
  }
  out.push([0, -1, 0]);
  for (const a of [20, 45]) out.push([0, -Math.sin(rad(a)), Math.cos(rad(a))]);
  return out;
})();
export const OBS_SIZE = OBS_RAYS + RAY_DIRECTIONS.length + 1;
/** S held, and "W and S are read now" (the two entries before that block). */
export const OBS_S_HELD = OBS_REF - 2, OBS_PEDAL_OPEN = OBS_REF - 1;
/** Decisions between the save states an episode leaves behind for ownStart. */
const OWN_SNAPSHOT_EVERY = 100;
/** How many of those are kept (the last 8 seconds of driving). */
const OWN_SNAPSHOTS_KEPT = 8;

// Divisors that bring each quantity to roughly -1..1. Neural networks learn
// badly when one input is around 200 and another around 0.01.
const SPEED_KMH_SCALE = 300;   // km/h; faster than anything on summer1
const VELOCITY_SCALE = 80;     // m/s; 80 m/s = 288 km/h
const SPIN_SCALE = 5;          // rad/s
const STEER_SCALE = 0.45;      // rad; the wheels' limit at low speed is about 0.41
const NEAR_SCALE = 10;         // world units
const CLIP = 3;                // nothing in the observation may exceed +-3
const EDGE_SCALE = 10;         // world units; road-edge distances are divided by this

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
  // The same limit over stretches the human FLEW. A car that takes off slower
  // or faster than the human flies a lower or higher arc and can be far from
  // the line in mid-air yet land on the road. Measured on winter2: attempts
  // cut off at 20 units in the last big jump went on to finish when allowed.
  maxOffLineAir: 60,
  // An episode also ends when the car's centre is this far beyond the road's
  // edge on a stretch where the human was on the ground ('off track').
  edgeMargin: 2,
  // Reward weights (see REWARD above).
  progressReward: 0.1,     // per world unit gained along the line
  paceReward: 1,           // 1: scale progress by our speed / the human's; 0: plain progress
  // Upper limit of that scale. 1 = no extra pay for going faster than the
  // human at this point. It was 1.5 at first, and the agent then arrived at a
  // jump the human brakes for (summer5) 40 km/h too fast and overshot the
  // landing every time. Going faster is still rewarded by the time bonus.
  paceCap: 1,
  contactPenalty: 0.1,     // per step, times the share of its ticks with body contact
  impulsePenalty: 0.05,    // per step, times log10(1 + summed contact impulse)
  pedalTogglePenalty: 0.05,  // per press or release of W or S
  steerTogglePenalty: 0.02,  // per change of the steering choice (0.005 at first:
                             // too cheap, the agent changed it 30 to 40 times a
                             // second and weaved down every straight)
  // Which human lap is the reference (the line, speeds, orientation and keys
  // the agent is shown and scored against).
  //   refLap   -1: the track's standard lap (sim/drive.mjs loadHumanLap), as
  //            before. 0..9: that lap of data/laps/<track>.json (0 = fastest).
  //   refLaps  n > 0: training mode. Every refEvery episodes, switch to a
  //            random one of the first n laps of data/laps/<track>.json.
  //            Different players take different lines and brake in different
  //            places, so an agent trained this way has to FOLLOW whichever
  //            reference it is given, instead of memorising one lap. That is
  //            what makes it usable as the follower for an improved reference.
  refLap: -1,
  refLaps: 0,
  refEvery: 25,
  // W and S are read only on every pedalEvery-th decision of an episode and
  // held in between (see HOLDING KEYS at the top). 1 = read on every decision.
  pedalEvery: 5,
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
  // After an episode that ended in a crash, the probability that the next
  // one starts from the agent's OWN state a few seconds before that crash,
  // instead of from the start line or from the human's lap. 0 = never.
  // Why: starts taken from the human's lap hand the agent the human's speed
  // and position, which makes every trouble spot easier than it is in a real
  // lap (the human arrives at a jump fast enough; the agent, having scraped a
  // wall on the way, does not). Restarting from its own earlier state makes
  // it solve the situation it actually got itself into.
  ownStart: 0,
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

    renv.mesh = buildTrackMesh(renv.track.trackData);
    renv.maxTicksOption = cfg.maxTicks;   // null unless the caller fixed it
    renv.references = new Map();          // lap number -> everything built from that lap
    renv.rng = makeRng(cfg.seed);
    await renv.setReference(cfg.refLaps > 0 ? Math.floor(renv.rng() * cfg.refLaps) : cfg.refLap);
    renv.done = true; // step() is refused until reset() has been called
    return renv;
  }

  /**
   * Choose which human lap is the reference: -1 for the track's standard lap,
   * or 0..9 for that lap of data/laps/<track>.json.
   *
   * Everything that depends on the reference is built here, the first time a
   * lap is asked for, and kept for later:
   *   human             { frames, recording }
   *   line              the lap's trajectory (sim/line.mjs)
   *   humanIndexAtTick  for every tick of the lap, the line point reached
   *   clearance         room beside each line point (sim/trackmesh.mjs)
   *   lineLeft/Fwd/Up   the human car's left, forward and up directions there
   *   refW, refS, refSteer   the keys the human held at each line point:
   *                     share of the ticks spent at that point with W down,
   *                     with S down, and (left share minus right share)
   *   humanControls     the human's keys on every tick
   * The ladder of save states belongs to one reference and is rebuilt on the
   * next reset().
   */
  async setReference(lapNumber) {
    let ref = this.references.get(lapNumber);
    if (!ref) {
      let human;
      if (lapNumber < 0) human = loadHumanLap(this.cfg.track);
      else {
        human = JSON.parse(readFileSync(new URL(`../data/laps/${this.cfg.track}.json`, import.meta.url), 'utf8'))[lapNumber];
        if (!human) throw new Error(`no lap ${lapNumber} for ${this.cfg.track}`);
      }
      // Replay the lap once. Its trajectory becomes the reference line (as in
      // sim/drive.mjs). This replaces the simulator's car, so any save states
      // are gone; the ladder is rebuilt below.
      const run = await this.env.replay(this.track, human.recording, human.frames + 100);
      const line = buildLine(run.states);
      const humanIndexAtTick = new Int32Array(run.states.length);
      for (let t = 0, index = 0; t < run.states.length; t++) {
        // The car moves a few centimetres per tick, so checking every 20th
        // tick is plenty to keep `index` within the forward search window.
        if (t % 20 === 0) index = nearestIndex(line, decodeState(run.states[t]).position, index).index;
        humanIndexAtTick[t] = index;
      }
      const humanControls = toDense(decodeRecording(human.recording), human.frames);
      // Keys per line point: average over the ticks the human spent there.
      const count = line.points.length;
      const refW = new Float32Array(count), refS = new Float32Array(count), refSteer = new Float32Array(count);
      const ticksAt = new Int32Array(count);
      for (let t = 0; t < humanControls.length; t++) {
        const k = humanIndexAtTick[t], c = humanControls[t];
        ticksAt[k]++;
        if (c.up) refW[k]++;
        if (c.down) refS[k]++;
        refSteer[k] += (c.left ? 1 : 0) - (c.right ? 1 : 0);
      }
      for (let k = 0; k < count; k++) {
        if (ticksAt[k]) { refW[k] /= ticksAt[k]; refS[k] /= ticksAt[k]; refSteer[k] /= ticksAt[k]; }
        // A point no tick was assigned to (the table above advances in small
        // jumps): the keys there are those of the point before.
        else if (k > 0) { refW[k] = refW[k - 1]; refS[k] = refS[k - 1]; refSteer[k] = refSteer[k - 1]; }
      }
      ref = {
        human, line, humanIndexAtTick, humanControls, refW, refS, refSteer,
        clearance: clearanceProfile(this.mesh, line),
        lineLeft: line.quaternions.map((q) => rotate([1, 0, 0], q)),
        lineUp: line.quaternions.map((q) => rotate([0, 1, 0], q)),
        lineFwd: line.quaternions.map((q) => rotate([0, 0, 1], q)),
      };
      this.references.set(lapNumber, ref);
    }
    Object.assign(this, ref);
    this.refLap = lapNumber;
    this.cfg.maxTicks = this.maxTicksOption ?? 2 * ref.human.frames;
    // Things tied to the previous reference: its save states (the replay
    // above may also have replaced the car they belonged to), the agent's own
    // states, and the crash sites, which are line positions of the old line.
    this.ladder = null;
    this.ownStates = [];
    this.failures = [];
    this.lastCrashTick = null;
    this.episodesOnReference = 0;
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
    // Body contact during these ticks: on how many of them, and how hard in
    // total. A sliding scrape often reports contacts with zero impulse, which
    // is why the tick count is kept as well as the impulse sum.
    this.contactTicks = 0;
    this.contactImpulse = 0;
    for (let k = 0; k < n; k++) {
      const impulses = k === n - 1 ? newest.collisionImpulses : decodeState(states[k]).collisionImpulses;
      if (!impulses.length) continue;
      this.contactTicks++;
      for (const impulse of impulses) this.contactImpulse += Math.abs(impulse);
    }
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
    this.ownStates ??= [];
    this.ownRestarts ??= 0;   // own-state restarts in a row since the last fresh start
    this.decisions = 0;
    // Training mode (refLaps): after refEvery episodes, a different human lap
    // becomes the reference.
    if (this.cfg.refLaps > 0 && startFraction == null && ++this.episodesOnReference > this.cfg.refEvery) {
      await this.setReference(Math.floor(this.rng() * this.cfg.refLaps));
    }

    // ownStart: straight after a crash, sometimes go back to the agent's own
    // state a few seconds earlier instead of starting somewhere fresh.
    // Not more than 3 times in a row from one crash site: an own state can be
    // a lost cause (too slow for the jump ahead whatever is done next), and
    // then the practice has to come from an earlier point or a different start.
    const crashTick = this.lastCrashTick;
    this.lastCrashTick = null;
    if (startFraction == null && crashTick != null && this.ownStates.length && this.ownRestarts < 3 && this.rng() < this.cfg.ownStart) {
      // Aim 2 to 6 seconds before the crash; take the latest kept state at or
      // before that, or the oldest one if the episode was shorter than that.
      const aim = crashTick - (2000 + 4000 * this.rng());
      let pick = 0;
      for (let k = 0; k < this.ownStates.length; k++) if (this.ownStates[k].tick <= aim) pick = k;
      const own = this.ownStates[pick];
      // States after the chosen one belong to a future that is being abandoned.
      for (const later of this.ownStates.splice(pick + 1)) this.env.dropState(later.handle);
      await this.env.loadState(own.handle);
      this.state = own.state;
      this.older = own.older;
      this.controlsPerTick.length = own.controlsLength; // the keys up to that moment are still the same lap
      this.previousAction = own.previousAction;
      this.progressIndex = Math.max(0, own.progressIndex - 5);
      this.ownRestarts++;
      return this._beginEpisode();
    }
    // Any other start begins a new lap: forget the old lap's own states.
    for (const old of this.ownStates.splice(0)) this.env.dropState(old.handle);
    this.ownRestarts = 0;
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
    // Keys held before the first decision: none on the start line; part-way
    // round, whatever the human was holding on the tick before the hand-over
    // (so that simply keeping W down is not charged as a key press).
    this.previousAction = startTick === 0 ? 0 : controlsToAction(this.humanControls[startTick - 1] ?? {});

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

    return this._beginEpisode();
  }

  /** Common end of every kind of start: reset the per-episode counters and
   *  return the first observation. */
  _beginEpisode() {
    this.contactTicks = 0;
    this.contactImpulse = 0;
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
   * Leave a save state of the current moment behind (for ownStart), together
   * with the bookkeeping that goes with it. Stored as a difference from the
   * ladder's full copy, like the ladder's own rungs, and for the same car.
   */
  async _rememberOwnState() {
    this.ownStates.push({
      handle: await this.env.saveState(this.ladder.base),
      tick: this.state.frames,
      state: this.state,
      older: this.older,
      controlsLength: this.controlsPerTick.length,
      previousAction: this.previousAction,
      progressIndex: this.progressIndex,
    });
    if (this.ownStates.length > OWN_SNAPSHOTS_KEPT) this.env.dropState(this.ownStates.shift().handle);
  }

  /**
   * Replay the human's keys for ticks [from, to), one step() call per run of
   * ticks with the same keys held.
   */
  async _replayHuman(from, to, keys = this.humanControls) {
    for (let t = from; t < to;) {
      let n = 1;
      while (t + n < to && controlsKey(keys[t + n]) === controlsKey(keys[t])) n++;
      await this._advance(keys[t], n);
      t += n;
    }
  }

  /**
   * Drive a HUMAN lap through this environment and record, at every decision
   * point, what the agent would have seen and which action the human's keys
   * amount to. Used to teach a new network by imitation before it practises
   * on its own (rl/pretrain_bc.py).
   *
   *   lap   { frames, recording } as in data/laps/<track>.json. It does not
   *         have to be the lap the reference line was built from: another
   *         player's lap is seen RELATIVE to that line, a little off it, which
   *         is exactly the kind of situation the agent needs examples of.
   *
   * The car is driven with the human's real keys, tick by tick, so the states
   * are those of the real lap. Only the LABEL is rounded to what an action can
   * express: for steering, whichever of straight/left/right was held for most
   * of the decision's ticks; for W and S, whether the key was down for most of
   * the pedalEvery decisions that the choice will be held for.
   *
   * Recording stops at the finish, or early if the lap strays more than
   * maxOffLine from the reference line (a different route).
   * Returns { obs: Float32Array (count x OBS_SIZE), actions: Uint8Array, count }.
   */
  async demo(lap) {
    const { cfg } = this;
    const keys = toDense(decodeRecording(lap.recording), lap.frames);
    if (!this.ladder || this.env.frames > CAR_TICK_BUDGET) await this._buildLadder();
    for (const old of (this.ownStates ?? []).splice(0)) this.env.dropState(old.handle);
    // The untouched car, then the lap's first tick, so there is a state to observe.
    await this._restore(this.ladder.rungs[0]);
    await this._advance(keys[0] ?? {}, 1);
    this.progressIndex = 0;
    this.contactTicks = 0;
    this.contactImpulse = 0;
    this.previousAction = 0;
    this.decisions = 0;
    this._locate();

    /** Was key `name` down for more than half of ticks [from, to)? */
    const mostly = (name, from, to) => {
      let held = 0;
      const end = Math.min(to, keys.length);
      for (let t = from; t < end; t++) if (keys[t][name]) held++;
      return 2 * held > end - from;
    };
    const obs = [], actions = [];
    for (let t = 1; t + cfg.ticks <= keys.length && this.state.finishFrames == null && this.offLine <= cfg.maxOffLineAir; t += cfg.ticks) {
      const left = mostly('left', t, t + cfg.ticks), right = mostly('right', t, t + cfg.ticks);
      let action = left ? 1 : right ? 2 : 0;
      if (this.decisions % cfg.pedalEvery === 0) {
        const span = cfg.ticks * cfg.pedalEvery;
        action += (mostly('up', t, t + span) ? 3 : 0) + (mostly('down', t, t + span) ? 6 : 0);
      } else {
        action += 3 * Math.floor(this.previousAction / 3); // W and S stay as they are
      }
      obs.push(...this._observe());
      actions.push(action);
      await this._replayHuman(t, t + cfg.ticks, keys);
      this.previousAction = action;
      this.decisions++;
      this._locate();
    }
    this.done = true;          // the next thing must be a reset()
    this.lastCrashTick = null;
    return { obs: Float32Array.from(obs), actions: Uint8Array.from(actions), count: actions.length };
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
    // Free every snapshot taken so far (the previous ladder and the agent's
    // own states). Without this, each rebuild would leave the old ladder's
    // memory behind in the simulator, and with a changing reference the
    // ladder is rebuilt often.
    this.env.dropAllStates();
    this.env.reset(this.track); // a new car; snapshots of the previous car are now useless
    this.ownStates = [];        // including the agent's own (their memory goes with the old car's base)
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

    // Room to the road's edge on each side of the CAR. The clearance table
    // says how far the edges are from the line point; shifting by how far the
    // car is to the left of that point gives the distances from the car.
    // Negative = the car's centre is beyond that edge.
    const lateral = dot(sub(state.position, line.points[near.index]), this.lineLeft[near.index]);
    this.edgeLeft = this.clearance.left[near.index] - lateral;
    this.edgeRight = this.clearance.right[near.index] + lateral;
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

    // [15..16] the keys held during the previous decision: W minus S, and
    // steer in -1, 0, 1. The steering angle lags behind the keys, so the agent
    // needs to know what it last asked for; and it needs to know which keys
    // are down to be able to keep them down.
    const held = actionToControls(this.previousAction);
    obs[o++] = (held.up ? 1 : 0) - (held.down ? 1 : 0);
    obs[o++] = held.left ? 1 : held.right ? -1 : 0;

    // [17..19] nearest line point in the car frame, [20] lap fraction.
    const last = line.points.length - 1;
    for (const v of toCarFrame(sub(line.points[this.progressIndex], state.position), q)) obs[o++] = clip(v / NEAR_SCALE);
    obs[o++] = this.cfg.lapFraction ? this.progress / line.length : 0;

    // [21..80] the line ahead, [81..100] the human's speed at those points.
    // Past the end of the line the last point is repeated.
    const gap = Math.max(cfg.minGap, (state.speedKmh / 3.6) * cfg.gapSeconds);
    const speeds = o + 3 * LOOKAHEAD_POINTS;
    // Where the road-edge numbers go (see the table at the top of the file).
    const EDGE_NOW = 21 + 4 * LOOKAHEAD_POINTS, EDGE_AHEAD = EDGE_NOW + 3;
    for (let k = 1; k <= LOOKAHEAD_POINTS; k++) {
      const index = Math.min(last, this.progressIndex + Math.round((k * gap) / SPACING));
      const local = toCarFrame(sub(line.points[index], state.position), q);
      for (const v of local) obs[o++] = clip(v / (k * gap));
      obs[speeds + k - 1] = line.speedKmh[index] / SPEED_KMH_SCALE;
      // [104..143] room beside the line at this point, left then right.
      obs[EDGE_AHEAD + 2 * (k - 1)] = this.clearance.left[index] / EDGE_SCALE;
      obs[EDGE_AHEAD + 2 * (k - 1) + 1] = this.clearance.right[index] / EDGE_SCALE;
    }
    // [101..102] room to the edge from the car, limited to the range the
    // clearance table itself uses; [103] body contact during the last step.
    const room = (d) => Math.max(-CLIP, Math.min(MAX_CLEARANCE, d) / EDGE_SCALE);
    obs[EDGE_NOW] = room(this.edgeLeft);
    obs[EDGE_NOW + 1] = room(this.edgeRight);
    obs[EDGE_NOW + 2] = this.contactTicks > 0 ? 1 : 0;
    // [144] S held; [145] whether W and S will be read at the coming decision.
    obs[OBS_S_HELD] = held.down ? 1 : 0;
    obs[OBS_PEDAL_OPEN] = this.decisions % cfg.pedalEvery === 0 ? 1 : 0;

    // [146..] what the human was doing at the nearest point and at each of
    // the 20 points ahead: the human car's forward and up directions seen
    // from our car, and the keys held there.
    const describe = (index, at) => {
      const fwd = toCarFrame(this.lineFwd[index], q), up = toCarFrame(this.lineUp[index], q);
      obs[at] = fwd[0]; obs[at + 1] = fwd[1]; obs[at + 2] = fwd[2];
      obs[at + 3] = up[0]; obs[at + 4] = up[1]; obs[at + 5] = up[2];
      obs[at + 6] = this.refW[index]; obs[at + 7] = this.refS[index]; obs[at + 8] = this.refSteer[index];
    };
    describe(this.progressIndex, OBS_REF);
    for (let k = 1; k <= LOOKAHEAD_POINTS; k++) {
      describe(Math.min(last, this.progressIndex + Math.round((k * gap) / SPACING)), OBS_REF + REF_NUMBERS * k);
    }

    // [335..] rays from the car (see RAYS at the top of the file).
    const carUp = rotate([0, 1, 0], q);
    const eye = [state.position[0] + carUp[0] * RAY_HEIGHT, state.position[1] + carUp[1] * RAY_HEIGHT, state.position[2] + carUp[2] * RAY_HEIGHT];
    const reading = (direction) => Math.sqrt(Math.min(RAY_RANGE, this.mesh.raycastFar(eye, direction, RAY_RANGE)) / RAY_RANGE);
    for (let k = 0; k < RAY_DIRECTIONS.length; k++) obs[OBS_RAYS + k] = reading(rotate(RAY_DIRECTIONS[k], q));
    obs[OBS_RAYS + RAY_DIRECTIONS.length] = reading([0, -1, 0]);
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

    // Between pedal decisions, W and S stay as they were whatever was asked
    // for (see HOLDING KEYS at the top); only the steering part is taken.
    const previous = this.previousAction;
    if (this.decisions % cfg.pedalEvery !== 0) action = (action % 3) + 3 * Math.floor(previous / 3);
    // Key changes against the previous decision, for the toggle cost below.
    const was = actionToControls(previous), now = actionToControls(action);
    const pedalChanges = (was.up !== now.up ? 1 : 0) + (was.down !== now.down ? 1 : 0);
    const steerChanged = action % 3 !== previous % 3;

    const before = this.progress;
    await this._advance(now, cfg.ticks);
    this.previousAction = action;
    this._locate();
    const s = this.state;

    // Reward for the ground gained this step (negative if the car slid back),
    // scaled by pace: our speed against the human's at this point of the line.
    // The human's speed is floored at 30 km/h so the first metres off the
    // start line, where the human was nearly stationary, do not blow up.
    const pace = cfg.paceReward ? Math.max(0, Math.min(cfg.paceCap, s.speedKmh / Math.max(30, this.line.speedKmh[this.progressIndex]))) : 1;
    let reward = cfg.progressReward * (this.progress - before) * pace;
    // Penalty for touching anything with the body during this step.
    if (this.contactTicks > 0) {
      reward -= cfg.contactPenalty * (this.contactTicks / cfg.ticks) + cfg.impulsePenalty * Math.log10(1 + this.contactImpulse);
    }

    // The cost of pressing and releasing keys.
    reward -= cfg.pedalTogglePenalty * pedalChanges + (steerChanged ? cfg.steerTogglePenalty : 0);

    // Stall clock: restart it whenever the car has gained a full unit.
    if (this.progress >= this.stallProgress + 1) { this.stallProgress = this.progress; this.stallTick = s.frames; }

    let reason = null;
    if (s.finishFrames != null) {
      reason = 'finished';
      // Top the progress reward up to the full line so it is the same for
      // every finished lap, then add the bonus that depends only on the time.
      reward += cfg.progressReward * (this.line.length - this.progress);
      reward += cfg.finishBonus + cfg.timeBonusPerSecond * Math.max(0, cfg.maxTicks - s.finishFrames) / 1000;
    } else if (this.offLine > (this.line.grounded[this.progressIndex] ? cfg.maxOffLine : cfg.maxOffLineAir)) reason = 'off line';
    // Beyond the road's edge. Only judged where the human was on the ground:
    // in the air there is no road to be beside.
    else if (this.line.grounded[this.progressIndex] && Math.min(this.edgeLeft, this.edgeRight) < -cfg.edgeMargin) reason = 'off track';
    else if (s.frames - this.stallTick > cfg.stallTicks) reason = 'stalled';
    else if (s.frames >= cfg.maxTicks) reason = 'time limit';

    this.done = reason != null;
    this.episodeReward += reward;
    // Remember where the car came to grief, for failureStart (see reset()).
    // Running out of time is not a crash, so it is not recorded. Keep the
    // last 40, so the list follows the agent as it gets past old trouble spots.
    const crashed = reason === 'off line' || reason === 'stalled' || reason === 'off track';
    if (crashed) {
      this.failures ??= [];
      this.failures.push(this.progressIndex);
      if (this.failures.length > 40) this.failures.shift();
    }
    // For ownStart: note how the episode ended, and while it runs leave a
    // save state behind every OWN_SNAPSHOT_EVERY decisions.
    this.lastCrashTick = crashed ? s.frames : null;
    this.decisions++;
    if (cfg.ownStart > 0 && !this.done && this.decisions % OWN_SNAPSHOT_EVERY === 0) await this._rememberOwnState();
    return {
      obs: this._observe(),
      reward,
      action, // the keys actually held (W and S may differ from what was asked)
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
  save(run = 'rl', { unfinished = false } = {}) {
    // Normally only a finished lap is saved. With `unfinished`, an attempt
    // that crashed is saved too, up to the tick it ended on, so that it can be
    // watched in the game to see where and how it went wrong. Such a file is
    // marked finished: false, and the exporter does not run Verify on it.
    const finished = this.state?.finishFrames != null;
    if (!finished && !unfinished) throw new Error('nothing to save: the last episode did not finish');
    const finishFrames = finished ? this.state.finishFrames : this.state.frames;
    if (!/^[A-Za-z0-9_-]+$/.test(run)) throw new Error('run name may only contain letters, digits, "_" and "-"');
    const dir = new URL('../runs/', import.meta.url);
    mkdirSync(dir, { recursive: true });
    const file = `${run}_${this.cfg.track}.json`;
    writeFileSync(new URL(file, dir), JSON.stringify({
      track: this.cfg.track,
      finishFrames,
      finished,
      // The finish can land mid-decision; keep only the ticks up to it.
      controlsPerTick: this.controlsPerTick.slice(0, finishFrames),
    }));
    return `runs/${file}`;
  }

  close() { return this.env.close(); }
}
