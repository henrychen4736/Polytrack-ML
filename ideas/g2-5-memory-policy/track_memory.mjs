// What the car remembers about its earlier attempts on ONE track, as a map
// indexed by distance along the track. No simulator and no network in here:
// it is fed attempt traces and asked for numbers.
//
//   const memory = new TrackMemory(line.length);
//   memory.commit(trace, { crashed: true, finished: false });
//   memory.features(edges, tick, out, offset);    // MEM_SIZE numbers for the policy
//   memory.clear();                               // a new track, or a new session
//
// ---------------------------------------------------------------------------
// WHAT IS REMEMBERED
//
// The track is cut into bins of BIN units of progress (today: distance along
// the reference line, rl/racing_env.mjs `progress`; with g2-1's human-free
// route it would be distance along that route, nothing else changes). For
// every bin, over all attempts since the last clear():
//
//   visits      how many attempts drove through it
//   crashes     how many attempts ENDED in it without finishing
//               ('stalled', 'off line', 'off track')
//   passSpeed   the highest speed (km/h) at which an attempt came through it
//   passLat     and SURVIVED: it was still going DOOM_MS later. With it, how
//   passTick    far left of the line the car was, and the lap clock, on that
//               attempt
//   failSpeed   the lowest speed at which an attempt came through it and was
//   failLat     DOOMED: it stopped making progress within DOOM_MS. With it,
//               the lateral offset on that attempt
//
// passSpeed and failSpeed are a bracket, in the sense of a bisection: "190
// through here was fine, 230 was not". The lowest failing speed and the
// highest surviving speed are the two tightest bounds an attempt can give.
// Speed is of course not the only cause of a crash, which is why the lateral
// offset is stored beside each: "fine at 190 half a unit left of the line,
// not fine at 185 three units right" is readable from the four numbers.
//
// Once one attempt has finished, passSpeed / passLat / passTick over the whole
// length are a complete lap the car has driven itself: speed, line and timing
// at every point. That is the same kind of information the human reference
// gives today, made by the car, which is why this fits a reference-free
// generalist (g2-1): on a community track the memory after the first finish
// is the only "reference lap" there is.
//
// Why DOOM_MS = 3000. A crash is decided before it happens: the car that
// misses a jump was too slow at take-off, seconds before 'stalled' fires.
// The existing failure starts (failureStart in racing_env.mjs) back off 1.5
// to 4 s from a crash site for the same reason; 3 s is inside that range.
// It is an assumption, not a measured optimum; it is one constant.
//
// ---------------------------------------------------------------------------
// WHAT THE POLICY IS SHOWN: MEM_SIZE = 130 numbers, appended to the observation
//
// The observation already describes the road at the car and at 20 points
// ahead (gap = max(2 units, 0.15 s x speed) apart). The memory is read out
// over the SAME 21 stretches, so "what happened here before" lines up with
// "what the road looks like here": stretch k runs from point k to point k+1
// (stretch 0 starts at the car). A stretch covers several bins (6 at 300
// km/h), so each number is taken over all of them, and a crash site can never
// fall between two samples.
//
//   per stretch (PER_POINT = 6), 21 stretches:
//     0  visits      most visits of any bin in it, min(n, 4) / 4
//     1  crashes     crashes that ended in it, min(n, 3) / 3
//     2  passSpeed   highest surviving speed in it / 300      (0 = none known)
//     3  passLat     lateral offset on that attempt / 10, clipped to +-3
//     4  failSpeed   lowest doomed speed in it / 300          (0 = none known)
//     5  failLat     lateral offset on that attempt / 10
//   then GLOBALS = 4:
//     126  attempts made on this track, min(n, 8) / 8          (0 = first try)
//     127  has any attempt finished? 0 or 1
//     128  lap clock now minus passTick of the bin the car is in, seconds / 2,
//          clipped to +-3: behind (+) or ahead (-) of its own best surviving
//          pass through here. 0 if nothing is known.
//     129  how far beyond the car the furthest attempt got, units / 100,
//          clipped to 0..3. 0 = the car is at or past everything it has seen.
//
// On a first attempt every one of the 130 is zero, so "no memory" is a plain,
// recognisable input, and a network whose memory weights are zero drives
// exactly as it did without the memory (checked in smoke_test.py).

/** Width of a memory bin in units of progress. The reference line has one
 *  point per unit; 2 units is 24 ms of driving at 300 km/h, about half a
 *  decision, so consecutive decisions never skip more than two bins. */
export const BIN = 2;
/** A crash dooms the stretch driven in this many ms before the car stopped
 *  making progress (see "Why DOOM_MS" above). */
export const DOOM_MS = 3000;
/** Stretches read out: the car's own and the 20 lookahead points'. */
export const POINTS = 21;
export const PER_POINT = 6;
export const GLOBALS = 4;
export const MEM_SIZE = POINTS * PER_POINT + GLOBALS;

const SPEED_SCALE = 300, LATERAL_SCALE = 10, CLIP = 3;
const clip = (v, lo = -CLIP, hi = CLIP) => Math.max(lo, Math.min(hi, v));

export class TrackMemory {
  /** `length`: the track's length in units of progress. */
  constructor(length) {
    this.count = Math.ceil(length / BIN) + 1;
    this.visits = new Uint16Array(this.count);
    this.crashes = new Uint16Array(this.count);
    this.passSpeed = new Float32Array(this.count);
    this.passLat = new Float32Array(this.count);
    this.passTick = new Float32Array(this.count);
    this.failSpeed = new Float32Array(this.count);
    this.failLat = new Float32Array(this.count);
    this.clear();
  }

