// Headless PolyTrack 0.6.3 simulation host.
// Wraps polyrl's worker_threads host (vendor/polyrl) but boots the worker with
// the Init payload captured from the real client (data/init_0.6.3.json) instead
// of polyrl's reconstructed assets, which are off by one float32 ULP on most
// parts and make leaderboard recordings fail Verify.
import { readFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { SimWorker, Ki } from '../vendor/polyrl/node/sim_host.mjs';

export { Ki };
const DATA = new URL('../data/', import.meta.url);

/** Reverse the capture encoding: {__ta, b64} -> typed array. */
export function decodeCaptured(v) {
  if (v && typeof v === 'object') {
    if (v.__ta) {
      const u8 = Uint8Array.from(Buffer.from(v.b64, 'base64'));
      return new globalThis[v.__ta](u8.buffer);
    }
    if (Array.isArray(v)) return v.map(decodeCaptured);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decodeCaptured(x)]));
  }
  return v;
}

export function loadCaptured(name) {
  return decodeCaptured(JSON.parse(readFileSync(new URL(name, DATA), 'utf8')));
}

/** Boot one worker and send it the real client's Init. */
export async function bootWorker(id = 0, opts = {}) {
  // SimWorker hardcodes polyrl's entry file, so build one around our own entry
  // (sim/worker_entry.mjs) and reuse its message plumbing.
  const w = Object.create(SimWorker.prototype);
  w.id = id;
  w._pending = new Map();
  w._updateListeners = [];
  w.worker = new Worker(new URL('./worker_entry.mjs', import.meta.url), {
    workerData: { vendorDir: fileURLToPath(new URL('../vendor/polyrl/node/vendor', import.meta.url)), burst: opts.burst ?? 1 },
  });
  w.worker.on('message', (msg) => w._onMessage(msg));
  w.worker.on('error', (err) => { console.error(`[sim worker ${id}]`, err); process.exitCode = 1; });
  await w.waitReady();
  await w.send({ ...loadCaptured('init_0.6.3.json'), isRealtime: false });
  return w;
}
