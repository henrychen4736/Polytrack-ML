// Drive several consecutive attempts at one track with one policy, the memory
// carried from attempt to attempt, and report each attempt. This is both the
// measurement the idea is judged by (finish rate and lap time on attempt 1,
// 2, 3, 5 of a track) and the source of the smoke test's data.
//
// Usage (from the project root; one simulator):
//   node ideas/g2-5-memory-policy/attempts.mjs track=desert3 policy=<file.actor.bin> [key=value ...]
//     policy     actor weights, path from the project root. Its input count
//                decides how it is run: 482 inputs = a memory policy; 352 = a
//                plain policy (it is shown the first 352 numbers only, the
//                memory is still kept, so "do its crashes repeat?" can be read)
//     attempts   attempts per session (default 5)
//     sessions   sessions, the memory cleared before each (default 1)
//     sample     1: draw decisions as training does; 0 (default): top choice.
//                With top choices a policy that ignores the memory drives the
//                identical attempt every time (the simulator is deterministic)
//     seed       for the sampling (default 1)
//     memory     0: memory inputs held at zero, the baseline (default 1)
//     sabotage   n > 0: on attempt 1 of every session, from decision n on,
//                hold W and steer left, which runs the car off the road. A
//                crash made to order, for the smoke test
//     out        if given, write every decision to <out>.bin / <out>.json
//                (layout below) for smoke_test.py
//
// Every attempt starts on the start line (startFraction 0), as a player's
// attempts at a new track do.
import { writeFileSync, statSync } from 'node:fs';
import { MemoryEnv, MEMORY_OBS_SIZE, MEM_SIZE } from './memory_env.mjs';
import { BIN } from './track_memory.mjs';
import { OBS_SIZE } from '../../rl/racing_env.mjs';
import { loadPolicy, createRng, NUM_SCORES } from '../shared/policy.mjs';
import { BLOCK_ENV } from '../shared/block_rollout.mjs';

const args = { track: 'desert3', policy: '', attempts: 5, sessions: 1, sample: 0, seed: 1, memory: 1, sabotage: 0, out: '' };
for (const arg of process.argv.slice(2)) {
  const [key, value] = arg.split('=');
  if (!(key in args) || value === undefined) throw new Error(`unknown argument "${arg}"`);
  args[key] = typeof args[key] === 'number' ? Number(value) : value;
}
if (!args.policy) throw new Error('policy=<file.actor.bin> is required');

// Which kind of policy is it? loadPolicy checks the file's size against the
// input count, so trying the memory size first tells the two apart.
let policy, policyInputs = MEMORY_OBS_SIZE;
try { policy = loadPolicy(args.policy, { obsSize: MEMORY_OBS_SIZE }); } catch { policyInputs = OBS_SIZE; policy = loadPolicy(args.policy, { obsSize: OBS_SIZE }); }
const seen = (obs) => (policyInputs === MEMORY_OBS_SIZE ? obs : obs.slice(0, OBS_SIZE));

const menv = await MemoryEnv.create({ track: args.track, ...BLOCK_ENV, memory: args.memory, sessionMax: 0 });
const rng = createRng(args.seed);

// One row per decision: observation, the 6 numbers of the decision, reward,
// attempt ended (0/1), session ended (0/1), the policy's 22 scores.
const ROW = MEMORY_OBS_SIZE + 6 + 3 + NUM_SCORES;
const rows = [];
const report = [];
const started = performance.now();
let decisionsDriven = 0;

