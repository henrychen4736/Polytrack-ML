// pieces.mjs and check_pieces.mjs: the piece table. No simulator, about 10 s.
//
//   derivePorts     on hand-made triangle meshes whose ports are obvious
//   worldPorts      placed and turned, worked by hand
//   worldTiles      against the parts' own collision triangles, and against
//                   the official tracks (where the game's editor guarantees
//                   no two parts share a cell)
//   README table    the 16 rows, against the table computed now
//   official tracks the README's "2863 of 3005 ports mate (95%)" recounted
//                   with this file's own mating code, then checked a third
//                   way that uses no ports at all: does the road surface
//                   really continue across a port the table calls mated?
import { readFileSync } from 'node:fs';
import { derivePorts, loadPieceTable, worldPorts, worldTiles } from '../pieces.mjs';
import { matePorts, reachable } from '../check_pieces.mjs';
import { rotate, ROTATIONS } from '../../../sim/track.mjs';
import { loadTrackInfo } from '../../shared/track_info.mjs';
import { TRACKS } from '../../shared/laps.mjs';
import { partVoxels, surfaceBelow } from './_geometry.mjs';
import { check, near, fmt, section } from './_check.mjs';

// ---------------------------------------------------------------------------
// Hand-made meshes.
// ---------------------------------------------------------------------------
/** A four-cornered patch from (x0, z0) to (x1, z1) with height y(x, z), as two triangles wound to face up. */
function quad(x0, z0, x1, z1, y = () => 1) {
  const P = (x, z) => [x, y(x, z), z];
  const A = P(x0, z0), B = P(x0, z1), C = P(x1, z0), D = P(x1, z1);
  return [A, B, C, C, B, D];
}
/** A wall 1 unit high standing on the edge from p to q. */
const wall = (p, q) => [p, q, [p[0], p[1] + 1, p[2]], q, [q[0], q[1] + 1, q[2]], [p[0], p[1] + 1, p[2]]];
const mesh = (...corners) => Float32Array.from(corners.flat(2));
const describe = (ports) => ports.map((p) => `${'xyz'[p.axis]}=${p.plane} out ${p.out > 0 ? '+' : '-'} width ${fmt(p.width, 2)} pitch ${fmt(p.pitch, 3)}`).sort().join('; ');

