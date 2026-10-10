// Development aid: write what plot_route.py needs to draw a track from above
// (the surface nodes, the route, the fastest human lap) to cache/plot_<track>.json.
//   node ideas/g2-1-reference-free-inputs/plot_dump.mjs desert4
//   python ideas/g2-1-reference-free-inputs/plot_route.py desert4     (needs matplotlib)
import { writeFileSync } from 'node:fs';
import { loadTrackInfo } from '../shared/track_info.mjs';
import { buildSurface } from './surface.mjs';
import { buildRoute } from './route.mjs';
import { humanTrace } from './human_traces.mjs';

const track = process.argv[2] ?? 'desert4';
const info = loadTrackInfo(track);
const surface = buildSurface(info.mesh);
const route = buildRoute(info, { surface });
const trace = await humanTrace(track);
const nodes = [];
// Upward-facing nodes only, and every second one: enough to see the roads.
for (let k = 0; k < surface.count; k += 2) if (surface.ny[k] > 0.5) nodes.push([+surface.px[k].toFixed(1), +surface.py[k].toFixed(1), +surface.pz[k].toFixed(1), +surface.edge[k].toFixed(1)]);
writeFileSync(new URL(`./cache/plot_${track}.json`, import.meta.url), JSON.stringify({
  track, nodes, ok: route.ok, problem: route.problem,
  route: (route.points ?? []).map((p, k) => [...p.map((v) => +v.toFixed(1)), route.grounded[k] ? 1 : 0]),
  gates: route.stages.map((stage) => stage.map((b) => b.center)),
  gateIndex: route.gateIndex ?? [],
  start: info.path.start.position,
  human: trace.samples.filter((_, k) => k % 3 === 0).map((s) => [...s.position.map((v) => +v.toFixed(1)), s.grounded ? 1 : 0, s.tick]),
}));
console.log(track, 'route ok', route.ok, route.problem ?? '', 'points', route.points?.length);
