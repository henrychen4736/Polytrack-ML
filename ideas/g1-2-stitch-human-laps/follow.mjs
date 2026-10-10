// Following a donor lap from a car state that is NOT on it, with and without
// repair. This is the part of lap stitching that touches the simulator.
//
// The problem: when a lap switches from player A's keys to player B's, the car
// is near where B's car was, not exactly there, and the simulator is chaotic,
// so B's keys played blindly drift off B's path and usually crash (measured
// numbers are in README.md).
//
// Three ways to follow, in rising cost:
//
//   raw      play the donor's keys from the matched tick on. One time shift,
//            chosen at the join, and never looked at again.
//   resync   every `window` ticks ask "which tick of the donor's lap is my car
//            nearest to now?" and continue the donor's keys from THAT tick.
//            Costs nothing; it corrects the car being early or late and
//            nothing else.
//   repair   every `window` ticks, save the state and try a small set of
//            corrections to the next keys (a few ms earlier or later, a short
//            extra tap of steering, a short lift or press of the throttle).
//            Each is driven `window + look` ticks ahead and scored by how far
//            the car then is from the donor's state (position, velocity,
//            orientation, spin, steering: mismatch() in paths.mjs). The best
//            one is kept for `window` ticks, and the process repeats. In other
//            words a short local search that steers the car back onto the
//            donor's path, redone as the car moves along.
//
// Keys are handled per tick (keys[t] = what is held on tick t), never as flip
// lists, so a join needs no parity fix-up (the job of splice() in
// sim/sectional.mjs): the first tick after the join simply holds whatever the
// donor held.
import { mismatch, stateAt, locate } from './paths.mjs';

export const FOLLOW_DEFAULTS = {
  window: 200,     // ticks between corrections
  look: 200,       // extra ticks a candidate is driven before it is scored:
                   // a correction that looks good after 200 ms and is in the
                   // wall after 400 must not win
  slack: 80,       // how many ticks either side of the expected donor tick to look for the car
  lostDistance: 5, // units from the donor's path at which the follow is given up
  good: 6,         // repair: if the uncorrected keys already score below this
                   // (ms of mismatch), skip the search for this window
  timeWeight: 2,   // repair: ms of mismatch one ms of time gained is worth.
                   // Measured on two desert4 joins followed to the finish:
                   // 0 lost 17 and 95 ms against the donor, 0.5 lost 15 and 48,
                   // 2 lost 7 and 39
};

const NONE = { up: false, right: false, down: false, left: false, reset: false };
/** The donor's keys for `n` ticks starting at its tick `from`. Past the end of
 *  the lap the last keys are held, as the game does. */
function donorKeys(donor, from, n) {
  const out = new Array(n);
  for (let k = 0; k < n; k++) out[k] = donor.keys[Math.min(donor.frames - 1, Math.max(0, from + k))] ?? NONE;
  return out;
}

/** The corrections tried in one repair window: each turns the donor's tick
 *  and the plain keys into a candidate key list. */
function corrections(donor, at, n) {
  const list = [];
  // The whole stretch earlier or later.
  for (const shift of [-16, -8, -4, -2, -1, 1, 2, 4, 8, 16]) list.push(donorKeys(donor, at + shift, n));
  const base = donorKeys(donor, at, n);
  const override = (ticks, change) => base.map((c, k) => (k < ticks ? { ...c, ...change } : c));
  // A short tap of steering at the start of the window, each way, or none.
  for (const ticks of [8, 16, 32, 64]) {
    list.push(override(ticks, { left: true, right: false }));
    list.push(override(ticks, { left: false, right: true }));
    list.push(override(ticks, { left: false, right: false }));
  }
  // A short lift, or a short press, of the throttle.
  for (const ticks of [20, 60]) {
    list.push(override(ticks, { up: false }));
    list.push(override(ticks, { up: true, down: false }));
  }
  const key = (keys) => keys.map((c) => (c.up ? 1 : 0) | (c.right ? 2 : 0) | (c.down ? 4 : 0) | (c.left ? 8 : 0)).join('');
  const seen = new Set([key(base)]);
  // Many corrections change nothing (a left tap while the donor is already
  // steering left): drop those rather than drive them.
  return list.filter((keys) => { const k = key(keys); if (seen.has(k)) return false; seen.add(k); return true; });
}

