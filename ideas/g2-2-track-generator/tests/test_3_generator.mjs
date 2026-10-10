// generate.mjs without the simulator: is a generated track what it claims?
// About 40 s (ten tracks, one of them 2500 units long).
//
// Every check here reads the track back from its TRACK STRING with
// sim/track.mjs, and judges it with the game's collision triangles and ray
// casts (tests/_geometry.mjs), not with the generator's own bookkeeping
// (its placed list, its cell columns, its onRoad number):
//   seed            same options, same track; different seeds, different tracks
//   gates           one start, one finish, checkpoints numbered 0..n-1 in the
//                   order the road reaches them
//   no overlap      no two pieces' collision shapes share space (1-unit voxels
//                   of the triangles; the generator's test is grid cells)
//   route           one point per unit with no jumps; every point ON the road
//                   surface; midway between the kerbs; under every gate, in
//                   order; clear headroom above
//   files           save / load, the command line, and the 20 saved sample
//                   tracks regenerated from their recorded options
import { readFileSync, readdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTrack, saveTrack, loadGenerated, ROUTE_SPACING } from '../generate.mjs';
import { exportToSaveString } from '../../../vendor/polyrl/node/track_codec.mjs';
import { decodeParts, overlappingParts, gatesOf, detectorBox, meshOf, surfaceBelow } from './_geometry.mjs';
import { check, near, fmt, section } from './_check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

await section('seed', () => {
  const options = { seed: 7, length: 500, difficulty: 0.5 };
  const a = generateTrack(options), b = generateTrack(options);
  check('seed: the same options give the same track string', a.trackData === b.trackData);
  check('seed: and the same parts, route points, gates and export string', JSON.stringify(a.parts) === JSON.stringify(b.parts) && JSON.stringify(a.route) === JSON.stringify(b.route) && a.exportString === b.exportString);
  // Generating other tracks in between must not change it (no state carried between calls).
  generateTrack({ seed: 99, length: 400 }); generateTrack({ seed: 3, length: 400, slopes: false });
  check('seed: generating other tracks in between does not change the result', generateTrack(options).trackData === a.trackData);
  const strings = new Set();
  for (let seed = 1; seed <= 12; seed++) strings.add(generateTrack({ seed, length: 300, difficulty: 0.5 }).trackData);
  check('seed: twelve different seeds give twelve different tracks', strings.size === 12, `${strings.size} distinct`);
  check('seed: difficulty, length and slopes each change the track', new Set([a.trackData, generateTrack({ ...options, difficulty: 0.9 }).trackData, generateTrack({ ...options, length: 700 }).trackData, generateTrack({ ...options, slopes: false }).trackData]).size === 4);
  const flat = generateTrack({ seed: 21, length: 500, difficulty: 1, slopes: false });
  // (0.05: the surface of a gate piece is 0.024 lower than a plain straight's.)
  check('options: slopes: false gives a track on one level', new Set(decodeParts(flat.trackData).map((p) => p.y)).size === 1 && flat.route.points.every((p) => near(p[1], flat.route.points[0][1], 0.05)));
  check('options: environment is written into the track and changes nothing else', decodeParts(generateTrack({ ...options, environment: 2 }).trackData).length === a.parts.length && generateTrack({ ...options, environment: 2 }).trackData !== a.trackData);
});

