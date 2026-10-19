// A track's geometry and a progress measure that needs no human lap.
//
// sim/track.mjs (parts, checkpoint gates) and sim/trackmesh.mjs (collision
// triangles, ray casts) already do the work; this gathers them behind one
// call and adds the one thing that was missing: "how far round is the car?"
// answered from the track alone.
//
//   const info = loadTrackInfo('desert4');
//   info.parts, info.path.gates, info.mesh.raycastFar(from, dir, 200)
//   info.progress(state)   // { distance, fraction, checkpoint, toGate }
//
// Do not copy geometry out of here into files that leave this machine: the
// part shapes are Kodub's (BRIEF.md rule 4).
import { loadTrack, isTrackFile, trackLabel } from '../../sim/env.mjs';
import { decodeSaveString, parseTrack, buildPath } from '../../sim/track.mjs';
import { buildTrackMesh } from '../../sim/trackmesh.mjs';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Everything known about a track without driving it.
 *
 *   track   a track name, or CreateCar inputs { trackData, ... } / a bare
 *           save string for a track of your own (e.g. a generated one), or
 *           the path of a generated .track.json file (sim/env.mjs
 *           isTrackFile; name is then the file's base name)
 *
 * Returns
 *   name         the name, or null
 *   createCar    { trackData, mountainVertices, mountainOffset }: what
 *                Env.reset / SimSession.create take
 *   environment  0 / 1 / 2 as the track file numbers Summer / Winter / Desert
 *   parts        [{ typeId, x, y, z, rotation, rotationAxis, checkpointOrder,
 *                startOrder }], x/y/z in grid cells of PART_SIZE = 5 units
 *   path         sim/track.mjs buildPath: { start: { position, quaternion },
 *                gates: [{ order, isFinish, center, size, alternatives }],
 *                points, cumulative, length }. gates are the checkpoints in
 *                the order they must be taken, then the finish.
 *   mesh         (built on first use, 0.1 to 0.5 s) sim/trackmesh.mjs
 *                buildTrackMesh: { triangles, count, raycast(from, dir, max),
 *                raycastFar(from, dir, max) }; world units, y up, both ray
 *                casts return a distance or Infinity
 *   progress(state)   see below
 */
export function loadTrackInfo(track) {
  // A .track.json path is checked first: a path can be longer than 40
  // characters, and the test below would take it for a save string.
  const file = isTrackFile(track);
  const name = file ? trackLabel(track) : typeof track === 'string' && track.length < 40 ? track : null;
  const createCar = file ? loadTrack(track) : name ? loadTrack(name)
    : typeof track === 'string' ? { trackData: track, mountainVertices: new Float32Array(0), mountainOffset: { x: 0, y: 0, z: 0 } }
      : track;
  const parsed = parseTrack(decodeSaveString(createCar.trackData));
  const path = buildPath(parsed);
  let mesh = null;

  /**
   * How far round the lap a car is, from the checkpoints alone.
   *
   *   state   a decoded car state (sim/state.mjs decodeState, SimSession's
   *           .state, RacingEnv's .state)
   * Returns { distance, fraction, checkpoint, toGate }:
   *   checkpoint  gates passed so far (the game's own counter); the car's
   *               next target is path.gates[checkpoint]
   *   toGate      straight-line distance to that gate's centre, world units
   *   distance    path length up to that gate, minus toGate (never below the
   *               previous gate's value). Units; path.length at the finish.
   *   fraction    distance / path.length, 0..1
   *
   * What this is good for and what it is not. It is exact about ORDER: the
   * checkpoint count is the game's, so a car cannot score by driving the
   * wrong way or skipping a gate. Between two gates it is only a straight
   * line to the next gate, and the road is not straight: `distance` can stall
   * or dip for a while when the road leads away from the next gate (round a
   * hairpin, up a loop). The official tracks have only 2 to 10 gates per lap (most 3 to 5),
   * so that can last seconds. Use it to rank attempts that
   * are a gate apart, or seconds apart; do not use differences of a few units
   * as a reward. A finer reference-free measure is idea g2-1's job.
   */
  function progress(state) {
    const finished = state.finishFrames != null;
    const k = Math.min(state.nextCheckpointIndex, path.gates.length - 1);
    if (finished) return { distance: path.length, fraction: 1, checkpoint: path.gates.length, toGate: 0 };
    const toGate = dist(state.position, path.gates[k].center);
    // points[k] is where this leg starts (the start position or the previous
    // gate), cumulative[k + 1] the path length at the gate being aimed for.
    const distance = Math.max(path.cumulative[k], path.cumulative[k + 1] - toGate);
    return { distance, fraction: distance / path.length, checkpoint: k, toGate };
  }

  return {
    name, createCar, environment: parsed.environment, parts: parsed.parts, path, progress,
    get mesh() { return (mesh ??= buildTrackMesh(createCar.trackData)); },
  };
}

// ---- is there road under the car? ---------------------------------------------
//
// The world has a ground plane at y = 0 that the car can drive on (CONTRACT.md),
// so "the car is still moving and upright" does not mean it is on the track.
// These two answer that from the track's own collision triangles. Written by
// the independent tester of g2-2 (they were tests/_geometry.mjs there) and
// promoted unchanged in phase 2.

/**
 * Height of the track surface under a point, looking down from `above` units
 * over it as far as `reach` units: the surface's y, or null if there is none.
 * The mesh holds only the track's parts, so the world's ground plane at y = 0
 * never counts as road here.
 */
export function surfaceBelow(mesh, p, above = 1, reach = 3) {
  for (const [dx, dz] of [[0, 0], [0.04, 0.03], [-0.03, 0.04]]) {   // a ray can slip through the seam between two parts
    const d = mesh.raycast([p[0] + dx, p[1] + above, p[2] + dz], [0, -1, 0], reach);
    if (d !== Infinity) return p[1] + above - d;
  }
  return null;
}

/**
 * Watch a lap (decoded states, any spacing) for leaving the road: the car
 * counts as on the road when the track's own surface is within `maxGap` units
 * under its origin (it rides 0.13 above the road; `maxGap` 1.5 allows hops
 * over crests). Returns { offRoad, worstGap, lowest, firstOff }:
 *   offRoad   how many of the states had no track surface under the car
 *   lowest    the lowest height the car's origin reached
 */
export function watchLap(mesh, states, maxGap = 1.5) {
  let offRoad = 0, worstGap = 0, lowest = Infinity, firstOff = null;
  for (const s of states) {
    const y = surfaceBelow(mesh, s.position, 0.5, maxGap + 0.5);
    lowest = Math.min(lowest, s.position[1]);
    if (y == null) { offRoad++; firstOff ??= s.frames; } else worstGap = Math.max(worstGap, s.position[1] - y);
  }
  return { offRoad, worstGap, lowest, firstOff };
}
