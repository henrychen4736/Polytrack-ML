// The author's scripts, run as the README says, with their printed results
// checked. About 2 minutes; each script is awaited before the next starts, so
// there is never more than one simulator.
//
//   check_pieces.mjs            the summary and --table
//   bulk_check.mjs --count 40   (the README's run is 300 tracks, 70 s)
//   smoke_test.mjs              8 tracks, 9 checks each (rewrites tracks/smoke)
//   control_test.mjs            broken track / weak driver / steep climb
//   generate.mjs + drive_folder.mjs   on a temporary folder: laps written,
//                               a second run skips them, --shard splits them
//   compare_g21.mjs             g2-1's route finder against this route
import { execFile } from 'node:child_process';
import { readdirSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, near, section } from './_check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const folder = 'ideas/g2-2-track-generator';
const run = (script, args = [], timeoutMs = 150000) => new Promise((resolve) => {
  execFile(process.execPath, [path.join(folder, script), ...args], { cwd: root, timeout: timeoutMs, maxBuffer: 1 << 26 }, (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, out: stdout, err: stderr }));
});
const lines = (text) => text.split(/\r?\n/);
/** First real error line of stderr (the simulator's harmless "wasm streaming compile failed" notice aside). */
const firstError = (err) => lines(err).filter((l) => /Error/.test(l) && !/wasm streaming/.test(l))[0] ?? '';

await section('check_pieces.mjs', async () => {
  const r = await run('check_pieces.mjs');
  check('check_pieces.mjs: runs and exits 0', r.code === 0, firstError(r.err));
  const rows = lines(r.out).filter((l) => /road ports mated \d+\/\d+/.test(l));
  let mated = 0, ports = 0;
  for (const l of rows) { const m = l.match(/road ports mated (\d+)\/(\d+)/); mated += +m[1]; ports += +m[2]; }
  check('check_pieces.mjs: one line per official track, adding up to the README\'s 2863 of 3005 road ports mated', rows.length === 17 && mated === 2863 && ports === 3005, `${rows.length} tracks, ${mated} of ${ports}`);
  check('check_pieces.mjs: "4 of 17 official tracks" reach every gate through mated ports (README)', /\n4 of 17 official tracks/.test(r.out), lines(r.out).find((l) => /official tracks:/.test(l)) ?? '');
  const sideways = rows.filter((l) => !/parts on their side 0$/.test(l.trim())).length;
  check('check_pieces.mjs: 8 official tracks have parts stood on their side (README)', sideways === 8, `${sideways}`);
  check('check_pieces.mjs: lists the part types with no port the README names (WallTrackMiddleCorner 142, PlaneWallInnerCorner 85, BlockBridge 39)', /WallTrackMiddleCorner: 142/.test(r.out) && /PlaneWallInnerCorner: 85/.test(r.out) && /BlockBridge: 39/.test(r.out));
  const t = await run('check_pieces.mjs', ['--table']);
  const ids = new Set(lines(t.out).filter((l) => /^\| \d+ \|/.test(l)).map((l) => l.split('|')[1].trim()));
  check('check_pieces.mjs --table: prints the README\'s 74 road part types', t.code === 0 && ids.size === 74, `${ids.size} part types`);
});

await section('bulk_check.mjs', async () => {
  const r = await run('bulk_check.mjs', ['--count', '40']);
  check('bulk_check.mjs --count 40: exits 0 with 40 of 40 generated and 0 failing a structure check', r.code === 0 && /40 of 40 tracks generated; 0 failed a structure check/.test(r.out), lines(r.out).find((l) => /tracks generated/.test(l)) ?? firstError(r.err));
  const crossing = +(r.out.match(/(\d+) have a road crossing/)?.[1] ?? -1);
  check('bulk_check.mjs: some of the tracks have a road crossing over another (README: 93 of 300)', crossing >= 3 && crossing <= 25, `${crossing} of 40`);
});

await section('smoke_test.mjs', async () => {
  const r = await run('smoke_test.mjs');
  const summary = lines(r.out).find((l) => /checks 1-7 and 9 passed/.test(l)) ?? '';
  check('smoke_test.mjs: exits 0', r.code === 0, firstError(r.err) || summary);
  check('smoke_test.mjs: checks 1-7 and 9 pass on 8 of 8 tracks and the follower finishes 8 of 8 (README)', /passed on 8 of 8 tracks; the follower finished 8 of 8/.test(summary), summary);
  // "all at the first speed tried": the speed scale column is 1 on every row.
  const rows = lines(r.out).filter((l) => /gen_s\d+_d\d+_l500/.test(l));
  check('smoke_test.mjs: every track is finished at speed scale 1 with checks "ok"', rows.length === 8 && rows.every((l) => /'ok'/.test(l) && /finished/.test(l) && /│\s*1\s*│[^│]*│\s*$/.test(l)), `${rows.length} rows`);
  const off = rows.map((l) => +(l.match(/│\s*([\d.]+)\s*│\s*$/)?.[1] ?? NaN));
  check('smoke_test.mjs: the follower is never more than 2.5 units from the middle of the road (README: worst 1.9)', off.length === 8 && off.every((v) => v <= 2.5), `worst ${Math.max(...off)}`);
  const written = readdirSync(path.join(root, folder, 'tracks/smoke'));
  check('smoke_test.mjs: writes a track, a route and a lap for each of the 8 tracks into tracks/smoke', ['.track.json', '.route.json', '.lap.json'].every((ext) => written.filter((f) => f.endsWith(ext)).length === 8), `${written.length} files`);
});

