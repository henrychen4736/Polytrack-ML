// Random track generator.
//
//   node ideas/g2-2-track-generator/generate.mjs --count 20 --seed 1 --length 800 --difficulty mixed
//
//   import { generateTrack, saveTrack, loadGenerated } from './generate.mjs';
//   const track = generateTrack({ seed: 7, length: 800, difficulty: 0.5 });
//   track.createCar          // { trackData, mountainVertices, mountainOffset }: what
//                            // Env.reset, SimSession.create and loadTrackInfo take
//   track.route.points       // the road's centre line, one point per unit
//
// How a track is made. A track is a CHAIN of road pieces: start, then pieces
// chosen at random, a checkpoint every so often, then the finish. Each piece
// has two "ports" (its two ends; pieces.mjs works them out from the collision
// triangles). The next piece is turned and moved so that its entry port lands
// exactly on the previous piece's exit port, and it is accepted only if the
// grid cells it covers are free. When no piece fits, the generator steps back
// and tries another (depth-first search), so a track never boxes itself in.
//
// What is in: flat straights, 90 degree turns of five radii (10, 30, 50, 70
// and 90 units), S-bends, and slopes (short and long ramps, and the steep
// middle piece). What is NOT in: jumps, wide roads, intersections, blocks and
// planes, banked turns, wall rides, loops. See README.md.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { rotate, ROTATIONS, PART_SIZE } from '../../sim/track.mjs';
import { loadTrackInfo } from '../shared/track_info.mjs';
import { createRng } from '../shared/rng.mjs';
import { loadPieceTable, worldTiles } from './pieces.mjs';
import { encodeSaveString, encodeExportString } from './codec.mjs';

// Part type ids used (names from the game's part list; see check_pieces.mjs --table).
const START = 5, FINISH = 6, CHECKPOINT = 52;
/** Road pieces the generator may lay: Straight, TurnSharp, SlopeUp, SlopeDown,
 *  Slope, TurnShort, TurnLong, SlopeUpLong, SlopeDownLong, TurnSLeft,
 *  TurnSRight, TurnLong2, TurnLong3. All have exactly two ports of the
 *  standard road width, which buildTraversals() checks. */
const CHAIN_IDS = [0, 1, 2, 3, 4, 36, 37, 38, 39, 41, 42, 82, 83];
/** Width of a standard road opening, kerb to kerb, in units (measured by
 *  pieces.mjs on every piece above: 11.13). */
const ROAD_WIDTH = 11.13;
/** Two slopes (rise per unit of travel) count as equal within this. The ramp
 *  pieces end at 0.488, 0.494 or 0.500 and are meant to join each other; a
 *  flat end is 0.000 to 0.012. */
const SLOPE_TOL = 0.03;
/** Two roads may share a grid column only if their cells are at least this
 *  many levels apart. A level is 5 units, so 2 leaves 9.8 units between the
 *  lower road's surface and the underside of the upper one; the checkpoint
 *  detector, which is sized for a car in the air, is 3.8 tall. */
const MIN_LEVELS_APART = 2;
/** How far above its starting level a generated road may climb (cells).
 *  4 = 20 units. */
const MAX_CLIMB = 4;
/** Distance between route points, units. Same as sim/line.mjs SPACING, so the
 *  route can be handed to sim/controller.mjs as a line. */
export const ROUTE_SPACING = 1;


const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
/** The direction to the left of a horizontal travel direction (y is up; the
 *  car's frame has x = left, z = forward, so left = up x forward). */
const leftOf = (f) => [f[2], 0, -f[0]];
/** Unit vector pointing out of a port. */
const outward = (port) => { const v = [0, 0, 0]; v[port.axis] = port.out; return v; };

let traversalCache = null;
/**
 * Every way of driving through every chain piece. A piece can be entered by
 * either port: a turn piece entered the other way round is the same turn in
 * the other direction, and a ramp entered from its top is a descent.
 *
 * Each traversal: { id, name, inPort, outPort, forward, left, rise, turn,
 * slopeIn, slopeOut, kind, radius, length } with distances in units, measured
 * in the frame of a car arriving at the entry port:
 *   forward, left, rise   where the exit port is from the entry port
 *   turn                  +1 the exit heads left, -1 right, 0 straight on
 *   slopeIn, slopeOut     rise per unit of travel at the two ends
 */
