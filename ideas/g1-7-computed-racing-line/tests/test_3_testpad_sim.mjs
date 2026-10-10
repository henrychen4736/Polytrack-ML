// testpad.mjs: is the pad what it says (a full rectangle of flat plates, start
// plate at the origin), is it really flat, and does the car really rest on it?
// One simulator, about 3 s.
//
// Nothing here uses the author's measurements: the parts are read back with
// sim/track.mjs parseTrack, flatness is measured with ray casts into the
// collision mesh, and the car is watched in the simulator.
import { buildPad, PLATE_CELLS, PLATE_UNITS } from '../testpad.mjs';
import { SimSession } from '../../shared/sim_session.mjs';
import { decodeSaveString, parseTrack, rotate } from '../../../sim/track.mjs';
import { buildTrackMesh } from '../../../sim/trackmesh.mjs';
import { check, near, fmt, section } from './_check.mjs';

const WIDE = 3, LONG = 6, START_ROW = 1;
const pad = buildPad({ wide: WIDE, long: LONG, startRow: START_ROW });
let surface = null;   // height of the plates' top, measured below

await section('pad layout', () => {
  const { parts } = parseTrack(decodeSaveString(pad.trackData));
  check(`pad: parseTrack reads back wide x long = ${WIDE * LONG} parts`, parts.length === WIDE * LONG, `${parts.length} parts`);
  const starts = parts.filter((p) => p.startOrder != null);
  check('pad: exactly one start part, at grid cell (0, 0, 0)', starts.length === 1 && starts[0].x === 0 && starts[0].y === 0 && starts[0].z === 0, JSON.stringify(starts.map((p) => [p.x, p.y, p.z])));
  check('pad: every other part is one and the same type, unrotated, on one level', new Set(parts.filter((p) => p.startOrder == null).map((p) => p.typeId)).size === 1 && parts.every((p) => p.y === 0 && p.rotation === 0 && p.rotationAxis === 0));
  check('pad: no checkpoint and no finish (the car can drive for ever)', parts.every((p) => p.checkpointOrder == null));
  // A full rectangle: every cell of the grid exactly once, 4 cells apart.
  const cells = new Set(parts.map((p) => `${p.x},${p.z}`));
  let missing = 0;
  for (let i = 0; i < WIDE; i++) for (let j = 0; j < LONG; j++) if (!cells.has(`${(i - 1) * PLATE_CELLS},${(START_ROW - j) * PLATE_CELLS}`)) missing++;
  check('pad: the plates fill the whole rectangle with no gap and no duplicate', cells.size === WIDE * LONG && missing === 0, `${cells.size} distinct cells, ${missing} missing`);
  check('pad: bounds are worked out by hand for 3 x 6 plates, start row 1: x -30..30, z -90..30', JSON.stringify(pad.bounds) === JSON.stringify({ xMin: -30, xMax: 30, zMin: -90, zMax: 30 }), JSON.stringify(pad.bounds));
  check('pad: widthUnits and lengthUnits are plates x 20', pad.widthUnits === 60 && pad.lengthUnits === 120 && PLATE_UNITS === 20);
  // Default arguments and a second size, to catch a layout that only works for one.
  const big = buildPad({ wide: 5, long: 40, startRow: 3 });
  const bigParts = parseTrack(decodeSaveString(big.trackData)).parts;
  const zs = bigParts.map((p) => p.z * 5), xs = bigParts.map((p) => p.x * 5);
  check('pad: a 5 x 40 pad (2-byte coordinates) reads back with matching bounds', bigParts.length === 200 && Math.min(...zs) - 10 === big.bounds.zMin && Math.max(...zs) + 10 === big.bounds.zMax && Math.min(...xs) - 10 === big.bounds.xMin && Math.max(...xs) + 10 === big.bounds.xMax, JSON.stringify(big.bounds));
});

await section('pad is flat', () => {
  const mesh = buildTrackMesh(pad.trackData);
  // Cast straight down from y = 5 on a grid of points 1.3 units apart over the whole pad
  // (1.3 so the probes do not sit on plate seams, which are every 20 units).
  const heights = []; let holes = 0;
  const b = pad.bounds;
  for (let x = b.xMin + 0.4; x < b.xMax; x += 1.3) for (let z = b.zMin + 0.4; z < b.zMax; z += 1.3) {
    const d = mesh.raycast([x, 5, z], [0, -1, 0], 10);
    if (d === Infinity) holes++; else heights.push(5 - d);
  }
  surface = heights[0];
  const lo = Math.min(...heights), hi = Math.max(...heights);
  check('pad: a ray straight down finds the surface at every one of the probe points (no holes)', holes === 0 && heights.length > 4000, `${heights.length} probes, ${holes} holes`);
  check('pad: the surface is at one height everywhere (flat to 1e-6)', hi - lo < 1e-6, `heights ${fmt(lo, 6)} .. ${fmt(hi, 6)}`);
  // testpad.mjs says "top surface at y = 0.21" (it said 0.2 until this test measured it).
  check('pad: the surface height is the documented 0.21', near(surface, 0.21, 0.001), `measured ${fmt(surface, 4)}`);
  // Just outside the bounds there is nothing.
  let outside = 0;
  for (const [x, z] of [[b.xMin - 0.5, 0], [b.xMax + 0.5, 0], [0, b.zMin - 0.5], [0, b.zMax + 0.5]]) if (mesh.raycast([x, 5, z], [0, -1, 0], 10) !== Infinity) outside++;
  let inside = 0;
  for (const [x, z] of [[b.xMin + 0.5, 0], [b.xMax - 0.5, 0], [0, b.zMin + 0.5], [0, b.zMax - 0.5]]) if (mesh.raycast([x, 5, z], [0, -1, 0], 10) !== Infinity) inside++;
  check('pad: the plates end exactly at the stated bounds (0.5 inside is plate, 0.5 outside is not)', outside === 0 && inside === 4, `${inside} of 4 inside, ${outside} of 4 outside`);
  // Nothing sticks up: a horizontal ray just above the surface crosses the whole pad without a hit.
  const across = mesh.raycastFar([b.xMin + 1, surface + 0.05, b.zMax - 1], [0, 0, -1], b.zMax - b.zMin - 2);
  const diagonal = Math.hypot(b.xMax - b.xMin - 2, b.zMax - b.zMin - 2);
  const slanted = mesh.raycastFar([b.xMin + 1, surface + 0.05, b.zMax - 1], [(b.xMax - b.xMin - 2) / diagonal, 0, -(b.zMax - b.zMin - 2) / diagonal], diagonal);
  check('pad: nothing sticks up from it (rays 0.05 above the surface cross the pad without a hit)', across === Infinity && slanted === Infinity);
});

