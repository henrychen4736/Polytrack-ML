// Child process for the model-guided sectional search
// (scripts/search_rollout.mjs): one simulator, the training environment on top
// of it, and a trained policy network. Started through sim/pool.mjs.
//
// It holds one "mark" (a save state plus the episode's bookkeeping, see MARK
// AND REWIND in racing_env.mjs) at the end of the lap's committed part, and on
// request drives on from it: some decisions given by the parent, the rest
// chosen by the policy. Because the policy looks at where the car actually
// is, it copes with whatever the changed decisions did, which keys replayed
// from an older lap cannot.
//
// A "decision" is a block decision, [steer, steerAt, w, wAt, s, sAt], one per
// 50 ms (see BLOCK DECISIONS in racing_env.mjs).
//
// Protocol (Node's built-in parent/child messaging):
//   parent -> child  { track, actor, hidden, env }      once: the track, the
//                    policy's weights file and hidden width (written by
//                    rl/export_actor.py), and RacingEnv options
//   child -> parent  { ready: true }
//
//   { id, cmd: 'prepare', prefix: [decisions] }
//       Start line, drive the given decisions, and mark that moment.
//       Reply { id, ok, tick } (ok is false if the prefix itself ended the lap).
//
//   { id, cmd: 'roll', explicit: [decision or null, ...], sampleUntil, horizon, seed, temperature }
//       Back to the mark, then up to `horizon` decisions. Decision k is
//       explicit[k] if that is given; otherwise the policy chooses: at random
//       in proportion to its scores while k < sampleUntil (what it does in
//       training), and its top choice after that.
//       Reply { id, decisions, finished, finishFrames, reason, progress, speed, tick }:
//       the decisions actually driven, how the stretch ended (reason is null
//       if the car was still driving), distance along the reference line in
//       units, speed in units per second, and the lap tick reached.
//
//   { id, cmd: 'save', decisions, run }
//       Drive a whole lap from the start line and save it as
//       runs/<run>_<track>.json for scripts/export_recording.mjs.
//       Reply { id, finished, finishFrames, file }.
//
// Local use only: nothing here contacts Kodub's servers.
import { readFileSync } from 'node:fs';
import { RacingEnv, OBS_SIZE } from './racing_env.mjs';

// Scores per block decision: steering target (3), steering "at" (5), W target
// (2), W "at" (5), S target (2), S "at" (5). Same layout as env_server.mjs.
const GROUPS = [[0, 3], [3, 5], [8, 2], [10, 5], [15, 2], [17, 5]];
const NUM_SCORES = 22;
// See CAR_TICK_BUDGET in racing_env.mjs: one car can only be stepped about
// 6 million ticks in total, save-state restores included.
const CAR_TICK_BUDGET = 4_500_000;

let renv = null, actor = null, mark = null, prefix = [];

/** Read the policy network (layout in rl/export_actor.py). The code here
 *  mirrors loadActor/sampleAction in env_server.mjs, which serves training
 *  and is deliberately left untouched. */
function loadActor(file, hidden) {
  const bytes = readFileSync(file);
  const all = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  let o = 0;
  const take = (n) => { const part = all.subarray(o, o + n); o += n; return part; };
  const a = {
    hidden,
    w1: take(hidden * OBS_SIZE), b1: take(hidden),
    w2: take(hidden * hidden), b2: take(hidden),
    w3: take(NUM_SCORES * hidden), b3: take(NUM_SCORES),
    h1: new Float32Array(hidden), h2: new Float32Array(hidden),
  };
  if (o !== all.length) throw new Error(`weights file has ${all.length} values, expected ${o}`);
  return a;
}

/** out[i] = tanh(bias[i] + sum_j weights[i][j] * input[j]) */
function layerTanh(weights, bias, input, out) {
  const n = input.length;
  for (let i = 0, w = 0; i < out.length; i++) {
    let sum = bias[i];
    for (let j = 0; j < n; j++) sum += weights[w++] * input[j];
    out[i] = Math.tanh(sum);
  }
}

