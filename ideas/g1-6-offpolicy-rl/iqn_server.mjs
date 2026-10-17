// Environment server for the off-policy learner (train_iqn.py): one RacingEnv
// (rl/racing_env.mjs) behind the same kind of text protocol as
// rl/env_server.mjs, with three differences that the learner needs and that
// could not be had without editing rl/:
//
//   1. THE REWARD IS PROGRESS ONLY. The environment's own reward (pace against
//      the human's speed, key-press costs, contact and lane costs, time bonus)
//      is computed by RacingEnv and thrown away here. What is reported is
//          rewardScale x (distance gained along the reference line, in units)
//      per 50 ms decision, and on the finish the rest of the line's length, so
//      every finished lap has collected the same total. Nothing in it knows
//      how fast the human was or which keys the human held. The human's line
//      is used only as a RULER (how far round the lap is the car), which is
//      what RacingEnv._locate already measures to a fraction of a unit; the
//      shared gate-based measure (ideas/shared/track_info.mjs) stalls between
//      gates and is too coarse for a per-decision reward.
//      Going faster pays through the learner's discount: the same units of
//      road are worth more the sooner they are covered.
//
//   2. THE ACTION IS ONE OF A SMALL FLAT SET, which is what a Q-network needs
//      (one output per action). With slices=1 (the default) there are 12: the
//      key combinations of racing_env.mjs (steer + 3 W + 6 S), held for one
//      50 ms block. With slices=5 there are 60: a key combination and the
//      10 ms slice of the block in which ALL keys switch to it. Either way
//      the keys driven are those of an ordinary block-decision lap (the 1500
//      block decisions contain these as a subset), so the existing tools
//      (search_rollout.mjs, export_recording.mjs) can take a lap from there.
//      HOW THEY ARE DRIVEN differs, for speed. With 60 actions: stepBlock,
//      five 10 ms steps. With 12 the keys do not change inside the block, so
//      it is ONE 50 ms step (RacingEnv with ticks=50): one message to the
//      simulator thread instead of five. Measured on desert4 with the
//      machine busy training: 2.5 ms per decision against 11.4 ms. The only
//      other difference is that the end-of-episode rules are then looked at
//      every 50 ms instead of every 10; a finish is still timed to the tick
//      (checked on winter2: both ways report 26831).
//
//   3. THE ACTING NETWORK IS THE Q-NETWORK. A rollout picks the action with
//      the largest estimated value, or with probability `epsilon` a random
//      one (see randomAction). The weights file is written by iqn.py
//      export_actor and describes its own sizes.
//
// Usage (from the project root; normally started by servers.py):
//   node ideas/g1-6-offpolicy-rl/iqn_server.mjs track=desert4 seed=3 randomStart=0.8
//   any key from DEFAULTS in rl/racing_env.mjs, plus slices, rewardScale and
//   humanInputs (below).
//
// PROTOCOL: one JSON object per line each way, strictly request -> reply.
//
//   at start-up:
//     <- {"ready":true,"obsSize":352,"numActions":12,"track":..,"humanFrames":..,
//         "lineLength":..,"maxTicks":..}
//
//   -> {"cmd":"rollout","steps":128,"weights":"path.bin","epsilon":0.1}
//     <- {"obs":b64 float32 [steps x obsSize],"actions":b64 uint8 [steps],
//         "rewards":b64 float32 [steps],"stops":b64 uint8 [steps],
//         "episodes":[{t, info, ret, decisions, startProgress, endProgress}],
//         "actMs":..,"stepMs":..}
//        stops[t]: 0 the episode goes on; 1 it ended for good with decision t
//        (finished, stalled, off line, off track: nothing more to earn);
//        2 it was cut off by the tick limit (the road ahead was still worth
//        something, so the learner must not treat it as an ending).
//        No "next observation" is sent: obs[t + 1] is it, except after a
//        stop, where the learner does not need one (replay.py explains).
//
//   -> {"cmd":"eval","weights":"path.bin","save":"g1-6-iqn"}     save optional
//     <- {"info":{..},"ret":..,"decisions":..,"saved":"runs/..json"|null,"actions":b64 uint8}
//        one lap from the start line, always the best-valued action.
//
//   -> {"cmd":"close"}
//   any failure: <- {"error":"..."}
//
// Local files and pipes only; no network connections.
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { RacingEnv, DEFAULTS, OBS_SIZE, OBS_S_HELD, LOOKAHEAD_POINTS } from '../../rl/racing_env.mjs';
import { createRng as makeRng } from '../shared/rng.mjs';

