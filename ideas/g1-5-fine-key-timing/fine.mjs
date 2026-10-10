// Shared pieces of the fine key-timing search: the two ways a key change can
// be moved, the lap-time measure finer than one tick, and the evaluator that
// spreads candidates over the simulator processes.
//
// A lap is a timeline: { up: [flip ticks], right, down, left, reset }, each
// list strictly increasing (sim/recording.mjs). A "flip" is one entry: the
// tick at which one key is pressed or released. The searched laps have about
// 80 to 140 of them, all on ticks of the form 10k + 1 (the block policy's
// 10 ms slices after the one empty tick).
// The shared pool, not sim/pool.mjs: the same interface, but a worker that
// throws fails the request instead of leaving this process waiting for ever.
import { createPool } from '../shared/pool.mjs';
import { CHANNELS } from '../../sim/recording.mjs';

/** Keys whose flips are moved. Reset is never used by a finishing lap. */
export const MOVABLE = CHANNELS.filter((ch) => ch !== 'reset');

const copy = (timeline) => Object.fromEntries(CHANNELS.map((ch) => [ch, [...timeline[ch]]]));

/** Every flip of the movable keys as { ch, i, tick }, in order of tick. */
export function listFlips(timeline) {
  const out = [];
  for (const ch of MOVABLE) timeline[ch].forEach((tick, i) => out.push({ ch, i, tick }));
  return out.sort((a, b) => a.tick - b.tick);
}

/**
 * MOVE 1, "nudge": flip `i` of key `ch` happens `d` ticks later (earlier if
 * negative); every other flip stays where it is. Returns the new timeline, or
 * null if the flip would reach or pass its neighbour on the same key (that
 * would be a different lap: a key tap removed, not a timing changed).
 */
export function nudge(timeline, ch, i, d) {
  const flips = timeline[ch], t = flips[i] + d;
  if (t < 0 || (i > 0 && t <= flips[i - 1]) || (i + 1 < flips.length && t >= flips[i + 1])) return null;
  const out = copy(timeline);
  out[ch][i] = t;
  return out;
}

/**
 * MOVE 2, "tail shift": every flip of every key at or after tick `from` moves
 * by `d` ticks together. This is the move for "the car now reaches everything
 * later d ticks sooner": a nudge that gains 3 ms leaves all later key changes
 * 3 ms late, and no single later nudge fixes that, but one tail shift does.
 * Returns null if a shifted flip would reach or pass an unshifted one on the
 * same key.
 */
export function shiftTail(timeline, from, d) {
  const out = copy(timeline);
  for (const ch of MOVABLE) {
    const flips = out[ch];
    for (let i = 0; i < flips.length; i++) {
      if (flips[i] < from) continue;
      if (flips[i] + d < 0 || (i > 0 && flips[i - 1] < from && flips[i] + d <= flips[i - 1])) return null;
      flips[i] += d;
    }
  }
  return out;
}

/**
 * A lap time finer than one tick.
 *
 * The game's lap time is a whole number of ticks, so two laps that both finish
 * on tick 21907 look equal even if one crossed the line 0.9 ms sooner, and a
 * search that only sees ticks cannot add up gains smaller than 1 ms. This
 * gives the fraction: how far past a fixed plane across the finish the car is
 * on its finish tick, divided by its speed.
 *
 *   plane    { point, normal }: the reference lap's car position on its finish
 *            tick and its unit direction of travel there (makePlane)
 *   result   a child's reply to 'try'
 * Returns ticks (ms), e.g. 21906.37, or Infinity if the lap did not finish.
 *
 * It assumes the finish is detected on a flat plane square to the direction
 * the reference lap crossed it. That is only used to rank laps with the SAME
 * finish tick (better() below), so if the assumption is off, the worst case
 * is a wasted tie-break, never a slower lap.
 */
export function subTick(plane, result) {
  if (!result.finished || !result.velocity) return Infinity;
  const past = [0, 1, 2].reduce((sum, k) => sum + (result.position[k] - plane.point[k]) * plane.normal[k], 0);
  const speed = [0, 1, 2].reduce((sum, k) => sum + result.velocity[k] * plane.normal[k], 0) / 1000; // units per tick
  return speed > 0 ? result.finishFrames - past / speed : result.finishFrames;
}

/** The plane subTick() measures against, from a 'try' reply of the reference lap. */
export function makePlane(result) {
  const speed = Math.hypot(...result.velocity);
  return { point: result.position, normal: result.velocity.map((v) => v / speed) };
}

/** Is score `a` better than `b`? A score is { frames, fine }: whole finish
 *  ticks first (the only thing the game counts), sub-tick time to break ties. */
export const better = (a, b) => a.frames < b.frames || (a.frames === b.frames && a.fine < b.fine - 1e-6);

/**
 * The simulator processes.
 *   const sims = await openSims('desert4', 2);
 *   await sims.prepare(timeline, start);            // every process: car at tick `start`
 *   const results = await sims.tryAll(timelines, maxFrames, samples);
 *   sims.close();
 * tryAll takes any number of timelines and runs them `workers` at a time; all
 * must equal the prepared timeline before `start`.
 */
export async function openSims(track, workers = 2) {
  const pool = await createPool(track, workers, '../ideas/g1-5-fine-key-timing/child.mjs');
  return {
    workers,
    tries: 0,
    prepare: (timeline, start) => pool.runAll(Array.from({ length: workers }, () => ({ cmd: 'prepare', timeline, start }))),
    async tryAll(timelines, maxFrames, samples = []) {
      const out = [];
      for (let k = 0; k < timelines.length; k += workers) {
        out.push(...await pool.runAll(timelines.slice(k, k + workers).map((timeline) => ({ cmd: 'try', timeline, maxFrames, samples }))));
      }
      this.tries += timelines.length;
      return out;
    },
    close: () => pool.close(),
  };
}

/** Command-line arguments in the form the scripts/ files use: bare words and key=value. */
export function parseArgs(argv = process.argv.slice(2)) {
  return {
    words: argv.filter((a) => !a.includes('=')),
    opt: Object.fromEntries(argv.filter((a) => a.includes('=')).map((a) => a.split('='))),
  };
}
