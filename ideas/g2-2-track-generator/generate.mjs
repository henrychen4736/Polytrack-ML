// Random track generator.
//
//   node ideas/g2-2-track-generator/generate.mjs --count 20 --seed 1 --length 800 --difficulty mixed
//   node ideas/g2-2-track-generator/generate.mjs --count 5 --seed 1 --jumps 1 --banked 1     # harder pieces, see FEATURES
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
// What is in by default: flat straights, 90 degree turns of five radii (10,
// 30, 50, 70 and 90 units), S-bends, and slopes (short and long ramps, and
// the steep middle piece).
//
// FEATURES (opt-in, `features` option; pieces and measurements in
// g2-2-features.mjs). With none of them the generator makes exactly the
// tracks it made before (same seed, same track string; tests/test_3 checks
// the 20 sample tracks).
//   wide        the whole track on the 31-unit road (wide start, straights,
//               turns of radius 40 and 60, ramps, wide checkpoints and finish)
//   wideSections  weight of 51-unit straight sections on the standard road
//   banked      weight of banked turns: lean in over 60 units, one or more
//               tilted turns (radius 30 to 90), lean out
//   jumps       weight of gaps in the road: off a flat edge onto road 1 or 2
//               levels lower, or off a ramp ("kicker"), with straights to
//               land on; each has a window of take-off speeds
// Measured on 30 tracks of 800 units (difficulty 0 to 1) per setting: jumps
// 1 / 3 gave 9 / 25 jumps (7 / 11 of them kickers); banked 1 / 2 gave 49 /
// 93 banked turns; wideSections 1 / 3 gave 22 / 53 sections. Loops and wall
// rides are not in (see g2-2-features.mjs and README.md).
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { rotate, ROTATIONS, PART_SIZE } from '../../sim/track.mjs';
import { loadTrackInfo } from '../shared/track_info.mjs';
import { createRng } from '../shared/rng.mjs';
import { loadPieceTable, loadFeatureTable, worldTiles } from './pieces.mjs';
import { encodeSaveString, encodeExportString } from './codec.mjs';
import { featurePieces, jumpGaps, GRAVITY, NARROW, WIDE, WIDE3, START_WIDE, CHECKPOINT_WIDE, FINISH_WIDE } from './g2-2-features.mjs';

// Part type ids used (names from the game's part list; see check_pieces.mjs --table).
const START = 5, FINISH = 6, CHECKPOINT = 52, STRAIGHT = 0;
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
/** Two leans (height difference across the road per unit of width) count as
 *  equal within this. A banked end leans 4.87 over 11.0 = 0.44; flat is 0. */
const BANK_TOL = 0.05;
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
/** Jumps: straight road (units) before a take-off. The follower reached 134
 *  km/h within 40 units from a standstill (measured), the fastest gap needs
 *  140 at most; 60 leaves room for a slow corner before it. */
const RUN_UP = 60;
/** Widest 51-unit section, in StraightWide3 pieces (20 units each). */
const WIDE3_MAX = 4;

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
/** The direction to the left of a horizontal travel direction (y is up; the
 *  car's frame has x = left, z = forward, so left = up x forward). */
const leftOf = (f) => [f[2], 0, -f[0]];
/** Unit vector pointing out of a port. */
const outward = (port) => { const v = [0, 0, 0]; v[port.axis] = port.out; return v; };
/** Lean of a port for a car travelling `f` through it: (height of the left
 *  corner - height of the right corner) / width. 0 on every flat road. */
const leanOf = (port, f) => {
  const left = leftOf(f);
  const [l, r] = dot(port.a, left) > dot(port.b, left) ? [port.a, port.b] : [port.b, port.a];
  return (l[1] - r[1]) / port.width;
};

