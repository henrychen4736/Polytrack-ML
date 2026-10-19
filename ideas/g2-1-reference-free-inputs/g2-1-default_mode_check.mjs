// Proof that the route mode added to rl/racing_env.mjs leaves the DEFAULT mode
// (a human lap as reference, 352 inputs) exactly as it was.
//
// Why: training processes on this machine (the off-policy learner, PPO runs)
// start new simulators from rl/racing_env.mjs at any time. A change in the
// default observation, reward or episode ends would quietly change their
// training. So this script drives the environment through a fixed, seeded
// sequence of decisions and records everything that comes back; it is run
// once on the file as it was before the change (saved trace) and again after,
// and the two must agree number for number.
//
//   node ideas/g2-1-reference-free-inputs/g2-1-default_mode_check.mjs record <file.json>
//   node ideas/g2-1-reference-free-inputs/g2-1-default_mode_check.mjs compare <file.json>
//
// What is driven, all on desert4, one simulator at a time (about a minute):
//   A. block decisions (5 x 10 ms) with every kind of start switched on:
//      randomStart 0.5, failureStart 0.3, ownStart 0.5, kick 0.3, rotating
//      reference laps (refLaps 3, refEvery 4), lapFraction 0. 1500 decisions
//      from a seeded random driver that holds W most of the time, so episodes
//      end in every way and every reset path runs.
//   B. the old scheme (one action per 10 ms, block 0, all defaults): 800 steps.
//   C. demo() of human lap 1 with block 5 (the imitation examples).
//   D. mark() / rewind(): 40 decisions, rewind, the same 40 again.
//   E. rl/env_server.mjs's start-up line (the fields that existed before).
// Per decision the script keeps a SHA-1 of the observation, reward, end flags
// and info, so the trace file is small and the first difference is found
// exactly. Every number is compared as JavaScript prints it (full precision).
//
// Local use only: drives the local simulator; no network.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { RacingEnv } from '../../rl/racing_env.mjs';
import { createRng } from '../shared/rng.mjs';

const [mode, file] = process.argv.slice(2);
if (!['record', 'compare'].includes(mode) || !file) {
  console.error('usage: node ideas/g2-1-reference-free-inputs/g2-1-default_mode_check.mjs record|compare <file.json>');
  process.exit(2);
}
const hash = (value) => createHash('sha1').update(JSON.stringify(value)).digest('hex').slice(0, 16);
const trace = {};

/** A seeded random block decision: W held 90% of blocks, S 10%, steering anything. */
const blockDecision = (rng) => {
  const at = () => Math.floor(rng() * 5);
  return [Math.floor(rng() * 3), at(), rng() < 0.9 ? 1 : 0, at(), rng() < 0.1 ? 1 : 0, at()];
};

// ---- A. block decisions, every start kind ----------------------------------------
{
  const renv = await RacingEnv.create({ track: 'desert4', block: 5, randomStart: 0.5, failureStart: 0.3, ownStart: 0.5, kick: 0.3, refLaps: 3, refEvery: 4, lapFraction: 0, seed: 3 });
  const rng = createRng(11);
  const out = [];
  let r = await renv.reset();
  out.push(hash(r));
  const reasons = {};
  for (let k = 0; k < 1500; k++) {
    r = await renv.stepBlock(blockDecision(rng));
    out.push(hash(r));
    if (r.terminated || r.truncated) {
      reasons[r.info.reason] = (reasons[r.info.reason] ?? 0) + 1;
      out.push(hash(await renv.reset()));
    }
  }
  trace.A = { hashes: out, reasons, obsLength: r.obs.length };
  await renv.close();
}

// ---- B. old scheme, defaults ---------------------------------------------------
{
  const renv = await RacingEnv.create({ track: 'desert4' });
  const rng = createRng(5);
  const out = [];
  out.push(hash(await renv.reset()));
  const reasons = {};
  let action = 3;
  for (let k = 0; k < 800; k++) {
    // Keep the keys for a few steps at a time, as a driver would.
    if (rng() < 0.2) action = Math.floor(rng() * 12);
    const r = await renv.step(action);
    out.push(hash(r));
    if (r.terminated || r.truncated) {
      reasons[r.info.reason] = (reasons[r.info.reason] ?? 0) + 1;
      out.push(hash(await renv.reset({ startFraction: 0.3 })));
    }
  }
  trace.B = { hashes: out, reasons };
  await renv.close();
}

