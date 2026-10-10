// Child process for the human-seeded search (search_human.mjs): owns one
// simulator and searches ONE SECTION of a lap for a faster way through it.
// Started through sim/pool.mjs.
//
// It differs from sim/section_child.mjs in three ways. The whole search loop
// for a section runs here, so nothing crosses the process boundary per
// candidate (the parent only says "search this section for N seconds" and
// gets a lap back). It measures a lap's time to a FRACTION of a millisecond,
// which is what makes a human lap improvable at all (see search()). And it
// has a REPAIR step for the rest of the lap after a large gain.
//
// The lap is a timeline: for each key the ticks at which it flips, 1 tick =
// 1 ms (sim/recording.mjs). Nothing is ever rounded to 50 ms blocks, so the
// starting lap is the human's lap exactly.
//
// One candidate, in plain terms (a = section start, b = section end):
//
//   1. CHANGE. Copy the best lap and change a key timing between a and b
//      (move a flip, delete a tap, or add a short tap).
//   2. DRIVE THE SECTION from the save state at a (1.5 s of driving).
//   3. REJOIN. Where on the best lap's path is the car now, and how well does
//      it match that point (distance off the line, velocity, heading)?
//   4. If it is nowhere near the old path, give up on it. Otherwise:
//        - SMALL STEP: drive on to the finish with the later keys as they
//          are. This is where every gain in the tests came from.
//        - BIG STEP, if that was not faster and the car was g whole ms ahead
//          and close to the old path at b: move every later key g ms earlier
//          (splice() in sim/sectional.mjs) and drive to the finish again; if
//          that fails too, REPAIR the next stretch and try once more.
//      Both are explained at search().
//
// Only a lap that is measured faster at the finish is ever kept, so the best
// lap always finishes; the parent checks it once more with the game's Verify.
//
// Protocol (a recording is the decoded form { up: [ticks], right, ... }):
//   parent -> child  { track }                      once
//   child -> parent  { ready: true }
//   { id, cmd: 'prepare', recording, start, limit }
//       New car, drive `recording` to tick `start`, save that state, then
//       drive on to the finish (at most to tick `limit`) and remember the
//       path. `recording` becomes the best lap. Reply { id, finishFrames }.
//   { id, cmd: 'adopt', recording, limit }
//       Another process found a faster lap that is the same before `start`:
//       make it the best lap and record its path. Reply { id, finishFrames }.
//   { id, cmd: 'search', end, seconds, seed, ...settings }
//       Search the section start..end for `seconds`. Reply { id, recording,
//       frames, gained, stats }: the best lap now, and how many ms (with
//       fractions) it is faster than when the request arrived.
//
// Local use only: nothing here contacts Kodub's servers.
import { Env, loadTrack } from '../../sim/env.mjs';
import { stateFrames } from '../../sim/state.mjs';
import { CHANNELS } from '../../sim/recording.mjs';
import { controlsAt, nextFlipAfter, splice, REJOIN_DEFAULTS } from '../../sim/sectional.mjs';
import { createRng, mutate } from '../../sim/search.mjs';

/** Settings of one 'search' request, with the values the smoke tests used. */
export const SEARCH_DEFAULTS = {
  ...REJOIN_DEFAULTS,   // maxLoss, maxGain, perUnit, perUnitPerSecond, perRadian
  minScore: 0,          // BIG step: splice and shift if the gain is 1 ms or more and the rejoin score (ms) is above this
  followScore: -30,     // SMALL step: drive on with unshifted keys if the rejoin score is above this (see search())
  minLead: 0.02,        // a lap finishing on the same tick counts as faster if it is this many ms ahead just before it
  maxShift: 20,         // furthest a flip is moved, ms
  insertChance: 0.15,   // chance that a change adds a short tap instead of moving a flip
  maxTap: 40,           // longest added tap, ms
  repairIters: 24,      // changes tried per repair stretch (0 switches repair off)
  repairRounds: 2,      // repair stretches per failed splice
  repairMin: 300,       // shortest and longest repair stretch, ms
  repairMax: 900,
  devTol: 0.5,          // units off the old path at which the car counts as having left it
  abortDist: 4,         // units off the old path at which a drive to the finish is given up
};

