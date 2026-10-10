// The route against the fastest human lap on all 17 official tracks, computed
// by this file and not by validate.mjs. One simulator, about 40 s.
//
// For every track:
//   - the human lap is replayed here (not read from the author's trace cache);
//   - the route is the cached one (routeFor; rebuilding all 17 takes 2.6
//     minutes, so test_4 rebuilds one track and compares it with the cache);
//   - the route itself is checked with this file's own geometry: points one
//     unit apart, starting at the spawn point, on the track's surface where it
//     says it is on the road, through every gate's detector box in order;
//   - distance from the route is measured two ways: the tracker's own number
//     (what the README's table uses) and a brute-force nearest point over the
//     whole route with no memory, which the tracker can never beat;
//   - progress along the lap is followed two ways: with the author's tracker,
//     and with our own forward-only nearest-point search that knows nothing
//     about gates. Both must rise all the way round on the 15 tracks the
//     README says keep step, and both must show summer4 and desert5 do not.
// Then each row of the README's table is compared with what was measured.
import { readFileSync } from 'node:fs';
import { Env } from '../../../sim/env.mjs';
import { decodeState } from '../../../sim/state.mjs';
import { loadPartConfigs } from '../../../sim/track.mjs';
import { loadTrackInfo } from '../../shared/track_info.mjs';
import { TRACKS, humanLaps } from '../../shared/laps.mjs';
import { routeFor } from '../route_store.mjs';
import { createTracker, locate } from '../progress.mjs';
import { RIDE_HEIGHT, SPACING } from '../route.mjs';
import { check, near, fmt, median, percentile, section } from './_check.mjs';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** Ticks between the samples of a lap that are looked at (the author's validation uses 10 too). */
const EVERY = 10;

// The README's table, row by row.
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const table = new Map();
for (const line of readme.split(/\r?\n/)) {
  const m = line.match(/^\| (summer|winter|desert)(\d) \| (\d+) of (\d+) \| (\d+) \/ (\d+) \| ([\d.]+) \/ ([\d.]+) \/ ([\d.]+) \| \**(\d+)%\** \| (\d+)% \| ([\d.]+) \| \**([\d.]+) s\** \|/);
  if (m) table.set(m[1] + m[2], { reached: +m[3], gates: +m[4], routeLength: +m[5], humanLength: +m[6], med: +m[7], p95: +m[8], max: +m[9], offPace: +m[10], above: +m[11], drop: +m[12], stall: +m[13] });
}
check('README: the validation table has a row for each of the 17 official tracks', table.size === 17 && TRACKS.every((t) => table.has(t)), `${table.size} rows`);

const env = await Env.create();
const results = new Map();
try {
  for (const track of TRACKS) {
    await section(track, async () => {
      const info = loadTrackInfo(track);
      const route = routeFor(info);
      const lap = humanLaps(track)[0];
      const run = await env.replay(info.createCar, lap.recording, lap.frames + 100);
      const all = run.states.map(decodeState);
      const samples = all.filter((_, k) => k % EVERY === 0);
      const pts = route.points, n = pts.length, mesh = info.mesh;

      // ---- the route, by our own geometry ------------------------------------
      const problems = [];
      let shortest = Infinity, longest = 0;
      for (let k = 1; k < n; k++) { const d = dist(pts[k], pts[k - 1]); shortest = Math.min(shortest, d); longest = Math.max(longest, d); }
      if (shortest < 0.75 || longest > 1.25) problems.push(`points are ${fmt(shortest, 2)} to ${fmt(longest, 2)} apart, not ${SPACING}`);
      if (route.length !== (n - 1) * route.spacing) problems.push(`length ${route.length} for ${n} points`);
      if (dist(pts[0], info.path.start.position) > 2.5) problems.push(`starts ${fmt(dist(pts[0], info.path.start.position), 1)} units from the spawn point`);
      // Unit vectors, square to each other, forward along the points.
      let badFrame = 0, backwards = 0;
      for (let k = 0; k < n - 1; k++) {
        const f = route.forward[k], u = route.up[k], l = route.left[k];
        if (Math.abs(Math.hypot(...f) - 1) > 0.01 || Math.abs(Math.hypot(...u) - 1) > 0.01 || Math.abs(Math.hypot(...l) - 1) > 0.01 || Math.abs(dot(f, l)) > 0.05 || Math.abs(dot(u, l)) > 0.05) badFrame++;
        const step = [pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1], pts[k + 1][2] - pts[k][2]];
        if (dot(step, f) / (Math.hypot(...step) || 1) < 0.7) backwards++;
      }
      if (badFrame > 0.01 * n) problems.push(`${badFrame} points whose forward / up / left are not unit vectors square to each other`);
      if (backwards > 0.01 * n) problems.push(`${backwards} points whose "forward" does not point at the next point`);
      // Where the route says it is on the road there must be a surface under it (along the
      // route's own "up", which is sideways on a wall and downwards in a loop). The README
      // says the route is "lifted to the car's ride height (0.15)". Measured: true on flat
      // road; on loops, banked walls and ramps the smoothed route floats 0.5 to 1.1 units
      // off the surface (up to 17% of a track's points are more than 0.35 from ride
      // height), so the limits here are "a surface within 2 units" for every point and
      // "within 0.85 of ride height" for 95% of them. `floating` is reported.
      let grounded = 0, offSurface = 0, noSurface = 0, floating = 0;
      for (let k = 0; k < n; k++) {
        if (!route.grounded[k]) continue;
        grounded++;
        const u = route.up[k], p = pts[k];
        const d = mesh.raycast([p[0] + u[0] * 0.6, p[1] + u[1] * 0.6, p[2] + u[2] * 0.6], [-u[0], -u[1], -u[2]], 2.6);
        if (d === Infinity) noSurface++;
        else if (Math.abs(d - 0.6 - RIDE_HEIGHT) > 0.85) offSurface++;
        else if (Math.abs(d - 0.6 - RIDE_HEIGHT) > 0.35) floating++;
      }
      // (desert5 has 5 such points of 2653: the on-road flag is wrong at a handful of points there.)
      if (noSurface > 0.005 * grounded) problems.push(`${noSurface} of ${grounded} on-road points have no surface within 2 units under them`);
      if (offSurface > 0.05 * grounded) problems.push(`${offSurface} of ${grounded} on-road points are more than 0.85 from ride height above the surface`);
      // Gates: one route point per stage, inside one of that stage's detector boxes, in rising order; the finish last.
      const gates = route.gateIndex;
      if (!route.ok || route.reached !== route.gates || gates.length !== route.stages.length) problems.push(`reached ${route.reached} of ${route.gates} gates`);
      if (!gates.every((g, i) => g != null && (i === 0 || g > gates[i - 1]))) problems.push(`gate points ${gates.join(',')} are not in rising order`);
      const inBox = (p, box, grow) => [0, 1, 2].every((c) => Math.abs(p[c] - box.center[c]) <= box.size[c] / 2 + grow);
      const missed = gates.filter((g, i) => g == null || !route.stages[i].some((box) => inBox(pts[g], box, 3))).length;
      if (missed) problems.push(`${missed} gate points are not within 3 units of their gate's detector box`);
      if (!route.stages.at(-1).every((box) => box.isFinish) || route.stages.slice(0, -1).some((stage) => stage.some((box) => box.isFinish))) problems.push('the last stage is not the finish');
      // The number of stages must be the track's own: distinct checkpoint orders, plus the finish.
      const configs = loadPartConfigs();
      const orders = new Set(info.parts.filter((p) => p.checkpointOrder != null && configs.get(p.typeId).detector).map((p) => p.checkpointOrder));
      if (route.stages.length !== orders.size + 1) problems.push(`${route.stages.length} stages for ${orders.size} checkpoint orders + finish`);
      check(`${track}: the route is 1 unit per point from the spawn point, on the surface where it claims to be, through all ${route.gates} gates in order`, problems.length === 0,
        problems.length ? problems.join(' | ') : `${n} points, steps ${fmt(shortest, 2)}..${fmt(longest, 2)}, ${grounded} on the road (${floating + offSurface} of them 0.35 to 1.1 off ride height, ${noSurface} with no surface under them), ${route.jumps.length} flights`);

      // ---- the human lap over it --------------------------------------------------
      const tracker = createTracker(route, mesh);
      const off = [], globalOff = [];
      let best = 0, drop = 0, stall = 0, stallStart = 0, humanLength = 0, windows = 0, offPace = 0, windowDrive = 0, windowStart = 0;
      let down = 0, above = 0, fourWheels = 0, noRoad = 0, beaten = 0, last = null, statelessAgree = 0;
      // Ours: nearest route point searched forward only from the last one (3 back, 80 on), no gates.
      let mine = 0, mineBest = 0, mineDrop = 0, mineStall = 0, mineStallStart = 0;
      samples.forEach((s, k) => {
        const state = { ...s, finishFrames: null };              // the finish is looked at separately below
        const at = tracker.update(state);
        off.push(at.offRoute);
        let g = Infinity; for (let i = 0; i < n; i++) g = Math.min(g, (pts[i][0] - s.position[0]) ** 2 + (pts[i][1] - s.position[1]) ** 2 + (pts[i][2] - s.position[2]) ** 2);
        g = Math.sqrt(g); globalOff.push(g);
        if (at.offRoute < g - 1e-6) beaten++;
        if (Math.abs(locate(route, mesh, state).progress - at.progress) <= 10) statelessAgree++;
        const onRoad = s.wheelContact.some(Boolean);
        if (onRoad && at.grounded) { down++; if (at.height > 5) above++; }
        if (s.wheelContact.every(Boolean)) { fourWheels++; if (!at.overRoad) noRoad++; }
        if (best - at.progress > drop) drop = best - at.progress;
        if (at.progress >= best + 1) { best = at.progress; stallStart = s.frames; } else stall = Math.max(stall, s.frames - stallStart);
        const moved = k ? dist(s.position, samples[k - 1].position) : 0;
        humanLength += moved; windowDrive += moved;
        if (k % 100 === 99) { if (windowDrive > 20) { windows++; const r = (at.progress - windowStart) / windowDrive; if (r < 0.4 || r > 2.5) offPace++; } windowDrive = 0; windowStart = at.progress; }
        // our own search
        let bestD = Infinity, bestI = mine;
        for (let i = Math.max(0, mine - 3); i <= Math.min(n - 1, mine + 80); i++) { const d = dist(pts[i], s.position); if (d < bestD) { bestD = d; bestI = i; } }
        mine = bestI;
        if (mineBest - mine > mineDrop) mineDrop = mineBest - mine;
        if (mine >= mineBest + 1) { mineBest = mine; mineStallStart = s.frames; } else mineStall = Math.max(mineStall, s.frames - mineStallStart);
        last = at;
      });
      const finishedAt = tracker.update(all.at(-1));
      const r = {
        med: median(off), p95: percentile(off, 0.95), max: Math.max(...off), globalMed: median(globalOff), globalMax: Math.max(...globalOff),
        drop, stall: stall / 1000, end: last.progress / route.length, offPace: offPace / Math.max(1, windows), above: above / Math.max(1, down),
        noRoad: noRoad / Math.max(1, fourWheels), humanLength, mineDrop, mineStall: mineStall / 1000, mineEnd: mineBest / (n - 1), statelessAgree: statelessAgree / samples.length,
        finished: run.finished && run.finishFrames === lap.frames, finishProgress: finishedAt.progress, length: route.length, reached: route.reached, gates: route.gates,
      };
      results.set(track, r);
      check(`${track}: the tracker never reports the car nearer the route than a brute-force search over the whole route finds`, beaten === 0, `${beaten} samples; tracker median ${fmt(r.med, 1)}, brute force ${fmt(r.globalMed, 1)}`);
      check(`${track}: when the game reports the finish (tick ${lap.frames}) progress is exactly the route's length`, r.finished && finishedAt.progress === route.length && finishedAt.fraction === 1, `progress ${finishedAt.progress} of ${route.length}`);
      check(`${track}: "is there road under the car" is true for 99.5% or more of the human's four-wheels-down samples (README)`, r.noRoad < 0.005, `${noRoad} of ${fourWheels} say no road`);

      // ---- the README's row ---------------------------------------------------------
      const row = table.get(track);
      const differ = [];
      const cmp = (name, got, want, tol) => { if (!near(got, want, tol)) differ.push(`${name} ${fmt(got, 2)} (README ${want})`); };
      cmp('gates reached', r.reached, row.reached, 0); cmp('gates', r.gates, row.gates, 0);
      cmp('route length', route.length, row.routeLength, 1); cmp('human length', humanLength, row.humanLength, 2);
      cmp('median distance', r.med, row.med, row.med < 10 ? 0.06 : 0.6); cmp('95% distance', r.p95, row.p95, 1); cmp('largest distance', r.max, row.max, 0.6);   // the README prints these two as whole numbers
      cmp('off pace %', 100 * r.offPace, row.offPace, 0.6); cmp('above route %', 100 * r.above, row.above, 0.6);
      cmp('largest drop', r.drop, row.drop, 0.06); cmp('longest stall', r.stall, row.stall, 0.06);
      check(`${track}: our own measurements reproduce the README's row (gates, lengths, distance median / 95% / max, off pace, above, drop, stall)`, differ.length === 0,
        differ.length ? differ.join('; ') : `distance ${fmt(r.med, 1)} / ${fmt(r.p95, 0)} / ${fmt(r.max, 0)}, off pace ${(100 * r.offPace).toFixed(0)}%, drop ${fmt(r.drop, 1)}, stall ${fmt(r.stall, 1)} s`);
    });
  }
} finally { await env.close(); }

