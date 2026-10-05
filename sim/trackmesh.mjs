// The track as solid geometry, and "how much room is there beside the line?"
//
// Until now the agent only knew the reference line: where the human drove.
// It had no idea how wide the road was or where the walls were, so it could
// not tell a safe wobble from a wall scrape. This file gives it that:
//
//   buildTrackMesh(trackData)   every collision triangle of the track, in
//                               world coordinates, in a grid for fast lookup
//   mesh.raycast(from, dir, max) distance to the first surface along a ray
//   clearanceProfile(mesh, line) for each point of a reference line, the
//                               distance to the edge of the road on the left
//                               and on the right
//
// Where the geometry comes from: the Init message captured from the real game
// (data/init_0.6.3.json) contains, for each of the 186 part types, the exact
// triangles the physics collides with. A track is a list of placed parts
// (sim/track.mjs); each part's triangles are turned by the part's rotation and
// moved to its grid position (one grid cell = 5 units). This is the same
// transform that sim/track.mjs uses for checkpoints, which was checked against
// real laps.
import { loadCaptured } from './host.mjs';
import { decodeSaveString, parseTrack, rotate, PART_SIZE, ROTATIONS } from './track.mjs';

/** Side of a grid cell used to find triangles near a ray, in world units. */
const CELL = 5;

let partTrianglesCache = null;
/** Part type id -> Float32Array of that part's triangles (9 numbers each: three corners x,y,z). */
function loadPartTriangles() {
  if (!partTrianglesCache) {
    partTrianglesCache = new Map();
    for (const p of loadCaptured('init_0.6.3.json').trackParts) partTrianglesCache.set(p.id, p.vertices);
  }
  return partTrianglesCache;
}

const cellKey = (x, y, z) => `${x},${y},${z}`;

/**
 * Build the track's collision mesh.
 * Returns { triangles, count, raycast }.
 *   triangles  Float32Array, 9 numbers per triangle, world coordinates
 */
export function buildTrackMesh(trackData) {
  const { parts } = parseTrack(decodeSaveString(trackData));
  const shapes = loadPartTriangles();
  let total = 0;
  for (const p of parts) total += shapes.get(p.typeId).length;
  const triangles = new Float32Array(total);
  let o = 0;
  for (const p of parts) {
    const local = shapes.get(p.typeId);
    const q = ROTATIONS[p.rotationAxis][p.rotation];
    const ox = p.x * PART_SIZE, oy = p.y * PART_SIZE, oz = p.z * PART_SIZE;
    for (let i = 0; i < local.length; i += 3) {
      const v = rotate([local[i], local[i + 1], local[i + 2]], q);
      triangles[o++] = v[0] + ox; triangles[o++] = v[1] + oy; triangles[o++] = v[2] + oz;
    }
  }

  // Grid: each triangle is listed in every cell its bounding box touches, so
  // a ray only has to test the triangles in the cells it passes near.
  const grid = new Map();
  const count = total / 9;
  for (let t = 0; t < count; t++) {
    const b = t * 9;
    const lo = [0, 1, 2].map((k) => Math.floor(Math.min(triangles[b + k], triangles[b + 3 + k], triangles[b + 6 + k]) / CELL));
    const hi = [0, 1, 2].map((k) => Math.floor(Math.max(triangles[b + k], triangles[b + 3 + k], triangles[b + 6 + k]) / CELL));
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
      const key = cellKey(x, y, z);
      let list = grid.get(key);
      if (!list) grid.set(key, (list = []));
      list.push(t);
    }
  }

  /**
   * Distance from \`from\` along the unit vector \`dir\` to the first triangle,
   * or Infinity if there is none within \`max\`. Both sides of a triangle count.
   * (Moller-Trumbore ray/triangle test.)
   */
  function raycast(from, dir, max) {
    // Cells covered by the ray's bounding box. Rays here are short (tens of
    // units), so this is a handful of cells.
    const end = [from[0] + dir[0] * max, from[1] + dir[1] * max, from[2] + dir[2] * max];
    const lo = [0, 1, 2].map((k) => Math.floor(Math.min(from[k], end[k]) / CELL));
    const hi = [0, 1, 2].map((k) => Math.floor(Math.max(from[k], end[k]) / CELL));
    let best = Infinity;
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
      const list = grid.get(cellKey(x, y, z));
      if (!list) continue;
      for (const t of list) {
        const b = t * 9;
        const ax = triangles[b], ay = triangles[b + 1], az = triangles[b + 2];
        const e1x = triangles[b + 3] - ax, e1y = triangles[b + 4] - ay, e1z = triangles[b + 5] - az;
        const e2x = triangles[b + 6] - ax, e2y = triangles[b + 7] - ay, e2z = triangles[b + 8] - az;
        const px = dir[1] * e2z - dir[2] * e2y, py = dir[2] * e2x - dir[0] * e2z, pz = dir[0] * e2y - dir[1] * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (det > -1e-9 && det < 1e-9) continue; // ray parallel to the triangle
        const inv = 1 / det;
        const sx = from[0] - ax, sy = from[1] - ay, sz = from[2] - az;
        const u = (sx * px + sy * py + sz * pz) * inv;
        if (u < 0 || u > 1) continue;
        const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
        const v = (dir[0] * qx + dir[1] * qy + dir[2] * qz) * inv;
        if (v < 0 || u + v > 1) continue;
        const dist = (e2x * qx + e2y * qy + e2z * qz) * inv;
        if (dist > 1e-6 && dist < best) best = dist;
      }
    }
    return best <= max ? best : Infinity;
  }

  return { triangles, count, raycast };
}

