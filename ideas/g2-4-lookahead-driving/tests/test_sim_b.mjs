// (1) The three saved laps the README claims, checked from the files alone on
// the bare simulator: they finish on the stated tick and pass the game's
// Verify. (2) A second seed on winter4, plain against lookahead.
// One simulator at a time.
//
//   node ideas/g2-4-lookahead-driving/tests/test_sim_b.mjs
import { readFileSync } from 'node:fs';
import { Env, loadTrack } from '../../../sim/env.mjs';
import { openBlockEnv, fromStart, roll } from '../../shared/block_rollout.mjs';
import { loadPolicy } from '../../shared/policy.mjs';
import { decisionsToKeys, keysToDecisions, keysToRecording, recordingToKeys, sameKeys, humanLaps, ROOT } from '../../shared/laps.mjs';
import { driveLap } from '../lookahead.mjs';
import { check, finish } from './check.mjs';

// --- 1. the saved laps ---------------------------------------------------------------
const CLAIMED = { winter4: 19819, desert3: 20793, summer3: 21503 };
const env = await Env.create();
for (const [track, frames] of Object.entries(CLAIMED)) {
  const lap = JSON.parse(readFileSync(new URL(`runs/g2-4-gen_${track}.json`, ROOT), 'utf8'));
  const rec = JSON.parse(readFileSync(new URL(`runs/g2-4-gen_${track}.recording.json`, ROOT), 'utf8'));
  check(lap.track === track && lap.finishFrames === frames && lap.controlsPerTick.length === frames && rec.frames === frames,
    `${track}: both files state ${frames} ticks (${(frames / 1000).toFixed(3)} s) and hold that many keys`);
  check(sameKeys(recordingToKeys(rec.recording, frames), lap.controlsPerTick) && keysToRecording(lap.controlsPerTick) === rec.recording,
    `${track}: the recording string and the per-tick keys are the same lap`);
  const inputs = loadTrack(track);
  const played = await env.evaluate(inputs, rec.recording, frames + 2000);
  check(played.finished && played.finishFrames === frames, `${track}: played from the start line on the bare simulator it finishes on tick ${played.finishFrames}`);
  const verify = (targetFrames) => env.worker.verify({ ...inputs, carRecording: rec.recording, targetFrames });
  const at = await verify(frames), before = await verify(frames - 1), after = await verify(frames + 1);
  check(at === true && !before && !after, `${track}: the game's Verify passes at ${frames} and rejects ${frames - 1} and ${frames + 1}`);
  // The lap is what the driver produces: an empty tick, then block decisions
  // with no key change the decisions cannot express.
  const { wrongTicks } = keysToDecisions(lap.controlsPerTick);
  check(wrongTicks === 0, `${track}: the keys are exactly a sequence of block decisions (${wrongTicks} ticks differ)`);
  const human = humanLaps(track)[0].frames;
  console.log(`     ${track}: ${(frames / 1000).toFixed(3)} s against the fastest human lap ${(human / 1000).toFixed(3)} s`);
}
await env.close();

// --- 2. winter4, seed 12 ----------------------------------------------------------------
const policy = loadPolicy('rl/checkpoints/ppo_blkgen.best2.actor.bin');
const renv = await openBlockEnv('winter4');
const plain = await driveLap(renv, policy, { mode: 'plain', sample: true, seed: 12 });
const top = await driveLap(renv, policy, { mode: 'plain' });
const lazy = await driveLap(renv, policy, { mode: 'lazy', seed: 12 });
console.log(`     seed 12: plain ${plain.reason} at ${(100 * plain.fraction).toFixed(1)}%; top choices ${top.reason} at ${(100 * top.fraction).toFixed(1)}%; ` +
  `lazy ${lazy.finished ? lazy.finishFrames : lazy.reason}, ${(lazy.simTicks / lazy.tick).toFixed(1)}x ticks, ${lazy.backups} back-ups, ${lazy.seconds.toFixed(0)} s wall`);
check(!plain.finished && plain.fraction > 0.66 && plain.fraction < 0.68, `README: plain sampled, seed 12, stops near 66.8% on winter4 (${(100 * plain.fraction).toFixed(1)}%)`);
check(!top.finished && top.reason === 'off track' && Math.abs(top.fraction - 0.364) < 0.005, `README: the top-choice policy goes off track at 36.4% on winter4 (${top.reason} at ${(100 * top.fraction).toFixed(1)}%)`);
check(lazy.finished && lazy.finishFrames === 21726, `README: lazy lookahead, seed 12, finishes in 21.726 s (got ${lazy.finished ? lazy.finishFrames : lazy.reason})`);
check(Math.abs(lazy.simTicks / lazy.tick - 12.5) < 0.1, `README: at 12.5x the lap's ticks (got ${(lazy.simTicks / lazy.tick).toFixed(2)}x)`);
// The lazy driver starts as the top-choice policy: its lap begins with the
// top-choice attempt's decisions up to the first replan that saw trouble.
const shared = lazy.decisions.findIndex((d, k) => JSON.stringify(d) !== JSON.stringify(top.decisions[k]));
check(shared >= 10 && shared % 10 === 0, `lazy follows the top choices until a replan point where trouble is in view (first ${shared} decisions shared)`);
const replay = await roll(renv, await fromStart(renv), { explicit: lazy.decisions });
check(replay.tick === lazy.tick && replay.finishFrames === lazy.finishFrames, `seed 12: the committed decisions alone end on tick ${replay.tick} (driver said ${lazy.tick})`);
const keys = decisionsToKeys(lazy.decisions);
const inputs = loadTrack('winter4');
const played = await renv.env.evaluate(inputs, keysToRecording(keys), keys.length + 1000);
const recording = keysToRecording(keys.slice(0, played.finishFrames ?? keys.length));
const ok = played.finished && await renv.env.worker.verify({ ...inputs, carRecording: recording, targetFrames: played.finishFrames });
check(played.finishFrames === lazy.finishFrames && ok === true, `seed 12: as keys on the bare simulator it finishes on tick ${played.finishFrames} and passes Verify`);
await renv.close();
finish();
