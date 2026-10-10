// corridor.mjs on desert4, and the README's "the human turns at exactly the
// pad's limit" re-derived with this file's own code. One simulator, about 5 s.
//
// What is independent here:
//   - the road's width is measured again with a different probe (straight
//     down along world y every 0.05 units, where the corridor steps 0.5 along
//     the car's own axes) at points where the road is level;
//   - "the shifted line stays on the road" is tested by putting a point at
//     each bound and looking for road under it;
//   - the turning ratio is computed from the lap's per-tick positions (heading
//     change per unit of path over 100 ms), with its own choice of "steady,
//     flat, on the road", not from corridor.mjs or raceline.mjs curvature().
import { buildCorridor, roomBeside, SPACING, MAX_ROOM, MARGIN, TILT_DEG, AIR_GUARD } from '../corridor.mjs';
import { loadCarModel } from '../car_model.mjs';
import { humanLaps } from '../../shared/laps.mjs';
import { Env, loadTrack } from '../../../sim/env.mjs';
import { decodeState } from '../../../sim/state.mjs';
import { rotate } from '../../../sim/track.mjs';
import { buildTrackMesh } from '../../../sim/trackmesh.mjs';
import { check, near, fmt, median, percentile, section } from './_check.mjs';

const TRACK = 'desert4';
const lap = humanLaps(TRACK)[0];
const createCar = loadTrack(TRACK);
const mesh = buildTrackMesh(createCar.trackData);
const env = await Env.create();
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);

let corridor = null, states = null;
await section('replay', async () => {
  // Our own replay of the lap, one decoded state per tick (state k is tick k + 1).
  const run = await env.replay(createCar, lap.recording, lap.frames + 100);
  states = run.states.map(decodeState);
  check(`replay: the fastest human lap on ${TRACK} finishes on its recorded tick`, run.finished && run.finishFrames === lap.frames, `${run.finishFrames} of ${lap.frames}`);
  corridor = await buildCorridor(TRACK, lap, { env, mesh });
});
// README section 2 also gives the corridor's make-up on two more tracks.
await section('corridor stats on summer1 and winter2', async () => {
  for (const [track, want, width] of [['summer1', [57, 17, 8, 18], 24.4], ['winter2', [48, 23, 6, 23], 30.8]]) {
    const c = await buildCorridor(track, humanLaps(track)[0], { env });
    const st = c.stats, pct = (x) => Math.round(100 * x / st.points);
    const got = [pct(st.free), pct(st.air), pct(st.airGuard), pct(st.tilted)];
    check(`corridor: README's ${track} row (${want.join('% / ')}%, median width ${width})`, got.every((v, i) => Math.abs(v - want[i]) <= 1) && near(st.medianWidth, width, 0.3), `${got.join('% / ')}%, median ${fmt(st.medianWidth, 2)}`);
  }
});
await env.close();
if (!corridor) process.exit(1);
const n = corridor.points.length;

