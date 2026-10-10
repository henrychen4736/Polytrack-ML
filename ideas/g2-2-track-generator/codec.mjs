// Placed parts -> the track string the simulator loads.
//
// sim/track.mjs reads a track: save string -> bytes (decodeSaveString) ->
// parts (parseTrack). This file is the other direction, which nothing in the
// project had: parts -> bytes -> save string. The byte layout is the one
// parseTrack documents; the text wrapping (deflate, base62, deflate, base62)
// uses polyrl's port of the game's own encoder (encodeBits).
//
// Checked in smoke_test.mjs: encode, then decode with sim/track.mjs, gives
// back the same parts, and the simulator accepts the string.
import zlib from 'node:zlib';
import { encodeBits } from '../../vendor/polyrl/node/track_codec.mjs';
import { loadPartConfigs, DETECTOR_CHECKPOINT } from '../../sim/track.mjs';

/** The sun direction byte the official tracks carry (28 in summer1, winter2
 *  and desert4). It only affects lighting. */
const SUN = 28;

/**
 * Serialise parts into the game's binary track body.
 *
 *   parts        [{ typeId, x, y, z, rotation, rotationAxis = 0,
 *                 checkpointOrder, startOrder }], x/y/z in grid cells
 *   environment  0 Summer, 1 Winter, 2 Desert (looks only)
 */
export function partsToBytes(parts, environment = 0) {
  const configs = loadPartConfigs();
  // Coordinates are stored unsigned, as an offset from the smallest value.
  const min = [0, 1, 2].map((k) => Math.min(...parts.map((p) => [p.x, p.y, p.z][k])));
  const out = [];
  const uint = (v, width) => { for (let k = 0; k < width; k++) out.push(Math.floor(v / 2 ** (8 * k)) & 255); };
  out.push(environment, SUN);
  for (const m of min) uint(m >>> 0, 4); // int32, two's complement
  // Two bytes per coordinate: room for 65536 cells each way, far more than a
  // generated track uses, and it keeps the writer free of special cases.
  const W = 2;
  out.push(W | (W << 2) | (W << 4));
  // Parts are grouped by type: type id, how many, then each part.
  const types = [...new Set(parts.map((p) => p.typeId))].sort((a, b) => a - b);
  for (const typeId of types) {
    const cfg = configs.get(typeId);
    if (!cfg) throw new Error(`unknown part type ${typeId}`);
    const group = parts.filter((p) => p.typeId === typeId);
    out.push(typeId);
    uint(group.length, 4);
    for (const p of group) {
      uint(p.x - min[0], W); uint(p.y - min[1], W); uint(p.z - min[2], W);
      out.push((p.rotation & 3) | (((p.rotationAxis ?? 0) & 7) << 2));
      out.push(0); // colour: the default
      if (cfg.detector?.type === DETECTOR_CHECKPOINT) uint(p.checkpointOrder, 2);
      if (cfg.startOffset != null) uint(p.startOrder ?? 0, 4);
    }
  }
  return Uint8Array.from(out);
}

// The game deflates with a 512-byte window inside and a 32 KB window outside
// (vendor/polyrl/node/track_codec.mjs, "deflate wrappers"). Any zlib stream
// inflates the same, so the window only has to be one the game's reader
// accepts; these are the game's own.
const deflate = (buf, windowBits) => new Uint8Array(zlib.deflateSync(buf, { level: 9, windowBits, memLevel: 9 }));
const wrap = (bytes) => encodeBits(deflate(Buffer.from(encodeBits(deflate(Buffer.from(bytes), 9)), 'utf8'), 15));

/** Parts -> save string: the `trackData` that CreateCar, loadTrackInfo and
 *  SimSession.create take. */
export function encodeSaveString(parts, environment = 0) {
  return wrap(partsToBytes(parts, environment));
}

/**
 * Parts -> export string ("PolyTrack2..."), the form the game's editor
 * imports, so a generated track can be looked at in the real game. The only
 * difference from a save string is a header with the track's name in front
 * of the body (no author, no date).
 */
export function encodeExportString(parts, name, environment = 0) {
  const nameBytes = Buffer.from(name, 'utf8');
  const header = [nameBytes.length, ...nameBytes, 0, 0];
  return 'PolyTrack2' + wrap(Uint8Array.from([...header, ...partsToBytes(parts, environment)]));
}
