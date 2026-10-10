// LOOK AHEAD WHILE DRIVING.
//
// A trained policy normally commits to its choice at every decision. Here the
// driver stops every `every` decisions, saves the simulator, drives several
// different continuations `horizon` decisions into the future, puts the
// simulator back, and commits to the first `every` decisions of the best one.
// The simulator is exact and has save states, so this is planning with a
// perfect model: a continuation that crashes in the try-out would have crashed
// for real, and one that does not, will not (for as far as it was driven).
//
// What it is for: tracks the policy was not trained on. The generalist there
// typically ends its lap in one obstacle it could see coming. Trying a few
// alternatives and throwing away the ones that crash gets it past those.
//
//   const renv = await openBlockEnv('winter4');
//   const policy = loadPolicy('rl/checkpoints/ppo_blkgen.best2.actor.bin');
//   const lap = await driveLap(renv, policy, { mode: 'lazy' });
//   lap.finished, lap.finishFrames, lap.decisions, lap.simTicks
//
// Three modes:
//   'plain'  no lookahead: the policy drives (the baseline to compare with)
//   'lazy'   at every replan, try the policy's own top choices first; only if
//            THAT continuation fails, try the alternatives. Costs about
//            horizon / every + 1 times a plain lap where nothing goes wrong.
//   'full'   at every replan, try all continuations and take the best by score.
//            Costs (number of continuations) x horizon / every times a lap.
//
// Everything is in block decisions, [steer, steerAt, w, wAt, s, sAt], one per
// 50 ms (BLOCK DECISIONS in rl/racing_env.mjs). The measured numbers that set
// the defaults are in README.md next to this file.
//
// Local use only: nothing here contacts Kodub's servers.
import { fromStart, needsFreshCar } from '../shared/block_rollout.mjs';
import { createRng } from '../shared/policy.mjs';

/** The critic's discount per decision (rl/train_ppo.py; see policy.mjs). */
const GAMMA = 0.995;

export const DEFAULTS = {
  mode: 'lazy',
  // Decisions driven in each try-out. 40 = 2 s. It has to be longer than the
  // time between "too late to avoid" and the impact, and long enough for the
  // wreck to show (see `failed` below).
  horizon: 40,
  // Decisions committed between replans. 10 = 0.5 s.
  every: 10,
  // Forced alternatives: each of {no steering, left, right} x {W, nothing, S}
  // held for this many decisions, then the policy's top choices. One list
  // entry per hold length; '4,10' gives 2 x 9 = 18 alternatives.
  force: [4, 10],
  // Policy samples: this many continuations with the policy's usual
  // randomness for the first `sampleFor` decisions, top choices after.
  samples: 6,
  sampleFor: 20,
  temperature: 1,
  // How survivors are ranked: 'progress' (distance along the reference line
  // at the horizon), 'reward' (summed training reward over the try-out) or
  // 'value' (discounted reward + the critic's estimate at the horizon; needs
  // `value`, from policy.mjs loadValue).
  score: 'reward',
  value: null,
  // A try-out also counts as failed if it ends slower than this share of the
  // reference lap's speed at that place. The environment only says 'stalled'
  // after 2 s without progress, so a car that hit a wall 1 s before the
  // horizon is still "running" at the horizon; its speed gives it away.
  slowShare: 0.4,
  // Backing up out of a dead end (see DEAD END in driveLap): how many replan
  // points back the driver may go (6 x every = 3 s), and how many times per lap.
  back: 6,
  maxBackups: 30,
  // 'plain' mode only: sample the policy (as rl/evaluate.py --policy sample
  // does, and as the generalist's 7-of-30 was measured) instead of top choices.
  sample: false,
  seed: 1,
};

/**
 * Drive on from the environment's current state for up to `horizon`
 * decisions. Decision k is explicit[k] if given, else the policy's: sampled
 * while k < sampleUntil, its top choice after. Like shared roll(), plus what
 * the scoring needs: discounted reward, contact, and the final observation.
 */