function loadTraversals() {
  if (traversalCache) return traversalCache;
  const table = loadPieceTable();
  const list = [];
  for (const id of [...CHAIN_IDS, START, FINISH, CHECKPOINT]) {
    const piece = table.get(id);
    const ports = piece.ports;
    if (ports.length !== 2 || ports.some((p) => Math.abs(p.width - ROAD_WIDTH) > 0.1)) {
      throw new Error(`part ${id} ${piece.name}: expected two standard road ports, found ${ports.map((p) => p.width.toFixed(2))}`);
    }
    const seen = new Set();
    // A start part is only ever driven the way the car faces on it: towards
    // local -z (sim/track.mjs buildPath), so in through its +z port.
    const orders = id === START ? [ports[0].out > 0 ? [0, 1] : [1, 0]] : [[0, 1], [1, 0]];
    for (const [i, o] of orders) {
      const inPort = ports[i], outPort = ports[o];
      const f = scale(outward(inPort), -1); // travel direction at the entry
      const delta = sub(outPort.center, inPort.center);
      const t = {
        id, name: piece.name, inPort, outPort,
        forward: dot(delta, f), left: dot(delta, leftOf(f)), rise: delta[1],
        turn: Math.round(dot(outward(outPort), leftOf(f))),
        slopeIn: -inPort.pitch, slopeOut: outPort.pitch,
      };
      // The same shape both ways round (a straight) is listed once.
      const shape = [t.forward, t.left, t.rise, t.turn, t.slopeIn, t.slopeOut].map((v) => v.toFixed(2)).join(' ');
      if (seen.has(shape)) continue;
      seen.add(shape);
      const sloped = Math.abs(t.rise) > 0.1 || Math.abs(t.slopeIn) > SLOPE_TOL || Math.abs(t.slopeOut) > SLOPE_TOL;
      t.kind = sloped ? 'slope' : t.turn ? 'turn' : Math.abs(t.left) > 0.1 ? 's' : 'straight';
      t.radius = t.kind === 'turn' ? t.forward : Infinity;
      // Rough length of the drive through, for "is the track long enough yet".
      t.length = t.kind === 'turn' ? (Math.PI / 2) * t.radius : Math.hypot(t.forward, t.left, t.rise);
      list.push(t);
    }
  }
  return (traversalCache = list);
}

/**
 * How likely a piece is to be picked, relative to the others, at a
 * difficulty from 0 (easy) to 1 (hard). Easy tracks are mostly straights and
 * wide turns; hard tracks have few straights, tight turns and more slopes.
 * The 10-unit TurnSharp only appears from difficulty 0.6: no official track
 * uses it at all, and it needs braking to about 60 km/h.
 */
function weight(t, difficulty, slopes, state) {
  const d = difficulty;
  if (t.kind === 'straight') return 3 - 2.2 * d;
  if (t.kind === 's') return 0.3 + 0.5 * d;
  if (t.kind === 'turn') {
    if (t.radius >= 70) return 0.8 - 0.5 * d;      // 70 and 90 units
    if (t.radius >= 50) return 0.7;
    if (t.radius >= 30) return 0.2 + 1.0 * d;
    return Math.max(0, 2.5 * d - 1.5);             // TurnSharp
  }
  if (!slopes) return 0;
  // From level road: start a climb or a descent. On a ramp already: the
  // steep middle piece makes it longer, an end piece brings it back level.
  if (Math.abs(state.slope) < SLOPE_TOL) return 0.25 + 0.6 * d;
  return Math.abs(t.slopeOut) < SLOPE_TOL ? 1 : 0.5 * d;
}

/**
 * Generate one track.
 *
 *   seed             any integer; the same options give the same track
 *   length           wanted centre-line length in units (about metres). The
 *                    track ends at the first level spot past it, so the real
 *                    length (track.route.length) is a little more.
 *   difficulty       0..1, see weight()
 *   slopes           false = flat pieces and turns only
 *   checkpointEvery  a checkpoint once this many units have passed since the
 *                    last gate (the official tracks have 2 to 10 gates)
 *   environment      0 Summer, 1 Winter, 2 Desert: colours only
 *   baseLevel        grid level of the start (one level = 5 units). The
 *                    simulator has flat ground at height 0, level with a
 *                    road at level 0 (measured: a car driven off the end of
 *                    a level-0 road carries on at y = 0.1 and reaches 385
 *                    km/h). With the default 2 the road is 10 units up, so a
 *                    car that leaves it falls and cannot rejoin, and "it
 *                    finished" means "it stayed on the road". The road may
 *                    descend to level 1 and climb to baseLevel + 4.
 *
 * Returns { name, seed, difficulty, wantedLength, environment, parts, pieces,
 * trackData, exportString, createCar, route } (route: see buildRoute), or
 * throws if no track was found, which has not happened for lengths up to
 * 3000 (see README.md).
 */
