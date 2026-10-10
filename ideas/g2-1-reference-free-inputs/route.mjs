// A ROUTE worked out from the track alone: the path a car should follow from
// the start, through the checkpoints in order, to the finish. No lap, human
// or otherwise, is used. It is meant to replace the human reference line of
// rl/racing_env.mjs as the ruler for progress, off-track detection and
// lookahead (observation.mjs is built on it).
//
//   import { loadTrackInfo } from '../shared/track_info.mjs';
//   const route = buildRoute(loadTrackInfo('desert4'));   // or a save string
//   route.ok                    false if some gate could not be reached (see route.problem)
//   route.points[k]             [x, y, z], one per SPACING = 1 unit, at car-origin height
//   route.forward[k], up[k], left[k]    unit vectors: along the route, away from the road, to the left
//   route.grounded[k]           false where the route is in the air (a jump)
//   route.edgeLeft[k], edgeRight[k]     room to the road's edge on each side (as sim/trackmesh.mjs clearanceProfile)
//   route.curvature[k]          signed turn rate about `up`, radians per unit; + = left
//   route.slope[k]              climb per unit of route (+1 = straight up)
//   route.gateIndex[g]          the point at which gate g is taken
//   route.jumps                 [{ from, to, speed }]: point ranges that are flown
//   route.length                units
//
// HOW IT IS FOUND
//
// 1. surface.mjs turns the collision mesh into a graph of points a car could
//    stand on, joined where the surface carries on smoothly.
// 2. A shortest-path search (Dijkstra) runs over that graph from the start
//    position, one STAGE per gate: stage g ends at the nodes lying in gate g's
//    detector box and the next stage starts from them. Steps near the edge of
//    a surface cost more, so the path keeps to the middle of a road and still
//    cuts across an open floor.
//    The search also carries the car's HEADING, so the path cannot turn on
//    the spot or reverse on a road (see runStage).
// 3. Surfaces are not all joined: the tracks have jumps (the human laps fly
//    between 0 and 27% of their distance; the longest single flight is 394
//    units). So at every node on a RIM (where a surface ends) that the car is
//    heading squarely off, the search also throws the car off at each of a
//    set of speeds, follows the parabola with ray casts until it hits
//    something, and if that is an upward-facing surface, adds a FLIGHT to
//    it. Flights cost more than the same distance on the road, so the search
//    only flies where the road does not go.
// 4. The winning path is smoothed, resampled to one point per unit, lifted to
//    the height of the car's origin, and measured (edges, curvature, slope).
//
// WHAT IT DOES NOT KNOW. Nothing here drives a car. The search has only an
// upper limit on how fast a car could be going (full throttle in a straight
// line since the start), so a flight is "possible at some speed up to that",
// and the flown arc is a drag-free parabola for the slowest such speed. It
// does not know how fast a corner can be taken, so it will turn round on a
// flat floor where a human rides a banked wall, and it measures cost in
// distance, not time. It does not know which way a road is meant to be
// driven except through the gate order. README.md says where this goes wrong
// on the official tracks.
import { loadPartConfigs, ROTATIONS, rotate, PART_SIZE, DETECTOR_FINISH } from '../../sim/track.mjs';
import { MAX_CLEARANCE } from '../../sim/trackmesh.mjs';
import { buildSurface } from './surface.mjs';

/** Distance between route points, world units (the same as sim/line.mjs). */
export const SPACING = 1;
/** Height of the car's origin above the road when it stands on it. Measured
 *  under the human laps with all four wheels down: median 0.12 to 0.17 on
 *  every track. */
export const RIDE_HEIGHT = 0.15;
/** Gravity, units/s^2. Measured as the vertical acceleration of the human
 *  laps while airborne: median -16 to -19 over all airborne samples, and 18
 *  to 27 (most near 20) when worked back from the take-off speed, time and
 *  height change of each of the humans' long flights. The car also has air
 *  drag (a 384-unit flight came up 11% short of its parabola), which a
 *  parabola ignores; the flown stretches of a route are therefore rough. */
export const GRAVITY = 20;

