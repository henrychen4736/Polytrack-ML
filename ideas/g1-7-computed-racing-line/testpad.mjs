// A flat test pad: a track made only of flat plates, to measure the car on.
//
// The official tracks never give a long flat straight or room for a full
// circle, so a measurement taken on them always has a slope, a kerb or a wall
// mixed in. This builds a track of our own: one start plate and a rectangle of
// plain flat plates (part 25: a 20 x 20 unit slab, top surface at y = 0.21,
// the same height as the flat start plate, part 92). Nothing else, so every
// number measured on it is the car's own.
//
//   const pad = buildPad({ wide: 9, long: 300 });   // CreateCar inputs
//   const sim = await SimSession.create(pad);
//
// The car starts on the centre line of the pad, `startRow` plates in from one
// end, 1.35 units from the world origin (the start plate's centre is the
// origin; the car spawns at x 0, z -1.35), and faces -z (measured), so the pad is laid out
// towards -z from there.
//
// Measured while writing this: the world also has a ground plane at y = 0
// everywhere, which the car drives on with all four wheels once it runs off
// the plates. fit_car.mjs checks whether it grips like the plates do.
//
// The bytes are written in the layout sim/track.mjs parseTrack documents, and
// wrapped the way vendor/polyrl/node/track_codec.mjs exportToSaveString wraps
// a payload (deflate, base62, deflate, base62).
import zlib from 'node:zlib';
import { encodeBits } from '../../vendor/polyrl/node/track_codec.mjs';

/** Part type ids, from the game's Init message (data/init_0.6.3.json). */
const FLAT_PLATE = 25;   // 12 triangles: a 20 x 20 slab, 0.2 thick
const FLAT_START = 92;   // the same slab with a start position
/** A plate is 20 units = 4 grid cells of 5 units on a side. */
export const PLATE_CELLS = 4;
export const PLATE_UNITS = 20;

/**
 * Build a flat pad.
 *   wide, long   size in plates (20 units each). `wide` should be odd so the
 *                start plate sits on the centre line.
 *   startRow     how many plates in from the near end the start plate is
 * Returns CreateCar inputs { trackData, mountainVertices, mountainOffset }
 * for SimSession.create / Env.reset, plus { widthUnits, lengthUnits } and
 * `parts` (for checking against parseTrack).
 */
export function buildPad({ wide = 9, long = 300, startRow = 2 } = {}) {
  const startColumn = Math.floor(wide / 2);
  const plates = [];
  for (let i = 0; i < wide; i++) for (let j = 0; j < long; j++) {
    if (i === startColumn && j === startRow) continue; // the start plate goes here
    plates.push([i, j]);
  }
  // Header: environment, sun direction, x/y/z offsets (i32 each), coordinate
  // widths. Offsets put the start plate at the world origin. Widths: 2 bytes
  // for x and z (pads are up to a few hundred plates = over 255 cells), 1 for y.
  const header = Buffer.alloc(15);
  header[0] = 0; header[1] = 0;
  header.writeInt32LE(-startColumn * PLATE_CELLS, 2);
  header.writeInt32LE(0, 6);
  // Row j is placed at z = (startRow - j) plates: rows run towards -z, the
  // way the car faces, with `startRow` rows behind the start.
  header.writeInt32LE(-(long - 1 - startRow) * PLATE_CELLS, 10);
  header[14] = 2 | (1 << 2) | (2 << 4);

  // One group per part type: type id, count (u32), then each part as
  // x (u16), y (u8), z (u16), rotation byte, colour byte, and for a start
  // part its startOrder (u32).
  const group = (typeId, cells, isStart) => {
    const b = Buffer.alloc(5 + cells.length * (7 + (isStart ? 4 : 0)));
    b[0] = typeId; b.writeUInt32LE(cells.length, 1);
    let o = 5;
    for (const [i, j] of cells) {
      b.writeUInt16LE(i * PLATE_CELLS, o); b[o + 2] = 0; b.writeUInt16LE((long - 1 - j) * PLATE_CELLS, o + 3);
      b[o + 5] = 0; b[o + 6] = 0; o += 7;
      if (isStart) { b.writeUInt32LE(0, o); o += 4; }
    }
    return b;
  };
  const payload = Buffer.concat([header, group(FLAT_START, [[startColumn, startRow]], true), group(FLAT_PLATE, plates, false)]);
  // The game deflates with window 9 inside and 15 outside; inflate accepts both.
  const inner = encodeBits(new Uint8Array(zlib.deflateSync(payload, { level: 9, windowBits: 9, memLevel: 9 })));
  const trackData = encodeBits(new Uint8Array(zlib.deflateSync(Buffer.from(inner, 'utf8'), { level: 9, windowBits: 15, memLevel: 9 })));
  return {
    trackData, mountainVertices: new Float32Array(0), mountainOffset: { x: 0, y: 0, z: 0 },
    widthUnits: wide * PLATE_UNITS, lengthUnits: long * PLATE_UNITS,
    // World bounds of the pad's surface (the start plate's centre is the origin).
    bounds: {
      xMin: -startColumn * PLATE_UNITS - 10, xMax: (wide - 1 - startColumn) * PLATE_UNITS + 10,
      zMin: -(long - 1 - startRow) * PLATE_UNITS - 10, zMax: startRow * PLATE_UNITS + 10,
    },
  };
}