export function generateTrack({ seed = 1, length = 600, difficulty = 0.3, slopes = true, checkpointEvery = 200, environment = 0, baseLevel = 2 } = {}) {
  const minLevel = Math.min(baseLevel, 1), maxLevel = baseLevel + MAX_CLIMB;
  const traversals = loadTraversals();
  const table = loadPieceTable();
  const special = (id) => traversals.find((t) => t.id === id);
  const chain = traversals.filter((t) => CHAIN_IDS.includes(t.id));

  // Several attempts, each with its own random stream: a search that runs out
  // of its budget (a walk that coiled up early) is thrown away whole instead
  // of being unpicked piece by piece.
  for (let attempt = 0; attempt < 50; attempt++) {
    const rng = createRng((seed * 0x9e3779b1 + attempt * 0x85ebca6b) >>> 0);
    const placed = [];               // { part, t, entry, dir, exit, exitDir }
    const columns = new Map();       // "x,z" -> [level, ...] cells in use
    let budget = 4000;               // pieces tried before giving this attempt up

    /** Turn and move traversal t so its entry port is at `p` heading `dir`.
     *  Returns the placement, or null if it is off the grid or collides. */
    const place = (t, p, dir) => {
      const fLocal = scale(outward(t.inPort), -1);
      const rotation = [0, 1, 2, 3].find((r) => dot(rotate(fLocal, ROTATIONS[0][r]), dir) > 0.99);
      const q = ROTATIONS[0][rotation];
      const origin = sub(p, rotate(t.inPort.center, q)).map((v) => v / PART_SIZE);
      // Parts sit on whole cells. (Every chain piece's ports are on whole
      // cells, so this only fails if the table changes.)
      if (origin.some((v) => Math.abs(v - Math.round(v)) > 0.01)) return null;
      const part = { typeId: t.id, x: Math.round(origin[0]), y: Math.round(origin[1]), z: Math.round(origin[2]), rotation, rotationAxis: 0, checkpointOrder: null, startOrder: null };
      const tiles = worldTiles(part, table);
      for (const [x, y, z] of tiles) {
        if (y < minLevel || y > maxLevel) return null;
        for (const other of columns.get(`${x},${z}`) ?? []) if (Math.abs(other - y) < MIN_LEVELS_APART) return null;
      }
      const exit = add(rotate(t.outPort.center, q), scale([part.x, part.y, part.z], PART_SIZE));
      return { part, t, tiles, entry: p, dir, exit, exitDir: rotate(outward(t.outPort), q).map(Math.round) };
    };
    const commit = (pl) => {
      for (const [x, y, z] of pl.tiles) { const k = `${x},${z}`; if (!columns.has(k)) columns.set(k, []); columns.get(k).push(y); }
      placed.push(pl);
    };
    const undo = () => {
      const pl = placed.pop();
      // Cells were pushed in order, so the last ones in each column are this piece's.
      for (const [x, , z] of pl.tiles) columns.get(`${x},${z}`).pop();
    };

    /** Add pieces from `state` until the finish is down. Depth-first: returns
     *  false if nothing fits here, and the caller then tries its next option. */
    const extend = (state) => {
      const level = Math.abs(state.slope) < SLOPE_TOL;
      let options;
      if (level && state.distance >= length) options = [special(FINISH)];
      else if (level && state.sinceGate >= checkpointEvery) options = [special(CHECKPOINT)];
      else {
        // Pieces whose entry slope continues the road, in a random order
        // drawn by weight (pick one, remove it, pick again).
        const pool = chain.filter((t) => Math.abs(t.slopeIn - state.slope) < SLOPE_TOL)
          .map((t) => ({ t, w: weight(t, difficulty, slopes, state) })).filter((o) => o.w > 0);
        options = [];
        while (pool.length) {
          let pick = rng() * pool.reduce((s, o) => s + o.w, 0);
          const k = pool.findIndex((o) => (pick -= o.w) < 0);
          options.push(pool.splice(k < 0 ? pool.length - 1 : k, 1)[0].t);
        }
      }
      for (const t of options) {
        if (budget-- <= 0) return false;
        const pl = place(t, state.p, state.dir);
        if (!pl) continue;
        commit(pl);
        if (t.id === FINISH) return true;
        const gate = t.id === CHECKPOINT;
        if (extend({ p: pl.exit, dir: pl.exitDir, slope: t.slopeOut, distance: state.distance + t.length, sinceGate: gate ? 0 : state.sinceGate + t.length })) return true;
        undo();
      }
      return false;
    };

    // The start part above the origin, the car heading towards -z.
    const start = place(special(START), [0, special(START).inPort.center[1] + baseLevel * PART_SIZE, 10], [0, 0, -1]);
    commit(start);
    if (!extend({ p: start.exit, dir: start.exitDir, slope: 0, distance: start.t.length, sinceGate: 0 })) continue;

    // Number the gates in driving order and mark the start.
    let order = 0;
    for (const pl of placed) {
      if (pl.t.id === CHECKPOINT) pl.part.checkpointOrder = order++;
      if (pl.t.id === START) pl.part.startOrder = 0;
    }
    const parts = placed.map((pl) => pl.part);
    const name = `gen_s${seed}_d${Math.round(difficulty * 100)}_l${length}${slopes ? '' : '_flat'}${baseLevel === 2 ? '' : `_b${baseLevel}`}`;
    const trackData = encodeSaveString(parts, environment);
    const createCar = { trackData, mountainVertices: new Float32Array(0), mountainOffset: { x: 0, y: 0, z: 0 } };
    return {
      name, seed, difficulty, wantedLength: length, slopes, environment, baseLevel, parts,
      pieces: placed.map((pl) => pl.t.name), trackData,
      exportString: encodeExportString(parts, name, environment),
      createCar, route: buildRoute(placed, createCar),
    };
  }
  throw new Error(`no track found for seed ${seed}, length ${length}, difficulty ${difficulty}`);
}

