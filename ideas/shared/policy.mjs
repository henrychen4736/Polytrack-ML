// A trained block-decision policy, and its value estimate, on the Node side.
//
// The network code exists twice already, in rl/env_server.mjs (training) and
// rl/rollout_child.mjs (the search), each private to its file. Both serve
// running jobs and must not be touched, so this is a third copy with an
// exported interface; phase 2 can point the other two at it.
//
//   const policy = loadPolicy('rl/checkpoints/ppo_sr1_desert4.u800.actor.bin');
//   const decision = policy.decide(obs);            // top choices
//   const decision = policy.decide(obs, rng, 1);    // sampled, as in training
//   const value = loadValue('rl/checkpoints/ppo_sr1_desert4.u800.critic.bin');
//   value(obs)                                      // expected discounted reward to go
//
// Files: *.actor.bin comes from `python rl/export_actor.py <checkpoint.pt>`,
// *.critic.bin from `python ideas/shared/export_critic.py <checkpoint.pt>`.
// Both are raw float32: three layers, each as weights (one row per unit) then
// biases. Networks: obs -> hidden -> hidden -> out, tanh between.
//
// `obs` is the observation of rl/racing_env.mjs (OBS_SIZE numbers), from an
// environment created with the options the checkpoint was trained with
// (BLOCK_ENV in block_rollout.mjs for every block checkpoint so far).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OBS_SIZE } from '../../rl/racing_env.mjs';
import { createRng } from './rng.mjs';
import { ROOT } from './laps.mjs';

export { createRng };

/** The 22 scores of a block decision, as six separate choices [first score,
 *  how many]: steering target (3), steering switch slice (5), W target (2),
 *  W slice (5), S target (2), S slice (5). */
export const GROUPS = [[0, 3], [3, 5], [8, 2], [10, 5], [15, 2], [17, 5]];
export const NUM_SCORES = 22;

/** Read a three-layer network with `outputs` outputs. The hidden width is
 *  worked out from the file's size (h*obs + h + h*h + h + outputs*h + outputs
 *  values), so callers do not have to carry it around. */
function loadNet(file, outputs, obsSize) {
  // resolve(), not new URL(file, ROOT): an absolute Windows path ("C:\...")
  // read as a URL has the scheme "c:" and readFileSync refuses it, so the
  // "(or absolute)" promised below did not work on this machine.
  const bytes = readFileSync(resolve(fileURLToPath(ROOT), file));
  const all = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  // h^2 + (obs + 2 + outputs) h + outputs - n = 0
  const b = obsSize + 2 + outputs;
  const hidden = Math.round((-b + Math.sqrt(b * b - 4 * (outputs - all.length))) / 2);
  if (hidden * hidden + b * hidden + outputs !== all.length) {
    throw new Error(`${file}: ${all.length} values do not fit a network with ${obsSize} inputs and ${outputs} outputs (older checkpoint with fewer inputs? pass obsSize)`);
  }
  let o = 0;
  const take = (n) => { const part = all.subarray(o, o + n); o += n; return part; };
  const net = {
    hidden, outputs,
    w1: take(hidden * obsSize), b1: take(hidden), w2: take(hidden * hidden), b2: take(hidden),
    w3: take(outputs * hidden), b3: take(outputs),
    h1: new Float32Array(hidden), h2: new Float32Array(hidden),
  };
  return net;
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

function forward(net, obs) {
  layerTanh(net.w1, net.b1, obs, net.h1);
  layerTanh(net.w2, net.b2, net.h1, net.h2);
  const out = new Float64Array(net.outputs);
  for (let a = 0, w = 0; a < net.outputs; a++) {
    let sum = net.b3[a];
    for (let j = 0; j < net.hidden; j++) sum += net.w3[w++] * net.h2[j];
    out[a] = sum;
  }
  return out;
}

/**
 * Load a block-decision policy. `file` is relative to the project root (or
 * absolute). Returns
 *   { hidden,
 *     scores(obs)  -> Float64Array(22), the raw scores (logits), GROUPS layout
 *     decide(obs, rng = null, temperature = 1) -> [steer, steerAt, w, wAt, s, sAt]
 *         without rng: the top-scoring choice of each of the six parts;
 *         with rng (createRng(seed)): each part picked at random with chance
 *         proportional to exp(score / temperature), which is what training does
 *     logProb(obs, decision) -> natural log of the chance decide() with an rng
 *         at temperature 1 picks exactly `decision` (sum over the six parts) }
 * One forward pass takes about 0.1 ms at hidden = 256.
 */
export function loadPolicy(file, { obsSize = OBS_SIZE } = {}) {
  const net = loadNet(file, NUM_SCORES, obsSize);
  const scores = (obs) => forward(net, obs);
  function decide(obs, rng = null, temperature = 1) {
    const s = scores(obs);
    return GROUPS.map(([from, count]) => {
      let top = 0;
      for (let a = 1; a < count; a++) if (s[from + a] > s[from + top]) top = a;
      if (!rng) return top;
      let total = 0;
      const weight = [];
      for (let a = 0; a < count; a++) { weight[a] = Math.exp((s[from + a] - s[from + top]) / temperature); total += weight[a]; }
      let pick = rng() * total;
      for (let a = 0; a < count; a++) { pick -= weight[a]; if (pick <= 0) return a; }
      return count - 1;
    });
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
