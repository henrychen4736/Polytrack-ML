// The same search as g2-2-probe_pairs.mjs for three parts: part A at the
// origin, two more from a list, each placed where it mates with A.
//
//   node ideas/g2-2-track-generator/g2-2-probe_triples.mjs 7 10 12 8 9 11   # what widens the standard road?
//   node ideas/g2-2-track-generator/g2-2-probe_triples.mjs 25 10            # Plane between two StraightWides
//
// Prints every placement that leaves exactly two ends. The first command
// found one: ToWideMiddle with an OuterCornerWide on each side, from the
// 11.13-unit road to a 51.13-unit one; the second the 51-unit straight.
// No simulator; a few seconds. Geometry only, nothing is written.
import { loadPieceTable, worldTiles } from './pieces.mjs';
import { matePorts } from './check_pieces.mjs';
const table = loadPieceTable();
const [A, ...cands] = process.argv.slice(2).map(Number);
const name = (id) => table.get(id).name;
function ends(parts) {
  const { ports, links } = matePorts(parts, table);
  const open = ports.filter((p) => p.mate < 0 && p.axis !== 1);
  const groups = new Map();
  for (const p of open) { const k = `${p.axis},${p.plane},${p.out}`; (groups.get(k) ?? groups.set(k, []).get(k)).push(p); }
  const out = [];
  for (const [k, list] of groups) {
    const along = list[0].axis === 0 ? 2 : 0;
    const segs = list.map((p) => [Math.min(p.a[along], p.b[along]), Math.max(p.a[along], p.b[along])]).sort((a, b) => a[0] - b[0]);
    let run = null;
    for (const s of segs) { if (run && s[0] - run[1] < 0.1) { run[1] = Math.max(run[1], s[1]); continue; } if (run) out.push([k, ...run]); run = [...s]; }
    out.push([k, ...run]);
  }
  return { out, links };
}
const overlaps = (parts) => { const seen = new Set(); for (const p of parts) for (const c of worldTiles(p)) { const k = c.join(','); if (seen.has(k)) return true; seen.add(k); } return false; };
const a = { typeId: A, x: 0, y: 0, z: 0, rotation: 0, rotationAxis: 0 };
const singles = [];
for (const B of cands) for (let rot = 0; rot < 4; rot++) for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) {
  const b = { typeId: B, x: dx, y: 0, z: dz, rotation: rot, rotationAxis: 0 };
  if (overlaps([a, b])) continue;
  if (matePorts([a, b], table).links[0].has(1)) singles.push(b);
}
console.log(singles.length, 'single neighbours');
const seen = new Set();
for (let i = 0; i < singles.length; i++) for (let j = i + 1; j < singles.length; j++) {
  const parts = [a, singles[i], singles[j]];
  if (overlaps(parts)) continue;
  const { out, links } = ends(parts);
  if (out.length !== 2) continue;
  const desc = out.map(([k, lo, hi]) => `[${k} w${(hi - lo).toFixed(2)} c${((lo + hi) / 10).toFixed(2)}]`).join(' ');
  console.log(`${name(A)} + ${name(singles[i].typeId)}@${singles[i].x},${singles[i].z}r${singles[i].rotation} + ${name(singles[j].typeId)}@${singles[j].x},${singles[j].z}r${singles[j].rotation}: ${desc}`);
}
