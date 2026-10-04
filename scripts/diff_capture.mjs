// Diff the real client's captured Init/CreateCar against polyrl's reconstruction.
import { readFileSync } from 'node:fs';
import { loadPhysicsAssets, initPayload, loadTrackSaveString } from '../vendor/polyrl/node/sim_host.mjs';
import { createMountainVertices } from '../vendor/polyrl/node/mountains.mjs';

const cap = JSON.parse(readFileSync(new URL('../capture/worker_messages.json', import.meta.url), 'utf8'));
const dec = (v) => v?.__ta ? new globalThis[v.__ta](Uint8Array.from(Buffer.from(v.b64, 'base64')).buffer) : v;
const init = cap.find((m) => m.msg.messageType === 0 && m.msg.isRealtime === false).msg;
const create = cap.find((m) => m.msg.messageType === 3).msg;
const ours = initPayload(loadPhysicsAssets());

const f32eq = (a, b) => { a = Float32Array.from(a); b = Float32Array.from(b); if (a.length !== b.length) return `len ${a.length} vs ${b.length}`; let n = 0, mx = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { n++; mx = Math.max(mx, Math.abs(a[i] - b[i])); } return n ? `${n}/${a.length} differ (max ${mx})` : 'identical'; };

console.log('carMassOffset', init.carMassOffset, ours.carMassOffset);
console.log('car verts:', f32eq(init.carCollisionShapeVertices, ours.carCollisionShapeVertices));
console.log('part order same:', init.trackParts.map((p) => p.id).join() === ours.trackParts.map((p) => p.id).join(), init.trackParts.length, ours.trackParts.length);
const byId = new Map(ours.trackParts.map((p) => [p.id, p]));
let bad = 0;
for (const p of init.trackParts) {
  const o = byId.get(p.id); const v = f32eq(dec(p.vertices), o.vertices);
  const d = JSON.stringify(p.detector) === JSON.stringify(o.detector), s = JSON.stringify(p.startOffset) === JSON.stringify(o.startOffset);
  if (v !== 'identical' || !d || !s) { bad++; if (bad <= 12) console.log(`  part ${p.id}: verts ${v}; detector ${d ? 'same' : JSON.stringify(p.detector) + ' vs ' + JSON.stringify(o.detector)}; start ${s ? 'same' : JSON.stringify(p.startOffset) + ' vs ' + JSON.stringify(o.startOffset)}`); }
}
console.log(`parts differing: ${bad}/${init.trackParts.length}`);
console.log('trackData same:', create.trackData === loadTrackSaveString('summer1'));
console.log('mountains captured:', create.mountainVertices.length, 'floats, offset', JSON.stringify(create.mountainOffset));
for (const b of [{ min: { x: -20, y: -20 }, max: { x: 20, y: 20 } }]) {
  const m = createMountainVertices(b); console.log('  polyrl mountains (small bounds):', m.vertices.length, 'floats', f32eq(create.mountainVertices, m.vertices));
}
