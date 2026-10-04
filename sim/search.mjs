// Building blocks for timeline search (Stage 3).
//
// A lap is a "timeline": for each key, the list of ticks at which it flips
// between released and pressed (see sim/recording.mjs). Timeline search does
// not steer the car. It takes a lap that already finishes, nudges a few of
// those flip times at random, re-simulates the whole lap, and keeps the change
// if the lap got faster. Repeated thousands of times, this shaves off the
// time a hand-written controller wastes.
//
// This file holds the two pieces that do not touch the simulator:
//   createRng(seed)            a repeatable random number generator
//   mutate(recording, rng, o)  a slightly altered copy of a recording
import { CHANNELS } from './recording.mjs';

/**
 * Small seeded random number generator (the "mulberry32" algorithm).
 * Math.random cannot be seeded, and we want a search run to be repeatable:
 * same seed, same sequence of mutations, same result.
 * Returns a function giving a float in [0, 1).
 */
export function createRng(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random integer from lo to hi inclusive. */
const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

/** Keys the search is allowed to change. Reset is left alone: it teleports the
 *  car back to a checkpoint, which is never faster on a lap that finishes. */
const MUTABLE = CHANNELS.filter((ch) => ch !== 'reset');

/** Default mutation settings. Times are in ticks (1 tick = 1 ms). */
export const MUTATE_DEFAULTS = {
  // Largest distance a single flip can be moved, earlier or later.
  maxShift: 20,
  // Chance that a mutation deletes two neighbouring flips instead of moving
  // one. Deleting a press/release pair removes a key tap (or, between two
  // presses, fills in a gap). The baseline lap has thousands of short steering
  // taps and brake dabs, and many of them are not needed.
  removeChance: 0.2,
  // Only flips inside this tick range may be changed. The whole lap by default;
  // narrow it to polish one section.
  windowStart: 0,
  windowEnd: Infinity,
  // Each candidate gets at least one change, then another with this
  // probability, and so on. 0.5 gives 1 change half the time, 2 a quarter, ...
  // Mostly single changes, because the lap is chaotic: one early nudge already
  // alters everything after it, and stacking several rarely survives.
  extraChangeChance: 0.5,
};

/**
 * Return a mutated copy of `recording` (the input is not modified).
 *
 * A recording is { up: [...], right: [...], down: [...], left: [...],
 * reset: [...] }, each list holding the ticks at which that key flips, in
 * increasing order. Every operation here keeps the lists strictly increasing,
 * so the result is always a valid recording.
 */
export function mutate(recording, rng, options = {}) {
  const o = { ...MUTATE_DEFAULTS, ...options };
  const out = Object.fromEntries(CHANNELS.map((ch) => [ch, [...recording[ch]]]));

  do {
    // List every flip that lies inside the window, as [channel, index] pairs,
    // then pick one. Picking from one pooled list means keys with more flips
    // (steering) are changed more often, in proportion.
    const candidates = [];
    for (const ch of MUTABLE) {
      out[ch].forEach((tick, i) => { if (tick >= o.windowStart && tick <= o.windowEnd) candidates.push([ch, i]); });
    }
    if (!candidates.length) break;
    const [ch, i] = candidates[randInt(rng, 0, candidates.length - 1)];
    const flips = out[ch];

    if (rng() < o.removeChance && i + 1 < flips.length) {
      // Delete this flip and the next one on the same key.
      flips.splice(i, 2);
    } else {
      // Move this flip, but not past its neighbours (that would reorder the
      // list) and not before tick 0.
      const lowest = i > 0 ? flips[i - 1] + 1 : 0;
      const highest = i + 1 < flips.length ? flips[i + 1] - 1 : flips[i] + o.maxShift;
      const moved = Math.min(highest, Math.max(lowest, flips[i] + randInt(rng, -o.maxShift, o.maxShift)));
      flips[i] = moved;
    }
  } while (rng() < o.extraChangeChance);

  return out;
}

/** Total number of flips across all keys, for reporting. */
export const countFlips = (recording) => CHANNELS.reduce((n, ch) => n + recording[ch].length, 0);
