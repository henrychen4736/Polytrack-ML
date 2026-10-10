// Drive every generated track in a folder and keep the laps.
//
//   node ideas/g2-2-track-generator/drive_folder.mjs --dir ideas/g2-2-track-generator/tracks/sample
//   node ideas/g2-2-track-generator/drive_folder.mjs --dir <folder> --shard 0/2    # first half
//   node ideas/g2-2-track-generator/drive_folder.mjs --dir <folder> --shard 1/2    # second half, in another terminal
//
// For each <name>.track.json without a <name>.lap.json: run the scripted
// follower (drive.mjs), and if it finishes write the lap beside the track.
// Tracks that already have a lap are skipped, so the command can be stopped
// and run again. One simulator per process; `--shard k/n` takes every n-th
// track starting at the k-th, so n processes can share a folder.
//
// Measured while training was running: about 5 s of wall time per 600-unit
// track (the follower decides every 5 ticks, which costs about 4000 ticks of
// simulation per second; a 600-unit lap is about 20 000 ticks).
import { readdirSync, existsSync } from 'node:fs';
import { Env } from '../../sim/env.mjs';
import { loadGenerated } from './generate.mjs';
import { driveTrack, saveLap } from './drive.mjs';

const arg = (name, fallback) => { const k = process.argv.indexOf(`--${name}`); return k < 0 ? fallback : process.argv[k + 1]; };
const dir = arg('dir', 'ideas/g2-2-track-generator/tracks/sample');
const [shard, shards] = arg('shard', '0/1').split('/').map(Number);

const files = readdirSync(dir).filter((f) => f.endsWith('.track.json')).sort().filter((_, i) => i % shards === shard);
const env = await Env.create();
const started = Date.now();
let driven = 0, finished = 0;
const failed = [];
for (const file of files) {
  if (existsSync(`${dir}/${file.replace('.track.json', '.lap.json')}`)) continue;
  const track = loadGenerated(`${dir}/${file}`);
  const drive = await driveTrack(env, track);
  driven++;
  if (drive.finished) { finished++; saveLap(track, drive, dir); }
  else failed.push(track.name);
  const last = drive.attempts.at(-1);
  console.log(`${track.name}: ${drive.finished ? `finished in ${(drive.finishFrames / 1000).toFixed(2)} s at speed scale ${drive.speedScale}` : `NOT finished: ${last.outcome} at ${(last.fraction * 100).toFixed(0)}% (${track.meta.pieces[last.piece]})`}`);
}
await env.close();
console.log(`${finished} of ${driven} tracks finished in ${((Date.now() - started) / 1000).toFixed(0)} s (${files.length - driven} already had a lap)`);
if (failed.length) console.log('not finished: ' + failed.join(', '));