export const DEFAULTS = {
  // Extra cost of a step close to a rim: times (1 + edgePenalty) on the rim
  // itself, falling to times 1 at edgeSafe units from it. A road is 13 units
  // wide, so the middle 3 units are free and the search is pushed off kerbs.
  edgeSafe: 5,
  edgePenalty: 3,
  // The car is 2 units wide; see the step rule in runStage.
  minEdge: 1.5,
  // A flight of L units costs jumpFixed + jumpFactor x L + L^2 / jumpSquare,
  // against 1 per unit driven. So the search flies only where the road does
  // not go, and prefers a short flight and a drive to one long flight: 85
  // units cost 225, 270 units cost 1160. See README for why (summer4).
  jumpFactor: 1.5,
  jumpFixed: 25,
  jumpSquare: 100,
  // Take-off speeds tried at each rim node, units/s (x 3.6 = km/h), up to the
  // speed a car could have reached by then. The human laps take off at 34 to
  // 141 units/s and never exceed 146 anywhere.
  jumpSpeeds: [10, 16, 23, 31, 40, 50, 61, 73, 86, 100, 115, 130],
  topSpeed: 146,
  // A car only flies off a rim it is heading nearly square to: cosine of the
  // largest angle, seen from above, between its steady heading and the
  // direction pointing off the surface (25 degrees).
  launchAlign: 0.906,
  steadyLength: 30,
  // Steering: a step may differ from the heading by at most acos(turnLimit)
  // = 67 degrees, and the heading is an average over about headingLength units.
  turnLimit: 0.39,
  headingLength: 8,
  // A rise counts as a take-off ramp once it has lasted this many units
  // (kerbs rise for 2 or 3; the shortest ramp part is 20 long).
  rampLength: 8,
  // A flight is followed for at most this long, seconds.
  jumpSeconds: 6,
  // Gate boxes are grown by this much on every side when deciding which
  // surface nodes lie "in" a gate (the box hangs 0.3 units above the road).
  gateMargin: 1.5,
  // Where a track offers several parts for one gate (desert3 has a left and a
  // right first checkpoint, mirror images), the search takes whichever is
  // cheapest. To force a choice, give a position per stage (or null).
  gateHints: null,
};

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/**
 * The gates of a track in the order they must be taken, each stage with ALL
 * the parts that can satisfy it (sim/track.mjs buildPath keeps only the one
 * nearest to the previous gate, which is a guess; the search here can try
 * them all and take the cheapest).
 * Returns [[{ center, size, isFinish }, ...], ...]; the last stage is the finish.
 */
export function gateStages(parts) {
  const configs = loadPartConfigs();
  const boxes = [];
  for (const p of parts) {
    const det = configs.get(p.typeId).detector;
    if (!det) continue;
    const q = ROTATIONS[p.rotationAxis][p.rotation];
    const c = rotate(det.center, q);
    boxes.push({
      isFinish: det.type === DETECTOR_FINISH, order: p.checkpointOrder,
      center: [p.x * PART_SIZE + c[0], p.y * PART_SIZE + c[1], p.z * PART_SIZE + c[2]],
      size: rotate(det.size, q).map(Math.abs),
    });
  }
  const orders = [...new Set(boxes.filter((b) => !b.isFinish).map((b) => b.order))].sort((a, b) => a - b);
  return [...orders.map((o) => boxes.filter((b) => !b.isFinish && b.order === o)), boxes.filter((b) => b.isFinish)];
}

const inBox = (p, box, margin) => Math.abs(p[0] - box.center[0]) <= box.size[0] / 2 + margin
  && Math.abs(p[1] - box.center[1]) <= box.size[1] / 2 + margin && Math.abs(p[2] - box.center[2]) <= box.size[2] / 2 + margin;

/**
 * Room to the edge of the road on each side of a point, by the method of
 * sim/trackmesh.mjs clearanceProfile: going sideways, whichever comes first
 * of a wall (a sideways ray at body height hits something) and the end of the
 * surface (probes straight "down" stop finding road; two misses in a row, so
 * a hairline gap between parts does not count).
 *
 *   p          a point at car-origin height
 *   left, up   unit vectors: which way is sideways and which way is away from the road
 *   probe      false to skip the surface probes (a point in the air)
 * Returns { left, right, overRoad }: distances in units, at most
 * MAX_CLEARANCE = 20; overRoad = there is surface within 2 units under p.
 */