// Keep stdout for protocol lines only (as rl/env_server.mjs does).
console.log = console.error;
const send = (message) => process.stdout.write(JSON.stringify(message) + '\n');

/** Key combinations of racing_env.mjs: steer (3) x W (2) x S (2). */
const COMBINATIONS = 12;

/** Settings of this server that are not RacingEnv's. */
const OWN = {
  // 1: 12 actions, keys switch at the start of the 50 ms block.
  // 5: 60 actions, the switch can be placed in any 10 ms slice of the block.
  slices: 1,
  // Reward per unit of road. 0.1 as in racing_env.mjs, so one decision at
  // 200 km/h (2.8 units in 50 ms) earns about 0.28 and the quantile loss's
  // Huber threshold of 1 sits at a few decisions' worth.
  rewardScale: 0.1,
  // 1: the observation is RacingEnv's, unchanged. 0: the numbers that say
  // what the HUMAN did are zeroed (the human's speed at the 20 points ahead,
  // and the human car's orientation and keys at 21 points); the line's shape,
  // the road edges and the rays stay. The reward has no human in it either
  // way; this switch is for asking whether the inputs matter.
  humanInputs: 1,
};

// What RacingEnv is asked for unless the command line says otherwise
// (how the 50 ms are driven is added below, once `slices` is known).
const options = {
  lapFraction: 1,               // a specialist may know how far round it is
  // Room to leave the human's line. The trainer's default cuts an attempt
  // off 20 units from it; a learner that is not paid to follow the line must
  // be allowed a different one. 'off track' (beyond the road's edge) and
  // 'stalled' still end hopeless attempts early.
  maxOffLine: 60, maxOffLineAir: 100,
  lanePenalty: 0,               // its cost is discarded here; skipping it saves the work
};
const own = { ...OWN };
for (const arg of process.argv.slice(2)) {
  // Split at the first "=" only, and refuse a value that is not a number
  // (as in rl/env_server.mjs: Number("abc") is NaN, Number("") is 0).
  const at = arg.indexOf('=');
  const key = arg.slice(0, at), value = arg.slice(at + 1);
  if (at < 0 || !(key in DEFAULTS || key in OWN)) { send({ error: `unknown argument "${arg}"` }); process.exit(2); }
  const text = !(key in OWN) && (key === 'track' || key === 'refFile');
  if (!text && (value.trim() === '' || Number.isNaN(Number(value)))) { send({ error: `argument "${arg}": not a number` }); process.exit(2); }
  if (key in OWN) own[key] = Number(value);
  else options[key] = text ? value : Number(value);
}
if ('block' in options || 'ticks' in options || 'pedalEvery' in options) { send({ error: 'ticks, block and pedalEvery are set by `slices` (a decision is always 50 ms)' }); process.exit(2); }
if (own.slices !== 1 && own.slices !== 5) { send({ error: 'slices must be 1 or 5' }); process.exit(2); }
// See "HOW THEY ARE DRIVEN" at the top.
const BLOCKS = own.slices > 1;
Object.assign(options, BLOCKS ? { ticks: 10, block: 5 } : { ticks: 50, block: 0, pedalEvery: 1 });
const NUM_ACTIONS = COMBINATIONS * own.slices;

let renv;
try {
  renv = await RacingEnv.create(options);
} catch (err) {
  send({ error: `could not start the simulator: ${err.message}` });
  process.exit(1);
}
send({
  ready: true, obsSize: OBS_SIZE, numActions: NUM_ACTIONS, slices: own.slices,
  track: renv.cfg.track, maxTicks: renv.cfg.maxTicks, lineLength: renv.line.length, humanFrames: renv.human.frames,
});

// ---- observation -----------------------------------------------------------

// Where the human's doings sit in the observation (table at the top of
// racing_env.mjs): speeds at the points ahead, then the 9-number blocks.
const HUMAN_SPEEDS = [21 + 3 * LOOKAHEAD_POINTS, 21 + 4 * LOOKAHEAD_POINTS];
const HUMAN_DOING = [OBS_S_HELD + 2, OBS_S_HELD + 2 + 9 * (1 + LOOKAHEAD_POINTS)];

/** RacingEnv's observation as the float32 array the network reads, with the
 *  human's doings zeroed when humanInputs=0. */
