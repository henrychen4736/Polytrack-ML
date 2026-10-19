// Make a fixed, seeded set of generated tracks for training and testing.
//
//   node ideas/g2-2-track-generator/g2-2-make_set.mjs --out ideas/g2-2-track-generator/sets/g2-2-set1 --shard 0/3
//   node ideas/g2-2-track-generator/g2-2-make_set.mjs --out ideas/g2-2-track-generator/sets/g2-2-set1 --list
//   (g2-2-make_set.sh runs the shards side by side and then the list; use that)
//
// The set: --train (40) training tracks and --test (10) test tracks, every
// one fixed by its index, so the same command gives the same set. Track k
// of a split gets a kind from a fixed cycle (below), a difficulty spread
// from 0 to 1 and a length of 600 to 1200 units:
//   train cycle  plain, plain, wide, wideSections, banked, jumps, mixed, mixed
//                (so 40 tracks are 10 plain, 5 of each feature, 10 mixed)
//   test         plain, wide, wideSections, banked, jumps, mixed, plain,
//                banked, jumps, mixed
// "plain" is the generator without features (narrow road, turns, ramps);
// the other kinds are g2-2-feature_check.mjs's FEATURE_SETS. Seeds: 20000 +
// k for training, 30000 + k for testing, so the two never share a track.
//
// Every track is checked before it is kept, with the checks of
// g2-2-feature_check.mjs: structure (parts, mated ports, road under the
// route), the scripted follower finishes it (its lap is kept beside it as
// <name>.lap.json), and idea g2-1's route search reaches the finish. The
// route is built through route_store.mjs under the track's own name, which
// is the cache entry the training environment looks up for this file, so
// training does not have to build it. A track of a feature kind must also
// contain that feature. A track that fails is replaced by seed + 1000 (up
// to 8 tries); the replacement is recorded in set.json.
//
// Restartable: each kept track leaves .done/<split>_<k>.json, and a track
// with one is skipped. After all shards, --list writes
//   <out>/set.json     every track: split, index, kind, seed, options, counts,
//                      lengths, follower lap, g2-1 route, tries
//   <out>/train.txt    one track file per line: train_ppo.py --track <out>/train.txt
//   <out>/test.txt     the same for the test tracks
// and prints the set as a table.
//
// Local use only: drives the local simulator; no network. The folder holds
// routes measured on Kodub's part geometry and laps driven on it, so it is
// kept out of git (.gitignore: ideas/g2-2-track-generator/sets/).
import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { Env } from '../../sim/env.mjs';
import { loadTrackInfo } from '../shared/track_info.mjs';
import { routeFor } from '../g2-1-reference-free-inputs/route_store.mjs';
import { generateTrack, saveTrack } from './generate.mjs';
import { driveTrack, saveLap } from './drive.mjs';
import { FEATURE_SETS, hasFeature, structureFailures } from './g2-2-feature_check.mjs';

const TRAIN_CYCLE = ['plain', 'plain', 'wide', 'wideSections', 'banked', 'jumps', 'mixed', 'mixed'];
const TEST_KINDS = ['plain', 'wide', 'wideSections', 'banked', 'jumps', 'mixed', 'plain', 'banked', 'jumps', 'mixed'];

/** The whole set as a list of { split, k, kind, base options } (no work done). */
export function plan(train = 40, test = 10) {
  const list = [];
  const opts = (k, n, seed) => ({ seed, length: 600 + 100 * (k % 7), difficulty: n > 1 ? Math.round((100 * k) / (n - 1)) / 100 : 0.5, environment: k % 3 });
  for (let k = 0; k < train; k++) list.push({ split: 'train', k, kind: TRAIN_CYCLE[k % TRAIN_CYCLE.length], ...opts(k, train, 20000 + k) });
  for (let k = 0; k < test; k++) list.push({ split: 'test', k, kind: TEST_KINDS[k % TEST_KINDS.length], ...opts(k, test, 30000 + k) });
  return list;
}

const arg = (name, fallback) => { const k = process.argv.indexOf(`--${name}`); return k < 0 ? fallback : process.argv[k + 1]; };

