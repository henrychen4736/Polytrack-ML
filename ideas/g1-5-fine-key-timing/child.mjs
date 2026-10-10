// One simulator process for the fine key-timing search (refine.mjs,
// smoothness.mjs). Started through sim/pool.mjs:
//   createPool(track, n, '../ideas/g1-5-fine-key-timing/child.mjs')
//
// The job of a child: "here is the lap as it stands and the tick just before
// the key change I am about to move" (prepare), then many times "here is the
// lap with that change moved; drive it from that tick and tell me when it
// finishes" (try). The part of the lap before the tick is never driven twice.
//
// Requests (a timeline is { up: [flip ticks], right, down, left, reset }):
//   { cmd: 'prepare', timeline, start }
//       Put the car at tick `start` of `timeline` and save that state.
//       Reply { tick }.
//   { cmd: 'try', timeline, maxFrames, samples? }
//       Restore the prepared state and drive `timeline` from there, up to
//       tick maxFrames or the finish. `timeline` must have the same keys as
//       the prepared one before `start`. `samples` is an optional increasing
//       list of ticks at which to report the car on the way.
//       Reply { finished, finishFrames, contactTicks, position, velocity,
//               samples: [{ frames, position, quaternion, velocity }] }
//       position / velocity are the car at the end of the drive (at the
//       finish tick if it finished); the parent turns them into a lap time
//       finer than one tick (subTick in fine.mjs).
//
// THE LADDER. prepare() needs the car at `start`. Driving there from the
// start line each time would cost more than the tries themselves (a pass over
// a 22 s lap visits about 80 key changes, 11 s from the start on average), so
// the child keeps a save state every LADDER ticks along the lap as it goes and
// starts from the nearest one that is still valid. A state at tick T is valid
// for a timeline exactly when the two laps have the same key changes before T.
import { SimSession } from '../shared/sim_session.mjs';
import { toDense, CHANNELS } from '../../sim/recording.mjs';

/** Ticks between ladder save states. A save is 5 ms and 0.18 MB (measured,
 *  CONTRACT.md); 500 ticks of driving is about 15 ms, so finer than this would
 *  spend more on saving than it saves on driving. */
const LADDER = 500;

let sim = null;
let ladder = [];      // [{ tick, point, timeline }], increasing tick
let prepared = null;  // the point `try` restores

/** Do two timelines hold the same keys on every tick before `tick`? */
function samePrefix(a, b, tick) {
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

async function prepare({ timeline, start }) {
  // A car can only be stepped a few million ticks in its life (CONTRACT.md,
  // "Car tick budget"); a fresh one loses every save state, hence the ladder.
  if (!sim.budgetLeft || sim.keys === undefined) { await sim.restart(); ladder = []; }
  // Drop ladder states that the new timeline has changed underneath.
  ladder = ladder.filter((rung) => {
    if (samePrefix(rung.timeline, timeline, rung.tick)) return true;
    sim.drop(rung.point);
    return false;
  });
  const keys = toDense(timeline, start);
  const from = ladder.filter((rung) => rung.tick <= start).at(-1);
  if (from) await sim.load(from.point);
  else if (sim.tick !== 0) { await sim.restart(); ladder = []; }
  // Drive to `start`, leaving a ladder state at every multiple of LADDER.
  while (sim.tick < start) {
    const next = Math.min(start, (Math.floor(sim.tick / LADDER) + 1) * LADDER);
    await sim.drive(keys.slice(sim.tick, next));
    if (sim.finished) throw new Error(`prepare: the lap finishes before tick ${start}`);
    if (sim.tick % LADDER === 0 && !ladder.some((rung) => rung.tick === sim.tick)) {
      ladder.push({ tick: sim.tick, point: await sim.save(), timeline });
      ladder.sort((a, b) => a.tick - b.tick);
    }
  }
  // The prepared state is its own save, so the ladder can be pruned freely.
  if (prepared) sim.drop(prepared);
  prepared = await sim.save();
  return { tick: sim.tick };
}

const snapshot = () => ({
  frames: sim.tick, position: sim.state.position, quaternion: sim.state.quaternion, velocity: sim.motion()?.velocity ?? null,
});

async function attempt({ timeline, maxFrames, samples = [] }) {
  await sim.load(prepared);
  const keys = toDense(timeline, maxFrames);
  const out = [];
  let contactTicks = 0;
  for (const stop of [...samples, maxFrames]) {
    if (sim.finished || stop <= sim.tick || stop > maxFrames) continue;
    contactTicks += (await sim.drive(keys.slice(sim.tick, stop))).contactTicks;
    if (!sim.finished && stop !== maxFrames) out.push(snapshot());
  }
  const end = snapshot();
  return {
    finished: sim.finished, finishFrames: sim.finished ? sim.state.finishFrames : null, contactTicks,
    position: end.position, velocity: end.velocity, samples: out,
  };
}

process.on('message', async (msg) => {
  if (msg.track && msg.id === undefined) {
    sim = await SimSession.create(msg.track);
    process.send({ ready: true });
    return;
  }
  const result = msg.cmd === 'prepare' ? await prepare(msg) : await attempt(msg);
  process.send({ id: msg.id, ...result });
});