export function roomBeside(mesh, p, left, up, probe = true) {
  const down = [-up[0], -up[1], -up[2]];
  const roadBelow = (dir, d) => mesh.raycast([p[0] + dir[0] * d + up[0] * 0.5, p[1] + dir[1] * d + up[1] * 0.5, p[2] + dir[2] * d + up[2] * 0.5], down, 2) !== Infinity;
  const overRoad = roadBelow(left, 0);
  const out = { left: 0, right: 0, overRoad };
  for (const side of [1, -1]) {
    const dir = [left[0] * side, left[1] * side, left[2] * side];
    let room = MAX_CLEARANCE;
    for (const h of [0.15, 0.6]) room = Math.min(room, mesh.raycast([p[0] + up[0] * h, p[1] + up[1] * h, p[2] + up[2] * h], dir, MAX_CLEARANCE));
    if (probe && overRoad) {
      let misses = 0;
      for (let d = 0.5; d < room; d += 0.5) {
        if (roadBelow(dir, d)) { misses = 0; continue; }
        if (++misses === 2) { room = d - 0.75; break; }
      }
    }
    out[side === 1 ? 'left' : 'right'] = room;
  }
  return out;
}

/** A binary min-heap of (cost, node) pairs on typed arrays. */
class Heap {
  constructor() { this.cost = new Float64Array(1 << 16); this.node = new Int32Array(1 << 16); this.size = 0; }
  push(c, n) {
    if (this.size === this.cost.length) {
      const c2 = new Float64Array(2 * this.size); c2.set(this.cost); this.cost = c2;
      const n2 = new Int32Array(2 * this.size); n2.set(this.node); this.node = n2;
    }
    let i = this.size++;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.cost[parent] <= c) break;
      this.cost[i] = this.cost[parent]; this.node[i] = this.node[parent]; i = parent;
    }
    this.cost[i] = c; this.node[i] = n;
  }
  pop() { // returns the node; its cost is left in this.top
    this.top = this.cost[0];
    const out = this.node[0], c = this.cost[--this.size], n = this.node[this.size];
    let i = 0;
    for (;;) {
      let child = 2 * i + 1;
      if (child >= this.size) break;
      if (child + 1 < this.size && this.cost[child + 1] < this.cost[child]) child++;
      if (this.cost[child] >= c) break;
      this.cost[i] = this.cost[child]; this.node[i] = this.node[child]; i = child;
    }
    this.cost[i] = c; this.node[i] = n;
    return out;
  }
}

/**
 * Build the route for a track.
 *   info     loadTrackInfo(track) from ideas/shared/track_info.mjs
 *   options  overrides for DEFAULTS; `surface` to reuse a built surface graph
 */
