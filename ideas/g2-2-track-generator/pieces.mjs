// The piece table: for every part type, WHERE ITS DRIVING SURFACE IS OPEN.
//
// A track is a list of placed parts (sim/track.mjs). To lay parts end to end
// we need, for each part type, its "ports": the places where the drivable
// surface reaches the edge of the part and another part's surface can carry
// on. Nothing in the game's data says this directly, so it is worked out here
// from the collision triangles the simulator itself uses
// (data/init_0.6.3.json, the same triangles sim/trackmesh.mjs builds the mesh
// from):
//
//   1. Keep the triangles that face up (a car can drive on them).
//   2. Find their BOUNDARY edges: edges that belong to only one such triangle.
//   3. Keep boundary edges that lie on a grid plane (x or z a multiple of 5
//      units; parts sit on a 5-unit grid, so surfaces of two parts can only
//      meet on such a plane) and that have no wall or kerb rising from them.
//   4. Join edges that continue one another into one port.
//
// A plain road piece ends up with two ports (its two ends), an intersection
// with three or four, a block with four (it is a flat square, open on every
// side). The table is computed when asked for, in about 0.1 s, and never
// written to disk: the triangles are Kodub's (BRIEF.md rule 4), and a port is
// only a handful of numbers derived from them.
//
// Checked against the official tracks by check_pieces.mjs: two ports "mate"
// when they are on the same plane, face each other, are at the same height
// and overlap; an official track is a graph of parts joined by mated ports.
import { readFileSync } from 'node:fs';
import { loadCaptured } from '../../sim/host.mjs';
import { rotate, ROTATIONS, PART_SIZE } from '../../sim/track.mjs';

/** A triangle counts as drivable when its normal's upward part is at least
 *  this. 0.35 is a 70 degree slope: it keeps every ramp and banked road and
 *  drops kerb sides (measured upward part 0.2) and walls (0). */
const UP_MIN = 0.35;
/** Ports narrower than this are not road: kerb tops are 0.4 to 0.8 units
 *  wide, the car is about 2 wide, the narrowest road is 11.1. */
const MIN_WIDTH = 3;
/** Positions within this distance are the same point (mesh coordinates are
 *  float32 near +-100, so rounding noise is about 1e-5). */
const EPS = 0.01;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const key = (p) => p.map((v) => Math.round(v / EPS)).join(',');
const onGridPlane = (v) => Math.abs(v / PART_SIZE - Math.round(v / PART_SIZE)) < EPS;

/**
 * Ports of one part type, in the part's own frame (before rotation, origin
 * at the part's grid position), in world units.
 *
 * Each port:
 *   axis     0 or 2: the port lies on a plane x = const (0) or z = const (2)
 *   plane    that constant
 *   out      +1 or -1: which way along `axis` leads OUT of the part
 *   a, b     the two ends of the opening, [x, y, z]
 *   center   midpoint of a and b
 *   width    distance from a to b
 *   pitch    rise of the surface per unit travelled outwards through the port
 *            (0 on a flat road, positive when leaving the part uphill)
 *
 * options.openCaps: a non-drivable triangle lying flat IN the port's own grid
 * plane does not close the opening. Needed for the banked (tilted) road
 * pieces 159 to 167: their raised edge lines end in small end caps standing
 * in the end plane, and those caps were read as a kerb across the opening,
 * so StraightTilted and the tilted turns lost one of their two ports. A wall
 * across an opening stands in that plane too, so this is only used for the
 * parts it was checked on (loadFeatureTable below), where the end found
 * mirrors the other end of the same piece exactly.
 */