function view(obs) {
  const out = Float32Array.from(obs);
  if (!own.humanInputs) { out.fill(0, ...HUMAN_SPEEDS); out.fill(0, ...HUMAN_DOING); }
  return out;
}

// ---- actions ---------------------------------------------------------------

/** Action number -> the block decision [steer, steerAt, w, wAt, s, sAt] that
 *  stepBlock takes (60 actions). All three controls share one switch slice. */
function decisionOf(action) {
  const combination = action % COMBINATIONS, at = Math.floor(action / COMBINATIONS);
  return [combination % 3, at, Math.floor(combination / 3) % 2, at, combination >= 6 ? 1 : 0, at];
}

/** Seeded generator (createRng, the one racing_env.mjs uses too), a separate stream from
 *  the environment's own so exploring does not change the start positions. */
const rng = makeRng((options.seed ?? 0) + 104729);

/**
 * The action taken when exploring. Not uniform over the 12 combinations: that
 * has W down half the time and S down half the time, which cancel, and the
 * car hardly moves (the PPO agent starts with the same lean for the same
 * reason; see Agent in rl/train_ppo.py). W down 9 times in 10, S down 1 in
 * 10, steering and the switch slice uniform.
 */
function randomAction() {
  const steer = Math.floor(rng() * 3), w = rng() < 0.9 ? 1 : 0, s = rng() < 0.1 ? 1 : 0;
  return steer + 3 * w + 6 * s + COMBINATIONS * Math.floor(rng() * own.slices);
}

// ---- the Q-network, acting side ---------------------------------------------
//
// File layout (iqn.py export_actor): six int32 (magic, obs size, hidden,
// head width, K, actions), then float32:
//   trunk    w1 [hidden x obs], b1, w2 [hidden x hidden], b2
//   phi      [K x hidden]: the network's embedding of K fixed quantile
//            fractions, already computed, so no cosines are needed here
//   head     wa1 [head x hidden], ba1, wa2 [actions x head], ba2
// The value of an action is the mean over the K fractions of
//   wa2 . leaky(wa1 . (trunk(obs) * phi[k]) + ba1) + ba2
// The network's "value of the state" branch adds the same number to every
// action, so it is not needed to find the best one and is not in the file.

const MAGIC = 0x49514e31; // 'IQN1'

function loadNet(file) {
  const bytes = readFileSync(file);
  // Copy: a small file's Buffer can start at an offset that is not a
  // multiple of 4, which a Float32Array view refuses.
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const [magic, obsSize, hidden, head, K, actions] = new Int32Array(buffer, 0, 6);
  if (magic !== MAGIC) throw new Error(`${file} is not an IQN actor file`);
  if (obsSize !== OBS_SIZE || actions !== NUM_ACTIONS) throw new Error(`${file} is for ${obsSize} inputs and ${actions} actions; this server has ${OBS_SIZE} and ${NUM_ACTIONS}`);
  const all = new Float32Array(buffer, 24);
  let o = 0;
  const take = (n) => { const part = all.subarray(o, o + n); o += n; return part; };
  const net = {
    hidden, head, K, actions,
    w1: take(hidden * obsSize), b1: take(hidden), w2: take(hidden * hidden), b2: take(hidden),
    phi: take(K * hidden),
    wa1: take(head * hidden), ba1: take(head), wa2: take(actions * head), ba2: take(actions),
    h1: new Float32Array(hidden), h2: new Float32Array(hidden), x: new Float32Array(hidden), g: new Float32Array(head),
    scores: new Float64Array(actions),
  };
  if (o !== all.length) throw new Error(`${file} holds ${all.length} values, expected ${o}`);
  return net;
}

/** out = leaky_relu(weights . input + bias), slope 0.01 below zero (the same
 *  activation iqn.py uses). Four running sums, as layerTanh in env_server.mjs. */
function layer(weights, bias, input, out) {
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
    const sum = s0 + s1 + s2 + s3;
    out[i] = sum > 0 ? sum : 0.01 * sum;
  }
}

/** The action with the largest estimated value (lowest number on a tie). */
function greedy(net, obs) {
  layer(net.w1, net.b1, obs, net.h1);
  layer(net.w2, net.b2, net.h1, net.h2);
  net.scores.fill(0);
  for (let k = 0; k < net.K; k++) {
    for (let j = 0; j < net.hidden; j++) net.x[j] = net.h2[j] * net.phi[k * net.hidden + j];
    layer(net.wa1, net.ba1, net.x, net.g);
    for (let a = 0, w = 0; a < net.actions; a++) {
      let sum = net.ba2[a];
      for (let j = 0; j < net.head; j++) sum += net.wa2[w++] * net.g[j];
      net.scores[a] += sum;
    }
  }
  let best = 0;
  for (let a = 1; a < net.actions; a++) if (net.scores[a] > net.scores[best]) best = a;
  return best;
}