export function buildRoute(info, options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const mesh = info.mesh;
  const sf = options.surface ?? buildSurface(mesh);
  const { px, py, pz, nx, ny, nz, adjStart, adj, edge, out } = sf;
  let stages = gateStages(info.parts);
  // gateHints[s] = a position: of the parts that can serve as gate s, use only
  // the one nearest to it (see DEFAULTS).
  if (cfg.gateHints) {
    stages = stages.map((stage, s) => (cfg.gateHints[s] ? [stage.reduce((a, b) => (dist(b.center, cfg.gateHints[s]) < dist(a.center, cfg.gateHints[s]) ? b : a))] : stage));
  }
  const pos = (k) => [px[k], py[k], pz[k]];

  // ---- the node under the start position ------------------------------------
  const startPosition = info.path.start.position;
  let startNode = -1, startDist = Infinity;
  for (const k of sf.near(startPosition, 6)) {
    const d = dist(pos(k), startPosition);
    if (ny[k] > 0.5 && d < startDist) { startDist = d; startNode = k; }
  }
  if (startNode < 0) return { ok: false, problem: 'no surface under the start position' };

  // ---- which nodes lie in which gate ----------------------------------------
  // gateOf[k] = bit s set when node k lies in a box of stage s.
  const gateOf = new Uint32Array(sf.count);
  const stageNodes = stages.map(() => 0);
  for (let s = 0; s < stages.length; s++) {
    for (const box of stages[s]) {
      const radius = Math.hypot(...box.size) / 2 + 2 * cfg.gateMargin;
      for (const k of sf.near(box.center, radius)) {
        if (inBox(pos(k), box, cfg.gateMargin) && !(gateOf[k] & (1 << s))) { gateOf[k] |= 1 << s; stageNodes[s]++; }
      }
    }
  }

  // ---- how fast a car can be going `run` units after a standstill ------------
  // Full throttle on the flat, from the human laps: acceleration falls in a
  // straight line from 19.5 units/s^2 at rest to 5 at 140 units/s (the 90th
  // percentile of what the humans achieve in each speed band). Integrated
  // once here into a table of speed against distance. It is an UPPER limit:
  // corners and braking are ignored. Its only use is to rule out flights that
  // need more speed than a car could have built up by then.
  const speedTable = [0];
  for (let v = 0, travelled = 0; travelled < 3000;) {
    v = Math.min(cfg.topSpeed, v + Math.max(0, 19.5 - 0.104 * v) * 0.01);
    travelled += v * 0.01;
    while (speedTable.length <= travelled) speedTable.push(v);
  }
  const speedAfter = (travelled) => speedTable[Math.min(speedTable.length - 1, Math.floor(travelled))];

  // ---- flights from a rim node -------------------------------------------------
  // A car at node k heading along `h` (`steady`: the same over a longer
  // stretch), able to be doing up to `vmax`
  // (`onRamp`: see below): where
  // can it land if it drives off the surface here? Returns
  // [{ to, dir, length, speed, time, gates }]; `gates` has bit s set when the
  // flight passes through a box of stage s (a checkpoint taken in the air).
  const yFloor = py.reduce((m, y) => Math.min(m, y), Infinity) - 100;
  function flights(k, h, steady, vmax, onRamp) {
    // Only from surfaces a car drives on the right way up, only off the rim,
    // and only when the car is heading off the surface (not along the rim).
    if (edge[k] !== 0 || ny[k] < 0.5) return [];
    const rimOut = [out[3 * k], out[3 * k + 1], out[3 * k + 2]];
    const flatOut = unit([rimOut[0], 0, rimOut[2]]), aim = unit([steady[0], 0, steady[2]]);
    if (dot(aim, flatOut) < cfg.launchAlign) return [];
    // Take-off direction. Sideways aim: where the car has been heading over
    // the last 30 units or so (`steady`), provided that is nearly square to
    // the rim. (The rim's own outward direction was used at first; at the
    // corner of a ramp's end it points diagonally, and on desert3 the route
    // flew off such a corner onto the top of the wall beside the landing
    // area instead of straight on as the human does.) Climb angle: the slope of the surface at the rim, but
    // only if the car has been climbing for rampLength units or more
    // (`onRamp`): that is a ramp. A shorter rise is a kerb, and counts as
    // level. (Before this, a car "took off" up the kerb at the edge of an
    // open floor on summer4 and landed 5 units higher, 30 units away, on a
    // stretch of road that belongs much later in the lap.)
    const climb = Math.max(-0.7, Math.min(0.7, onRamp ? Math.max(h[1], rimOut[1]) : Math.min(h[1], 0.03)));
    const level = Math.sqrt(1 - climb * climb);
    const d = [aim[0] * level, climb, aim[2] * level];
    const list = [];
    const from = [px[k] + nx[k] * 0.4, py[k] + ny[k] * 0.4, pz[k] + nz[k] * 0.4];
    const seen = new Set();
    const speeds = cfg.jumpSpeeds.filter((v) => v < vmax);
    if (vmax >= cfg.jumpSpeeds[0]) speeds.push(vmax);
    for (const speed of speeds) {
      // Follow the parabola in straight pieces of about 4 units (shorter when slow).
      const dt = Math.min(0.1, 4 / speed);
      let p = from, length = 0, gates = 0;
      for (let t = dt; t <= cfg.jumpSeconds; t += dt) {
        const q = [from[0] + d[0] * speed * t, from[1] + d[1] * speed * t - 0.5 * GRAVITY * t * t, from[2] + d[2] * speed * t];
        const seg = sub(q, p), segLength = Math.hypot(seg[0], seg[1], seg[2]);
        const dir = [seg[0] / segLength, seg[1] / segLength, seg[2] / segLength];
        const hit = mesh.raycastFar(p, dir, segLength);
        const reach = Math.min(hit, segLength);
        // Gates flown through on this piece (checked at its two ends and middle).
        for (let s = 0; s < stages.length; s++) {
          for (const box of stages[s]) {
            if (Math.abs(p[0] - box.center[0]) + Math.abs(p[2] - box.center[2]) > 60) continue;
            for (const f of [0, 0.5, 1]) if (inBox([p[0] + dir[0] * reach * f, p[1] + dir[1] * reach * f, p[2] + dir[2] * reach * f], box, 0.5)) gates |= 1 << s;
          }
        }
        length += reach;
        if (hit !== Infinity) {
          const at = [p[0] + dir[0] * hit, p[1] + dir[1] * hit, p[2] + dir[2] * hit];
          // The surface node hit: the nearest upward-facing one. None: it
          // was a wall or an underside, and this flight is no use.
          let to = -1, best = 2.5;
          for (const j of sf.near(at, 2.5)) {
            const dj = dist(pos(j), at);
            if (ny[j] > 0.5 && dj < best) { best = dj; to = j; }
          }
          // Landing a step away is not a flight; and one flight per landing
          // node is enough (the slowest: speeds are tried in rising order).
          if (to >= 0 && length > 4 && !seen.has(to)) {
            seen.add(to);
            list.push({ to, dir: d, length, speed, time: t - dt + (hit / segLength) * dt, gates });
          }
          break;
        }
        if (q[1] < yFloor) break;
        p = q;
      }
    }
    return list;
  }
  const flightCost = (length) => cfg.jumpFixed + cfg.jumpFactor * length + (length * length) / cfg.jumpSquare;
  // The heading a car has just after landing: the take-off direction, laid
  // flat and then onto the landing surface.
  const landingHeading = (dir, to) => {
    const flat = unit([dir[0], 0, dir[2]]);
    const d = flat[0] * nx[to] + flat[1] * ny[to] + flat[2] * nz[to];
    return unit([flat[0] - d * nx[to], flat[1] - d * ny[to], flat[2] - d * nz[to]]);
  };

  // ---- the search, one stage per gate ----------------------------------------
  // A search STATE is a node plus the rough direction the car is heading in
  // there: one of SECTORS = 6 (towards +x, -x, +y, -y, +z or -z, whichever
  // the heading is nearest). So a road can be passed through in both
  // directions without one way erasing the other. Each state carries, besides
  // its cost, two things about the cheapest way found to it: the exact
  // HEADING (a running average of the last few steps' directions) and the
  // distance driven since the start (`run`, for speedAfter).
  //
  // The heading is what stops the path turning on the spot: a step is only
  // allowed within turnLimit of the heading, and the heading follows the
  // steps slowly, so reversing direction takes a loop about 17 units across,
  // which does not fit on a 13-unit road. Without it the search took gates
  // from whichever side was nearest and doubled back (desert2: 263 units
  // from the human's lap at worst, 105 with it).
  //
  // (Because of the heading the search is no longer guaranteed to find the
  // cheapest path, only a good one: a state keeps the heading of the cheapest
  // arrival, and another arrival in the same sector is dropped.)
  const SECTORS = 6;
  const sectorOf = (x, y, z) => {
    const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
    return ax >= ay && ax >= az ? (x > 0 ? 0 : 1) : ay >= az ? (y > 0 ? 2 : 3) : (z > 0 ? 4 : 5);
  };
  const stepFactor = (k) => 1 + cfg.edgePenalty * Math.max(0, 1 - edge[k] / cfg.edgeSafe);
  const states = sf.count * SECTORS;
  const cost = new Float64Array(states), done = new Uint8Array(states);
  const hx = new Float32Array(states), hy = new Float32Array(states), hz = new Float32Array(states), run = new Float32Array(states);
  // How far the car has been climbing without a break (for `onRamp` in flights()).
  const climbed = new Float32Array(states);
  // The heading averaged over steadyLength units instead of headingLength:
  // too slow to steer by, steady enough to aim a flight with.
  const sx = new Float32Array(states), sy = new Float32Array(states), sz = new Float32Array(states);

  /**
   * One stage: from `sources` (state -> { cost, from, h, run }) to the nodes
   * of gate s. Stops once the search is `margin` beyond the first arrival.
   * Returns { taken, prev, flown }:
   *   taken   state -> { cost, from: { stage, state, flight? }, h, run }: the
   *           arrivals, which are the next stage's sources
   *   prev    prev[state] = the state it was reached from (-1: a source)
   *   flown   state -> { fromNode, dir, speed, time } for states landed on
   */
  function runStage(s, sources, margin) {
    cost.fill(Infinity); done.fill(0);
    const prev = new Int32Array(states).fill(-1);
    const flown = new Map();
    const heap = new Heap();
    for (const [st, src] of sources) { cost[st] = src.cost; hx[st] = src.h[0]; hy[st] = src.h[1]; hz[st] = src.h[2]; run[st] = src.run; climbed[st] = 0; sx[st] = src.h[0]; sy[st] = src.h[1]; sz[st] = src.h[2]; heap.push(src.cost, st); }
    const bit = 1 << s;
    const taken = new Map();
    let firstTaken = Infinity;
    while (heap.size) {
      const st = heap.pop(), c = heap.top;
      if (done[st] || c > cost[st]) continue;
      done[st] = 1;
      if (c > firstTaken + margin) break;
      const k = (st / SECTORS) | 0;
      const h = [hx[st], hy[st], hz[st]];
      if (gateOf[k] & bit) {
        taken.set(st, { cost: c, from: { stage: s, state: st }, h, run: run[st] });
        firstTaken = Math.min(firstTaken, c);
        continue; // the next stage carries on from here
      }
      const fk = stepFactor(k);
      for (let o = adjStart[k]; o < adjStart[k + 1]; o++) {
        const j = adj[o];
        const dx = px[j] - px[k], dy = py[j] - py[k], dz = pz[j] - pz[k];
        const step = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dx * h[0] + dy * h[1] + dz * h[2] < cfg.turnLimit * step) continue;
        // Too narrow to drive along: within minEdge of a rim, a step may go
        // away from the rim, or straight onto it (to take off from it), but
        // not along it. This keeps the path off beams, wall tops and kerb
        // crests, which are surfaces but not road.
        if (edge[j] < cfg.minEdge && edge[j] <= edge[k] && edge[j] !== 0) continue;
        if (edge[j] === 0 && edge[k] === 0) continue;
        // New heading: the old one moved a fraction of the way to this step's direction.
        const a = Math.min(1, step / cfg.headingLength);
        const ax = h[0] + a * (dx / step - h[0]), ay = h[1] + a * (dy / step - h[1]), az = h[2] + a * (dz / step - h[2]);
        const to = j * SECTORS + sectorOf(ax, ay, az);
        if (done[to]) continue;
        const cj = c + step * 0.5 * (fk + stepFactor(j));
        if (cj < cost[to]) {
          cost[to] = cj; prev[to] = st; flown.delete(to); heap.push(cj, to);
          const l = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
          hx[to] = ax / l; hy[to] = ay / l; hz[to] = az / l; run[to] = run[st] + step;
          climbed[to] = dy > 0.08 * step ? climbed[st] + step : 0;
          const b = Math.min(1, step / cfg.steadyLength);
          const bx = sx[st] + b * (dx / step - sx[st]), by = sy[st] + b * (dy / step - sy[st]), bz = sz[st] + b * (dz / step - sz[st]);
          const bl = Math.sqrt(bx * bx + by * by + bz * bz) || 1;
          sx[to] = bx / bl; sy[to] = by / bl; sz[to] = bz / bl;
        }
      }
      for (const flight of flights(k, h, [sx[st], sy[st], sz[st]], speedAfter(run[st]), climbed[st] >= cfg.rampLength)) {
        const cj = c + flightCost(flight.length);
        const lh = landingHeading(flight.dir, flight.to);
        const to = flight.to * SECTORS + sectorOf(lh[0], lh[1], lh[2]);
        const how = { fromNode: k, dir: flight.dir, speed: flight.speed, time: flight.time };
        if (flight.gates & bit) {
          // The gate is taken in the air: the landing starts the next stage.
          const had = taken.get(to);
          if (!had || had.cost > cj) taken.set(to, { cost: cj, from: { stage: s, state: st, flight: how }, h: lh, run: run[st] + flight.length });
          firstTaken = Math.min(firstTaken, cj);
        } else if (!done[to] && cj < cost[to]) {
          cost[to] = cj; prev[to] = st; flown.set(to, how); heap.push(cj, to);
          hx[to] = lh[0]; hy[to] = lh[1]; hz[to] = lh[2]; run[to] = run[st] + flight.length; climbed[to] = 0;
          sx[to] = lh[0]; sy[to] = lh[1]; sz[to] = lh[2];
        }
      }
    }
    return { taken, prev, flown, sources };
  }

  const startForward = rotate([0, 0, 1], info.path.start.quaternion);
  const startSources = new Map([[startNode * SECTORS + sectorOf(...startForward), { cost: 0, from: null, h: startForward, run: 0 }]]);
  // record[s] = the result of stage s. Normally a stage stops 120 units after
  // its first arrival at the gate (the other nodes of a gate are within its
  // width, at most 38 units). If the NEXT stage then cannot reach its gate,
  // the arrivals may all have been facing the wrong way (the gate was first
  // reached against the direction of the road), so the stage is run again to
  // the end, which collects arrivals from every direction, and the next stage
  // is tried once more.
  const record = [];
  let problem = null;
  for (let s = 0, retried = -1; s < stages.length; s++) {
    record[s] = runStage(s, s === 0 ? startSources : record[s - 1].taken, 120);
    if (record[s].taken.size) continue;
    if (s > 0 && retried !== s) {
      retried = s;
      record[s - 1] = runStage(s - 1, record[s - 1].sources, Infinity);
      s--;
      continue;
    }
    problem = `gate ${s + 1} of ${stages.length} not reached (${stageNodes[s]} surface nodes lie in it)`;
    record.length = s;
    break;
  }
  const reached = record.length;

  // ---- walk back from the finish (or from as far as the search got) ---------
  // Produces `steps`, start to end: { node, gates: [stages taken at this
  // node], jump } where `jump` = { fromNode, dir, speed, time } if the node
  // was landed on rather than driven to.
  const steps = [];
  if (reached > 0) {
    const reversed = [];
    // Add a node to the walk unless it is the one just added (a gate node is
    // both the end of one stage and the start of the next).
    const visit = (state) => {
      const node = (state / SECTORS) | 0;
      if (reversed.at(-1)?.node !== node) reversed.push({ node, gates: [] });
      return reversed.at(-1);
    };
    // The cheapest arrival at the last gate reached.
    let state = -1, how = null, best = Infinity;
    for (const [st, t] of record[reached - 1].taken) if (t.cost < best) { best = t.cost; state = st; how = t.from; }
    while (how) {
      // `state` is where gate how.stage was taken; `how` says in which way.
      const { prev, flown, sources: stageSources } = record[how.stage];
      const entry = visit(state);
      entry.gates.push(how.stage);
      if (how.flight) {
        entry.jump = how.flight;
        state = how.state;
        visit(state);
      }
      // Back through this stage until a state nothing led to: one of its sources.
      while (prev[state] !== -1) {
        if (flown.has(state)) reversed.at(-1).jump = flown.get(state);
        state = prev[state];
        visit(state);
      }
      how = stageSources.get(state).from;
    }
    visit(state);
    reversed.reverse();
    steps.push(...reversed);
  }

  if (!steps.length) return { ok: false, problem: problem ?? 'no path', stages, surface: sf, reached };
  return finishRoute({ mesh, sf, steps, stages, ok: reached === stages.length, problem, reached });
}

