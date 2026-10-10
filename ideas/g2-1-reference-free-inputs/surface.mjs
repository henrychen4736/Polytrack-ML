// The track's surfaces as a graph of points a car could be standing on.
//
// sim/trackmesh.mjs gives every collision triangle of a track. A triangle
// soup cannot be path-searched directly: neighbouring parts do not share
// vertices (a block's top is two big triangles, the road piece beside it has a
// finely divided edge), and triangle sizes range from 0.1 to 28 units. So the
// surfaces are re-sampled here into NODES about SPACING units apart, each
// with the surface normal, and nodes are joined when they are close together
// AND face nearly the same way. The second condition is what separates road
// from wall (90 degrees apart) while keeping a loop or a banked wall ride in
// one piece (a 1.5-unit step round a loop of radius 15 turns the normal by 6
// degrees).
//
//   const surface = buildSurface(mesh);         // mesh from loadTrackInfo(track).mesh
//   surface.count, surface.px/py/pz, surface.nx/ny/nz
//   surface.adjStart, surface.adj               // neighbours of node k: adj[adjStart[k] .. adjStart[k+1])
//   surface.edge[k]                             // distance from node k to where its surface ends (capped)
//   surface.out[3k..3k+2]                       // for a rim node: unit direction pointing off the surface
//   surface.near(position, radius)              // nodes within radius of a point
//
// Nothing here knows about checkpoints, cars or laps.

/** Distance between nodes, world units. A road is 13 units wide between its
 *  kerbs, so 6 or 7 nodes across at 2. Measured on the 17 official tracks: at
 *  1.5 the largest (summer4, summer5) came to 1.4 million nodes and 33 s to
 *  build on a busy machine; 2 gives a little over half the nodes. */
export const SPACING = 2;
/** Two nodes are joined when closer than this ... */
const LINK_DISTANCE = 1.75 * SPACING;
/** ... and their normals differ by less than acos(0.8) = 37 degrees. */
const LINK_NORMAL = 0.8;
/** edge[] stops counting at this distance: "far from any edge". */
export const EDGE_CAP = 12;

const VOXEL = SPACING;

/**
 * A map from an integer grid cell (x, y, z) to one integer, on typed arrays.
 * A JavaScript Map did this at first and took most of the build time (tens
 * of millions of lookups per track); this open-addressing table is several
 * times faster. Values must be >= 0; get() returns -1 for "not there".
 */
class CellMap {
  constructor(expected) {
    let size = 1024;
    while (size < 2 * expected) size *= 2;
    this._alloc(size);
  }
  _alloc(size) {
    this.mask = size - 1;
    this.kx = new Int32Array(size); this.ky = new Int32Array(size); this.kz = new Int32Array(size);
    this.value = new Int32Array(size).fill(-1);
    this.used = 0;
  }
  _slot(x, y, z) {
    // Mix the three coordinates thoroughly (the last three lines are the
    // murmur3 finaliser). A plain multiply-and-xor left neighbouring cells in
    // neighbouring slots, and looking up the mostly EMPTY cells around a node
    // then walked long runs of occupied slots: 13.6 s of a 17.7 s build.
    let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791);
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h = (h ^ (h >>> 16)) & this.mask;
    while (this.value[h] !== -1 && (this.kx[h] !== x || this.ky[h] !== y || this.kz[h] !== z)) h = (h + 1) & this.mask;
    return h;
  }
  get(x, y, z) { return this.value[this._slot(x, y, z)]; }
  set(x, y, z, v) {
    let h = this._slot(x, y, z);
    if (this.value[h] === -1) {
      if (2 * ++this.used > this.mask) { // more than half full: double and refill
        const { kx, ky, kz, value } = this;
        this._alloc(2 * (this.mask + 1));
        for (let i = 0; i < value.length; i++) if (value[i] !== -1) this.set(kx[i], ky[i], kz[i], value[i]);
        h = this._slot(x, y, z);
        this.used++;
      }
      this.kx[h] = x; this.ky[h] = y; this.kz[h] = z;
    }
    this.value[h] = v;
  }
}

/**
 * Build the surface graph of a track mesh ({ triangles, count }).
 */
