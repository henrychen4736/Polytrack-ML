# g2-2: random track generator

Lays random, valid PolyTrack tracks out of the game's own road pieces, so a
generalist can train on hundreds of tracks instead of 17. Every track comes
with its centre-line route (the generator knows where it put the road) and,
once driven by the scripted follower here, a finishing lap. A generated track
is a part list, so no geometry of Kodub's is stored in this folder.

**Where it stands:** the generator, the encoder and the drivability test work.
54 of 54 generated tracks driven were finished by the scripted follower.
The tracks are narrow-road chains only (no wide roads, no jumps, no blocks),
which is about a third of what the official tracks are built from; see
"What is not done".

## Run it

All from the project root. Only the commands marked *simulator* start one
(one process, one simulator each).

```
node ideas/g2-2-track-generator/smoke_test.mjs                  # simulator, about 40 s: 8 tracks, 9 checks each
node ideas/g2-2-track-generator/control_test.mjs                # simulator, about 25 s: broken track / weak driver / steep climb
node ideas/g2-2-track-generator/check_pieces.mjs                # piece table against the 17 official tracks, 6 s
node ideas/g2-2-track-generator/check_pieces.mjs --table        # the whole port table as Markdown
node ideas/g2-2-track-generator/bulk_check.mjs --count 300      # structure of 300 tracks, 70 s
node ideas/g2-2-track-generator/compare_g21.mjs                 # g2-1's route finder against this route, 5 s

# make a folder of tracks, then drive them to get a lap for each
node ideas/g2-2-track-generator/generate.mjs --count 20 --seed 500 --length 600 --difficulty mixed --out ideas/g2-2-track-generator/tracks/sample
node ideas/g2-2-track-generator/drive_folder.mjs --dir ideas/g2-2-track-generator/tracks/sample      # simulator
```

`generate.mjs` options: `--count`, `--seed` (track k uses seed + k),
`--length` (units of centre line, about metres), `--difficulty` (0 to 1, or
`mixed` to spread the tracks from 0 to 1), `--flat` (no slopes), `--out`.
In code:

```js
import { generateTrack, saveTrack, loadGenerated } from './ideas/g2-2-track-generator/generate.mjs';
const track = generateTrack({ seed: 7, length: 800, difficulty: 0.5 });
const sim = await SimSession.create(track.createCar);     // or env.reset(track.createCar), loadTrackInfo(track.createCar)
```

## Files

| File | What it is |
| --- | --- |
| `pieces.mjs` | The piece table: for every part type, its ports (where the driving surface is open), worked out from the collision triangles |
| `check_pieces.mjs` | Mates ports of placed parts; checks the table on the official tracks |
| `codec.mjs` | Parts to track string (the encoder the project did not have), and to the editor's export string |
| `generate.mjs` | The generator, the route, save and load |
| `drive.mjs` | Scripted follower: `sim/controller.mjs` on the route, with speeds from the route's curvature |
| `smoke_test.mjs`, `control_test.mjs`, `bulk_check.mjs`, `compare_g21.mjs`, `drive_folder.mjs` | Tests and the batch driver |
| `tracks/smoke/` | The 8 tracks of the last smoke test (rewritten on each run) |
| `tracks/sample/` | 20 tracks, seeds 500 to 519, 600 units, difficulty 0 to 1, each with a lap |

## 1. The piece table

`pieces.mjs` finds each part's ports from the triangles the simulator
collides with (`data/init_0.6.3.json`): boundary edges of the upward-facing
surface that lie on a grid plane and have no kerb or wall standing on them.
A port has a position, a width, a facing and a pitch (how steeply the road
leaves through it). Two ports mate when they are on the same plane, face each
other, overlap by 4 units and are within 0.3 units in height.

The 16 part types the generator uses. Positions are in grid cells (5 units)
from the part's own position, before rotation; the car on a start part faces
local -z. Heights and widths are in units. Every one has exactly two ports
of the standard road width.