// The game refuses to step one car past about 6 million ticks, and restoring
// a save state does not wind that counter back (CONTRACT.md, "Car tick
// budget"). Past this many the car is replaced and the save state rebuilt.
const CAR_TICK_BUDGET = 4_500_000;
// Longest single call to the simulator, so a finish or a car that has left
// the path is noticed within this many ticks. Not shorter, because every call
// costs about 2 ms on top of its ticks (measured: 16 000 ticks/s in calls of
// 100 ticks, 1 900 in calls of 10, 600 in calls of 1), which is as much as
// 30 ticks of driving.
const CHUNK = 250;
// When measuring how far the car is from the old path, look this many ticks
// either side of where it is expected to be. Without it a car that is on the
// old line but 20 ms further ahead than at the rejoin would count as 1.2
// units "off the path" at 60 units/s, which is not what the measure is for.
const DEV_WINDOW = 40;
// How long before the best lap's finish the sub-tick lead is measured. Late
// enough that little can change in the rest (30 ms), early enough that the
// best lap's path still extends past where a faster car has got to.
const LEAD_BEFORE = 30;

const env = await Env.create();
let track = null;
let best = null;        // the best lap, a timeline
let bestFrames = 0;     // its finish tick
let start = 0;          // section start a
let saved = null;       // save state at tick `start` (a full snapshot; also the base of the small ones)
// The best lap's path: the car after t ticks is at pos[3t..3t+2] with
// orientation quat[4t..4t+3]. Filled for ticks start+1 .. bestFrames.
let pos = new Float64Array(0), quat = new Float64Array(0);

/** Read what the search needs from a raw 227-byte car state (layout in
 *  sim/state.mjs) without building the full decoded object: this runs on
 *  every tick of every candidate. The returned object is reused. */
const pose = { frames: 0, p: [0, 0, 0], q: [0, 0, 0, 1], finishFrames: null };
function readPose(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const finished = (u8[11] & 2) !== 0;
  let o = 12;
  pose.finishFrames = finished ? (u8[o] | (u8[o + 1] << 8) | (u8[o + 2] << 16)) : null;
  o += (finished ? 3 : 0) + 2; // + the checkpoint counter
  for (let k = 0; k < 3; k++) pose.p[k] = dv.getFloat32(o + 4 * k, true);
  for (let k = 0; k < 4; k++) pose.q[k] = dv.getFloat32(o + 12 + 4 * k, true);
  pose.frames = stateFrames(u8);
  return pose;
}

/**
 * Drive `recording` for ticks from .. to-1 from wherever the car is now.
 * `onTick(pose)` is called after every tick; if it returns true the drive
 * stops at the end of the current simulator call. Stops at the finish.
 * Returns the finish tick, or null.
 */
async function drive(recording, from, to, onTick) {
  for (let t = from; t < to;) {
    const n = Math.min(to, nextFlipAfter(recording, t), t + CHUNK) - t;
    const states = await env.step(controlsAt(recording, t), n);
    let stop = false;
    for (const s of states) {
      const p = readPose(s);
      if (onTick?.(p)) stop = true;
      if (p.finishFrames != null) return p.finishFrames;
    }
    if (stop) return null;
    t += n;
  }
  return null;
}

/** New car, drive the best lap to tick `start`, save that state. */
async function rebuild() {
  env.dropAllStates();
  env.reset(track);
  await drive(best, 0, start);
  saved = await env.saveState();
}

/** From the save state, drive the best lap to the finish (at most to tick
 *  `limit`) and store its path. Returns the finish tick, or null. */
async function recordPath(limit) {
  if (pos.length < 3 * (limit + 2)) { pos = new Float64Array(3 * (limit + 2)); quat = new Float64Array(4 * (limit + 2)); }
  await env.loadState(saved);
  return drive(best, start, limit, (p) => {
    pos.set(p.p, 3 * p.frames);
    quat.set(p.q, 4 * p.frames);
  });
}

