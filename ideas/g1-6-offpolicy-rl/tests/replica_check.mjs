// Checks what iqn_server.mjs reported against an environment of our own.
//
//   node ideas/g1-6-offpolicy-rl/tests/replica_check.mjs <dump.json>
//
// test_server.py drives the real server and writes what it got (the
// observations, actions, rewards and stop flags of consecutive rollouts, and
// an evaluation lap) to <dump.json>. This script opens rl/racing_env.mjs
// directly, with the options the server documents, and drives the SAME
// actions. None of the server's code runs here. For every decision it has
//   - the observation the agent should have been shown,
//   - the car's position before and after,
//   - the environment's own (shaped) reward,
// and so it can say whether the server's reward is progress and nothing else:
//   1. reward == rewardScale x (progress after - progress before), where
//      progress is RacingEnv's own measure along the reference line;
//   2. over each episode, the rewards add up to the distance covered along
//      the reference line as measured HERE, by projecting the car's position
//      on the line's segments (no use of RacingEnv's progress at all);
//   3. the reward is not the environment's shaped reward, and removing the
//      progress part of the shaped reward does not explain any of it.
// One simulator. Prints PASS / FAIL lines like the other tests.
import { readFileSync } from 'node:fs';
import { RacingEnv, OBS_SIZE } from '../../../rl/racing_env.mjs';
import { SPACING } from '../../../sim/line.mjs';
import { check, finish } from './harness.mjs';

const dump = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const f32 = (b64) => { const b = Buffer.from(b64, 'base64'); return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const u8 = (b64) => Uint8Array.from(Buffer.from(b64, 'base64'));
const SCALE = 0.1;
const label = dump.label;

// The options iqn_server.mjs says it gives RacingEnv (its header and README),
// except lanePenalty, which is left at the environment's default here so that
// the shaped reward below is the full one. It changes no physics.
const BLOCKS = dump.slices === 5;
const renv = await RacingEnv.create({
  track: dump.track, seed: dump.seed, randomStart: dump.randomStart ?? 0, lapFraction: 1, maxOffLine: 60, maxOffLineAir: 100,
  ...(BLOCKS ? { ticks: 10, block: 5 } : { ticks: 50, block: 0, pedalEvery: 1 }),
});
/** The README's action set: a key combination (steer + 3 W + 6 S), and with 60 actions the slice in which all keys switch. */
const drive = (action) => {
  if (!BLOCKS) return renv.step(action);
  const c = action % 12, at = Math.floor(action / 12);
  return renv.stepBlock([c % 3, at, Math.floor(c / 3) % 2, at, c >= 6 ? 1 : 0, at]);
};

/** Distance along the reference line of the point on it nearest to `p`,
 *  searched near `hint` (a point index). Plain projection on each segment. */
const points = renv.line.points;
function arc(p, hint) {
  let best = Infinity, at = 0;
  for (let i = Math.max(0, hint - 60); i < Math.min(points.length - 1, hint + 60); i++) {
    const a = points[i], b = points[i + 1];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    const len2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1;
    const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / len2));
    const d = Math.hypot(ap[0] - t * ab[0], ap[1] - t * ab[1], ap[2] - t * ab[2]);
    if (d < best) { best = d; at = (i + t) * SPACING; }
  }
  return at;
}