/** All the structure checks for one track; `label` names it in the output. */
function examine(track, label, options) {
  const parts = decodeParts(track.trackData);
  const mesh = meshOf(track.trackData);
  const route = track.route, pts = route.points, n = pts.length;
  const fails = [];
  const need = (ok, text) => { if (!ok) fails.push(text); };

  // --- what was written is what is in the string -------------------------------
  const keyOf = (p) => `${p.typeId},${p.x},${p.y},${p.z},${p.rotation},${p.rotationAxis},${p.checkpointOrder},${p.startOrder}`;
  need(parts.map(keyOf).sort().join(';') === track.parts.map(keyOf).sort().join(';'), 'the track string does not hold track.parts');
  need(exportToSaveString(track.exportString) === track.trackData, 'the export string holds another track');
  need(track.pieces.length === track.parts.length, 'pieces and parts differ in length');

  // --- start, checkpoints in order, finish -------------------------------------
  const { starts, checkpoints, finishes } = gatesOf(parts);
  need(starts.length === 1 && finishes.length === 1, `${starts.length} starts, ${finishes.length} finishes`);
  const orders = checkpoints.map((p) => p.checkpointOrder).sort((a, b) => a - b);
  need(orders.every((o, i) => o === i), `checkpoint orders are ${orders.join(',')}, not 0..${orders.length - 1}`);
  need(route.gates.length === checkpoints.length + 1 && route.gates.at(-1).isFinish && route.gates.slice(0, -1).every((g) => !g.isFinish), 'route.gates is not "every checkpoint, then the finish"');
  need(checkpoints.length >= 1, 'no checkpoint at all');
  // The route must pass THROUGH each gate's detector box, checkpoint 0 first, the finish last.
  let last = -1, through = 0;
  const boxes = [...checkpoints.sort((a, b) => a.checkpointOrder - b.checkpointOrder), ...finishes].map(detectorBox);
  for (const box of boxes) {
    // The car's origin rides 0.14 above the route; the first route point inside the box (in x and z,
    // and with the car's origin inside its height) after the previous gate:
    let hit = -1;
    for (let k = last + 1; k < n && hit < 0; k++) if (Math.abs(pts[k][0] - box.center[0]) <= box.size[0] / 2 + 0.01 && Math.abs(pts[k][2] - box.center[2]) <= box.size[2] / 2 + 0.01 && Math.abs(pts[k][1] + 0.14 - box.center[1]) <= box.size[1] / 2) hit = k;
    if (hit < 0) break;
    through++; last = hit;
  }
  need(through === boxes.length, `the route passes through only ${through} of ${boxes.length} gate boxes in order`);
  need(route.gates.every((g, i) => i === 0 || g.index > route.gates[i - 1].index), 'gate indices do not rise along the route');
  need(route.gates.every((g, i) => dist(g.center, boxes[i]?.center ?? [1e9, 0, 0]) < 1e-6 && Math.hypot(pts[g.index][0] - g.center[0], pts[g.index][2] - g.center[2]) < 1.5), 'a route gate is not at its gate part');
  need(route.length === route.gates.at(-1).index * ROUTE_SPACING, 'route.length is not the distance to the finish gate');

  // --- no two pieces in the same space -------------------------------------------
  const overlaps = overlappingParts(parts);
  need(overlaps.length === 0, `${overlaps.length} pairs of pieces overlap, e.g. ${overlaps.slice(0, 2).map((o) => `${o.i}/${o.j} (${o.shared} voxels)`).join(', ')}`);

  // --- the route ------------------------------------------------------------------
  need(pts.every((p) => p.length === 3 && p.every(Number.isFinite)), 'a route point is not three finite numbers');
  let shortest = Infinity, longest = 0;
  for (let k = 1; k < n; k++) { const d = dist(pts[k], pts[k - 1]); shortest = Math.min(shortest, d); longest = Math.max(longest, d); }
  need(shortest > 0.9 && longest < 1.1, `consecutive route points are ${fmt(shortest, 3)} to ${fmt(longest, 3)} apart (spacing 1)`);
  // Direction never flips: each step is within 25 degrees of the one before (the tightest turn, radius 10, turns 5.7 degrees per unit).
  let sharpest = 1;
  for (let k = 2; k < n; k++) {
    const a = [pts[k - 1][0] - pts[k - 2][0], pts[k - 1][2] - pts[k - 2][2]], b = [pts[k][0] - pts[k - 1][0], pts[k][2] - pts[k - 1][2]];
    sharpest = Math.min(sharpest, (a[0] * b[0] + a[1] * b[1]) / (Math.hypot(...a) * Math.hypot(...b)));
  }
  need(sharpest > Math.cos(25 * Math.PI / 180), `the route kinks by ${fmt(Math.acos(sharpest) * 180 / Math.PI, 1)} degrees between two steps`);
  // On the surface: our own ray from 1 unit above each point must meet the road at the point's height.
  let noRoad = 0, worstHeight = 0;
  for (const p of pts) { const y = surfaceBelow(mesh, p, 1, 2.5); if (y == null) noRoad++; else worstHeight = Math.max(worstHeight, Math.abs(y - p[1])); }
  need(noRoad === 0, `${noRoad} route points have no road under them`);
  need(worstHeight < 0.05, `a route point is ${fmt(worstHeight, 3)} units above or below the road surface`);
  need(route.onRoad === 1, `the generator's own onRoad is ${route.onRoad}`);
  // In the middle: kerbs equally far on both sides (rays 0.45 above the road, square to the route).
  let offCentre = 0, measured = 0, worstCentre = 0, widths = [];
  for (let k = 3; k < n - 3; k++) {
    const t = [pts[k + 3][0] - pts[k - 3][0], pts[k + 3][2] - pts[k - 3][2]], l = Math.hypot(...t);
    const left = [t[1] / l, 0, -t[0] / l], from = [pts[k][0], pts[k][1] + 0.45, pts[k][2]];
    const a = mesh.raycast(from, left, 9), b = mesh.raycast(from, left.map((v) => -v), 9);
    if (a === Infinity || b === Infinity) continue;
    measured++; widths.push(a + b);
    worstCentre = Math.max(worstCentre, Math.abs(a - b) / 2);
    if (Math.abs(a - b) / 2 > 0.3) offCentre++;
  }
  need(measured > 0.9 * n, `kerbs found on both sides at only ${measured} of ${n} route points`);
  need(offCentre <= 0.01 * measured, `${offCentre} of ${measured} route points are more than 0.3 units off the middle of the road (worst ${fmt(worstCentre, 2)})`);
  widths.sort((a, b) => a - b);
  need(near(widths[widths.length >> 1], 11.3, 0.2), `median kerb-to-kerb width is ${fmt(widths[widths.length >> 1], 2)}, README says 2 x 5.65`);
  need(route.halfWidth.length === n && route.halfWidth.every((h) => h === null || (h > 5.4 && h < 6.4)), 'halfWidth has a value that is not a road half-width');
  // Headroom: nothing within 3.5 units above the road along the route (a gate's bar hangs at 4; a
  // road crossing overhead must be far higher).
  let lowRoof = Infinity;
  for (const p of pts) lowRoof = Math.min(lowRoof, mesh.raycast([p[0], p[1] + 0.3, p[2]], [0, 1, 0], 12));
  need(lowRoof > 3.2, `something hangs ${fmt(lowRoof + 0.3, 2)} units above the road on the route`);
  // Pieces along the route: every piece visited, in order.
  need(route.piece.length === n && route.piece.every((v, k) => k === 0 || v === route.piece[k - 1] || v === route.piece[k - 1] + 1) && route.piece[0] === 0 && route.piece.at(-1) === parts.length - 1, 'route.piece does not walk the pieces in order from the first to the last');
  // Start: the route begins at the spawn point, on the road under it.
  const spawn = route.start.position;
  need(Math.hypot(pts[0][0] - spawn[0], pts[0][2] - spawn[2]) < 0.6 && near(spawn[1] - pts[0][1], 0.14, 0.02), `route starts ${fmt(Math.hypot(pts[0][0] - spawn[0], pts[0][2] - spawn[2]), 2)} from the spawn point, ${fmt(spawn[1] - pts[0][1], 3)} below it`);
  // Length and height as asked.
  need(route.length >= options.length && route.length <= options.length + 260, `length ${route.length} for ${options.length} wanted`);
  const levels = parts.map((p) => p.y);
  need(Math.min(...levels) >= 1 && Math.max(...levels) <= 2 + 4 + 2, `levels ${Math.min(...levels)} to ${Math.max(...levels)}`);
  need(pts.every((p) => p[1] > 5), 'the route comes within 5 units of the ground');

  check(`${label}: start, checkpoints in order, finish; no overlap; route continuous, on the surface, centred, through every gate`, fails.length === 0,
    fails.length ? fails.join(' | ') : `${parts.length} pieces, ${route.length} units, ${checkpoints.length} checkpoints, steps ${fmt(shortest, 3)}..${fmt(longest, 3)}, height error ${fmt(worstHeight, 3)}, off centre ${fmt(worstCentre, 2)}, lowest roof ${fmt(lowRoof + 0.3, 1)}`);
  return { parts, overlaps };
}