/** The car's state now in the form mismatch() takes. */
export function carState(sim) {
  const m = sim.motion();
  return {
    position: sim.state.position, quaternion: sim.state.quaternion, velocity: m.velocity, spin: m.spin,
    steering: sim.state.steering, wheels: sim.state.wheelContact.filter(Boolean).length,
  };
}

/** Where on the donor's lap the car is and how well it matches there:
 *  { tick, cost, distance, ... } (mismatch() fields plus the donor tick). */
export function compare(sim, donor, expected, slack) {
  const car = carState(sim);
  const { tick } = locate(donor, car.position, expected - slack, expected + slack);
  return { tick, ...mismatch(car, stateAt(donor, tick)) };
}

/**
 * Follow `donor` (a path from paths.mjs) from the car's present state.
 *
 *   sim        a SimSession, car already driven to the join
 *   donor      the lap to follow
 *   donorTick  the donor tick the car is at now
 *   until      stop once the car has reached this donor tick (Infinity = to
 *              the finish line)
 *   mode       'raw' | 'resync' | 'repair'
 *
 * Returns { donorTick, finished, lost, cost, distance, contactTicks, tried }:
 *   donorTick  where on the donor's lap the car is at the end
 *   lost       the car got more than lostDistance from the donor's path
 *   cost       mismatch against the donor there, ms (see MISMATCH_WEIGHTS)
 *   tried      candidates driven by the repair search
 * The keys driven are in sim.keys as always.
 */
export async function follow(sim, donor, donorTick, until, mode, options = {}) {
  const o = { ...FOLLOW_DEFAULTS, ...options };
  let at = donorTick, contactTicks = 0, tried = 0;
  let now = compare(sim, donor, at, o.slack);
  // A car that has run out of donor lap without crossing the line (it missed
  // the finish, or stopped) would otherwise be followed for ever.
  const lastTick = sim.tick + (donor.frames - donorTick) + 1500;
  while (!sim.finished && at < until) {
    if (sim.tick > lastTick) return { donorTick: at, finished: false, lost: true, cost: now.cost, distance: now.distance, contactTicks, tried };
    // Do not drive far past `until`: the caller wants to switch laps there.
    const n = Math.min(o.window, Math.max(1, until - at));
    let keys = donorKeys(donor, at, n);
    if (mode === 'repair') {
      const horizon = n + o.look;
      const start = await sim.save();
      // Score of a candidate: mismatch at the end of the horizon, less a
      // little for being further along the donor's lap.
      const score = async (candidate) => {
        await sim.load(start);
        const r = await sim.drive(candidate);
        tried++;
        if (r.finished) return -1e6 - (horizon - (r.tick - start.tick)); // finishing sooner is best of all
        const c = compare(sim, donor, at + horizon, o.slack);
        return c.cost - o.timeWeight * (c.tick - at - horizon) + (c.distance > o.lostDistance ? 1e6 : 0);
      };
      const base = donorKeys(donor, at, horizon);
      let best = base, bestScore = await score(base);
      if (bestScore > o.good) {
        for (const candidate of corrections(donor, at, horizon)) {
          const s = await score(candidate);
          if (s < bestScore) { bestScore = s; best = candidate; }
        }
      }
      await sim.load(start);
      sim.drop(start);
      keys = best.slice(0, n);
    }
    const r = await sim.drive(keys);
    contactTicks += r.contactTicks;
    if (sim.finished) break;
    // Raw trusts the clock; the other two ask where the car really is.
    now = compare(sim, donor, at + n, mode === 'raw' ? 0 : o.slack);
    if (mode === 'raw') now.distance = compare(sim, donor, at + n, o.slack).distance; // the path, not the clock, decides "lost"
    at = now.tick;
    o.trace?.(sim.tick, now);
    if (now.distance > o.lostDistance) return { donorTick: at, finished: false, lost: true, cost: now.cost, distance: now.distance, contactTicks, tried };
  }
  return { donorTick: at, finished: sim.finished, lost: false, cost: now.cost, distance: now.distance, contactTicks, tried };
}