/** Furthest distance, in units, that clearance is measured to. Anything
 *  further reads as this value: "plenty of room". */
export const MAX_CLEARANCE = 20;

/**
 * For every point of a reference line: how far is it to the edge of the road
 * on the left and on the right?
 *
 * "Edge" means whichever comes first, going sideways from the line point:
 *   - a wall or obstacle (a sideways ray at body height hits something), or
 *   - the end of the road surface (a short ray straight down no longer finds
 *     ground: an open edge with a drop beyond it).
 * Sideways, up and down are taken from how the human's car was oriented at
 * that point, so this also works on banked road and wall rides.
 *
 * Where the human was in the air there is no road underneath to measure, so
 * only the wall test applies there.
 *
 * Returns { left, right }: two Float32Arrays with one distance per line point.
 */
export function clearanceProfile(mesh, line) {
  const n = line.points.length;
  const left = new Float32Array(n), right = new Float32Array(n);
  // Sideways rays start a little above the car's origin so that they pass over
  // the road surface itself but still hit kerbs, barriers and walls.
  const BODY_HEIGHTS = [0.15, 0.6];
  // How far apart the "is there still road here?" probes are, going sideways.
  const STEP = 0.5;

  for (let k = 0; k < n; k++) {
    const p = line.points[k], q = line.quaternions[k];
    const leftDir = rotate([1, 0, 0], q), up = rotate([0, 1, 0], q);
    const down = [-up[0], -up[1], -up[2]];
    for (const side of [1, -1]) {
      const dir = [leftDir[0] * side, leftDir[1] * side, leftDir[2] * side];
      // Walls: the nearest hit of the sideways rays.
      let edge = MAX_CLEARANCE;
      for (const h of BODY_HEIGHTS) {
        const from = [p[0] + up[0] * h, p[1] + up[1] * h, p[2] + up[2] * h];
        edge = Math.min(edge, mesh.raycast(from, dir, MAX_CLEARANCE));
      }
      // Open edges: step sideways until the probes straight down stop finding
      // road within 1.5 units below the car's height.
      //   - Only where there is road directly under the line point itself;
      //     otherwise (a take-off lip, a seam) there is nothing to measure from.
      //   - Two misses in a row are needed, so a hairline gap between two
      //     parts is not mistaken for the end of the road.
      const roadBelow = (d) => mesh.raycast([p[0] + dir[0] * d + up[0] * 0.5, p[1] + dir[1] * d + up[1] * 0.5, p[2] + dir[2] * d + up[2] * 0.5], down, 2) !== Infinity;
      if (line.grounded[k] && roadBelow(0)) {
        let misses = 0;
        for (let d = STEP; d < edge; d += STEP) {
          if (roadBelow(d)) { misses = 0; continue; }
          if (++misses === 2) { edge = d - 1.5 * STEP; break; }
        }
      }
      (side === 1 ? left : right)[k] = edge;
    }
  }
  return { left, right };
}