  /** Forget everything: a new track, a new reference line (bins are positions
   *  on the old one), or the start of a new session in training. */
  clear() {
    for (const a of [this.visits, this.crashes, this.passSpeed, this.passLat, this.passTick, this.failSpeed, this.failLat]) a.fill(0);
    this.attempts = 0;
    this.finishes = 0;
    this.bestFinish = null;   // fastest finished lap, ticks
    this.furthest = 0;        // furthest progress any attempt reached, units
  }

  bin(progress) { return Math.max(0, Math.min(this.count - 1, Math.floor(progress / BIN))); }

  /**
   * Add one finished attempt to the map.
   *
   *   trace     one sample per decision, in order, the first taken at the
   *             attempt's start: { progress, speedKmh, lateral, tick }
   *   crashed   the attempt ended as 'stalled', 'off line' or 'off track'
   *   finished  it crossed the finish line
   *   (neither: it ran out of time; the tail is then neither doomed nor a
   *   proven pass and is only counted as visited)
   *   finishFrames  lap time in ticks, if it finished from the start line
   *
   * Returns { crashBin, doomedBins, passBins } for logging and tests.
   */
  commit(trace, { crashed = false, finished = false, finishFrames = null } = {}) {
    if (!trace.length) return { crashBin: null, doomedBins: 0, passBins: 0 };
    let furthest = -Infinity;
    for (const s of trace) furthest = Math.max(furthest, s.progress);
    // When the car stopped getting anywhere: the first sample within a unit
    // of the furthest point it ever reached. For 'stalled' that is 2 s before
    // the episode's last tick (the stall clock), for the others about the end.
    const impactTick = trace.find((s) => s.progress >= furthest - 1).tick;
    const lastTick = trace.at(-1).tick;
    // Samples before this tick came through and were still going DOOM_MS later.
    const provenBefore = finished ? Infinity : (crashed ? impactTick : lastTick) - DOOM_MS;

    // `reached`: the last bin already credited. It starts just behind the
    // attempt's first bin, so the road before a part-way start is not counted
    // as driven.
    let doomedBins = 0, passBins = 0, reached = this.bin(trace[0].progress) - 1;
    for (const s of trace) {
      // Each bin is credited once per attempt, to the first sample that
      // reached it; a car sliding backwards adds nothing.
      const upTo = this.bin(s.progress);
      for (let b = Math.max(0, reached + 1); b <= upTo; b++) {
        this.visits[b]++;
        if (s.tick < provenBefore) {
          passBins++;
          if (s.speedKmh > this.passSpeed[b]) { this.passSpeed[b] = s.speedKmh; this.passLat[b] = s.lateral; this.passTick[b] = s.tick; }
        } else if (crashed && s.tick <= impactTick) {
          doomedBins++;
          // 0 means "none known", so a doomed pass at a standstill is stored
          // as 1 km/h.
          const speed = Math.max(1, s.speedKmh);
          if (this.failSpeed[b] === 0 || speed < this.failSpeed[b]) { this.failSpeed[b] = speed; this.failLat[b] = s.lateral; }
        }
      }
      reached = Math.max(reached, upTo);
    }
    let crashBin = null;
    if (crashed) { crashBin = this.bin(furthest); this.crashes[crashBin]++; }
    this.attempts++;
    if (finished) {
      this.finishes++;
      if (finishFrames != null && (this.bestFinish == null || finishFrames < this.bestFinish)) this.bestFinish = finishFrames;
    }
    this.furthest = Math.max(this.furthest, furthest);
    return { crashBin, doomedBins, passBins };
  }

  /**
   * Write the MEM_SIZE numbers for the policy into out[offset ...].
   *
   *   edges   POINTS + 1 progress values: the car's, each lookahead point's,
   *           and one more to close the last stretch. Stretch k covers the
   *           bins from edges[k] up to (not including) edges[k + 1], and at
   *           least one bin.
   *   tick    the lap clock now (for the ahead / behind number)
   */
  features(edges, tick, out, offset = 0) {
    for (let k = 0; k < POINTS; k++) {
      const at = offset + PER_POINT * k;
      for (let j = 0; j < PER_POINT; j++) out[at + j] = 0;
      // Past the end of the track there is nothing to say (all zero).
      if (edges[k] >= (this.count - 1) * BIN) continue;
      const from = this.bin(edges[k]);
      const to = Math.max(from + 1, Math.min(this.count, Math.floor(edges[k + 1] / BIN)));
      let visits = 0, crashes = 0, pass = -1, fail = -1;
      for (let b = from; b < to; b++) {
        visits = Math.max(visits, this.visits[b]);
        crashes += this.crashes[b];
        if (this.passSpeed[b] > 0 && (pass < 0 || this.passSpeed[b] > this.passSpeed[pass])) pass = b;
        if (this.failSpeed[b] > 0 && (fail < 0 || this.failSpeed[b] < this.failSpeed[fail])) fail = b;
      }
      out[at] = Math.min(visits, 4) / 4;
      out[at + 1] = Math.min(crashes, 3) / 3;
      if (pass >= 0) { out[at + 2] = this.passSpeed[pass] / SPEED_SCALE; out[at + 3] = clip(this.passLat[pass] / LATERAL_SCALE); }
      if (fail >= 0) { out[at + 4] = this.failSpeed[fail] / SPEED_SCALE; out[at + 5] = clip(this.failLat[fail] / LATERAL_SCALE); }
    }
    const g = offset + PER_POINT * POINTS;
    const here = this.bin(edges[0]);
    out[g] = Math.min(this.attempts, 8) / 8;
    out[g + 1] = this.finishes > 0 ? 1 : 0;
    out[g + 2] = this.passSpeed[here] > 0 ? clip((tick - this.passTick[here]) / 2000) : 0;
    out[g + 3] = clip((this.furthest - edges[0]) / 100, 0, CLIP);
    return out;
  }
}
