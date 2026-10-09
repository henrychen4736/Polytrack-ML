// Environment server: one RacingEnv (rl/racing_env.mjs) behind a text protocol.
//
// The learning code is Python and the simulator is JavaScript, so they talk
// through this process's standard input and output. Python starts one of
// these per environment (separate PROCESSES, because simulator threads inside
// one Node process do not run in parallel; see sim/pool.mjs).
//
// Usage: node rl/env_server.mjs [key=value ...]     (run from the project root)
//   any key from DEFAULTS in rl/racing_env.mjs, e.g.
//   node rl/env_server.mjs track=summer1 ticks=10 randomStart=0.5 seed=3
//
// PROTOCOL: one JSON object per line in each direction, strictly
// request -> reply, so the caller always knows which reply belongs to which
// request.
//
//   at start-up, unprompted:
//     <- {"ready":true,"obsSize":335,"numActions":12,"track":"summer1",
//         "ticks":10,"maxTicks":44558,"lineLength":..., "humanFrames":22279}
//
//   -> {"cmd":"reset"}                         optional: "seed":n, "startFraction":0..1
//     <- {"obs":[...335 numbers...],"info":{...}}
//
//   -> {"cmd":"step","action":0..11}
//     <- {"obs":[...],"reward":0.03,"terminated":false,"truncated":false,"info":{...}}
//
//   -> {"cmd":"save","run":"rl"}               after an episode that finished
//     <- {"saved":"runs/rl_summer1.json","finishFrames":23000}
//
//   -> {"cmd":"demo","lap":0..9,"ref":0..9}    drive that human lap from
//                                              data/laps/<track>.json and return what
//                                              the agent would have seen and done.
//                                              "ref" (optional) first makes that lap
//                                              the reference (setReference in
//                                              racing_env.mjs)
//     <- {"obs":base64 float32,"actions":base64 uint8,"count":n}
//
//   -> {"cmd":"close"}                         the process exits; no reply
//
//   any failure:
//     <- {"error":"what went wrong"}
//
// Standard output carries ONLY protocol lines. Anything else that wants to
// print (console.log here or in the simulator) is sent to standard error,
// where it cannot be mistaken for a reply. The simulator prints one harmless
// "wasm streaming compile failed ... falling back" line there at boot.
//
// This program reads and writes local files and pipes only. It makes no
// network connections.
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { RacingEnv, DEFAULTS, OBS_SIZE, NUM_ACTIONS } from './racing_env.mjs';

/** Outputs of the policy network. Each group of scores is its own choice;
 *  see Agent in rl/train_ppo.py.
 *    per-decision actions (block = 0), 7 scores:
 *      W (off, on), S (off, on), steering (straight, left, right)
 *    block decisions (block > 0), 22 scores, see BLOCK DECISIONS in
 *    racing_env.mjs:
 *      steering target (3), steering "at" (5), W target (2), W "at" (5),
 *      S target (2), S "at" (5) */
let NUM_SCORES = 7;
/** Numbers stored per decision in a rollout: 1 action, or the 6 of a block decision. */
let ACTION_WIDTH = 1;
/** numActions value that tells the Python side this is a block-decision
 *  environment (3 x 5 x 2 x 5 x 2 x 5 combinations). */
const BLOCK_ACTIONS = 1500;

// Keep stdout clean: route console.log to stderr before anything can use it.
console.log = console.error;

/** Write one protocol line. */
const send = (message) => process.stdout.write(JSON.stringify(message) + '\n');

// key=value arguments -> options. Values are numbers except `track` and `refFile`.
const options = {};
for (const arg of process.argv.slice(2)) {
  const [key, value] = arg.split('=');
  if (!(key in DEFAULTS) || value === undefined) { send({ error: `unknown argument "${arg}"` }); process.exit(2); }
  options[key] = key === 'track' || key === 'refFile' ? value : Number(value);
}

let renv;
try {
  renv = await RacingEnv.create(options);
} catch (err) {
  send({ error: `could not start the simulator: ${err.message}` });
  process.exit(1);
}
if (renv.cfg.block > 0) { NUM_SCORES = 22; ACTION_WIDTH = 6; }
send({
  ready: true,
  obsSize: OBS_SIZE,
  numActions: renv.cfg.block > 0 ? BLOCK_ACTIONS : NUM_ACTIONS,
  block: renv.cfg.block,
  track: renv.cfg.track,
  ticks: renv.cfg.ticks,
  pedalEvery: renv.cfg.pedalEvery,
  maxTicks: renv.cfg.maxTicks,
  lineLength: renv.line.length,
  humanFrames: renv.human.frames,
});