/** The policy's 22 scores for one observation. */
function scoresFor(obs) {
  layerTanh(actor.w1, actor.b1, obs, actor.h1);
  layerTanh(actor.w2, actor.b2, actor.h1, actor.h2);
  const scores = new Float64Array(NUM_SCORES);
  for (let a = 0, w = 0; a < NUM_SCORES; a++) {
    let sum = actor.b3[a];
    for (let j = 0; j < actor.hidden; j++) sum += actor.w3[w++] * actor.h2[j];
    scores[a] = sum;
  }
  return scores;
}

/** Small seeded random generator (the same algorithm as elsewhere here). */
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

/**
 * One block decision from the policy. With `rng`, each of the six parts is
 * picked at random with chance proportional to exp(score / temperature);
 * without it, each part is the top-scoring choice.
 */
function decide(obs, rng, temperature = 1) {
  const scores = scoresFor(obs);
  return GROUPS.map(([from, count]) => {
    let top = 0;
    for (let a = 1; a < count; a++) if (scores[from + a] > scores[from + top]) top = a;
    if (!rng) return top;
    let total = 0;
    const weight = [];
    for (let a = 0; a < count; a++) { weight[a] = Math.exp((scores[from + a] - scores[from + top]) / temperature); total += weight[a]; }
    let pick = rng() * total;
    for (let a = 0; a < count; a++) { pick -= weight[a]; if (pick <= 0) return a; }
    return count - 1;
  });
}

/** Start line, drive `prefix`, mark. Returns the last step's result (or null
 *  for an empty prefix). */
async function prepare() {
  if (mark) { renv.dropMark(mark); mark = null; }
  // Past the tick budget, make reset() build a new car (and a new ladder).
  if (renv.env.frames > CAR_TICK_BUDGET) renv.ladder = null;
  await renv.reset({ startFraction: 0 });
  let r = null;
  for (const decision of prefix) {
    r = await renv.stepBlock(decision);
    if (r.terminated || r.truncated) return r;
  }
  mark = await renv.mark();
  return r;
}

process.on('message', async (msg) => {
  if (msg.track) {
    renv = await RacingEnv.create({ track: msg.track, ...msg.env });
    actor = loadActor(msg.actor, msg.hidden);
    process.send({ ready: true });
    return;
  }
  if (msg.cmd === 'prepare') {
    prefix = msg.prefix;
    const r = await prepare();
    process.send({ id: msg.id, ok: !(r && (r.terminated || r.truncated)), tick: renv.state.frames });
    return;
  }
  if (msg.cmd === 'roll') {
    if (renv.env.frames > CAR_TICK_BUDGET) await prepare();
    let { obs } = await renv.rewind(mark);
    const rng = makeRng(msg.seed ?? 0);
    const decisions = [];
    let r = null;
    for (let k = 0; k < msg.horizon; k++) {
      const decision = msg.explicit?.[k] ?? decide(obs, k < (msg.sampleUntil ?? 0) ? rng : null, msg.temperature ?? 1);
      decisions.push(decision);
      r = await renv.stepBlock(decision);
      if (r.terminated || r.truncated) break;
      obs = r.obs;
    }
    const info = r?.info ?? renv._info(null);
    process.send({
      id: msg.id, decisions,
      finished: info.reason === 'finished', finishFrames: info.finishFrames, reason: info.reason,
      // renv.progress, not info.progress: the info copy is rounded to 0.01 units.
      progress: renv.progress, speed: info.speedKmh / 3.6, tick: info.frames,
    });
    return;
  }
  if (msg.cmd === 'save') {
    prefix = [];
    await prepare();
    let r = null;
    for (const decision of msg.decisions) {
      r = await renv.stepBlock(decision);
      if (r.terminated || r.truncated) break;
    }
    const finished = r?.info.reason === 'finished';
    process.send({ id: msg.id, finished, finishFrames: r?.info.finishFrames ?? null, file: finished ? renv.save(msg.run) : null });
  }
});