/**
 * Turn the list of surface nodes and jumps into the evenly spaced, measured
 * route described at the top of the file.
 */
function finishRoute({ mesh, sf, steps, stages, ok, problem, reached }) {
  const { px, py, pz, nx, ny, nz } = sf;
  // ---- 1. a raw polyline: surface nodes lifted to car height, flights sampled
  const raw = [];   // { p, n, air, speed (air only), gates }
  const lifted = (k) => [px[k] + nx[k] * RIDE_HEIGHT, py[k] + ny[k] * RIDE_HEIGHT, pz[k] + nz[k] * RIDE_HEIGHT];
  for (const st of steps) {
    if (st.jump) {
      const k = st.jump.fromNode, { speed, time, dir: d } = st.jump;
      const from = lifted(k);
      const pieces = Math.max(2, Math.ceil((speed * time) / 2));
      for (let i = 1; i < pieces; i++) {
        const t = (time * i) / pieces, f = i / pieces;
        raw.push({
          p: [from[0] + d[0] * speed * t, from[1] + d[1] * speed * t - 0.5 * GRAVITY * t * t, from[2] + d[2] * speed * t],
          // "Up" in the air: turn steadily from the take-off surface's normal to the landing's.
          n: unit([nx[k] * (1 - f) + nx[st.node] * f, ny[k] * (1 - f) + ny[st.node] * f, nz[k] * (1 - f) + nz[st.node] * f]),
          air: true, speed, gates: [],
        });
      }
    }
    raw.push({ p: lifted(st.node), n: [nx[st.node], ny[st.node], nz[st.node]], air: false, gates: st.gates });
  }

  // ---- 2. smooth the driven stretches ---------------------------------------
  // The graph path zigzags between nodes 2 units apart. Average each driven
  // point with its neighbours a few times; points in the air, the two ends
  // of each flight and the two ends of the route stay where they are.
  const fixed = raw.map((r, i) => r.air || i === 0 || i === raw.length - 1 || raw[i - 1].air || raw[i + 1].air);
  for (let pass = 0; pass < 8; pass++) {
    const next = raw.map((r) => r.p);
    for (let i = 1; i < raw.length - 1; i++) {
      if (fixed[i]) continue;
      const a = raw[i - 1].p, b = raw[i].p, c = raw[i + 1].p;
      next[i] = [(a[0] + 2 * b[0] + c[0]) / 4, (a[1] + 2 * b[1] + c[1]) / 4, (a[2] + 2 * b[2] + c[2]) / 4];
    }
    for (let i = 0; i < raw.length; i++) raw[i].p = next[i];
  }

  // ---- 3. one point per SPACING ---------------------------------------------
  const points = [raw[0].p], up = [raw[0].n], grounded = [true], airSpeed = [0];
  // pointOfRaw[i] = the route point at or just before raw entry i.
  const pointOfRaw = new Int32Array(raw.length);
  let carry = 0; // distance covered since the last point
  for (let i = 1; i < raw.length; i++) {
    const a = raw[i - 1], b = raw[i], seg = dist(a.p, b.p);
    let along = SPACING - carry;
    for (; along <= seg; along += SPACING) {
      const f = along / seg;
      points.push([a.p[0] + (b.p[0] - a.p[0]) * f, a.p[1] + (b.p[1] - a.p[1]) * f, a.p[2] + (b.p[2] - a.p[2]) * f]);
      up.push(unit([a.n[0] + (b.n[0] - a.n[0]) * f, a.n[1] + (b.n[1] - a.n[1]) * f, a.n[2] + (b.n[2] - a.n[2]) * f]));
      grounded.push(!(a.air || b.air));
      airSpeed.push(a.air ? a.speed : b.air ? b.speed : 0);
    }
    carry = seg - (along - SPACING);
    pointOfRaw[i] = points.length - 1;
  }
  const count = points.length;

  // ---- 4. directions --------------------------------------------------------
  const forward = [], left = [];
  for (let k = 0; k < count; k++) {
    const f = unit(sub(points[Math.min(count - 1, k + 2)], points[Math.max(0, k - 2)]));
    // Make `up` square to the direction of travel, then left = up x forward
    // (car frame: x = left, y = up, z = forward).
    const d = dot(up[k], f);
    up[k] = unit([up[k][0] - d * f[0], up[k][1] - d * f[1], up[k][2] - d * f[2]]);
    forward.push(f);
    left.push(cross(up[k], f));
  }

  // ---- 5. room to each side ---------------------------------------------------
  const edgeLeft = new Float32Array(count), edgeRight = new Float32Array(count);
  for (let k = 0; k < count; k++) {
    const room = roomBeside(mesh, points[k], left[k], up[k], grounded[k]);
    edgeLeft[k] = room.left; edgeRight[k] = room.right;
  }

  // ---- 6. curvature and slope -----------------------------------------------
  // Signed turn about `up` between the direction 8 units back and 8 units on,
  // per unit of route: + = the route bends left. 1 / |curvature| is the radius.
  const W = 8;
  const curvature = new Float32Array(count), slope = new Float32Array(count);
  for (let k = 0; k < count; k++) {
    slope[k] = forward[k][1]; // sine of the climb angle: +1 straight up
    if (k < W || k >= count - W) continue;
    const u = up[k];
    const flat = (v) => { const d = dot(v, u); return [v[0] - d * u[0], v[1] - d * u[1], v[2] - d * u[2]]; };
    const a = flat(sub(points[k], points[k - W])), b = flat(sub(points[k + W], points[k]));
    const la = Math.hypot(...a), lb = Math.hypot(...b);
    if (la < 1e-6 || lb < 1e-6) continue;
    // Angle from a to b, signed by which way it turns about `up`. Turning
    // towards `left` is positive.
    const sin = dot(cross(a, b), u) / (la * lb), cos = dot(a, b) / (la * lb);
    curvature[k] = Math.atan2(sin, cos) / W;
  }
  // (Sign: left = up x forward, so forward x left = up, and a direction that
  // swings towards `left` has a cross product along +up.)

  // ---- 7. gates and jumps as point numbers -----------------------------------
  const gateIndex = new Array(stages.length).fill(null);
  raw.forEach((r, i) => { for (const g of r.gates) gateIndex[g] = pointOfRaw[i]; });
  const jumps = [];
  for (let k = 0; k < count; k++) {
    if (grounded[k]) continue;
    if (k > 0 && !grounded[k - 1] && airSpeed[k] === airSpeed[k - 1]) jumps.at(-1).to = k;
    else jumps.push({ from: k, to: k, speed: airSpeed[k] });
  }

  return {
    ok, problem, reached, gates: stages.length, stages,
    points, forward, up, left, grounded, edgeLeft, edgeRight, curvature, slope,
    gateIndex, jumps, length: (count - 1) * SPACING, spacing: SPACING, surface: sf,
  };
}
