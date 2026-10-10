// Smoke test of everything in ideas/shared/. One process, one simulator alive
// at a time, about a minute. Run from the project root:
//
//   node ideas/shared/smoke_test.mjs [track] [actor file]
//   node ideas/shared/smoke_test.mjs desert4 rl/checkpoints/ppo_sr1_desert4.u800.actor.bin
//
// Each line printed is one claim of CONTRACT.md, checked: PASS / FAIL, with
// the measured numbers the comments in the modules quote.
import { existsSync, unlinkSync } from 'node:fs';
import { TRACKS, ROOT, humanLaps, loadLap, keysToRecording, recordingToKeys, keysToTimeline, timelineToKeys, sameKeys, keysToDecisions, decisionsToKeys } from './laps.mjs';
import { SimSession } from './sim_session.mjs';
import { verifyAndSave } from './verify.mjs';
import { loadTrackInfo } from './track_info.mjs';
import { loadPolicy, loadValue, createRng } from './policy.mjs';
import { openBlockEnv, fromStart, roll } from './block_rollout.mjs';

const [track = 'desert4', actorFile = `rl/checkpoints/ppo_sr1_${track}.u800.actor.bin`] = process.argv.slice(2);
let failures = 0;
const check = (ok, text) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${text}`); if (!ok) failures++; };
const t0 = Date.now();

// ---- laps.mjs ------------------------------------------------------------------
const laps = humanLaps(track);
const human = laps[0];
check(laps.length === 10 && human.keys.length === human.frames, `humanLaps(${track}): ${laps.length} laps, fastest ${human.frames} ms`);
check(sameKeys(recordingToKeys(keysToRecording(human.keys), human.frames), human.keys), 'keys -> recording -> keys is exact');
check(sameKeys(timelineToKeys(keysToTimeline(human.keys), human.frames), human.keys), 'keys -> timeline -> keys is exact');
for (const name of ['desert4', 'summer1', 'winter2']) {
  const lap = humanLaps(name)[0];
  const { decisions, wrongTicks } = keysToDecisions(lap.keys);
  console.log(`     keysToDecisions(human ${name}): ${decisions.length} decisions, ${wrongTicks} of ${lap.frames} ticks differ (${(100 * wrongTicks / lap.frames).toFixed(1)}%)`);
}
console.log(`     gates per track: ${TRACKS.map((name) => `${name} ${loadTrackInfo(name).path.gates.length}`).join(', ')}`);

// ---- sim_session.mjs + track_info.mjs --------------------------------------------
const info = loadTrackInfo(track);
const sim = await SimSession.create(track);
await sim.restart();
await sim.drive(human.keys.slice(0, 5000));
const point = await sim.save();
const motion = sim.motion();
const speed = Math.hypot(...motion.velocity) * 3.6;
check(Math.abs(speed - sim.state.speedKmh) < 0.02 * sim.state.speedKmh + 1, `motion(): |velocity| ${speed.toFixed(1)} km/h against the speedometer's ${sim.state.speedKmh.toFixed(1)}; spin ${motion.spin.map((v) => v.toFixed(2))} rad/s`);
// The rest of the lap in 100 ms pieces, watching the reference-free progress.
let worstDip = 0, last = info.progress(sim.state).distance, r;
for (let t = 5000; t < human.frames && !sim.finished; t += 100) {
  r = await sim.drive(human.keys.slice(t, t + 100));
  const now = info.progress(sim.state).distance;
  worstDip = Math.max(worstDip, last - now);
  last = Math.max(last, now);
}
check(r.finished && r.finishFrames === human.frames, `SimSession drives the human lap to the finish on tick ${r.finishFrames} (human: ${human.frames}), ${sim.keys.length} keys kept`);
check(info.progress(sim.state).fraction === 1, `progress(): 1 at the finish; path ${info.path.length.toFixed(0)} units over ${info.path.gates.length} gates; largest dip along the human lap ${worstDip.toFixed(1)} units`);
await sim.load(point);
check(sim.tick === 5000, `load(point) puts the clock back to ${sim.tick}; a point stores ${(point.bytes / 1e6).toFixed(2)} MB`);
const again = await sim.drive(human.keys.slice(5000));
check(again.finishFrames === human.frames, `the same keys from the loaded point finish on the same tick (${again.finishFrames})`);
// A different continuation from the same point really is different.
await sim.load(point);
const other = await sim.hold({ up: true, left: true }, 1500);
check(!other.finished && other.tick === 6500, `hold() from the point: tick ${other.tick}, ${other.contactTicks} contact ticks, checkpoint ${other.state.nextCheckpointIndex}`);
await sim.close();