await section('car on the pad', async () => {
  const sim = await SimSession.create(pad);
  try {
    await sim.restart();
    await sim.hold({}, 1);
    const first = sim.state;
    check('pad: the car starts on the centre line within 2 units of the origin', Math.abs(first.position[0]) < 1e-3 && Math.hypot(first.position[0], first.position[2]) < 2, `position ${first.position.map((v) => fmt(v, 3)).join(', ')} (the start plate is centred on the origin)`);
    // Let it settle for 3 s, then watch it for 2 s.
    await sim.hold({}, 3000);
    const a = sim.state;
    await sim.hold({}, 2000);
    const z = sim.state;
    const up = rotate([0, 1, 0], z.quaternion);
    check('pad: with no keys the car stays put (under 0.001 units sideways or along in 2 s)', Math.hypot(z.position[0] - a.position[0], z.position[2] - a.position[2]) < 1e-3, `moved ${Math.hypot(z.position[0] - a.position[0], z.position[2] - a.position[2]).toExponential(2)} units`);
    check('pad: and does not sink or rise (under 0.005 units in 2 s)', Math.abs(z.position[1] - a.position[1]) < 0.005, `height ${fmt(a.position[1], 4)} -> ${fmt(z.position[1], 4)}`);
    check('pad: all four wheels are on the pad and the speedometer reads 0', z.wheelContact.every(Boolean) && Math.abs(z.speedKmh) < 0.05, `speed ${fmt(z.speedKmh, 4)} km/h`);
    check('pad: the car sits level (its up is world up to 0.1 degree)', up[1] > Math.cos(0.1 * Math.PI / 180), `up = ${up.map((v) => fmt(v, 5)).join(', ')}`);
    const rideHeight = z.position[1] - surface;
    check('pad: the car rests ON the plates (its origin 0.05 to 0.3 above the measured surface, not on the ground plane below)', rideHeight > 0.05 && rideHeight < 0.3, `origin ${fmt(rideHeight, 3)} above the surface`);
    check('pad: nothing touches the car body while it rests', z.collisionImpulses.length === 0);
    // It faces -z: W moves it towards -z in a straight line.
    await sim.hold({ up: true }, 2000);
    const w = sim.state;
    check('pad: the car faces -z (W moves it towards -z, under 0.01 units sideways)', w.position[2] < z.position[2] - 20 && Math.abs(w.position[0]) < 0.01, `after 2 s of W: x ${fmt(w.position[0], 4)}, z ${fmt(w.position[2], 2)}`);
    check('pad: still on the plates at the same ride height while driving (within 0.02)', Math.abs(w.position[1] - surface - rideHeight) < 0.02 && w.wheelContact.every(Boolean), `origin ${fmt(w.position[1] - surface, 3)} above the surface`);

    // The README's claim about the ground plane: off the plates the world has
    // drivable ground at y = 0. This pad ends at z = -90; keep W down.
    await sim.hold({ up: true }, 4000);
    const g = sim.state;
    check('ground plane: past the end of the pad (z < -90) the car is still on its wheels', g.position[2] < pad.bounds.zMin - 50 && g.wheelContact.every(Boolean), `z = ${fmt(g.position[2], 1)}, wheels ${g.wheelContact.map(Number).join('')}`);
    check('ground plane: it is at y = 0 (the car rides lower by the plates\' thickness)', near(g.position[1], rideHeight, 0.03), `origin at y = ${fmt(g.position[1], 3)}; on the plates it was ${fmt(rideHeight, 3)} above them`);
    // README: "slightly slower (314 against 320 km/h after 6 s of W)". The 320 is checked in test_4.
    check('ground plane: 6 s of W, mostly off the plates, gives about 314 km/h (README)', near(g.speedKmh, 314, 3), `${fmt(g.speedKmh, 1)} km/h`);
  } finally { await sim.close(); }
});
