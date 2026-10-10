# g2-2 tests

Written by an independent tester, not by the author of the code.

```
node ideas/g2-2-track-generator/tests/run_tests.mjs            # everything, about 3.5 minutes
node ideas/g2-2-track-generator/tests/run_tests.mjs codec      # only the files whose name contains "codec"
node ideas/g2-2-track-generator/tests/test_4_sim.mjs           # one file on its own
```

One line per check, starting `PASS`, `FAIL` or `KNOWN FAIL`; a final count;
exit code 0 only if every check passes. Test files run one after another, so
there is never more than one simulator of ours.

**Last run: 144 passed, 0 failed, 0 known failures; exit code 0**, after the
two fixes below. Before them, 4 checks failed.

## What is covered

The tests judge a track from its **track string**, read back with
`sim/track.mjs`, using the game's collision triangles and ray casts
(`tests/_geometry.mjs`). They do not use the generator's own bookkeeping (its
list of placed pieces, its cell columns, its `onRoad` number) except where a
check is about that number.

| File | Simulator | What it checks |
| --- | --- | --- |
| `test_1_pieces.mjs` | no | `derivePorts` on hand-made meshes (slab, road with walls, ramp, narrow strip, off-grid end, joined patches, ceiling, low and high lips). `worldPorts` and `worldTiles` by hand for all four rotations. Cell lists against the collision shapes of all 16 generator pieces in 4 rotations. The README's 16-row table, turn radii, S-bend and ramp sizes. The official tracks: the README's port count repeated with the author's code, recounted with our own port transform and pairing, and checked a third way with ray casts (does road surface continue beyond a port the table calls mated?). |
| `test_2_codec.mjs` | no | `partsToBytes` against 62 bytes worked out by hand; round trips through `sim/track.mjs` and through `vendor/polyrl/node/track_codec.mjs` (`decodeBits` + inflate, twice; `parseExportString`; `exportToSaveString`); all 17 official tracks (35 540 parts, 129 part types, 5 rotation axes) decoded, re-encoded and decoded again. |
| `test_3_generator.mjs` | no | Same seed, same track; 12 seeds, 12 tracks; options. Eight fresh tracks (300 to 2500 units, difficulty 0 to 1, one flat, one with a road crossing over another) and one saved sample track, each: one start, one finish, checkpoints numbered in road order; **no two pieces' collision shapes share space** (1-unit voxels of the triangles, our own test, which is itself tested on deliberately overlapping pieces); route points 1 unit apart with no jumps or kinks; every point on the road surface to 0.05 units; midway between the kerbs; through every gate's detector box in order; headroom; start pose. Save / load, the command line, and the 20 sample tracks regenerated from their recorded options. |
| `test_4_sim.mjs` | 1 | On three fresh tracks: the car rests on the road at the start; the follower finishes; its keys replay to the same tick; the game's Verify accepts the lap and rejects it one tick early; the checkpoint counter rises one at a time; the track's own surface is under the car on every sampled tick. All 20 saved sample laps replayed and watched the same way. The two control cases. The grass (below). |
| `test_5_scripts.mjs` | 1 at a time | `check_pieces.mjs` (and `--table`), `bulk_check.mjs --count 40`, `smoke_test.mjs`, `control_test.mjs`, `generate.mjs` + `drive_folder.mjs` (with `--shard`, and the skip on a second run) on a temporary folder, `compare_g21.mjs`. |

### The grass

The world has drivable ground at y = 0, and the author reports that an early
test "finished" a broken track by driving on it. Four checks in
`test_4_sim.mjs` are about that:

- On raised tracks (the default) the bottom of every checkpoint and finish box is at least 5.3 units above the ground (22 gates on five tracks), out of reach of a car on the ground.
- A follower with **no** off-road rule drives a raised track with a piece missing: it falls into the hole, drives on underneath along the route to within 0.4 units (in plan) of the finish, and is given neither the finish nor a checkpoint.
- The same on a **ground-level** track (`baseLevel: 0`): the unguarded follower **does** finish, with the checkpoint counted. So the trap is real, and `watchLap` in `tests/_geometry.mjs` (is the track's own surface under the car?) flags that lap: 416 watched states with no road beneath.
- `driveTrack` must not report that broken ground-level track as finished. Before fix 2 it did, at full speed.

`watchLap` is the general answer for any other idea that needs it: the mesh
from `loadTrackInfo(...).mesh` holds only the track's parts, never the ground
plane, so a ray straight down from the car tells road from grass.

## What is not covered, and why

- The export string in the real game (the README says the same; no game client here).
- `bulk_check.mjs --count 300` (70 s). 40 tracks are run; the README's "93 of 300 have a crossing" is 14 of 40 here.
- The README's runs of 12, 10 and 4 tracks. The smoke test's 8 are rerun, 3 more are driven in `test_4`, 3 in `test_5`, and the 20 saved laps are replayed, not re-driven.
- Banking, wide roads, jumps: the generator does not lay them.
- Whether the tracks are any use for training. Nothing was trained.
- The cell lists (`part_configs.json`) are checked against the triangles only for the 16 generator pieces, and against the official tracks only for road parts (see the note under defects).

## Defects

### Fixed

1. **The route zig-zagged through every `TurnSharp`, and slightly at every S-bend.** `generate.mjs` `buildRoute`, line 376 (was `width > ROAD_WIDTH + 1.5`). The route is corrected to "midway between the kerbs" from two sideways rays, accepted if they add up to 10.83 to 12.63. `TurnSharp` (radius 10, in tracks of difficulty 0.6 and up) has no kerb on its inside, so near its ends the inward ray ran on to the next piece's kerb, read 11.7 to 12.6, and the point was pulled up to 0.7 units inwards, next to points left alone. Result: consecutive route steps turning by up to **99 degrees**, and steps of 0.52 units in a route documented as 1 unit apart (gen_s301_d70_l2500: 13 such kinks at three `TurnSharp` pieces). Measured over 7067 route points on six tracks: every true reading is 11.3, every false one 11.7 or more. Fix: accept up to 11.43. After it the worst kink is 16 degrees (inside a radius-10 turn, which turns 5.7 degrees per unit anyway) and steps are 0.979 to 1.001. S-bend kinks went from 7 to 1.6 degrees.
   - Side effects: routes through a `TurnSharp` are 2 to 5 points shorter; all other routes move by at most 0.08 units. The 20 route files in `tracks/sample/` were rewritten from the fixed generator (17 changed; 3 of them have a `TurnSharp`, and for 4 the `length` field in the track file changed by 1 to 5). The track strings and the saved laps are unchanged and all 20 laps still replay to their recorded tick.
   - README numbers that moved: `compare_g21.mjs` now prints this folder's lengths as 611 / 606 / 622 (README: 612 / 606 / 624) and the worst distance between the two routes as 2.3 (README: 2.9).
2. **`driveTrack` reported a ground-level track with a 65-unit piece missing as finished, at full speed.** `drive.mjs` `attempt`, lines 110 to 125, `OFF_SURFACE` line 81. Its only off-road rule was "more than 5 units from the route", and on a road at `baseLevel: 0` the grass is 0.21 below the road, so the car crossed the hole 1.6 units from the route and took the finish. The README says ground-level results "do not count" and makes the raised road the default, but `baseLevel: 0` is an offered option and nothing stopped the false result. Fix: each decision, a ray down from the car into the track's own mesh; no surface within 4 units for 3 units of travel ends the attempt as "left the road". The intact ground-level track is still finished, and every intact track driven in the suite (6 in `test_4`, 3 by `drive_folder.mjs`, the smoke test's 8) still finishes.
   - README number that moved: the broken raised track is now left at 37% at all three speeds (README: 41%, 40%, 39%), because the hole is noticed 3 units in, not 5 units down.

### Not fixed

None.

### Observations that are not defects