await section('structure', () => {
  const cases = [
    { seed: 1, length: 500, difficulty: 0 }, { seed: 2, length: 500, difficulty: 0.25 }, { seed: 3, length: 500, difficulty: 0.5 },
    { seed: 4, length: 500, difficulty: 0.75 }, { seed: 5, length: 500, difficulty: 1 }, { seed: 31, length: 900, difficulty: 1 },
    { seed: 32, length: 700, difficulty: 0.6, slopes: false }, { seed: 301, length: 2500, difficulty: 0.7 },
  ];
  let crossings = 0;
  for (const options of cases) {
    const track = generateTrack(options);
    examine(track, `track ${track.name}`, options);
    // Does a road cross over another? Two route points within 3 units in plan and 8 or more apart in height.
    const pts = track.route.points;
    let crosses = false;
    for (let i = 0; i < pts.length && !crosses; i += 2) for (let j = i + 40; j < pts.length; j += 2) {
      if (Math.abs(pts[i][1] - pts[j][1]) >= 8 && Math.hypot(pts[i][0] - pts[j][0], pts[i][2] - pts[j][2]) < 3) { crosses = true; break; }
    }
    if (crosses) crossings++;
  }
  check('structure: at least one of the tracks examined has a road crossing over another (so the overlap and headroom checks met that case)', crossings >= 1, `${crossings} of ${cases.length}`);
});

