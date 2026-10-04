// Pure-pursuit baseline controller.
//
// Stage 2, step 2. This is a hand-written driver, not ML. Its job is to give
// us a lap that finishes, as a baseline to measure later work against.
//
// Each decision it does three things:
//   1. Find where the car is along the reference line (sim/line.mjs).
//   2. STEER: pick a "lookahead" point further along the line and work out the
//      front-wheel angle that would carry the car through it on a circular
//      arc. That is the classic pure-pursuit rule. Then press left or right to
//      move the wheels toward that angle.
//   3. SPEED: compare our speed with the human's at the same place on the
//      line. Hold throttle if we are slower, coast or brake if we are faster.
//      The effect is that the car slows where the human slowed and nowhere else.
//      Optionally hold brake in the air to land flat (airBrake).
//
// Facts about the car this relies on (measured in the simulator, see the
// README's notes):
//   - The car's local +z axis points forward and its local +x axis points to
//     its LEFT. So a target with positive local x is to the left.
//   - The state's `steering` value is the front-wheel angle in radians,
//     positive = left. It cannot be set directly: holding a key ramps it toward
//     a limit, and that limit shrinks as speed rises (about 0.41 rad when slow,
//     about 0.1 rad at 120 km/h).
import { rotate } from './track.mjs';
import { nearestIndex, indexAhead } from './line.mjs';

/** Tunable numbers. Distances in world units (about metres), speeds in km/h. */
export const DEFAULTS = {
  // --- steering ---
  // Lookahead distance = lookaheadMin + lookaheadPerKmh * speed. Too short and
  // the car twitches and oscillates around the line; too long and it cuts
  // corners. It grows with speed because at speed the car covers more ground
  // before a steering change takes effect.
  lookaheadMin: 6,
  lookaheadPerKmh: 0.09,
  // Distance between front and rear axles used in the pure-pursuit formula.
  // The true value is inside the game's compiled physics; this is a fitted
  // stand-in. Larger = steers harder for the same target.
  wheelbase: 3,
  // Don't press a steering key if the wheels are already within this many
  // radians of the angle we want. Stops left/right chatter on straights.
  steerDeadband: 0.004,
  // Strength of the cross-track correction (see the steering code below):
  // how hard to steer back toward the line for each unit of sideways error.
  // 0 switches it off, which is plain pure pursuit.
  crossTrackGain: 0,

  // --- speed ---
  // The speed target is the human's slowest speed between here and this far
  // ahead on the line, in seconds of travel. A short lead makes braking start
  // a touch early, covering the delay before the brakes bite. It must stay
  // short: the human also slows down when climbing a hill at full throttle,
  // and a long lead mistakes that for braking and slows the car before the
  // hill, which then cannot be climbed. (0.2 s already fails on summer1.)
  brakeLookaheadSeconds: 0.1,
  // Fraction of the human's speed to aim for. Kept at 1 because the jumps and
  // climbs on the line need the human's full entry speed; at 0.9 the car lands
  // short on summer1's first jump.
  speedFactor: 1,
  // Optional per-section multipliers on top of speedFactor. The lap is cut
  // into speedFactors.length equal stretches of the line and each stretch uses
  // its own entry, so the car can be told "carry more speed here, less there".
  // null = no per-section adjustment. This is what scripts/search_settings.mjs
  // tunes.
  speedFactors: null,
  // How far above the target speed the car must be before it brakes. Between
  // the target and target + margin it coasts (no throttle, no brake) instead.
  // At 0 the car is always either on the throttle or on the brake, which
  // wastes time: a brake dab scrubs far more speed than was needed.
  brakeMarginKmh: 0,
  // Hold the brake key while airborne (1 = yes, 0 = no). Players do this on
  // jumps: it makes the car land flat instead of on its nose.
  airBrake: 0,
  // Never aim below this, so the car cannot talk itself into stopping.
  minTargetKmh: 40,
};

/** Reverse of `rotate`: world-space vector -> the car's local frame. */
function toCarFrame(v, quaternion) {
  const [x, y, z, w] = quaternion;
  return rotate(v, [-x, -y, -z, w]); // conjugate = inverse for a unit quaternion
}

/**
 * Create a controller for one lap. It keeps one piece of memory between
 * decisions: `progress`, the index of the line point the car has reached.
 *
 *   const drive = createController(line);
 *   const { controls, progress, offLine } = drive(decodedState);
 */