/**
 * One traversal from a piece's two ports: { id, name, inPort, outPort,
 * forward, left, rise, turn, slopeIn, slopeOut, kind, radius, length } plus,
 * for the generalised pieces, parts (the parts it is made of, offsets in
 * cells), width / widthOut, bankIn / bankOut and feature. Distances in
 * units, in the frame of a car arriving at the entry port:
 *   forward, left, rise   where the exit port is from the entry port
 *   turn                  +1 the exit heads left, -1 right, 0 straight on
 *   slopeIn, slopeOut     rise per unit of travel at the two ends
 */
function makeTraversal(piece, inPort, outPort) {
  const f = scale(outward(inPort), -1); // travel direction at the entry
  const delta = sub(outPort.center, inPort.center);
  const t = {
    id: piece.id, name: piece.name, inPort, outPort,
    forward: dot(delta, f), left: dot(delta, leftOf(f)), rise: delta[1],
    turn: Math.round(dot(outward(outPort), leftOf(f))),
    slopeIn: -inPort.pitch, slopeOut: outPort.pitch,
  };
  const sloped = Math.abs(t.rise) > 0.1 || Math.abs(t.slopeIn) > SLOPE_TOL || Math.abs(t.slopeOut) > SLOPE_TOL;
  t.kind = sloped ? 'slope' : t.turn ? 'turn' : Math.abs(t.left) > 0.1 ? 's' : 'straight';
  t.radius = t.kind === 'turn' ? t.forward : Infinity;
  // Rough length of the drive through, for "is the track long enough yet".
  t.length = t.kind === 'turn' ? (Math.PI / 2) * t.radius : Math.hypot(t.forward, t.left, t.rise);
  t.parts = piece.parts ?? [{ typeId: piece.id, offset: [0, 0, 0], rotation: 0 }];
  t.width = inPort.width; t.widthOut = outPort.width;
  t.bankIn = leanOf(inPort, f); t.bankOut = leanOf(outPort, outward(outPort));
  t.feature = piece.feature ?? null;
  return t;
}

let traversalCache = null;
/**
 * Every way of driving through every chain piece. A piece can be entered by
 * either port: a turn piece entered the other way round is the same turn in
 * the other direction, and a ramp entered from its top is a descent.
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
      const t = makeTraversal(piece, ports[i], ports[o]);
      // The same shape both ways round (a straight) is listed once.
      const shape = [t.forward, t.left, t.rise, t.turn, t.slopeIn, t.slopeOut].map((v) => v.toFixed(2)).join(' ');
      if (seen.has(shape)) continue;
      seen.add(shape);
      list.push(t);
    }
  }
  return (traversalCache = list);
}

let featureTraversalCache = null;
/**
 * Traversals of the FEATURES pieces (g2-2-features.mjs), each tagged with its
 * feature: 'wide', 'wide3', 'banked' or 'jump'. Kept apart from
 * loadTraversals() so the default chain is the list it always was.
 */
