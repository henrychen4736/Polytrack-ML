// Smoke test: generate tracks, check them, load them in the simulator, drive them.
//
//   node ideas/g2-2-track-generator/smoke_test.mjs
//   node ideas/g2-2-track-generator/smoke_test.mjs --count 12 --seed 100 --length 600 --difficulty mixed
//
// One simulator, one process. With the defaults (8 tracks of about 500
// units) it takes about 40 s while training is running on the machine.
//
// For each track, in order:
//   1. same seed, same track       generate twice, compare the track strings
//   2. encode / decode             sim/track.mjs reads back the parts we wrote;
//                                  the editor export string holds the same track
//   3. chain                       every piece's exit port mates with the next
//                                  piece's entry port (check_pieces.mjs matePorts,
//                                  from the decoded parts, not the generator's notes)
//   4. no overlap                  no two pieces share a grid cell, and roads that
//                                  cross are at least 2 levels (10 units) apart
//   5. route on the road           every route point has road underneath
//   6. file round trip             save, load, same track string
//   7. car on the road at start    500 ticks with no keys: all four wheels
//                                  touching, car still at its start position
//   8. drivable                    the scripted follower (drive.mjs) reaches the
//                                  finish, which the game only grants after every
//                                  checkpoint in order, without ever being more
//                                  than 5 units from the middle of the road
//   9. the lap replays             the follower's keys, encoded as a recording
//                                  and played back by the simulator, finish on
//                                  the same tick; saved as <name>.lap.json
// Checks 1 to 7 and 9 must pass for every track (exit code 1 otherwise). Check
// 8 is reported as a count: see README.md on telling a bad track from a weak
// driver.
import { rmSync, readFileSync } from 'node:fs';
import { Env } from '../../sim/env.mjs';
import { decodeState } from '../../sim/state.mjs';
import { decodeSaveString, parseTrack } from '../../sim/track.mjs';
import { exportToSaveString } from '../../vendor/polyrl/node/track_codec.mjs';
import { generateTrack, saveTrack, loadGenerated } from './generate.mjs';
import { worldTiles } from './pieces.mjs';
import { matePorts } from './check_pieces.mjs';
import { driveTrack, saveLap } from './drive.mjs';

const arg = (name, fallback) => { const k = process.argv.indexOf(`--${name}`); return k < 0 ? fallback : process.argv[k + 1]; };
const count = +arg('count', 8), seed = +arg('seed', 1), length = +arg('length', 500);
const difficulty = arg('difficulty', 'mixed');
const slopes = !process.argv.includes('--flat');
const OUT = 'ideas/g2-2-track-generator/tracks/smoke';

const started = Date.now();
rmSync(OUT, { recursive: true, force: true }); // only this test's own output folder
const env = await Env.create();
let structuralFailures = 0, finished = 0;
const rows = [];

for (let k = 0; k < count; k++) {
  const d = difficulty === 'mixed' ? (count > 1 ? Math.round((k / (count - 1)) * 100) / 100 : 0.5) : +difficulty;
  const options = { seed: seed + k, length, difficulty: d, slopes, environment: (seed + k) % 3 };
  const track = generateTrack(options);
  const fails = [];

  // 1. reproducible
  if (generateTrack(options).trackData !== track.trackData) fails.push('seed');

  // 2. encode / decode
  const decoded = parseTrack(decodeSaveString(track.trackData)).parts;
  const sortKey = (p) => `${p.typeId},${p.x},${p.y},${p.z},${p.rotation},${p.rotationAxis},${p.checkpointOrder},${p.startOrder}`;
  if (decoded.map(sortKey).sort().join(';') !== track.parts.map(sortKey).sort().join(';')) fails.push('codec');
  if (exportToSaveString(track.exportString) !== track.trackData) fails.push('export');

  // 3. chain: from the decoded parts alone. The generator's order is used
  // only to say which part should follow which.
  const { ports, links } = matePorts(track.parts);
  const broken = track.parts.findIndex((_, i) => i + 1 < track.parts.length && !links[i].has(i + 1));
  const unmated = ports.filter((p) => p.mate < 0).length; // expected 2: behind the start, beyond the finish
  if (broken >= 0 || unmated !== 2) fails.push(`chain(${broken},${unmated})`);

  // 4. overlap: cells per column, with the piece that owns each.
  const columns = new Map();
  let crossings = 0, tooClose = 0;
  track.parts.forEach((part, i) => {
    for (const [x, y, z] of worldTiles(part)) {
      const key = `${x},${z}`;
      for (const other of columns.get(key) ?? []) {
        if (other.i === i) continue;
        if (Math.abs(other.y - y) < 2) tooClose++; else crossings++;
      }
      if (!columns.has(key)) columns.set(key, []);
      columns.get(key).push({ y, i });
    }
  });
  if (tooClose) fails.push(`overlap(${tooClose})`);

  // 5. route
  if (track.route.onRoad !== 1) fails.push(`route(${track.route.onRoad.toFixed(4)})`);

  // 6. files
  const { trackFile } = saveTrack(track, OUT);
  const loaded = loadGenerated(trackFile);
  if (loaded.createCar.trackData !== track.trackData || loaded.route.points.length !== track.route.points.length) fails.push('files');

  // 7. the car on the road at the start
  env.reset(loaded.createCar);
  const rest = decodeState((await env.step({}, 500)).at(-1));
  const moved = Math.hypot(...rest.position.map((v, c) => v - track.route.start.position[c]));
  if (!rest.wheelContact.every(Boolean) || moved > 0.1) fails.push(`start(${moved.toFixed(2)})`);

  // 8. drive it
  const drive = await driveTrack(env, loaded);
  if (drive.finished) {
    finished++;
    // 9. the lap as a recording
    const lap = JSON.parse(readFileSync(saveLap(track, drive, OUT), 'utf8'));
    const replay = await env.evaluate(loaded.createCar, lap.recording, lap.frames + 100);
    if (!replay.finished || replay.finishFrames !== drive.finishFrames) fails.push(`lap(${replay.finishFrames})`);
  }
  if (fails.length) structuralFailures++;

  const last = drive.attempts.at(-1);
  rows.push({
    track: track.name, pieces: track.parts.length, units: track.route.length, gates: track.route.gates.length,
    'levels crossed': crossings ? 'yes' : '-', checks: fails.length ? fails.join(' ') : 'ok',
    drive: drive.finished ? `finished ${(drive.finishFrames / 1000).toFixed(2)} s` : `${last.outcome} at ${(last.fraction * 100).toFixed(0)}% (${track.pieces[last.piece]})`,
    'speed scale': drive.speedScale ?? '-', 'worst off line': +Math.max(...drive.attempts.map((a) => a.worstOffLine)).toFixed(1),
  });
}
await env.close();

console.table(rows);
console.log(`checks 1-7 and 9 passed on ${count - structuralFailures} of ${count} tracks; the follower finished ${finished} of ${count}; ${((Date.now() - started) / 1000).toFixed(0)} s`);
console.log(`tracks written to ${OUT}/`);
process.exit(structuralFailures ? 1 : 0);
