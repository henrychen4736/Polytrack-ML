// Check the piece table (pieces.mjs) against the 17 official tracks.
//
//   node ideas/g2-2-track-generator/check_pieces.mjs            # summary per track
//   node ideas/g2-2-track-generator/check_pieces.mjs --table    # the port table as Markdown
//
// The question: do the ports worked out from the collision triangles describe
// how the real tracks hang together? For each official track every placed
// part's ports are moved into the world, ports that face each other are
// "mated", and the track becomes a graph: parts are nodes, mated ports are
// links. Then, starting from the start part, we ask which checkpoints and
// whether the finish can be reached by driving from surface to surface
// through mated ports only.
//
// A gate that is NOT reached that way lies beyond something the table does
// not describe: a jump (a gap in the surface), a wall ride or loop (parts
// stood on their side), or a part type with no usable port. The output says
// which, so the table's blind spots are listed and not guessed.
//
// No simulator is started; this is geometry only (about 2 s).
import { fileURLToPath } from 'node:url';
import { loadTrackInfo } from '../shared/track_info.mjs';
import { TRACKS } from '../shared/laps.mjs';
import { loadPieceTable, worldPorts } from './pieces.mjs';

/** Two ports mate when their openings overlap by at least this much (units).
 *  The car is about 2 wide; 4 leaves room to pass through. */
const MIN_OVERLAP = 4;
/** ...and the surfaces are within this height of each other. A road laid on
 *  a block sits 0.21 above the block's top (measured in the table: road
 *  surface at 0.21, block top at 5.00 = one cell), which cars drive over. */
const MAX_STEP = 0.3;

/**
 * Mate the ports of a list of placed parts.
 * Returns { ports, links }: `ports` is the flat list (each with .part = index
 * into parts and .mate = index of a port it mates with, or -1) and links[k]
 * is the Set of part indices joined to part k.
 */
export function matePorts(parts, table = loadPieceTable()) {
  const ports = [];
  parts.forEach((part, k) => { for (const p of worldPorts(part, table)) ports.push({ ...p, part: k, mate: -1 }); });
  // Only ports on the same vertical plane can mate; group them by it.
  const byPlane = new Map();
  ports.forEach((p, i) => {
    if (p.axis === 1) return; // a port facing up or down: part stood on its side
    const key = `${p.axis},${p.plane}`;
    if (!byPlane.has(key)) byPlane.set(key, []);
    byPlane.get(key).push(i);
  });
  const links = parts.map(() => new Set());
  for (const list of byPlane.values()) {
    for (const i of list) for (const j of list) {
      const p = ports[i], q = ports[j];
      if (i >= j || p.out === q.out || p.part === q.part) continue;
      const along = p.axis === 0 ? 2 : 0;
      const lo = Math.max(Math.min(p.a[along], p.b[along]), Math.min(q.a[along], q.b[along]));
      const hi = Math.min(Math.max(p.a[along], p.b[along]), Math.max(q.a[along], q.b[along]));
      if (hi - lo < MIN_OVERLAP) continue;
      // Height of each opening at the middle of the overlap (openings on the
      // side of a ramp are not level, so interpolate along them).
      const heightAt = (r, s) => { const t = (s - r.a[along]) / (r.b[along] - r.a[along]); return r.a[1] + t * (r.b[1] - r.a[1]); };
      const mid = (lo + hi) / 2;
      if (Math.abs(heightAt(p, mid) - heightAt(q, mid)) > MAX_STEP) continue;
      if (p.mate < 0) p.mate = j;
      if (q.mate < 0) q.mate = i;
      links[p.part].add(q.part); links[q.part].add(p.part);
    }
  }
  return { ports, links };
}

/** Parts reachable from part `from` through mated ports: a Set of indices. */
export function reachable(links, from) {
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) for (const next of links[queue.pop()]) if (!seen.has(next)) { seen.add(next); queue.push(next); }
  return seen;
}

const ROAD = ['Road', 'RoadTurns', 'RoadWide', 'Special'];

function printTable(table) {
  // One row per port of every road part type. Positions in grid cells (5
  // units) relative to the part's own position, before rotation; the car on
  // a start part faces local -z.
  const cells = (v) => (+(v / 5).toFixed(2)).toString();
  console.log('| id | part | port faces | centre x, z (cells) | height (units) | width (units) | pitch |');
  console.log('| --- | --- | --- | --- | --- | --- | --- |');
  for (const piece of [...table.values()].sort((a, b) => a.id - b.id)) {
    if (!ROAD.includes(piece.category)) continue;
    if (!piece.ports.length) console.log(`| ${piece.id} | ${piece.name} | none found | | | | |`);
    for (const p of piece.ports) {
      console.log(`| ${piece.id} | ${piece.name} | ${p.out > 0 ? '+' : '-'}${'xyz'[p.axis]} | ${cells(p.center[0])}, ${cells(p.center[2])} | ${p.center[1].toFixed(2)} | ${p.width.toFixed(2)} | ${p.pitch.toFixed(2)} |`);
    }
  }
}

function checkOfficial(table) {
  const SURFACE = new Set([...ROAD, 'Block', 'Plane', 'WallTrack']);
  let reachedAll = 0;
  const noPortTypes = new Map();
  for (const name of TRACKS) {
    const info = loadTrackInfo(name);
    const parts = info.parts.filter((p) => SURFACE.has(table.get(p.typeId).category));
    const { ports, links } = matePorts(parts, table);
    const start = parts.findIndex((p) => p.startOrder != null);
    const seen = reachable(links, start);
    const gates = parts.map((p, k) => ({ p, k })).filter(({ p }) => table.get(p.typeId).detector);
    const checkpoints = gates.filter(({ p }) => p.checkpointOrder != null);
    const finishes = gates.filter(({ p }) => p.checkpointOrder == null);
    const cpReached = checkpoints.filter(({ k }) => seen.has(k)).length;
    const finReached = finishes.some(({ k }) => seen.has(k));
    // What the table cannot say about this track.
    const sideways = parts.filter((p) => p.rotationAxis !== 0).length;
    for (const p of parts) if (!table.get(p.typeId).ports.length) noPortTypes.set(p.typeId, (noPortTypes.get(p.typeId) ?? 0) + 1);
    const roadPorts = ports.filter((p) => ROAD.includes(table.get(parts[p.part].typeId).category) && p.axis !== 1);
    const mated = roadPorts.filter((p) => p.mate >= 0).length;
    if (cpReached === checkpoints.length && finReached) reachedAll++;
    console.log(`${name.padEnd(8)} surface parts ${String(parts.length).padStart(4)}  reached from start ${String(seen.size).padStart(4)}  checkpoints ${cpReached}/${checkpoints.length}  finish ${finReached ? 'yes' : 'NO '}  road ports mated ${mated}/${roadPorts.length}  parts on their side ${sideways}`);
  }
  console.log(`\n${reachedAll} of ${TRACKS.length} official tracks: every checkpoint and the finish reached from the start through mated ports alone.`);
  console.log('Surface part types on official tracks with no port found (id name: count):');
  console.log('  ' + [...noPortTypes].sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id} ${table.get(id).name}: ${n}`).join(', '));
}

// Run only when called directly (generate.mjs imports matePorts from here).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const table = loadPieceTable();
  if (process.argv.includes('--table')) printTable(table);
  else checkOfficial(table);
}
