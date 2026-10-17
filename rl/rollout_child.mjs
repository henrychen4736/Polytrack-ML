// Child process for the model-guided sectional search
// (scripts/search_rollout.mjs): one simulator, the training environment on top
// of it, and a trained policy network. Started through sim/pool.mjs.
//
// It holds one "mark" (a save state plus the episode's bookkeeping, see MARK
// AND REWIND in racing_env.mjs) at the end of the lap's committed part, and on
// request drives on from it: some decisions given by the parent, the rest
// chosen by the policy. Because the policy looks at where the car actually
// is, it copes with whatever the changed decisions did, which keys replayed
// from an older lap cannot.
//
// A "decision" is a block decision, [steer, steerAt, w, wAt, s, sAt], one per
// 50 ms (see BLOCK DECISIONS in racing_env.mjs).
//
// Protocol (Node's built-in parent/child messaging):
//   parent -> child  { track, actor, env }      once: the track, the policy's
//                    weights file (written by rl/export_actor.py; its hidden
//                    width is worked out from its size), and RacingEnv options
//   child -> parent  { ready: true }
//
//   { id, cmd: 'prepare', prefix: [decisions] }
//       Start line, drive the given decisions, and mark that moment.
//       Reply { id, ok, tick } (ok is false if the prefix itself ended the lap).
//
//   { id, cmd: 'roll', explicit: [decision or null, ...], sampleUntil, horizon, seed, temperature }
//       Back to the mark, then up to `horizon` decisions. Decision k is
//       explicit[k] if that is given; otherwise the policy chooses: at random
//       in proportion to its scores while k < sampleUntil (what it does in
//       training), and its top choice after that.
//       Reply { id, decisions, finished, finishFrames, reason, progress, speed, tick }:
//       the decisions actually driven, how the stretch ended (reason is null
//       if the car was still driving), distance along the reference line in
//       units, speed in units per second, and the lap tick reached.
//
//   { id, cmd: 'save', decisions, run }
//       Drive a whole lap from the start line and save it as
//       runs/<run>_<track>.json for scripts/export_recording.mjs.
//       Reply { id, finished, finishFrames, file }.
//
// Local use only: nothing here contacts Kodub's servers.
import { RacingEnv } from './racing_env.mjs';
// The policy network: the same code, and the same order of additions, as the
// private copy this file used to carry.
import { loadPolicy } from './policy.mjs';
// One car can only be stepped about 6 million ticks in total, save-state
// restores included; see CAR_TICK_BUDGET there.
import { CAR_TICK_BUDGET } from '../sim/env.mjs';
import { createRng } from '../sim/search.mjs';

let renv = null, policy = null, mark = null, prefix = [];

/** Start line, drive `prefix`, mark. Returns the last step's result (or null
 *  for an empty prefix). */
async function prepare() {
  if (mark) { renv.dropMark(mark); mark = null; }
  // Past the tick budget, make reset() build a new car (and a new ladder).
  if (renv.env.frames > CAR_TICK_BUDGET) renv.replaceCar();
  await renv.reset({ startFraction: 0 });
  let r = null;
  for (const decision of prefix) {
    r = await renv.stepBlock(decision);
    if (r.terminated || r.truncated) return r;
  }
  mark = await renv.mark();
  return r;
}

process.on('message', async (msg) => {
  if (msg.track) {
    renv = await RacingEnv.create({ track: msg.track, ...msg.env });
    policy = loadPolicy(msg.actor);
    process.send({ ready: true });
    return;
  }
  if (msg.cmd === 'prepare') {
    prefix = msg.prefix;
    const r = await prepare();
    process.send({ id: msg.id, ok: !(r && (r.terminated || r.truncated)), tick: renv.state.frames });
    return;
  }
  if (msg.cmd === 'roll') {
    if (renv.env.frames > CAR_TICK_BUDGET) await prepare();
    let { obs } = await renv.rewind(mark);
    const rng = createRng(msg.seed ?? 0);
    const decisions = [];
    let r = null;
    for (let k = 0; k < msg.horizon; k++) {
      const decision = msg.explicit?.[k] ?? policy.decide(obs, k < (msg.sampleUntil ?? 0) ? rng : null, msg.temperature ?? 1);
      decisions.push(decision);
      r = await renv.stepBlock(decision);
      if (r.terminated || r.truncated) break;
      obs = r.obs;
    }
    const info = r?.info ?? renv.info();
    process.send({
      id: msg.id, decisions,
      finished: info.reason === 'finished', finishFrames: info.finishFrames, reason: info.reason,
      // renv.progress, not info.progress: the info copy is rounded to 0.01 units.
      progress: renv.progress, speed: info.speedKmh / 3.6, tick: info.frames,
    });
    return;
  }
  if (msg.cmd === 'save') {
    prefix = [];
    await prepare();
    let r = null;
    for (const decision of msg.decisions) {
      r = await renv.stepBlock(decision);
      if (r.terminated || r.truncated) break;
    }
    const finished = r?.info.reason === 'finished';
    process.send({ id: msg.id, finished, finishFrames: r?.info.finishFrames ?? null, file: finished ? renv.save(msg.run) : null });
  }
});
