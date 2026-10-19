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
// MEMORY (opt-in, ideas/g2-5-memory-policy): with memory=1 (or memory=0, the
// same wider observation with the memory part held at zero, for a baseline)
// the server holds a MemoryEnv (ideas/g2-5-memory-policy/memory_env.mjs)
// instead of a bare RacingEnv. It wraps one, keeps a map of what earlier
// attempts on this track did, and appends 130 numbers to every observation
// (352 + 130 = 482, or 334 + 130 = 464 in route mode). Attempts are grouped
// into sessions of 1..sessionMax attempts that share one memory. Its own
// options: memory, sessionMax (default 6), sessionSeed (default: seed, so
// that the servers of one run do not all draw the same session lengths).
// Without any of these three the server is exactly what it was before: the
// memory module is not even loaded, and every reply is byte for byte the same.
//
// TRACK ROTATION (opt-in, ideas/g2-2-track-generator): with
// trackSet=<a,b,c,...> the server drives several tracks in turn, one at a
// time: it starts on the first and, every switchEvery episodes (default 20),
// closes its RacingEnv and opens one on the next track of the list (in
// order, wrapping round). Why: rl/polytrack_env.py gives every server one
// track for life, so 54 tracks would need 54 simulators; with rotation 16
// servers cover them, each cycling through its own share. A track may be an
// official name or a generated .track.json path (sim/env.mjs loadTrack).
// A switch costs one simulator boot and, in route mode, reading the cached
// route (built once per track, 2 to 15 s the first time): measured 0.4 to
// 0.5 s onto a 600-unit generated track and 1.5 to 2.4 s onto desert4, where
// the human lap is also replayed to build the ladder of part-way starts. An
// episode is about 0.3 to 3 s of wall time (100 to 1000 block decisions at
// about 330 a second), so switch every 20 to 50 episodes, not every one. Every episode's info then carries "track" (the short name,
// sim/env.mjs trackLabel), so the trainer can count finishes per track, and
// the start-up line has "trackSet" (the list) and "switchEvery". Not
// together with memory (the memory belongs to one track). Without trackSet
// none of this runs and every reply is the same as before.
//
// PROTOCOL: one JSON object per line in each direction, strictly
// request -> reply, so the caller always knows which reply belongs to which
// request.
//
//   at start-up, unprompted:
//     <- {"ready":true,"obsSize":352,"obsIndex":{"pedal":15,...},"numActions":12,
//         "block":0,"track":"summer1","ticks":10,"pedalEvery":5,"maxTicks":44558,
//         "lineLength":..., "humanFrames":22279, "reference":"human"}
//        obsIndex: where the entries Python reads directly sit (OBS_INDEX in
//        racing_env.mjs; rl/polytrack_env.py checks its own copy against it)
//        obsSize: 352, or 334 with reference=route (ROUTE MODE in
//        racing_env.mjs). lineLength is then the route's length, and
//        humanFrames is null on a track with no human lap.
//        With memory: obsSize is 130 larger (482 or 464), and the line also
//        has "memory": {"on":1,"size":130,"baseObsSize":352,"sessionMax":6}.
//
//   -> {"cmd":"reset"}                         optional: "seed":n, "startFraction":0..1
//     <- {"obs":[...352 numbers...],"info":{...}}
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
import { RacingEnv, DEFAULTS, OBS_INDEX, NUM_ACTIONS } from './racing_env.mjs';
import { createRng } from '../sim/search.mjs';
import { loadNet, forward, layerTanhFast, pick, GROUPS } from './policy.mjs';

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

// key=value arguments -> options. Values are numbers except `track`,
// `refFile` and `reference` ('human' or 'route'). Split at the first "=" only,
// and refuse a value that is not a number: Number("abc") is NaN and
// Number("") is 0, which used to go through silently ("True" from Python, for instance, would have become NaN).
const options = {};
// The memory wrapper's own options (MEMORY_DEFAULTS in memory_env.mjs). Its
// module is imported only when one of them is given, so a server without
// them runs exactly the code it ran before the memory existed.
const MEMORY_KEYS = ['memory', 'sessionMax', 'sessionSeed'];
// The server's own options for TRACK ROTATION (see the top). Not RacingEnv
// options, so they are taken out before the environment is created.
const ROTATION_KEYS = ['trackSet', 'switchEvery'];
let memoryModule = null;
if (process.argv.slice(2).some((arg) => MEMORY_KEYS.includes(arg.slice(0, arg.indexOf('='))))) {
  memoryModule = await import('../ideas/g2-5-memory-policy/memory_env.mjs');
}
for (const arg of process.argv.slice(2)) {
  const at = arg.indexOf('=');
  const key = arg.slice(0, at), value = arg.slice(at + 1);
  if (at < 0 || !(key in DEFAULTS || ROTATION_KEYS.includes(key) || (memoryModule && key in memoryModule.MEMORY_DEFAULTS))) { send({ error: `unknown argument "${arg}"` }); process.exit(2); }
  const text = key === 'track' || key === 'refFile' || key === 'reference' || key === 'trackSet';
  if (!text && (value.trim() === '' || Number.isNaN(Number(value)))) { send({ error: `argument "${arg}": not a number` }); process.exit(2); }
  options[key] = text ? value : Number(value);
}