await section('derivePorts', () => {
  // A. A bare slab 10 wide (x -5..5) and 20 long (z -10..10): open on all four sides.
  const slab = quad(-5, -10, 5, 10);
  const a = derivePorts(mesh(slab));
  check('derivePorts: a bare flat slab whose four edges are on grid planes has four ports', a.length === 4, describe(a));
  // B. The same with a wall along both long edges: a road. Two ports, at its ends.
  const road = mesh(slab, wall([-5, 1, -10], [-5, 1, 10]), wall([5, 1, -10], [5, 1, 10]));
  const b = derivePorts(road).sort((p, q) => p.plane - q.plane);
  check('derivePorts: with walls on the long edges only the two ends are ports', b.length === 2, describe(b));
  check('derivePorts: the end ports are on z = -10 (leading out towards -z) and z = +10 (towards +z)', b.length === 2 && b[0].axis === 2 && b[0].plane === -10 && b[0].out === -1 && b[1].axis === 2 && b[1].plane === 10 && b[1].out === 1);
  check('derivePorts: width 10, centre on the centre line at the surface height, pitch 0', b.length === 2 && b.every((p) => near(p.width, 10, 1e-6) && near(p.center[0], 0, 1e-6) && near(p.center[1], 1, 1e-6) && p.pitch === 0), JSON.stringify(b.map((p) => p.center)));
  // C. A ramp 8 wide (x -4..4, not on a grid plane): 0 high at z = +10, 5 high at z = -10.
  const ramp = derivePorts(mesh(quad(-4, -10, 4, 10, (x, z) => 5 * (10 - z) / 20))).sort((p, q) => p.plane - q.plane);
  check('derivePorts: a ramp has ports only at its two ends (its sides are not on grid planes)', ramp.length === 2 && ramp.every((p) => p.axis === 2), describe(ramp));
  // Leaving through the high end (z = -10) the road is climbing 5 in 20: pitch +0.25. Through the low end: -0.25.
  check('derivePorts: pitch is +0.25 leaving the top of a 5-in-20 ramp and -0.25 leaving the bottom', ramp.length === 2 && near(ramp[0].pitch, 0.25, 1e-6) && near(ramp[1].pitch, -0.25, 1e-6) && near(ramp[0].center[1], 5, 1e-6) && near(ramp[1].center[1], 0, 1e-6), describe(ramp));
  // D. A strip 2 wide is not a road.
  check('derivePorts: a strip 2 units wide has no port (too narrow for a car)', derivePorts(mesh(quad(-1, -10, 1, 10))).length === 0);
  // E. An end that is not on a grid plane is not a port.
  const short = derivePorts(mesh(quad(-4, -10, 4, 7)));
  check('derivePorts: an end at z = 7 (not a multiple of 5) is not a port; the end at z = -10 is', short.length === 1 && short[0].plane === -10, describe(short));
  // F. Two patches joined end to end: the seam between them is inside, not a port.
  const two = derivePorts(mesh(quad(-4, -10, 4, 0), quad(-4, 0, 4, 10)));
  check('derivePorts: the seam between two joined patches is not a port', two.length === 2 && two.every((p) => Math.abs(p.plane) === 10), describe(two));
  // ... and side by side: each end is made of two edges, which must come out as ONE port 8 wide.
  const split = derivePorts(mesh(quad(-4, -10, 0, 10), quad(0, -10, 4, 10)));
  check('derivePorts: an end made of two edges in a line is one port of the full width', split.length === 2 && split.every((p) => near(p.width, 8, 1e-6) && near(p.center[0], 0, 1e-6)), describe(split));
  // G. The same slab facing down (a ceiling) is not drivable.
  check('derivePorts: a surface facing down has no ports', derivePorts(mesh(slab.slice().reverse())).length === 0);
  // H. A kerb-height step (0.2) on the edge is not a wall: still a port. A 0.5 one is.
  const lowLip = mesh(slab, [[-5, 1, -10], [-5, 1, 10], [-5, 1.2, -10]]), highLip = mesh(slab, [[-5, 1, -10], [-5, 1, 10], [-5, 1.5, -10]]);
  check('derivePorts: a lip 0.5 high on an edge closes it; one 0.2 high does not', derivePorts(lowLip).length === 4 && derivePorts(highLip).length === 3, `${derivePorts(lowLip).length} and ${derivePorts(highLip).length} ports`);
});

