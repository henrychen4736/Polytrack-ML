// Track decoding and the "reward path".
//
// Stage 2, step 1. This file turns a track (the string the game passes to its
// simulation worker) into things a controller can use:
//
//   decodeSaveString(str)  -> raw track bytes
//   parseTrack(bytes)      -> list of placed parts (type, grid position, rotation, ...)
//   buildPath(parts)       -> start pose, ordered checkpoint/finish gates, and a
//                             polyline from the start through every gate
//
// Coordinates: parts sit on an integer grid; one grid cell is PART_SIZE = 5
// world units. y is up. World positions here are in the same units the car
// state reports (see sim/state.mjs), so they can be compared directly.
import zlib from 'node:zlib';
import { decodeBits } from '../vendor/polyrl/node/track_codec.mjs';
import { loadCaptured } from './host.mjs';

/** World units per grid cell (the game's `partSize`). */
export const PART_SIZE = 5;

// ---------------------------------------------------------------------------
// 1. Save string -> bytes
// ---------------------------------------------------------------------------

/**
 * Decode a track "save string" into its raw bytes.
 *
 * The game wraps the bytes twice: bytes -> deflate -> custom base62 text ->
 * deflate -> custom base62 text. We undo that in reverse. `decodeBits` is
 * polyrl's port of the game's base62 bit-unpacker.
 */
export function decodeSaveString(saveString) {
  const outer = decodeBits(saveString);
  if (!outer) throw new Error('track string: outer base62 layer is invalid');
  const innerText = zlib.inflateSync(outer).toString('utf8');
  const inner = decodeBits(innerText);
  if (!inner) throw new Error('track string: inner base62 layer is invalid');
  return zlib.inflateSync(inner);
}

// ---------------------------------------------------------------------------
// 2. Part configurations (what each part type is)
// ---------------------------------------------------------------------------

/** Detector kinds, as the game numbers them in its Init message. */
export const DETECTOR_CHECKPOINT = 0;
export const DETECTOR_FINISH = 1;

let partConfigCache = null;

/**
 * Per-part-type facts we need, keyed by part type id, taken from the Init
 * message captured from the real client (data/init_0.6.3.json):
 *
 *   detector     null, or { type, center:[x,y,z], size:[x,y,z] }: the invisible
 *                box that registers a checkpoint or the finish. `center` is
 *                relative to the part's own origin, before rotation.
 *   startOffset  null, or [x,y,z]: where the car spawns relative to a start
 *                part's origin, before rotation.
 */
export function loadPartConfigs() {
  if (!partConfigCache) {
    partConfigCache = new Map();
    for (const p of loadCaptured('init_0.6.3.json').trackParts) {
      partConfigCache.set(p.id, { detector: p.detector, startOffset: p.startOffset });
    }
  }
  return partConfigCache;
}

// ---------------------------------------------------------------------------
// 3. Bytes -> placed parts
// ---------------------------------------------------------------------------

/**
 * Parse raw track bytes into a list of placed parts. This mirrors the game's
 * own parser (function `wo` in the worker bundle). Layout, all little-endian:
 *
 *   u8   environment (Summer / Winter / Desert)
 *   u8   sun direction
 *   i32  x offset, i32 y offset, i32 z offset   (added to every coordinate)
 *   u8   coordinate widths: bits 0-1 = bytes per x, 2-3 = per y, 4-5 = per z
 *   then, repeated until the end of the data:
 *     u8   part type id
 *     u32  how many parts of this type follow
 *     per part:
 *       x, y, z            (unsigned, widths from above; add the offsets)
 *       u8   bits 0-1 = rotation (quarter turns 0..3), bits 2-4 = rotation axis (0..5)
 *       u8   colour
 *       u16  checkpointOrder   only if this part type is a checkpoint
 *       u32  startOrder        only if this part type is a start
 *
 * Returns { environment, parts: [{ typeId, x, y, z, rotation, rotationAxis,
 * checkpointOrder, startOrder }] } with x/y/z in grid cells.
 */