/**
 * The centre line of a generated track: the route.
 *
 * First guess: through each piece, a smooth curve from its entry port to its
 * exit port, leaving and arriving along the travel directions (a cubic
 * Hermite curve; for a 90 degree turn it is within 0.3 units of the circular
 * arc). Then the guess is CORRECTED AGAINST THE TRACK'S OWN COLLISION MESH
 * (the mesh loadTrackInfo builds from the encoded track, not the generator's
 * bookkeeping): at every point a ray straight down finds the road's height,
 * and rays to the left and right find the kerbs; the point moves to midway
 * between them. So the route is the measured middle of the road, and the two
 * numbers that come out of the measurement are a check that the track is
 * what the generator thinks it is:
 *   onRoad    fraction of route points with road underneath (must be 1)
 *   halfWidth distance from the centre to each kerb (5.65 where the rays
 *             are square to the road: the kerb face leans back from 5.57)
 *
 * Returns
 *   spacing    units between consecutive points (1)
 *   points     [[x, y, z], ...] world units, from the car's start position to
 *              the far end of the finish piece; y is the road surface
 *   halfWidth  per point, units from the centre line to the kerb (null where
 *              a kerb was not found on both sides)
 *   piece      per point, index into track.parts / track.pieces
 *   gates      [{ index, isFinish, center }] in driving order: the route
 *              point nearest each checkpoint, then the finish
 *   start      { position, quaternion } the car's spawn pose
 *   length     units from the first point to the finish gate
 *   onRoad     see above
 */
