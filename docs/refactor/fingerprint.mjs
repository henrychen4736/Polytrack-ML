// Fingerprint of everything a refactor must not change: env_server (block
// and old scheme), rollout_child through sim/pool.mjs, and iqn_server.
//
// How: each server or pool child is driven with fixed seeds and fixed
// requests, and every reply (timings removed) is hashed. Two runs of the same
// code give the same hashes (checked), so any difference means behaviour
// changed. fp_before.json is from a worktree of commit 07e830c, before the
// refactor in plan.md. Takes about 10 s.
//
// Usage (from the project root):
//   node docs/refactor/fingerprint.mjs out.json
//   diff docs/refactor/fp_before.json out.json
//
// Local use only: drives the simulator; no network.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const hash = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 16);
// Timings vary run to run; obsIndex was added to env_server's ready message
// by the refactor itself (a new key, no other change).
const strip = (r) => { const { actorMs, stepMs, actMs, obsIndex, ...rest } = r; return rest; };
const out = {};

async function server(script, args, requests) {
  const child = spawn(process.execPath, [script, ...args], { cwd: ROOT, stdio: ['pipe', 'pipe', 'ignore'] });
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  const next = async () => JSON.parse((await lines.next()).value);
  const replies = [strip(await next())];
  for (const req of requests) { child.stdin.write(JSON.stringify(req) + '\n'); replies.push(strip(await next())); }
  child.stdin.write('{"cmd":"close"}\n');
  return replies;
}

const actor = 'rl/checkpoints/ppo_blkgen.best2.actor.bin';
const blockArgs = ['track=desert4', 'ticks=10', 'block=5', 'pedalEvery=5', 'lapFraction=0', 'seed=3', 'randomStart=0.5'];
const r1 = await server('rl/env_server.mjs', blockArgs, [
  { cmd: 'reset' },
  { cmd: 'rollout', steps: 400, weights: actor, hidden: 256 },
  { cmd: 'rollout', steps: 400, weights: actor, hidden: 256 },
  { cmd: 'demo', lap: 0 },
  { cmd: 'step', decision: [1, 2, 1, 0, 0, 0] },
]);
r1.forEach((r, k) => { out[`env_block_${k}`] = hash(r); });

const oldSteps = [{ cmd: 'reset', seed: 4 }];
for (let k = 0; k < 120; k++) oldSteps.push({ cmd: 'step', action: (k * 5) % 12 });
const r2 = await server('rl/env_server.mjs', ['track=summer1', 'ticks=10', 'seed=3'], oldSteps);
out.env_old = hash(r2);

// Old scheme with the policy choosing (7 scores per decision). No trained
// old-scheme network has the current 352 inputs (ppo_general3 has 335), so
// this is a fixed pseudo-random one, hidden width 64: it exercises the same
// code.
const oldActor = path.join(tmpdir(), 'fingerprint_random7.actor.bin');
{
  const h = 64, n = h * 352 + h + h * h + h + 7 * h + 7, a = new Float32Array(n);
  let s = 12345;
  for (let i = 0; i < n; i++) { s = (s * 1103515245 + 12345) >>> 0; a[i] = (s / 4294967296 - 0.5) * 0.3; }
  writeFileSync(oldActor, Buffer.from(a.buffer));
}
const r2b = await server('rl/env_server.mjs', ['track=summer1', 'ticks=10', 'seed=3', 'pedalEvery=5'], [
  { cmd: 'rollout', steps: 400, weights: oldActor, hidden: 64 },
]);
r2b.forEach((r, k) => { out[`env_old_rollout_${k}`] = r.error ? `error: ${r.error}` : hash(r); });

const r3 = await server('ideas/g1-6-offpolicy-rl/iqn_server.mjs', ['track=desert4', 'seed=3', 'randomStart=0.8'], [
  { cmd: 'rollout', steps: 200, weights: 'rl/checkpoints/g1-6-iqn_desert4.actor.bin', epsilon: 0.1 },
]);
r3.forEach((r, k) => { out[`iqn_${k}`] = hash(r); });

const { createPool } = await import(pathToFileURL(path.join(ROOT, 'sim/pool.mjs')));
const pool = await createPool('desert4', 1, '../rl/rollout_child.mjs', {
  actor: path.join(ROOT, actor), hidden: 256,
  env: { ticks: 10, block: 5, pedalEvery: 5, lapFraction: 0, maxOffLine: 40 },
});
const rolls = [];
rolls.push(await pool.runAll([{ cmd: 'prepare', prefix: [] }]));
rolls.push(await pool.runAll([{ cmd: 'roll', horizon: 300, sampleUntil: 150, seed: 5 }]));
rolls.push(await pool.runAll([{ cmd: 'prepare', prefix: rolls[1][0].decisions.slice(0, 80) }]));
rolls.push(await pool.runAll([{ cmd: 'roll', horizon: 400, sampleUntil: 0, seed: 0 }]));
pool.close();
rolls.forEach((r, k) => { out[`rollout_child_${k}`] = hash(r); });
out.rollout_child_greedy_end = { finished: rolls[3][0].finished, finishFrames: rolls[3][0].finishFrames, reason: rolls[3][0].reason };

writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
process.exit(0);