async function tryOut(renv, obs, policy, { explicit = [], horizon, sampleUntil = 0, rng = null, temperature = 1 }) {
  const decisions = [];
  let reward = 0, discounted = 0, weight = 1, contact = 0, reason = null;
  for (let k = 0; k < horizon; k++) {
    const decision = explicit[k] ?? policy.decide(obs, k < sampleUntil ? rng : null, temperature);
    decisions.push(decision);
    const r = await renv.stepBlock(decision);
    reward += r.reward;
    discounted += weight * r.reward;
    weight *= GAMMA;
    if (renv.contactTicks > 0) contact++;   // body contact in the block's last 10 ms slice
    obs = r.obs;
    if (r.terminated || r.truncated) { reason = r.info.reason; break; }
  }
  return {
    decisions, obs, reward, discounted, weight, contact, reason,
    finished: reason === 'finished',
    finishFrames: renv.state.finishFrames,
    progress: renv.progress,
    speedKmh: renv.state.speedKmh,
    // The reference lap's speed where the car is now (for `slowShare`).
    refSpeedKmh: renv.line.speedKmh[renv.progressIndex],
    tick: renv.state.frames,
  };
}

/** The continuations to try besides the policy's own top choices. */
function alternatives(cfg, rng) {
  const out = [];
  for (const hold of cfg.force) {
    for (const steer of [0, 1, 2]) {
      for (const [w, s] of [[1, 0], [0, 0], [0, 1]]) {
        // Switch slices 0: the forced keys go down at once.
        out.push({ label: `force s${steer} w${w} s${s} x${hold}`, explicit: Array.from({ length: hold }, () => [steer, 0, w, 0, s, 0]) });
      }
    }
  }
  for (let k = 0; k < cfg.samples; k++) {
    out.push({ label: `sample ${k}`, sampleUntil: cfg.sampleFor, rng: createRng(Math.floor(rng() * 2 ** 31)), temperature: cfg.temperature });
  }
  return out;
}

/**
 * One lap from the start line. `renv` from openBlockEnv, `policy` from
 * loadPolicy, `options` override DEFAULTS.
 *
 * Returns {
 *   decisions      everything committed, from the start line
 *   finished, finishFrames, reason     how the lap ended ('finished', 'stalled', ...)
 *   progress, fraction, tick           how far along the reference line it got, and when
 *   replans        replan points
 *   troubled       replans at which the policy's own continuation failed
 *   rescued        of those, how many where some alternative did not fail
 *   deadEnds       replans at which nothing tried survived
 *   backups        of those, how many were solved by going back to an earlier replan point
 *   picks          { label: count } of the continuations committed to
 *   simTicks       simulator ticks stepped, try-outs included
 *   seconds        wall time
 * }
 */
