// The harder pieces for the generator: wide roads, banked turns and jumps.
//
//   import { featureTraversals } from './g2-2-features.mjs';
//   generateTrack({ ..., features: { wide: true } })        // see generate.mjs
//
// generate.mjs lays a chain of "traversals": ways of driving through a piece,
// each with an entry port and an exit port. Before this file every piece was
// one part with two standard ports. Here three more kinds are added, all
// built from the game's own parts and checked against its collision mesh in
// the same way (pieces.mjs, check_pieces.mjs):
//
// 1. COMPOSITES: several parts side by side that together make one piece of
//    a wider road. The game builds wide roads that way: a StraightWide is
//    half a road (kerb on one side, open on the other) and two of them, one
//    turned round, make a 31.13-unit road. Which placements fit was not
//    guessed: g2-2-probe_pairs.mjs / g2-2-probe_triples.mjs (run during development,
//    see README) tried every offset within 12 cells and every rotation of
//    one part against another and kept placements where the two parts' ports
//    mate and exactly two openings are left. The list below is what that
//    search found, written out. Each composite's two ends are worked out here
//    the same way (compositeEnds): mate the parts' ports, keep the unmated
//    ones, join neighbouring openings on the same plane.
//      31-unit road ("wide"): straight, two turns (radius 40 and 60 units),
//        five ramps, and the wide start, checkpoint and finish parts. There
//        is NO piece from the standard road to the 31-unit road (the
//        ToWideLeft + ToWideRight pair splits a 31 road into TWO narrow
//        roads), so a wide track is wide from start to finish.
//      51-unit road ("wide sections"): ToWideMiddle with an OuterCornerWide
//        on each side widens the standard road to 51.13 units, and a Plane
//        between two StraightWides continues it. No turn or checkpoint
//        exists at that width, so a section is a straight: widen, 1 to 4
//        straights (20 units each), narrow again.
// 2. BANKED TURNS: the tilted road pieces (159 to 167). ToTiltedLeft /
//    ToTiltedRight lean the road over 60 units (one side 4.9 units higher
//    than the other, 24 degrees), the four tilted turns (radius 30, 50, 70,
//    90) and StraightTilted continue it. pieces.mjs did not find one end of
//    StraightTilted and of the tilted turns (small end caps of the edge lines
//    were taken for a kerb across the opening); loadFeatureTable() re-derives
//    those with derivePorts(..., { openCaps: true }). The chain matches the
//    lean through the ports' two corner points (generate.mjs place()), so a
//    piece leaning the wrong way cannot be laid.
// 3. JUMPS: a GAP, a stretch of nothing between two roads. Two kinds, both
//    measured with g2-2-jump_probe.mjs (gravity 14.09 units/s^2, median of 70
//    flights; car top speed about 230 km/h with the follower's limits):
//      drop    flat road ending at an edge, the road continues 1 or 2 levels
//              (5 or 10 units) lower after a gap of 2 to 6 cells. Measured
//              minimum take-off speeds: drop 1 / gap 4 cells: 90 km/h;
//              drop 2 / gap 6: 110; drop 2 / gap 8: 130. Overshoot is small
//              (25 to 34 units past the gap at 228 km/h), so 3 straights of
//              landing are enough.
//      kicker  a SlopeUp or SlopeUpLong (leaves the ground at 26 degrees),
//              then a gap of 2 to 6 cells to road at its top or one level
//              lower. Minimum speeds: gap 4: 70 km/h; gap 8: 110 (90 one
//              level lower). The car flies far: at 190 km/h it came down 77
//              to 100 units past the gap, so the landing is 6 straights and
//              the follower is held to a target speed on the run-up.
//    Each jump records the window of take-off speeds the formulas below give
//    (minKmh, maxKmh, with margins) and the target the follower aims for.
//
// Not here: loops and wall rides. Their parts (WallTrack*, parts stood on
// their side) have no ports pieces.mjs can find (it reads openings on
// vertical grid planes of an upright part), the follower steers in the
// horizontal plane only, and g2-1's route search "prefers a slow flat U-turn
// to a fast banked wall" (g2-1 README). So none of the three tools that make
// a generated track trustworthy would work on them; see README.md.
import { loadFeatureTable, worldPorts, worldTiles } from './pieces.mjs';
import { matePorts } from './check_pieces.mjs';

/** Gravity in the simulator, units/s^2: the median of 70 flights fitted in
 *  g2-2-jump_probe.mjs (range 12.4 to 16.7 for flights of 0.4 s and more). */