const dist2 = (p, t) => (pos[3 * t] - p[0]) ** 2 + (pos[3 * t + 1] - p[1]) ** 2 + (pos[3 * t + 2] - p[2]) ** 2;

/**
 * Where on the best lap's path is the car, and how well does it match?
 * The measure of rejoin() in sim/sectional.mjs, on this file's arrays and to
 * a fraction of a tick.
 *   end = { frames, p, q, v }: the car now and its velocity in units/s.
 * Returns { gain, lead, score } or null. gain: whole ticks ahead of the best
 * lap; lead: the same with the fraction of a tick; score: lead minus the
 * mismatch penalties, ms.
 */
function rejoin(end, o) {
  const from = Math.max(start + 2, end.frames - o.maxLoss);
  const to = Math.min(bestFrames, end.frames + o.maxGain);
  let at = -1, d2 = Infinity;
  for (let t = from; t <= to; t++) { const d = dist2(end.p, t); if (d < d2) { d2 = d; at = t; } }
  if (at === -1) return null;
  // Between which two ticks of the path is the car? Ticks are 0.06 units
  // apart at 60 units/s, so taking the nearest tick alone would report up to
  // 0.03 units of "distance" (0.6 ms of penalty) for a car exactly on the
  // old line, as much as the gains being looked for. So: the point closest
  // to the car on the straight piece of path through tick `at`, a fraction
  // of a tick `f` from it, and the distance from that line, not from a tick.
  let along = 0, len2 = 0;
  const lo = Math.max(at - 1, start + 1), hi = Math.min(at + 1, bestFrames);
  for (let k = 0; k < 3; k++) {
    const seg = (pos[3 * hi + k] - pos[3 * lo + k]) / (hi - lo); // units per tick
    along += (end.p[k] - pos[3 * at + k]) * seg; len2 += seg * seg;
  }
  const f = len2 > 0 ? Math.max(-1, Math.min(1, along / len2)) : 0;
  const off = Math.sqrt(Math.max(0, d2 - f * f * len2));
  // The best lap's velocity at that tick, from its last step (1 tick = 1 ms).
  let dv2 = 0, dot = 0;
  for (let k = 0; k < 3; k++) dv2 += ((pos[3 * at + k] - pos[3 * at - 3 + k]) * 1000 - end.v[k]) ** 2;
  for (let k = 0; k < 4; k++) dot += quat[4 * at + k] * end.q[k];
  const angle = 2 * Math.acos(Math.min(1, Math.abs(dot)));
  const gain = at - end.frames;
  return { gain, lead: gain + f, score: gain + f - o.perUnit * off - o.perUnitPerSecond * Math.sqrt(dv2) - o.perRadian * angle };
}

/** Drive `recording` from the car's current state at tick `from` to tick
 *  `to`, and return the car there as rejoin() wants it (null if it finished
 *  on the way, which cannot happen away from the end of the lap). */
async function driveTo(recording, from, to) {
  let before = null, end = null;
  const finish = await drive(recording, from, to, (p) => {
    if (p.frames === to - 1) before = p.p.slice();
    if (p.frames === to) end = { frames: to, p: p.p.slice(), q: p.q.slice() };
  });
  if (finish != null || !end) return null;
  end.v = before ? end.p.map((x, k) => (x - before[k]) * 1000) : [0, 0, 0];
  return end;
}

/**
 * Drive `recording` from tick `from` to the finish, giving up at the best
 * lap's finish tick. From tick `watchFrom` on, the car is compared with the
 * best lap's path `gain` ticks later, and the drive is given up when it is
 * `abortDist` units away: such a car is not going to arrive in time.
 * Returns { finishFrames, left, lead }:
 *   left   the first tick at which the car was more than `devTol` units off
 *          the old path (null if never)
 *   lead   how far ahead of the best lap the car was LEAD_BEFORE ticks before
 *          the best lap's finish, in ticks WITH A FRACTION (null if the lap
 *          did not finish). This is the lap's time to a fraction of a
 *          millisecond; see "small step" at search().
 */