// ---- the rollouts, as one stream of decisions ------------------------------------------------
const obs = [], actions = [], rewards = [], stops = [];
for (const part of dump.rollouts) {
  const o = f32(part.obs);
  for (let t = 0; t < part.steps; t++) obs.push(o.subarray(t * OBS_SIZE, (t + 1) * OBS_SIZE));
  actions.push(...u8(part.actions)); rewards.push(...f32(part.rewards)); stops.push(...u8(part.stops));
}
const N = actions.length;
let now = Float32Array.from((await renv.reset({})).obs);
let obsWrong = 0, firstObsWrong = -1, worstReward = 0, stopWrong = 0, shapedSame = 0, worstEpisode = 0, episodes = 0, worstResidual = 0;
let episodeReward = 0, episodeStartArc = arc(renv.state.position, renv.progressIndex), residualExplained = 0;
let startProgress = renv.progress, finished = 0, worstFinish = 0, finishTicks = []; // finished laps: the total must be the whole rest of the line
let furthest = episodeStartArc, rolledBack = 0; // the furthest point of the line reached in this episode; episodes that ended behind it
const reasons = {};
for (let t = 0; t < N; t++) {
  if (!now.every((v, i) => v === obs[t][i])) { obsWrong++; if (firstObsWrong < 0) firstObsWrong = t; }
  const before = renv.progress;
  const r = await drive(actions[t]);
  const gain = renv.progress - before;
  let expected = SCALE * gain;
  if (r.info.reason === 'finished') expected += SCALE * (renv.line.length - renv.progress);
  worstReward = Math.max(worstReward, Math.abs(expected - rewards[t]));
  // The shaped reward: equal to the server's on this row?
  if (Math.abs(r.reward - rewards[t]) < 1e-4) shapedSame++;
  // What is left of the server's reward after taking out plain progress must
  // be nothing: not a pace term, not a key cost, not a contact cost.
  worstResidual = Math.max(worstResidual, Math.abs(rewards[t] - SCALE * gain));
  if (Math.abs(r.reward - SCALE * gain) > 1e-4) residualExplained++; // rows where the shaped reward has something besides plain progress
  episodeReward += rewards[t];
  const here = arc(renv.state.position, renv.progressIndex);
  furthest = Math.max(furthest, here);
  const ended = r.terminated || r.truncated;
  const wantStop = !ended ? 0 : r.info.reason === 'time limit' ? 2 : 1;
  if (stops[t] !== wantStop) stopWrong++;
  if (ended) {
    episodes++;
    reasons[r.info.reason] = (reasons[r.info.reason] ?? 0) + 1;
    // RacingEnv's progress is a ratchet: it looks for the nearest line point
    // from the last one FORWARDS only (sim/line.mjs nearestIndex), so a car
    // that rolls or reverses back along the road loses at most half a unit
    // of progress, not the distance it went back. The distance to compare
    // with is therefore to the furthest point reached, not to where the car
    // stopped.
    if (furthest - here > 1) rolledBack++;
    if (r.info.reason === 'finished') { finished++; finishTicks.push(r.info.finishFrames); worstFinish = Math.max(worstFinish, Math.abs(episodeReward - SCALE * (renv.line.length - startProgress))); }
    if (r.info.reason !== 'finished') worstEpisode = Math.max(worstEpisode, Math.abs(episodeReward / SCALE - (furthest - episodeStartArc)));
    now = Float32Array.from((await renv.reset({})).obs);
    episodeReward = 0;
    episodeStartArc = arc(renv.state.position, renv.progressIndex);
    furthest = episodeStartArc;
    startProgress = renv.progress;
  } else now = Float32Array.from(r.obs);
}
check(`${label}: all ${N} observations are exactly what our own environment shows before each decision (so row t + 1 IS the observation after decision t, and after every ending a new episode starts where our own environment starts one)`, obsWrong === 0, `${obsWrong} differ, the first at decision ${firstObsWrong}`);
check(`${label}: every stop flag is right (0 goes on, 1 ended for good, 2 time limit) over ${episodes} endings ${JSON.stringify(reasons)}`, stopWrong === 0 && episodes >= 2, `${stopWrong} wrong, ${episodes} endings`);
check(`${label}: every reward is 0.1 x the progress gained along the reference line in that decision (worst gap ${worstReward.toExponential(1)})`, worstReward < 2e-5, `${worstReward}`);
check(`${label}: over each of the ${episodes} episodes the rewards add up to the line distance from the start to the furthest point reached, measured here by projecting the car on the line (worst gap ${worstEpisode.toFixed(2)} units; ${rolledBack} episodes ended more than a unit behind their furthest point)`, episodes >= 2 && worstEpisode < 1.5, `${worstEpisode}`);
// (Not asked of the finish dump: a car that only holds W from the human's own
// position and speed changes no key and touches nothing for long stretches,
// and there the shaped reward IS plain progress.)
if (!dump.expectFinish) check(`${label}: the environment's own shaped reward has more than progress in it on ${residualExplained} of ${N} of these decisions (pace, key, contact and lane terms), and the server's reward equals it on ${shapedSame}`,
  residualExplained > 0.5 * N && shapedSame < 0.2 * N, `shaped differs from plain progress on ${residualExplained}, equals the server's on ${shapedSame}`);

if (dump.expectFinish) {
  check(`${label}: ${finished} episodes crossed the finish line (ticks ${finishTicks.join(', ')}), and each one's rewards add up to 0.1 x the whole rest of the line from where it started (worst gap ${worstFinish.toExponential(1)})`, finished >= 1 && worstFinish < 1e-3 && finishTicks.every((f) => Number.isInteger(f) && f > 0), `${finished} finished, gap ${worstFinish}`);
}

// ---- the evaluation lap ---------------------------------------------------------------------------
if (dump.eval) {
  const taken = u8(dump.eval.actions);
  await renv.reset({ startFraction: 0 });
  const start = renv.progress;
  let last = null, steps = 0;
  for (const a of taken) { last = await drive(a); steps++; if (last.terminated || last.truncated) break; }
  let total = SCALE * (renv.progress - start);
  if (last.info.reason === 'finished') total += SCALE * (renv.line.length - renv.progress);
  check(`${label}: the evaluation lap's actions, driven here from the start line, end the same way (${dump.eval.info.reason}) on the same decision`,
    last.info.reason === dump.eval.info.reason && steps === taken.length && steps === dump.eval.decisions && (last.terminated || last.truncated), `${last.info.reason} after ${steps} of ${taken.length}`);
  check(`${label}: its reported return is 0.1 x the progress it made`, Math.abs(total - dump.eval.ret) < 1e-6 * Math.max(1, Math.abs(total)), `${dump.eval.ret} against ${total}`);
}
await renv.close();
finish();