function loadFeatureTraversals() {
  if (featureTraversalCache) return featureTraversalCache;
  const list = [];
  for (const piece of featurePieces()) {
    const [p0, p1] = piece.ports;
    const orders = piece.id === START_WIDE ? [p0.out > 0 ? [p0, p1] : [p1, p0]] : [[p0, p1], [p1, p0]];
    const seen = new Set();
    for (const [i, o] of orders) {
      const t = makeTraversal(piece, i, o);
      const shape = [t.forward, t.left, t.rise, t.turn, t.slopeIn, t.slopeOut, t.bankIn, t.bankOut, t.width, t.widthOut].map((v) => v.toFixed(2)).join(' ');
      if (seen.has(shape)) continue;
      seen.add(shape);
      list.push(t);
    }
  }
  // Gaps: no parts at all, just a displacement from the edge of the road in
  // front to the road after it. The ports are a Straight's, so a gap fits on
  // the standard road; a kicker gap starts at the ramp's slope.
  const straight = loadPieceTable().get(STRAIGHT);
  const back = straight.ports.find((p) => p.out > 0), front = straight.ports.find((p) => p.out < 0);
  for (const g of jumpGaps()) {
    const move = (p, dz, dy) => ({ ...p, a: add(p.a, [0, dy, dz]), b: add(p.b, [0, dy, dz]), center: add(p.center, [0, dy, dz]) });
    // The gap's entry is the straight's +z end; its exit is that end moved
    // gap cells on (towards -z) and `drop` levels down, facing on.
    const inPort = { ...back, pitch: g.kicker ? -0.49 : 0 };
    const outPort = { ...move(front, 20 - g.gap * PART_SIZE, -g.drop * PART_SIZE), pitch: 0 };
    const t = makeTraversal({ id: -100, name: `Gap${g.gap}${g.kicker ? 'Kicker' : 'Drop'}${g.drop}`, parts: [], feature: 'jump' }, inPort, outPort);
    t.kind = 'gap';
    t.gap = g;
    // Air the flight needs, in the gap's own cells (the 4 cells across the
    // road, from its entry edge on): over the gap itself from the landing
    // level up to 1 level above the edge (3 for a kicker, whose car climbs
    // 1.5 levels at its target speed), and for a kicker on over the 6
    // straights of the landing, above the landing road, where it is still
    // in the air for 20 to 100 units (measured). Nothing else may be built
    // there (see place()).
    t.air = [];
    const top = g.kicker ? 3 : 1, over = g.kicker ? g.landing * 4 : 0;
    for (let z = 1; z >= 2 - g.gap - over; z--) {
      const bottom = z > 1 - g.gap ? -g.drop : -g.drop + 1;
      for (let x = -2; x <= 1; x++) for (let y = bottom; y <= top; y++) t.air.push([x, y, z]);
    }
    list.push(t);
  }
  return (featureTraversalCache = list);
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
 * Weight of a FEATURES traversal in the state the road is in (0 = not now).
 * The plain weight() above still decides among ordinary pieces of the same
 * shape on a wide track (straights, turns, ramps).
 */
function featureWeight(t, difficulty, slopes, state, features) {
  if (t.feature === 'wide') return features.wide ? weight(t, difficulty, slopes, state) : 0;
  if (t.feature === 'wide3') {
    const w = features.wideSections ?? 0;
    if (!w) return 0;
    if (t.width < 20 && t.widthOut > 40) return 0.6 * w;                     // narrow -> 51: start a section (0.3 gave 10 in 30 tracks)
    if (t.width > 40 && t.widthOut > 40) return state.wide3 < WIDE3_MAX ? 1 : 0; // carry on
    return state.wide3 >= 1 ? 2 : 0;                                         // 51 -> narrow: at least one straight first
  }
  if (t.feature === 'banked') {
    const w = features.banked ?? 0;
    if (!w) return 0;
    const flatIn = Math.abs(t.bankIn) < BANK_TOL, flatOut = Math.abs(t.bankOut) < BANK_TOL;
    if (flatIn) return 0.5 * w;                                    // lean in
    if (flatOut) return state.bankTurns > 0 ? 2 : 0;               // lean out, after at least one turn
    if (t.kind === 'turn') return state.bankTurns >= 2 ? 0.2 : 1;  // a banked turn
    return 0.3;                                                    // StraightTilted
  }
  if (t.feature === 'jump') {
    const w = features.jumps ?? 0;
    // Only after RUN_UP units of straight road (the kicker ramp counts).
    // 4 * w shared over all the gap shapes: at w = 1, once the run-up is
    // there, a jump is about twice as likely as another straight (at 1.5 *
    // w, 4 tracks of 800 units at w = 2 had 1 jump between them).
    return w && state.runUp >= RUN_UP ? (4 * w) / jumpGaps().length : 0;
  }
  return 0;
}

/** With jumps on: until there are RUN_UP units of straight road, straights
 *  are 1 + 2 * jumps times as likely, so that run-ups happen. Without this,
 *  three straights in a row were too rare for a jump to be laid at all (0
 *  jumps on 4 tracks of 800 units at jumps 2). 1 on every track without jumps. */
let runUpFactor = 1;
const runUpBoost = (t, state) => (runUpFactor > 1 && t.kind === 'straight' && state.runUp < RUN_UP ? runUpFactor : 1);

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
 *   features         FEATURES at the top: { wide, wideSections, banked,
 *                    jumps }. {} (the default) = none.
 *
 * Returns { name, seed, difficulty, wantedLength, environment, parts, pieces,
 * trackData, exportString, createCar, route } (route: see buildRoute), or
 * throws if no track was found, which has not happened for lengths up to
 * 3000 (see README.md). With features it also has `features` and `counts`
 * (how many of each feature were laid).
 */
export function generateTrack({ seed = 1, length = 600, difficulty = 0.3, slopes = true, checkpointEvery = 200, environment = 0, baseLevel = 2, features = {} } = {}) {
  const anyFeature = Object.values(features).some(Boolean);
  runUpFactor = features.jumps ? 1 + 2 * features.jumps : 1;
  const minLevel = Math.min(baseLevel, 1), maxLevel = baseLevel + MAX_CLIMB;
  const traversals = loadTraversals();
  const table = anyFeature ? loadFeatureTable() : loadPieceTable();
  const extra = anyFeature ? loadFeatureTraversals() : [];
  const findId = (id) => traversals.find((t) => t.id === id) ?? extra.find((t) => t.id === id);
  const startT = findId(features.wide ? START_WIDE : START);
  const finishFor = (width) => (width < 20 ? findId(FINISH) : width < 40 ? extra.find((t) => t.id === FINISH_WIDE) : null);
  const gateFor = (width) => (width < 20 ? findId(CHECKPOINT) : width < 40 ? extra.find((t) => t.id === CHECKPOINT_WIDE) : null);
  // On a wide track only the wide pieces; otherwise the standard ones plus
  // any switched-on feature pieces (wide-track pieces never mix with others:
  // there is no piece between the two widths).
  const plain = traversals.filter((t) => CHAIN_IDS.includes(t.id));
  const chain = features.wide ? extra.filter((t) => t.feature === 'wide' && ![START_WIDE, CHECKPOINT_WIDE, FINISH_WIDE].includes(t.id))
    : [...plain, ...extra.filter((t) => t.feature && t.feature !== 'wide')];

  // Several attempts, each with its own random stream: a search that runs out
  // of its budget (a walk that coiled up early) is thrown away whole instead
  // of being unpicked piece by piece.
  for (let attempt = 0; attempt < 50; attempt++) {
    const rng = createRng((seed * 0x9e3779b1 + attempt * 0x85ebca6b) >>> 0);
    const placed = [];               // { parts, t, entry, dir, exit, exitDir, exitEnds }
    const columns = new Map();       // "x,z" -> [level, ...] road cells in use
    const airColumns = new Map();    // "x,z" -> [level, ...] cells a jump's flight needs
    let budget = 4000;               // pieces tried before giving this attempt up

    /** Turn and move traversal t so its entry port is at `p` heading `dir`.
     *  Returns the placement, or null if it is off the grid or collides.
     *  `ends` (FEATURES only): the previous exit's two corner points; the
     *  entry's corners must land on them, which is what makes widths and
     *  leans match (for the default pieces, matching centres and directions
     *  already implies it). */
    const place = (t, p, dir, ends = null) => {
      const fLocal = scale(outward(t.inPort), -1);
      const rotation = [0, 1, 2, 3].find((r) => dot(rotate(fLocal, ROTATIONS[0][r]), dir) > 0.99);
      const q = ROTATIONS[0][rotation];
      const origin = sub(p, rotate(t.inPort.center, q)).map((v) => v / PART_SIZE);
      // Parts sit on whole cells. (Every chain piece's ports are on whole
      // cells, so this only fails if the table changes.)
      if (origin.some((v) => Math.abs(v - Math.round(v)) > 0.01)) return null;
      const o = origin.map(Math.round);
      const toWorld = (v) => add(rotate(v, q), scale(o, PART_SIZE));
      if (ends) {
        const a = toWorld(t.inPort.a), b = toWorld(t.inPort.b);
        const same = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]) < 0.05;
        if (!((same(a, ends[0]) && same(b, ends[1])) || (same(a, ends[1]) && same(b, ends[0])))) return null;
      }
      // Each part of the piece, its offset turned with the piece.
      const parts = t.parts.map((sp) => {
        const off = rotate(sp.offset, q).map(Math.round);
        return { typeId: sp.typeId, x: o[0] + off[0], y: o[1] + off[1], z: o[2] + off[2], rotation: (rotation + sp.rotation) % 4, rotationAxis: 0, checkpointOrder: null, startOrder: null };
      });
      const tiles = parts.flatMap((part) => worldTiles(part, table));
      const air = (t.air ?? []).map((c) => { const w = rotate([c[0] + 0.5, c[1] + 0.5, c[2] + 0.5], q); return [Math.floor(w[0] + 1e-6) + o[0], Math.floor(w[1] + 1e-6) + o[1], Math.floor(w[2] + 1e-6) + o[2]]; });
      for (const [x, y, z] of tiles) {
        if (y < minLevel || y > maxLevel) return null;
        for (const other of columns.get(`${x},${z}`) ?? []) if (Math.abs(other - y) < MIN_LEVELS_APART) return null;
        // A road may not stand in the air a jump needs (the landing road
        // itself is below that air, so it does not conflict).
        if ((airColumns.get(`${x},${z}`) ?? []).includes(y)) return null;
      }
      for (const [x, y, z] of air) {
        if ((columns.get(`${x},${z}`) ?? []).includes(y) || (airColumns.get(`${x},${z}`) ?? []).includes(y)) return null;
      }
      const exit = add(rotate(t.outPort.center, q), scale(o, PART_SIZE));
      return { part: parts[0], parts, t, tiles, air, entry: p, dir, exit, exitDir: rotate(outward(t.outPort), q).map(Math.round), exitEnds: [toWorld(t.outPort.a), toWorld(t.outPort.b)] };
    };
    const commit = (pl) => {
      for (const [x, y, z] of pl.tiles) { const k = `${x},${z}`; if (!columns.has(k)) columns.set(k, []); columns.get(k).push(y); }
      for (const [x, y, z] of pl.air) { const k = `${x},${z}`; if (!airColumns.has(k)) airColumns.set(k, []); airColumns.get(k).push(y); }
      placed.push(pl);
    };
    const undo = () => {
      const pl = placed.pop();
      // Cells were pushed in order, so the last ones in each column are this piece's.
      for (const [x, , z] of pl.tiles) columns.get(`${x},${z}`).pop();
      for (const [x, , z] of pl.air) airColumns.get(`${x},${z}`).pop();
    };

    /** Add pieces from `state` until the finish is down. Depth-first: returns
     *  false if nothing fits here, and the caller then tries its next option. */
    const extend = (state) => {
      // "Level": flat, not leaning, and not inside a 51-unit section or a
      // jump's landing; only there can a gate or the finish go down.
      const level = Math.abs(state.slope) < SLOPE_TOL && Math.abs(state.bank) < BANK_TOL && !state.land;
      const finish = finishFor(state.width), gate = gateFor(state.width);
      let options;
      if (level && finish && state.distance >= length) options = [finish];
      else if (level && gate && state.sinceGate >= checkpointEvery) options = [gate];
      else if (state.land) options = [findId(STRAIGHT)]; // a jump's landing: straights only
      else {
        // Pieces whose entry slope continues the road, in a random order
        // drawn by weight (pick one, remove it, pick again).
        const pool = chain.filter((t) => Math.abs(t.slopeIn - state.slope) < SLOPE_TOL && Math.abs(t.width - state.width) < 0.2 && Math.abs(t.bankIn - state.bank) < BANK_TOL)
          .map((t) => ({ t, w: t.feature ? featureWeight(t, difficulty, slopes, state, features) : weight(t, difficulty, slopes, state) * runUpBoost(t, state) })).filter((o) => o.w > 0);
        options = [];
        while (pool.length) {
          let pick = rng() * pool.reduce((s, o) => s + o.w, 0);
          const k = pool.findIndex((o) => (pick -= o.w) < 0);
          options.push(pool.splice(k < 0 ? pool.length - 1 : k, 1)[0].t);
        }
      }
      for (const t of options) {
        if (budget-- <= 0) return false;
        const pl = place(t, state.p, state.dir, anyFeature && t.parts.length ? state.ends : null);
        if (!pl) continue;
        commit(pl);
        if (t.id === FINISH || t.id === FINISH_WIDE) return true;
        const isGate = t.id === CHECKPOINT || t.id === CHECKPOINT_WIDE;
        const next = { p: pl.exit, dir: pl.exitDir, slope: t.slopeOut, distance: state.distance + t.length, sinceGate: isGate ? 0 : state.sinceGate + t.length };
        {
          // Kept on every track (on a default one they never change from
          // standard width, no lean, no landing), so the tests above read the
          // same everywhere.
          Object.assign(next, {
            ends: t.kind === 'gap' ? null : pl.exitEnds, width: t.widthOut, bank: t.bankOut,
            // Straight road since the last bend (a kicker ramp counts; a jump resets it).
            runUp: t.kind === 'straight' || (t.kind === 'slope' && Math.abs(t.slopeOut) > SLOPE_TOL && t.feature == null) ? state.runUp + t.length : 0,
            land: t.kind === 'gap' ? t.gap.landing : Math.max(0, state.land - 1),
            wide3: t.widthOut > 40 ? (t.width > 40 ? state.wide3 + 1 : 0) : 0,
            bankTurns: Math.abs(t.bankOut) < BANK_TOL ? 0 : state.bankTurns + (t.kind === 'turn' ? 1 : 0),
          });
        }
        if (extend(next)) return true;
        undo();
      }
      return false;
    };

    // The start part above the origin, the car heading towards -z.
    const start = place(startT, [0, startT.inPort.center[1] + baseLevel * PART_SIZE, 10], [0, 0, -1]);
    commit(start);
    const first = { p: start.exit, dir: start.exitDir, slope: 0, distance: start.t.length, sinceGate: 0 };
    Object.assign(first, { ends: start.exitEnds, width: startT.widthOut, bank: 0, runUp: start.t.length, land: 0, wide3: 0, bankTurns: 0 });
    if (!extend(first)) continue;

    // Number the gates in driving order and mark the start.
    let order = 0;
    for (const pl of placed) {
      if (pl.t.id === CHECKPOINT || pl.t.id === CHECKPOINT_WIDE) pl.part.checkpointOrder = order++;
      if (pl.t.id === START || pl.t.id === START_WIDE) pl.part.startOrder = 0;
    }
    const parts = placed.flatMap((pl) => pl.parts);
    const tag = anyFeature ? featureTag(features) : '';
    const name = `gen_s${seed}_d${Math.round(difficulty * 100)}_l${length}${slopes ? '' : '_flat'}${baseLevel === 2 ? '' : `_b${baseLevel}`}${tag}`;
    const trackData = encodeSaveString(parts, environment);
    const createCar = { trackData, mountainVertices: new Float32Array(0), mountainOffset: { x: 0, y: 0, z: 0 } };
    const track = {
      name, seed, difficulty, wantedLength: length, slopes, environment, baseLevel, parts,
      pieces: placed.map((pl) => pl.t.name), trackData,
      exportString: encodeExportString(parts, name, environment),
      createCar, route: buildRoute(placed, createCar),
    };
    if (anyFeature) {
      track.features = features;
      track.counts = countFeatures(placed);
    }
    return track;
  }
  throw new Error(`no track found for seed ${seed}, length ${length}, difficulty ${difficulty}`);
}