async function driveTail(recording, from, gain, watchFrom, o) {
  let left = null, before = null, end = null;
  const measureAt = bestFrames - LEAD_BEFORE;
  const finishFrames = await drive(recording, from, bestFrames, (p) => {
    if (p.frames === measureAt - 1) before = p.p.slice();
    if (p.frames === measureAt) end = { frames: measureAt, p: p.p.slice(), q: p.q.slice() };
    const centre = p.frames + gain;
    if (p.frames < watchFrom || centre + DEV_WINDOW > bestFrames) return false;
    let d2 = Infinity;
    for (let t = centre - DEV_WINDOW; t <= centre + DEV_WINDOW; t += 4) d2 = Math.min(d2, dist2(p.p, t));
    if (left == null && d2 > o.devTol ** 2) left = p.frames;
    return d2 > o.abortDist ** 2;
  });
  let lead = null;
  if (finishFrames != null && end && before) {
    end.v = end.p.map((x, k) => (x - before[k]) * 1000);
    lead = rejoin(end, o)?.lead ?? null;
  }
  return { finishFrames, left, lead };
}

/** Is a lap with this driveTail() result faster than the best lap? Sooner by
 *  a whole tick, or on the same tick and measurably ahead just before it. */
const faster = (tail, o) => tail.finishFrames != null &&
  (tail.finishFrames < bestFrames || (tail.lead != null && tail.lead > o.minLead));

/** A changed copy of `recording`, changed only in ticks lo..hi: usually
 *  mutate() of sim/search.mjs (move a flip or delete a tap); sometimes a new
 *  short tap of a key, or a short release of a held one, which mutate()
 *  cannot make and a human lap needs (desert4: 186 flips in 21.75 s, about
 *  13 per section). */
function change(recording, rng, lo, hi, o) {
  if (rng() < o.insertChance && hi - lo > o.maxTap + 2) {
    const ch = ['up', 'right', 'down', 'left'][Math.floor(rng() * 4)];
    const at = lo + Math.floor(rng() * (hi - lo - o.maxTap));
    const until = at + 2 + Math.floor(rng() * (o.maxTap - 1));
    // Two new flips are only valid where the key has no flip already.
    if (!recording[ch].some((t) => t >= at && t <= until)) {
      return { ...recording, [ch]: [...recording[ch], at, until].sort((x, y) => x - y) };
    }
  }
  // mutate() picks a flip that lies in lo..hi but may then move it up to
  // maxShift ticks EARLIER than lo. The car's state at lo is a save state made
  // with the old keys, so such a candidate would be driven as one lap (the
  // flip taking effect at lo) and written down as another (the flip before
  // lo); the lap kept would then not be the lap that was timed. Measured on
  // the human desert4 lap with a section starting on a flip (tick 21180):
  // 236 of 1000 mutations did this, and a search that kept every finishing
  // candidate returned laps with flips at 21177 to 21179 (tests/test_worker.mjs).
  // Such candidates are thrown away and another is drawn.
  for (let attempt = 0; attempt < 8; attempt++) {
    const changed = mutate(recording, rng, { maxShift: o.maxShift, windowStart: lo, windowEnd: hi });
    if (sameBefore(changed, recording, lo)) return changed;
  }
  return recording; // (nearly impossible) no valid change drawn: an unchanged lap is never "faster"
}

/** Do two timelines have the same flips before tick `tick`? */
function sameBefore(a, b, tick) {
  for (const ch of CHANNELS) {
    const x = a[ch], y = b[ch];
    for (let i = 0; ; i++) {
      const xi = i < x.length && x[i] < tick ? x[i] : -1, yi = i < y.length && y[i] < tick ? y[i] : -1;
      if (xi !== yi) return false;
      if (xi === -1) break;
    }
  }
  return true;
}

