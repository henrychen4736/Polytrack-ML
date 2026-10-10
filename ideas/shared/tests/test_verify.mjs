// verify.mjs: scoreKeys and verifyAndSave on desert4. One simulator at a time.
// The point of this module is that a time it accepts is the game's own, so
// the checks are about exactly which tick is accepted and what is written.
import { existsSync, readFileSync } from 'node:fs';
import { scoreKeys, verifyAndSave } from '../verify.mjs';
import { humanLaps, loadLap, sameKeys, recordingToTimeline, keysToTimeline, ROOT } from '../laps.mjs';
import { Env, loadTrack } from '../../../sim/env.mjs';
import { checker, removeFiles } from './harness.mjs';

const { check, eq, throws } = checker();
const human = humanLaps('desert4')[0];
const F = human.frames; // 21750
const LEFT = { up: true, right: false, down: false, left: true, reset: false };
const NAME = 'shared-test-verify';
const files = [`runs/${NAME}_desert4.json`, `runs/${NAME}_desert4.recording.json`];
removeFiles(files);

const env = await Env.create();
const track = loadTrack('desert4');
const gameVerify = (recording, targetFrames) => env.worker.verify({ ...track, carRecording: recording, targetFrames });

// ---- scoreKeys ---------------------------------------------------------------------
let s = await scoreKeys(env, 'desert4', human.keys);
eq([s.finished, s.finishFrames], [true, F], `scoreKeys(human lap): finished on tick ${F}`);
eq(recordingToTimeline(s.recording), keysToTimeline(human.keys), 'scoreKeys returns the recording of the keys it was given');
s = await scoreKeys(env, track, human.keys, F - 1);
check(s.finished === false, 'scoreKeys with maxFrames one tick short of the finish: not finished');
s = await scoreKeys(env, track, human.keys, F);
check(s.finished === true && s.finishFrames === F, 'scoreKeys with maxFrames exactly the finish tick: finished');
s = await scoreKeys(env, track, human.keys.slice(0, 3000));
eq([s.finished, s.checkpoints], [false, 0], 'scoreKeys(first 3 s): not finished, 0 checkpoints (default limit: 1000 ticks past the keys)');
s = await scoreKeys(env, track, []);
check(s.finished === false, 'scoreKeys([]): not finished');

// ---- the game's Verify itself --------------------------------------------------------
eq([await gameVerify(human.recording, F), await gameVerify(human.recording, F - 1), await gameVerify(human.recording, F + 1)], [true, false, false],
  "the game's Verify accepts the human recording on tick 21750 only: 21749 and 21751 are both rejected");

// ---- verifyAndSave, nothing written ---------------------------------------------------
let v = await verifyAndSave({ track: 'desert4', keys: human.keys, name: NAME, env, save: false });
eq([v.ok, v.finished, v.finishFrames, v.seconds, v.verified, v.offByOneRejected, v.roundTrip, v.files], [true, true, F, 21.75, true, true, true, []],
  'verifyAndSave(human lap, save: false): ok, 21750, verified, off-by-one rejected, no files');
check(!files.some((f) => existsSync(new URL(f, ROOT))), 'save: false really writes nothing');
// The Env passed in is still usable afterwards (it is not closed).
s = await scoreKeys(env, track, human.keys);
check(s.finishFrames === F, 'an Env passed to verifyAndSave is left open');
v = await verifyAndSave({ track: 'desert4', keys: human.keys, save: false });
check(v.ok && v.finishFrames === F, 'verifyAndSave without an Env (boots and closes its own) and without a name when save is false');

// ---- a lap that does not finish ---------------------------------------------------------
v = await verifyAndSave({ track: 'desert4', keys: human.keys.slice(0, 3000), name: NAME, env });
eq([v.ok, v.finished, v.finishFrames, v.files], [false, false, null, []], 'verifyAndSave(first 3 s): ok false, finished false, no files');
check(!files.some((f) => existsSync(new URL(f, ROOT))), 'an unfinished lap writes nothing under runs/');
v = await verifyAndSave({ track: 'desert4', keys: [], name: NAME, env });
check(v.ok === false && v.finished === false, 'verifyAndSave([]): ok false');
// The human lap with its last 1.5 s replaced: whatever it does must be consistent.
v = await verifyAndSave({ track: 'desert4', keys: [...human.keys.slice(0, F - 1500), ...Array(3000).fill(LEFT)], name: NAME, env, save: false });
check(v.finished ? (v.ok && v.finishFrames !== F) : (!v.ok && v.files.length === 0), `a lap spoiled 1.5 s before the line: ${v.finished ? `finishes on ${v.finishFrames}, verified at that tick` : 'does not finish, not ok'}`);

// ---- keys longer or shorter than the lap -------------------------------------------------
v = await verifyAndSave({ track: 'desert4', keys: [...human.keys, ...Array(400).fill(LEFT)], name: NAME, env });
check(v.ok && v.finishFrames === F, '400 keys too many: still 21750 (the extra keys are cut)');
{
  const saved = JSON.parse(readFileSync(new URL(files[0], ROOT), 'utf8')), rec = JSON.parse(readFileSync(new URL(files[1], ROOT), 'utf8'));
  eq([saved.track, saved.finishFrames, saved.finished, saved.controlsPerTick.length, rec.track, rec.frames], ['desert4', F, true, F, 'desert4', F],
    'the two files written: track, finish tick, and exactly finishFrames keys');
  check(sameKeys(saved.controlsPerTick, human.keys), 'the saved keys are the lap, without the extra ones');
  check(await gameVerify(rec.recording, F) && !(await gameVerify(rec.recording, F - 1)), "the SAVED recording string passes the game's Verify on 21750 and is rejected on 21749");
  const a = loadLap(files[0]), b = loadLap(files[1]);
  check(sameKeys(a.keys, human.keys) && sameKeys(b.keys, human.keys), 'loadLap reads both files back to the lap');
}
removeFiles(files);
// Keys that stop 40 ticks short: the final keys are held to the line (a recording is a list of flips).
v = await verifyAndSave({ track: 'desert4', keys: human.keys.slice(0, F - 40), name: NAME, env });
check(v.finished && v.ok, `keys that stop 40 ticks before the line: the last keys are held, it finishes on ${v.finishFrames} and verifies`);
if (v.ok) {
  const saved = JSON.parse(readFileSync(new URL(files[0], ROOT), 'utf8'));
  check(saved.controlsPerTick.length === v.finishFrames && saved.controlsPerTick.every((c) => c != null), 'the saved lap is padded to exactly finishFrames keys');
  check(sameKeys(saved.controlsPerTick.slice(F - 40), Array(v.finishFrames - (F - 40)).fill(human.keys[F - 41])), 'and the padding is the last key given');
}
removeFiles(files);

// ---- names and arguments -------------------------------------------------------------------
for (const bad of ['rollout', 'g3-1-x', 'g1-1', 'g1-1-', 'g1-1-a b', 'x-g1-1-a', 'g1-1-a/b', '../g1-1-a', undefined]) {
  await throws(() => verifyAndSave({ track: 'desert4', keys: human.keys, name: bad, env }), `verifyAndSave refuses the run name ${JSON.stringify(bad)}`);
}
await throws(() => verifyAndSave({ track, keys: human.keys, name: NAME, env }), 'verifyAndSave refuses a track that is not a name');
check(!files.some((f) => existsSync(new URL(f, ROOT))), 'the test left none of its files in runs/');
await env.close();