/** Short name part for the features switched on: _w (wide track), _ws<w>,
 *  _bk<w>, _j<w> with the weight. */
function featureTag(f) {
  return `${f.wide ? '_w' : ''}${f.wideSections ? `_ws${f.wideSections}` : ''}${f.banked ? `_bk${f.banked}` : ''}${f.jumps ? `_j${f.jumps}` : ''}`;
}

/** How many of each feature a track has: { wide (pieces), wideSections,
 *  bankedTurns, jumps, kickers }. */
function countFeatures(placed) {
  const c = { wide: 0, wideSections: 0, bankedTurns: 0, jumps: 0, kickers: 0 };
  for (const pl of placed) {
    const t = pl.t;
    if (t.feature === 'wide') c.wide++;
    if (t.feature === 'wide3' && t.width < 20) c.wideSections++;
    if (t.feature === 'banked' && t.kind === 'turn') c.bankedTurns++;
    if (t.kind === 'gap') { c.jumps++; if (t.gap.kicker) c.kickers++; }
  }
  return c;
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
 * FEATURES: across a jump's gap there is no road; the points there follow
 * the flight at the jump's target speed (a parabola, gravity 14.09) and are
 * marked in `air`, and they do not count against onRoad. On a wide road the
 * kerbs are looked for at that width; on a banked piece the kerb rays run
 * along the leaning surface, not level (a level ray would hit the road on
 * the high side). Where a piece changes width the point is not centred.
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
 *   air, jumps (only on a track with jumps) per point true over a gap; and
 *              [{ from, to, minKmh, maxKmh, targetKmh, kicker, gap, drop }]
 *              with from / to the route indices of the take-off edge and
 *              of the far end of the gap
 */
function buildRoute(placed, createCar) {
  const info = loadTrackInfo(createCar);
  const mesh = info.mesh;
  const hasJumps = placed.some((pl) => pl.t.kind === 'gap');
  const hasFeatures = placed.some((pl) => pl.t.feature);

  // --- first guess: Hermite curve through each piece, a point every ~0.5 units
  const raw = [], rawPiece = [], rawAir = [];
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
      if (pl.t.kind === 'gap') {
        // The flight at the target speed from the edge: up at the ramp's
        // angle (kicker) or level (drop), never below the landing road.
        const g = pl.t.gap, v = g.targetKmh / 3.6, x = u * chord, angle = g.kicker ? Math.atan(0.49) : 0;
        const tFly = x / (v * Math.cos(angle));
        point[1] = Math.max(pl.exit[1], pl.entry[1] + v * Math.sin(angle) * tFly - 0.5 * GRAVITY * tFly * tFly);
      }
      // Every point of a gap, its two edges included: a ray exactly on the
      // edge of the landing road can miss it (1 or 2 points per jump did).
      raw.push(point); rawPiece.push(index); rawAir.push(pl.t.kind === 'gap');
    }
  });

  // --- correct against the mesh (twice: the second pass uses better tangents)
  const guessY = raw.map((p) => p[1]);
  const half = new Array(raw.length).fill(null);
  let missing = 0;
  for (let pass = 0; pass < 2; pass++) {
    missing = 0;
    for (let k = 0; k < raw.length; k++) {
      if (rawAir[k]) continue; // over a gap: nothing to measure
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
      const t = placed[rawPiece[k]].t;
      // Expected kerb-to-kerb width here: the piece's, if it does not change.
      // A banked piece is the standard road leant over: its ports read 12.03
      // corner to corner, but kerb to kerb along the lean it measures 11.30
      // to 11.32 like a flat road (route points of two banked tracks).
      const width = !hasFeatures || t.feature === 'banked' ? ROAD_WIDTH : Math.abs(t.width - t.widthOut) < 0.2 ? t.width : null;
      half[k] = null;
      if (width == null) continue;
      // Kerbs: sideways rays 0.45 above the road. A kerb is 0.73 tall (road
      // at 0.21, kerb top at 0.94), so this passes over the road and hits it.
      // On a leaning road the rays follow the lean, measured with two short
      // rays down either side of the point.
      let from = [p[0], p[1] + 0.45, p[2]], toL = left, toR = scale(left, -1);
      if (t.feature === 'banked') {
        const yAt = (s) => { const d = mesh.raycast([p[0] + left[0] * s, p[1] + 4, p[2] + left[2] * s], [0, -1, 0], 8); return d === Infinity ? null : p[1] + 4 - d; };
        const yl = yAt(1.5), yr = yAt(-1.5);
        if (yl != null && yr != null) {
          const lean = (yl - yr) / 3, n = Math.hypot(1, lean);
          toL = [left[0] / n, lean / n, left[2] / n]; toR = scale(toL, -1);
          from = [p[0] - (left[0] * lean / n) * 0.45, p[1] + 0.45 / n, p[2] - (left[2] * lean / n) * 0.45];
        }
      }
      const reach = Math.max(12, width / 2 + 6);
      const toLeft = mesh.raycast(from, toL, reach), toRight = mesh.raycast(from, toR, reach);
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
      const across = toLeft + toRight;
      if (across < width - 0.3 || across > width + 0.3) continue;
      const shift = (toLeft - toRight) / 2;
      p[0] += toL[0] * shift; p[2] += toL[2] * shift;
      half[k] = across / 2;
    }
  }

  // --- one point per unit of travel, starting where the car spawns
  const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  let first = 0;
  for (let k = 0; k < Math.min(raw.length, 100); k++) if (d3(raw[k], info.path.start.position) < d3(raw[first], info.path.start.position)) first = k;
  const points = [raw[first]], halfWidth = [half[first]], piece = [rawPiece[first]], air = [rawAir[first]];
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
      halfWidth.push(half[k]); piece.push(rawPiece[k]); air.push(rawAir[k]);
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
  const airCount = rawAir.filter(Boolean).length;
  const route = {
    spacing: ROUTE_SPACING, points: points.map((p) => p.map(round)), halfWidth: halfWidth.map((h) => (h == null ? null : round(h))),
    piece, gates, start: info.path.start, length: gates.at(-1).index * ROUTE_SPACING, onRoad: 1 - missing / (raw.length - airCount),
  };
  if (hasJumps) {
    route.air = air;
    route.jumps = [];
    for (let k = 0; k < air.length; k++) {
      if (!air[k] || (k > 0 && air[k - 1])) continue;
      let e = k;
      while (e + 1 < air.length && air[e + 1]) e++;
      const g = placed[piece[k]].t.gap;
      route.jumps.push({ from: k, to: e + 1, minKmh: g.minKmh, maxKmh: g.maxKmh, targetKmh: g.targetKmh, kicker: g.kicker, gap: g.gap, drop: g.drop });
    }
  }
  return route;
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
    // Only on a track made with FEATURES, so the files of other tracks are unchanged.
    ...(track.features ? { features: track.features, counts: track.counts } : {}),
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
  // FEATURES: --wide (whole track wide), --wide-sections w, --banked w, --jumps w.
  const features = {};
  if (process.argv.includes('--wide')) features.wide = true;
  for (const [flag, key] of [['wide-sections', 'wideSections'], ['banked', 'banked'], ['jumps', 'jumps']]) if (arg(flag, null) != null) features[key] = +arg(flag);
  for (let k = 0; k < count; k++) {
    // 'mixed': spread the tracks evenly from easy (0) to hard (1).
    const d = difficulty === 'mixed' ? (count > 1 ? k / (count - 1) : 0.5) : +difficulty;
    const track = generateTrack({ seed: seed + k, length, difficulty: Math.round(d * 100) / 100, slopes, environment: (seed + k) % 3, features });
    const { trackFile } = saveTrack(track, out);
    console.log(`${trackFile}  ${track.parts.length} parts, ${track.route.length} units, ${track.route.gates.length - 1} checkpoints, on road ${(track.route.onRoad * 100).toFixed(1)}%${track.counts ? '  ' + JSON.stringify(track.counts) : ''}`);
  }
}