await section('control_test.mjs', async () => {
  const r = await run('control_test.mjs');
  const out = lines(r.out);
  const a = out.find((l) => l.startsWith('A ')) ?? '', b = out.find((l) => l.startsWith('B ')) ?? '', c = out.find((l) => l.startsWith('C ')) ?? '';
  check('control_test.mjs: exits 0', r.code === 0, firstError(r.err));
  check('control_test.mjs A: the broken track fails the chain check and the follower leaves the road at the hole at every speed', /chain intact false/.test(a) && (a.match(/left the road/g) ?? []).length === 3 && /as expected/.test(a), a.slice(0, 220));
  check('control_test.mjs B: the over-confident follower fails at full speed and finishes once slowed (README: finishes at 0.3)', /chain intact true/.test(b) && /scale 1: (stalled|left the road)/.test(b) && /scale 0\.3: finished/.test(b) && /as expected/.test(b), b.slice(0, 220));
  check('control_test.mjs C: the steep ramp is climbed at the bottom of the speed ladder', /scale 0\.45: finished/.test(c) && /as expected/.test(c) && / Slope /.test(c), c.slice(0, 220));
});

await section('generate.mjs and drive_folder.mjs', async () => {
  // A relative folder inside the project is what the scripts are documented with; use a temporary one outside it.
  const dir = mkdtempSync(path.join(tmpdir(), 'g22-drive-'));
  try {
    const g = await run('generate.mjs', ['--count', '3', '--seed', '900', '--length', '300', '--difficulty', 'mixed', '--out', dir]);
    const tracks = readdirSync(dir).filter((f) => f.endsWith('.track.json')).sort();
    check('generate.mjs --count 3 --difficulty mixed: writes three tracks spread from difficulty 0 to 1, all 100% on the road', g.code === 0 && tracks.join() === 'gen_s900_d0_l300.track.json,gen_s901_d50_l300.track.json,gen_s902_d100_l300.track.json' && (g.out.match(/on road 100\.0%/g) ?? []).length === 3, tracks.join(', '));
    const first = await run('drive_folder.mjs', ['--dir', dir, '--shard', '0/2']);
    const afterShard = readdirSync(dir).filter((f) => f.endsWith('.lap.json')).sort();
    check('drive_folder.mjs --shard 0/2: drives every second track (the 1st and 3rd of three) and writes their laps', first.code === 0 && afterShard.join() === 'gen_s900_d0_l300.lap.json,gen_s902_d100_l300.lap.json' && /2 of 2 tracks finished/.test(first.out), lines(first.out).at(-2) ?? firstError(first.err));
    const rest = await run('drive_folder.mjs', ['--dir', dir]);
    check('drive_folder.mjs: a second run skips tracks that have a lap and drives only the one left', rest.code === 0 && /1 of 1 tracks finished/.test(rest.out) && /2 already had a lap/.test(rest.out) && readdirSync(dir).filter((f) => f.endsWith('.lap.json')).length === 3, lines(rest.out).at(-2) ?? firstError(rest.err));
    const lap = JSON.parse(readFileSync(path.join(dir, 'gen_s901_d50_l300.lap.json'), 'utf8'));
    check('drive_folder.mjs: a lap file has the documented fields (track, frames, recording, source, speedScale)', lap.track === 'gen_s901_d50_l300' && Number.isInteger(lap.frames) && typeof lap.recording === 'string' && lap.recording.length > 20 && lap.source === 'g2-2 scripted follower' && lap.speedScale === 1, JSON.stringify({ ...lap, recording: `${lap.recording.length} chars` }));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

await section('compare_g21.mjs', async () => {
  // This imports idea g2-1's route finder, which belongs to another folder and may
  // change under it; a failure here can be g2-1's doing, not this folder's.
  const r = await run('compare_g21.mjs');
  const rows = lines(r.out).filter((l) => l.startsWith('gen_s'));
  check('compare_g21.mjs: runs and exits 0 (needs ideas/g2-1-reference-free-inputs/route.mjs)', r.code === 0 && rows.length === 3, firstError(r.err));
  const parsed = rows.map((l) => ({ ok: /ok=true/.test(l), theirs: +(l.match(/length (\d+) against/)?.[1]), ours: +(l.match(/against (\d+)/)?.[1]), mean: +(l.match(/mean ([\d.]+)/)?.[1]), worst: +(l.match(/worst ([\d.]+)/)?.[1]), jumps: l.match(/needed: (\S+)/)?.[1] }));
  check('compare_g21.mjs: on all three tracks g2-1 finds a route to the finish with no jumps, within 10 units of this folder\'s length', parsed.length === 3 && parsed.every((p) => p.ok && p.jumps === '0' && Math.abs(p.theirs - p.ours) <= 10), parsed.map((p) => `${p.theirs} against ${p.ours}`).join(', '));
  check('compare_g21.mjs: the two routes lie 0.4 to 0.8 units apart on average and never more than 3 (README: 0.5 to 0.75, worst 2.9)', parsed.length === 3 && parsed.every((p) => p.mean >= 0.4 && p.mean <= 0.8 && p.worst <= 3), parsed.map((p) => `mean ${p.mean}, worst ${p.worst}`).join('; '));
});