export const GRAVITY = 14.09;

/** Width classes of road, kerb to kerb, units. */
export const NARROW = 11.13, WIDE = 31.13, WIDE3 = 51.13;

/**
 * The composites: [name, feature, [typeId, dx, dy, dz, rotation] ...] with
 * offsets in cells from the first part. From the placement search described
 * at the top.
 */
const COMPOSITES = [
  ['StraightWide2', 'wide', [10, 0, 0, 0, 0], [10, -4, 0, 0, 2]],
  ['TurnShortWide2', 'wide', [94, 0, 0, 0, 0], [95, 4, 0, 0, 0]],
  ['TurnLongWide2', 'wide', [96, 0, 0, 0, 0], [97, 4, 0, 0, 0]],
  ['SlopeUpWide2', 'wide', [13, 0, 0, 0, 0], [14, 4, 0, 0, 0]],
  ['SlopeDownWide2', 'wide', [15, 0, 0, 0, 0], [16, 4, 0, 0, 0]],
  ['SlopeWide2', 'wide', [17, 0, 0, 0, 0], [18, 4, 0, 0, 0]],
  ['SlopeUpLongWide2', 'wide', [147, 0, 0, 0, 0], [148, -4, 0, 0, 0]],
  ['SlopeDownLongWide2', 'wide', [149, 0, 0, 0, 0], [150, -4, 0, 0, 0]],
  ['ToWide3', 'wide3', [7, 0, 0, 0, 0], [12, -4, 0, 0, 1], [12, 4, 0, 0, 2]],
  ['StraightWide3', 'wide3', [25, 0, 0, 0, 0], [10, 4, 0, 0, 0], [10, -4, 0, 0, 2]],
];
/** Wide start, checkpoint and finish: single parts 8 cells across. */
export const START_WIDE = 91, CHECKPOINT_WIDE = 65, FINISH_WIDE = 74;
/** Banked pieces (pieces.mjs TILTED_IDS) used as single parts. */
const BANKED_IDS = [159, 160, 161, 162, 163, 166, 167];

/**
 * The two ends of a group of placed parts: the openings left when the parts'
 * ports are mated with each other, with neighbouring openings on one plane
 * joined (a 31-unit end is two 15.57 ports side by side). Each end has the
 * fields of a pieces.mjs port, in the composite's own frame (units).
 */