// TRACK ROTATION: the list, where we are in it, and episodes on this track.
let rotation = null;
if ('trackSet' in options || 'switchEvery' in options) {
  const list = (options.trackSet ?? '').split(',').map((t) => t.trim()).filter(Boolean);
  const every = options.switchEvery ?? 20;
  delete options.trackSet; delete options.switchEvery;
  if (!list.length) { send({ error: 'switchEvery needs trackSet=<track,track,...>' }); process.exit(2); }
  if (memoryModule) { send({ error: 'trackSet cannot be combined with memory' }); process.exit(2); }
  if (!(every >= 1)) { send({ error: 'switchEvery must be at least 1' }); process.exit(2); }
  rotation = { list, every, index: 0, episodes: 0, switches: 0 };
  options.track = list[0];
}

let renv;
try {
  if (memoryModule) {
    // sessionMax / sessionSeed alone would silently do nothing: refuse them.
    if (!('memory' in options)) throw new Error('sessionMax and sessionSeed need memory=1 (or memory=0)');
    // Each server draws its own session lengths; PolytrackVecEnv gives
    // every server its own seed.
    options.sessionSeed ??= options.seed ?? 0;
    renv = await memoryModule.MemoryEnv.create(options);
  } else {
    renv = await RacingEnv.create(options);
  }
} catch (err) {
  send({ error: `could not start the simulator: ${err.message}` });
  process.exit(1);
}
if (renv.cfg.block > 0) { NUM_SCORES = 22; ACTION_WIDTH = 6; }
/** Numbers per observation: 352, or 334 in route mode. Taken from the
 *  environment, never assumed, so both kinds of network can be served. */
const OBS_SIZE = renv.obsSize;
send({
  ready: true,
  obsSize: OBS_SIZE,
  obsIndex: OBS_INDEX,
  numActions: renv.cfg.block > 0 ? BLOCK_ACTIONS : NUM_ACTIONS,
  block: renv.cfg.block,
  track: renv.cfg.track,
  ticks: renv.cfg.ticks,
  pedalEvery: renv.cfg.pedalEvery,
  maxTicks: renv.cfg.maxTicks,
  lineLength: (renv.route ?? renv.line).length,
  humanFrames: renv.human?.frames ?? null,
  reference: renv.cfg.reference,
  // Only with rotation / memory, so the line without them is unchanged.
  ...(rotation ? { trackSet: rotation.list, switchEvery: rotation.every } : {}),
  ...(memoryModule ? { memory: { on: renv.mcfg.memory, size: memoryModule.MEM_SIZE, baseObsSize: renv.baseSize, sessionMax: renv.mcfg.sessionMax } } : {}),
});

/** Observations go out with 4 decimal places: plenty for a network input,
 *  and it halves the length of every line. */
const round = (obs) => obs.map((v) => Math.round(v * 1e4) / 1e4);

// ---- rollout: collect many decisions without asking Python for each one ----
//
// With memory the reply has one more array, "sessionEnds" (base64 uint8, one
// per decision): 1 where the decision ended an attempt AND the attempt that
// follows starts a new session (its memory is empty). It is read off the
// next reset's info.attempt === 1, which is exact whatever cleared the
// memory (the session's length, a refLaps switch, a setReference from a
// "demo" request). The trainer needs it for --carry (session_advantages in
// rl/train_ppo.py). Each episode's info also carries "attempt" (1 = memory
// empty) and "sessionEnd" from MemoryEnv.
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

/** Random numbers for picking actions: a separate stream from racing_env.mjs's,
 *  so it does not disturb start positions. */
const actionRng = createRng((options.seed ?? 0) + 7919);

