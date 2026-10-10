// Generated tracks in the simulator. One simulator, about 60 s.
//
//   start        the car, left alone, rests on the road (not on the ground
//                plane 10 units below it)
//   follower     drive.mjs finishes fresh tracks; its keys, replayed as a
//                recording, finish on the same tick; the game's own Verify
//                accepts the lap; and the replay is WATCHED: the checkpoint
//                counter must go up one at a time to the finish, and the track's
//                own surface must be under the car on every sampled tick
//   saved laps   all 20 laps in tracks/sample replay to their recorded tick,
//                through every checkpoint, on the road
//   controls     a track with a piece removed must fail; a follower told the
//                car has ten times the grip must fail at full speed
//   the grass    the world has drivable ground at y = 0. A car that leaves the
//                road must not be able to finish, and a drivability test must
//                not be fooled by one that drives on the grass:
//                  - every gate of a raised track is out of reach from the ground
//                  - a follower with NO off-road rule drives a broken raised
//                    track to the end underneath the road: it must not finish
//                  - a broken track AT GROUND LEVEL (baseLevel 0), where the
//                    hole is only a 0.21 step down onto the grass: driveTrack
//                    must not report it finished, and this file's own watcher
//                    must flag the lap that crosses the hole
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Env } from '../../../sim/env.mjs';
import { decodeState } from '../../../sim/state.mjs';
import { rotate } from '../../../sim/track.mjs';
import { createController } from '../../../sim/controller.mjs';
import { keysToRecording } from '../../shared/laps.mjs';
import { generateTrack, loadGenerated } from '../generate.mjs';
import { encodeSaveString } from '../codec.mjs';
import { driveTrack, routeToLine, DRIVER_DEFAULTS, SPEED_LADDER } from '../drive.mjs';
import { decodeParts, gatesOf, detectorBox, meshOf, surfaceBelow, watchLap } from './_geometry.mjs';
import { check, near, fmt, section } from './_check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const env = await Env.create();

/**
 * Replay a recording and watch it. Returns { finished, finishFrames, inOrder,
 * checkpoints, offRoad, worstGap, lowest }: `inOrder` is true when the game's
 * checkpoint counter only ever rose, one gate at a time, and stood at the
 * number of checkpoints when the car finished.
 */
async function watchReplay(createCar, recording, frames) {
  const run = await env.replay(createCar, recording, frames + 200);
  const states = run.states.map(decodeState);
  const parts = decodeParts(createCar.trackData);
  const wanted = gatesOf(parts).checkpoints.length;
  let inOrder = true, previous = 0;
  for (const s of states) { if (s.nextCheckpointIndex !== previous && s.nextCheckpointIndex !== previous + 1) inOrder = false; previous = s.nextCheckpointIndex; }
  // Every 10th tick is every 0.7 units at the follower's top speed.
  const watched = watchLap(meshOf(createCar.trackData), states.filter((_, k) => k % 10 === 0));
  return { finished: run.finished, finishFrames: run.finishFrames, inOrder: inOrder && previous === wanted, checkpoints: previous, wanted, ...watched };
}

/** A copy of `track` with one piece taken out of the middle (not a gate). */
function withHole(track) {
  const hole = track.pieces.findIndex((name, i) => i > 2 && name !== 'Checkpoint' && name !== 'Finish');
  const parts = track.parts.filter((_, i) => i !== hole);
  return { hole, broken: { ...track, parts, createCar: { ...track.createCar, trackData: encodeSaveString(parts, track.environment) } } };
}

