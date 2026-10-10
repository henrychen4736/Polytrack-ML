// Smoke test of the lookahead driver: on a track the generalist was NOT
// trained on, how far do the plain policy and the lookahead driver get from
// the start line, with the same seeds? One process, one simulator, about
// 1.5 to 2 minutes with training running on the machine.
//
//   node ideas/g2-4-lookahead-driving/smoke.mjs [track] [seeds] [actor file]
//   node ideas/g2-4-lookahead-driving/smoke.mjs winter4 10,12
//
// The generalist (ppo_blkgen.best2) was trained on 14 tracks; desert3,
// summer3 and winter4 are the three official tracks it has not seen.
//
// Checks (PASS / FAIL, exit code 1 on any FAIL):
//   - the lookahead driver gets at least as far as the plain policy on every seed
//   - the lookahead driver's committed decisions, driven again from the start
//     line without any lookahead, end on the same tick (so the lap it reports
//     is a lap the car really drives, not an artefact of the save states)
//   - any lap it finished passes the game's Verify at the tick it reported
import { openBlockEnv, fromStart, roll } from '../shared/block_rollout.mjs';
import { loadPolicy } from '../shared/policy.mjs';
import { decisionsToKeys } from '../shared/laps.mjs';
import { verifyAndSave } from '../shared/verify.mjs';
import { driveLap } from './lookahead.mjs';

const [track = 'winter4', seedList = '10,12', actor = 'rl/checkpoints/ppo_blkgen.best2.actor.bin'] = process.argv.slice(2);
const seeds = seedList.split(',').map(Number);
let failures = 0;
const check = (ok, text) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${text}`); if (!ok) failures++; };
const t0 = Date.now();

const policy = loadPolicy(actor);
const renv = await openBlockEnv(track);
const describe = (lap) => (lap.finished ? `finished in ${(lap.finishFrames / 1000).toFixed(3)} s` : `${lap.reason} at ${(100 * lap.fraction).toFixed(1)}% of the line`);
console.log(`${track}, ${actor}; reference (human) lap ${(renv.human.frames / 1000).toFixed(3)} s`);

let fastest = null;
for (const seed of seeds) {
  // The plain policy as the generalist is normally tested: sampled.
  const plain = await driveLap(renv, policy, { mode: 'plain', sample: true, seed });
  const ahead = await driveLap(renv, policy, { mode: 'lazy', seed });
  console.log(`  seed ${seed}: plain ${describe(plain)} | lookahead ${describe(ahead)} ` +
    `(${ahead.troubled} of ${ahead.replans} replans in trouble, ${ahead.rescued} rescued, ${ahead.backups} backed up; ` +
    `${ahead.seconds.toFixed(0)} s wall = ${(ahead.seconds / (ahead.tick / 1000)).toFixed(1)}x real time, ${(ahead.simTicks / ahead.tick).toFixed(1)}x the lap's ticks)`);
  check(ahead.finished || ahead.fraction >= plain.fraction - 1e-9, `seed ${seed}: lookahead gets at least as far as the plain policy`);
  // Drive the committed decisions again, as given, from the start line.
  const again = await roll(renv, await fromStart(renv), { explicit: ahead.decisions });
  check(again.tick === ahead.tick && again.finished === ahead.finished, `seed ${seed}: the committed decisions driven again end on the same tick (${again.tick})`);
  if (ahead.finished && (!fastest || ahead.finishFrames < fastest.finishFrames)) fastest = ahead;
}
if (fastest) {
  // Verify replaces this simulator's car, so it comes last. Nothing is saved.
  const r = await verifyAndSave({ track, keys: decisionsToKeys(fastest.decisions), name: 'g2-4-smoke', env: renv.env, save: false });
  check(r.ok && r.finishFrames === fastest.finishFrames, `the fastest lookahead lap passes Verify at ${fastest.finishFrames} ticks`);
} else console.log('     no lookahead lap finished, so nothing to verify');
await renv.close();
console.log(`${failures ? `${failures} FAILED` : 'all passed'} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(failures ? 1 : 0);