/**
 * The repair step: the splice `lap` (gain `gain` at tick `cut`) did not
 * arrive in time, and the car left the old path at tick `left`. Search the
 * keys from `cut` to a tick w for a better match with the old path at w,
 * keeping the car's state at `cut` (the save state `point`, which this
 * function frees) fixed. Then drive to the finish again; if that fails too
 * and rounds are left, repair the next stretch from w.
 * Returns { recording, finishFrames } of a faster lap, or null.
 */
async function repair(lap, gain, cut, left, point, rng, o, stats, deadline) {
  for (let round = 0; round < o.repairRounds; round++) {
    const w = Math.min(Math.max(left ?? Infinity, cut + o.repairMin), cut + o.repairMax);
    // No room for a stretch and a rejoin after it: nothing to repair towards.
    if (w + 100 >= bestFrames) break;
    // How well the unrepaired lap matches at w: the score to beat.
    await env.loadState(point);
    let end = await driveTo(lap, cut, w);
    let score = (end && rejoin(end, o)?.score) ?? -Infinity;
    const scoreBefore = score;
    for (let k = 0; k < o.repairIters && performance.now() < deadline; k++) {
      const changed = change(lap, rng, cut, w - 1, o);
      await env.loadState(point);
      end = await driveTo(changed, cut, w);
      stats.repairTries++;
      const r = end && rejoin(end, o);
      if (!r || r.gain < 1 || r.score <= score) continue;
      // Better at w. The tail is the best lap again, shifted by the gain
      // measured at w (which the repair may have changed).
      score = r.score; gain = r.gain;
      lap = splice(changed, best, w, gain);
    }
    if (score <= scoreBefore) break; // nothing improved the match: the same tail would fail the same way
    // Move the save state on to w and try the finish from there.
    await env.loadState(point);
    await driveTo(lap, cut, w);
    env.dropState(point);
    point = await env.saveState(saved);
    cut = w;
    const tail = await driveTail(lap, cut, gain, cut, o);
    stats.repairDrives++;
    if (faster(tail, o)) { env.dropState(point); return { recording: lap, finishFrames: tail.finishFrames }; }
    left = tail.left;
  }
  env.dropState(point);
  return null;
}

/**
 * The search loop for one section. After a candidate's section has been
 * driven, up to two things are tried with it:
 *
 * SMALL STEP: drive on to the finish with the later keys exactly as they
 * are. The idea of sim/sectional.mjs was that this cannot work, because the
 * later keys are then late by whatever the change gained. On a human lap the
 * numbers are different. Measured on the human desert4 lap, of 165 single
 * changes in a 1.5 s section none was a full millisecond ahead at the end of
 * the section; the best were 0.2 to 0.5 ms ahead. A human lap is already
 * close to the best timing on its own line, so one change gains a fraction
 * of a millisecond there, or a few milliseconds further on by leaving the
 * car on a slightly different line, and the later keys still fit. A finish
 * time in whole ticks cannot see a gain of 0.3 ms, so the car's position
 * 30 ms before the finish is compared with the best lap's, which gives the
 * lap time to a fraction of a millisecond; a lap that finishes on the same
 * tick but is ahead by that measure becomes the best lap. Small steps add up
 * to whole milliseconds, and the later keys get re-timed along the way by
 * the changes made in their own sections.
 *
 * Which candidates are driven on: all but those far from the old path at
 * the end of the section (`followScore`). The rejoin score is NOT a good
 * guide beyond that. In one test (280 candidates driven on, desert4, section
 * at 16.5 s) the two largest gains, 8.4 and 3.4 ms, came from candidates
 * scoring between -30 and -2, which an earlier limit of -2 threw away; with
 * that limit the same section gained nothing.
 *
 * BIG STEP: if the small step was not faster, and the car was a whole
 * millisecond or more ahead and close to the old path at the end of the
 * section, the later keys are moved earlier by the gain and the lap is
 * driven on again, with the repair if that fails. In the tests on human laps
 * this never produced a kept step (see the README); it is the case
 * sim/sectional.mjs was built for and matters on slower starting laps.
 */