function buildRoute(placed, createCar) {
  const info = loadTrackInfo(createCar);
  const mesh = info.mesh;

  // --- first guess: Hermite curve through each piece, a point every ~0.5 units
  const raw = [], rawPiece = [];
  placed.forEach((pl, index) => {
    const chord = Math.hypot(pl.exit[0] - pl.entry[0], pl.exit[2] - pl.entry[2]);
    // Tangent length: 1.17 x chord makes the curve of a quarter turn nearly
    // circular (the exact figure for a circle is 1.172); a straight wants 1.
    const m = chord * (pl.t.turn ? 1.17 : 1);
    const steps = Math.max(2, Math.ceil(pl.t.length / 0.5));
    for (let s = index === 0 ? 0 : 1; s <= steps; s++) {
      const u = s / steps, u2 = u * u, u3 = u2 * u;
      const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
      const point = [0, 1, 2].map((k) => h00 * pl.entry[k] + h10 * m * pl.dir[k] + h01 * pl.exit[k] + h11 * m * pl.exitDir[k]);
      point[1] = pl.entry[1] + u * (pl.exit[1] - pl.entry[1]); // height: straight line for now
      raw.push(point); rawPiece.push(index);
    }
  });

  // --- correct against the mesh (twice: the second pass uses better tangents)
  const guessY = raw.map((p) => p[1]);
  const half = new Array(raw.length).fill(null);
  let missing = 0;
  for (let pass = 0; pass < 2; pass++) {
    missing = 0;
    for (let k = 0; k < raw.length; k++) {
      const p = raw[k], a = raw[Math.max(0, k - 1)], b = raw[Math.min(raw.length - 1, k + 1)];
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
      const left = leftOf([(b[0] - a[0]) / len, 0, (b[2] - a[2]) / len]);
      // Road height: look down from 2.5 above the straight-line guess. A
      // ramp's surface is curved, so the guess can be 1.3 off; but the bar
      // across a checkpoint or finish gate hangs 4 above the road (a ray
      // started higher landed on top of it, at 4.9), so stay under that.
      // Exactly on the seam between two parts a ray can slip between their
      // triangles (seen on 3 of 4000 points), so a miss is retried 0.05 to
      // either side along the road before it counts as "no road here".
      let drop = Infinity;
      for (const nudge of [0, 0.05, -0.05]) {
        drop = mesh.raycast([p[0] - left[2] * nudge, guessY[k] + 2.5, p[2] + left[0] * nudge], [0, -1, 0], 6);
        if (drop !== Infinity) break;
      }
      if (drop === Infinity) { missing++; continue; }
      p[1] = guessY[k] + 2.5 - drop;
      // Kerbs: sideways rays 0.45 above the road. A kerb is 0.73 tall (road
      // at 0.21, kerb top at 0.94), so this passes over the road and hits it.
      const from = [p[0], p[1] + 0.45, p[2]];
      const toLeft = mesh.raycast(from, left, 12), toRight = mesh.raycast(from, scale(left, -1), 12);
      half[k] = null;
      if (toLeft === Infinity || toRight === Infinity) continue;
      // Kerb to kerb is 11.13 across the road; a ray that is not square to
      // the road reads a little more. Anything far from that is not the two
      // kerbs of this road (a gate post, a gap), so leave the point alone.
      // The allowance above 11.13 is 0.3, not the 1.5 it was. Measured over
      // 7067 route points of six tracks: every true kerb-to-kerb reading is
      // 11.3, and the only others were 11.7 to 12.6, all at the ends of a
      // TurnSharp (radius 10), which has no kerb on its inside: there the
      // inward ray runs on to the NEXT piece's kerb, and "centring" on that
      // pulled points up to 0.7 units inwards, next to points left alone.
      // That put kinks of up to 99 degrees between consecutive route steps
      // and steps of 0.52 units in a route documented as 1 unit apart.
      // (Found by tests/test_3_generator.mjs.)
      const width = toLeft + toRight;
      if (width < ROAD_WIDTH - 0.3 || width > ROAD_WIDTH + 0.3) continue;
      const shift = (toLeft - toRight) / 2;
      p[0] += left[0] * shift; p[2] += left[2] * shift;
      half[k] = width / 2;
    }
  }

  // --- one point per unit of travel, starting where the car spawns
  const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  let first = 0;
  for (let k = 0; k < Math.min(raw.length, 100); k++) if (d3(raw[k], info.path.start.position) < d3(raw[first], info.path.start.position)) first = k;
  const points = [raw[first]], halfWidth = [half[first]], piece = [rawPiece[first]];
  // Walk along the raw points and drop a route point each time a whole unit
  // has been covered, placed by interpolation so the spacing is exact.
  let carried = 0; // distance covered since the last route point
  for (let k = first + 1; k < raw.length; k++) {
    const a = raw[k - 1], b = raw[k], seg = d3(a, b);
    let pos = -carried;
    while (pos + ROUTE_SPACING <= seg + 1e-9) {
      pos += ROUTE_SPACING;
      const u = seg ? pos / seg : 0;
      points.push([0, 1, 2].map((c) => a[c] + u * (b[c] - a[c])));
      halfWidth.push(half[k]); piece.push(rawPiece[k]);
    }
    carried = seg - pos;
  }

  // --- where the gates are along it (searching forward only, like sim/line.mjs)
  let from = 0;
  const gates = info.path.gates.map((g) => {
    let best = from;
    for (let k = from; k < points.length; k++) if (d3(points[k], g.center) < d3(points[best], g.center)) best = k;
    from = best;
    return { index: best, isFinish: g.isFinish, center: g.center };
  });
  const round = (v) => Math.round(v * 1000) / 1000;
  return {
    spacing: ROUTE_SPACING, points: points.map((p) => p.map(round)), halfWidth: halfWidth.map((h) => (h == null ? null : round(h))),
    piece, gates, start: info.path.start, length: gates.at(-1).index * ROUTE_SPACING, onRoad: 1 - missing / raw.length,
  };
}