export function buildSurface(mesh) {
  const T = mesh.triangles;
  // ---- 1. sample every triangle, merging samples that share a voxel --------
  // Node arrays grow as needed.
  let cap = 1 << 18, count = 0;
  let px = new Float32Array(cap), py = new Float32Array(cap), pz = new Float32Array(cap);
  let nx = new Float32Array(cap), ny = new Float32Array(cap), nz = new Float32Array(cap);
  let weight = new Float32Array(cap);
  const grow = () => {
    cap *= 2;
    const g = (a) => { const b = new Float32Array(cap); b.set(a); return b; };
    px = g(px); py = g(py); pz = g(pz); nx = g(nx); ny = g(ny); nz = g(nz); weight = g(weight);
  };
  // voxel -> first node in it; nextInVoxel chains nodes that share a voxel but
  // face different ways (the top and the underside of a 0.2-unit plate).
  const voxels = new CellMap(1 << 18);
  let nextInVoxel = new Int32Array(cap);
  const addSample = (x, y, z, a, b, c) => {
    const vx = Math.floor(x / VOXEL), vy = Math.floor(y / VOXEL), vz = Math.floor(z / VOXEL);
    const k = voxels.get(vx, vy, vz);
    for (let j = k; j >= 0; j = nextInVoxel[j]) {
      if (nx[j] * a + ny[j] * b + nz[j] * c > 0.9 * Math.sqrt(nx[j] * nx[j] + ny[j] * ny[j] + nz[j] * nz[j])) {
        // Same surface: the node is the average of its samples.
        px[j] += x; py[j] += y; pz[j] += z; nx[j] += a; ny[j] += b; nz[j] += c; weight[j]++;
        return;
      }
    }
    if (count === cap) { grow(); const n2 = new Int32Array(cap); n2.set(nextInVoxel); nextInVoxel = n2; }
    px[count] = x; py[count] = y; pz[count] = z; nx[count] = a; ny[count] = b; nz[count] = c; weight[count] = 1;
    nextInVoxel[count] = k;
    voxels.set(vx, vy, vz, count++);
  };
  for (let t = 0; t < mesh.count; t++) {
    const o = t * 9;
    const ax = T[o], ay = T[o + 1], az = T[o + 2];
    const ux = T[o + 3] - ax, uy = T[o + 4] - ay, uz = T[o + 5] - az;
    const vx = T[o + 6] - ax, vy = T[o + 7] - ay, vz = T[o + 8] - az;
    // Normal from the winding. The game's parts are wound so that this points
    // out of the solid (checked in validate.mjs: under the human's wheels the
    // node normal agrees with the car's own "up").
    let a = uy * vz - uz * vy, b = uz * vx - ux * vz, c = ux * vy - uy * vx;
    const area2 = Math.hypot(a, b, c);
    if (area2 < 1e-6) continue; // a sliver with no area
    a /= area2; b /= area2; c /= area2;
    const longest = Math.max(Math.hypot(ux, uy, uz), Math.hypot(vx, vy, vz), Math.hypot(ux - vx, uy - vy, uz - vz));
    // A lattice over the triangle, a little finer than the voxels. A voxel
    // it steps over now and then does not matter: nodes are joined across
    // LINK_DISTANCE, which is wider than one voxel.
    const n = Math.max(1, Math.ceil(longest / (0.7 * SPACING)));
    for (let i = 0; i <= n; i++) for (let j = 0; i + j <= n; j++) {
      // Pulled 1% towards the centroid so a sample on a shared edge does not
      // fall into the neighbouring voxel by rounding.
      const s = 0.99 * (i / n) + 0.01 / 3, r = 0.99 * (j / n) + 0.01 / 3;
      addSample(ax + s * ux + r * vx, ay + s * uy + r * vy, az + s * uz + r * vz, a, b, c);
    }
  }
  for (let k = 0; k < count; k++) {
    px[k] /= weight[k]; py[k] /= weight[k]; pz[k] /= weight[k];
    const l = Math.hypot(nx[k], ny[k], nz[k]);
    nx[k] /= l; ny[k] /= l; nz[k] /= l;
  }
  px = px.subarray(0, count); py = py.subarray(0, count); pz = pz.subarray(0, count);
  nx = nx.subarray(0, count); ny = ny.subarray(0, count); nz = nz.subarray(0, count);

  // ---- 2. a grid over the nodes, for "which nodes are near here?" ----------
  const CELL = LINK_DISTANCE;
  const cells = new CellMap(count);
  const cellNext = new Int32Array(count);
  for (let k = 0; k < count; k++) {
    const x = Math.floor(px[k] / CELL), y = Math.floor(py[k] / CELL), z = Math.floor(pz[k] / CELL);
    cellNext[k] = cells.get(x, y, z);
    cells.set(x, y, z, k);
  }
  /** Nodes within `radius` of a point, as an array of node numbers. */
  function near(p, radius) {
    const out = [];
    const lo = [0, 1, 2].map((i) => Math.floor((p[i] - radius) / CELL)), hi = [0, 1, 2].map((i) => Math.floor((p[i] + radius) / CELL));
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
      for (let j = cells.get(x, y, z); j >= 0; j = cellNext[j]) {
        if (Math.hypot(px[j] - p[0], py[j] - p[1], pz[j] - p[2]) <= radius) out.push(j);
      }
    }
    return out;
  }

  // ---- 3. join neighbours ---------------------------------------------------
  const adjStart = new Int32Array(count + 1);
  const lists = new Array(count);
  let links = 0;
  for (let k = 0; k < count; k++) {
    const mine = [];
    const cx = Math.floor(px[k] / CELL), cy = Math.floor(py[k] / CELL), cz = Math.floor(pz[k] / CELL);
    for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) for (let z = cz - 1; z <= cz + 1; z++) {
      for (let j = cells.get(x, y, z); j >= 0; j = cellNext[j]) {
        if (j === k) continue;
        const dx = px[j] - px[k], dy = py[j] - py[k], dz = pz[j] - pz[k];
        // (Math.sqrt, not Math.hypot: hypot is some 20 times slower in V8,
        // and this line runs a hundred million times on a large track.)
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > LINK_DISTANCE * LINK_DISTANCE || nx[j] * nx[k] + ny[j] * ny[k] + nz[j] * nz[k] < LINK_NORMAL) continue;
        const d = Math.sqrt(d2);
        // The neighbour must lie ALONG the surface, not above or below it: a
        // step in a staircase of plates has the same normal on both treads.
        if (Math.abs(dx * nx[k] + dy * ny[k] + dz * nz[k]) > 0.45 * d + 0.15) continue;
        mine.push(j);
      }
    }
    lists[k] = mine;
    links += mine.length;
  }
  const adj = new Int32Array(links);
  for (let k = 0, o = 0; k < count; k++) { adjStart[k] = o; for (const j of lists[k]) adj[o++] = j; adjStart[k + 1] = o; }

  // ---- 4. rims: nodes where the surface ends --------------------------------
  // Look at the directions to a node's neighbours, within the surface. In the
  // middle of a surface they come from all round. On a rim there is a gap of
  // half a turn or more with no neighbour in it; the middle of that gap is
  // the direction pointing off the surface (`out`).
  const out = new Float32Array(3 * count);
  const edge = new Float32Array(count).fill(EDGE_CAP);
  const rim = [];
  for (let k = 0; k < count; k++) {
    const a = nx[k], b = ny[k], c = nz[k];
    // Two unit vectors spanning the surface at this node.
    let ex, ey, ez;
    if (Math.abs(b) < 0.9) { ex = c; ey = 0; ez = -a; } else { ex = 0; ey = -c; ez = b; }
    const el = Math.hypot(ex, ey, ez); ex /= el; ey /= el; ez /= el;
    const fx = b * ez - c * ey, fy = c * ex - a * ez, fz = a * ey - b * ex;
    const angles = [];
    for (let o = adjStart[k]; o < adjStart[k + 1]; o++) {
      const j = adj[o];
      const dx = px[j] - px[k], dy = py[j] - py[k], dz = pz[j] - pz[k];
      angles.push(Math.atan2(dx * fx + dy * fy + dz * fz, dx * ex + dy * ey + dz * ez));
    }
    angles.sort((p, q) => p - q);
    let gap = angles.length ? 0 : 2 * Math.PI, mid = 0;
    for (let i = 0; i < angles.length; i++) {
      const next = i + 1 < angles.length ? angles[i + 1] : angles[0] + 2 * Math.PI;
      if (next - angles[i] > gap) { gap = next - angles[i]; mid = angles[i] + gap / 2; }
    }
    // 150 degrees: a straight rim leaves a gap of 180; an inside corner 90.
    if (gap > (150 * Math.PI) / 180) {
      edge[k] = 0;
      rim.push(k);
      out[3 * k] = Math.cos(mid) * ex + Math.sin(mid) * fx;
      out[3 * k + 1] = Math.cos(mid) * ey + Math.sin(mid) * fy;
      out[3 * k + 2] = Math.cos(mid) * ez + Math.sin(mid) * fz;
    }
  }
  // Distance to the nearest rim, along the surface, up to EDGE_CAP. Rims are
  // spread outward a ring at a time; because steps are nearly equal this
  // simple relaxation is within about a step of the true distance.
  let frontier = rim.slice();
  while (frontier.length) {
    const next = [];
    for (const k of frontier) {
      for (let o = adjStart[k]; o < adjStart[k + 1]; o++) {
        const j = adj[o];
        const d = edge[k] + Math.sqrt((px[j] - px[k]) ** 2 + (py[j] - py[k]) ** 2 + (pz[j] - pz[k]) ** 2);
        if (d < edge[j] - 1e-3) { edge[j] = d; next.push(j); }
      }
    }
    frontier = next;
  }

  return { count, px, py, pz, nx, ny, nz, adjStart, adj, edge, out, rim, near };
}
