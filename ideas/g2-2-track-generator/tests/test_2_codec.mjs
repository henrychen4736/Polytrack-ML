// codec.mjs: parts -> track string. No simulator, about 2 s.
//
//   partsToBytes        against bytes worked out by hand from the layout
//                       sim/track.mjs parseTrack documents
//   encodeSaveString    round trip through BOTH decoders the project has:
//                       sim/track.mjs (decodeSaveString + parseTrack) and
//                       vendor/polyrl/node/track_codec.mjs (decodeBits +
//                       inflate, twice)
//   encodeExportString  through polyrl's parseExportString / exportToSaveString
//   the official tracks decoded, re-encoded by codec.mjs, decoded again: every
//                       part of all 17 must come back (this exercises every
//                       part type, rotation axis and field the game uses, not
//                       just the 16 the generator lays)
import zlib from 'node:zlib';
import { partsToBytes, encodeSaveString, encodeExportString } from '../codec.mjs';
import { decodeSaveString, parseTrack } from '../../../sim/track.mjs';
import { decodeBits, exportToSaveString, parseExportString } from '../../../vendor/polyrl/node/track_codec.mjs';
import { loadTrack } from '../../../sim/env.mjs';
import { TRACKS } from '../../shared/laps.mjs';
import { check, section } from './_check.mjs';

const part = (typeId, x, y, z, rotation = 0, extra = {}) => ({ typeId, x, y, z, rotation, rotationAxis: 0, checkpointOrder: null, startOrder: null, ...extra });
const keyOf = (p) => `${p.typeId},${p.x},${p.y},${p.z},${p.rotation},${p.rotationAxis},${p.checkpointOrder},${p.startOrder}`;
const sameParts = (a, b) => a.length === b.length && a.map(keyOf).sort().join(';') === b.map(keyOf).sort().join(';');
/** polyrl's own decoding of a save string to the binary body: base62 bits, inflate, base62 bits, inflate. */
const vendorDecode = (saveString) => new Uint8Array(zlib.inflateSync(Buffer.from(decodeBits(zlib.inflateSync(Buffer.from(decodeBits(saveString))).toString('utf8')))));

await section('partsToBytes by hand', () => {
  // A start (type 5) at (0, 2, 2) turned half round, a straight (type 0) at (0, 2, -2),
  // a checkpoint (type 52) at (-4, 2, -6) turned a quarter, order 3. Environment 1 (winter).
  const parts = [part(5, 0, 2, 2, 2, { startOrder: 0 }), part(0, 0, 2, -2), part(52, -4, 2, -6, 1, { checkpointOrder: 3 })];
  const want = [
    1, 28,                          // environment, sun direction
    0xfc, 0xff, 0xff, 0xff,         // smallest x = -4, int32 little-endian
    2, 0, 0, 0,                     // smallest y = 2
    0xfa, 0xff, 0xff, 0xff,         // smallest z = -6
    2 | (2 << 2) | (2 << 4),        // 2 bytes for each of x, y, z
    0, 1, 0, 0, 0,   4, 0, 0, 0, 4, 0,   0, 0,                    // type 0, one part: x 4, y 0, z 4; rotation 0; colour 0
    5, 1, 0, 0, 0,   4, 0, 0, 0, 8, 0,   2, 0,   0, 0, 0, 0,      // type 5: x 4, y 0, z 8; rotation 2; colour; startOrder 0 (u32)
    52, 1, 0, 0, 0,  0, 0, 0, 0, 0, 0,   1, 0,   3, 0,            // type 52: x 0, y 0, z 0; rotation 1; colour; checkpointOrder 3 (u16)
  ];
  const got = Array.from(partsToBytes(parts, 1));
  check('partsToBytes: start + straight + checkpoint give exactly the 62 bytes worked out by hand', got.length === want.length && got.every((b, i) => b === want[i]), got.length === want.length ? `first difference at byte ${got.findIndex((b, i) => b !== want[i])}` : `${got.length} bytes, expected ${want.length}`);
  const back = parseTrack(Uint8Array.from(want));
  check('partsToBytes: sim/track.mjs parseTrack reads those hand-written bytes back as the three parts, environment 1', back.environment === 1 && sameParts(back.parts, parts), JSON.stringify(back.parts.map(keyOf)));
  // The rotation byte: bits 0-1 quarter turns, bits 2-4 the axis.
  const tilted = partsToBytes([part(0, 0, 0, 0, 3, { rotationAxis: 5 })]);
  check('partsToBytes: rotation 3 about axis 5 is stored as 3 | 5 << 2 = 23', tilted[26] === 23, `byte ${tilted[26]}`);
  // Two parts of one type are one group with count 2.
  const two = Array.from(partsToBytes([part(0, 1, 0, 0), part(0, 0, 0, 0)]));
  check('partsToBytes: two parts of a type form one group (count 2), written in the order given', two.length === 15 + 5 + 2 * 8 && two[16] === 2 && two[20] === 1 && two[28] === 0, JSON.stringify(two.slice(15)));
  let threw = false; try { partsToBytes([part(250, 0, 0, 0)]); } catch { threw = true; }
  check('partsToBytes: an unknown part type throws', threw);
});