// ---- verify.mjs ------------------------------------------------------------------
const v = await verifyAndSave({ track, keys: human.keys, name: 'shared-smoke' });
check(v.ok && v.finishFrames === human.frames, `verifyAndSave(human lap): Verify ${v.verified}, off-by-one rejected ${v.offByOneRejected}, ${v.finishFrames} ms, wrote ${v.files.length} files`);
const reloaded = loadLap(`runs/shared-smoke_${track}.json`), reloaded2 = loadLap(`runs/shared-smoke_${track}.recording.json`);
check(sameKeys(reloaded.keys, human.keys) && sameKeys(reloaded2.keys, human.keys), 'loadLap reads both saved files back to the same keys');
for (const file of v.files) unlinkSync(new URL(file, ROOT)); // the test's own files
const bad = await verifyAndSave({ track, keys: human.keys.slice(0, 3000), name: 'shared-smoke' });
check(!bad.ok && !bad.finished && bad.files.length === 0, 'verifyAndSave(first 3 s only): not finished, nothing written');
let refused = false;
try { await verifyAndSave({ track, keys: human.keys, name: 'rollout' }); } catch { refused = true; }
check(refused, 'verifyAndSave refuses a run name without an idea prefix');

// ---- policy.mjs + block_rollout.mjs ------------------------------------------------
if (!existsSync(new URL(actorFile, ROOT))) {
  console.log(`SKIP policy and block rollout: no ${actorFile}`);
} else {
  const policy = loadPolicy(actorFile);
  const renv = await openBlockEnv(track);
  let obs = await fromStart(renv);
  const lp = policy.logProb(obs, policy.decide(obs));
  check(lp <= 0 && lp > -20, `loadPolicy: hidden ${policy.hidden}, log-probability of its own top first decision ${lp.toFixed(2)}`);
  const lap = await roll(renv, obs, { policy, horizon: 2000 });
  console.log(`     policy's top-choice lap: ${lap.reason} at tick ${lap.tick}, ${lap.decisions.length} decisions${lap.finished ? `, ${lap.finishFrames} ms` : ''}`);
  // decisionsToKeys must give exactly the keys the environment held.
  const keys = decisionsToKeys(lap.decisions);
  const held = renv.controlsPerTick;
  check(sameKeys(keys.slice(0, held.length), held.map((c) => ({ ...c }))), `decisionsToKeys matches the ${held.length} keys the environment actually held`);
  const back = keysToDecisions(keys);
  check(back.wrongTicks === 0, `keysToDecisions of a block-driven lap is exact (${back.wrongTicks} wrong ticks)`);
  if (lap.finished) {
    const pv = await verifyAndSave({ track, keys, name: 'shared-smoke', save: false });
    check(pv.ok && pv.finishFrames === lap.finishFrames, `the policy's lap passes Verify at ${pv.finishFrames} ms (environment said ${lap.finishFrames})`);
  }
  // Mark / rewind: two identical continuations of one mark agree to the tick.
  obs = await fromStart(renv);
  const first = await roll(renv, obs, { explicit: lap.decisions.slice(0, 100) });
  const mark = await renv.mark();
  const a = await roll(renv, first.obs, { policy, horizon: 60, sampleUntil: 20, rng: createRng(7) });
  ({ obs } = await renv.rewind(mark));
  const b = await roll(renv, obs, { policy, horizon: 60, sampleUntil: 20, rng: createRng(7) });
  check(a.tick === b.tick && a.progress === b.progress, `roll() twice from one mark: tick ${a.tick} / ${b.tick}, progress ${a.progress.toFixed(3)} / ${b.progress.toFixed(3)}; a mark stores ${(mark.handle.bytes / 1e6).toFixed(2)} MB`);
  const criticFile = actorFile.replace('.actor.bin', '.critic.bin');
  if (existsSync(new URL(criticFile, ROOT))) {
    const value = loadValue(criticFile);
    const start = value(await fromStart(renv));
    check(Number.isFinite(start), `loadValue: value at the start line ${start.toFixed(1)}, 5 s in ${value(first.obs).toFixed(1)}`);
  } else console.log(`SKIP loadValue: no ${criticFile} (python ideas/shared/export_critic.py <checkpoint>)`);
  await renv.close();
}

console.log(`${failures ? `${failures} FAILED` : 'all passed'} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(failures ? 1 : 0);