// ---- driving ---------------------------------------------------------------

const b64 = (typed) => Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength).toString('base64');

/** One decision: drive it and work out the progress-only reward. */
async function drive(action) {
  const before = renv.progress;
  const r = BLOCKS ? await renv.stepBlock(decisionOf(action)) : await renv.step(action);
  let reward = own.rewardScale * (renv.progress - before);
  // The finish line is rarely exactly at the line's last point; top up so
  // that every finished lap has earned rewardScale x the line's length.
  if (r.info.reason === 'finished') reward += own.rewardScale * (renv.line.length - renv.progress);
  return { r, reward };
}

/** Observation for the next decision; null before the first episode. Kept
 *  between rollouts so episodes carry on across them. */
let currentObs = null;
let episode = null; // { ret, decisions, startProgress } of the episode being driven

async function begin(resetOptions = {}) {
  currentObs = view((await renv.reset(resetOptions)).obs);
  episode = { ret: 0, decisions: 0, startProgress: renv.progress };
}

async function rollout({ steps, weights, epsilon = 0 }) {
  const net = loadNet(weights);
  const obsOut = new Float32Array(steps * OBS_SIZE);
  const actions = new Uint8Array(steps), rewards = new Float32Array(steps), stops = new Uint8Array(steps);
  const episodes = [];
  let actMs = 0, stepMs = 0;
  if (currentObs == null) await begin();

  for (let t = 0; t < steps; t++) {
    obsOut.set(currentObs, t * OBS_SIZE);
    const t0 = performance.now();
    const action = rng() < epsilon ? randomAction() : greedy(net, currentObs);
    const t1 = performance.now();
    const { r, reward } = await drive(action);
    actMs += t1 - t0;
    stepMs += performance.now() - t1;
    actions[t] = action;
    rewards[t] = reward;
    episode.ret += reward;
    episode.decisions++;
    if (r.terminated || r.truncated) {
      stops[t] = r.info.reason === 'time limit' ? 2 : 1;
      episodes.push({ t, info: r.info, ret: episode.ret, decisions: episode.decisions, startProgress: episode.startProgress, endProgress: renv.progress });
      await begin();
    } else {
      currentObs = view(r.obs);
    }
  }
  return { obs: b64(obsOut), actions: b64(actions), rewards: b64(rewards), stops: b64(stops), episodes, actMs, stepMs };
}

/** One lap from the start line with the best-valued action throughout. */
async function evaluate({ weights, save = null }) {
  // ideas/shared/CONTRACT.md: files under runs/ carry the idea's id.
  if (save != null && !/^g1-6-[A-Za-z0-9_-]+$/.test(save)) throw new Error('run names must start with "g1-6-"');
  const net = loadNet(weights);
  await begin({ startFraction: 0 });
  const taken = [];
  let last;
  for (;;) {
    const action = greedy(net, currentObs);
    taken.push(action);
    const { r, reward } = await drive(action);
    episode.ret += reward;
    last = r;
    if (r.terminated || r.truncated) break;
    currentObs = view(r.obs);
  }
  const saved = save != null && last.info.reason === 'finished' ? renv.save(save) : null;
  const result = { info: last.info, ret: episode.ret, decisions: taken.length, saved, actions: b64(Uint8Array.from(taken)) };
  currentObs = null; // the next rollout starts a fresh episode
  return result;
}

async function handle(msg) {
  switch (msg.cmd) {
    case 'rollout': return rollout(msg);
    case 'eval': return evaluate(msg);
    default: throw new Error(`unknown cmd "${msg.cmd}"`);
  }
}

for await (const text of createInterface({ input: process.stdin })) {
  if (!text.trim()) continue;
  let msg;
  try { msg = JSON.parse(text); } catch { send({ error: 'request is not valid JSON' }); continue; }
  if (msg.cmd === 'close') break;
  try { send(await handle(msg)); } catch (err) { send({ error: err.message }); }
}
// Reached on "close" or when the parent closes our stdin (it crashed or
// exited), so an orphaned server never lingers.
await renv.close();
process.exit(0);