| id | part | port faces | centre x, z (cells) | height | width | pitch |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | Straight | -z / +z | 0, -2 / 0, 2 | 0.21 / 0.21 | 11.13 | 0 / 0 |
| 1 | TurnSharp | +x / +z | 2, 0 / 0, 2 | 0.21 / 0.21 | 11.13 | 0 / 0 |
| 2 | SlopeUp | -z / +z | 0, -2 / 0, 2 | 5.21 / 0.21 | 11.13 | 0.49 / -0.01 |
| 3 | SlopeDown | -z / +z | 0, -2 / 0, 2 | 0.21 / 5.21 | 11.13 | -0.49 / 0.01 |
| 4 | Slope | -z / +z | 0, -2 / 0, 2 | 10.21 / 0.21 | 11.13 | 0.50 / -0.50 |
| 5 | Start | -z / +z | 0, -2 / 0, 2 | 0.21 / 0.21 | 11.13 | 0 / 0 |
| 6 | Finish | -z / +z | 0, -2 / 0, 2 | 0.21 / 0.21 | 11.13 | 0 / 0 |
| 36 | TurnShort | +x / +z | 6, -4 / 0, 2 | 0.21 / 0.21 | 11.13 | 0 / 0 |
| 37 | TurnLong | +x / +z | 10, -8 / 0, 2 | 0.21 / 0.21 | 11.13 | 0 / 0 |
| 38 | SlopeUpLong | -z / +z | 0, -6 / 0, 2 | 10.21 / 0.21 | 11.13 | 0.49 / -0.01 |
| 39 | SlopeDownLong | -z / +z | 0, -2 / 0, 6 | 0.21 / 10.21 | 11.13 | -0.49 / 0.01 |
| 41 | TurnSLeft | +z / -z | 0, 2 / -4, -10 | 0.21 / 0.21 | 11.13 | 0 / 0 |
| 42 | TurnSRight | +z / -z | 0, 2 / 4, -10 | 0.21 / 0.21 | 11.13 | 0 / 0 |
| 52 | Checkpoint | -z / +z | 0, -2 / 0, 2 | 0.21 / 0.21 | 11.13 | 0 / 0 |
| 82 | TurnLong2 | +x / +z | 14, -12 / 0, 2 | 0.21 / 0.21 | 11.13 | 0 / 0 |
| 83 | TurnLong3 | +x / +z | 18, -16 / 0, 2 | 0.21 / 0.21 | 11.13 | 0 / 0 |

So the turns are quarter circles of radius 10, 30, 50, 70 and 90 units, the
S-bends move the road 20 units sideways over 60, and the ramps climb 5 or 10
units. A piece can be driven through either way: a turn piece entered from
its other end is the same turn in the other direction, a ramp entered from
the top is a descent. `SlopeUp` is level at the bottom and steep at the top,
`SlopeDown` level at the top and steep at the bottom, so a hill is `SlopeUp`,
any number of `Slope`, then `SlopeDown` driven backwards; the generator gets
this from matching pitches, not from a rule about hills.

`check_pieces.mjs --table` prints all 74 road part types (wide roads,
intersections, the vertical and tilted pieces) with their ports.

**Checked against the official tracks** (`check_pieces.mjs`):

- 2863 of the 3005 ports of road parts on the 17 official tracks (95%) mate
  with a neighbouring part's port.
- **Only 4 of 17 official tracks (summer5, summer6, desert2, desert4) can be
  driven from the start through every checkpoint to the finish across mated
  ports alone.** The other 13 have a gap in the surface on the way: a jump, or
  parts stood on their side (wall rides, loops; 8 tracks have such parts). So
  the official tracks are NOT reconstructible as a chain of pieces, and I did
  not try to make them so: they are mostly open surfaces of blocks and planes
  with wide roads between, joined by jumps.
- The 16 types above are 369 of the 1111 road-category parts on the official
  tracks (33%). `StraightWide` alone is 441. `TurnSharp` and `TurnLong2` are
  on no official track.
- Surface part types on official tracks for which no port was found:
  WallTrackMiddleCorner (142 placed), PlaneWallInnerCorner (85), BlockBridge
  (39), and five PlaneWallSlope types (9). The first three have no upward
  surface reaching a grid plane; they are walls, corners and bridge decks.
  Not characterised at all: anything about parts stood on their side, and the
  tilted (banked) road pieces 159 to 167, whose ports are found but whose
  banking the mating rule does not compare.

