# g2-2: random track generator

Lays random, valid PolyTrack tracks out of the game's own road pieces, so a
generalist can train on hundreds of tracks instead of 17. Every track comes
with its centre-line route (the generator knows where it put the road) and,
once driven by the scripted follower here, a finishing lap. A generated track
is a part list, so no geometry of Kodub's is stored in this folder.

**Where it stands (17 October):** the generator, the encoder and the
drivability test work, and the training environment opens generated tracks.

- Default tracks (narrow road, turns, ramps): 54 of 54 finished by the
  scripted follower (section 3).
- **Harder pieces, opt-in** (section 5): the whole track on the 31-unit wide
  road, 51-unit wide sections, banked turns, and jumps (drop and kicker,
  each with a measured speed window). 80 tracks, 16 per feature: 80 of 80
  pass the structure checks, 80 of 80 are finished by the follower, and on
  80 of 80 idea g2-1's route search reaches the finish (on all 26 tracks
  with jumps it found exactly as many flights as there are jumps). Loops and
  wall rides are not in.
- **Training and testing on generated tracks** (section 6): a .track.json
  path works wherever a track name does (RacingEnv in route mode,
  env_server, train_ppo.py, evaluate.py), simulators can rotate through
  more tracks than there are simulators, and a fixed set of 40 training + 10
  test tracks is made by `g2-2-make_set.sh` (50 of 50 kept, 53 s). Smoke
  runs only: no real training run yet.
- Default behaviour is unchanged: the same seeds give the same 28 saved
  tracks and routes, `g2-1-default_mode_check.mjs` gives the same trace,
  `npm test` passes.

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

# harder pieces (section 5)
node ideas/g2-2-track-generator/generate.mjs --count 5 --seed 1 --length 800 --jumps 3 --banked 1 --wide-sections 2 --out <folder>
node ideas/g2-2-track-generator/generate.mjs --count 5 --seed 1 --length 800 --wide --out <folder>
node ideas/g2-2-track-generator/g2-2-feature_check.mjs --count 16 --shard 0/3   # simulator; with 1/3 and 2/3 alongside: 80 tracks in about 4 minutes
node ideas/g2-2-track-generator/g2-2-jump_probe.mjs                             # simulator, 45 s: take-off speed against landing, gravity

