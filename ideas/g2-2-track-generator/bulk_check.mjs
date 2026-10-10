// Generate many tracks WITHOUT the simulator and check their structure.
//
//   node ideas/g2-2-track-generator/bulk_check.mjs --count 300
//
// The smoke test drives a handful of tracks; this asks the cheaper question
// of hundreds: does the generator always produce a track, and is every one a
// closed chain with no overlap and a route that stays on the road? It also
// counts which pieces get used, so the README can say what the tracks are
// made of. Geometry only: no simulator process, about 0.1 s per track.
import { generateTrack } from './generate.mjs';
import { worldTiles } from './pieces.mjs';
import { matePorts } from './check_pieces.mjs';

const arg = (name, fallback) => { const k = process.argv.indexOf(`--${name}`); return k < 0 ? fallback : +process.argv[k + 1]; };
const count = arg('count', 300), firstSeed = arg('seed', 1000);
const LENGTHS = [600, 1000, 1500, 3000];

const started = Date.now();
const used = new Map();
let bad = 0, noTrack = 0, withCrossing = 0, pieces = 0, units = 0, gates = 0;
const worst = { ms: 0 };
for (let k = 0; k < count; k++) {
  // Difficulty and length both sweep their whole range across the batch.
  const options = { seed: firstSeed + k, difficulty: (k % 11) / 10, length: LENGTHS[k % LENGTHS.length], environment: k % 3 };
  const t0 = Date.now();
  let track;
  try { track = generateTrack(options); } catch { noTrack++; continue; }
  worst.ms = Math.max(worst.ms, Date.now() - t0);

  // Chain: each piece mated to the next, and only the two outer ends open.
  const { ports, links } = matePorts(track.parts);
  const chained = track.parts.every((_, i) => i + 1 === track.parts.length || links[i].has(i + 1)) && ports.filter((p) => p.mate < 0).length === 2;
  // Overlap: two pieces in one grid column less than 2 levels apart.
  const columns = new Map();
  let tooClose = 0, crossing = false;
  track.parts.forEach((part, i) => {
    for (const [x, y, z] of worldTiles(part)) {
      const key = `${x},${z}`;
      for (const other of columns.get(key) ?? []) if (other.i !== i) { if (Math.abs(other.y - y) < 2) tooClose++; else crossing = true; }
      if (!columns.has(key)) columns.set(key, []);
      columns.get(key).push({ y, i });
    }
  });
  if (!chained || tooClose || track.route.onRoad !== 1) { bad++; console.log('BAD', track.name, { chained, tooClose, onRoad: track.route.onRoad }); }
  if (crossing) withCrossing++;
  pieces += track.parts.length; units += track.route.length; gates += track.route.gates.length;
  for (const name of track.pieces) used.set(name, (used.get(name) ?? 0) + 1);
}
const made = count - noTrack;
console.log(`${made} of ${count} tracks generated; ${bad} failed a structure check; ${withCrossing} have a road crossing over another`);
console.log(`mean ${(pieces / made).toFixed(1)} pieces, ${(units / made).toFixed(0)} units, ${(gates / made).toFixed(1)} gates per track; ${((Date.now() - started) / made).toFixed(0)} ms per track, slowest generation ${worst.ms} ms`);
console.log('pieces used: ' + [...used].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} ${c}`).join(', '));
process.exit(bad || noTrack ? 1 : 0);