## 2. The generator

A chain: start, random pieces, a checkpoint whenever 200 units have passed
since the last gate, and the finish at the first level spot past the wanted
length. Each new piece is turned and moved so its entry port lands on the
previous exit port with the same pitch, and is accepted only if its grid
cells are free. A depth-first search steps back when nothing fits.

- **In:** flat straights, the five turn radii, both S-bends, short and long
  ramps and the steep ramp piece, start, checkpoints, finish.
- **Not in:** jumps, wide roads, intersections, blocks and planes, banked
  turns, wall rides, loops, scenery (pillars: the roads float, which the
  physics does not mind).
- **Self-intersection:** no two pieces share a grid cell. A road may cross
  over another only two or more levels up (9.8 units of clear height); 93 of
  300 tracks in the bulk check have such a crossing.
- **Seed:** the same options give the same track string (checked on every
  smoke-test track).
- **Difficulty** is the mix of pieces: at 0 mostly straights and the 70 and
  90 unit turns; at 1 few straights, the 30 unit turn common, the 10 unit
  `TurnSharp` in (from 0.6), more ramps. It is a knob on the mix, not a
  measured difficulty: the follower's time per unit rises with it (27 ms per
  unit at 0, 42 at 1 in the smoke test), and that is all that was measured.
- **Height:** the start is at grid level 2 (10 units up) by default. The
  simulator has flat ground at height 0, level with a road at level 0: a car
  driven off the end of a level-0 road carried on across it at y = 0.1 and
  reached 385 km/h. On a raised road a car that leaves falls and cannot
  rejoin, so finishing means having stayed on the road. `baseLevel: 0` puts
  the road on the ground.

`bulk_check.mjs`, 300 tracks, lengths 600 to 3000, difficulty 0 to 1: 300
generated, 0 failed a structure check; mean 31.5 pieces, 1576 units, 6.3
gates; 0.21 s per track (the slowest 1.3 s), most of it building the mesh for
the route.

## 3. Is a generated track real?

`smoke_test.mjs` runs nine checks per track. The first seven and the ninth
must pass; the eighth is the drive.

1. same seed, same track
2. the track string decodes (with `sim/track.mjs`) to the parts written, and
   the editor export string holds the same track
3. every piece's exit port mates with the next piece's entry port, and only
   two ports in the track are open (behind the start, beyond the finish)
