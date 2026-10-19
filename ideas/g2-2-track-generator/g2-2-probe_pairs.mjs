// Which placements of two parts make one piece of road? The search behind
// the wide-road composites in g2-2-features.mjs.
//
//   node ideas/g2-2-track-generator/g2-2-probe_pairs.mjs 10 10       # StraightWide beside StraightWide
//   node ideas/g2-2-track-generator/g2-2-probe_pairs.mjs 94 95       # the two halves of the short wide turn
//
// Part A (first id) stays at the origin, unturned; part B (second id) is
// tried at every offset within 12 cells and every rotation. A placement is
// printed when the two do not share a grid cell and their ports mate
// (check_pieces.mjs matePorts), with the openings left over ("ends", joined
// where they lie side by side on one plane): [axis,plane,out width centre
// height count]. A placement that leaves exactly two ends is a usable piece;
// e.g. "StraightWide + StraightWide at -4,0 rot 2" leaves two 31.13-unit ends.
// No simulator; a few seconds. Geometry only, nothing is written.
import { loadPieceTable, worldTiles } from './pieces.mjs';
import { matePorts } from './check_pieces.mjs';
const table = loadPieceTable();
const ids = process.argv.slice(2).map(Number);
const name = (id) => table.get(id).name;
// merge unmated ports into ends: same axis/plane/out, adjacent along
function ends(parts) {
  const { ports } = matePorts(parts, table);
  const open = ports.filter((p) => p.mate < 0 && p.axis !== 1);
  const groups = new Map();
  for (const p of open) { const k = `${p.axis},${p.plane},${p.out}`; (groups.get(k) ?? groups.set(k, []).get(k)).push(p); }
  const out = [];
  for (const [k, list] of groups) {
    const along = list[0].axis === 0 ? 2 : 0;
    const segs = list.map((p) => [Math.min(p.a[along], p.b[along]), Math.max(p.a[along], p.b[along]), p]).sort((a, b) => a[0] - b[0]);
    let run = null;
    for (const s of segs) {
      if (run && s[0] - run[1] < 0.1) { run[1] = Math.max(run[1], s[1]); run[2].push(s[2]); continue; }
      if (run) out.push(run);
      run = [s[0], s[1], [s[2]]];
    }
    out.push(run);
    out.forEach((r) => (r.key = k));
  }
  return out.map(([lo, hi, ps]) => ({ key: ps[0].axis + ',' + ps[0].plane + ',' + ps[0].out, lo, hi, w: hi - lo, y: ps[0].center[1], n: ps.length }));
}
const [A, B] = ids;
for (let rot = 0; rot < 4; rot++) for (let dx = -12; dx <= 12; dx++) for (let dz = -12; dz <= 12; dz++) {
  const parts = [{ typeId: A, x: 0, y: 0, z: 0, rotation: 0, rotationAxis: 0 }, { typeId: B, x: dx, y: 0, z: dz, rotation: rot, rotationAxis: 0 }];
  const t1 = new Set(worldTiles(parts[0]).map((c) => c.join(',')));
  if (worldTiles(parts[1]).some((c) => t1.has(c.join(',')))) continue;
  const { links } = matePorts(parts, table);
  if (!links[0].has(1)) continue;
  const e = ends(parts);
  console.log(`${name(A)} + ${name(B)} at ${dx},${dz} rot ${rot}: ends ${e.map((x) => `[${x.key} w${x.w.toFixed(2)} c${((x.lo + x.hi) / 2 / 5).toFixed(2)} y${x.y.toFixed(2)} n${x.n}]`).join(' ')}`);
}