export function compositeEnds(parts, table = loadFeatureTable()) {
  const { ports } = matePorts(parts, table);
  const open = ports.filter((p) => p.mate < 0 && p.axis !== 1);
  const groups = new Map();
  for (const p of open) {
    const k = `${p.axis},${p.plane},${p.out}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  const ends = [];
  for (const list of groups.values()) {
    const along = list[0].axis === 0 ? 2 : 0;
    // Order each opening low to high along the plane, then the openings.
    const segs = list.map((p) => (p.a[along] <= p.b[along] ? { p, a: p.a, b: p.b } : { p, a: p.b, b: p.a })).sort((u, v) => u.a[along] - v.a[along]);
    let run = null;
    const flush = () => {
      if (!run) return;
      const center = [0, 1, 2].map((k) => (run.a[k] + run.b[k]) / 2);
      ends.push({ axis: run.axis, plane: run.plane, out: run.out, a: run.a, b: run.b, center, width: Math.hypot(run.b[0] - run.a[0], run.b[1] - run.a[1], run.b[2] - run.a[2]), pitch: run.pitches.reduce((x, y) => x + y, 0) / run.pitches.length });
    };
    for (const s of segs) {
      // 0.1 units: the two halves of a wide road meet with a 0.03 seam.
      if (run && Math.abs(s.a[along] - run.b[along]) < 0.1) { run.b = s.b; run.pitches.push(s.p.pitch); continue; }
      flush();
      run = { axis: s.p.axis, plane: s.p.plane, out: s.p.out, a: s.a, b: s.b, pitches: [s.p.pitch] };
    }
    flush();
  }
  return ends;
}

/**
 * Pieces for the generator, before they are turned into traversals:
 * [{ id, name, feature, parts: [{ typeId, offset, rotation }], ports: [two
 * ends], tiles: [[x, y, z] cells] }]. `id` is a label unique per piece
 * (negative for composites, the type id for single parts).
 */
let pieceCache = null;
export function featurePieces() {
  if (pieceCache) return pieceCache;
  const table = loadFeatureTable();
  const list = [];
  const add = (id, name, feature, parts) => {
    const placed = parts.map(({ typeId, offset, rotation }) => ({ typeId, x: offset[0], y: offset[1], z: offset[2], rotation, rotationAxis: 0 }));
    const ports = parts.length === 1 ? table.get(parts[0].typeId).ports : compositeEnds(placed, table);
    if (ports.length !== 2) throw new Error(`${name}: expected two ends, found ${ports.length}`);
    list.push({ id, name, feature, parts, ports, tiles: placed.flatMap((p) => worldTiles(p, table)) });
  };
  COMPOSITES.forEach(([name, feature, ...parts], k) => add(-(k + 1), name, feature, parts.map(([typeId, dx, dy, dz, rotation]) => ({ typeId, offset: [dx, dy, dz], rotation }))));
  for (const id of [START_WIDE, CHECKPOINT_WIDE, FINISH_WIDE]) add(id, table.get(id).name, 'wide', [{ typeId: id, offset: [0, 0, 0], rotation: 0 }]);
  for (const id of BANKED_IDS) add(id, table.get(id).name, 'banked', [{ typeId: id, offset: [0, 0, 0], rotation: 0 }]);
  return (pieceCache = list);
}

// ---- jumps -------------------------------------------------------------------

/** Take-off angle of the ramps, radians: they leave at a rise of 0.49 per unit. */
const KICK = Math.atan(0.49);

/** Horizontal distance flown from a take-off at speed v (units/s) and angle
 *  theta, to a landing `drop` units below the take-off (drag-free). */
export function flightDistance(v, theta, drop) {
  const vy = v * Math.sin(theta), vx = v * Math.cos(theta);
  const t = (vy + Math.sqrt(vy * vy + 2 * GRAVITY * drop)) / GRAVITY;
  return vx * t;
}

/** Slowest take-off (km/h) that carries `distance` units with that angle and
 *  drop; bisection on flightDistance. */
export function speedFor(distance, theta, drop) {
  let lo = 1, hi = 200;
  for (let k = 0; k < 50; k++) { const mid = (lo + hi) / 2; if (flightDistance(mid, theta, drop) < distance) lo = mid; else hi = mid; }
  return hi * 3.6;
}

/**
 * The gaps the generator may lay. Each: { gap (cells), drop (levels),
 * kicker, minKmh, maxKmh, targetKmh, landing (straights after it) }.
 *
 * minKmh: the speed that just carries the gap plus 2 units, times 1.1. Checked
 * against g2-2-jump_probe.mjs: the formula gives 99 km/h for drop 1 / gap 4
 * cells (measured: 90 finished, 70 did not), 104 for drop 2 / gap 6
 * (measured 110 finished, 90 did not) and 78 for the kicker over 4 cells to
 * its own height (measured 70 finished, 50 did not). The table this makes
 * (19 gaps of 2 to 6 cells, minimum 39 to 121 km/h, target 59 to 151):
 * node -e "import('./ideas/g2-2-track-generator/g2-2-features.mjs').then(f => console.table(f.jumpGaps()))"
 * The formula is drag-free, so it overstates long flights: that is the safe
 * side for a minimum and the unsafe side for a maximum, so maxKmh uses only
 * 70% of the landing as room. Gaps whose minimum is above 140 km/h are left
 * out (the follower reaches 134 km/h in 40 units from a standstill, measured,
 * and the run-up is at least 60 units, but a corner before it slows it).
 */
let gapCache = null;
export function jumpGaps() {
  if (gapCache) return gapCache;
  const list = [];
  for (const kicker of [false, true]) {
    for (const drop of kicker ? [0, 1] : [1, 2]) {
      for (let gap = 2; gap <= 6; gap++) {
        const landing = kicker ? 6 : 3;
        const h = drop * 5 + (kicker ? 0 : 0.5); // the car's centre rides 0.5 above the road edge it leaves
        const minKmh = 1.1 * speedFor(gap * 5 + 2, kicker ? KICK : 0, h);
        const maxKmh = Math.min(250, speedFor(gap * 5 + 0.7 * landing * 20, kicker ? KICK : 0, h));
        if (minKmh > 140 || maxKmh < minKmh * 1.3) continue;
        const targetKmh = Math.min(maxKmh * 0.9, Math.max(minKmh * 1.25, minKmh + 20));
        list.push({ gap, drop, kicker, minKmh: Math.round(minKmh), maxKmh: Math.round(maxKmh), targetKmh: Math.round(targetKmh), landing });
      }
    }
  }
  return (gapCache = list);
}
