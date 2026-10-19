// Is each new kind of piece drivable? Generate tracks with one feature at a
// time and run every check on each.
//
//   node ideas/g2-2-track-generator/g2-2-feature_check.mjs                       # 10 tracks per feature, one simulator
//   node ideas/g2-2-track-generator/g2-2-feature_check.mjs --count 16 --shard 0/3   # with --shard 1/3, 2/3 in two more terminals
//   node ideas/g2-2-track-generator/g2-2-feature_check.mjs --features jumps --count 20
//   node ideas/g2-2-track-generator/g2-2-feature_check.mjs --out <file.json>     # also write every row
//
// The features (generate.mjs FEATURES): wide (whole track on the 31-unit
// road), wideSections (51-unit straights on the standard road), banked,
// jumps, and mixed (banked + jumps + wideSections together). Seeds are tried
// from 9000 up and a track counts only if it HAS the feature (at least one
// section, banked turn or jump; mixed: at least two of the three), until
// --count tracks per feature are in (at most 4 x count seeds). Track k has
// length 600 to 1000 units and difficulty 0 to 1.
//
// Per track:
//   structure  the track string decodes to the parts written (sim/track.mjs);
//              every part's ports mate with a neighbour's except the two ends
//              of the road and the two edges of each jump
//              (check_pieces.mjs matePorts with the feature table); and the
//              route has road under every point outside the gaps (onRoad 1)
//   follower   drive.mjs's scripted follower reaches the finish (through
//              every checkpoint), at some step of its speed ladder
//   g2-1       idea g2-1's route search, given only the track string,
//              finds a route through every gate to the finish (route.ok),
//              and how many flights it needed (route_store.mjs routeFor)
//   control    (tracks with a jump) the follower again with every jump's
//              target speed at half its minimum. A check that cannot fail
//              proves nothing; this one should fail there.
// The follower and g2-1 do not use each other, so a track passing both is
// drivable by a car (the follower) and has a route for the reference-free
// environment (g2-1, which route-mode training needs).
//
// Local use only: drives the local simulator; no network.
import { writeFileSync } from 'node:fs';
import { Env } from '../../sim/env.mjs';
import { decodeSaveString, parseTrack } from '../../sim/track.mjs';
import { loadTrackInfo } from '../shared/track_info.mjs';
import { routeFor } from '../g2-1-reference-free-inputs/route_store.mjs';
import { generateTrack } from './generate.mjs';
import { driveTrack } from './drive.mjs';
import { matePorts } from './check_pieces.mjs';
import { loadFeatureTable } from './pieces.mjs';

export const FEATURE_SETS = {
  wide: { wide: true },
  wideSections: { wideSections: 3 },
  banked: { banked: 2 },
  jumps: { jumps: 3 },
  mixed: { banked: 1, jumps: 2, wideSections: 2 },
};

/** Does the track have what the feature set is about? */
export function hasFeature(feature, c) {
  if (feature === 'wide') return c.wide > 0;
  if (feature === 'wideSections') return c.wideSections > 0;
  if (feature === 'banked') return c.bankedTurns > 0;
  if (feature === 'jumps') return c.jumps > 0;
  return [c.wideSections, c.bankedTurns, c.jumps].filter((n) => n > 0).length >= 2;
}

/** The structure checks of one generated track; returns a list of failures (empty = pass). */
export function structureFailures(track) {
  const fails = [];
  const decoded = parseTrack(decodeSaveString(track.trackData));
  const list = Array.isArray(decoded) ? decoded : decoded.parts;
  if (!list || list.length !== track.parts.length) fails.push(`decodes to ${list?.length} parts, ${track.parts.length} written`);
  const { ports } = matePorts(track.parts, loadFeatureTable());
  const open = ports.filter((p) => p.mate < 0 && p.axis !== 1).length;
  const expected = 2 + 2 * (track.counts?.jumps ?? 0);
  if (open !== expected) fails.push(`${open} open ports, expected ${expected}`);
  if (track.route.onRoad !== 1) fails.push(`road under ${(100 * track.route.onRoad).toFixed(2)}% of route points`);
  return fails;
}

/** The seeds and options of the tracks checked for one feature (no simulator). */
export function chooseTracks(feature, count) {
  const chosen = [];
  for (let s = 0; s < 4 * count && chosen.length < count; s++) {
    const k = chosen.length;
    const opts = { seed: 9000 + s, length: 600 + 50 * (k % 9), difficulty: count > 1 ? Math.round((100 * k) / (count - 1)) / 100 : 0.5, environment: k % 3, features: FEATURE_SETS[feature] };
    try { if (hasFeature(feature, generateTrack(opts).counts)) chosen.push(opts); } catch (err) { console.log(`${feature} seed ${opts.seed}: NOT GENERATED (${err.message})`); }
  }
  return chosen;
}