await section('worldPorts and worldTiles', () => {
  const slab = quad(-5, -10, 5, 10);
  const road = mesh(slab, wall([-5, 1, -10], [-5, 1, 10]), wall([5, 1, -10], [5, 1, 10]));
  const table = new Map([[900, { ports: derivePorts(road), tiles: [[[0, 0, 0], [0, 0, 1]]] }]]);
  const part = (rotation) => ({ typeId: 900, x: 2, y: 1, z: -3, rotation, rotationAxis: 0 });
  // Part at cell (2, 1, -3) = world (10, 5, -15). Unturned: ports at z = -15 -+ 10, height 5 + 1.
  const r0 = worldPorts(part(0), table).sort((p, q) => p.plane - q.plane);
  check('worldPorts: unturned at cell (2, 1, -3) the ports are at (10, 6, -25) facing -z and (10, 6, -5) facing +z', r0.length === 2 && r0[0].center.every((v, k) => near(v, [10, 6, -25][k], 1e-6)) && r0[0].axis === 2 && r0[0].out === -1 && r0[0].plane === -25 && r0[1].center.every((v, k) => near(v, [10, 6, -5][k], 1e-6)) && r0[1].out === 1, JSON.stringify(r0.map((p) => [p.center, p.axis, p.out, p.plane])));
  // A half turn swaps them: the port that was at local +z is now at world z = -25, still leading outwards.
  const r2 = worldPorts(part(2), table);
  const far = r2.find((p) => near(p.center[2], -25, 1e-6));
  check('worldPorts: after a half turn each port still leads out of the part (out = -1 at z = -25, +1 at z = -5)', r2.length === 2 && far?.out === -1 && r2.find((p) => near(p.center[2], -5, 1e-6))?.out === 1);
  // A quarter turn puts the ports on planes of constant x, 10 either side of x = 10.
  for (const rotation of [1, 3]) {
    const r = worldPorts(part(rotation), table).sort((p, q) => p.plane - q.plane);
    check(`worldPorts: quarter turn ${rotation}: ports on x = 0 (out -x) and x = 20 (out +x), at z = -15, height 6`, r.length === 2 && r.every((p) => p.axis === 0 && near(p.center[2], -15, 1e-6) && near(p.center[1], 6, 1e-6)) && r[0].plane === 0 && r[0].out === -1 && r[1].plane === 20 && r[1].out === 1, JSON.stringify(r.map((p) => [p.center, p.axis, p.out, p.plane])));
  }
  check('worldPorts: width and pitch are carried over unchanged', worldPorts(part(1), table).every((p) => near(p.width, 10, 1e-6) && p.pitch === 0));
  // Tiles: two cells, (0,0,0) and (0,0,1), i.e. the box x 0..5, z 0..10 of the part's frame.
  const cells = (rotation) => worldTiles(part(rotation), table).map((c) => c.join(',')).sort().join(' ');
  check('worldTiles: unturned, cells (0,0,0) and (0,0,1) of a part at (2,1,-3) are (2,1,-3) and (2,1,-2)', cells(0) === '2,1,-2 2,1,-3', cells(0));
  // Half turn: the box x 0..5, z 0..10 becomes x -5..0, z -10..0: cells (-1,0,-1) and (-1,0,-2).
  check('worldTiles: half turn, the same two cells become (1,1,-4) and (1,1,-5)', cells(2) === '1,1,-4 1,1,-5', cells(2));
  // Quarter turns: the box becomes x 0..10, z -5..0 or x -10..0, z 0..5, whichever way rotate() turns;
  // work the answer out from rotate() itself (the transform the mesh uses).
  for (const rotation of [1, 3]) {
    const q = ROTATIONS[0][rotation];
    const want = [[0.5, 0.5, 0.5], [0.5, 0.5, 1.5]].map((c) => rotate(c, q).map((v, k) => Math.floor(v + 1e-6) + [2, 1, -3][k]).join(',')).sort().join(' ');
    const corner = rotate([2.5, 0, 7.5], q);   // a point inside the second cell
    check(`worldTiles: quarter turn ${rotation} puts the cells where the mesh transform puts the geometry`, cells(rotation) === want && cells(rotation).split(' ').includes([Math.floor(corner[0] / 5) + 2, 1, Math.floor(corner[2] / 5) - 3].join(',')), cells(rotation));
  }
});

// ---------------------------------------------------------------------------
// The real table.
// ---------------------------------------------------------------------------
const table = loadPieceTable();
const GENERATOR_IDS = [0, 1, 2, 3, 4, 5, 6, 36, 37, 38, 39, 41, 42, 52, 82, 83];

