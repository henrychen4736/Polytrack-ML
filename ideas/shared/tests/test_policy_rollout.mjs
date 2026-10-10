// policy.mjs and block_rollout.mjs on desert4: one RacingEnv (one simulator),
// then one SimSession after it is closed. The agreement of the network with
// PyTorch is test_export_critic.py; here: sampling, probabilities, rollouts,
// mark / rewind, and that three ways of driving the same lap (RacingEnv block
// decisions, SimSession per-tick keys, the game's replay) give the same tick.
import { existsSync } from 'node:fs';
import { loadPolicy, loadValue, createRng, GROUPS, NUM_SCORES } from '../policy.mjs';
import { BLOCK_ENV, openBlockEnv, fromStart, roll, needsFreshCar } from '../block_rollout.mjs';
import { decisionsToKeys, keysToDecisions, sameKeys, humanLaps, ROOT } from '../laps.mjs';
import { SimSession } from '../sim_session.mjs';
import { OBS_SIZE } from '../../../rl/racing_env.mjs';
import { checker } from './harness.mjs';

const { check, eq, throws, note } = checker();
const ACTOR = 'rl/checkpoints/ppo_sr1_desert4.u800.actor.bin', CRITIC = 'rl/checkpoints/ppo_sr1_desert4.u800.critic.bin';
if (!existsSync(new URL(ACTOR, ROOT))) { note(`SKIP: no ${ACTOR}`); process.exit(0); }

// ---- policy.mjs without a simulator --------------------------------------------------
eq([GROUPS, NUM_SCORES, OBS_SIZE], [[[0, 3], [3, 5], [8, 2], [10, 5], [15, 2], [17, 5]], 22, 352], 'GROUPS cover 22 scores as 3 + 5 + 2 + 5 + 2 + 5; OBS_SIZE is 352');
const policy = loadPolicy(ACTOR);
await throws(() => loadPolicy(ACTOR, { obsSize: 335 }), 'loadPolicy with the wrong observation size throws instead of reading garbage');
await throws(() => loadValue(ACTOR), 'loadValue of an ACTOR file throws (the sizes do not fit a one-output network)');
{
  const a = createRng(5), b = createRng(5), c = createRng(6);
  const xs = Array.from({ length: 5 }, () => a()), ys = Array.from({ length: 5 }, () => b()), zs = Array.from({ length: 5 }, () => c());
  check(JSON.stringify(xs) === JSON.stringify(ys) && JSON.stringify(xs) !== JSON.stringify(zs) && xs.every((x) => x >= 0 && x < 1), 'createRng: same seed, same numbers in [0, 1); another seed, other numbers');
}
const obs0 = Float32Array.from({ length: OBS_SIZE }, (_, i) => 0.5 * Math.sin(0.61 * i));
{
  const s = policy.scores(obs0);
  const top = GROUPS.map(([from, count]) => { let best = 0; for (let a = 1; a < count; a++) if (s[from + a] > s[from + best]) best = a; return best; });
  eq(policy.decide(obs0), top, 'decide(obs) is the top score of each of the six groups');
  // All 1500 decisions: the probabilities logProb gives must add up to 1.
  let total = 0, best = -Infinity, bestDecision = null;
  for (let a = 0; a < 3; a++) for (let b = 0; b < 5; b++) for (let c = 0; c < 2; c++) for (let d = 0; d < 5; d++) for (let e = 0; e < 2; e++) for (let f = 0; f < 5; f++) {
    const lp = policy.logProb(obs0, [a, b, c, d, e, f]);
    total += Math.exp(lp);
    if (lp > best) { best = lp; bestDecision = [a, b, c, d, e, f]; }
  }
  check(Math.abs(total - 1) < 1e-9, `logProb: the chances of all 1500 decisions add up to 1 (${total.toFixed(12)})`);
  eq(bestDecision, top, 'the decision logProb rates most likely is the one decide() returns');
  // Sampling: frequencies of the steering target against exp(logProb).
  const rng = createRng(3), counts = [0, 0, 0], N = 30000;
  for (let n = 0; n < N; n++) counts[policy.decide(obs0, rng)[0]]++;
  const z = Math.max(...[0, 1, 2].map((a) => s[a]));
  const p = [0, 1, 2].map((a) => Math.exp(s[a] - z)); const sum = p[0] + p[1] + p[2];
  const worst = Math.max(...[0, 1, 2].map((a) => Math.abs(counts[a] / N - p[a] / sum)));
  check(worst < 0.01, `decide(obs, rng): over 30000 samples the steering choice comes up with the softmax chances (largest gap ${worst.toFixed(4)})`);
  const cold = createRng(4);
  check(Array.from({ length: 50 }, () => JSON.stringify(policy.decide(obs0, cold, 0.001))).every((d) => d === JSON.stringify(top)), 'decide at temperature 0.001 always takes the top choice');
  const r1 = createRng(9), r2 = createRng(9);
  check(JSON.stringify(policy.decide(obs0, r1)) === JSON.stringify(policy.decide(obs0, r2)), 'decide with the same seed samples the same decision');
}