await section('round trips', () => {
  // Parts spread over negative and large coordinates, every rotation, several gates.
  const parts = [part(5, -300, 1, 250, 2, { startOrder: 0 }), part(6, 400, 9, -410, 1)];
  let seed = 12345; const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let k = 0; k < 60; k++) parts.push(part([0, 1, 2, 3, 4, 36, 37, 38, 39, 41, 42, 82, 83][rnd(13)], rnd(700) - 350, rnd(12), rnd(700) - 350, rnd(4)));
  for (let k = 0; k < 7; k++) parts.push(part(52, rnd(700) - 350, rnd(12), rnd(700) - 350, rnd(4), { checkpointOrder: k }));
  const bytes = partsToBytes(parts, 2), save = encodeSaveString(parts, 2);
  // 1. sim/track.mjs
  const viaSim = parseTrack(decodeSaveString(save));
  check('encodeSaveString: sim/track.mjs decodes it to the same 69 parts and environment', viaSim.environment === 2 && sameParts(viaSim.parts, parts), `${viaSim.parts.length} parts`);
  // 2. vendor/polyrl/node/track_codec.mjs
  const viaVendor = vendorDecode(save);
  check('encodeSaveString: polyrl\'s decoder (decodeBits, inflate, decodeBits, inflate) gives back the exact bytes of partsToBytes', viaVendor.length === bytes.length && viaVendor.every((b, i) => b === bytes[i]), `${viaVendor.length} bytes`);
  check('encodeSaveString: and those bytes parse to the same parts', sameParts(parseTrack(viaVendor).parts, parts));
  check('encodeSaveString: the string is plain letters and digits (base 62)', /^[A-Za-z0-9]+$/.test(save), save.slice(0, 20));
  check('encodeSaveString: encoding the same parts twice gives the same string', encodeSaveString(parts, 2) === save);
  // 3. the export string
  const exported = encodeExportString(parts, 'tëst träck 1', 2);
  const parsed = parseExportString(exported);
  check('encodeExportString: starts with "PolyTrack2"; polyrl reads back the name (non-ASCII included), no author, no date', exported.startsWith('PolyTrack2') && parsed.name === 'tëst träck 1' && parsed.author === null && parsed.lastModified === null, `name "${parsed.name}"`);
  check('encodeExportString: its body is the same bytes as the save string\'s', parsed.payload.length === bytes.length && parsed.payload.every((b, i) => b === bytes[i]));
  check('encodeExportString: polyrl\'s exportToSaveString turns it into exactly encodeSaveString\'s string', exportToSaveString(exported) === save);
});

await section('official tracks through the encoder', () => {
  const bad = [];
  let total = 0, types = new Set(), axes = new Set();
  for (const name of TRACKS) {
    const original = parseTrack(decodeSaveString(loadTrack(name).trackData));
    const again = parseTrack(decodeSaveString(encodeSaveString(original.parts, original.environment)));
    total += original.parts.length;
    for (const p of original.parts) { types.add(p.typeId); axes.add(p.rotationAxis); }
    if (again.environment !== original.environment || !sameParts(again.parts, original.parts)) bad.push(name);
    // Within one part type the order must be kept too (start order and checkpoint order ride on it).
    else for (const t of types) {
      const a = original.parts.filter((p) => p.typeId === t).map(keyOf).join(';'), b = again.parts.filter((p) => p.typeId === t).map(keyOf).join(';');
      if (a !== b) { bad.push(`${name} (order of type ${t})`); break; }
    }
  }
  check('codec: each of the 17 official tracks, decoded, re-encoded by codec.mjs and decoded again, comes back part for part', bad.length === 0, bad.length ? bad.join(', ') : `${total} parts of ${types.size} part types, rotation axes ${[...axes].sort().join(',')}`);
});