- **Cell lists are not exclusive on the official tracks.** A first version of the cell test assumed the game never lets two parts share a cell. It does: on the 17 official tracks parts share cells 7966 times, always with a block, plane, pillar, wall or sign involved (roads lie on blocks). No two ROAD parts share a cell (1111 road parts, 827 of them turned), which is the test that stands. The generator's one-piece-per-cell rule is stricter than the game needs, not wrong.
- **57 of 128 ports the table leaves open on the official tracks do have road surface beyond them** (mates the mating rule misses), and 35 of 2863 mated ports have no surface found 0.6 units beyond. Overall "mated" and "surface continues" agree for 96.9% of road ports. The README's 95% is a count of the rule, which is right; this says how good the rule is.
- The smoke test's worst distance from the centre line is now 2.2 units (README: 1.9 on other runs).
- The over-confident follower in `control_test.mjs` case B now leaves the road at full speed (46%); the README says it stalls. Either way it fails at full speed and finishes at 0.3.
- Route points are rounded to 0.001 and the surface of a gate piece is 0.024 lower than a plain straight, so a flat track's route height is not constant to better than that.

## The README's claims

| Claim | Result |
| --- | --- |
| 2863 of 3005 road ports on the official tracks mate (95%) | **Confirmed**: by the author's code, by our own recount (2863 of 3005, 95.3%), and 98.8% of those have road surface continuing beyond the port by ray cast |
| 4 of 17 official tracks connect start to finish through mated ports (summer5, summer6, desert2, desert4); 8 tracks have parts on their side | **Confirmed** |
| The 16-row piece table; turn radii 10 / 30 / 50 / 70 / 90; S-bends 20 sideways over 60; ramps 5 or 10 | **Confirmed** against the triangles |
| No-port part types and their counts; 74 road part types in `--table` | **Confirmed** |
| The encoder works | **Confirmed**: hand-worked bytes, both decoders, export string, all 17 official tracks part for part |
| Same seed, same track; different seeds differ | **Confirmed** |
| No two pieces share space; crossings are 2 or more levels apart | **Confirmed** by a test that does not use the cell lists (0 overlapping pairs on 9 tracks, 54 pieces on the largest); lowest thing over the road is a gate's bar at 3.9 |
| Every route point has road underneath; the route is the measured middle of the road; points 1 unit apart | Road underneath: **confirmed** (height error under 0.012). Middle and spacing: **wrong at `TurnSharp` before fix 1**, confirmed after it |
| Start, checkpoints in order, finish | **Confirmed** from the decoded track and from the game's own checkpoint counter in replays |
| The car at the start rests on the road | **Confirmed**: four wheels, origin 0.136 above the road surface, y = 10.35, no movement |
| The follower's saved lap replays to the same tick | **Confirmed** for 3 fresh laps and all 20 saved ones; the game's Verify accepts the fresh ones |
| 54 of 54 tracks finished at the first speed tried | 9 fresh tracks driven here plus the smoke test's 8, all finished (the 6 in `test_4` and the smoke test's 8 checked to be at the first speed); the 20 sample laps replayed. The exact 54 not re-driven |
| A track with a piece removed fails at every speed | **Confirmed** |
| A follower told the car has ten times the grip fails at full speed and finishes slowed | **Confirmed** |
| The steep ramp is climbed at the slowest speed | **Confirmed** (`control_test.mjs` C) |
| "On a raised road a car that leaves falls and cannot rejoin, so finishing means having stayed on the road" | **Confirmed** by driving under the finish and by the gate boxes' heights |
| Ground-level drives "do not count" | True, and stronger than stated: `driveTrack` actively reported a broken ground-level track as finished (**defect 2, fixed**) |
| `compare_g21.mjs`: g2-1 finds the route with no jumps, 0.5 to 0.75 units from this one | **Confirmed** (means 0.57 / 0.49 / 0.72; lengths and worst case moved slightly with fix 1) |
| Follower averages about 110 km/h | **Confirmed** (97 to 114 km/h on three tracks) |
| `bulk_check.mjs`: 300 of 300, 0.21 s per track | 40 of 40 here; the 300 not run |
| Export string loads in the game | Not checked (not checkable here) |
