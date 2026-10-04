// worker_threads entry: polyrl's entry plus two additions of ours.
//
// 1. Eager pump.
// The stock non-realtime loop is `setInterval(h)`, so every StartCar waits for
// the next timer tick (about 9 ms on Windows) before any frame is simulated.
// We grab `h` when the bundle registers it and call it straight after each
// incoming message, and again for as long as it keeps producing states.
// Physics is untouched: the same `h` runs, only sooner.
//
// 2. Save states (see the block further down).
import { parentPort } from 'node:worker_threads';

let pump = null;
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = (fn, ms, ...rest) => {
  if (ms === undefined) pump = fn;
  return realSetInterval(fn, ms, ...rest);
};

// --- save states: getting hold of the physics memory ---------------------------
// The whole physics world (Bullet, the car, the track) lives in the linear
// memory of the physics WebAssembly module, one big byte array. The game keeps
// that module private inside its bundle, so we catch the memory as it is
// created instead: every WebAssembly module is built through
// WebAssembly.instantiate, and a module's memory is one of its exports. We wrap
// that function and remember each memory we see.
//
// Two modules are loaded: the physics, and a tiny maths library the game uses
// so that sin/cos give identical results everywhere. The maths module has no
// state worth saving; the physics memory is by far the larger of the two, so
// "the largest memory" picks it out.
const memories = [];
const realInstantiate = WebAssembly.instantiate;
WebAssembly.instantiate = async (...args) => {
  const result = await realInstantiate(...args);
  // instantiate(bytes) resolves to { module, instance }; instantiate(module)
  // resolves to the instance itself.
  const instance = result.instance ?? result;
  for (const value of Object.values(instance.exports)) {
    if (value instanceof WebAssembly.Memory) memories.push(value);
  }
  return result;
};
/** The physics memory as bytes. Looked up fresh on every call, because when a
 *  WebAssembly memory grows its old buffer is detached and a new one appears. */
function physicsBytes() {
  let largest = null;
  for (const m of memories) if (!largest || m.buffer.byteLength > largest.buffer.byteLength) largest = m;
  if (!largest) throw new Error('save states: no WebAssembly memory was captured');
  return new Uint8Array(largest.buffer);
}

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

// --- save states: snapshot and restore ------------------------------------------
// A snapshot is a copy of the entire physics memory. Restoring writes that
// copy back, which puts every physics object exactly where it was.
//
// What a snapshot does NOT contain, and why that is acceptable:
//   - The game's own JavaScript bookkeeping per car (its tick counter and
//     stopping tick). We never rewind those; sim/env.mjs keeps asking for
//     "n more ticks" relative to that counter, so it does not matter that the
//     counter keeps climbing while the physics clock inside the car state
//     jumps back.
//   - WebAssembly globals such as the stack pointer. Between calls into the
//     physics the stack is empty, so they hold the same values at every point
//     where a snapshot can be taken or restored.
// Rules that follow from this (kept by sim/env.mjs):
//   - only snapshot/restore while the simulation is idle (no step in flight);
//   - restore only while the same car that was alive at the snapshot still
//     exists, because the game's JavaScript must still know that car.
const snapshots = new Map(); // slot number -> Uint8Array copy of the memory

function handleControl(data) {
  if (data.__pt === 'snapshot') {
    snapshots.set(data.slot, physicsBytes().slice());
    post({ __pt: 'snapshot', slot: data.slot, bytes: physicsBytes().length });
  } else if (data.__pt === 'restore') {
    const saved = snapshots.get(data.slot);
    // The memory can grow but never shrinks. If it grew since the snapshot,
    // the saved copy is shorter; writing it over the front is still right,
    // because everything the saved world refers to lies inside that front part.
    physicsBytes().set(saved);
    post({ __pt: 'restore', slot: data.slot });
  } else if (data.__pt === 'drop') {
    snapshots.delete(data.slot);
  }
}

// Registered after the shim's own listener, so this runs after the message
// has been delivered to the game worker. Control messages of ours are handled
// here, in arrival order with the game's messages (the shim also delivers
// those through setImmediate, so the order of arrival is the order of effect).
parentPort.on('message', (data) => setImmediate(() => {
  if (data?.__pt) handleControl(data);
  run();
}));