export function parseTrack(bytes, partConfigs = loadPartConfigs()) {
  let i = 0;
  const u8 = () => bytes[i++];
  // Read an unsigned little-endian integer that is `width` bytes long.
  const uint = (width) => { let v = 0; for (let k = 0; k < width; k++) v += bytes[i++] * 2 ** (8 * k); return v; };
  // Same, but 4 bytes interpreted as signed (the `| 0` wraps to int32).
  const i32 = () => uint(4) | 0;

  const environment = u8();
  u8(); // sun direction: only affects lighting
  const offX = i32(), offY = i32(), offZ = i32();
  const widths = u8();
  const wx = widths & 3, wy = (widths >> 2) & 3, wz = (widths >> 4) & 3;

  const parts = [];
  while (i < bytes.length) {
    const typeId = u8();
    const cfg = partConfigs.get(typeId);
    if (!cfg) throw new Error(`track contains unknown part type ${typeId}`);
    const isCheckpoint = cfg.detector?.type === DETECTOR_CHECKPOINT;
    const isStart = cfg.startOffset != null;
    const count = uint(4);
    for (let n = 0; n < count; n++) {
      const x = uint(wx) + offX, y = uint(wy) + offY, z = uint(wz) + offZ;
      const rot = u8();
      u8(); // colour: cosmetic
      const checkpointOrder = isCheckpoint ? uint(2) : null;
      const startOrder = isStart ? uint(4) : null;
      parts.push({ typeId, x, y, z, rotation: rot & 3, rotationAxis: (rot >> 2) & 7, checkpointOrder, startOrder });
    }
  }
  // The format has no length field or checksum; landing exactly on the end of
  // the data is the only sign we read every field with the right width.
  if (i !== bytes.length) throw new Error('track data ended in the middle of a part');
  return { environment, parts };
}

// ---------------------------------------------------------------------------
// 4. Rotations
// ---------------------------------------------------------------------------

// The game does not compute part rotations; it looks them up in a fixed table
// (`eo` in the bundle) of quaternions [x, y, z, w], indexed
// ROTATIONS[rotationAxis][rotation]. Axis 0 is "Y up" (a normal part on the
// ground, turned 0/90/180/270 degrees); axes 1-5 are parts flipped upside down
// or stood on a side (used for wall rides and ceilings). Copied verbatim so our
// geometry matches the game's exactly.
const H = Math.SQRT1_2; // 0.7071..., sin and cos of 45 degrees
export const ROTATIONS = [
  [[0, 0, 0, 1], [0, H, 0, H], [0, 1, 0, 0], [0, H, 0, -H]],                    // 0: Y positive
  [[0, 0, 1, 0], [H, 0, H, 0], [1, 0, 0, 0], [H, 0, -H, 0]],                    // 1: Y negative
  [[0, 0, -H, H], [0.5, 0.5, -0.5, 0.5], [H, H, 0, 0], [0.5, 0.5, 0.5, -0.5]],  // 2: X positive
  [[0, 0, H, H], [0.5, -0.5, 0.5, 0.5], [H, -H, 0, 0], [0.5, -0.5, -0.5, -0.5]], // 3: X negative
  [[H, 0, 0, H], [0.5, 0.5, 0.5, 0.5], [0, H, H, 0], [-0.5, 0.5, 0.5, -0.5]],   // 4: Z positive
  [[-H, 0, 0, H], [-0.5, -0.5, 0.5, 0.5], [0, -H, H, 0], [0.5, -0.5, 0.5, -0.5]], // 5: Z negative
];

/** Rotate vector v = [x, y, z] by unit quaternion q = [x, y, z, w]. */
export function rotate(v, q) {
  const [x, y, z] = v, [qx, qy, qz, qw] = q;
  // Standard identity: v' = v + 2w(u x v) + 2 u x (u x v), with u = (qx, qy, qz).
  const cx = qy * z - qz * y, cy = qz * x - qx * z, cz = qx * y - qy * x;
  const dx = qy * cz - qz * cy, dy = qz * cx - qx * cz, dz = qx * cy - qy * cx;
  return [x + 2 * (qw * cx + dx), y + 2 * (qw * cy + dy), z + 2 * (qw * cz + dz)];
}