// ---------------------------------------------------------------------------
// The README's summary claims.
// ---------------------------------------------------------------------------
await section('summary', () => {
  const tracks = [...results.keys()];
  check('summary: results for all 17 tracks', tracks.length === 17, `${tracks.length}`);
  const reach = tracks.filter((t) => results.get(t).reached === results.get(t).gates && results.get(t).finishProgress === results.get(t).length);
  check('summary: the route reaches the finish through every gate on 17 of 17 tracks (README)', reach.length === 17, `${reach.length}`);
  // README: on 15 of 17 progress "never drops by more than 1 unit, never stalls for more than 0.4 s, and ends at the route's length".
  const steady = tracks.filter((t) => { const r = results.get(t); return r.drop <= 1 && r.stall <= 0.4 + 1e-9 && r.end > 0.997; });
  const lost = tracks.filter((t) => !steady.includes(t));
  check('summary: with the author\'s tracker, progress keeps step on exactly the 15 tracks the README names (drop at most 1 unit, stall at most 0.4 s, ends at the route\'s length)', steady.length === 15 && lost.sort().join() === 'desert5,summer4', `loses step: ${lost.join(', ') || 'none'}; worst of the 15: drop ${fmt(Math.max(...steady.map((t) => results.get(t).drop)), 2)} units, stall ${fmt(Math.max(...steady.map((t) => results.get(t).stall)), 2)} s`);
  // The same question with our own search (no gates, no fence): monotonic within 2 points, no stall over 0.6 s, reaches the end.
  const mineSteady = tracks.filter((t) => { const r = results.get(t); return r.mineDrop <= 2 && r.mineStall <= 0.6 && r.mineEnd > 0.99; });
  const mineLost = tracks.filter((t) => !mineSteady.includes(t));
  check('summary: with our own gate-free forward search, progress along the human lap also rises monotonically to the end on those same 15 tracks, and not on summer4 and desert5', mineSteady.length === 15 && mineLost.sort().join() === 'desert5,summer4',
    `loses step: ${mineLost.map((t) => `${t} (drop ${results.get(t).mineDrop} points, stall ${fmt(results.get(t).mineStall, 1)} s, reached ${(100 * results.get(t).mineEnd).toFixed(0)}%)`).join(', ') || 'none'}; worst of the others: drop ${Math.max(...mineSteady.map((t) => results.get(t).mineDrop))} points, stall ${fmt(Math.max(...mineSteady.map((t) => results.get(t).mineStall)), 2)} s`);
  const stalls = ['summer4', 'desert5'].map((t) => results.get(t)?.stall);
  check('summary: summer4 and desert5 stall for 11.5 s and 2.5 s of the human lap (README), longer than the 2 s that ends an episode', near(stalls[0], 11.5, 0.1) && near(stalls[1], 2.5, 0.1), stalls.map((s) => fmt(s, 1)).join(' s, ') + ' s');
  // How far the human is from the route: the README's point that distance cannot be the test.
  const far = tracks.filter((t) => results.get(t).max > 40);
  check('summary: on the 15 good tracks the human is up to 104 units from the route (README: "off line at 20 or 40 units would end correct driving")', Math.max(...steady.map((t) => results.get(t).max)) > 100 && Math.max(...steady.map((t) => results.get(t).max)) < 106, `${far.length} tracks over 40 units; largest on a good track ${fmt(Math.max(...steady.map((t) => results.get(t).max)), 1)}`);
  const agree = Math.min(...steady.map((t) => results.get(t).statelessAgree));
  check('summary: the memoryless locate() agrees with the tracker within 10 units for 95% or more of the samples on each of the 15 good tracks', agree >= 0.95, `lowest ${(100 * agree).toFixed(1)}%`);
});
