// Frame-exact driving environment on top of one headless simulation worker.
//   const env = await Env.create();
//   const track = loadTrack('summer1');
//   env.reset(track);
//   const states = await env.step({ up: true }, 10);   // 10 physics ticks, 10 states
//   const run = await env.replay(track, recordingString, 30000);
//   loadTrack('ideas/g2-2-track-generator/sets/train/gen_s1_d0_l800.track.json')  // a generated track
import { existsSync, readFileSync } from 'node:fs';
import { basename, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootWorker, loadCaptured, Ki } from './host.mjs';
import { loadTrackSaveString } from '../vendor/polyrl/node/sim_host.mjs';
import { stateFrames, stateFinished, decodeState } from './state.mjs';

/** The game refuses to step one car past 5,999,999 ticks of its own counter,
 *  and restoring a save state does not wind that counter back. Code that
 *  restores save states many times (the searches, rl/rollout_child.mjs,
 *  ideas/shared/sim_session.mjs) replaces the car once it has been stepped
 *  this many ticks, leaving room for the drive that is under way when the
 *  count is checked. rl/racing_env.mjs keeps its own, 5,000,000 (see there). */
export const CAR_TICK_BUDGET = 4_500_000;

/** True for a generated track given by its file: a path ending in
 *  ".track.json" (ideas/g2-2-track-generator writes these). Anything else is
 *  an official track's name. */
export const isTrackFile = (name) => typeof name === 'string' && name.endsWith('.track.json');

/** The short name of a track, for file names and log lines: the name itself
 *  for an official track, the file's base name without ".track.json" for a
 *  generated one ("ideas/.../gen_s500_d0_l600.track.json" -> "gen_s500_d0_l600"). */
export const trackLabel = (name) => (isTrackFile(name) ? basename(name, '.track.json') : name);

/** Where a track file is: an absolute path as given, a relative one from the
 *  project root (where every script is run from, and the cwd that
 *  rl/polytrack_env.py gives its servers). */
export const trackFilePath = (name) => (isAbsolute(name) ? name : fileURLToPath(new URL(`../${name.replace(/\\/g, '/')}`, import.meta.url)));

/** CreateCar inputs for a track: the real client's capture when we have one,
 *  otherwise polyrl's track string with no mountains (fine unless the car can
 *  reach the backdrop terrain).
 *
 *  `name` may also be a generated track file (isTrackFile). Its `trackData`
 *  is the whole track: generated tracks have no mountains, the same choice
 *  made here for official tracks without a capture. Official track names
 *  never end in ".track.json", so this branch cannot change what an official
 *  name loads. */
export function loadTrack(name) {
  if (isTrackFile(name)) {
    const meta = JSON.parse(readFileSync(trackFilePath(name), 'utf8'));
    if (typeof meta.trackData !== 'string') throw new Error(`${name}: no trackData (not a g2-2 .track.json file?)`);
    return { trackData: meta.trackData, mountainVertices: new Float32Array(0), mountainOffset: { x: 0, y: 0, z: 0 } };
  }
  if (existsSync(new URL(`../data/createcar_${name}.json`, import.meta.url))) {
    const { trackData, mountainVertices, mountainOffset } = loadCaptured(`createcar_${name}.json`);
    return { trackData, mountainVertices, mountainOffset };
  }
  return { trackData: loadTrackSaveString(name), mountainVertices: new Float32Array(0), mountainOffset: { x: 0, y: 0, z: 0 } };
}

export class Env {
  static async create(id = 0) {
    const env = new Env();
    env.worker = await bootWorker(id, { burst: 1 }); // burst 1: stop exactly on the target frame
    env.carId = 0;
    env.hasCar = false;
    env.worker.onUpdate((bufs) => {
      for (const b of bufs) {
        if (new DataView(b).getUint32(0, true) === env.carId) env._onState?.(new Uint8Array(b));
      }
    });
    return env;
  }

  _newCar(track, carRecording) {
    if (this.hasCar) {
      this.worker.clearControls(this.carId);
      this.worker.send({ messageType: Ki.DeleteCar, carId: this.carId });
    }
    this.carId++;
    this.hasCar = true;
    this.frames = 0;
    this.worker.send({ messageType: Ki.CreateCar, ...track, carId: this.carId, carRecording });
  }

  /** Fresh car at the start line, driven by step(). */
  reset(track) {
    this._newCar(track, null);
  }

  /** Hold `controls` for `n` physics ticks; resolves with the n resulting states. */
  step(controls, n = 1) {
    return new Promise((resolve) => {
      const out = [];
      this._onState = (u8) => {
        out.push(u8);
        if (out.length === n) { this._onState = null; this.frames += n; resolve(out); }
      };
      this.worker.setControls(this.carId, controls);
      this.worker.send({ messageType: Ki.StartCar, carId: this.carId, targetSimulationTimeFrames: this.frames + n });
    });
  }

