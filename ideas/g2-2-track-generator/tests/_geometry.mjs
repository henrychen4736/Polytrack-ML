// Geometry helpers for the tests in this folder, written by the tester and
// deliberately NOT built on pieces.mjs / check_pieces.mjs / generate.mjs: they
// read a track only through sim/track.mjs (the decoder the simulator's own
// loader mirrors), the game's collision triangles (data/init_0.6.3.json via
// sim/host.mjs) and sim/trackmesh.mjs ray casts. Nothing here is written to
// disk; all geometry is derived at run time.
import { loadCaptured } from '../../../sim/host.mjs';
import { decodeSaveString, parseTrack, rotate, ROTATIONS, PART_SIZE, loadPartConfigs, DETECTOR_FINISH, DETECTOR_CHECKPOINT } from '../../../sim/track.mjs';
import { buildTrackMesh } from '../../../sim/trackmesh.mjs';

let shapes = null;
/** Part type id -> Float32Array of collision triangles (9 numbers each), the part's own frame. */
export function partTriangles() {
  if (!shapes) { shapes = new Map(); for (const p of loadCaptured('init_0.6.3.json').trackParts) shapes.set(p.id, p.vertices); }
  return shapes;
}

/** Parts of a track, decoded from its save string. */
export const decodeParts = (trackData) => parseTrack(decodeSaveString(trackData)).parts;

/** A placed part's triangles in world units: array of [[x,y,z],[x,y,z],[x,y,z]]. */
export function worldTriangles(part) {
  const local = partTriangles().get(part.typeId), q = ROTATIONS[part.rotationAxis][part.rotation];
  const origin = [part.x * PART_SIZE, part.y * PART_SIZE, part.z * PART_SIZE];
  const out = [];
  for (let i = 0; i < local.length; i += 9) {
    out.push([0, 3, 6].map((o) => rotate([local[i + o], local[i + o + 1], local[i + o + 2]], q).map((v, k) => v + origin[k])));
  }
  return out;
}

/** One number per 1-unit voxel (tracks stay within +-8000 units of the origin). */
export const voxelKey = (x, y, z) => ((x + 8192) * 16384 + (y + 8192)) * 16384 + (z + 8192);

/**
 * The space a placed part's collision shape occupies, as a Set of 1-unit
 * voxels (one number per voxel, see voxelKey). Each triangle is sampled on a
 * grid of points about 0.45 units apart, and every sample is pulled 0.02 units
 * towards the part's own centre of mass first, so a surface that lies exactly
 * on the plane between two parts (the end face of a road piece) is counted on
 * its own part's side only.
 */
const voxelCache = new Map();
export function partVoxels(part) {
  // A part type in one rotation has the same shape wherever it is placed, and
  // parts sit on whole cells of 5 units, so the voxels are worked out once at
  // the origin and moved.
  const cacheKey = `${part.typeId},${part.rotationAxis},${part.rotation}`;
  let local = voxelCache.get(cacheKey);
  if (!local) {
    const tris = worldTriangles({ ...part, x: 0, y: 0, z: 0 });
    const c = [0, 0, 0]; let count = 0;
    for (const t of tris) for (const q of t) { c[0] += q[0]; c[1] += q[1]; c[2] += q[2]; count++; }
    for (let k = 0; k < 3; k++) c[k] /= count;
    const seen = new Set(); local = [];
    for (const [v0, v1, v2] of tris) {
      const longest = Math.max(Math.hypot(v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]), Math.hypot(v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]), Math.hypot(v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]));
      const n = Math.max(1, Math.ceil(longest / 0.45));
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
        const u = i / n, v = j / n, w = 1 - u - v;
        const q = [0, 1, 2].map((k) => v0[k] * w + v1[k] * u + v2[k] * v);
        const pull = Math.hypot(c[0] - q[0], c[1] - q[1], c[2] - q[2]) || 1;
        const cell = [0, 1, 2].map((k) => Math.floor(q[k] + (c[k] - q[k]) / pull * 0.02));
        const key = voxelKey(...cell);
        if (!seen.has(key)) { seen.add(key); local.push(cell); }
      }
    }
    voxelCache.set(cacheKey, local);
  }
  const ox = part.x * PART_SIZE, oy = part.y * PART_SIZE, oz = part.z * PART_SIZE;
  const voxels = new Set();
  for (const [x, y, z] of local) voxels.add(voxelKey(x + ox, y + oy, z + oz));
  return voxels;
}

/**
 * Our own overlap test for a track: every pair of parts whose collision
 * shapes share space. Returns [{ i, j, shared }] (indices into `parts`, number
 * of shared 1-unit voxels). Parts that only touch end to end share none.
 */
export function overlappingParts(parts) {
  const owner = new Map();   // voxel -> index of the first part found there
  const pairs = new Map();
  parts.forEach((part, i) => {
    for (const v of partVoxels(part)) {
      const other = owner.get(v);
      if (other === undefined) owner.set(v, i);
      else if (other !== i) { const key = `${other},${i}`; pairs.set(key, (pairs.get(key) ?? 0) + 1); }
    }
  });
  return [...pairs].map(([key, shared]) => { const [i, j] = key.split(',').map(Number); return { i, j, shared }; });
}

/** Start parts, checkpoint parts and finish parts of a decoded track, by the game's own part data. */
export function gatesOf(parts) {
  const configs = loadPartConfigs();
  const starts = parts.filter((p) => configs.get(p.typeId).startOffset != null);
  const checkpoints = parts.filter((p) => configs.get(p.typeId).detector?.type === DETECTOR_CHECKPOINT);
  const finishes = parts.filter((p) => configs.get(p.typeId).detector?.type === DETECTOR_FINISH);
  return { starts, checkpoints, finishes };
}

/** World-axis box { center, size } of a gate part's detector. */
export function detectorBox(part) {
  const det = loadPartConfigs().get(part.typeId).detector, q = ROTATIONS[part.rotationAxis][part.rotation];
  const c = rotate(det.center, q);
  return { center: [part.x * PART_SIZE + c[0], part.y * PART_SIZE + c[1], part.z * PART_SIZE + c[2]], size: rotate(det.size, q).map(Math.abs) };
}

/** The collision mesh of a track (sim/trackmesh.mjs): { raycast, raycastFar, triangles }. */
export const meshOf = (trackData) => buildTrackMesh(trackData);

// surfaceBelow and watchLap were written here by the tester and moved, unchanged,
// to ideas/shared/track_info.mjs in phase 2 (other folders need the same
// "is there road under the car" check). They never depended on the generator.
export { surfaceBelow, watchLap } from '../../shared/track_info.mjs';
