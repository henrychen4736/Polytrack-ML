// A trained policy, and its value estimate, on the Node side.
//
// What it is for: running a network that rl/train_ppo.py trained, without
// Python. Training (rl/env_server.mjs), the model-guided search
// (rl/rollout_child.mjs) and the ideas (through ideas/shared/policy.mjs) all
// read the network here. There used to be three copies of this code, one in
// each of those places; they had the same file layout and the same sampling,
// and differed only in how a layer adds up its sum (see the two layer
// functions below).
//
//   const policy = loadPolicy('rl/checkpoints/ppo_sr1_desert4.u800.actor.bin');
//   const decision = policy.decide(obs);            // top choices
//   const decision = policy.decide(obs, rng, 1);    // sampled, as in training
//   const value = loadValue('rl/checkpoints/ppo_sr1_desert4.u800.critic.bin');
//   value(obs)                                      // expected discounted reward to go
//
// Files: *.actor.bin comes from `python rl/export_actor.py <checkpoint.pt>`
// (or is written by train_ppo.py during training), *.critic.bin from
// `python ideas/shared/export_critic.py <checkpoint.pt>`. Both are raw
// float32: three layers, each as weights (one row per unit) then biases.
// Networks: obs -> hidden -> hidden -> out, tanh between.
//
// `obs` is the observation of rl/racing_env.mjs (OBS_SIZE numbers), from an
// environment created with the options the checkpoint was trained with
// (BLOCK_ENV in ideas/shared/block_rollout.mjs for every block checkpoint so far).
//
// Local use only: this reads local files and makes no network connections.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OBS_SIZE } from './racing_env.mjs';

/** The project root: weight files are named relative to it. */
const ROOT = fileURLToPath(new URL('../', import.meta.url));

/** The 22 scores of a block decision, as six separate choices [first score,
 *  how many]: steering target (3), steering switch slice (5), W target (2),
 *  W slice (5), S target (2), S slice (5). BLOCK_EDGES in rl/train_ppo.py is
 *  the same layout. */
export const GROUPS = [[0, 3], [3, 5], [8, 2], [10, 5], [15, 2], [17, 5]];
export const NUM_SCORES = 22;

/** Read a three-layer network with `outputs` outputs. The hidden width is
 *  worked out from the file's size (h*obs + h + h*h + h + outputs*h + outputs
 *  values), so callers do not have to carry it around. `file` is relative to
 *  the project root, or absolute. */
export function loadNet(file, outputs, obsSize = OBS_SIZE) {
  // resolve(), not new URL(file, root): an absolute Windows path ("C:\...")
  // read as a URL has the scheme "c:" and readFileSync refuses it.
  const bytes = readFileSync(resolve(ROOT, file));
  const all = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  // h^2 + (obs + 2 + outputs) h + outputs - n = 0
  const b = obsSize + 2 + outputs;
  const hidden = Math.round((-b + Math.sqrt(b * b - 4 * (outputs - all.length))) / 2);
  if (hidden * hidden + b * hidden + outputs !== all.length) {
    throw new Error(`${file}: ${all.length} values do not fit a network with ${obsSize} inputs and ${outputs} outputs (an older checkpoint with fewer inputs, or a route-reference one with 334 (OBS_SIZE_ROUTE)? pass obsSize)`);
  }
  let o = 0;
  const take = (n) => { const part = all.subarray(o, o + n); o += n; return part; };
  return {
    hidden, outputs,
    w1: take(hidden * obsSize), b1: take(hidden), w2: take(hidden * hidden), b2: take(hidden),
    w3: take(outputs * hidden), b3: take(outputs),
    // Scratch space for the two hidden layers' outputs.
    h1: new Float32Array(hidden), h2: new Float32Array(hidden),
  };
}

// Two ways to add up a layer. They are the same sum, but floating-point
// addition in a different order gives a different last bit, which can flip a
// sampled choice, so each caller keeps the order it has always used: a change
// here would make earlier training runs and searches unrepeatable.

/** out[i] = tanh(bias[i] + sum_j weights[i][j] * input[j]), summed in order.
 *  Used by the search and the ideas; checked against PyTorch to 1e-6
 *  (ideas/shared/tests/test_policy_rollout.mjs). */
export function layerTanh(weights, bias, input, out) {
  const n = input.length;
  for (let i = 0, w = 0; i < out.length; i++) {
    let sum = bias[i];
    for (let j = 0; j < n; j++) sum += weights[w++] * input[j];
    out[i] = Math.tanh(sum);
  }
}