/** Observations go out with 4 decimal places: plenty for a network input,
 *  and it halves the length of every line. */
const round = (obs) => obs.map((v) => Math.round(v * 1e4) / 1e4);

// ---- rollout: collect many decisions without asking Python for each one ----
//
// With "step", every decision is a round trip: Python picks an action, writes
// it to our pipe, we simulate 10 ms, write the observation back. Measured, the
// round trip itself costs more than the simulation (0.55 ms against 0.17 ms),
// and that cost is paid per environment per decision.
//
// "rollout" removes it. Python sends the policy network's weights once, and
// this process then plays `steps` decisions on its own: it computes the
// action scores from the observation, picks an action at random in proportion
// to them (exactly what the trainer would have done), steps the simulator,
// starts a new episode whenever one ends, and finally returns everything in
// one message. All the server processes do this at the same time.

/** Small seeded random generator for picking actions (same algorithm as in
 *  racing_env.mjs; a separate stream so it does not disturb start positions). */
function makeActionRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const actionRng = makeActionRng((options.seed ?? 0) + 7919);

/**
 * The policy ("actor") network, read from the file train_ppo.py writes:
 * raw float32 values, layer after layer, each as weights then biases:
 *   layer 1: hidden x OBS_SIZE weights (one row per hidden unit), hidden biases
 *   layer 2: hidden x hidden, hidden
 *   layer 3: NUM_SCORES x hidden, NUM_SCORES
 */
function loadActor(file, hidden) {
  const bytes = readFileSync(file);
  const all = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  let o = 0;
  const take = (n) => { const part = all.subarray(o, o + n); o += n; return part; };
  const actor = {
    hidden,
    w1: take(hidden * OBS_SIZE), b1: take(hidden),
    w2: take(hidden * hidden), b2: take(hidden),
    w3: take(NUM_SCORES * hidden), b3: take(NUM_SCORES),
    // Scratch space for the two hidden layers' outputs.
    h1: new Float32Array(hidden), h2: new Float32Array(hidden),
  };
  if (o !== all.length) throw new Error(`weights file has ${all.length} values, expected ${o}`);
  return actor;
}

/** out[i] = tanh(bias[i] + sum_j weights[i][j] * input[j]) for one layer.
 *  The sum is kept in four running totals, four inputs at a time. It is the
 *  same sum; written this way the processor can work on the four at once,
 *  which measured 1.6 times faster. This function is about a quarter of all
 *  training time, so that is worth the less obvious loop. */
function layerTanh(weights, bias, input, out) {
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

/** Pick one of scores[from .. from+count) at random, each one's chance
 *  proportional to exp(score) (a softmax). Returns 0 .. count-1. */
function sampleGroup(scores, from, count) {
  // Subtracting the largest score before exp() avoids overflow and does not
  // change the proportions.
  let top = -Infinity;
  for (let a = 0; a < count; a++) top = Math.max(top, scores[from + a]);
  let total = 0;
  const weight = new Float64Array(count);
  for (let a = 0; a < count; a++) { weight[a] = Math.exp(scores[from + a] - top); total += weight[a]; }
  let pick = actionRng() * total;
  for (let a = 0; a < count; a++) { pick -= weight[a]; if (pick <= 0) return a; }
  return count - 1;
}

/** Run the actor on one observation and pick the three parts of the action
 *  (W, S, steering) independently, each from its own group of scores. */
function sampleAction(actor, obs) {
  layerTanh(actor.w1, actor.b1, obs, actor.h1);
  layerTanh(actor.w2, actor.b2, actor.h1, actor.h2);
  const scores = new Float64Array(NUM_SCORES);
  for (let a = 0, w = 0; a < NUM_SCORES; a++) {
    let sum = actor.b3[a];
    for (let j = 0; j < actor.hidden; j++) sum += actor.w3[w++] * actor.h2[j];
    scores[a] = sum;
  }
  if (ACTION_WIDTH === 6) {
    // Block decision: [steer, steerAt, w, wAt, s, sAt].
    return [sampleGroup(scores, 0, 3), sampleGroup(scores, 3, 5), sampleGroup(scores, 8, 2),
      sampleGroup(scores, 10, 5), sampleGroup(scores, 15, 2), sampleGroup(scores, 17, 5)];
  }
  // action = steer + 3 * W + 6 * S (see the table at the top of racing_env.mjs).
  // On decisions where W and S are not read, the environment ignores those
  // two parts; step() reports the action that was really applied.
  return sampleGroup(scores, 4, 3) + 3 * sampleGroup(scores, 0, 2) + 6 * sampleGroup(scores, 2, 2);
}

const b64 = (typed) => Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength).toString('base64');

