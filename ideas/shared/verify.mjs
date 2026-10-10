// Finish-and-verify: the one honest way to claim a lap time.
//
// A lap time counts only if the game's own Verify routine, given the lap's
// recording, finishes on exactly the tick we claim (BRIEF.md rule 8). The
// steps are the same as scripts/export_recording.mjs, which is a command-line
// script reading a file; this is the same thing as a function taking keys, so
// a search can call it on its result without going through a file first.
//
//   const r = await verifyAndSave({ track: 'desert4', keys, name: 'g1-4-beam' });
//   r.ok, r.finishFrames, r.files
//
// Local use only: nothing here contacts Kodub's servers, and the files written
// are for local ghosts; they must not be submitted to the leaderboards.
import { writeFileSync, mkdirSync } from 'node:fs';
import { Env, loadTrack } from '../../sim/env.mjs';
import { keysToRecording, recordingToKeys, sameKeys, ROOT } from './laps.mjs';

/** Names under runs/ must start with the idea's id (g1-1 .. g2-5) or
 *  'shared', then '-': runs/ already holds about two thousand files from
 *  training and evaluation, several of them being read by running jobs, and
 *  twelve agents write there at once. */
const NAME = /^(g[12]-\d|shared)-[A-Za-z0-9_-]+$/;

/**
 * Play per-tick keys from the start line and report the result, without
 * saving anything: { finished, finishFrames, checkpoints, recording }.
 *
 *   env        a sim/env.mjs Env. NOTE this replaces the Env's car, so every
 *              save state taken on it (and any SimSession point or RacingEnv
 *              mark on the same simulator) is dead afterwards.
 *   track      track name, or CreateCar inputs for a track of your own
 *   maxFrames  give up at this tick. Default: 1000 past the end of `keys`.
 *              After the last key the car goes on holding the final keys
 *              (a recording is a list of flips), so a lap whose keys stop a
 *              little short of the line can still finish.
 * About 0.3 s for a 22 s lap.
 */
export async function scoreKeys(env, track, keys, maxFrames = keys.length + 1000) {
  const recording = keysToRecording(keys);
  const result = await env.evaluate(typeof track === 'string' ? loadTrack(track) : track, recording, maxFrames);
  return { ...result, recording };
}

/**
 * Check a lap with the game's Verify and, if it passes, save it under runs/.
 *
 *   track   track name (must be a name here: the files are named after it)
 *   keys    per-tick keys from the start line (laps.mjs)
 *   name    run name, '<idea id>-<anything>', e.g. 'g1-4-beam'
 *   env     optional Env to use (its car is replaced, see scoreKeys). Without
 *           it a simulator is booted for the check and closed again (+1 s).
 *   save    false to verify only
 *
 * What it does: plays the keys to find the finish tick F; trims the keys to
 * F; checks the recording string decodes back to the same keys; asks Verify
 * whether the lap finishes on tick F (must pass) and on tick F - 1 (must
 * fail, or Verify is not checking what we think).
 *
 * Returns { ok, finished, finishFrames, seconds, recording, roundTrip,
 *           verified, offByOneRejected, files }.
 *   ok      all three checks passed; only then are files written:
 *     runs/<name>_<track>.json            { track, finishFrames, finished, controlsPerTick }
 *     runs/<name>_<track>.recording.json  { track, frames, recording }
 *   The first is what scripts/export_recording.mjs and watch_ghost.mjs read;
 *   the second is what `refFile` (rl/racing_env.mjs), rl/lap_bc.py and
 *   laps.mjs loadLap take.
 * A lap that does not finish returns ok: false, finished: false and writes nothing.
 */
export async function verifyAndSave({ track, keys, name, env = null, save = true }) {
  if (typeof track !== 'string') throw new Error('verifyAndSave: track must be a track name');
  if (save && !NAME.test(name ?? '')) throw new Error(`verifyAndSave: run name "${name}" must look like g1-4-something (idea id, "-", then letters, digits, "_" or "-")`);
  const own = env ? null : await Env.create();
  const sim = env ?? own;
  try {
    const trackInputs = loadTrack(track);
    const played = await scoreKeys(sim, trackInputs, keys);
    if (!played.finished) return { ok: false, finished: false, finishFrames: null, checkpoints: played.checkpoints, files: [] };
    const finishFrames = played.finishFrames;
    // Exactly finishFrames keys: cut the extra, or repeat the final keys.
    const lapKeys = keys.slice(0, finishFrames);
    while (lapKeys.length < finishFrames) lapKeys.push(keys.at(-1));
    const recording = keysToRecording(lapKeys);
    const roundTrip = sameKeys(recordingToKeys(recording, finishFrames), lapKeys);
    const verify = (targetFrames) => sim.worker.verify({ ...trackInputs, carRecording: recording, targetFrames });
    const verified = await verify(finishFrames);
    const offByOneRejected = !(await verify(finishFrames - 1));
    const ok = roundTrip && verified && offByOneRejected;
    const files = [];
    if (ok && save) {
      const dir = new URL('runs/', ROOT);
      mkdirSync(dir, { recursive: true });
      writeFileSync(new URL(`${name}_${track}.json`, dir), JSON.stringify({ track, finishFrames, finished: true, controlsPerTick: lapKeys }));
      writeFileSync(new URL(`${name}_${track}.recording.json`, dir), JSON.stringify({ track, frames: finishFrames, recording }, null, 2));
      files.push(`runs/${name}_${track}.json`, `runs/${name}_${track}.recording.json`);
    }
    return { ok, finished: true, finishFrames, seconds: finishFrames / 1000, recording, roundTrip, verified, offByOneRejected, files };
  } finally {
    await own?.close();
  }
}