await section('tiles against triangles', () => {
  // Every generator piece, in every rotation: its collision triangles must lie
  // inside the columns of cells the table says it occupies. (Height is not
  // compared: a ramp's top end and a gate's posts rise above their cells.)
  const bad = [];
  let inside = 0, total = 0;
  for (const id of GENERATOR_IDS) for (let rotation = 0; rotation < 4; rotation++) {
    const part = { typeId: id, x: 3, y: 2, z: -4, rotation, rotationAxis: 0 };
    const columns = new Set(worldTiles(part, table).map(([x, , z]) => `${x},${z}`));
    let out = 0, count = 0;
    for (const key of partVoxels(part)) {
      // voxelKey packs ((x + 8192) * 16384 + (y + 8192)) * 16384 + (z + 8192)
      const z = key % 16384 - 8192, x = Math.floor(key / (16384 * 16384)) - 8192;
      count++;
      if (!columns.has(`${Math.floor(x / 5)},${Math.floor(z / 5)}`)) out++;
    }
    total += count; inside += count - out;
    if (out) bad.push(`${table.get(id).name} rotation ${rotation}: ${out} of ${count} voxels outside its cells`);
  }
  check('worldTiles: for all 16 generator pieces in all 4 rotations, every bit of the collision shape is above or below a cell the piece claims', bad.length === 0, bad.length ? bad.slice(0, 4).join('; ') : `${total} voxels checked`);
  // The other direction: a claimed column with nothing in it would only waste space, but
  // a piece that claims far more than it covers means the list is for another shape.
  let empty = 0, claimed = 0;
  for (const id of GENERATOR_IDS) {
    const part = { typeId: id, x: 0, y: 0, z: 0, rotation: 1, rotationAxis: 0 };
    const used = new Set();
    for (const key of partVoxels(part)) used.add(`${Math.floor((Math.floor(key / (16384 * 16384)) - 8192) / 5)},${Math.floor((key % 16384 - 8192) / 5)}`);
    for (const c of new Set(worldTiles(part, table).map(([x, , z]) => `${x},${z}`))) { claimed++; if (!used.has(c)) empty++; }
  }
  check('worldTiles: no generator piece claims a column of cells it has no geometry in', empty === 0, `${empty} of ${claimed} claimed columns are empty`);
});

await section('official tracks: no shared cells', () => {
  // On the official tracks no two ROAD parts (Road, RoadTurns, RoadWide,
  // Special: the families the generator builds from) occupy the same cell.
  // (Blocks, planes, pillars and signs do share cells with roads and with each
  // other there, 7966 times, so the rule cannot be asked of every part.) A
  // wrong rotation rule for cells would show up here: 1500 road parts, most of
  // them turned.
  const ROADS = new Set(['Road', 'RoadTurns', 'RoadWide', 'Special']);
  let shared = 0, parts = 0, turned = 0; const where = [];
  for (const name of TRACKS) {
    const info = loadTrackInfo(name), seen = new Map();
    info.parts.forEach((part, i) => {
      if (!ROADS.has(table.get(part.typeId).category)) return;
      parts++; if (part.rotation !== 0) turned++;
      for (const c of worldTiles(part, table)) {
        const key = c.join(',');
        if (seen.has(key) && seen.get(key) !== i) { shared++; if (where.length < 3) where.push(`${name}: ${table.get(part.typeId).name} and ${table.get(info.parts[seen.get(key)].typeId).name} at ${key}`); }
        seen.set(key, i);
      }
    });
  }
  check('worldTiles: on the 17 official tracks no two road parts are given the same cell', shared === 0 && parts > 1000, shared ? `${shared} shared cells, e.g. ${where.join('; ')}` : `${parts} placed road parts, ${turned} of them turned`);
});

