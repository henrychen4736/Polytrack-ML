// Decoder for the 227-byte car state the worker emits after every physics step.
// Layout (little-endian), following polyrl's brain/env.py:
//   carId u32 | frames u24 | speedKmh f32 | flags u8 | [finishFrames u24 if finished]
//   | nextCheckpointIndex u16 | position 3xf32 | quaternion 4xf32
//   | impulse count u8 + f32 each | 24 bytes per wheel in contact
//   | 16 x f32 (suspension length/velocity, wheel rotation, skid) | steering f32 | controls u8
export const STATE_BYTES = 227;

export const stateFrames = (u8) => u8[4] | (u8[5] << 8) | (u8[6] << 16);
export const stateFinished = (u8) => (u8[11] & 2) !== 0;

/** How many body-contact impulses this state holds (the count byte in front
 *  of them), without decoding the rest. 0 = the body touched nothing on
 *  this tick. The same number as decodeState(u8).collisionImpulses.length;
 *  rl/racing_env.mjs uses it when it needs only whether there was contact
 *  (shapedReward 0), which saves a full decode per tick. */
export function stateImpulseCount(u8) {
  return u8[12 + (u8[11] & 2 ? 3 : 0) + 2 + 12 + 16];
}

/** Bytes of the buffer that are actually written this frame. The struct is
 *  variable-length; anything past this is stale data from an earlier state. */
export function stateLength(u8) {
  const flags = u8[11];
  let o = 12 + (flags & 2 ? 3 : 0) + 2 + 12 + 16;
  o += 1 + 4 * u8[o];
  for (let k = 0; k < 4; k++) if (flags & (8 << k)) o += 24;
  return o + 64 + 4 + 1;
}

export function decodeState(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const flags = u8[11];
  const wheelContact = [0, 1, 2, 3].map((k) => (flags & (8 << k)) !== 0);
  let o = 12;
  let finishFrames = null;
  if (flags & 2) { finishFrames = u8[o] | (u8[o + 1] << 8) | (u8[o + 2] << 16); o += 3; }
  const nextCheckpointIndex = dv.getUint16(o, true); o += 2;
  const position = [0, 4, 8].map((d) => dv.getFloat32(o + d, true)); o += 12;
  const quaternion = [0, 4, 8, 12].map((d) => dv.getFloat32(o + d, true)); o += 16;
  // Collision impulses: one number per contact between the car's BODY and the
  // world on this tick (how hard that contact pushed, in the physics engine's
  // units). The wheels are not solid bodies in this engine (they are rays), so
  // ordinary driving and soft landings produce none; walls, obstacles and
  // bottoming out do.
  const nImp = u8[o]; o += 1;
  const collisionImpulses = [];
  for (let k = 0; k < nImp; k++) { collisionImpulses.push(dv.getFloat32(o, true)); o += 4; }
  o += 24 * wheelContact.filter(Boolean).length;
  o += 64;
  const steering = dv.getFloat32(o, true); o += 4;
  const c = u8[o];
  return {
    carId: dv.getUint32(0, true),
    frames: stateFrames(u8),
    speedKmh: dv.getFloat32(7, true),
    hasStarted: (flags & 1) !== 0,
    finishFrames,
    hasCheckpointRespawn: (flags & 4) !== 0,
    wheelContact,
    collisionImpulses,
    nextCheckpointIndex,
    position,
    quaternion,
    steering,
    controls: { up: !!(c & 1), right: !!(c & 2), down: !!(c & 4), left: !!(c & 8), reset: !!(c & 16) },
  };
}
