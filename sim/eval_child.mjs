// Child process for sim/pool.mjs: owns one simulator and scores laps on request.
//
// Protocol (Node's built-in parent/child messaging):
//   parent -> child  { track: 'summer1' }                 once, to choose the track
//   child -> parent  { ready: true }
//   parent -> child  { id, recording, maxFrames }         score this recording
//   child -> parent  { id, finished, finishFrames, checkpoints }
import { Env, loadTrack } from './env.mjs';

const env = await Env.create();
let track = null;

process.on('message', async (msg) => {
  if (msg.track) {
    track = loadTrack(msg.track);
    process.send({ ready: true });
    return;
  }
  const result = await env.evaluate(track, msg.recording, msg.maxFrames);
  process.send({ id: msg.id, ...result });
});
