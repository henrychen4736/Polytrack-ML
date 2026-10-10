// Cross-check with idea g2-1: its route, found from the collision mesh alone,
// against this generator's route, which is known from how the track was laid.
//
//   node ideas/g2-2-track-generator/compare_g21.mjs
//
// g2-1's buildRoute is given only the track string. If the two routes agree,
// that is evidence for both: g2-1's search finds the road on a track it has
// never seen, and this folder's route really is the middle of the road. No
// simulator; a few seconds per track. g2-1's code is imported, not copied,
// and may change: if its interface moves, this file is the one to fix.
import { loadTrackInfo } from '../shared/track_info.mjs';
import { buildRoute } from '../g2-1-reference-free-inputs/route.mjs';
import { generateTrack } from './generate.mjs';

for (const [seed, difficulty] of [[1, 0], [2, 0.5], [3, 1]]) {
  const track = generateTrack({ seed, difficulty, length: 600 });
  const t0 = Date.now();
  const theirs = buildRoute(loadTrackInfo(track.createCar));
  // For each of our points, the sideways (horizontal) distance to their nearest point.
  let worst = 0, sum = 0;
  for (const p of track.route.points.slice(0, track.route.gates.at(-1).index + 1)) {
    let best = Infinity;
    for (const q of theirs.points) best = Math.min(best, Math.hypot(p[0] - q[0], p[2] - q[2]) + (Math.abs(p[1] - q[1]) > 3 ? 100 : 0));
    worst = Math.max(worst, best); sum += best;
  }
  const n = track.route.gates.at(-1).index + 1;
  console.log(`${track.name}: g2-1 route ok=${theirs.ok}, length ${theirs.length} against ${track.route.length}; distance between the two routes mean ${(sum / n).toFixed(2)}, worst ${worst.toFixed(2)} units; jumps g2-1 thinks are needed: ${theirs.jumps?.length ?? '?'} (${Date.now() - t0} ms)`);
}
