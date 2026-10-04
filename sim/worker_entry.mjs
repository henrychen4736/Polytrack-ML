// worker_threads entry: polyrl's entry plus an eager pump.
// The stock non-realtime loop is `setInterval(h)`, so every StartCar waits for
// the next timer tick (about 9 ms on Windows) before any frame is simulated.
// We grab `h` when the bundle registers it and call it straight after each
// incoming message, and again for as long as it keeps producing states.
// Physics is untouched: the same `h` runs, only sooner.
import { parentPort } from 'node:worker_threads';

let pump = null;
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = (fn, ms, ...rest) => {
  if (ms === undefined) pump = fn;
  return realSetInterval(fn, ms, ...rest);
};

await import('../vendor/polyrl/node/sim_worker_entry.mjs');

let produced = false;
const post = globalThis.postMessage;
globalThis.postMessage = (msg, transfer) => {
  produced = true;
  return post(msg, transfer);
};

function run() {
  if (!pump) return;
  produced = false;
  pump();
  if (produced) setImmediate(run);
}
// Registered after the shim's own listener, so this runs after the message
// has been delivered to the game worker.
parentPort.on('message', () => setImmediate(run));