if (process.argv[1]?.endsWith('g2-2-make_set.mjs')) {
  const out = arg('out', 'ideas/g2-2-track-generator/sets/g2-2-set1').replace(/\\/g, '/').replace(/\/$/, '');
  const list = plan(+arg('train', 40), +arg('test', 10));
  mkdirSync(`${out}/.done`, { recursive: true });

  if (process.argv.includes('--list')) {
    const rows = [], missing = [];
    for (const item of list) {
      const f = `${out}/.done/${item.split}_${item.k}.json`;
      if (existsSync(f)) rows.push(JSON.parse(readFileSync(f, 'utf8'))); else missing.push(`${item.split} ${item.k}`);
    }
    writeFileSync(`${out}/set.json`, JSON.stringify(rows, null, 1));
    for (const split of ['train', 'test']) writeFileSync(`${out}/${split}.txt`, rows.filter((r) => r.split === split && r.ok).map((r) => r.file).join('\n') + '\n');
    console.log('split  k  kind          name                                    units  gates  sections/banked/jumps  follower      g2-1 route  tries');
    for (const r of rows) {
      console.log(`${r.split.padEnd(5)} ${String(r.k).padStart(2)}  ${r.kind.padEnd(12)}  ${(r.name ?? '-').padEnd(38)}  ${String(r.routeLength ?? '-').padStart(5)}  ${String(r.checkpoints ?? '-').padStart(5)}  ${r.counts ? `${r.counts.wideSections}/${r.counts.bankedTurns}/${r.counts.jumps}`.padEnd(21) : '-'.padEnd(21)}  ${r.lapSeconds != null ? `${r.lapSeconds.toFixed(1)} s`.padEnd(12) : 'NONE'.padEnd(12)}  ${r.g21 ? `${r.g21.length} u`.padEnd(10) : '-'.padEnd(10)}  ${r.tries}${r.ok ? '' : '  NOT KEPT'}`);
    }
    const ok = rows.filter((r) => r.ok);
    console.log(`\n${ok.filter((r) => r.split === 'train').length} training and ${ok.filter((r) => r.split === 'test').length} test tracks kept; ${missing.length ? `not made yet: ${missing.join(', ')}` : 'none missing'}`);
    console.log(`lists: ${out}/train.txt, ${out}/test.txt`);
    process.exit(missing.length || ok.length < rows.length ? 1 : 0);
  }

  const [shard, shards] = arg('shard', '0/1').split('/').map(Number);
  const env = await Env.create();
  for (let i = 0; i < list.length; i++) {
    if (i % shards !== shard) continue;
    const item = list[i];
    const done = `${out}/.done/${item.split}_${item.k}.json`;
    if (existsSync(done)) continue;
    const dir = `${out}/${item.split}`;
    let row = null;
    const tried = [];
    for (let attempt = 0; attempt < 8 && !row; attempt++) {
      const seed = item.seed + 1000 * attempt;
      const options = { seed, length: item.length, difficulty: item.difficulty, environment: item.environment, features: item.kind === 'plain' ? {} : FEATURE_SETS[item.kind] };
      let track;
      try { track = generateTrack(options); } catch (err) { tried.push(`${seed}: not generated`); continue; }
      const counts = track.counts ?? { wide: 0, wideSections: 0, bankedTurns: 0, jumps: 0, kickers: 0 };
      if (item.kind !== 'plain' && !hasFeature(item.kind, counts)) { tried.push(`${seed}: no ${item.kind}`); continue; }
      const structure = structureFailures({ ...track, counts });
      if (structure.length) { tried.push(`${seed}: ${structure.join('; ')}`); continue; }
      const drive = await driveTrack(env, track);
      if (!drive.finished) { tried.push(`${seed}: follower ${drive.attempts.at(-1).outcome}`); continue; }
      // Saved before the g2-1 route, which is built for the FILE (its
      // cache entry is named after it) exactly as training will ask for it.
      const { trackFile } = saveTrack(track, dir);
      saveLap(track, drive, dir);
      let g21;
      try { g21 = routeFor(loadTrackInfo(trackFile)); } catch (err) { g21 = { ok: false, error: err.message }; }
      if (!g21.ok) {
        tried.push(`${seed}: g2-1 route ${g21.error ?? 'does not reach every gate'}`);
        // Not kept: remove its files, so a folder given to --track holds only kept tracks.
        for (const ext of ['track', 'route', 'lap']) rmSync(trackFile.replace(/\.track\.json$/, `.${ext}.json`), { force: true });
        continue;
      }
      row = {
        split: item.split, k: item.k, kind: item.kind, ok: true, file: trackFile, name: track.name, seed, options, counts,
        routeLength: track.route.length, checkpoints: track.route.gates.length - 1, jumps: track.route.jumps ?? [],
        lapSeconds: drive.finishFrames / 1000, lapSpeedScale: drive.speedScale,
        g21: { length: Math.round(g21.length), flights: g21.jumps?.length ?? null }, tries: tried.length + 1, rejected: tried,
      };
    }
    if (!row) row = { split: item.split, k: item.k, kind: item.kind, ok: false, tries: tried.length, rejected: tried };
    writeFileSync(done, JSON.stringify(row));
    console.log(`${item.split} ${item.k} ${item.kind}: ${row.ok ? `${row.name}, ${row.routeLength} units, follower ${row.lapSeconds.toFixed(1)} s, try ${row.tries}` : `NOT KEPT after ${row.tries} tries: ${row.rejected.join(' | ')}`}`);
  }
  await env.close();
}
