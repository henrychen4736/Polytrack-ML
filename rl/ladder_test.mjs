// Does starting an episode from a save state give exactly the car that the
// slow way gives?
//
// rl/racing_env.mjs places the car part-way round a lap by restoring a save
// state from its "ladder" and replaying a few ticks. The slow way, which it
// replaced, is to make a new car and replay the human's keys all the way from
// the start line. Both must lead to the same physics, or training would be
// practising from positions the real game can never reach.
//
// For several start points this script:
//   1. resets the RacingEnv there (ladder), then holds throttle for 500 ticks;
//   2. does the same with a plain Env and a brand-new car (slow way);
//   3. compares every one of those 500 states byte for byte.
// It repeats the starts in a second pass, after the car has been driven
// elsewhere, to show a rung can be reused. It also reports what the ladder
// costs to build and to use.
//
// Usage: node rl/ladder_test.mjs [track]     (default: summer1)
import { RacingEnv } from './racing_env.mjs';
import { Env, loadTrack } from '../sim/env.mjs';
import { decodeRecording, toDense } from '../sim/recording.mjs';
import { stateLength } from '../sim/state.mjs';
import { loadHumanLap } from '../sim/drive.mjs';

const name = process.argv[2] ?? 'summer1';
const AFTER = 500; // ticks driven after each start, compared state by state
const THROTTLE = { up: true };

const human = loadHumanLap(name);
const keys = toDense(decodeRecording(human.recording), human.frames);
const track = loadTrack(name);

/** The part of a state buffer that is real data: skip the car id (the two
 *  ways use different cars) and the stale tail (see sim/state.mjs). */
const body = (u8) => Buffer.from(u8.subarray(4, stateLength(u8)));
const same = (a, b) => a.length === b.length && a.every((s, k) => body(s).equals(body(b[k])));

// Start points as fractions of the human's lap, including 0 (the start line).
const fractions = [0, 0.03, 0.2, 0.5, 0.77, 0.9];

const renv = await RacingEnv.create({ track: name });
let t0 = performance.now();
await renv.reset({ startFraction: 0 }); // the first reset builds the ladder
const buildMs = performance.now() - t0;

const slow = await Env.create(1);
let allOk = true;
const resetTimes = [];
for (const pass of [1, 2]) {
  for (const fraction of fractions) {
    const startTick = Math.floor(fraction * human.frames);

    // 1. Ladder.
    t0 = performance.now();
    await renv.reset({ startFraction: fraction });
    resetTimes.push(performance.now() - t0);
    const viaLadder = await renv.env.step(THROTTLE, AFTER);

    // 2. Slow way. The start line is "one tick with no keys"; anywhere else is
    // the human's keys from tick 0 (the two are different by design).
    slow.reset(track);
    if (startTick === 0) await slow.step({}, 1);
    else for (let t = 0; t < startTick; t++) await slow.step(keys[t], 1);
    const viaReplay = await slow.step(THROTTLE, AFTER);

    // 3. Compare.
    const ok = same(viaLadder, viaReplay);
    allOk &&= ok;
    console.log(`${ok ? 'PASS' : 'FAIL'} pass ${pass}, start at ${(100 * fraction).toFixed(0)}% (tick ${startTick}): ${AFTER} states after the start are ${ok ? 'identical' : 'DIFFERENT'}`);
  }
}

const rungs = renv.ladder.rungs.length;
resetTimes.sort((a, b) => a - b);
console.log(`\n${name}: ladder of ${rungs} rungs built in ${buildMs.toFixed(0)} ms, ${(renv.ladderBytes / 1e6).toFixed(1)} MB in total ` +
  `(${((renv.ladderBytes - renv.ladder.base.bytes) / 1e3 / rungs).toFixed(0)} kB per rung on top of one ${(renv.ladder.base.bytes / 1e6).toFixed(1)} MB full copy)`);
console.log(`reset from the ladder: median ${resetTimes[resetTimes.length >> 1].toFixed(1)} ms, slowest ${resetTimes.at(-1).toFixed(1)} ms`);
await renv.close();
await slow.close();
process.exit(allOk ? 0 : 1);
