// Do save states keep the simulation deterministic?
//
// A save state copies the physics memory so a lap can be resumed from the
// middle instead of re-simulated from the start line. That is only useful if
// resuming gives exactly the same physics as never having stopped. This test
// drives a real human lap's inputs and checks, byte for byte:
//
//   A. Resume once.   Drive to tick SAVE_AT, snapshot, drive on to the finish
//                     (the "reference"). Restore, drive the same inputs again.
//                     The states after the restore must equal the reference.
//   B. Resume after disturbance. Drive 3 seconds of unrelated inputs (so the
//                     physics memory is thoroughly changed), restore, drive
//                     the real inputs again. Must equal the reference again.
//   C. Finish tick.   Every resumed run must finish on the lap's true tick.
//   D. Against a clean run. The reference itself must equal a lap driven with
//                     no snapshot ever taken, so that merely taking a snapshot
//                     is shown not to disturb anything.
//
// It also reports how big a snapshot is and how long save/restore take.
//
// Usage: node scripts/savestate_test.mjs [track]     (default: summer1)
import { createHash } from 'node:crypto';
import { Env, loadTrack } from '../sim/env.mjs';
import { decodeRecording, toDense } from '../sim/recording.mjs';
import { stateLength, decodeState } from '../sim/state.mjs';
import { loadHumanLap } from '../sim/drive.mjs';

const name = process.argv[2] ?? 'summer1';
/** Tick at which the snapshot is taken: mid-lap, after the first jump on summer1. */
const SAVE_AT = 9000;
/** Ticks per step call. Not a divisor of SAVE_AT's remainder on purpose, to
 *  exercise uneven chunking as well. */
const CHUNK = 7;

const human = loadHumanLap(name);
const total = human.frames; // the lap finishes on this tick
const keys = toDense(decodeRecording(human.recording), total);
const track = loadTrack(name);

/** Hash a list of states, ignoring the car id header and the stale tail (see sim/state.mjs). */
const hash = (states) => { const h = createHash('sha256'); for (const s of states) h.update(s.subarray(4, stateLength(s))); return h.digest('hex'); };

/** Drive the human's keys for ticks [from, to) and return every state. The
 *  keys can change on any tick, so a chunk ends early when they do. */
async function drive(env, from, to) {
  const out = [];
  const same = (a, b) => a.up === b.up && a.right === b.right && a.down === b.down && a.left === b.left && a.reset === b.reset;
  for (let t = from; t < to;) {
    let n = 1;
    while (n < CHUNK && t + n < to && same(keys[t + n], keys[t])) n++;
    out.push(...(await env.step(keys[t], n)));
    t += n;
  }
  return out;
}

const env = await Env.create();

// D's baseline: a lap with no snapshot anywhere near it.
env.reset(track);
const clean = await drive(env, 0, total);

// A. Drive to SAVE_AT, snapshot, drive to the finish.
env.reset(track);
await drive(env, 0, SAVE_AT);
let t0 = performance.now();
const snapshot = await env.saveState();
const saveMs = performance.now() - t0;
const reference = await drive(env, SAVE_AT, total);

t0 = performance.now();
await env.loadState(snapshot);
const restoreMs = performance.now() - t0;
const resumed = await drive(env, SAVE_AT, total);

// B. Disturb the physics with unrelated driving, then restore again.
for (let k = 0; k < 30; k++) await env.step({ up: k % 2 === 0, left: k % 3 === 0, right: k % 3 === 1, down: k % 5 === 0 }, 100);
await env.loadState(snapshot);
const resumedAgain = await drive(env, SAVE_AT, total);
await env.close();

const finishOf = (states) => decodeState(states.at(-1)).finishFrames;
const checks = {
  [`A. resume once: ${total - SAVE_AT} states identical to the uninterrupted run`]: hash(resumed) === hash(reference),
  'B. resume after 3 s of unrelated driving: identical again': hash(resumedAgain) === hash(reference),
  [`C. resumed runs finish on tick ${total}`]: finishOf(resumed) === total && finishOf(resumedAgain) === total,
  'D. taking a snapshot does not disturb the lap': hash(clean.slice(SAVE_AT)) === hash(reference),
};
console.log(`${name}: snapshot is ${(snapshot.bytes / 1e6).toFixed(1)} MB; save ${saveMs.toFixed(1)} ms, restore ${restoreMs.toFixed(1)} ms`);
for (const [label, ok] of Object.entries(checks)) console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