export function createController(line, options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  let progress = 0;

  return function decide(state) {
    // 1. Where are we on the line? (Search forward only; see nearestIndex.)
    const near = nearestIndex(line, state.position, progress);
    progress = near.index;

    // 2. Steering.
    const lookahead = cfg.lookaheadMin + cfg.lookaheadPerKmh * state.speedKmh;
    const target = line.points[indexAhead(line, progress, lookahead)];
    // Vector from car to target, expressed in the car's own frame:
    // local[0] = how far to the left, local[2] = how far ahead.
    const local = toCarFrame(target.map((v, k) => v - state.position[k]), state.quaternion);
    const left = local[0], ahead = local[2];
    const reach = Math.hypot(left, ahead) || 1e-6; // straight-line distance, ignoring height
    // Pure pursuit: the arc through a point `reach` away and `left` to the
    // side has curvature 2*left/reach^2, and a car with wheelbase W follows an
    // arc of curvature k when its front wheels are turned by atan(W * k).
    let wantedAngle = Math.atan(cfg.wheelbase * (2 * left) / (reach * reach));
    // Cross-track correction. Pure pursuit alone barely reacts to being a
    // little to one side of the line: at 300 km/h the lookahead is about 33
    // units, and a 1-unit sideways error at that distance asks for only 0.005
    // rad of steering, about the size of the deadband. So the car drifts along
    // roughly 1 unit beside the line, which is enough to clip the edge of a
    // ramp (summer1) or hit an obstacle beside a narrow gap (winter1).
    // This term steers toward the line in proportion to the sideways error
    // right now, divided by speed so it does not over-react when fast (the
    // "Stanley" rule). The +5 keeps it finite at a standstill.
    if (cfg.crossTrackGain) {
      const here = toCarFrame(line.points[progress].map((v, k) => v - state.position[k]), state.quaternion);
      const sideways = here[0]; // positive: the line is to our left
      wantedAngle += Math.atan((cfg.crossTrackGain * sideways) / (state.speedKmh / 3.6 + 5));
    }
    const steerError = wantedAngle - state.steering; // positive: need more left
    const pressLeft = steerError > cfg.steerDeadband;
    const pressRight = steerError < -cfg.steerDeadband;

    // 3. Speed.
    const metresPerSecond = state.speedKmh / 3.6;
    const brakeIndex = indexAhead(line, progress, metresPerSecond * cfg.brakeLookaheadSeconds);
    // Take the slowest human speed between here and the brake point, so a slow
    // corner that falls between two samples is not skipped over.
    // Points where the human was airborne are ignored: a car in the air loses
    // speed to drag, and treating that as a target made the controller brake
    // before a jump and land short. Only speeds the human chose on the road count.
    let humanKmh = Infinity;
    for (let k = progress; k <= brakeIndex; k++) {
      if (line.grounded[k]) humanKmh = Math.min(humanKmh, line.speedKmh[k]);
    }
    // Which section of the lap are we in, and what is its multiplier?
    let factor = cfg.speedFactor;
    if (cfg.speedFactors) {
      const section = Math.min(cfg.speedFactors.length - 1, Math.floor((progress / line.points.length) * cfg.speedFactors.length));
      factor *= cfg.speedFactors[section];
    }
    const targetKmh = Math.max(cfg.minTargetKmh, humanKmh * factor);
    // Three cases: below target -> throttle; a little above -> coast;
    // well above -> brake. Braking only works with wheels on the road, so in
    // the air the car just keeps the throttle down.
    const airborne = !state.wheelContact.some(Boolean);
    const over = state.speedKmh - targetKmh;
    let brake = !airborne && over > cfg.brakeMarginKmh;
    let throttle = airborne || over <= 0;
    // In the air the brake key does not slow the car; it changes how the car
    // rotates, so that it lands flatter instead of nose first (a technique
    // players use on jumps). With airBrake on, hold brake for the whole flight.
    if (airborne && cfg.airBrake) { brake = true; throttle = false; }

    return {
      controls: { up: throttle, down: brake, left: pressLeft, right: pressRight, reset: false },
      progress,              // index into line.points
      offLine: near.distance, // how far the car is from the line, for diagnostics
    };
  };
}