/**
 * Write a track to `dir` as two files (formats documented in README.md):
 *   <name>.track.json   what the simulator needs, plus how it was made
 *   <name>.route.json   the centre line
 * Returns the two paths.
 */
export function saveTrack(track, dir) {
  mkdirSync(dir, { recursive: true });
  const trackFile = `${dir}/${track.name}.track.json`, routeFile = `${dir}/${track.name}.route.json`;
  writeFileSync(trackFile, JSON.stringify({
    format: 'g2-2-track-1', name: track.name, seed: track.seed, difficulty: track.difficulty, wantedLength: track.wantedLength,
    slopes: track.slopes, environment: track.environment, baseLevel: track.baseLevel, length: track.route.length, checkpoints: track.route.gates.length - 1,
    trackData: track.trackData, exportString: track.exportString, parts: track.parts, pieces: track.pieces,
  }));
  writeFileSync(routeFile, JSON.stringify({ format: 'g2-2-route-1', name: track.name, ...track.route }));
  return { trackFile, routeFile };
}

/**
 * Load a saved track: the path of a .track.json (the .route.json is taken
 * from beside it). Returns { name, meta, createCar, route }; createCar goes
 * to Env.reset / SimSession.create / loadTrackInfo exactly like
 * sim/env.mjs loadTrack(name)'s result.
 */
export function loadGenerated(trackFile) {
  const meta = JSON.parse(readFileSync(trackFile, 'utf8'));
  const route = JSON.parse(readFileSync(trackFile.replace(/\.track\.json$/, '.route.json'), 'utf8'));
  // No mountains: the backdrop terrain is not part of a generated track, the
  // same choice sim/env.mjs loadTrack makes for tracks without a capture.
  return { name: meta.name, meta, route, createCar: { trackData: meta.trackData, mountainVertices: new Float32Array(0), mountainOffset: { x: 0, y: 0, z: 0 } } };
}

// --- command line -----------------------------------------------------------
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (name, fallback) => { const k = process.argv.indexOf(`--${name}`); return k < 0 ? fallback : process.argv[k + 1]; };
  const count = +arg('count', 5), seed = +arg('seed', 1), length = +arg('length', 600);
  const difficulty = arg('difficulty', 'mixed'), out = arg('out', 'ideas/g2-2-track-generator/tracks');
  const slopes = !process.argv.includes('--flat');
  for (let k = 0; k < count; k++) {
    // 'mixed': spread the tracks evenly from easy (0) to hard (1).
    const d = difficulty === 'mixed' ? (count > 1 ? k / (count - 1) : 0.5) : +difficulty;
    const track = generateTrack({ seed: seed + k, length, difficulty: Math.round(d * 100) / 100, slopes, environment: (seed + k) % 3 });
    const { trackFile } = saveTrack(track, out);
    console.log(`${trackFile}  ${track.parts.length} pieces, ${track.route.length} units, ${track.route.gates.length - 1} checkpoints, on road ${(track.route.onRoad * 100).toFixed(1)}%`);
  }
}