/**
 * Run the actor on one observation and pick each part of the action
 * independently, each from its own group of scores, at random in proportion
 * to exp(score) (pick in policy.mjs). The network is read by loadNet in
 * policy.mjs, from the file train_ppo.py writes: raw float32 values, layer
 * after layer, each as weights (one row per unit) then biases. Its layers are
 * added up with layerTanhFast, the order training has always used.
 */
function sampleAction(actor, obs) {
  const scores = forward(actor, obs, layerTanhFast);
  const sample = (from, count) => pick(scores, from, count, actionRng);
  // Block decision: [steer, steerAt, w, wAt, s, sAt].
  if (ACTION_WIDTH === 6) return GROUPS.map(([from, count]) => sample(from, count));
  // action = steer + 3 * W + 6 * S (see the table at the top of racing_env.mjs).
  // On decisions where W and S are not read, the environment ignores those
  // two parts; step() reports the action that was really applied.
  return sample(4, 3) + 3 * sample(0, 2) + 6 * sample(2, 2);
}

const b64 = (typed) => Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength).toString('base64');

/**
 * Start the next episode: renv.reset(), except that with TRACK ROTATION the
 * environment is first replaced by one on the next track when this track
 * has had its switchEvery episodes. An explicit start fraction (evaluation)
 * never switches. The old simulator is closed before the new one boots, so
 * a server never holds two.
 */
async function resetEpisode(args = {}) {
  if (rotation && args.startFraction == null && ++rotation.episodes > rotation.every && rotation.list.length > 1) {
    rotation.index = (rotation.index + 1) % rotation.list.length;
    rotation.episodes = 1;
    rotation.switches++;
    await renv.close();
    // A seed per visit, so a track met again does not replay the same starts.
    renv = await RacingEnv.create({ ...options, track: rotation.list[rotation.index], seed: (options.seed ?? 0) + 7777 * rotation.switches });
  }
  return renv.reset(args);
}

/** With TRACK ROTATION, label an episode's info with its track. */
const labelled = (info) => (rotation ? { ...info, track: renv.trackName } : info);

/** The observation the next decision will be made from; null before the
 *  first episode. Kept between rollouts, so episodes carry on across them. */
let currentObs = null;

async function rollout({ steps, weights }) {
  // The hidden width is worked out from the file's size. rl/polytrack_env.py
  // still sends it as "hidden"; it is accepted and not needed.
  const actor = loadNet(weights, NUM_SCORES, OBS_SIZE);
  const obsOut = new Float32Array(steps * OBS_SIZE);
  const actions = new Uint8Array(steps * ACTION_WIDTH);
  const rewards = new Float32Array(steps);
  const dones = new Uint8Array(steps);
  // Memory only: 1 where an attempt ended and the next one starts a new
  // session (see the comment above this section).
  const sessionEnds = memoryModule ? new Uint8Array(steps) : null;
  const episodes = []; // one entry per episode that ended during this rollout
  // Where this rollout's time went: running the policy network, and stepping
  // the simulator (which includes building the next observation).
  let actorMs = 0, stepMs = 0;
  if (currentObs == null) currentObs = Float32Array.from((await resetEpisode()).obs);

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
      episodes.push({ t, info: labelled(r.info), finalObs: r.info.reason === 'time limit' ? b64(Float32Array.from(r.obs)) : null });
      const next = await resetEpisode();
      if (sessionEnds) sessionEnds[t] = next.info.attempt === 1 ? 1 : 0;
      currentObs = Float32Array.from(next.obs);
    } else {
      currentObs = Float32Array.from(r.obs);
    }
  }
  return {
    obs: b64(obsOut), actions: b64(actions), rewards: b64(rewards), dones: b64(dones), lastObs: b64(currentObs), episodes, actorMs, stepMs,
    ...(sessionEnds ? { sessionEnds: b64(sessionEnds) } : {}),
  };
}

async function handle(msg) {
  switch (msg.cmd) {
    case 'rollout':
      return rollout(msg);
    case 'reset': {
      const { obs, info } = await resetEpisode({ seed: msg.seed ?? null, startFraction: msg.startFraction ?? null });
      return { obs: round(obs), info: labelled(info) };
    }
    case 'step': {
      // A block-decision environment takes "decision": [steer, steerAt, w, wAt, s, sAt].
      const r = renv.cfg.block > 0 ? await renv.stepBlock(msg.decision) : await renv.step(msg.action);
      return { obs: round(r.obs), reward: r.reward, terminated: r.terminated, truncated: r.truncated, info: labelled(r.info) };
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
