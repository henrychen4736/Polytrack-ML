// The test of whether the route can replace the human line as the ruler for
// progress, off-track detection and lookahead: on every official track, build
// the route from the track alone, then lay the fastest human lap over it.
//
//   node ideas/g2-1-reference-free-inputs/validate.mjs            all 17 tracks
//   node ideas/g2-1-reference-free-inputs/validate.mjs desert4    one track, with detail
//   ... --fresh    ignore cached routes (rebuild; 2 to 30 s per track)
//
// The human laps are replayed in ONE simulator the first time (about 1 s per
// track) and cached in cache/; after that no simulator is started.
//
// Columns
//   route     ok, or how many gates the search reached
//   len       route length / human lap length, units
//   jumps     flights on the route / flights of more than 0.2 s on the human lap
//   off med/p95/max   distance from the human's car to the route, units, over the lap
//   gnd max   the same maximum over samples where both the human and the route are on the road
//   pace      share of the lap, in 1 s windows, in which route progress did NOT keep step with the distance the human drove
//             (under 0.4x or over 2.5x): the human was driving somewhere the route does not go, or the other way round.
//             Distance from the route cannot tell this: on an open floor the human's wide line is up to 80 units from the
//             route's tight one (summer5) and progress still keeps step, while 25 units can be the road next door.
//   above     share of the human's time on the road spent more than 5 units ABOVE the route's surface: the human is on a banked
//             wall or a loop that the route does not climb (it turns round on the flat instead)
//   back      largest drop of route progress along the human lap, units (0 = monotonic)
//   stall     longest time the human lap went without gaining 1 unit of route progress, s
//   end       route progress when the human finished, as a fraction (1 = the route's end)
//   same      share of samples where the tracker and the memoryless locate() agree within 10 units
//   noroad    share of the human's wheels-down samples for which progress.mjs finds no surface under the car (false alarms of the off-track test)
import { loadTrackInfo } from '../shared/track_info.mjs';
import { TRACKS } from '../shared/laps.mjs';
import { humanTrace, EVERY } from './human_traces.mjs';
import { routeFor } from './route_store.mjs';
import { createTracker, locate } from './progress.mjs';

const args = process.argv.slice(2);
const fresh = args.includes('--fresh');
const names = args.filter((a) => !a.startsWith('--'));
const detail = names.length === 1;

/** Length of the windows over which `pace` is judged, in samples (1 s). */
const WINDOW = 100;
/** A window is "off pace" when the route progress gained in it is under
 *  PACE_LOW times, or over PACE_HIGH times, the distance the human drove.
 *  Taking a corner on an open floor 60 units wide of the route gives about
 *  0.5; driving round a loop the route does not have gives 0 to 0.3. */
const PACE_LOW = 0.4, PACE_HIGH = 2.5;
const quantile = (sorted, q) => sorted[Math.floor(q * (sorted.length - 1))];
const pad = (v, n) => String(v).padStart(n);

