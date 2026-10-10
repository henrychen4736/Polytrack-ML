// Independent re-check of a claimed lap time, used by the g1-1, g1-2 and g1-5
// tests. It deliberately does NOT go through ideas/shared/verify.mjs or any
// idea's code: only the recording file, sim/env.mjs and the game's Verify.
import { readFileSync, existsSync } from 'node:fs';
import { Env, loadTrack } from '../../../sim/env.mjs';
import { decodeRecording, toDense, fromDense } from '../../../sim/recording.mjs';
import { ROOT } from './harness.mjs';

/**
 * Check one claim "runs/<run>_<track>.recording.json is a lap of `claimed`
 * ticks, faster than the best human lap".
 *
 *   env      a sim/env.mjs Env (its car is replaced)
 *   check    the test's check(ok, text)
 * Checks, each its own PASS / FAIL line:
 *   1. the file says `claimed` ticks;
 *   2. replayed from the start line the car finishes on exactly that tick;
 *   3. stopped one tick earlier it has not finished;
 *   4. the game's Verify accepts `claimed` and rejects `claimed - 1`;
 *   5. the sibling runs/<run>_<track>.json holds the same keys;
 *   6. lap 0 of data/laps/<track>.json, replayed the same way, finishes on
 *      its own stated tick, no other lap in that file is faster, and that
 *      tick is later than `claimed`.
 * Returns { recording, timeline, human } for further checks by the caller.
 */
export async function checkHeadline(env, check, { run, track, claimed }) {
  const file = `runs/${run}_${track}.recording.json`;
  if (!check(existsSync(new URL(file, ROOT)), `${file} exists`)) return null;
  const saved = JSON.parse(readFileSync(new URL(file, ROOT), 'utf8'));
  const inputs = loadTrack(track);
  check(saved.frames === claimed && saved.track === track, `${file}: says ${saved.frames} ticks on ${saved.track} (claimed ${claimed})`);
  const full = await env.evaluate(inputs, saved.recording, claimed + 2000);
  check(full.finished && full.finishFrames === claimed, `${run} ${track}: replayed from the start line it finishes on tick ${full.finishFrames} (claimed ${claimed})`);
  const short = await env.evaluate(inputs, saved.recording, claimed - 1);
  check(!short.finished, `${run} ${track}: stopped at tick ${claimed - 1} it has NOT finished`);
  const verify = (targetFrames) => env.worker.verify({ ...inputs, carRecording: saved.recording, targetFrames });
  const [at, before] = [await verify(claimed), await verify(claimed - 1)];
  check(at === true && before === false, `${run} ${track}: the game's Verify accepts ${claimed} (${at}) and rejects ${claimed - 1} (${!before})`);

  const timeline = decodeRecording(saved.recording);
  const sibling = `runs/${run}_${track}.json`;
  if (existsSync(new URL(sibling, ROOT))) {
    const other = JSON.parse(readFileSync(new URL(sibling, ROOT), 'utf8'));
    check(other.finishFrames === claimed && other.controlsPerTick.length === claimed &&
      JSON.stringify(fromDense(other.controlsPerTick)) === JSON.stringify(fromDense(toDense(timeline, claimed))),
    `${sibling}: ${other.finishFrames} ticks and the same keys as the recording`);
  }

  const laps = JSON.parse(readFileSync(new URL(`data/laps/${track}.json`, ROOT), 'utf8'));
  const human = laps[0];
  const h = await env.evaluate(inputs, human.recording, human.frames + 2000);
  check(h.finished && h.finishFrames === human.frames && laps.every((lap) => lap.frames >= human.frames),
    `${track}: lap 0 of data/laps replays to its stated ${human.frames} ticks (got ${h.finishFrames}) and is the fastest of the ${laps.length}`);
  check(claimed < human.frames, `${run} ${track}: ${claimed} is ${human.frames - claimed} ms FASTER than the best human lap (${human.frames})`);
  return { recording: saved.recording, timeline, human };
}

export { Env };