await section('the overlap test itself', () => {
  // The test must be able to fail. Take a good track and (a) put a copy of a straight
  // piece one cell along from the original, inside it; (b) lay a second road 1 level
  // (5 units) above a piece, where the generator demands 2.
  const track = generateTrack({ seed: 3, length: 500, difficulty: 0.5 });
  const parts = decodeParts(track.trackData);
  const straight = parts.find((p) => p.typeId === 0) ?? parts[1];
  check('overlap test: a good track has no overlapping pair', overlappingParts(parts).length === 0);
  check('overlap test: a second piece one cell along inside another is caught', overlappingParts([...parts, { ...straight, x: straight.x + 1, z: straight.z + 1 }]).length >= 1);
  check('overlap test: the same piece copied onto itself is caught', overlappingParts([...parts, { ...straight }]).length >= 1);
  const twoUp = overlappingParts([...parts, { ...straight, y: straight.y + 2 }]).length;
  check('overlap test: a road two levels up (the generator\'s minimum for a crossing) is not an overlap', twoUp === 0, `${twoUp} pairs`);
  // Two pieces end to end, and side by side one piece-width apart, touch but do not overlap.
  const a = { typeId: 0, x: 0, y: 2, z: 0, rotation: 0, rotationAxis: 0 };
  check('overlap test: two straights end to end, and side by side, are not an overlap', overlappingParts([a, { ...a, z: 4 }, { ...a, x: 4 }]).length === 0);
});

