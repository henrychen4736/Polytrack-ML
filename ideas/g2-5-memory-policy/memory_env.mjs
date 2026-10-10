// The training environment with a memory of earlier attempts on the track.
//
// MemoryEnv wraps a RacingEnv (rl/racing_env.mjs, unchanged) and does three
// things around it:
//   1. keeps a TrackMemory (track_memory.mjs) and adds every attempt to it
//      when the attempt ends;
//   2. appends the memory's MEM_SIZE numbers to every observation, so the
//      observation is OBS_SIZE + MEM_SIZE = 352 + 130 = 482 long;
//   3. groups attempts into SESSIONS: a run of consecutive attempts on one
//      track that share one memory. The memory is cleared between sessions.
//
//   const menv = await MemoryEnv.create({ track: 'desert3', ...BLOCK_ENV, sessionMax: 6 });
//   let { obs } = await menv.reset();               // attempt 1: memory part all zero
//   let r = await menv.stepBlock(decision);         // r.obs is 482 long
//   ...                                             // r.info.attempt, r.info.sessionEnd
//
// It has the methods rl/env_server.mjs calls on a RacingEnv (reset, stepBlock,
// demo, save, setReference, close, and the fields cfg, line, human, state), so
// the server can hold one of these instead; see "Changes needed elsewhere" in
// the README. Block decisions only: every current model drives with them.
//
// SESSIONS, and why they are the curriculum. The memory inputs can only be
// learnt from if they differ between situations that call for different
// driving. Three things make that so:
//   - Session length is drawn afresh each time, 1..sessionMax attempts, so
//     the policy meets every attempt number from "first try, memory empty" to
//     "sixth try" in every update, on every track. At sessionMax = 6 a
//     session averages 3.5 attempts, so 2 attempts in 7 are a first try and
//     driving a track cold never stops being practised.
//   - Within a session nothing else changes: same track, same reference
//     line, same physics (the simulator is deterministic). What the previous
//     attempt did at a place is therefore real evidence about that place.
//   - The crashes have to come from the policy itself. RacingEnv's own start
//     logic is left switched on underneath (randomStart, failureStart, kick,
//     ownStart): a start a few seconds before a known crash site, on an
//     attempt whose memory shows that crash, is exactly the case the inputs
//     are for, and failureStart produces it on purpose.
// A change of reference line (refLaps training) also ends the session: bins
// are positions along the old line.
import { RacingEnv, OBS_SIZE, LOOKAHEAD_POINTS } from '../../rl/racing_env.mjs';
import { SPACING } from '../../sim/line.mjs';
import { createRng as makeRng } from '../shared/rng.mjs';
import { TrackMemory, MEM_SIZE, POINTS } from './track_memory.mjs';

export { MEM_SIZE };
export const MEMORY_OBS_SIZE = OBS_SIZE + MEM_SIZE;

/** Options of this wrapper (everything else goes to RacingEnv). */
export const MEMORY_DEFAULTS = {
  // 1: the memory inputs are filled in. 0: they are always zero (the same
  // policy file can then be run "without memory" as the baseline).
  memory: 1,
  // A session lasts a random 1..sessionMax attempts, then the memory is
  // cleared. 0 = never cleared here (evaluation: call newSession() yourself).
  sessionMax: 6,
  // Seed of the session-length draw (its own stream, so it does not shift
  // RacingEnv's start positions).
  sessionSeed: 0,
};


export class MemoryEnv {
  static async create(options = {}) {
    const menv = new MemoryEnv();
    const mine = {}, theirs = {};
    for (const [key, value] of Object.entries(options)) (key in MEMORY_DEFAULTS ? mine : theirs)[key] = value;
    menv.mcfg = { ...MEMORY_DEFAULTS, ...mine };
    menv.renv = await RacingEnv.create(theirs);
    if (!(menv.renv.cfg.block > 0)) throw new Error('MemoryEnv drives block decisions only (pass block: 5)');
    menv.rng = makeRng(menv.mcfg.sessionSeed + 104729);
    menv.memory = null;        // made on the first reset, when the line is known
    menv.memoryLine = null;    // the line the memory's bins belong to
    menv.attemptsLeft = 0;     // attempts still to come in this session
    menv.attempt = 0;          // number of the current attempt in its session, from 1
    menv.trace = [];
    return menv;
  }