  /**
   * Hold controls[0] for `every` ticks, then controls[1] for `every` ticks,
   * and so on, all in ONE message to the simulator; resolves with all
   * controls.length * every resulting states, in order.
   *
   * Gives exactly the same states as calling step(controls[k], every) for each
   * k in turn (the simulator reads keys per tick either way; see "key
   * schedules" in sim/worker_entry.mjs), but waits once instead of once per
   * run. Measured for rl/racing_env.mjs stepBlock (five 10 ms runs per 50 ms
   * decision): see the numbers there.
   *
   * It always simulates every tick of the schedule: a caller that stops
   * caring part-way (an episode that ended in slice 2) gets the later states
   * too, and the car has moved on to the end of the schedule.
   */
  stepSchedule(controls, every) {
    const n = controls.length * every;
    return new Promise((resolve) => {
      const out = [];
      this._onState = (u8) => {
        out.push(u8);
        if (out.length === n) { this._onState = null; this.frames += n; resolve(out); }
      };
      this.worker.worker.postMessage({ __pt: 'schedule', carId: this.carId, from: this.frames, every, controls, target: this.frames + n });
    });
  }

  /** Play a recording string from the start line until the finish or maxFrames. */
  replay(track, recording, maxFrames) {
    this._newCar(track, recording);
    return new Promise((resolve) => {
      const states = [];
      this._onState = (u8) => {
        states.push(u8);
        const finished = stateFinished(u8);
        if (finished || stateFrames(u8) >= maxFrames) {
          this._onState = null;
          this.worker.send({ messageType: Ki.DeleteCar, carId: this.carId });
          this.hasCar = false;
          resolve({ finished, finishFrames: finished ? decodeState(u8).finishFrames : null, states });
        }
      };
      this.worker.send({ messageType: Ki.StartCar, carId: this.carId, targetSimulationTimeFrames: maxFrames });
    });
  }

  /**
   * Score a recording: play it from the start line and report only the result.
   * Same simulation as replay(), but it keeps just the latest state instead of
   * all of them, which matters when a search calls this thousands of times.
   *
   * Stops at the finish, or at `maxFrames` if the car has not finished by then.
   * Returns { finished, finishFrames, checkpoints } where `checkpoints` is how
   * many checkpoints the car had collected when the run stopped.
   */
  evaluate(track, recording, maxFrames) {
    this._newCar(track, recording);
    return new Promise((resolve) => {
      this._onState = (u8) => {
        const finished = stateFinished(u8);
        if (finished || stateFrames(u8) >= maxFrames) {
          this._onState = null;
          this.worker.send({ messageType: Ki.DeleteCar, carId: this.carId });
          this.hasCar = false;
          const s = decodeState(u8);
          resolve({ finished, finishFrames: s.finishFrames, checkpoints: s.nextCheckpointIndex });
        }
      };
      this.worker.send({ messageType: Ki.StartCar, carId: this.carId, targetSimulationTimeFrames: maxFrames });
    });
  }

  // --- save states (experimental) -------------------------------------------
  // See sim/worker_entry.mjs for what a snapshot is and its limits. In short:
  // saveState() copies the whole physics memory, loadState() writes it back.
  // Use them only between step() calls, on a car made by reset(), and never
  // across a reset()/replay()/evaluate() (those replace the car).

  /** Send one of our control messages to the worker and wait for its reply. */
  _control(kind, slot, extra = {}) {
    return new Promise((resolve) => {
      const onMessage = (msg) => {
        if (msg?.__pt === kind && msg.slot === slot) { this.worker.worker.off('message', onMessage); resolve(msg); }
      };
      this.worker.worker.on('message', onMessage);
      this.worker.worker.postMessage({ __pt: kind, slot, ...extra });
    });
  }

  /**
   * Snapshot the physics now. Returns a handle to pass to loadState().
   * The handle remembers which car it belongs to.
   *
   * With no argument the snapshot is a full copy of the memory (about 24 MB).
   * Pass the handle of an earlier FULL snapshot of the same car as `base` to
   * store only what differs from it, which is far smaller; keep the base for
   * as long as any snapshot built on it is in use. handle.bytes says how much
   * the snapshot stores.
   */
  async saveState(base = null) {
    if (base && base.carId !== this.carId) throw new Error('saveState: the base snapshot belongs to another car');
    const slot = (this._nextSlot = (this._nextSlot ?? 0) + 1);
    const { bytes } = await this._control('snapshot', slot, { base: base?.slot ?? null });
    (this._liveSlots ??= new Set()).add(slot);
    return { slot, carId: this.carId, bytes };
  }

  /**
   * Put the physics back to a snapshot. The car is then exactly where it was,
   * and step() continues from there. Env.frames is deliberately not rewound:
   * it mirrors the game's own tick counter, which a snapshot does not cover.
   */
  async loadState(handle) {
    if (handle.carId !== this.carId || !this.hasCar) throw new Error('loadState: that snapshot belongs to a car that no longer exists');
    await this._control('restore', handle.slot);
  }

  /** Free a snapshot's memory in the worker. */
  dropState(handle) {
    this._liveSlots?.delete(handle.slot);
    this.worker.worker.postMessage({ __pt: 'drop', slot: handle.slot });
  }

  /** Free every snapshot that has not been dropped yet. */
  dropAllStates() {
    for (const slot of this._liveSlots ?? []) this.worker.worker.postMessage({ __pt: 'drop', slot });
    this._liveSlots?.clear();
  }

  close() { return this.worker.terminate(); }
}
