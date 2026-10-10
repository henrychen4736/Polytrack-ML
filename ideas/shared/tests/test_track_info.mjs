// track_info.mjs: geometry and the reference-free progress. No simulator
// except one short drive to compare the computed start pose with the car's.
import { loadTrackInfo } from '../track_info.mjs';
import { TRACKS } from '../laps.mjs';
import { SimSession } from '../sim_session.mjs';
import { checker } from './harness.mjs';

const { check, eq } = checker();
const info = loadTrackInfo('desert4');
const { path } = info;

check(info.name === 'desert4' && info.environment === 2, 'loadTrackInfo(desert4): name, and environment 2 = Desert');
check(path.gates.length === 4 && Math.round(path.length) === 1920, `desert4: 4 gates, path ${path.length.toFixed(1)} units (CONTRACT smoke: 1920 over 4 gates)`);
{
  let fine = true;
  const counts = {};
  for (const name of TRACKS) {
    const t = loadTrackInfo(name), g = t.path.gates;
    counts[name] = g.length;
    if (!g.at(-1).isFinish || g.slice(0, -1).some((x) => x.isFinish)) fine = false;
    if (t.path.cumulative.length !== g.length + 1 || t.path.cumulative[0] !== 0) fine = false;
    if (t.path.cumulative.some((c, k) => k && c <= t.path.cumulative[k - 1])) fine = false;
    if (Math.abs(t.path.cumulative.at(-1) - t.path.length) > 1e-9) fine = false;
  }
  check(fine, 'all 17 tracks: the finish is the last gate and only the last; cumulative starts at 0, rises, and ends at path.length');
  const n = Object.values(counts);
  check(Math.min(...n) >= 2 && Math.max(...n) <= 10, `gates per track are within the contract's "2 to 10" (${Math.min(...n)} to ${Math.max(...n)})`);
}

// ---- progress(), on made-up states --------------------------------------------------
const state = (position, nextCheckpointIndex, finishFrames = null) => ({ position, nextCheckpointIndex, finishFrames });
{
  const p = info.progress(state(path.start.position, 0));
  const toGate = Math.hypot(...path.gates[0].center.map((c, k) => c - path.start.position[k]));
  check(p.checkpoint === 0 && Math.abs(p.toGate - toGate) < 1e-9 && Math.abs(p.distance) < 1e-6 && Math.abs(p.fraction) < 1e-9, 'progress on the start line: checkpoint 0, distance 0, toGate = straight line to the first gate');
}
for (let k = 0; k < path.gates.length; k++) {
  const p = info.progress(state(path.gates[k].center, k));
  if (!check(p.toGate === 0 && Math.abs(p.distance - path.cumulative[k + 1]) < 1e-9, `progress at the centre of gate ${k} while aiming for it: distance = path length to that gate (${path.cumulative[k + 1].toFixed(1)})`)) break;
}
{
  // Halfway along the straight line from gate 0 to gate 1, aiming for gate 1.
  const a = path.gates[0].center, b = path.gates[1].center, mid = a.map((v, k) => (v + b[k]) / 2);
  const p = info.progress(state(mid, 1));
  check(Math.abs(p.distance - (path.cumulative[1] + path.cumulative[2]) / 2) < 1e-6, 'progress halfway between gates 0 and 1: halfway between their path lengths');
  // Miles away: never below the previous gate's value.
  const far = info.progress(state([1e5, 0, 1e5], 1));
  check(far.distance === path.cumulative[1] && far.checkpoint === 1, "progress far from the next gate: clamped at the previous gate's path length, not negative");
  // Finished: 1 whatever the position says.
  eq(info.progress(state([1e5, 0, 1e5], 0, 21750)), { distance: path.length, fraction: 1, checkpoint: path.gates.length, toGate: 0 }, 'progress of a finished car: distance = path.length, fraction 1');
  // The game's counter never passes the number of gates; a larger index must not crash.
  const over = info.progress(state(path.gates.at(-1).center, 99));
  check(over.checkpoint === path.gates.length - 1 && Math.abs(over.fraction - 1) < 1e-9, 'a checkpoint counter past the last gate is clamped to the finish gate');
}

// ---- the mesh --------------------------------------------------------------------------
{
  const from = [path.start.position[0], path.start.position[1] + 2, path.start.position[2]];
  const down = info.mesh.raycast(from, [0, -1, 0], 50), up = info.mesh.raycast(from, [0, 1, 0], 50);
  check(down > 1.5 && down < 4, `ray straight down from 2 units above the start position hits the road ${Number(down).toFixed(2)} units below`);
  check(up === Infinity, 'ray straight up from there hits nothing: Infinity');
  check(Math.abs(info.mesh.raycastFar(from, [0, -1, 0], 50) - down) < 1e-6, 'raycastFar agrees with raycast on the same ray');
  check(info.mesh.raycast(from, [0, -1, 0], 1) === Infinity, 'a ray shorter than the distance to the road reports Infinity');
  check(info.mesh.count > 0 && info.mesh.triangles.length >= 9 * info.mesh.count, `mesh: ${info.mesh.count} triangles`);
}

// ---- other ways to name a track ------------------------------------------------------------
{
  const byInputs = loadTrackInfo(info.createCar), byString = loadTrackInfo(info.createCar.trackData);
  eq([byInputs.name, byString.name, byInputs.parts.length, byString.parts.length, byString.path.length], [null, null, info.parts.length, info.parts.length, path.length],
    'loadTrackInfo(CreateCar inputs) and loadTrackInfo(save string): name null, same parts and path as by name');
}

// ---- against the simulator: the computed start pose is where the car really starts ----------
{
  const sim = await SimSession.create('desert4');
  await sim.restart();
  const r = await sim.hold({}, 1);
  const d = Math.hypot(...r.state.position.map((v, k) => v - path.start.position[k]));
  check(d < 1, `the car after its first tick is ${d.toFixed(3)} units from path.start.position`);
  const p = info.progress(r.state);
  check(p.checkpoint === 0 && p.distance < 1, 'progress() of the real car on the start line is 0');
  await sim.close();
}