await section('corridor arrays', () => {
  const c = corridor;
  check('corridor: every per-point array has one entry per point', [c.tangent, c.up, c.left, c.grounded, c.tick, c.kmh, c.roomLeft, c.roomRight, c.nearAir, c.free, c.lo, c.hi].every((a) => a.length === n), `${n} points`);
  check('corridor: frames is the lap\'s finish tick', c.frames === lap.frames);
  let lo = Infinity, hi = 0;
  for (let k = 1; k < n; k++) { const d = len(sub(c.points[k], c.points[k - 1])); lo = Math.min(lo, d); hi = Math.max(hi, d); }
  // One tick at 500 km/h is 0.14 units, so a point is taken between 1.00 and 1.14 after the last.
  check('corridor: consecutive points are 1.00 to 1.15 units apart', lo >= SPACING && hi < 1.15, `${fmt(lo, 3)} .. ${fmt(hi, 3)}`);
  check('corridor: ticks rise strictly and each point is where the lap\'s car was on that tick', c.tick.every((t, k) => (k === 0 || t > c.tick[k - 1]) && states[t - 1].frames === t && len(sub(states[t - 1].position, c.points[k])) === 0));
  check('corridor: kmh is the car\'s speed on that tick', c.kmh.every((v, k) => v === states[c.tick[k] - 1].speedKmh));
  // left, up and tangent: unit, square to each other, and left really is the car's left.
  let worstUnit = 0, worstSquare = 0, leastLeft = 1;
  for (let k = 0; k < n; k++) {
    worstUnit = Math.max(worstUnit, Math.abs(len(c.left[k]) - 1), Math.abs(len(c.tangent[k]) - 1));
    worstSquare = Math.max(worstSquare, Math.abs(dot(c.left[k], c.up[k])), Math.abs(dot(c.left[k], c.tangent[k])));
    if (c.free[k] && c.kmh[k] > 50) leastLeft = Math.min(leastLeft, dot(c.left[k], rotate([1, 0, 0], states[c.tick[k] - 1].quaternion)));
  }
  check('corridor: left and tangent are unit vectors; left is square to up and to the path', worstUnit < 1e-9 && worstSquare < 1e-9, `${worstUnit.toExponential(1)}, ${worstSquare.toExponential(1)}`);
  check('corridor: "left" points to the car\'s own left (its x axis) at every free point', leastLeft > 0.95, `smallest left . car-x = ${fmt(leastLeft, 3)}`);

  // The labels, recomputed from the rule in the file's header.
  const cosTilt = Math.cos(TILT_DEG * Math.PI / 180);
  let wrongFree = 0, wrongAir = 0, wrongBounds = 0, wrongGround = 0;
  for (let k = 0; k < n; k++) {
    const s = states[c.tick[k] - 1];
    if (c.grounded[k] !== s.wheelContact.some(Boolean)) wrongGround++;
    let near = false;
    for (let j = Math.max(0, k - AIR_GUARD); j <= Math.min(n - 1, k + AIR_GUARD); j++) near ||= !c.grounded[j];
    if (!!c.nearAir[k] !== near) wrongAir++;
    if (c.free[k] !== (c.grounded[k] && !near && rotate([0, 1, 0], s.quaternion)[1] > cosTilt)) wrongFree++;
    const wantHi = c.free[k] ? Math.max(0, c.roomLeft[k] - MARGIN) : 0, wantLo = c.free[k] ? -Math.max(0, c.roomRight[k] - MARGIN) : 0;
    if (Math.abs(c.hi[k] - wantHi) > 1e-5 || Math.abs(c.lo[k] - wantLo) > 1e-5 || c.lo[k] > 0 || c.hi[k] < 0) wrongBounds++;
  }
  check('corridor: grounded = any wheel touching on that tick', wrongGround === 0, `${wrongGround} wrong`);
  check(`corridor: nearAir = within ${AIR_GUARD} points of an airborne point`, wrongAir === 0, `${wrongAir} wrong`);
  check(`corridor: free = grounded, not near air, road within ${TILT_DEG} degrees of level`, wrongFree === 0, `${wrongFree} wrong`);
  check(`corridor: lo / hi are the room minus the ${MARGIN} margin, 0 where pinned, and never exclude 0`, wrongBounds === 0, `${wrongBounds} wrong`);
  const st = c.stats;
  check('corridor: stats add up to the number of points', st.free + st.air + st.airGuard + st.tilted === n && st.points === n && st.free === c.free.filter(Boolean).length);
  const pct = (x) => Math.round(100 * x / n);
  // README section 2: desert4 69% free, 5% air, 6% near a jump, 20% banked or loop, median width 31.2.
  check('corridor: README\'s desert4 row (69% free, 5% air, 6% near a jump, 20% banked, median width 31.2)', pct(st.free) === 69 && pct(st.air) === 5 && pct(st.airGuard) === 6 && pct(st.tilted) === 20 && near(st.medianWidth, 31.2, 0.06), `${pct(st.free)}% / ${pct(st.air)}% / ${pct(st.airGuard)}% / ${pct(st.tilted)}%, median ${fmt(st.medianWidth, 2)}`);
  check('corridor: no room is negative or beyond MAX_ROOM', c.roomLeft.every((r) => r >= 0 && r <= MAX_ROOM) && c.roomRight.every((r) => r >= 0 && r <= MAX_ROOM));
});

// ---------------------------------------------------------------------------
// The widths, against our own measurement of the road.
// ---------------------------------------------------------------------------
/** Our own "how far does the road go from p in direction dir (horizontal)": walk
 *  sideways 0.05 at a time, casting straight down, and follow the surface: a
 *  probe counts if it finds a surface within 0.3 units (up or down) of the last
 *  one found, so a road that slopes or curves away is followed and a drop onto
 *  a lower level is not. The edge is the last such hit before 0.4 units without
 *  one. Walls: horizontal rays at four heights above the road. */
function measureRoad(p, dir, roadY) {
  let edge = MAX_ROOM, last = 0, y = roadY;
  for (let d = 0.05; d <= MAX_ROOM + 0.5; d += 0.05) {
    const h = mesh.raycast([p[0] + dir[0] * d, y + 0.3, p[2] + dir[2] * d], [0, -1, 0], 0.6);
    if (h !== Infinity) { last = d; y = y + 0.3 - h; } else if (d - last > 0.4) { edge = last; break; }
  }
  let wall = Infinity;
  for (const h of [0.3, 0.45, 0.6, 0.75]) wall = Math.min(wall, mesh.raycast([p[0], roadY + h, p[2]], dir, MAX_ROOM));
  return { edge: Math.min(edge, MAX_ROOM), wall, room: Math.min(edge, wall, MAX_ROOM) };
}