try {
  // -------------------------------------------------------------------------
  // Fresh tracks: start, drive, replay.
  // -------------------------------------------------------------------------
  const fresh = [{ seed: 3, length: 400, difficulty: 0.5 }, { seed: 5, length: 400, difficulty: 1 }, { seed: 62, length: 450, difficulty: 0.8, environment: 2 }];
  for (const options of fresh) {
    const track = generateTrack(options);
    const mesh = meshOf(track.trackData);
    await section(`${track.name} start`, async () => {
      env.reset(track.createCar);
      const first = decodeState((await env.step({}, 1))[0]);
      const settled = decodeState((await env.step({}, 1500)).at(-1));
      const later = decodeState((await env.step({}, 1000)).at(-1));
      const road = surfaceBelow(mesh, later.position, 0.5, 2);
      const up = rotate([0, 1, 0], later.quaternion);
      const ok = later.wheelContact.every(Boolean) && Math.abs(later.speedKmh) < 0.05
        && Math.hypot(later.position[0] - first.position[0], later.position[2] - first.position[2]) < 0.02
        && Math.abs(later.position[1] - settled.position[1]) < 0.005
        && road != null && later.position[1] - road > 0.05 && later.position[1] - road < 0.3 && later.position[1] > 5
        && up[1] > 0.9999 && later.collisionImpulses.length === 0
        && Math.hypot(...first.position.map((v, c) => v - track.route.start.position[c])) < 0.01;
      check(`${track.name}: left alone for 2.5 s the car rests on the road: four wheels down, level, not moving or sinking, its origin 0.05 to 0.3 above the road surface, at the documented start pose`, ok,
        `moved ${fmt(Math.hypot(later.position[0] - first.position[0], later.position[2] - first.position[2]), 4)}, sank ${fmt(settled.position[1] - later.position[1], 4)} in the last second, origin ${road == null ? 'has NO ROAD under it' : `${fmt(later.position[1] - road, 3)} above the road`}, y = ${fmt(later.position[1], 2)}, wheels ${later.wheelContact.map(Number).join('')}`);
    });
    await section(`${track.name} drive`, async () => {
      const drive = await driveTrack(env, track);
      check(`${track.name}: the follower finishes, at the first speed tried (README: "all at the first speed tried")`, drive.finished && drive.speedScale === 1, `${drive.attempts.map((a) => `scale ${a.speedScale}: ${a.outcome} at ${(100 * a.fraction).toFixed(0)}%, ${fmt(a.worstOffLine, 1)} off the line`).join('; ')}${drive.finished ? `; ${(drive.finishFrames / 1000).toFixed(2)} s` : ''}`);
      if (!drive.finished) return;
      check(`${track.name}: the lap has one set of keys per tick up to the finish`, drive.keys.length === drive.finishFrames);
      const recording = keysToRecording(drive.keys);
      const seen = await watchReplay(track.createCar, recording, drive.finishFrames);
      check(`${track.name}: the keys, replayed as a recording, finish on the same tick`, seen.finished && seen.finishFrames === drive.finishFrames, `replay ${seen.finishFrames}, drive ${drive.finishFrames}`);
      check(`${track.name}: the replay passes every checkpoint in order (the game's counter rises 0 to ${seen.wanted} one at a time)`, seen.inOrder, `counter ended at ${seen.checkpoints} of ${seen.wanted}`);
      check(`${track.name}: the car has the track's own surface under it on every sampled tick of the lap and never comes near the ground`, seen.offRoad === 0 && seen.worstGap < 1 && seen.lowest > 5, `${seen.offRoad} ticks with no road beneath, largest gap ${fmt(seen.worstGap, 2)}, lowest y ${fmt(seen.lowest, 2)}`);
      const verify = (targetFrames) => env.worker.verify({ ...track.createCar, carRecording: recording, targetFrames });
      const accepted = await verify(drive.finishFrames), early = await verify(drive.finishFrames - 1);
      check(`${track.name}: the game's own Verify accepts the lap at its finish tick and rejects it one tick earlier`, accepted === true && early === false, `${accepted}, ${early}`);
      // README: the follower "averages about 110 km/h".
      const kmh = track.route.length / (drive.finishFrames / 1000) * 3.6;
      check(`${track.name}: the follower's average speed is in the README's range (80 to 140 km/h; "about 110")`, kmh > 80 && kmh < 140, `${fmt(kmh, 0)} km/h`);
    });
  }

  // -------------------------------------------------------------------------
  // The 20 saved sample laps.
  // -------------------------------------------------------------------------
  await section('saved laps', async () => {
    const dir = path.join(root, 'ideas/g2-2-track-generator/tracks/sample');
    const files = readdirSync(dir).filter((f) => f.endsWith('.track.json')).sort();
    const bad = [];
    let ticks = 0, slowest = 0;
    for (const f of files) {
      const track = loadGenerated(path.join(dir, f));
      const lap = JSON.parse(readFileSync(path.join(dir, f.replace('.track.json', '.lap.json')), 'utf8'));
      const seen = await watchReplay(track.createCar, lap.recording, lap.frames);
      ticks += lap.frames; slowest = Math.max(slowest, lap.frames);
      if (!seen.finished || seen.finishFrames !== lap.frames) bad.push(`${track.name}: replay ${seen.finished ? `finishes on ${seen.finishFrames}, file says ${lap.frames}` : 'does not finish'}`);
      else if (!seen.inOrder) bad.push(`${track.name}: checkpoint counter ended at ${seen.checkpoints} of ${seen.wanted}`);
      else if (seen.offRoad || seen.lowest < 5) bad.push(`${track.name}: ${seen.offRoad} ticks off the road, lowest y ${fmt(seen.lowest, 1)}`);
      if (lap.track !== track.name) bad.push(`${f}: lap file names track ${lap.track}`);
    }
    check('saved laps: all 20 laps in tracks/sample replay to a finish on their recorded tick, through every checkpoint in order, on the road throughout', files.length === 20 && bad.length === 0, bad.length ? bad.slice(0, 4).join(' | ') : `${files.length} laps, ${(ticks / files.length / 1000).toFixed(1)} s on average, slowest ${(slowest / 1000).toFixed(1)} s`);
  });

  // -------------------------------------------------------------------------
  // Controls.
  // -------------------------------------------------------------------------
  const good = generateTrack({ seed: 11, length: 400, difficulty: 0.3, slopes: false });
  let goodDrive = null;
  await section('control: broken track', async () => {
    goodDrive = await driveTrack(env, good);
    check('control: the intact track is finished by the follower', goodDrive.finished, goodDrive.attempts.map((a) => a.outcome).join(', '));
    const { hole, broken } = withHole(good);
    // Our own structure check sees the hole: route points with no road under them.
    const mesh = meshOf(broken.createCar.trackData);
    const gaps = good.route.points.filter((p) => surfaceBelow(mesh, p, 1, 2.5) == null).length;
    check(`control: with piece ${hole} (${good.pieces[hole]}) removed, the route has a stretch with no road under it`, gaps >= 15, `${gaps} route points over the hole`);
    const drive = await driveTrack(env, broken);
    check('control: the follower does not finish the broken track at any speed of its ladder', !drive.finished && drive.attempts.length === SPEED_LADDER.length && drive.attempts.every((a) => a.outcome !== 'finished'), drive.attempts.map((a) => `scale ${a.speedScale}: ${a.outcome} at ${(100 * a.fraction).toFixed(0)}%`).join('; '));
    check('control: and stops at the hole every time (within 15 route points of where the road ends)', drive.attempts.every((a) => { const first = good.route.points.findIndex((p) => surfaceBelow(mesh, p, 1, 2.5) == null); return Math.abs(a.fraction * (good.route.points.length - 1) - first) <= 15; }), `hole begins at ${(100 * good.route.points.findIndex((p) => surfaceBelow(mesh, p, 1, 2.5) == null) / (good.route.points.length - 1)).toFixed(0)}% of the route`);
    // The lap that finishes the intact track does not finish the broken one.
    if (goodDrive.finished) {
      const replay = await env.evaluate(broken.createCar, keysToRecording(goodDrive.keys), goodDrive.finishFrames + 3000);
      check('control: the lap that finishes the intact track does not finish the broken one', !replay.finished, `finished ${replay.finished}, checkpoints ${replay.checkpoints}`);
    }
  });

  await section('control: overconfident follower', async () => {
    const hard = generateTrack({ seed: 12, length: 400, difficulty: 1, slopes: false });
    const wild = await driveTrack(env, hard, { maxKmh: 600, sideGrip: 200, brakeGrip: 100, ladder: [1] });
    check('control: a follower told the car has ten times the grip (600 km/h, side 200, brake 100) does not finish at full speed', !wild.finished, wild.attempts.map((a) => `${a.outcome} at ${(100 * a.fraction).toFixed(0)}%`).join('; '));
    const sane = await driveTrack(env, hard);
    check('control: the same track is finished with the default settings, so that failure was the driver', sane.finished && sane.speedScale === 1, sane.attempts.map((a) => a.outcome).join(', '));
    check('control: the defaults are the README\'s (250 km/h, side 20, crest 5, brake 15; ladder 1 / 0.7 / 0.45)', DRIVER_DEFAULTS.maxKmh === 250 && DRIVER_DEFAULTS.sideGrip === 20 && DRIVER_DEFAULTS.crestGrip === 5 && DRIVER_DEFAULTS.brakeGrip === 15 && SPEED_LADDER.join() === '1,0.7,0.45');
  });

  // -------------------------------------------------------------------------
  // The grass.
  // -------------------------------------------------------------------------
  /** The follower with NO rule about leaving the road: what an unguarded drivability test would do. */
  async function unguarded(track) {
    env.reset(track.createCar);
    const line = routeToLine(track.route), decide = createController(line, { crossTrackGain: 1 });
    let state = decodeState((await env.step({}, 1))[0]);
    const states = [state];
    let best = 0, bestTick = 0;
    while (state.frames < 90000) {
      const { controls, progress } = decide(state);
      state = decodeState((await env.step(controls, 5)).at(-1));
      states.push(state);
      if (progress > best) { best = progress; bestTick = state.frames; }
      if (state.finishFrames != null || state.frames - bestTick > 4000) break;
    }
    return { finished: state.finishFrames != null, reached: best / (line.points.length - 1), state, states };
  }

  await section('grass: raised track', async () => {
    // Geometry first: with the road raised, can a car on the ground (its origin at y = 0.13, about 1.5 tall) be inside a gate?
    let lowest = Infinity, gates = 0;
    for (const options of [...fresh, { seed: 301, length: 2500, difficulty: 0.7 }, { seed: 77, length: 1500, difficulty: 0.9 }]) {
      const parts = decodeParts(generateTrack(options).trackData);
      const { checkpoints, finishes } = gatesOf(parts);
      for (const g of [...checkpoints, ...finishes]) { const box = detectorBox(g); lowest = Math.min(lowest, box.center[1] - box.size[1] / 2); gates++; }
    }
    check('grass: on raised tracks (the default) the bottom of every checkpoint and finish box is over 4 units above the ground plane', lowest > 4, `lowest gate box bottom at y = ${fmt(lowest, 2)} over ${gates} gates`);
    // Then in the simulator: the unguarded follower on the broken raised track falls into
    // the hole and drives on along the route, on the ground, 10 units under the road.
    const { broken } = withHole(good);
    const run = await unguarded(broken);
    const finish = detectorBox(gatesOf(decodeParts(broken.createCar.trackData)).finishes[0]);
    const closest = Math.min(...run.states.map((s) => Math.hypot(s.position[0] - finish.center[0], s.position[2] - finish.center[2])));
    const watched = watchLap(meshOf(broken.createCar.trackData), run.states);
    check('grass: a car that fell off a raised road and drove on underneath it reaches the spot under the finish (within 3 units in plan)', closest < 3 && run.reached > 0.95 && watched.lowest < 1, `closest ${fmt(closest, 1)} units in plan, ${(100 * run.reached).toFixed(0)}% of the route "covered", lowest y ${fmt(watched.lowest, 2)}`);
    check('grass: and is NOT given the finish, nor any checkpoint beyond the hole', !run.finished && run.state.nextCheckpointIndex === 0, `finished ${run.finished}, checkpoint counter ${run.state.nextCheckpointIndex}`);
    check('grass: this file\'s watcher flags that drive as off the road', watched.offRoad > 100, `${watched.offRoad} of ${run.states.length} watched states with no road beneath, from tick ${watched.firstOff}`);
  });

  await section('grass: ground-level track', async () => {
    // baseLevel 0 puts the road on the ground: surface at 0.21, grass at 0. A missing
    // piece is then a hole a car simply drives across.
    const ground = generateTrack({ seed: 11, length: 400, difficulty: 0.3, slopes: false, baseLevel: 0 });
    check('grass: baseLevel 0 gives the same layout as the default, 10 units lower (road surface at 0.21)', ground.pieces.join() === good.pieces.join() && near(ground.route.points[0][1], 0.21, 0.01) && ground.name.endsWith('_b0'), `route height ${ground.route.points[0][1]}, name ${ground.name}`);
    const { hole, broken } = withHole(ground);
    // What the trap looks like: the unguarded follower finishes the broken track.
    const run = await unguarded(broken);
    const watched = watchLap(meshOf(broken.createCar.trackData), run.states);
    check(`grass: an unguarded follower DOES finish a ground-level track with piece ${hole} (${ground.pieces[hole]}, ${ground.route.piece.filter((v) => v === hole).length} units of road) missing: the trap is real`, run.finished, `finished ${run.finished}, checkpoint counter ${run.state.nextCheckpointIndex}`);
    check('grass: this file\'s watcher catches it: that "finishing" lap has no road under the car across the hole', watched.offRoad > 20, `${watched.offRoad} of ${run.states.length} watched states with no road beneath, from tick ${watched.firstOff}`);
    // drive.mjs itself must not be fooled.
    const drive = await driveTrack(env, broken);
    check('grass: driveTrack does not report the broken ground-level track as finished', !drive.finished, drive.attempts.map((a) => `scale ${a.speedScale}: ${a.outcome} at ${(100 * a.fraction).toFixed(0)}%`).join('; '));
    // ... and must still finish the intact one (the rule that catches the hole must not catch a good road).
    const whole = await driveTrack(env, ground);
    check('grass: driveTrack still finishes the intact ground-level track', whole.finished, whole.attempts.map((a) => `scale ${a.speedScale}: ${a.outcome}`).join('; '));
    if (whole.finished) {
      const seen = await watchReplay(ground.createCar, keysToRecording(whole.keys), whole.finishFrames);
      check('grass: and that lap stays on the road surface (never on the grass beside it)', seen.offRoad === 0 && seen.inOrder, `${seen.offRoad} ticks with no road beneath`);
    }
  });
} finally { await env.close(); }