// ---- C. demo() of a human lap ------------------------------------------------
{
  const renv = await RacingEnv.create({ track: 'desert4', block: 5, lapFraction: 0, maxOffLine: 40 });
  const laps = JSON.parse(readFileSync(new URL('../../data/laps/desert4.json', import.meta.url), 'utf8'));
  const demo = await renv.demo(laps[1]);
  trace.C = { count: demo.count, obs: hash(Array.from(demo.obs)), actions: hash(Array.from(demo.actions)) };
  await renv.close();
}

// ---- D. mark and rewind ------------------------------------------------------
{
  const renv = await RacingEnv.create({ track: 'desert4', block: 5, lapFraction: 0, maxOffLine: 40 });
  await renv.reset({ startFraction: 0.2 });
  const mark = await renv.mark();
  const drive = async () => {
    const rng = createRng(9), out = [];
    for (let k = 0; k < 40; k++) {
      const r = await renv.stepBlock(blockDecision(rng));
      out.push(hash(r));
      if (r.terminated || r.truncated) break;
    }
    return out;
  };
  const first = await drive();
  await renv.rewind(mark);
  const second = await drive();
  trace.D = { first, second };
  await renv.close();
}

// ---- E. the server's start-up line ------------------------------------------
{
  const child = spawnSync(process.execPath, ['rl/env_server.mjs', 'track=desert4', 'block=5'], {
    cwd: new URL('../../', import.meta.url), input: '{"cmd":"close"}\n', encoding: 'utf8', timeout: 60000,
  });
  const ready = JSON.parse(child.stdout.split('\n')[0]);
  // Only the fields the server sent before route mode existed.
  const old = ['ready', 'obsSize', 'obsIndex', 'numActions', 'block', 'track', 'ticks', 'pedalEvery', 'maxTicks', 'lineLength', 'humanFrames'];
  trace.E = Object.fromEntries(old.map((k) => [k, ready[k]]));
}

if (mode === 'record') {
  writeFileSync(file, JSON.stringify(trace));
  console.log(`recorded ${file}: A ${trace.A.hashes.length} entries (episodes ended: ${JSON.stringify(trace.A.reasons)}), B ${trace.B.hashes.length} (${JSON.stringify(trace.B.reasons)}), C ${trace.C.count} demo decisions, D ${trace.D.first.length}+${trace.D.second.length}, E ${JSON.stringify(trace.E)}`);
} else {
  const before = JSON.parse(readFileSync(file, 'utf8'));
  let bad = 0;
  for (const part of ['A', 'B']) {
    const a = before[part].hashes, b = trace[part].hashes;
    const first = a.findIndex((h, k) => h !== b[k]);
    const same = a.length === b.length && first < 0;
    console.log(`${same ? 'SAME' : 'DIFF'} ${part}: ${b.length} entries${same ? '' : `, first difference at entry ${first} (lengths ${a.length} / ${b.length})`}; episodes ended ${JSON.stringify(trace[part].reasons)}`);
    if (!same) bad++;
  }
  for (const part of ['C', 'D', 'E']) {
    const same = JSON.stringify(before[part]) === JSON.stringify(trace[part]);
    console.log(`${same ? 'SAME' : 'DIFF'} ${part}: ${part === 'C' ? `${trace.C.count} demo decisions` : part === 'D' ? `${trace.D.first.length} decisions, rewound and repeated` : JSON.stringify(trace.E)}`);
    if (!same) bad++;
  }
  // Rewinding must give the same continuation (a property, not a comparison).
  const repeat = JSON.stringify(trace.D.first) === JSON.stringify(trace.D.second);
  console.log(`${repeat ? 'SAME' : 'DIFF'} D: the continuation after rewind() equals the first one`);
  if (!repeat) bad++;
  console.log(bad ? `${bad} part(s) differ` : 'default mode unchanged');
  process.exit(bad ? 1 : 0);
}