await section('corridor widths', () => {
  const c = corridor;
  // Level points only (road normal within 1 degree of world up), so "sideways" and
  // "down" mean the same in both methods.
  const diffs = [], open = [], walled = [], where = [];
  let levelPoints = 0, bothCapped = 0;
  for (let k = 0; k < n; k++) {
    if (!c.free[k] || c.up[k][1] < Math.cos(Math.PI / 180)) continue;
    levelPoints++;
    const below = mesh.raycast([c.points[k][0], c.points[k][1] + 0.5, c.points[k][2]], [0, -1, 0], 2);
    if (below === Infinity) continue;
    const roadY = c.points[k][1] + 0.5 - below;
    for (const side of [1, -1]) {
      // Our own sideways: world up x the path's direction over 10 points, not corridor.left.
      const a = c.points[Math.max(0, k - 5)], b = c.points[Math.min(n - 1, k + 5)];
      const t = [b[0] - a[0], 0, b[2] - a[2]], l = Math.hypot(t[0], t[2]);
      const dir = [side * t[2] / l, 0, -side * t[0] / l];
      const mine = measureRoad(c.points[k], dir, roadY), theirs = side === 1 ? c.roomLeft[k] : c.roomRight[k];
      if (mine.room >= MAX_ROOM - 0.01 && theirs >= MAX_ROOM - 0.01) { bothCapped++; continue; }
      diffs.push(theirs - mine.room); where.push(`point ${k} ${side === 1 ? 'left' : 'right'}: corridor ${theirs.toFixed(2)}, ours ${mine.room.toFixed(2)} (edge ${mine.edge.toFixed(2)}, wall ${mine.wall.toFixed(2)})`);
      (mine.wall < mine.edge ? walled : open).push(theirs - mine.room);
    }
  }
  const absolute = diffs.map(Math.abs);
  const within = (tol) => absolute.filter((d) => d <= tol).length / absolute.length;
  check('corridor widths: enough level free points on desert4 to compare (over 300 sides with an edge nearer than 20 units)', diffs.length > 300, `${levelPoints} level free points, ${diffs.length} sides compared, ${bothCapped} more read "20 or wider" in both`);
  // The corridor probes every 0.5 units and reports the middle of the last step, so it
  // can be 0.25 off; ours is good to 0.05; the two "sideways" differ by under a degree.
  check('corridor widths: the median difference from our own measurement is under 0.15 units', Math.abs(median(diffs)) < 0.15, `median ${fmt(median(diffs), 3)} (corridor minus ours), open edges ${open.length ? fmt(median(open), 3) : '-'} over ${open.length}, walls ${walled.length ? fmt(median(walled), 3) : '-'} over ${walled.length}`);
  check('corridor widths: 95% of sides agree with our own measurement within 0.5 units', within(0.5) >= 0.95, `${(100 * within(0.5)).toFixed(1)}% within 0.5, ${(100 * within(0.3)).toFixed(1)}% within 0.3, worst ${fmt(Math.max(...absolute), 2)}`);
  // The dangerous direction: the corridor saying there is MORE road than there is.
  const over = diffs.filter((d) => d > MARGIN - 0.75).length;
  if (process.env.DEBUG_W) diffs.forEach((d, i) => { if (d > 0.95) console.log("over", where[i]); });
  check(`corridor widths: nowhere does the corridor overstate the road by more than the margin leaves spare (${fmt(MARGIN - 0.75, 2)} units beyond the car's half width)`, over === 0, `${over} of ${diffs.length} sides; largest overstatement ${fmt(Math.max(...diffs), 2)} units`);

  // The point of the bounds: a car whose centre is at the bound still has all of
  // itself on the road. Put a point at each bound plus the car's half width (0.75)
  // and look for road under it, at every free point (level or not).
  let offRoad = 0, tested = 0, intoWall = 0;
  for (let k = 0; k < n; k++) {
    if (!c.free[k]) continue;
    for (const [shift, sign] of [[c.hi[k], 1], [c.lo[k], -1]]) {
      if (shift === 0) continue;
      tested++;
      const reach = shift + sign * 0.75, up = c.up[k], l = c.left[k], p = c.points[k];
      const from = [p[0] + l[0] * reach + up[0] * 0.5, p[1] + l[1] * reach + up[1] * 0.5, p[2] + l[2] * reach + up[2] * 0.5];
      if (mesh.raycast(from, [-up[0], -up[1], -up[2]], 2) === Infinity) offRoad++;
      // ... and nothing solid between the lap's point and there, at body height.
      const start = [p[0] + up[0] * 0.3, p[1] + up[1] * 0.3, p[2] + up[2] * 0.3];
      if (mesh.raycast(start, [sign * l[0], sign * l[1], sign * l[2]], Math.abs(reach)) !== Infinity) intoWall++;
    }
  }
  check('corridor: a car placed at either bound still has road under its outer edge, at every free point', offRoad === 0, `${offRoad} of ${tested} bounds have no road under the car's outer edge`);
  check('corridor: and no wall between the lap\'s line and the car\'s outer edge at the bound', intoWall === 0, `${intoWall} of ${tested}`);
});