/** The same as layerTanh, with the sum kept in four running totals, four
 *  inputs at a time, so the processor can work on the four at once: measured
 *  1.6 times faster. Used by training (env_server.mjs), where this function
 *  is about a quarter of all training time. */
export function layerTanhFast(weights, bias, input, out) {
  const n = input.length, n4 = n - (n % 4);
  for (let i = 0, w = 0; i < out.length; i++) {
    let s0 = bias[i], s1 = 0, s2 = 0, s3 = 0, j = 0;
    for (; j < n4; j += 4, w += 4) {
      s0 += weights[w] * input[j];
      s1 += weights[w + 1] * input[j + 1];
      s2 += weights[w + 2] * input[j + 2];
      s3 += weights[w + 3] * input[j + 3];
    }
    for (; j < n; j++) s0 += weights[w++] * input[j];
    out[i] = Math.tanh(s0 + s1 + s2 + s3);
  }
}

/** The network's outputs (raw scores, or the value) for one observation. */
export function forward(net, obs, layer = layerTanh) {
  layer(net.w1, net.b1, obs, net.h1);
  layer(net.w2, net.b2, net.h1, net.h2);
  const out = new Float64Array(net.outputs);
  for (let a = 0, w = 0; a < net.outputs; a++) {
    let sum = net.b3[a];
    for (let j = 0; j < net.hidden; j++) sum += net.w3[w++] * net.h2[j];
    out[a] = sum;
  }
  return out;
}

/**
 * One choice from scores[from .. from+count): without `rng`, the top-scoring
 * one (lowest number on a tie); with it, one at random with chance
 * proportional to exp(score / temperature) (a softmax). Returns 0 .. count-1.
 */
export function pick(scores, from, count, rng = null, temperature = 1) {
  let top = 0;
  for (let a = 1; a < count; a++) if (scores[from + a] > scores[from + top]) top = a;
  if (!rng) return top;
  // Subtracting the largest score before exp() avoids overflow and does not
  // change the proportions.
  let total = 0;
  const weight = [];
  for (let a = 0; a < count; a++) { weight[a] = Math.exp((scores[from + a] - scores[from + top]) / temperature); total += weight[a]; }
  let r = rng() * total;
  for (let a = 0; a < count; a++) { r -= weight[a]; if (r <= 0) return a; }
  return count - 1;
}

/**
 * Load a block-decision policy. Returns
 *   { hidden,
 *     scores(obs)  -> Float64Array(22), the raw scores (logits), GROUPS layout
 *     decide(obs, rng = null, temperature = 1) -> [steer, steerAt, w, wAt, s, sAt]
 *         without rng: the top-scoring choice of each of the six parts;
 *         with rng (createRng(seed) from sim/search.mjs): each part picked at
 *         random with chance proportional to exp(score / temperature), which
 *         is what training does
 *     logProb(obs, decision) -> natural log of the chance decide() with an rng
 *         at temperature 1 picks exactly `decision` (sum over the six parts) }
 * One forward pass takes about 0.1 ms at hidden = 256.
 */
export function loadPolicy(file, { obsSize = OBS_SIZE } = {}) {
  const net = loadNet(file, NUM_SCORES, obsSize);
  const scores = (obs) => forward(net, obs);
  function decide(obs, rng = null, temperature = 1) {
    const s = scores(obs);
    return GROUPS.map(([from, count]) => pick(s, from, count, rng, temperature));
  }
  function logProb(obs, decision) {
    const s = scores(obs);
    let lp = 0;
    GROUPS.forEach(([from, count], g) => {
      let max = -Infinity, total = 0;
      for (let a = 0; a < count; a++) max = Math.max(max, s[from + a]);
      for (let a = 0; a < count; a++) total += Math.exp(s[from + a] - max);
      lp += s[from + decision[g]] - max - Math.log(total);
    });
    return lp;
  }
  return { hidden: net.hidden, scores, decide, logProb };
}

/**
 * Load a checkpoint's value estimate (written by export_critic.py). Returns a
 * function value(obs) -> number: what PPO's critic expects the rest of the
 * episode to earn, in the TRAINING reward of rl/racing_env.mjs (0.1 per unit
 * of road at the human's pace, minus contact and key costs, plus 5 + 2 per
 * second under the time limit at the finish), discounted at 0.995 per
 * decision. With 50 ms decisions that discount halves a reward 7 s away, so
 * the value mostly reflects the next few seconds, and it is trained only on
 * states the policy itself visits: treat it as a rough ranking of nearby
 * states, not a lap-time prediction.
 */
export function loadValue(file, { obsSize = OBS_SIZE } = {}) {
  const net = loadNet(file, 1, obsSize);
  return (obs) => forward(net, obs)[0];
}