/** Quaternion product a * b: the rotation "b first, then a". */
function quatMultiply(a, b) {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

// ---------------------------------------------------------------------------
// 5. Placed parts -> path
// ---------------------------------------------------------------------------

/**
 * Build the reward path for a parsed track.
 *
 * Returns:
 *   start   { position:[x,y,z], quaternion:[x,y,z,w] }  where the car spawns
 *   gates   checkpoints in the order they must be taken, then the finish. Each:
 *           { order, isFinish, center:[x,y,z], size:[x,y,z], alternatives }
 *   points  [start.position, gate 0 centre, gate 1 centre, ...]
 *   cumulative  cumulative[k] = path length from the start to points[k]
 *   length  total path length
 *
 * This is deliberately crude: straight lines between gate centres. It says
 * which way the track goes, not where the road is, so a segment may cut across
 * a corner or a wall. Step 2 will show whether that is good enough to steer by.
 */
export function buildPath({ parts }, partConfigs = loadPartConfigs()) {
  // --- start pose ---------------------------------------------------------
  // A track may hold several start parts; the game uses the one with the
  // highest startOrder (the most recently placed).
  let startPart = null;
  for (const p of parts) {
    if (p.startOrder != null && (!startPart || p.startOrder >= startPart.startOrder)) startPart = p;
  }
  if (!startPart) throw new Error('track has no start');
  // The car faces the opposite way to the start part's own forward axis, so the
  // game composes the part rotation with a half turn about the vertical.
  const HALF_TURN_Y = [0, 1, 0, 0];
  const startQuat = quatMultiply(ROTATIONS[startPart.rotationAxis][startPart.rotation], HALF_TURN_Y);
  const startOffset = rotate(partConfigs.get(startPart.typeId).startOffset, startQuat);
  const start = {
    position: [0, 1, 2].map((k) => [startPart.x, startPart.y, startPart.z][k] * PART_SIZE + startOffset[k]),
    quaternion: startQuat,
  };

  // --- gates --------------------------------------------------------------
  // Every part with a detector becomes a candidate gate: its detector box,
  // moved and rotated into world space.
  const candidates = [];
  for (const p of parts) {
    const det = partConfigs.get(p.typeId).detector;
    if (!det) continue;
    const q = ROTATIONS[p.rotationAxis][p.rotation];
    const c = rotate(det.center, q);
    candidates.push({
      isFinish: det.type === DETECTOR_FINISH,
      order: p.checkpointOrder,
      center: [p.x * PART_SIZE + c[0], p.y * PART_SIZE + c[1], p.z * PART_SIZE + c[2]],
      // Rotating the box's extents by a multiple of 90 degrees only permutes
      // and flips them, so the absolute value gives the world-aligned size.
      size: rotate(det.size, q).map(Math.abs),
    });
  }

  // Checkpoints are taken in increasing `order`. Several checkpoints can share
  // one order (the builder then accepts any of them), and a track can have
  // several finish parts, so group candidates into stages first.
  const orders = [...new Set(candidates.filter((g) => !g.isFinish).map((g) => g.order))].sort((a, b) => a - b);
  const stages = orders.map((o) => candidates.filter((g) => !g.isFinish && g.order === o));
  const finishes = candidates.filter((g) => g.isFinish);
  if (!finishes.length) throw new Error('track has no finish');
  stages.push(finishes);

  // Walk the stages, and where a stage offers a choice take the gate nearest
  // to where the path currently is. `alternatives` records how many there were.
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const gates = [];
  let here = start.position;
  for (const stage of stages) {
    const gate = stage.reduce((best, g) => (dist(g.center, here) < dist(best.center, here) ? g : best));
    gates.push({ ...gate, alternatives: stage.length });
    here = gate.center;
  }

  // --- polyline -----------------------------------------------------------
  const points = [start.position, ...gates.map((g) => g.center)];
  const cumulative = [0];
  for (let k = 1; k < points.length; k++) cumulative.push(cumulative[k - 1] + dist(points[k - 1], points[k]));
  return { start, gates, points, cumulative, length: cumulative.at(-1) };
}

/** Convenience: track save string -> path. */
export function pathFromSaveString(saveString) {
  return buildPath(parseTrack(decodeSaveString(saveString)));
}
