// Throughput of Env.step at different chunk sizes (frames per step call).
// Usage: node scripts/bench_step.mjs
import { Env, loadTrack } from '../sim/env.mjs';

const env = await Env.create();
const track = loadTrack('summer1');
const FRAMES = 2000;
for (const n of [1, 10, 100]) {
  env.reset(track);
  const t0 = performance.now();
  for (let i = 0; i < FRAMES / n; i++) await env.step({ up: true }, n);
  const s = (performance.now() - t0) / 1000;
  console.log(`chunk ${n}: ${Math.round(FRAMES / s)} frames/s (${(FRAMES / 1000 / s).toFixed(1)}x realtime, ${((s / (FRAMES / n)) * 1000).toFixed(2)} ms per step call)`);
}
await env.close();
process.exit(0);