async function search(msg) {
  const o = { ...SEARCH_DEFAULTS, ...msg };
  const rng = createRng(msg.seed);
  const deadline = performance.now() + 1000 * msg.seconds;
  // tried: candidates; followed: driven on to the finish as a small step;
  // spliced: driven on as a big step; small / big / repaired: steps kept, by
  // kind (repaired = a big step that needed the repair).
  const stats = { tried: 0, followed: 0, spliced: 0, small: 0, big: 0, repaired: 0, repairTries: 0, repairDrives: 0 };
  let gained = 0;
  const accept = async (recording, how, tail) => {
    // The lead was measured against the lap being replaced, so the leads of
    // successive steps add up to the total gain (to the accuracy of the
    // measure; the parent only uses the sum to pick between processes).
    // A lap can finish a tick sooner without being ahead by this measure (the
    // finish is not decided by the car's centre alone; see the README), so
    // every kept step counts as at least the smallest gain.
    gained += Math.max(tail.lead ?? bestFrames - tail.finishFrames, o.minLead);
    best = recording;
    stats[how]++;
    // The new best lap's path. Driving it again (rather than keeping what the
    // candidate's drive saw) also checks that the lap repeats exactly.
    bestFrames = await recordPath(tail.finishFrames + 1);
    if (bestFrames !== tail.finishFrames) throw new Error(`a lap that finished on tick ${tail.finishFrames} finished on ${bestFrames} when driven again`);
  };

  while (performance.now() < deadline) {
    if (env.frames > CAR_TICK_BUDGET) await rebuild();
    // Close to the end of the lap there is no later path to rejoin, so the
    // candidate is simply driven to the finish.
    const toFinish = msg.end + 300 >= bestFrames;
    // Changes stop 100 ms before the section's end, so that their effect on
    // the car has shown by the time it is compared with the old path.
    const candidate = change(best, rng, start, toFinish ? bestFrames - LEAD_BEFORE : msg.end - 100, o);
    stats.tried++;
    await env.loadState(saved);
    let from = start, r = null, point = null;
    if (!toFinish) {
      const end = await driveTo(candidate, start, msg.end);
      r = end && rejoin(end, o);
      // Not worth the drive to the finish: nowhere near the old path.
      if (!r || r.score <= o.followScore) continue;
      from = msg.end; // the car is there now
      // A candidate for a big step: keep the car's state here for it.
      if (r.gain >= 1 && r.score > o.minScore && o.repairIters > 0) point = await env.saveState(saved);
      else r = null;
    }
    // Small step: carry on to the finish with the same keys.
    stats.followed++;
    let tail = await driveTail(candidate, from, 0, from, o);
    if (faster(tail, o)) {
      if (point) env.dropState(point);
      await accept(candidate, 'small', tail);
      continue;
    }
    if (!point) continue;
    // Big step: the same again from the end of the section with the later
    // keys moved earlier by the gain, then the repair if that fails too.
    stats.spliced++;
    const lap = splice(candidate, best, msg.end, r.gain);
    await env.loadState(point);
    tail = await driveTail(lap, msg.end, r.gain, msg.end, o);
    if (faster(tail, o)) {
      env.dropState(point);
      await accept(lap, 'big', tail);
    } else {
      const fixed = await repair(lap, r.gain, msg.end, tail.left, point, rng, o, stats, deadline);
      if (fixed) await accept(fixed.recording, 'repaired', { finishFrames: fixed.finishFrames });
    }
  }
  return { recording: best, frames: bestFrames, gained, stats };
}

process.on('message', async (msg) => {
  if (msg.track) {
    track = loadTrack(msg.track);
    process.send({ ready: true });
  } else if (msg.cmd === 'prepare' || msg.cmd === 'adopt') {
    best = msg.recording;
    if (msg.cmd === 'prepare') { start = msg.start; await rebuild(); }
    bestFrames = await recordPath(msg.limit);
    process.send({ id: msg.id, finishFrames: bestFrames });
  } else if (msg.cmd === 'search') {
    process.send({ id: msg.id, ...(await search(msg)) });
  } else if (msg.id != null) {
    process.send({ id: msg.id }); // 'noop': the parent sends every process a request per round
  }
});