export async function driveLap(renv, policy, options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  if (cfg.score === 'value' && !cfg.value) throw new Error("score 'value' needs options.value (policy.mjs loadValue)");
  const rng = createRng(cfg.seed);
  const t0 = performance.now();
  let obs = await fromStart(renv);
  // The simulator's tick counter where the count of this lap's cost starts.
  // The counter goes back to 0 when a new car is built (sim/env.mjs _newCar),
  // so what an earlier car stepped for this lap is kept in `ticksOnOldCars`.
  let ticks0 = renv.env.frames, ticksOnOldCars = 0;
  const committed = [];
  const stats = { replans: 0, troubled: 0, rescued: 0, deadEnds: 0, backups: 0, picks: {} };
  let last = null;

  /** Did this try-out end badly? Cut off by the environment, or far too slow. */
  const failed = (r) => (r.reason && !r.finished) || (!r.reason && r.speedKmh < cfg.slowShare * r.refSpeedKmh);
  /** Rank of a try-out, larger is better: a finished lap beats a survivor
   *  beats a failure. Finished laps by time, failures by how far they got. */
  const rank = (r) => {
    if (r.finished) return 2e9 - r.finishFrames;
    if (failed(r)) return -1e9 + r.progress;
    if (cfg.score === 'progress') return r.progress;
    if (cfg.score === 'value') return r.discounted + r.weight * cfg.value(r.obs);
    return r.reward;
  };

  if (cfg.mode === 'plain') {
    last = await tryOut(renv, obs, policy, { horizon: Infinity, sampleUntil: cfg.sample ? Infinity : 0, rng, temperature: cfg.temperature });
    committed.push(...last.decisions);
  }

  /**
   * Back to `mark`, try continuations of `horizon` decisions, return the best.
   * The policy's own top choices first; the alternatives only if that one
   * failed, or always when `all`.
   */
  const plan = async (mark, horizon, all) => {
    ({ obs } = await renv.rewind(mark));
    let best = { label: 'policy', ...(await tryOut(renv, obs, policy, { horizon })) };
    best.policyFailed = failed(best);
    if (!all && !best.policyFailed) return best;
    for (const alt of alternatives(cfg, rng)) {
      ({ obs } = await renv.rewind(mark));
      const r = { label: alt.label, policyFailed: best.policyFailed, ...(await tryOut(renv, obs, policy, { ...alt, horizon })) };
      // Strictly better only: on a tie the policy's own continuation stays.
      if (rank(r) > rank(best)) best = r;
    }
    return best;
  };

  // The marks of the last few replan points, newest last, each with how many
  // decisions were committed when it was made: what backing up returns to.
  const history = [];
  while (cfg.mode !== 'plain' && !(last && last.reason)) {
    // A car can only be stepped about 6 million ticks, try-outs included.
    // Near the limit, build a new car and drive the committed lap again. The
    // old car's marks die with it.
    if (needsFreshCar(renv)) {
      ticksOnOldCars += renv.env.frames - ticks0;
      obs = await fromStart(renv);
      ticks0 = renv.env.frames;
      await tryOut(renv, obs, policy, { explicit: committed, horizon: committed.length });
      history.length = 0;
    }
    let at = { mark: await renv.mark(), length: committed.length };
    history.push(at);
    if (history.length > cfg.back + 1) renv.dropMark(history.shift().mark);
    stats.replans++;
    let best = await plan(at.mark, cfg.horizon, cfg.mode === 'full');
    if (best.policyFailed) stats.troubled++;
    if (best.policyFailed && !failed(best)) stats.rescued++;

    // DEAD END: nothing tried from here survives, so the mistake was made
    // earlier. Go back one replan point at a time and look for a continuation
    // from there that survives past this point as well (hence the longer
    // horizon: the choice made there last time survived `horizon` and no
    // more, and must not be picked again). The decisions committed since are
    // taken back. At most `maxBackups` times per lap, so it always ends.
    if (failed(best)) {
      stats.deadEnds++;
      for (let back = 1; back < history.length && stats.backups < cfg.maxBackups; back++) {
        const earlier = history[history.length - 1 - back];
        const r = await plan(earlier.mark, cfg.horizon + back * cfg.every, true);
        if (failed(r)) continue;
        for (const dropped of history.splice(history.length - back)) renv.dropMark(dropped.mark);
        committed.length = earlier.length;
        at = earlier; best = r;
        stats.backups++;
        break;
      }
    }

    // Commit: back to the mark and drive the start of the best continuation
    // for real (all of it if it reached the finish). Same decisions from the
    // same save state give the same result, to the tick.
    const kind = best.label.replace(/^(force|sample) .*/, '$1');
    stats.picks[kind] = (stats.picks[kind] ?? 0) + 1;
    ({ obs } = await renv.rewind(at.mark));
    const start = best.decisions.slice(0, best.finished ? best.decisions.length : cfg.every);
    last = await tryOut(renv, obs, policy, { explicit: start, horizon: start.length });
    committed.push(...last.decisions);
    obs = last.obs;
  }
  for (const h of history) renv.dropMark(h.mark);

  return {
    decisions: committed,
    finished: last.finished, finishFrames: last.finishFrames, reason: last.reason,
    progress: last.progress, fraction: last.progress / renv.line.length, tick: last.tick,
    ...stats,
    simTicks: ticksOnOldCars + renv.env.frames - ticks0,
    seconds: (performance.now() - t0) / 1000,
  };
}
