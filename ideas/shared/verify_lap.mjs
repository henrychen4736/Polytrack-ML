// Check one saved lap FILE with the game's own Verify, from a shell script.
//
// verify.mjs is a module; this is the same check as a command, for shell
// scripts that must know whether a lap on disk is good before they use it
// (ideas/g1-2-stitch-human-laps/g1-2-run_all.sh checks each stitched lap;
// ideas/g1-3-search-train-rounds/g1-3-train_on_candidates.sh checks the
// searched lap). A lap file left over from an older run, or written half-way
// through a shutdown, cannot pass as good.
//
// Usage, from the project root:
//   node ideas/shared/verify_lap.mjs <track> <lap file>
// Prints one line, "PASS <finish tick>" or "FAIL <why>", and exits 0 / 1.
// The lap file is either form verify.mjs writes (runs/<name>_<track>.json or
// .recording.json). Verify must accept the lap on its finish tick and reject
// it one tick sooner (ideas/shared/verify.mjs verifyAndSave, save: false).
//
// One simulator, about a second. Local use only: nothing here contacts any server.
import { existsSync } from 'node:fs';
import { loadLap, ROOT } from '../shared/laps.mjs';
import { verifyAndSave } from '../shared/verify.mjs';

const [track, file] = process.argv.slice(2);
if (!track || !file) { console.error('Usage: node ideas/shared/verify_lap.mjs <track> <lap file>'); process.exit(2); }
if (!existsSync(new URL(file, ROOT))) { console.log(`FAIL no file ${file}`); process.exit(1); }
const lap = loadLap(file, track);
const v = await verifyAndSave({ track, keys: lap.keys, save: false });
// The file's own claim must be the tick the game finishes it on.
const ok = v.ok && v.finishFrames === lap.frames;
console.log(ok ? `PASS ${v.finishFrames}` : `FAIL ${JSON.stringify({ claimed: lap.frames, finishFrames: v.finishFrames, verified: v.verified, offByOneRejected: v.offByOneRejected })}`);
process.exit(ok ? 0 : 1);