await section('roomBeside', () => {
  // On a level free point, roomBeside with the corridor's own vectors gives the stored number.
  const k = corridor.free.findIndex((f, i) => f && i > 20);
  const again = roomBeside(mesh, corridor.points[k], corridor.left[k], corridor.up[k], true);
  check('roomBeside: called again for a stored point, returns the stored roomLeft', near(again, corridor.roomLeft[k], 1e-6), `${fmt(again, 3)} vs ${fmt(corridor.roomLeft[k], 3)}`);
  // Far above the track there is no road and no wall: the full MAX_ROOM.
  check('roomBeside: with nothing around (500 units up) reports MAX_ROOM', roomBeside(mesh, [0, 500, 0], [1, 0, 0], [0, 1, 0], true) === MAX_ROOM && roomBeside(mesh, [0, 500, 0], [1, 0, 0], [0, 1, 0], false) === MAX_ROOM);
});

// ---------------------------------------------------------------------------
// README: "wherever the fastest human held W and one steering key steadily on
// flat road, the curvature of their path divided by the pad's limit at that
// speed has a median of 1.00". Re-derived from the per-tick states.
// ---------------------------------------------------------------------------
await section('human turning against the pad limit', () => {
  const car = loadCarModel();
  const pos = (t) => states[t - 1].position;                  // car position on tick t
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const heading = (t) => Math.atan2(pos(t + 30)[0] - pos(t - 30)[0], pos(t + 30)[2] - pos(t - 30)[2]);
  const cosTilt = Math.cos(TILT_DEG * Math.PI / 180);
  const ratios = [], bands = new Map();
  for (let t = 500; t < lap.frames - 400; t += 10) {
    const key = lap.keys[t].left ? 'left' : lap.keys[t].right ? 'right' : null;
    if (!key) continue;
    // W and that one steering key, without a break, from 400 ms before to 100 ms after.
    let steady = true;
    for (let u = t - 400; u < t + 100 && steady; u++) steady = lap.keys[u][key] && lap.keys[u].up && !lap.keys[u].down;
    if (!steady) continue;
    // All four wheels down and the road level for 300 ms either side (our own rule;
    // the corridor's is "any wheel" and "no airborne point within 15 units").
    let flat = true;
    for (let u = t - 300; u <= t + 300 && flat; u += 10) { const s = states[u - 1]; flat = s.wheelContact.every(Boolean) && rotate([0, 1, 0], s.quaternion)[1] > cosTilt; }
    if (!flat) continue;
    // Curvature of the path over the 100 ms around t: heading change / distance.
    let path = 0;
    for (let u = t - 50; u < t + 50; u += 10) path += Math.hypot(pos(u + 10)[0] - pos(u)[0], pos(u + 10)[2] - pos(u)[2]);
    const kappa = wrap(heading(t + 50) - heading(t - 50)) / path, v = path / 0.1;
    // A key turns the car to that side: left = positive here (heading rising towards +x from +z... sign checked below).
    const ratio = Math.abs(kappa) / car.kappaMax(v);
    ratios.push(ratio);
    const band = Math.round(v * 3.6 / 50) * 50;
    if (!bands.has(band)) bands.set(band, []);
    bands.get(band).push(ratio);
  }
  const med = median(ratios), p90 = percentile(ratios, 0.9), p10 = percentile(ratios, 0.1);
  const perBand = [...bands.entries()].filter(([, r]) => r.length >= 20).sort((a, b) => a[0] - b[0]);
  check('human turning: enough steady full-lock moments on flat road to judge (over 50 samples, 10 ms apart)', ratios.length > 50, `${ratios.length} samples in ${bands.size} speed bands`);
  check('human turning: median of (path curvature / car.kappaMax(speed)) is 1.00 +- 0.02 on desert4 (README: 1.00)', near(med, 1, 0.02), `median ${fmt(med, 3)}, 10th ${fmt(p10, 3)}, 90th ${fmt(p90, 3)}`);
  check('human turning: 90th percentile at most 1.05 (README: at most 1.04 by its own curvature)', p90 <= 1.05, fmt(p90, 3));
  check('human turning: every 50 km/h band with 20+ samples has a median between 0.97 and 1.03 (README: 0.98 to 1.02)', perBand.length > 0 && perBand.every(([, r]) => median(r) >= 0.97 && median(r) <= 1.03), perBand.map(([b, r]) => `${b} km/h: ${fmt(median(r), 3)} (${r.length})`).join(', '));
});
