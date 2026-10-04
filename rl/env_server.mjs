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

async function handle(msg) {
  switch (msg.cmd) {
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
