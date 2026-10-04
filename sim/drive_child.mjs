// Child process for sim/pool.mjs: drives laps with the controller on request.
//
// Protocol (Node's built-in parent/child messaging):
//   parent -> child  { track: 'summer1' }              once; builds the reference line
//   child -> parent  { ready: true }
//   parent -> child  { id, options, maxTicks }         drive one lap with these settings
//   child -> parent  { id, finished, finishFrames, fraction }
import { Env, loadTrack } from './env.mjs';
import { driveLap, loadReferenceLine } from './drive.mjs';

const env = await Env.create();
let track = null;
let line = null;

process.on('message', async (msg) => {
  if (msg.track) {
    track = loadTrack(msg.track);
    ({ line } = await loadReferenceLine(env, track, msg.track));
    process.send({ ready: true });
    return;
  }
  const lap = await driveLap(env, track, line, msg.options, {
    maxTicks: msg.maxTicks,
    // A crashed car is recognised sooner than in a one-off run: during a
    // search most candidates crash, and waiting on each one is the main cost.
    stallTicks: 1500,
    keepControls: false,
  });
  process.send({ id: msg.id, finished: lap.outcome === 'finished', finishFrames: lap.finishFrames, fraction: lap.fraction });
});
