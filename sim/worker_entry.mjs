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
//
// 3. Key schedules (see the block further down): several runs of held keys
// in one message, so a 50 ms block decision of five 10 ms slices costs one
// message and one wait instead of five.
import { parentPort } from 'node:worker_threads';
import { Buffer } from 'node:buffer';

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
// While a key schedule runs (see "key schedules" below): the per-tick state
// messages kept back, to go to the host as one message at the end.
let gather = null;
const post = globalThis.postMessage;
globalThis.postMessage = (msg, transfer) => {
  produced = true;
  if (gather && msg?.messageType === 10 /* Ki.UpdateResult */) { gather.push(...msg.carStateBuffers); return; }
  return post(msg, transfer);
};

function run() {
  if (!pump) return;
  if (gather) {
    // A schedule: nothing else can arrive that matters before it is done
    // (the host is waiting for its states), so simulate straight to its end
    // here instead of one setImmediate hop per tick, and send the states back
    // as ONE message. The host sees the same states in the same order
    // (sim/env.mjs handles each buffer of a message in turn).
    // Measured on its own it gained nothing over the one-message schedule
    // (1.40 against 1.44 ms per block decision, within noise): the remaining
    // cost is the physics. Kept so a schedule is one message each way.
    try {
      do { produced = false; pump(); } while (produced);
    } finally {
      const buffers = gather;
      gather = null;
      if (buffers.length) post({ messageType: 10 /* Ki.UpdateResult */, carStateBuffers: buffers });
    }
    return;
  }
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
//
// Two kinds of snapshot:
//   full   a copy of all the memory (about 24 MB on summer1).
//   delta  only the 4 KB pages that differ from a named full snapshot (the
//          "base"). Nearly all of the memory is the track's collision mesh,
//          which never changes, so a delta is a small fraction of a full
//          copy. That is what makes it affordable to keep hundreds of
//          snapshots along a lap (see rl/racing_env.mjs).
// Restoring a delta = write the base back, then write the delta's pages.
const PAGE = 4096;
// slot number -> { full: Uint8Array } or { base: slot, pages: [[offset, Uint8Array], ...] }
const snapshots = new Map();

function takeSnapshot(baseSlot) {
  const now = physicsBytes();
  if (baseSlot == null) return { full: now.slice() };
  const base = snapshots.get(baseSlot).full;
  // Buffer views share the memory (no copying) and give us a fast native
  // comparison of two byte ranges.
  const a = Buffer.from(now.buffer, now.byteOffset, now.length);
  const b = Buffer.from(base.buffer, base.byteOffset, base.length);
  const pages = [];
  for (let from = 0; from < now.length; from += PAGE) {
    const to = Math.min(from + PAGE, now.length);
    // A page past the end of the base (the memory grew since) always counts
    // as different.
    if (to > base.length || a.compare(b, from, to, from, to) !== 0) pages.push([from, now.slice(from, to)]);
  }
  return { base: baseSlot, pages };
}

function restoreSnapshot(saved) {
  const memory = physicsBytes();
  // The memory can grow but never shrinks. If it grew since a snapshot was
  // taken, the saved copy is shorter; writing it over the front is still
  // right, because everything the saved world refers to lies inside that
  // front part.
  if (saved.full) { memory.set(saved.full); return; }
  memory.set(snapshots.get(saved.base).full);
  for (const [offset, bytes] of saved.pages) memory.set(bytes, offset);
}

// --- key schedules: several runs of keys in one message -------------------------
// polyrl's patched game loop asks globalThis.__polyrlLiveControls(carId, frame)
// for the keys before simulating each frame of a car, where `frame` is the
// game's own tick counter for that car (the one StartCar's target counts in,
// and the one sim/env.mjs mirrors as Env.frames). Normally that returns the
// one set of keys the last set_controls message stored. A schedule says
// instead: from tick `from`, hold controls[0] for `every` ticks, then
// controls[1] for `every` ticks, and so on. Ticks outside the schedule fall
// through to the stored keys, so a car driven by plain set_controls + StartCar
// (Env.step) or by a recording behaves exactly as before.
//
// Why: rl/racing_env.mjs stepBlock used to send each 10 ms slice of a block as
// its own set_controls + StartCar and wait for its states before sending the
// next, five round trips per decision. The physics is the same either way:
// the loop reads keys per frame, and the schedule hands it the same keys on
// the same frames. The game's tick counter is never wound back (a restored
// save state rewinds only the physics), so an old schedule's range is never
// revisited; each car keeps only its latest schedule.
const schedules = new Map(); // carId -> { from, every, controls: [{up,right,down,left,reset}, ...] }
const storedKeys = globalThis.__polyrlLiveControls;
globalThis.__polyrlLiveControls = (carId, frame) => {
  const plan = schedules.get(carId);
  if (plan) {
    const k = Math.floor((frame - plan.from) / plan.every);
    if (k >= 0 && k < plan.controls.length) return plan.controls[k];
  }
  return storedKeys(carId, frame);
};

function handleControl(data) {
  if (data.__pt === 'schedule') {
    // Store the schedule, then start the car towards its target, as the game's
    // own StartCar message would (dispatched to the game here, not posted, so
    // that the schedule and the start are one message from the host).
    schedules.set(data.carId, {
      from: data.from,
      every: data.every,
      // The same shape polyrl stores for set_controls, booleans only.
      controls: data.controls.map((c) => ({ up: !!c.up, right: !!c.right, down: !!c.down, left: !!c.left, reset: !!c.reset })),
    });
    globalThis.dispatchEvent({ type: 'message', data: { messageType: 5 /* Ki.StartCar */, carId: data.carId, targetSimulationTimeFrames: data.target } });
    gather = [];   // run() below drives it to the end and replies once
    return;
  }
  if (data.__pt === 'snapshot') {
    const saved = takeSnapshot(data.base ?? null);
    snapshots.set(data.slot, saved);
    // `bytes` = how much this snapshot itself stores.
    const bytes = saved.full ? saved.full.length : saved.pages.reduce((n, [, page]) => n + page.length, 0);
    post({ __pt: 'snapshot', slot: data.slot, bytes });
  } else if (data.__pt === 'restore') {
    restoreSnapshot(snapshots.get(data.slot));
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