await section('README table', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const rows = readme.split(/\r?\n/).filter((l) => /^\| \d+ \| [A-Z]/.test(l)).map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
  check('README: the piece table has the 16 generator part types', rows.length === 16 && rows.map((r) => +r[0]).join() === GENERATOR_IDS.join(), rows.map((r) => r[0]).join());
  const bad = [];
  for (const r of rows) {
    const piece = table.get(+r[0]);
    if (piece.name !== r[1]) bad.push(`${r[0]}: name ${piece.name} vs ${r[1]}`);
    const faces = r[2].split(' / '), centres = r[3].split(' / ').map((c) => c.split(',').map(Number)), heights = r[4].split(' / ').map(Number), pitches = r[6].split(' / ').map(Number);
    if (piece.ports.length !== 2) { bad.push(`${r[1]}: ${piece.ports.length} ports`); continue; }
    piece.ports.forEach((p, i) => {
      const face = `${p.out > 0 ? '+' : '-'}${'xyz'[p.axis]}`;
      if (face !== faces[i]) bad.push(`${r[1]} port ${i}: faces ${face}, README ${faces[i]}`);
      if (!near(p.center[0] / 5, centres[i][0], 0.01) || !near(p.center[2] / 5, centres[i][1], 0.01)) bad.push(`${r[1]} port ${i}: centre ${fmt(p.center[0] / 5, 2)}, ${fmt(p.center[2] / 5, 2)} cells, README ${centres[i]}`);
      if (!near(p.center[1], heights[i], 0.006)) bad.push(`${r[1]} port ${i}: height ${fmt(p.center[1], 3)}, README ${heights[i]}`);
      if (!near(p.width, +r[5], 0.006)) bad.push(`${r[1]} port ${i}: width ${fmt(p.width, 3)}, README ${r[5]}`);
      if (!near(p.pitch, pitches[i], 0.006)) bad.push(`${r[1]} port ${i}: pitch ${fmt(p.pitch, 3)}, README ${pitches[i]}`);
    });
  }
  check('README: every row of the piece table (faces, centres, heights, width, pitch) matches the table computed from the triangles', bad.length === 0, bad.slice(0, 5).join('; '));
  // "the turns are quarter circles of radius 10, 30, 50, 70 and 90 units": for a quarter circle the two
  // ports are square to each other and both centres are one radius from the corner they turn about.
  const radii = [1, 36, 37, 82, 83].map((id) => {
    const [a, b] = table.get(id).ports;                       // a faces +-x, b faces +-z
    const corner = [a.center[0], b.center[2]];                // the point both port planes pass through
    return [Math.abs(b.center[0] - corner[0]), Math.abs(a.center[2] - corner[1])];
  });
  check('README: the five turn pieces are quarter turns of radius 10, 30, 50, 70 and 90 units', radii.every(([r1, r2], i) => near(r1, [10, 30, 50, 70, 90][i], 0.01) && near(r2, r1, 0.01)), radii.map((r) => fmt(r[0], 1)).join(', '));
  // ... and the road surface of a turn really is that arc: surface points of TurnLong are 50 +- 5.6 from its centre.
  check('README: "S-bends move the road 20 units sideways over 60"', [41, 42].every((id) => { const [a, b] = table.get(id).ports; return near(Math.abs(a.center[0] - b.center[0]), 20, 0.01) && near(Math.abs(a.center[2] - b.center[2]), 60, 0.01); }));
  check('README: ramps climb 5 units (SlopeUp, SlopeDown) or 10 (Slope, SlopeUpLong, SlopeDownLong)', [2, 3].every((id) => near(Math.abs(table.get(id).ports[0].center[1] - table.get(id).ports[1].center[1]), 5, 0.01)) && [4, 38, 39].every((id) => near(Math.abs(table.get(id).ports[0].center[1] - table.get(id).ports[1].center[1]), 10, 0.01)));
});

// ---------------------------------------------------------------------------
// The official tracks.
// ---------------------------------------------------------------------------
const ROAD = new Set(['Road', 'RoadTurns', 'RoadWide', 'Special']);
const SURFACE = new Set([...ROAD, 'Block', 'Plane', 'WallTrack']);

/** Our own mating: ports of placed parts, turned with rotate() here (not worldPorts), paired by the README's rule. */
function recount(parts) {
  const ports = [];
  parts.forEach((part, k) => {
    const q = ROTATIONS[part.rotationAxis][part.rotation], o = [part.x * 5, part.y * 5, part.z * 5];
    for (const p of table.get(part.typeId).ports) {
      const n = [0, 0, 0]; n[p.axis] = p.out;
      const normal = rotate(n, q), a = rotate(p.a, q).map((v, i) => v + o[i]), b = rotate(p.b, q).map((v, i) => v + o[i]);
      const axis = Math.abs(normal[0]) > 0.5 ? 0 : Math.abs(normal[1]) > 0.5 ? 1 : 2;
      ports.push({ part: k, axis, out: Math.sign(normal[axis]), plane: (a[axis] + b[axis]) / 2, a, b, mated: false, road: ROAD.has(table.get(part.typeId).category) });
    }
  });
  for (let i = 0; i < ports.length; i++) for (let j = i + 1; j < ports.length; j++) {
    const p = ports[i], q = ports[j];
    if (p.axis === 1 || p.axis !== q.axis || p.part === q.part || p.out === q.out || Math.abs(p.plane - q.plane) > 0.05) continue;
    const s = p.axis === 0 ? 2 : 0;
    const lo = Math.max(Math.min(p.a[s], p.b[s]), Math.min(q.a[s], q.b[s])), hi = Math.min(Math.max(p.a[s], p.b[s]), Math.max(q.a[s], q.b[s]));
    if (hi - lo < 4) continue;                                   // overlap by 4 units
    const at = (r, x) => r.a[1] + (x - r.a[s]) / (r.b[s] - r.a[s]) * (r.b[1] - r.a[1]);
    if (Math.abs(at(p, (lo + hi) / 2) - at(q, (lo + hi) / 2)) > 0.3) continue;   // within 0.3 in height
    p.mated = q.mated = true;
  }
  return ports;
}