export function derivePorts(vertices, { openCaps = false } = {}) {
  const n = vertices.length / 9;
  const tri = (t) => [0, 3, 6].map((o) => [vertices[t * 9 + o], vertices[t * 9 + o + 1], vertices[t * 9 + o + 2]]);

  // Pass 1: which triangles face up, and how often each of their edges is used.
  const upward = [];
  const edgeUse = new Map();   // undirected edge -> number of upward triangles using it
  const risers = new Set();    // undirected edges from which a non-drivable triangle rises
  const edgeKey = (p, q) => { const a = key(p), b = key(q); return a < b ? `${a}|${b}` : `${b}|${a}`; };
  for (let t = 0; t < n; t++) {
    const P = tri(t);
    const normal = cross(sub(P[1], P[0]), sub(P[2], P[0]));
    const len = Math.hypot(...normal);
    // Slivers (three corners in a line; the meshes have some, with float
    // noise for an area) have no direction and must not count as surface.
    if (len < 1e-3) continue;
    const isUp = normal[1] / len >= UP_MIN;
    if (isUp) upward.push({ P, normal: normal.map((v) => v / len) });
    for (let c = 0; c < 3; c++) {
      const p = P[c], q = P[(c + 1) % 3], r = P[(c + 2) % 3];
      const k = edgeKey(p, q);
      if (isUp) edgeUse.set(k, (edgeUse.get(k) ?? 0) + 1);
      // A kerb side or wall standing on this edge: its third corner is above it.
      // (openCaps: unless the triangle lies in a grid plane x or z = const.)
      else if (r[1] > Math.max(p[1], q[1]) + 0.3) {
        const inPlane = [0, 2].some((a) => Math.abs(p[a] - q[a]) < EPS && Math.abs(p[a] - r[a]) < EPS && onGridPlane(p[a]));
        if (!(openCaps && inPlane)) risers.add(k);
      }
    }
  }

  // Pass 2: boundary edges on a grid plane, with nothing standing on them.
  const segments = [];
  for (const { P, normal } of upward) {
    for (let c = 0; c < 3; c++) {
      const p = P[c], q = P[(c + 1) % 3], r = P[(c + 2) % 3];
      const k = edgeKey(p, q);
      if (edgeUse.get(k) !== 1 || risers.has(k)) continue;
      for (const axis of [0, 2]) {
        if (Math.abs(p[axis] - q[axis]) > EPS || !onGridPlane(p[axis])) continue;
        if (Math.abs(r[axis] - p[axis]) < EPS) continue; // triangle lies in the plane itself
        // The triangle's third corner is inside the part, so "out" is the other way.
        const out = r[axis] > p[axis] ? -1 : 1;
        // Height change per unit outwards on a plane with unit normal N:
        // dy/d(axis) = -N[axis] / N[1].
        const pitch = (-normal[axis] / normal[1]) * out;
        segments.push({ axis, plane: Math.round(p[axis] / PART_SIZE) * PART_SIZE, out, a: p, b: q, pitch });
      }
    }
  }

  // Pass 3: join segments that continue one another (same plane, same side,
  // sharing an end point) into ports. Road edges come in several pieces
  // because the white edge lines are separate triangles.
  const ports = [];
  const groups = new Map();
  for (const s of segments) {
    const g = `${s.axis},${s.plane},${s.out}`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(s);
  }
  for (const list of groups.values()) {
    const along = list[0].axis === 0 ? 2 : 0; // the coordinate that runs along the opening
    for (const s of list) if (s.a[along] > s.b[along]) [s.a, s.b] = [s.b, s.a];
    list.sort((u, v) => u.a[along] - v.a[along]);
    let run = null;
    const flush = () => { if (run && Math.hypot(...sub(run.b, run.a)) >= MIN_WIDTH) ports.push(run); };
    for (const s of list) {
      if (run && Math.hypot(...sub(s.a, run.b)) < EPS * 5) { run.b = s.b; run.pitches.push(s.pitch); continue; }
      flush();
      run = { axis: s.axis, plane: s.plane, out: s.out, a: s.a, b: s.b, pitches: [s.pitch] };
    }
    flush();
  }
  return ports.map(({ pitches, ...p }) => ({
    ...p,
    center: [0, 1, 2].map((k) => (p.a[k] + p.b[k]) / 2),
    width: Math.hypot(...sub(p.b, p.a)),
    pitch: pitches.reduce((x, y) => x + y, 0) / pitches.length,
  }));
}