for (let session = 1; session <= args.sessions; session++) {
  menv.newSession();
  for (let attempt = 1; attempt <= args.attempts; attempt++) {
    let { obs } = await menv.reset({ startFraction: 0 });
    // Largest memory input seen during the attempt, and the largest "crash
    // ahead" input: what the smoke test checks.
    let memoryPeak = 0, crashAheadPeak = 0, r;
    for (let k = 0; ; k++) {
      for (let j = OBS_SIZE; j < MEMORY_OBS_SIZE; j++) memoryPeak = Math.max(memoryPeak, Math.abs(obs[j]));
      for (let p = 0; p < 21; p++) crashAheadPeak = Math.max(crashAheadPeak, obs[OBS_SIZE + 6 * p + 1]);
      const scores = policy.scores(seen(obs));
      const decision = args.sabotage > 0 && attempt === 1 && k >= args.sabotage
        ? [1, 0, 1, 0, 0, 0]
        : policy.decide(seen(obs), args.sample ? rng : null);
      r = await menv.stepBlock(decision);
      decisionsDriven++;
      const done = r.terminated || r.truncated;
      if (args.out) rows.push([...obs, ...decision, r.reward, done ? 1 : 0, done && attempt === args.attempts ? 1 : 0, ...scores]);
      obs = r.obs;
      if (done) break;
    }
    const { info } = r;
    report.push({
      session, attempt, reason: info.reason, finished: info.reason === 'finished',
      seconds: info.reason === 'finished' ? info.finishFrames / 1000 : null,
      lapShare: info.fraction, crashAt: info.committed.crashBin == null ? null : info.committed.crashBin * BIN,
      doomedBins: info.committed.doomedBins, passBins: info.committed.passBins,
      memoryPeak: +memoryPeak.toFixed(3), crashAheadPeak: +crashAheadPeak.toFixed(3),
    });
    const a = report.at(-1);
    console.log(`session ${session} attempt ${attempt}: ${a.reason}`
      + (a.finished ? ` in ${a.seconds.toFixed(3)} s` : ` at ${(100 * a.lapShare).toFixed(1)}% of the lap (progress ${a.crashAt ?? '-'} units)`)
      + `; memory inputs during it: largest ${a.memoryPeak}, crash-ahead ${a.crashAheadPeak}`);
  }
}

// The table the idea is judged by.
console.log(`\n${args.track}, ${args.sessions} session(s), policy with ${policyInputs} inputs, memory ${args.memory ? 'on' : 'off'}, ${args.sample ? 'sampled' : 'top choice'}:`);
for (let attempt = 1; attempt <= args.attempts; attempt++) {
  const these = report.filter((a) => a.attempt === attempt);
  const laps = these.filter((a) => a.finished).map((a) => a.seconds);
  console.log(`  attempt ${attempt}: finished ${laps.length}/${these.length}`
    + (laps.length ? `, mean lap ${(laps.reduce((x, y) => x + y, 0) / laps.length).toFixed(3)} s` : '')
    + `, mean share of the lap ${(100 * these.reduce((x, a) => x + (a.finished ? 1 : a.lapShare), 0) / these.length).toFixed(1)}%`);
}
// Do crashes repeat? Of the crashed attempts after the first of a session,
// the share that ended within 20 units of where an earlier attempt of the
// same session ended. A memory can only help where this is high.
let later = 0, repeated = 0;
for (const a of report) {
  if (a.attempt === 1 || a.crashAt == null) continue;
  later++;
  if (report.some((b) => b.session === a.session && b.attempt < a.attempt && b.crashAt != null && Math.abs(b.crashAt - a.crashAt) <= 20)) repeated++;
}
if (later) console.log(`  crashes after attempt 1 that ended within 20 units of an earlier crash of the same session: ${repeated}/${later}`);
const seconds = (performance.now() - started) / 1000;
console.log(`  ${decisionsDriven} decisions in ${seconds.toFixed(1)} s (${(decisionsDriven / seconds).toFixed(0)} per second)`);

if (args.out) {
  const flat = new Float32Array(rows.length * ROW);
  rows.forEach((row, k) => flat.set(row, k * ROW));
  writeFileSync(`${args.out}.bin`, Buffer.from(flat.buffer));
  writeFileSync(`${args.out}.json`, JSON.stringify({ track: args.track, rows: rows.length, row: ROW, obsSize: MEMORY_OBS_SIZE, baseObsSize: OBS_SIZE, memSize: MEM_SIZE, scores: NUM_SCORES, report }, null, 1));
  console.log(`  wrote ${args.out}.bin (${statSync(`${args.out}.bin`).size} bytes) and ${args.out}.json`);
}
await menv.close();
