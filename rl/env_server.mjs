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
//     <- {"ready":true,"obsSize":101,"numActions":9,"track":"summer1",
//         "ticks":10,"maxTicks":44558,"lineLength":..., "humanFrames":22279}
//
//   -> {"cmd":"reset"}                         optional: "seed":n, "startFraction":0..1
//     <- {"obs":[...101 numbers...],"info":{...}}
//
//   -> {"cmd":"step","action":0..8}
//     <- {"obs":[...],"reward":0.03,"terminated":false,"truncated":false,"info":{...}}
//
//   -> {"cmd":"save","run":"rl"}               after an episode that finished
//     <- {"saved":"runs/rl_summer1.json","finishFrames":23000}
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

// Keep stdout clean: route console.log to stderr before anything can use it.
console.log = console.error;

/** Write one protocol line. */
const send = (message) => process.stdout.write(JSON.stringify(message) + '\n');

// key=value arguments -> options. Values are numbers except `track`.
const options = {};
for (const arg of process.argv.slice(2)) {
  const [key, value] = arg.split('=');
  if (!(key in DEFAULTS) || value === undefined) { send({ error: `unknown argument "${arg}"` }); process.exit(2); }
  options[key] = key === 'track' ? value : Number(value);
}

let renv;
try {
  renv = await RacingEnv.create(options);
} catch (err) {
  send({ error: `could not start the simulator: ${err.message}` });
  process.exit(1);
}
send({
  ready: true,
  obsSize: OBS_SIZE,
  numActions: NUM_ACTIONS,
  track: renv.cfg.track,
  ticks: renv.cfg.ticks,
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
 *   layer 3: NUM_ACTIONS x hidden, NUM_ACTIONS
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
    w3: take(NUM_ACTIONS * hidden), b3: take(NUM_ACTIONS),
    // Scratch space for the two hidden layers' outputs.
    h1: new Float32Array(hidden), h2: new Float32Array(hidden),
  };
  if (o !== all.length) throw new Error(`weights file has ${all.length} values, expected ${o}`);
  return actor;
}

/** out[i] = tanh(bias[i] + sum_j weights[i][j] * input[j]) for one layer. */
function layerTanh(weights, bias, input, out) {
  const n = input.length;
  for (let i = 0, w = 0; i < out.length; i++) {
    let sum = bias[i];
    for (let j = 0; j < n; j++) sum += weights[w++] * input[j];
    out[i] = Math.tanh(sum);
  }
}

/** Run the actor on one observation and pick an action at random, each
 *  action's chance proportional to exp(score) (a softmax). */
function sampleAction(actor, obs) {
  layerTanh(actor.w1, actor.b1, obs, actor.h1);
  layerTanh(actor.w2, actor.b2, actor.h1, actor.h2);
  const scores = new Float64Array(NUM_ACTIONS);
  let top = -Infinity;
  for (let a = 0, w = 0; a < NUM_ACTIONS; a++) {
    let sum = actor.b3[a];
    for (let j = 0; j < actor.hidden; j++) sum += actor.w3[w++] * actor.h2[j];
    scores[a] = sum;
    if (sum > top) top = sum;
  }
  // Subtracting the largest score before exp() avoids overflow and does not
  // change the proportions.
  let total = 0;
  for (let a = 0; a < NUM_ACTIONS; a++) { scores[a] = Math.exp(scores[a] - top); total += scores[a]; }
  let pick = actionRng() * total;
  for (let a = 0; a < NUM_ACTIONS; a++) { pick -= scores[a]; if (pick <= 0) return a; }
  return NUM_ACTIONS - 1;
}

const b64 = (typed) => Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength).toString('base64');

/** The observation the next decision will be made from; null before the
 *  first episode. Kept between rollouts, so episodes carry on across them. */
let currentObs = null;

async function rollout({ steps, weights, hidden }) {
  const actor = loadActor(weights, hidden);
  const obsOut = new Float32Array(steps * OBS_SIZE);
  const actions = new Uint8Array(steps);
  const rewards = new Float32Array(steps);
  const dones = new Uint8Array(steps);
  const episodes = []; // one entry per episode that ended during this rollout
  if (currentObs == null) currentObs = Float32Array.from((await renv.reset()).obs);

  for (let t = 0; t < steps; t++) {
    obsOut.set(currentObs, t * OBS_SIZE);
    const action = sampleAction(actor, currentObs);
    const r = await renv.step(action);
    actions[t] = action;
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
  return { obs: b64(obsOut), actions: b64(actions), rewards: b64(rewards), dones: b64(dones), lastObs: b64(currentObs), episodes };
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
      const r = await renv.step(msg.action);
      return { obs: round(r.obs), reward: r.reward, terminated: r.terminated, truncated: r.truncated, info: r.info };
    }
    case 'save':
      return { saved: renv.save(msg.run ?? 'rl'), finishFrames: renv.state.finishFrames };
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