// ---- block_rollout.mjs ------------------------------------------------------------------
eq(BLOCK_ENV, { ticks: 10, block: 5, pedalEvery: 5, lapFraction: 0, maxOffLine: 40 }, 'BLOCK_ENV is what the contract lists');
const renv = await openBlockEnv('desert4');
let obs = await fromStart(renv);
check(obs.length === OBS_SIZE && !needsFreshCar(renv), 'fromStart: an observation of 352 numbers; the new car is not used up');
const first = Array.from(obs);
await throws(() => roll(renv, obs, { horizon: 1 }), 'roll with neither a decision nor a policy throws');
obs = await fromStart(renv);
eq(Array.from(obs), first, 'fromStart twice: the identical observation');
let r = await roll(renv, obs, { explicit: [] });
eq([r.decisions, r.done, r.finished, r.tick, r.reward], [[], false, false, 1, 0], 'roll of no decisions: nothing driven, clock at 1 (the one empty tick), reward 0');

// The policy's own lap, then the same decisions again as explicit ones.
obs = await fromStart(renv);
const lap = await roll(renv, obs, { policy, horizon: 2000 });
check(lap.finished && lap.done && lap.reason === 'finished' && lap.finishFrames === 22061, `the policy's top-choice lap finishes on tick ${lap.finishFrames} (CONTRACT: 22.061 s)`);
check(lap.decisions.length === Math.ceil((lap.finishFrames - 1) / 50), `${lap.decisions.length} decisions = one per 50 ms after the empty first tick`);
const envKeys = renv.controlsPerTick.map((c) => ({ ...c }));
check(sameKeys(decisionsToKeys(lap.decisions).slice(0, envKeys.length), envKeys), `decisionsToKeys gives the ${envKeys.length} keys the environment held`);
check(keysToDecisions(decisionsToKeys(lap.decisions)).wrongTicks === 0, 'keysToDecisions of that lap: 0 wrong ticks');

obs = await fromStart(renv);
const head = await roll(renv, obs, { explicit: lap.decisions.slice(0, 100) });
eq([head.tick, head.done, head.decisions.length], [5001, false, 100], '100 explicit decisions: clock at 5001, not done');
const headObs = Array.from(head.obs), headProgress = head.progress;
const mark = await renv.mark();
// Explicit entries that are null fall through to the policy.
const a = await roll(renv, head.obs, { explicit: [lap.decisions[100], null, null], policy, horizon: 3 });
eq(a.decisions, lap.decisions.slice(100, 103), 'explicit [d, null, null] with a policy: the nulls are the policy\'s top choices (the same as its own lap)');
const sampled = await roll(renv, a.obs, { policy, horizon: 40, sampleUntil: 40, rng: createRng(7) });
let back = await renv.rewind(mark);
eq(Array.from(back.obs), headObs, 'rewind(mark): the observation is the one at the mark');
check(renv.progress === headProgress, 'rewind(mark): the environment\'s progress is back too');
await roll(renv, back.obs, { explicit: lap.decisions.slice(100, 103) });
const again = await roll(renv, a.obs, { policy, horizon: 40, sampleUntil: 40, rng: createRng(7) });
eq([again.tick, again.progress, again.decisions, again.reward], [sampled.tick, sampled.progress, sampled.decisions, sampled.reward], 'the same sampled 2 s from the mark twice (same seed): same decisions, tick, progress and reward');
check(JSON.stringify(sampled.decisions) !== JSON.stringify(lap.decisions.slice(103, 143)), 'and sampling really differs from the top choices');
// From the mark, the rest of the lap as explicit decisions finishes on the same tick.
back = await renv.rewind(mark);
const rest = await roll(renv, back.obs, { explicit: lap.decisions.slice(100) });
eq([rest.finished, rest.finishFrames], [true, 22061], 'the rest of the lap replayed from the mark finishes on the same tick, 22061');
renv.dropMark(mark);

// An attempt that goes nowhere ends with one of the documented reasons and no time.
obs = await fromStart(renv);
r = await roll(renv, obs, { explicit: Array(400).fill([0, 0, 0, 0, 0, 0]) });
check(r.done && !r.finished && r.finishFrames == null && ['stalled', 'off line', 'off track', 'time limit'].includes(r.reason), `no keys at all: cut off as "${r.reason}" after ${r.decisions.length} decisions, no finish time`);
await renv.close();

// ---- the same lap on the bare simulator ---------------------------------------------------
const sim = await SimSession.create('desert4');
await sim.restart();
const s = await sim.drive(decisionsToKeys(lap.decisions));
eq([s.finished, s.finishFrames], [true, 22061], 'SimSession driving decisionsToKeys(the lap) finishes on the tick RacingEnv reported');
await sim.close();
check(humanLaps('desert4')[0].frames < 22061, 'and the best human lap (21750) is faster than this policy lap, as BRIEF.md says');

// ---- loadValue -------------------------------------------------------------------------------
if (existsSync(new URL(CRITIC, ROOT))) {
  const value = loadValue(CRITIC);
  const v0 = value(Float32Array.from(first)), v5 = value(Float32Array.from(headObs));
  check(Math.abs(v0 - 59.3) < 0.5 && Math.abs(v5 - 78.3) < 0.5, `loadValue: ${v0.toFixed(1)} on the start line and ${v5.toFixed(1)} five seconds in (CONTRACT: 59 and 78)`);
} else note(`SKIP loadValue: no ${CRITIC}`);