4. no overlap
5. every route point has road underneath it (ray cast on the track's mesh)
6. save and load give the same track
7. the car, left alone for 500 ticks on the loaded track, has all four wheels
   on the road and is within 0.1 units of its start position
8. the follower reaches the finish, which the game only grants after every
   checkpoint in order, without ever being more than 5 units from the middle
   of the road (the kerbs are 5.57 out)
9. the follower's keys, encoded as a recording and replayed by the simulator,
   finish on the same tick

**Numbers.** With the final settings (raised road, follower at 250 km/h top
speed):

| Run | Tracks | Checks 1-7, 9 | Follower finished |
| --- | --- | --- | --- |
| smoke test default: 500 units, difficulty 0 to 1 | 8 | 8 | 8 |
| `--count 12 --seed 100 --length 800` | 12 | 12 | 12 |
| `--count 10 --seed 200 --length 600 --difficulty 1` | 10 | 10 | 10 |
| `--count 4 --seed 300 --length 2500 --difficulty 0.7` (all with crossings) | 4 | 4 | 4 |
| `drive_folder.mjs` on `tracks/sample` (check 8 only) | 20 | - | 20 |

54 of 54, all at the first speed tried. The worst distance from the centre
line was 1.9 units on the 22 tracks of the first, third and fourth rows (I
did not keep that column for the other two runs). (Before the road was raised, an earlier, slower follower also
finished 20 of 20 at ground level, but there leaving the road could not be
told from staying on it, so those do not count.) The follower averages about
110 km/h: 600 units in about 20 s. It is a proof of drivability, not a fast
lap.

The follower's speed settings come from one probe on one hard flat track
(seed 12, 400 units, at ground level), top speed / side grip / braking:
150 / 9 / 8 finished in 23.5 s, worst 1.5 units off the line; 250 / 20 / 15
in 17.2 s, 1.7 off; 400 / 36 / 32 in 13.8 s, 2.1 off; 600 / 200 / 100
stalled against a kerb at 48%. The defaults are the second: the car has far
more grip than the follower uses.

**An impossible track against a weak driver.** A failed drive proves nothing
by itself, so three things are used together, and `control_test.mjs` shows
each on a case with a known answer:

- *The structure checks do not use the driver.* A track with one piece taken
  out fails check 3, and the follower leaves the road at the hole at every
  speed (41%, 40%, 39% of the route, same piece). That is what a broken track
  looks like.
- *The speed ladder.* The follower retries at 0.7 and 0.45 of its speeds. A
  follower told the car has ten times the grip stalls at full speed, leaves
  the road at 0.6 and finishes at 0.3, on a track whose structure checks
  pass. Failing fast and finishing slow is a weak driver.
- *Nothing the generator lays needs speed.* There are no jumps, and the one
  candidate, the steep ramp (rise 10 in 20), is climbed at the bottom of the
  ladder. So for these piece types, a track that passes the structure checks
  and is still not finished at any speed would point at the follower or at a
  piece I have mis-described, and is worth looking at by hand. It has not
  happened yet. This argument ends the day jumps go in: then a track can need
  a minimum speed, and the test will need a driver that can supply it.

**A second opinion.** `compare_g21.mjs` gives idea g2-1's route finder
nothing but the track string. On three tracks it found a route to the finish
with no jumps, of length 610 / 604 / 615 against this folder's 612 / 606 /
624, lying on average 0.5 to 0.75 units from it (worst 2.9, in the tightest
turns, where g2-1's path cuts the corner).

## 4. Output, and pointing training at it

`saveTrack(track, dir)` writes two files per track; `drive_folder.mjs` adds a
third.

`<name>.track.json`

| Field | Meaning |
| --- | --- |
| `trackData` | the save string: with `mountainVertices: new Float32Array(0)` and `mountainOffset: {x:0,y:0,z:0}` this is everything `loadTrack` returns. `loadGenerated(file).createCar` builds exactly that |
| `exportString` | "PolyTrack2..." for the game's editor import. Round-trips through polyrl's `exportToSaveString`; **not tried in the real game** |
| `parts` | `[{ typeId, x, y, z, rotation, rotationAxis, checkpointOrder, startOrder }]` in driving order, grid cells |
| `pieces` | the part names in the same order |
| `name, seed, difficulty, wantedLength, slopes, environment, baseLevel, length, checkpoints` | how it was made |

`<name>.route.json` (the centre line, for g2-1 or anything else)

| Field | Meaning |
| --- | --- |
| `spacing` | 1: units between consecutive points (same as `sim/line.mjs`) |
| `points` | `[[x, y, z], ...]` world units, from the car's start position to the far end of the finish piece. x, z are the measured middle of the road (midway between the kerbs, by ray cast on the track's mesh); y is the road surface (the car's origin rides 0.14 above it) |
| `halfWidth` | per point, units from the centre to the kerb face (5.65), or null at the few points where a gate post or a seam spoiled the measurement |
| `piece` | per point, index into the track's `parts` / `pieces` |
| `gates` | `[{ index, isFinish, center }]` in driving order: the route point at each checkpoint, then the finish |
| `start` | `{ position, quaternion }`, the spawn pose |
| `length` | units from the first point to the finish gate |
| `onRoad` | fraction of route points with road underneath; 1 on every track made so far |

`<name>.lap.json`: `{ track, frames, recording, source, speedScale }`, the
follower's finishing lap in the two fields the project's lap files use.

**Training on a folder of these, two ways.**

*With today's environment* (needs the changes listed below). `RacingEnv`
needs a track and a reference lap. The track is `createCar`; the reference
lap can be the follower's `<name>.lap.json` through the existing `refFile`
option, which takes any `{ frames, recording }`. Be aware of what that means:
the observation's "human line, speeds and keys" would be the follower's, at
about 110 km/h, straight down the middle, and the policy would be trained to
look like it. That teaches following a road; it does not teach speed.

*With a reference-free environment* (g2-1). Nothing needs a lap: g2-1's
`buildRoute(loadTrackInfo(createCar))` already works on these tracks, and
this folder's route is there as ground truth or as a cheaper substitute.

## What is not done or not tested

- **Jumps, wide roads, blocks and planes, intersections, banked turns, wall
  rides, loops.** The official tracks are mostly these (see section 1). A
  generalist trained only on these chains will have seen narrow kerbed roads
  and nothing else, so I would not expect this to close the gap to unseen
  official tracks by itself. Wide roads are the obvious next family: their
  ports are already in the table (two `StraightWide` side by side make a
  31-unit road), but a wide road is two parts per step and needs its own
  turns and narrowing pieces. Jumps need the minimum-speed question answered
  first.
- **No training run and no `RacingEnv` run on a generated track.** That needs
  the change to `loadTrack` below, which I may not make. What was run:
  `Env`, `loadTrackInfo`, the mesh and ray casts, the controller, record and
  replay, and g2-1's route finder.
- **The export string has not been loaded in the real game.**
- **Difficulty is not calibrated** against anything but the follower's pace.
- **The follower is slow** and takes no racing line; its lap is a poor
  reference for speed.
- **Tile occupancy comes from polyrl's `part_configs.json`** (the editor's
  cell lists), which I did not check against the triangles part by part; the
  no-overlap check uses the same lists. Check 5 (road under every route
  point) and the drives are the independent evidence that pieces do not sit
  inside one another.
- `checkpointEvery` (200 units) and the height range (1 to baseLevel + 4
  levels) are fixed choices, not tuned.

## Changes needed elsewhere

1. `sim/env.mjs` `loadTrack(name)`: accept a generated track, for example
   when `name` ends in `.track.json`, read the file and return
   `{ trackData, mountainVertices: new Float32Array(0), mountainOffset: { x: 0, y: 0, z: 0 } }`.
   `RacingEnv.create` (`rl/racing_env.mjs` line 503) and the pool children
   call `loadTrack(cfg.track)`, so this one change lets a path stand in for a
   track name.
2. `rl/racing_env.mjs` `save()` (line 1345) builds a file name from
   `cfg.track`; with a path as the track it needs the base name.
3. `rl/train_ppo.py` `--ref-file` is one file for every track. Training on a
   folder needs one reference per track: for a `.track.json` track, default
   `refFile` to the `.lap.json` beside it.
4. Worth adding to `CONTRACT.md`: the simulator has drivable ground at
   height 0 (also reported by g1-7), so "fell off the road" is not "fell out
   of the world", and a progress measure that only looks at distance along a
   line will keep counting for a car driving underneath it.

## Cost of a full run

- Generating: 0.21 s per track, no simulator. 500 tracks in under 2 minutes.
- Driving them for laps: 3.2 s of wall time per 600-unit track with training
  running (64 s for 20). 500 tracks is about 27 minutes on one simulator;
  `drive_folder.mjs --shard 0/2` and `--shard 1/2` in two terminals halve it.
- Disk: about 45 KB per track with its route and lap (868 KB for the 28 here).

## Changes made by the tester

An independent tester added `tests/` (run `node ideas/g2-2-track-generator/tests/run_tests.mjs`,
about 3.5 minutes) and made two fixes, written up in `tests/TESTING.md`:

- `generate.mjs` `buildRoute`: the kerb reading accepted for centring a route
  point is now at most 11.43 (was 12.63). The route used to zig-zag through
  every `TurnSharp` (steps turning by up to 99 degrees). The route files in
  `tracks/sample/` were rewritten; track strings and laps are unchanged.
- `drive.mjs`: an attempt also ends as "left the road" when the track's own
  surface has not been under the car for 3 units of travel. Before, a
  ground-level (`baseLevel: 0`) track with a piece missing was reported
  finished.

Numbers above that moved with them: the broken track in the control test is
left at 37% at all three speeds (was 41 / 40 / 39%); `compare_g21.mjs` prints
lengths 611 / 606 / 622 and a worst distance of 2.3 (was 612 / 606 / 624 and 2.9).