console.log('track    route  len route/human  jumps  off med   p95    max  gnd max   pace  above   back  stall   end   same noroad  build s');
const verdicts = [];
const jobs = (names.length ? names : TRACKS).map((track) => ({ track, hints: null }));
for (const { track, hints } of jobs) {
  const info = loadTrackInfo(track);
  const t0 = Date.now();
  const route = routeFor(info, { fresh, gateHints: hints });
  const seconds = (Date.now() - t0) / 1000;
  if (!route.points) { console.log(track.padEnd(8), 'FAILED:', route.problem); verdicts.push([track, 'no route']); continue; }
  const trace = await humanTrace(track);
  // Where the track offers a choice of gate and the search chose differently
  // from the human, the two cannot be compared; run the track a second time
  // (marked *) with the human's choice of gates given as hints.
  if (!hints && route.stages.some((stage) => stage.length > 1)) {
    const crossed = route.stages.map((_, s) => (trace.samples.find((x) => x.checkpoint > s) ?? trace.samples.at(-1)).position);
    const differs = route.gateIndex.some((g, s) => g != null && Math.hypot(...route.points[g].map((v, i) => v - crossed[s][i])) > 12);
    if (differs) jobs.splice(jobs.findIndex((j) => j.track === track) + 1, 0, { track, hints: crossed });
  }
  const tracker = createTracker(route, info.mesh);
  const off = [], offGround = [];
  let best = 0, back = 0, backAt = 0, stall = 0, stallStart = 0, stallAt = 0, humanLength = 0, same = 0, beyond = 0, groundedSamples = 0;
  let humanJumps = 0, airRun = 0, worst = { d: 0 }, downSamples = 0, aboveSamples = 0, windows = 0, offPace = 0, windowDrive = 0, windowStart = 0;
  let last = null;
  for (let k = 0; k < trace.samples.length; k++) {
    const s = trace.samples[k];
    const state = { position: s.position, quaternion: s.quaternion, wheelContact: [s.grounded], nextCheckpointIndex: s.checkpoint, finishFrames: null };
    const at = tracker.update(state);
    const free = locate(route, info.mesh, state);
    if (Math.abs(free.progress - at.progress) <= 10) same++;
    off.push(at.offRoute);
    if (s.grounded && at.grounded) {
      downSamples++;
      if (at.height > 5) aboveSamples++;
    }
    if (at.offRoute > worst.d) worst = { d: at.offRoute, tick: s.tick, index: at.index, grounded: s.grounded, routeGrounded: at.grounded };
    if (s.grounded && at.grounded) {
      offGround.push(at.offRoute);
    }
    if (s.wheels === 4) { groundedSamples++; if (!at.overRoad) beyond++; }
    if (best - at.progress > back) { back = best - at.progress; backAt = s.tick; }
    if (at.progress >= best + 1) { best = at.progress; stallStart = s.tick; }
    else if (s.tick - stallStart > stall) { stall = s.tick - stallStart; stallAt = s.tick; }
    const moved = k ? Math.hypot(...s.position.map((v, i) => v - trace.samples[k - 1].position[i])) : 0;
    humanLength += moved; windowDrive += moved;
    if (k % WINDOW === WINDOW - 1) {
      // Only windows in which the human covered some ground (not the first second off the line).
      if (windowDrive > 20) { windows++; const ratio = (at.progress - windowStart) / windowDrive; if (ratio < PACE_LOW || ratio > PACE_HIGH) offPace++; }
      windowDrive = 0; windowStart = at.progress;
    }
    if (!s.grounded) airRun++; else { if (airRun * EVERY > 200) humanJumps++; airRun = 0; }
    last = at;
  }
  off.sort((a, b) => a - b); offGround.sort((a, b) => a - b);
  const n = trace.samples.length;
  const end = last.progress / route.length;
  const pace = offPace / Math.max(1, windows);
  console.log(
    (track + (hints ? '*' : '')).padEnd(8),
    pad(route.ok ? 'ok' : `${route.reached}/${route.gates}`, 5),
    pad(`${Math.round(route.length)}/${Math.round(humanLength)}`, 15),
    pad(`${route.jumps.length}/${humanJumps}`, 6),
    pad(quantile(off, 0.5).toFixed(1), 8), pad(quantile(off, 0.95).toFixed(1), 5), pad(off.at(-1).toFixed(1), 6),
    pad(offGround.length ? offGround.at(-1).toFixed(1) : '-', 8), pad(pace.toFixed(2), 6), pad((aboveSamples / Math.max(1, downSamples)).toFixed(2), 6),
    pad(back.toFixed(1), 6), pad((stall / 1000).toFixed(1), 6), pad(end.toFixed(3), 6),
    pad((same / n).toFixed(2), 6), pad(groundedSamples ? (beyond / groundedSamples).toFixed(2) : '-', 6), pad(seconds.toFixed(1), 8),
  );
  // Three verdicts.
  //   'keeps step'   the search reached the finish, and the human lap laid over
  //                 the route keeps step with it (`pace` off in under 5% of
  //                 the lap), never goes backwards by 5 units and never stalls
  //                 for the 2 s that ends an episode in rl/racing_env.mjs.
  //                 Here the route can stand in for the human line.
  //   'loses step'  the search reached the finish by a way the human does not
  //                 take somewhere. Whether a car can drive that way is NOT
  //                 known (nothing here drives it).
  //   'no route'    the search did not reach every gate.
  const keepsStep = route.ok && end > 0.99 && back < 5 && stall < 2000 && pace < 0.05;
  verdicts.push([track + (hints ? '*' : ''), keepsStep ? 'keeps step' : !route.ok ? 'no route' : 'loses step']);
  if (detail) {
    console.log('problem:', route.problem);
    console.log('gate points:', route.gateIndex.join(' '), ' jumps:', route.jumps.map((j) => `${j.from}-${j.to}@${j.speed}`).join(' '));
    console.log('worst distance:', worst, ' largest back-step at tick', backAt, ' longest stall ends at tick', stallAt);
    // Where along the lap the human is far from the route: one line per second.
    const tr2 = createTracker(route, info.mesh);
    let line = '';
    for (let k = 0; k < n; k++) {
      const s = trace.samples[k];
      const at = tr2.update({ position: s.position, nextCheckpointIndex: s.checkpoint, finishFrames: null });
      if (k % 50 === 0) line += `${(s.tick / 1000).toFixed(1)}s i${at.index} off${at.offRoute.toFixed(0)}${s.grounded ? '' : 'a'}${at.grounded ? '' : 'A'} cp${s.checkpoint} | `;
    }
    console.log(line);
  }
}
// Summary: one verdict per track. A track run twice (plain and *) counts as
// 'keeps step' if either run is: the * run only removes a free choice between
// equivalent gates, which the plain run made differently from the human.
const perTrack = new Map();
const rank = { 'keeps step': 0, 'loses step': 1, 'no route': 2 };
for (const [name, v] of verdicts) {
  const track = name.replace('*', '');
  if (!perTrack.has(track) || rank[v] < rank[perTrack.get(track).v]) perTrack.set(track, { v, starred: name.endsWith('*') });
}
console.log('');
for (const v of Object.keys(rank)) {
  const list = [...perTrack].filter(([, x]) => x.v === v).map(([t, x]) => t + (x.starred ? '*' : ''));
  console.log(`${v}: ${list.length} of ${perTrack.size}${list.length ? `  (${list.join(', ')})` : ''}`);
}
console.log('* = run again with the human lap\'s choice among alternative gates given to the search (gateHints)');
