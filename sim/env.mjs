// Frame-exact driving environment on top of one headless simulation worker.
//   const env = await Env.create();
//   const track = loadTrack('summer1');
//   env.reset(track);
//   const states = await env.step({ up: true }, 10);   // 10 physics ticks, 10 states
//   const run = await env.replay(track, recordingString, 30000);
import { existsSync } from 'node:fs';
import { bootWorker, loadCaptured, Ki } from './host.mjs';
import { loadTrackSaveString } from '../vendor/polyrl/node/sim_host.mjs';
import { stateFrames, stateFinished, decodeState } from './state.mjs';

/** CreateCar inputs for a track: the real client's capture when we have one,
 *  otherwise polyrl's track string with no mountains (fine unless the car can
 *  reach the backdrop terrain). */
export function loadTrack(name) {
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

  close() { return this.worker.terminate(); }
}