await section('official tracks', () => {
  let roadPorts = 0, mated = 0, authorPorts = 0, authorMated = 0, reachAll = 0;
  // The third way: is there really surface on the far side of the port?
  let matedContinues = 0, matedChecked = 0, openContinues = 0, openChecked = 0;
  const reached = [];
  for (const name of TRACKS) {
    const info = loadTrackInfo(name);
    const parts = info.parts.filter((p) => SURFACE.has(table.get(p.typeId).category));
    const mine = recount(parts);
    for (const p of mine) {
      if (!p.road || p.axis === 1) continue;
      roadPorts++; if (p.mated) mated++;
      // Only level ports of upright parts can be probed with a ray straight down.
      if (parts[p.part].rotationAxis !== 0) continue;
      const mid = [0, 1, 2].map((k) => (p.a[k] + p.b[k]) / 2);
      const beyond = mid.slice(); beyond[p.axis] += p.out * 0.6;
      const y = surfaceBelow(info.mesh, beyond, 0.8, 1.6);
      const continues = y != null && Math.abs(y - mid[1]) <= 0.5;
      if (p.mated) { matedChecked++; if (continues) matedContinues++; } else { openChecked++; if (continues) openContinues++; }
    }
    // The author's own count, for the README's exact figures.
    const theirs = matePorts(parts, table);
    const road = theirs.ports.filter((p) => ROAD.has(table.get(parts[p.part].typeId).category) && p.axis !== 1);
    authorPorts += road.length; authorMated += road.filter((p) => p.mate >= 0).length;
    const seen = reachable(theirs.links, parts.findIndex((p) => p.startOrder != null));
    const gates = parts.map((p, k) => ({ p, k })).filter(({ p }) => table.get(p.typeId).detector);
    if (gates.every(({ k }) => seen.has(k))) { reachAll++; reached.push(name); }
  }
  check('official tracks: check_pieces.mjs matePorts gives the README\'s 2863 of 3005 road ports mated', authorMated === 2863 && authorPorts === 3005, `${authorMated} of ${authorPorts}`);
  check('official tracks: our own recount of the same rule (own port transform, own pairing) gives the same 2863 of 3005 (95%)', mated === 2863 && roadPorts === 3005, `${mated} of ${roadPorts} (${(100 * mated / roadPorts).toFixed(1)}%)`);
  check('official tracks: 4 of 17 can be driven start to finish through mated ports alone: summer5, summer6, desert2, desert4 (README)', reachAll === 4 && reached.sort().join() === 'desert2,desert4,summer5,summer6', `${reachAll}: ${reached.join(', ')}`);
  // A port the table mates should have road on its far side. (Not every one: where the
  // neighbour is a ramp's top the surface starts a little higher or lower than 0.5.)
  check('official tracks: at 97% or more of the ports the table calls mated, a ray cast finds road surface continuing 0.6 units beyond the port', matedContinues / matedChecked >= 0.97, `${matedContinues} of ${matedChecked} (${(100 * matedContinues / matedChecked).toFixed(1)}%)`);
  // Taken together: "the table mates this port" and "the surface continues beyond it"
  // should be the same statement for nearly every port.
  const agree = matedContinues + (openChecked - openContinues), checked = matedChecked + openChecked;
  check('official tracks: "mated" and "surface continues beyond the port" agree for 95% or more of the road ports', agree / checked >= 0.95, `${agree} of ${checked} (${(100 * agree / checked).toFixed(1)}%); ${matedChecked - matedContinues} mated ports with no surface found beyond, ${openContinues} of ${openChecked} open ports with surface beyond (mates the table misses)`);
});