# the training set and the training (section 6)
sh ideas/g2-2-track-generator/g2-2-make_set.sh                                  # 3 simulators, about 1 minute
sh ideas/g2-2-track-generator/g2-2-train_route_on_generated.sh                  # 16 simulators, 4 stretches of about 2 h
sh ideas/g2-2-track-generator/g2-2-eval_route_on_generated.sh rl/checkpoints/ppo_g2-2-route-gen.after_<steps>.pt
```

`generate.mjs` options: `--count`, `--seed` (track k uses seed + k),
`--length` (units of centre line, about metres), `--difficulty` (0 to 1, or
`mixed` to spread the tracks from 0 to 1), `--flat` (no slopes), `--out`;
and the features of section 5: `--wide`, `--wide-sections w`, `--banked w`,
`--jumps w` (`features` in code).
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
| `g2-2-features.mjs` | The harder pieces: wide-road composites, banked pieces, jump gaps and their speed windows (section 5) |
| `g2-2-probe_pairs.mjs`, `g2-2-probe_triples.mjs` | The search for which placements of 2 or 3 parts make one piece of road |
| `g2-2-jump_probe.mjs` | Flights measured on straight test tracks: take-off speed against landing, gravity |
| `g2-2-feature_check.mjs` | Per feature: generate, structure checks, the follower, g2-1's route, and a control |
| `g2-2-make_set.mjs`, `g2-2-make_set.sh` | The fixed training and test set (section 6) |
| `g2-2-train_route_on_generated.sh` | Continues ppo_g2-1-route on the official tracks plus the generated set |
| `g2-2-eval_route_on_generated.sh` | Ten attempts + greedy on the 10 generated test tracks and the 3 held-out official tracks |
| `sets/` | Made by g2-2-make_set.sh; git-ignored (routes measured on Kodub's geometry, laps driven on it) |

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

## 5. Harder pieces (17 October)

All opt-in through `features` (generate.mjs FEATURES; pieces and
measurements in `g2-2-features.mjs`). With no features the generator is
unchanged: the 28 saved tracks (`tracks/sample`, `tracks/smoke`) are
regenerated from their options with the same track strings and the same
routes.

**How pieces of several parts were found.** A wide road is several parts
side by side (a `StraightWide` is half a road, kerb on one side, open on the
other). `g2-2-probe_pairs.mjs` and `g2-2-probe_triples.mjs` try every offset
within 12 cells and every rotation of one part against another and keep
placements whose ports mate and that leave exactly two openings. Their
finds, written out as "composites" in `g2-2-features.mjs`:

| Feature | Pieces | Width |
| --- | --- | --- |
| `wide` (whole track) | StraightWide pair, short and long wide turns (radius 40 and 60), five wide ramps; StartWide, CheckpointWide, FinishWide | 31.13 |
| `wideSections` | ToWideMiddle with an OuterCornerWide each side (narrow to wide), Plane between two StraightWides | 51.13 |
| `banked` | ToTiltedLeft / ToTiltedRight (lean in or out over 60 units, 24 degrees), StraightTilted, the four tilted turns (radius 30 to 90) | 11.13 along the lean |
| `jumps` | a gap of 2 to 6 cells: off a flat edge onto road 1 or 2 levels lower, or off a SlopeUp/SlopeUpLong ("kicker") to its height or 1 lower; 3 straights to land on (6 after a kicker) | 11.13 |

There is no piece between the standard road and the 31-unit road (the
ToWideLeft + ToWideRight pair splits a 31 road into two narrow roads), so a
`wide` track is wide from start to finish. No turn or checkpoint exists at
51 units, so a section is a straight of 1 to 4 pieces. The chain matches
widths and leans by requiring the entry's two corner points to land on the
previous exit's (`place()`); pieces.mjs missed one end of StraightTilted and
of the tilted turns (small end caps of the raised edge lines read as a kerb
across the opening) and `loadFeatureTable()` re-derives those
(`derivePorts(..., { openCaps: true })`; `loadPieceTable()` is unchanged).

**Jumps need a speed window.** `g2-2-jump_probe.mjs` drives straight test
tracks at fixed speeds (sim/controller.mjs, with and without S in the air):

| Jump | Slowest that finished | Fastest tried that did not | Overshoot past the gap |
| --- | --- | --- | --- |
| drop 1 level, gap 4 cells | 90 km/h | 70 | 25 units at 228 km/h |
| drop 2 levels, gap 6 | 110 | 90 | 34 units at 228 |
| drop 2 levels, gap 8 | 130 | 110 | 24 units at 228 |
| kicker, gap 4, to its height | 70 | 50 | 100 units at 190; over the 120-unit landing at 220 |
| kicker, gap 8, to its height | 110 | 90 | 80 units at 190 |
| kicker, gap 8, 1 level lower | 90 | 70 | 88 units at 190 |

Gravity from 70 flights: 14.09 units/s^2 (median). S in the air made 1 to 3
units of difference. From a standstill the car reaches 134 km/h in 40 units
and 203 in 100 (W held). Each gap gets minKmh = 1.1 x the drag-free speed
that carries it plus 2 units (99 km/h for drop 1 / gap 4, 104 for drop 2 /
gap 6, 78 for the kicker over 4 cells: each between the measured pass and
fail), maxKmh from 70% of the landing, and a target of about 1.25 x the
minimum. Gaps whose minimum is over 140 km/h are left out (19 remain). A
jump is only laid after 60 units of straight run-up.

**The follower on jumps** (drive.mjs): over the 40 units before a take-off
it holds the jump's target speed, whatever its speed scale; corner and crest
limits are off over the gap and the 15 units before it; it holds S in the
air; and the off-road rules wait while no wheel is down, then apply again,
so a car that comes down on the ground below is caught. The route crosses a
gap on the parabola at the target speed, and `route.air` / `route.jumps`
mark it.

**Results** (`g2-2-feature_check.mjs --count 16`, 3 shards, about 4 minutes;
16 tracks per feature that contain it, 609 to 1249 units, difficulty 0 to 1):

| Feature | Tracks | Structure ok | Follower finished | g2-1 route ok | Contains |
| --- | --- | --- | --- | --- | --- |
| wide | 16 | 16 | 16 | 16 | 333 wide pieces |
| wideSections | 16 | 16 | 16 | 16 | 30 sections |
| banked | 16 | 16 | 16 | 16 | 43 banked turns |
| jumps | 16 | 16 | 16 | 16 | 25 jumps (11 kickers) |
| mixed | 16 | 16 | 16 | 16 | 14 sections, 25 banked turns, 16 jumps (7 kickers) |

All 80 finished at the first speed of the ladder. On all 26 tracks with
jumps, g2-1's search (which knows nothing of this generator) found exactly
as many flights as there are jumps. **Control:** the same 26 tracks driven
with every jump's target at half its minimum: 24 were not finished (the car
came down off the road). The two that still finished each have one 2-cell
gap (minimum 54 and 43 km/h), where the follower did not get down to half
of that in 40 units, or the margin on short gaps is wide; the check is
therefore shown to fail on jumps of 3 cells and more, not on the shortest.

How often: on 30 tracks of 800 units per setting, jumps 1 / 3 gave 9 / 25
jumps; banked 1 / 2 gave 49 / 93 banked turns; wideSections 1 / 3 gave 22 /
53 sections.

**Loops and wall rides are not in.** Their parts (WallTrack*, parts stood on
their side) have no ports pieces.mjs can find (it reads openings on vertical
grid planes of an upright part), the follower steers in the horizontal plane
only, and g2-1's route search prefers a flat turn-round to a banked wall (g2-1
README). None of the three checks that make a generated track trustworthy
would work on them, so they were not tried.

## 6. Training and testing on generated tracks

**Opening a generated track.** A path ending in `.track.json` (from the
project root, or absolute) now works where a track name does:

| Where | What changed |
| --- | --- |
| `sim/env.mjs` | `loadTrack(path)` reads the file; `isTrackFile`, `trackLabel` (base name), `trackFilePath` |
| `ideas/shared/track_info.mjs` | `loadTrackInfo(path)`; `name` is the base name (a path longer than 40 characters used to be taken for a save string) |
| `rl/racing_env.mjs` | route mode: no human lap, every episode starts on the start line (own-state restarts still work), `refLaps` set to 0; human mode: the follower's `.lap.json` beside the track is the reference; `save()` names the file after the base name (GENERATED TRACKS at the top of the file) |
| `rl/env_server.mjs` | TRACK ROTATION (opt-in): `trackSet=a,b,c switchEvery=N`: one server drives several tracks in turn, switching every N episodes; each episode's info then has `track` |
| `rl/polytrack_env.py` | `expand_tracks` (names, .track.json files, folders, .txt lists), `track_label`, `PolytrackVecEnv(track_sets=..., switch_every=...)` |
| `rl/train_ppo.py` | `--track` items may be files, folders or a .txt list; `--rotate-every N`: with more tracks than `--envs`, environment k drives tracks k, k + envs, ... in turn; per-track counts by base name; a warning when tracks would go unused |
| `rl/evaluate.py` | `--track <file>.track.json`; default checkpoint and run file by base name |

Switching a server to another track costs 0.4 to 0.5 s onto a 600-unit
generated track and 1.5 to 2.4 s onto desert4 (which also replays the human
lap to build the ladder of part-way starts), measured with the route cached.
Routes for generated tracks are built and cached by g2-1's route_store.mjs
under the track's base name and hash, so `g2-2-make_set.sh` builds them once
and training reads them in milliseconds (a RacingEnv on a set track was
ready in 273 ms).

**The set** (`g2-2-make_set.sh`, `sets/g2-2-set1/`): 40 training tracks
(seeds 20000 + k: 10 plain, 5 wide, 5 wideSections, 5 banked, 5 jumps, 10
mixed) and 10 test tracks (seeds 30000 + k: 2 plain and 2 of each feature
but wide and wideSections, which have 1), difficulty 0 to 1, 600 to 1200
units. Every kept track passed the structure checks, the follower and g2-1's
route; a track of a feature kind must contain it. 50 of 50 kept in 53 s with
3 simulators; the 9 replacements were all seeds whose track lacked its
feature, none failed a check. The 40 training tracks hold 25 wide sections,
32 banked turns and 21 jumps (11 kickers), plus the 5 wide tracks.

**Training** (`g2-2-train_route_on_generated.sh`): continues
`ppo_g2-1-route.pt` (copied to `ppo_g2-2-route-gen.pt` only if that is
absent) with the settings of g2-1's training script, on 13 official tracks
plus the 40 generated ones, 16 simulators rotating every 25 episodes, in
stretches of 12M block decisions with the learning rate fading to 0 in each,
restartable. The 13 are the 14 training tracks without summer4, whose route
is wrong (g2-1 README); ppo_g2-1-route did not practise there either.
`OFFICIAL=...` changes the list.

**Testing** (`g2-2-eval_route_on_generated.sh <checkpoint>`): seeds 10 to 19
and one greedy attempt on each of the 10 generated test tracks and desert3,
summer3, winter4 (143 attempts). Run it on `ppo_g2-1-route.pt` too: that
comparison says whether the generated tracks helped.

**Smoke runs** (all with at most 3 simulators):
- RacingEnv in route mode on a set track with 6 jumps: 334 inputs, time limit
  37.5 s, every start on the start line or an own state; the same track in
  human mode with the follower's lap as reference: 352 inputs.
- `train_ppo.py --reference route` from a copy of `ppo_g2-1-route.pt`,
  desert4 and 4 generated tracks (jumps, wide, banked, wide sections) on 3
  simulators with `--rotate-every 2`: 4 updates with the imitation term,
  then 50 updates (38 400 decisions, 86 s, 440 decisions/s). The per-track
  line after update 50: desert4 13/19, the jump track 2/22, the wide track
  0/30, the banked track 1/18, the wide-section track 4/22 (finished /
  episodes, part-way and own-state starts included).
- `evaluate.py` with `ppo_g2-1-route.pt` on two test tracks: both ran and
  saved their attempts; neither finished (greedy on the plain one went over
  a hill before the finish at 266 km/h and flew over the finish line, 7
  units above it; sampled on the jump track ended 'off line' at 89%).

## What is not done or not tested

- **No training run** beyond the smoke runs above, so whether generated
  tracks help on the held-out official tracks is not known.
- **Blocks and planes, intersections, wall rides, loops**: not generated
  (section 5 for loops and wall rides). The official tracks are mostly blocks
  and planes (section 1).
- Jumps are on the standard road only; banked turns too; the wide track has
  no jumps or banks. Kicker landings are flat road, not a down-ramp.
- The jump windows are drag-free formulas checked at the six measured
  points above, not measured per gap. The control does not fail on the
  2-cell gaps.
- Generated tracks have no lap that places the car part-way round in route
  mode, so they are practised from the start line (and own-state restarts)
  only. The follower's lap could be used for that (`refFile` works); it
  was not, because it drives at about 110 km/h down the middle.
- The export strings of feature tracks were not loaded in the real game.
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

Items 1 to 3 are done (17 October, section 6); for 3, in the human mode a
generated track's reference is the `.lap.json` beside it, and route mode
needs none.

1. Done: `sim/env.mjs` `loadTrack` accepts a `.track.json` path.
2. Done: `rl/racing_env.mjs` `save()` uses the base name.
3. Done: one reference per track (above).
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