/** The observation the next decision will be made from; null before the
 *  first episode. Kept between rollouts, so episodes carry on across them. */
let currentObs = null;

async function rollout({ steps, weights, hidden }) {
  const actor = loadActor(weights, hidden);
  const obsOut = new Float32Array(steps * OBS_SIZE);
  const actions = new Uint8Array(steps * ACTION_WIDTH);
  const rewards = new Float32Array(steps);
  const dones = new Uint8Array(steps);
  const episodes = []; // one entry per episode that ended during this rollout
  // Where this rollout's time went: running the policy network, and stepping
  // the simulator (which includes building the next observation).
  let actorMs = 0, stepMs = 0;
  if (currentObs == null) currentObs = Float32Array.from((await renv.reset()).obs);

  for (let t = 0; t < steps; t++) {
    obsOut.set(currentObs, t * OBS_SIZE);
    const t0 = performance.now();
    const action = sampleAction(actor, currentObs);
    const t1 = performance.now();
    const r = ACTION_WIDTH === 6 ? await renv.stepBlock(action) : await renv.step(action);
    actorMs += t1 - t0;
    stepMs += performance.now() - t1;
    if (ACTION_WIDTH === 6) actions.set(action, t * 6);
    else actions[t] = r.action;
    rewards[t] = r.reward;
    if (r.terminated || r.truncated) {
      dones[t] = 1;
      // `t` says which decision ended the episode. For a time limit the
      // trainer also needs the last observation (see train_ppo.py).
      episodes.push({ t, info: r.info, finalObs: r.info.reason === 'time limit' ? b64(Float32Array.from(r.obs)) : null });
      currentObs = Float32Array.from((await renv.reset()).obs);
    } else {
      currentObs = Float32Array.from(r.obs);
    }
  }
  return { obs: b64(obsOut), actions: b64(actions), rewards: b64(rewards), dones: b64(dones), lastObs: b64(currentObs), episodes, actorMs, stepMs };
}

async function handle(msg) {
  switch (msg.cmd) {
    case 'rollout':
      return rollout(msg);
    case 'reset': {
      const { obs, info } = await renv.reset({ seed: msg.seed ?? null, startFraction: msg.startFraction ?? null });
      return { obs: round(obs), info };
    }
    case 'step': {
      // A block-decision environment takes "decision": [steer, steerAt, w, wAt, s, sAt].
      const r = renv.cfg.block > 0 ? await renv.stepBlock(msg.decision) : await renv.step(msg.action);
      return { obs: round(r.obs), reward: r.reward, terminated: r.terminated, truncated: r.truncated, info: r.info };
    }
    case 'demo': {
      // The lap to label: human lap number `lap`, or with `file` a lap from a
      // JSON file holding { frames, recording } (path from the project root),
      // which is how a lap found by a search becomes imitation examples.
      let lap;
      if (msg.file) {
        lap = JSON.parse(readFileSync(new URL(`../${msg.file}`, import.meta.url), 'utf8'));
      } else {
        const laps = JSON.parse(readFileSync(new URL(`../data/laps/${renv.cfg.track}.json`, import.meta.url), 'utf8'));
        if (!laps[msg.lap]) throw new Error(`no lap ${msg.lap} for ${renv.cfg.track}`);
        lap = laps[msg.lap];
      }
      if (msg.ref != null) await renv.setReference(msg.ref);
      const demo = await renv.demo(lap);
      currentObs = null; // a rollout after this starts a fresh episode
      return { obs: b64(demo.obs), actions: b64(demo.actions), count: demo.count };
    }
    case 'save':
      return { saved: renv.save(msg.run ?? 'rl', { unfinished: !!msg.unfinished }), finishFrames: renv.state.finishFrames };
    default:
      throw new Error(`unknown cmd "${msg.cmd}"`);
  }
}

// Read requests one line at a time. `for await` handles them strictly in
// order: the next line is not looked at until the current reply is written.
for await (const text of createInterface({ input: process.stdin })) {
  if (!text.trim()) continue;
  let msg;
  try { msg = JSON.parse(text); } catch { send({ error: 'request is not valid JSON' }); continue; }
  if (msg.cmd === 'close') break;
  try { send(await handle(msg)); } catch (err) { send({ error: err.message }); }
}
// Reached on "close" or when the parent closes our stdin (e.g. it crashed),
// so an orphaned server never lingers.
await renv.close();
process.exit(0);