if (process.argv[1]?.endsWith('g2-2-feature_check.mjs')) {
  const arg = (name, fallback) => { const k = process.argv.indexOf(`--${name}`); return k < 0 ? fallback : process.argv[k + 1]; };
  const count = +arg('count', 10);
  const [shard, shards] = arg('shard', '0/1').split('/').map(Number);
  const names = arg('features', Object.keys(FEATURE_SETS).join(',')).split(',');
  const env = await Env.create();
  const rows = [];
  for (const feature of names) {
    // Which seeds have the feature is decided by generating only (0.1 s a
    // track), the same in every shard; each shard drives its share.
    const chosen = chooseTracks(feature, count);
    for (let k = 0; k < chosen.length; k++) {
      if (k % shards !== shard) continue;
      const { seed, length, difficulty } = chosen[k];
      const t0 = Date.now();
      const track = generateTrack(chosen[k]);
      const structure = structureFailures(track);
      const drive = await driveTrack(env, track);
      const t1 = Date.now();
      let g21;
      try { const r = routeFor(loadTrackInfo(track.createCar)); g21 = { ok: r.ok, length: Math.round(r.length), flights: r.jumps?.length ?? null }; } catch (err) { g21 = { ok: false, error: err.message }; }
      const t2 = Date.now();
      let control = null;
      if (track.counts.jumps > 0) {
        const slow = { ...track, route: { ...track.route, jumps: track.route.jumps.map((j) => ({ ...j, targetKmh: j.minKmh / 2 })) } };
        const c = await driveTrack(env, slow, { ladder: [1] });
        control = { finished: c.finished, outcome: c.attempts[0].outcome, at: Math.round(100 * c.attempts[0].fraction) };
      }
      const last = drive.attempts.at(-1);
      const row = {
        feature, seed, length, difficulty, name: track.name, counts: track.counts, routeLength: track.route.length,
        jumps: track.route.jumps ?? [], structure, finished: drive.finished, speedScale: drive.speedScale,
        finishSeconds: drive.finished ? drive.finishFrames / 1000 : null,
        failure: drive.finished ? null : `${last.outcome} at ${(100 * last.fraction).toFixed(0)}% (${track.pieces[last.piece]})`,
        g21, control, seconds: { drive: (t1 - t0) / 1000, route: (t2 - t1) / 1000 },
      };
      rows.push(row);
      console.log(`${feature} ${track.name}: ${JSON.stringify(track.counts)} structure ${structure.length ? 'FAIL ' + structure.join('; ') : 'ok'}; follower ${drive.finished ? `finished ${row.finishSeconds.toFixed(1)} s at scale ${drive.speedScale}` : 'NOT finished: ' + row.failure}; g2-1 route ${g21.ok ? `ok, ${g21.length} units, ${g21.flights} flights` : 'NOT ok ' + (g21.error ?? '')} (${row.seconds.drive.toFixed(0)} + ${row.seconds.route.toFixed(0)} s)${control ? `; control at half the minimum speed: ${control.finished ? 'FINISHED (the check did not fail)' : `${control.outcome} at ${control.at}%`}` : ''}`);
    }
  }
  await env.close();
  printSummary(rows, names);
  const out = arg('out', null);
  if (out) writeFileSync(out, JSON.stringify(rows, null, 1));
}

/** The table at the end; also used to merge the rows of several shards
 *  (node -e "...printSummary(rows)"). */
export function printSummary(rows, names = Object.keys(FEATURE_SETS)) {
  console.log('\nfeature        tracks  structure ok  follower finished  g2-1 route ok  sections / banked turns / jumps (kickers)  control not finished');
  for (const feature of names) {
    const r = rows.filter((x) => x.feature === feature);
    const sum = (key) => r.reduce((s, x) => s + x.counts[key], 0);
    const ctl = r.filter((x) => x.control);
    console.log(`${feature.padEnd(14)} ${String(r.length).padStart(4)}  ${String(r.filter((x) => !x.structure.length).length).padStart(8)}      ${String(r.filter((x) => x.finished).length).padStart(8)}           ${String(r.filter((x) => x.g21.ok).length).padStart(6)}        ${sum('wideSections')} / ${sum('bankedTurns')} / ${sum('jumps')} (${sum('kickers')})${feature === 'wide' ? `, ${sum('wide')} wide pieces` : ''}${ctl.length ? `        ${ctl.filter((x) => !x.control.finished).length} of ${ctl.length}` : ''}`);
  }
}