  // What rl/env_server.mjs reads off its environment.
  get obsSize() { return MEMORY_OBS_SIZE; }
  get cfg() { return this.renv.cfg; }
  get line() { return this.renv.line; }
  get human() { return this.renv.human; }
  get state() { return this.renv.state; }
  save(...args) { return this.renv.save(...args); }
  close() { return this.renv.close(); }
  /** A new reference means a new line: the next reset starts a new session. */
  setReference(lap) { return this.renv.setReference(lap); }
  /** Imitation examples (rl/pretrain_bc.py) with the memory part zero: a human
   *  lap is a first attempt as far as the memory is concerned. */
  async demo(lap) {
    const d = await this.renv.demo(lap);
    const obs = new Float32Array(d.count * MEMORY_OBS_SIZE);
    for (let k = 0; k < d.count; k++) obs.set(d.obs.subarray(k * OBS_SIZE, (k + 1) * OBS_SIZE), k * MEMORY_OBS_SIZE);
    return { ...d, obs };
  }

  /** Forget this track: the next reset() is attempt 1 of a new session. */
  newSession() { this.attemptsLeft = 0; }

  /** Start the next attempt. Same arguments and result as RacingEnv.reset,
   *  with the longer observation; info gains `attempt` (1 = memory empty). */
  async reset(options = {}) {
    const r = await this.renv.reset(options);
    // RacingEnv may have switched reference inside reset() (refLaps).
    const lineChanged = this.renv.line !== this.memoryLine;
    if (lineChanged || this.attemptsLeft <= 0) {
      if (lineChanged) { this.memory = new TrackMemory(this.renv.line.length); this.memoryLine = this.renv.line; }
      this.memory.clear();
      this.attempt = 0;
      const max = this.mcfg.sessionMax;
      this.attemptsLeft = max > 0 ? 1 + Math.floor(this.rng() * max) : Infinity;
    }
    this.attempt++;
    this.attemptsLeft--;
    this.trace = [this._sample()];
    return { obs: this._extend(r.obs), info: { ...r.info, attempt: this.attempt } };
  }

  /** One block decision. Same result as RacingEnv.stepBlock with the longer
   *  observation. When the attempt ends it is added to the memory, and
   *  info.sessionEnd says whether the next reset() will clear it. */
  async stepBlock(decision) {
    const r = await this.renv.stepBlock(decision);
    this.trace.push(this._sample());
    const info = { ...r.info, attempt: this.attempt };
    // The observation after the last decision still shows the memory as it
    // was DURING the attempt; the attempt itself shows up from the next reset.
    // So the observation is built BEFORE the attempt is committed below
    // (built after it, the last observation of a first attempt already showed
    // that attempt: its own crash, "attempts so far" at 1/8).
    const obs = this._extend(r.obs);
    if (r.terminated || r.truncated) {
      const reason = r.info.reason;
      // 'time limit' is neither a crash nor a finish (as for failureStart in
      // racing_env.mjs).
      const crashed = reason === 'off line' || reason === 'stalled' || reason === 'off track';
      const finished = reason === 'finished';
      // Only a lap from the start line has a lap time (as in train_ppo.py).
      const finishFrames = finished && r.info.startTick <= 1 ? r.info.finishFrames : null;
      info.committed = this.memory.commit(this.trace, { crashed, finished, finishFrames });
      info.sessionEnd = this.attemptsLeft <= 0;
    }
    return { ...r, obs, info };
  }

  /** Where the car is and how it is moving, for the trace. */
  _sample() {
    const { renv } = this;
    return { progress: renv.progress, speedKmh: renv.state.speedKmh, lateral: renv.lateral, tick: renv.state.frames };
  }

  /** The 352 numbers of RacingEnv followed by the memory's 130. */
  _extend(obs) {
    const out = new Array(MEMORY_OBS_SIZE).fill(0);
    for (let k = 0; k < OBS_SIZE; k++) out[k] = obs[k];
    if (!this.mcfg.memory) return out;
    // The same 20 points ahead as _observe() in racing_env.mjs uses, as
    // progress values, so stretch k of the memory is the road between the
    // observation's point k and point k + 1.
    const { renv } = this;
    const gap = Math.max(renv.cfg.minGap, (renv.state.speedKmh / 3.6) * renv.cfg.gapSeconds);
    const last = renv.line.points.length - 1;
    const edges = [renv.progressIndex * SPACING];
    for (let k = 1; k <= LOOKAHEAD_POINTS; k++) edges.push(Math.min(last, renv.progressIndex + Math.round((k * gap) / SPACING)) * SPACING);
    edges.push(edges[LOOKAHEAD_POINTS] + gap);   // closes the last stretch
    if (edges.length !== POINTS + 1) throw new Error('memory stretches do not match the lookahead points');
    this.memory.features(edges, renv.state.frames, out, OBS_SIZE);
    return out;
  }
}
