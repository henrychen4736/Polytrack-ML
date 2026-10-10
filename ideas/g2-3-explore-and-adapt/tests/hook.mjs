// A meter for explore.mjs, loaded BEFORE it with `node --import <this file>`.
//
// explore.mjs is a script, not a module, so its bookkeeping cannot be read
// from outside. This wraps the methods of RacingEnv it calls and keeps an
// independent record of what the simulator was really asked to do:
//
//   blocks, ticks   block decisions stepped and lap-clock ticks they advanced
//                   (the script reports its cost from its own counter)
//   history         the decisions that really led to the car's present state:
//                   emptied on a start from the line, copied into a mark,
//                   put back on a rewind. When an attempt finishes, this is
//                   the lap the simulator actually drove, whatever the script
//                   wrote down.
//   marks, rewinds, drops, resets, cars     counts
//
// At exit it writes all of it to the file named in G23_HOOK_OUT.
//
// G23_FRESH_AFTER=n: when the n-th attempt ends, make the simulator's car look
// used up (env.frames above the 4.5 million budget), so that the script's
// next start builds a new car and has to rebuild a cell by replaying its
// decisions. That path exists in explore.mjs and has never run otherwise.
// Nothing is stepped between the end of an attempt and the next start, so the
// false counter is never used for stepping: the new car puts it back to 0.
import { writeFileSync } from 'node:fs';
import { RacingEnv } from '../../../rl/racing_env.mjs';

const out = process.env.G23_HOOK_OUT;
const freshAfter = Number(process.env.G23_FRESH_AFTER ?? 0);
const m = { blocks: 0, ticks: 0, resets: 0, marks: 0, rewinds: 0, drops: 0, episodes: 0, cars: 0, forcedFresh: 0, finished: null };
let history = [];
let lastCar = null;
const marked = new WeakMap();
const P = RacingEnv.prototype;

const reset = P.reset;
P.reset = async function (options = {}) {
  const r = await reset.call(this, options);
  if (this.env.carId !== lastCar) { lastCar = this.env.carId; m.cars++; }
  m.resets++;
  history = [];
  return r;
};

const stepBlock = P.stepBlock;
P.stepBlock = async function (decision) {
  const before = this.state.frames;
  const r = await stepBlock.call(this, decision);
  m.blocks++;
  m.ticks += this.state.frames - before;
  history.push(decision.slice());
  if (r.terminated || r.truncated) {
    m.episodes++;
    if (r.terminated && !m.finished) m.finished = { finishFrames: this.state.finishFrames, decisions: history.slice() };
    if (m.episodes === freshAfter) { this.env.frames = 5_000_001; m.forcedFresh++; }
  }
  return r;
};

const mark = P.mark;
P.mark = async function () {
  const k = await mark.call(this);
  marked.set(k, history.slice());
  m.marks++;
  return k;
};

const rewind = P.rewind;
P.rewind = async function (k) {
  const r = await rewind.call(this, k);
  history = marked.get(k).slice();
  m.rewinds++;
  return r;
};

const dropMark = P.dropMark;
P.dropMark = function (k) { m.drops++; return dropMark.call(this, k); };

process.on('exit', () => { if (out) writeFileSync(out, JSON.stringify(m)); });