let tableCache = null;
/**
 * The piece table: Map of part type id ->
 *   { id, name, category, ports, tiles, detector, startOffset, vertices }
 *
 *   name, category  the game's own names ("Straight", "Road"), read from
 *                   polyrl's part_configs.json
 *   ports           derivePorts() of the part's collision triangles
 *   tiles           the grid cells the part occupies, as the game's editor
 *                   lists them: [[minX, minY, minZ], [maxX, maxY, maxZ]] boxes
 *                   in cells relative to the part's position (part_configs.json)
 *   detector        null, or the checkpoint / finish box (data/init_0.6.3.json)
 *   startOffset     null, or where the car spawns on a start part
 */
export function loadPieceTable() {
  if (tableCache) return tableCache;
  const names = new Map();
  const configs = JSON.parse(readFileSync(new URL('../../vendor/polyrl/node/vendor/part_configs.json', import.meta.url), 'utf8'));
  for (const p of configs.parts) names.set(p.typeId, p);
  tableCache = new Map();
  for (const p of loadCaptured('init_0.6.3.json').trackParts) {
    const cfg = names.get(p.id);
    tableCache.set(p.id, {
      id: p.id, name: cfg?.type ?? `type${p.id}`, category: cfg?.category ?? '?',
      ports: derivePorts(p.vertices), tiles: cfg?.tiles ?? [],
      detector: p.detector, startOffset: p.startOffset, vertices: p.vertices,
    });
  }
  return tableCache;
}

/** The banked road pieces: StraightTilted, the four tilted turns, the long
 *  S-bends' neighbours ToTiltedLeft / ToTiltedRight. */
export const TILTED_IDS = [159, 160, 161, 162, 163, 166, 167];

let featureCache = null;
/**
 * The piece table with the banked pieces' ports derived with openCaps (see
 * derivePorts). Every other part type is the same object as in
 * loadPieceTable(), so code that uses this table sees the same ports for
 * them; loadPieceTable() itself is unchanged (check_pieces.mjs and the tests
 * were measured with it).
 */
export function loadFeatureTable() {
  if (featureCache) return featureCache;
  featureCache = new Map(loadPieceTable());
  for (const id of TILTED_IDS) {
    const base = featureCache.get(id);
    featureCache.set(id, { ...base, ports: derivePorts(base.vertices, { openCaps: true }) });
  }
  return featureCache;
}

/**
 * A port of a PLACED part, in world units. `part` is { typeId, x, y, z,
 * rotation, rotationAxis } as sim/track.mjs parses it. Returns the same
 * fields as derivePorts but turned and moved, with `axis` 0 / 1 / 2 and
 * `out` recomputed for the world axes (a part stood on its side can have a
 * port on a horizontal plane; those never mate with anything here).
 */
export function worldPorts(part, table = loadPieceTable()) {
  const q = ROTATIONS[part.rotationAxis][part.rotation];
  const origin = [part.x * PART_SIZE, part.y * PART_SIZE, part.z * PART_SIZE];
  const place = (v) => rotate(v, q).map((c, k) => c + origin[k]);
  return table.get(part.typeId).ports.map((p) => {
    const normal = [0, 0, 0];
    normal[p.axis] = p.out;
    const n = rotate(normal, q);
    const axis = [0, 1, 2].reduce((best, k) => (Math.abs(n[k]) > Math.abs(n[best]) ? k : best), 0);
    const center = place(p.center);
    return { axis, out: Math.sign(n[axis]), plane: Math.round(center[axis]), a: place(p.a), b: place(p.b), center, width: p.width, pitch: p.pitch };
  });
}

/** Grid cells a placed part occupies: [[x, y, z], ...] in world cells. */
export function worldTiles(part, table = loadPieceTable()) {
  const q = ROTATIONS[part.rotationAxis][part.rotation];
  const cells = [];
  for (const [lo, hi] of table.get(part.typeId).tiles) {
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
      // A cell is the cube from its index to index + 1, so turn its CENTRE
      // and floor: turning the corner index would land in the neighbouring cell.
      const c = rotate([x + 0.5, y + 0.5, z + 0.5], q);
      cells.push([Math.floor(c[0] + 1e-6) + part.x, Math.floor(c[1] + 1e-6) + part.y, Math.floor(c[2] + 1e-6) + part.z]);
    }
  }
  return cells;
}
