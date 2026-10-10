// Rollouts in the TRAINING environment (rl/racing_env.mjs) with block
// decisions: the pieces rl/rollout_child.mjs is built from, as functions, so a
// new search (beam, lookahead, explore) can write its own loop or its own
// pool child without copying that file.
//
//   const renv = await openBlockEnv('desert4');
//   let obs = await fromStart(renv);                       // start line
//   let r = await roll(renv, obs, { explicit: lapDecisions.slice(0, 100) });
//   const mark = await renv.mark();                        // save state + bookkeeping
//   r = await roll(renv, r.obs, { policy, horizon: 40 });  // policy drives 2 s
//   ({ obs } = await renv.rewind(mark));                   // back to the mark
//   renv.dropMark(mark);
//
// mark / rewind / dropMark are RacingEnv's own (MARK AND REWIND in
// racing_env.mjs); nothing here wraps them.
//
// This environment needs a reference lap (the human's by default): the
// observation, renv.progress and the 'off line' cut-off are all measured
// against it. For a rollout with no reference at all use sim_session.mjs.
import { RacingEnv } from '../../rl/racing_env.mjs';

/** The environment as every block checkpoint so far was trained and is
 *  tested (rl/evaluate.py, scripts/search_rollout.mjs): 10 ms steps, 5 per
 *  decision, no lap-fraction input. maxOffLine 40 is what the search and the
 *  search rounds use (the trainer's default is 20). */
export const BLOCK_ENV = { ticks: 10, block: 5, pedalEvery: 5, lapFraction: 0, maxOffLine: 40 };

/** See CAR_TICK_BUDGET in racing_env.mjs: one car can be stepped about 6
 *  million ticks in total, save-state restores included. */
const CAR_TICK_BUDGET = 4_500_000;

/**
 * Boot a simulator with the training environment on `track`. `extra`
 * overrides BLOCK_ENV / DEFAULTS of racing_env.mjs, e.g. { refLap: 3 } or
 * { refFile: 'runs/x_desert4.recording.json' } for another reference.
 * Takes 1 to 2 s (boots the simulator, replays the reference, casts the
 * clearance rays).
 */
export const openBlockEnv = (track, extra = {}) => RacingEnv.create({ track, ...BLOCK_ENV, ...extra });

/** True when the car is nearly used up. The next fromStart() then builds a
 *  new car, which kills every mark; finish with your marks first. */
export const needsFreshCar = (renv) => renv.env.frames > CAR_TICK_BUDGET;

/**
 * Put the car on the start line (one empty tick in, as every episode from
 * the start begins) and return the first observation. The first call builds
 * the environment's ladder of save states along the reference lap (about
 * 1 s); later calls restore a save state (a few ms).
 */
export async function fromStart(renv) {
  if (needsFreshCar(renv)) renv.ladder = null;
  return (await renv.reset({ startFraction: 0 })).obs;
}

/**
 * Drive on from where the environment is now, for up to `horizon` decisions.
 *
 *   obs          the current observation (from fromStart, rewind, or a
 *                previous roll). Only needed when the policy chooses.
 *   explicit     decisions to drive as given; entry k may be null to let the
 *                policy choose decision k
 *   policy       from policy.mjs loadPolicy; chooses wherever explicit has
 *                nothing
 *   horizon      how many decisions at most (default: explicit.length)
 *   sampleUntil  the policy samples for decisions k < sampleUntil (needs
 *                rng) and takes its top choice from there on
 *   rng, temperature   for the sampling
 *
 * Returns { decisions, obs, done, finished, finishFrames, reason, reward,
 *           progress, speed, tick }:
 *   decisions     the decisions actually driven
 *   obs           observation for the next decision
 *   done          the episode ended (finished or cut off); rewind or
 *                 fromStart before driving again
 *   reason        null | 'finished' | 'stalled' | 'off line' | 'off track' | 'time limit'
 *   finishFrames  lap time in ms if finished
 *   reward        summed training reward of this stretch
 *   progress      distance along the REFERENCE line, world units (about metres)
 *   speed         units per second
 *   tick          lap clock, ms
 */
export async function roll(renv, obs, { explicit = [], policy = null, horizon = explicit.length, sampleUntil = 0, rng = null, temperature = 1 } = {}) {
  const decisions = [];
  let r = null, reward = 0;
  for (let k = 0; k < horizon; k++) {
    let decision = explicit[k];
    if (!decision) {
      if (!policy) throw new Error(`roll: no decision ${k} given and no policy to choose one`);
      decision = policy.decide(obs, k < sampleUntil ? rng : null, temperature);
    }
    decisions.push(decision);
    r = await renv.stepBlock(decision);
    reward += r.reward;
    obs = r.obs;
    if (r.terminated || r.truncated) break;
  }
  const info = r?.info ?? renv._info(null);
  return {
    decisions, obs, reward,
    done: !!r && (r.terminated || r.truncated),
    finished: info.reason === 'finished', finishFrames: info.finishFrames, reason: info.reason,
    // renv.progress, not info.progress: the info copy is rounded to 0.01 units.
    progress: renv.progress, speed: info.speedKmh / 3.6, tick: info.frames,
  };
}
