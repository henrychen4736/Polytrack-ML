// Does the turning limit measured on the flat pad hold on real tracks?
//
//   node ideas/g1-7-computed-racing-line/check_turn_limit.mjs [track ...]
//   node ideas/g1-7-computed-racing-line/check_turn_limit.mjs desert4 summer1 winter2
//
// One simulator at a time, about 2 s per track.
//
// The check: find every place where the fastest human lap had W and ONE
// steering key down, without a break, for the 400 ms before and the 100 ms
// after, on flat road away from jumps (the corridor's "free" points). There
// the car must be turning as tightly as it can at that speed, so the
// curvature of the human's path divided by car.kappaMax(speed) should be 1.
// Printed per 50 km/h band: how many such points, the median ratio and the
// 90th percentile. A median near 1.00 says the pad number is the track
// number; the spread is what raceline.mjs's TOLERANCE has to cover.
import { humanLaps } from '../shared/laps.mjs';
import { buildCorridor } from './corridor.mjs';
import { loadCarModel } from './car_model.mjs';
import { curvature } from './raceline.mjs';

const tracks = process.argv.slice(2);
if (!tracks.length) tracks.push('desert4');
const car = loadCarModel();
for (const track of tracks) {
  const lap = humanLaps(track)[0];
  const corridor = await buildCorridor(track, lap);
  const kappa = curvature(corridor.points, corridor.up);
  const bands = new Map();
  for (let k = 10; k < corridor.points.length - 10; k++) {
    if (!corridor.free[k]) continue;
    const t = corridor.tick[k];
    const key = lap.keys[t].left ? 'left' : lap.keys[t].right ? 'right' : null;
    if (!key) continue;
    let held = true;
    for (let u = Math.max(0, t - 400); u < Math.min(lap.frames, t + 100) && held; u++) held = lap.keys[u][key] && lap.keys[u].up && !lap.keys[u].down;
    if (!held) continue;
    const band = Math.round(corridor.kmh[k] / 50) * 50;
    if (!bands.has(band)) bands.set(band, []);
    bands.get(band).push(Math.abs(kappa[k]) / car.kappaMax(corridor.kmh[k] / 3.6));
  }
  const text = [...bands.entries()].sort((a, b) => a[0] - b[0]).map(([band, ratios]) => {
    ratios.sort((a, b) => a - b);
    return `${band} km/h: ${ratios.length} points, median ${ratios[ratios.length >> 1].toFixed(2)}, 90th ${ratios[Math.floor(ratios.length * 0.9)].toFixed(2)}`;
  });
  console.log(`${track} (${(lap.frames / 1000).toFixed(3)} s, ${corridor.stats.free} of ${corridor.stats.points} points free): ${text.join(' | ') || 'no steady full-lock turning on free road'}`);
}
