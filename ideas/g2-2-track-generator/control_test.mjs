// Controls for the drivability test: does it tell a bad track from a weak driver?
//
//   node ideas/g2-2-track-generator/control_test.mjs
//
// "The follower finished it" proves a track drivable. "The follower did not
// finish" proves nothing by itself, so this runs three cases whose answer is
// known in advance and shows what each looks like in the test's output:
//
//   A. a BROKEN track    one piece taken out of the middle of a good track
//                        (a 20-unit hole in the road). Expected: the chain
//                        check fails, and the follower stops at the hole at
//                        every speed.
//   B. a WEAK DRIVER     a good track, a follower told the car grips ten
//                        times better than the default assumes. Expected: the chain check
//                        passes, the follower leaves the road at full speed
//                        and finishes once its speeds are scaled down.
//   C. the STEEPEST CLIMB at the slowest speed. Nothing the generator lays
//                        needs speed to get over, except possibly the steep
//                        ramp piece (rise 10 in 20). Expected: finishes at
//                        the bottom of the speed ladder, so "too slow to
//                        climb" is not a way for a generated track to be
//                        impossible.
//
// One simulator, about 60 s.
import { Env } from '../../sim/env.mjs';
import { generateTrack } from './generate.mjs';
import { encodeSaveString } from './codec.mjs';
import { matePorts } from './check_pieces.mjs';
import { driveTrack, SPEED_LADDER } from './drive.mjs';

const chainIntact = (parts) => { const { links } = matePorts(parts); return parts.every((_, i) => i + 1 === parts.length || links[i].has(i + 1)); };
const show = (track, drive) => drive.attempts.map((a) => `scale ${a.speedScale}: ${a.outcome} at ${(a.fraction * 100).toFixed(0)}% (${track.pieces[a.piece]})`).join('; ');

const env = await Env.create();
let ok = true;

// --- A. broken track ---------------------------------------------------------
{
  const track = generateTrack({ seed: 11, length: 400, difficulty: 0.3, slopes: false });
  // Take out a piece in the middle that is not a gate (the game would refuse
  // the finish for a missing checkpoint, which is a different failure).
  const hole = track.pieces.findIndex((name, i) => i > 2 && name !== 'Checkpoint' && name !== 'Finish');
  const parts = track.parts.filter((_, i) => i !== hole);
  const broken = { ...track, parts, createCar: { ...track.createCar, trackData: encodeSaveString(parts) } };
  const drive = await driveTrack(env, broken);
  const where = new Set(drive.attempts.map((a) => a.piece));
  const pass = !chainIntact(parts) && !drive.finished && where.size === 1;
  ok &&= pass;
  console.log(`A broken track (piece ${hole}, ${track.pieces[hole]}, removed): chain intact ${chainIntact(parts)}; ${show(track, drive)}  -> ${pass ? 'as expected' : 'UNEXPECTED'}`);
}

// --- B. weak driver ----------------------------------------------------------
{
  const track = generateTrack({ seed: 12, length: 400, difficulty: 1, slopes: false });
  const drive = await driveTrack(env, track, { maxKmh: 600, sideGrip: 200, brakeGrip: 100, ladder: [1, 0.6, 0.3] });
  const pass = chainIntact(track.parts) && drive.finished && drive.attempts.length > 1;
  ok &&= pass;
  console.log(`B weak driver (10x the grip assumed): chain intact ${chainIntact(track.parts)}; ${show(track, drive)}  -> ${pass ? 'as expected' : 'UNEXPECTED'}`);
}

// --- C. steepest climb, slowest speed ----------------------------------------
{
  // The first seed whose track climbs through the steep middle piece.
  let track = null;
  for (let seed = 1; !track; seed++) {
    const t = generateTrack({ seed, length: 400, difficulty: 1 });
    // "Slope" entered from below: the piece before it left the road climbing.
    const k = t.pieces.indexOf('Slope');
    if (k > 0 && t.route.points[t.route.piece.lastIndexOf(k)][1] > t.route.points[t.route.piece.indexOf(k)][1]) track = t;
  }
  const drive = await driveTrack(env, track, { ladder: [SPEED_LADDER.at(-1)] });
  ok &&= drive.finished;
  console.log(`C steep climb on ${track.name} (${track.pieces.join(' ')}): ${show(track, drive)}  -> ${drive.finished ? 'as expected' : 'UNEXPECTED'}`);
}

await env.close();
process.exit(ok ? 0 : 1);
