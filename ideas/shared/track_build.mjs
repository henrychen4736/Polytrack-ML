// Making tracks: parts -> the game's track string, and where each part type's
// road is open. PROMOTED in phase 2 from ideas/g2-2-track-generator/, where the
// code still lives (codec.mjs, pieces.mjs, check_pieces.mjs, generate.mjs);
// this file is the supported way in for other folders.
//
//   const trackData = encodeSaveString(parts, 0);       // parts as sim/track.mjs parseTrack gives them
//   const info = loadTrackInfo(trackData);              // track_info.mjs takes the string
//   const sim = await SimSession.create(info.createCar);
//
//   const table = loadPieceTable();                     // all 186 part types
//   worldPorts(part)     where this placed part's driving surface is open:
//                        [{ axis, out, plane, a, b, center, width, pitch }]: the world
//                        axis (0..2) and sign it faces, the grid plane it lies in,
//                        the two ends and the centre of its edge (world units),
//                        its width (11.13 for a standard road) and how steeply the
//                        road leaves through it
//   matePorts(parts)     which parts' surfaces join without a jump (a graph)
//
//   const t = generateTrack({ seed: 3, length: 600, difficulty: 0.3 });
//   t.createCar, t.route (centre line, 1 unit spacing), t.parts
//
// encodeSaveString is the inverse of sim/track.mjs decodeSaveString +
// parseTrack; the round trip was checked by g2-2's tester on the official
// tracks. A part is { typeId, x, y, z, rotation, rotationAxis,
// checkpointOrder, startOrder }, x / y / z in grid cells of 5 units;
// environment 0 / 1 / 2 = Summer / Winter / Desert.
//
// What cannot be done yet: RacingEnv (and so training) cannot open a track
// that is not a name under data/ or vendor/; sim/env.mjs loadTrack needs three
// lines for that (ideas/README.md, "Changes needed elsewhere"). Env,
// SimSession and loadTrackInfo take generated tracks today.
//
// The port table and anything written from it are derived from Kodub's part
// geometry: keep them on this machine (BRIEF.md rule 4).
export { encodeSaveString, encodeExportString, partsToBytes } from '../g2-2-track-generator/codec.mjs';
export { loadPieceTable, worldPorts, worldTiles } from '../g2-2-track-generator/pieces.mjs';
export { matePorts, reachable } from '../g2-2-track-generator/check_pieces.mjs';
export { generateTrack, saveTrack, loadGenerated } from '../g2-2-track-generator/generate.mjs';