await section('files', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'g22-files-'));
  try {
    const track = generateTrack({ seed: 9, length: 400, difficulty: 0.4, environment: 1 });
    const { trackFile, routeFile } = saveTrack(track, dir);
    const loaded = loadGenerated(trackFile);
    check('files: saveTrack writes <name>.track.json and <name>.route.json', existsSync(trackFile) && existsSync(routeFile) && trackFile.endsWith(`${track.name}.track.json`));
    check('files: loadGenerated gives back the same track string, name and route', loaded.createCar.trackData === track.trackData && loaded.name === track.name && JSON.stringify(loaded.route.points) === JSON.stringify(track.route.points) && JSON.stringify(loaded.route.gates) === JSON.stringify(track.route.gates));
    check('files: createCar has the three fields the simulator takes (track string, no mountains)', loaded.createCar.mountainVertices instanceof Float32Array && loaded.createCar.mountainVertices.length === 0 && loaded.createCar.mountainOffset.x === 0);
    const meta = loaded.meta;
    check('files: the track file records how it was made (seed, difficulty, length wanted, slopes, environment, base level, parts, pieces)', meta.seed === 9 && meta.difficulty === 0.4 && meta.wantedLength === 400 && meta.slopes === true && meta.environment === 1 && meta.baseLevel === 2 && meta.parts.length === track.parts.length && meta.pieces.length === track.parts.length && meta.checkpoints === track.route.gates.length - 1 && meta.length === track.route.length);
    // The command line: track k uses seed + k.
    const out = execFileSync(process.execPath, ['ideas/g2-2-track-generator/generate.mjs', '--count', '2', '--seed', '40', '--length', '300', '--difficulty', '0.5', '--out', dir], { cwd: root, encoding: 'utf8' });
    const written = readdirSync(dir).filter((f) => f.startsWith('gen_s4') && f.endsWith('.track.json')).sort();
    const same = written.length === 2 && written.every((f, k) => loadGenerated(path.join(dir, f)).createCar.trackData === generateTrack({ seed: 40 + k, length: 300, difficulty: 0.5, environment: (40 + k) % 3 }).trackData);
    check('generate.mjs --count 2 --seed 40: writes two tracks, seeds 40 and 41, identical to generateTrack with those options', same, `${written.join(', ')}; ${out.trim().split(/\r?\n/).length} lines printed`);
  } finally { rmSync(dir, { recursive: true, force: true }); }

  // The 20 sample tracks on disk: regenerate each from its recorded options.
  const sample = path.join(root, 'ideas/g2-2-track-generator/tracks/sample');
  const files = readdirSync(sample).filter((f) => f.endsWith('.track.json')).sort();
  let differ = 0, staleRoutes = 0, sharp = 0;
  for (const f of files) {
    const { meta, route } = loadGenerated(path.join(sample, f));
    const again = generateTrack({ seed: meta.seed, length: meta.wantedLength, difficulty: meta.difficulty, slopes: meta.slopes, environment: meta.environment, baseLevel: meta.baseLevel });
    if (again.trackData !== meta.trackData || again.name !== meta.name) differ++;
    if (JSON.stringify(again.route.points) !== JSON.stringify(route.points) || again.route.length !== meta.length) staleRoutes++;
    if (meta.pieces.includes('TurnSharp')) sharp++;
  }
  check('files: all 20 saved sample tracks (seeds 500 to 519) come out identical when regenerated from their recorded options', files.length === 20 && differ === 0, `${files.length} files, ${differ} differ`);
  // (They were rewritten by the tester after the route fix in generate.mjs; see TESTING.md, defect 1.)
  check('files: and their saved route files are the routes the generator computes now (not left over from older code)', staleRoutes === 0, `${staleRoutes} of ${files.length} differ; ${sharp} of the tracks have a TurnSharp`);
});

await section('one saved sample track', () => {
  // The files other ideas would read: check one straight from disk.
  const sample = path.join(root, 'ideas/g2-2-track-generator/tracks/sample');
  const file = readdirSync(sample).filter((f) => f.endsWith('.track.json')).sort()[10];
  const loaded = loadGenerated(path.join(sample, file));
  examine({ ...loaded.meta, route: loaded.route }, `saved ${loaded.name}`, { length: loaded.meta.wantedLength });
});
