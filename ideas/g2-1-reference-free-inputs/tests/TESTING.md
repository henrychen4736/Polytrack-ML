# g2-1 tests

Written by an independent tester, not by the author of the code. This folder
was tested last, after its README appeared complete (files unchanged for half
an hour). **No file of the author's was changed**; only `tests/` was added.

```
node ideas/g2-1-reference-free-inputs/tests/run_tests.mjs              # everything, about 95 s
node ideas/g2-1-reference-free-inputs/tests/run_tests.mjs observation  # only the files whose name contains "observation"
node ideas/g2-1-reference-free-inputs/tests/test_3_under_road_sim.mjs  # one file on its own
```

One line per check, starting `PASS`, `FAIL` or `KNOWN FAIL`; a final count;
exit code 0 only if every check passes. Test files run one after another, so
there is never more than one simulator of ours.

**Last run: 156 passed, 0 failed, 1 known failure; exit code 1.** The known
failure is defect 1 below.

The tests read the routes in `cache/` (as every user of `routeFor` does).
`test_4` rebuilds two of them from the track and requires the result to be the
cached one; rebuilding all 17 takes 2.6 minutes and is not done. If `cache/`
is empty the first run builds all routes and takes about 3 minutes longer.

## What is covered

| File | Simulator | What it checks |
| --- | --- | --- |
| `test_1_route_vs_human_sim.mjs` | 1 | All 17 official tracks. The fastest human lap is replayed here (not read from the author's trace cache). The route, by our own geometry: one point per unit from the spawn point; forward / up / left unit vectors square to each other; a surface under every point flagged on-road; one gate point per stage inside that gate's detector box, in rising order, the finish last; as many stages as the track has checkpoint orders. The lap over the route: distance from the route by the tracker and by a brute-force nearest point over the whole route; progress by the author's tracker and by our own forward-only search that knows nothing about gates; progress exactly the route's length on the finish tick; the road-under-the-car test on the human's samples. Each of the README's 17 table rows is then compared with these measurements, and the summary claims with both progress measures. |
| `test_2_observation_sim.mjs` | 1 | Size 334; every block start against the header and the README's table (which must tile 0 to 333). Then 435 observations along the human lap on desert4 (SimSession, no reference lap): every documented block recomputed with our own quaternion code, the route's arrays and ray casts, and compared number for number: speed, velocity, world up, rotation rate, wheels, steering, held keys, nearest point, lap fraction (off and on), the 20 points ahead and their gap rule, curvature, room at the car and ahead, contact and pedal flags, the route frame, slope, on-road flags, flight entries, gate distance, height, rays. What the blocks mean: "forward" velocity against the speedometer, "up" on a level car, unit directions ahead. The route's own arrays: `left` = up x forward, curvature sign and size from the points, slope from the points. |
| `test_3_under_road_sim.mjs` | 1 | A g2-2 generated track (road 10 units up, centre line known): g2-1's route lies on it (mean 0.65 units from the centre line, worst 1.23) and its room numbers add up to the road's width (11.25). A car that stays on the road: progress never drops, ends at the route's length, road always under it. A car that falls through a hole and drives on **on the ground under the road** (2575 samples): what the tracker and the observation say. |
| `test_4_scripts_sim.mjs` | 1 at a time | `validate.mjs` (exit code, summary, all 17 rows against the README), `smoke_test.mjs desert4` (exit code and its printed results), fresh `buildRoute` on summer1 and winter4 against the cache, building twice, `gateStages`, and that the five lap-free modules import nothing that reads a lap. |

## What is not covered, and why

- **Whether a car can drive the route**, and whether a policy can learn from the observation. The README says neither was tried; nothing here tries it either.
- Fresh builds of the other 15 routes (2.6 minutes). The cached ones are what was tested.
- `plot_dump.mjs` and `plot_route.py`: development aids; the Python one needs matplotlib, which `.venv` does not have. There is no other Python in the folder, so the suite has no Python tests.
- `smoke_test.mjs winter2` (the README ran it; 13 s more).
- The route with `gateHints` (the `*` rows of `validate.mjs`): the README's table is the plain rows.
- `surface.mjs` on its own. It is exercised through `buildRoute` (two fresh builds and one generated track).
- Community tracks: none in the repository.

## Defects

### Not fixed

1. **Progress keeps counting for a car on the ground underneath a raised road.** `progress.mjs`: `nearest` (line 70) picks the nearest route point in 3D with no limit on the distance, and `describe` (line 87) turns the index into progress without looking at `overRoad` or `height`. Measured in `test_3`: a car that fell off the road at the first piece and drove along under it, 10 units down, was credited **218 units of progress** (to 250 of 457) while never being on the road. What stopped it was the gate fence: the game had counted no checkpoint, so the index could not pass the first gate's point. So the measure is bounded (a car cannot finish or pass a gate this way) but between two gates it is fooled, and a reward of "progress gained" would pay for driving on the grass. The tracker does report the truth beside it: on all 2575 samples `at.overRoad` is false, `at.height` is -10.2 and `at.offRoute` is 9.7 or more, and observation entry 316 reads -1.02. The README's proposed episode end (`at.grounded && !at.overRoad`) would catch it, but that is a rule the environment has to add, not something `progress` does. Not fixed: whether progress should freeze, or the episode should end, when there is no road under the car is the author's design decision, and the same choice decides what happens in flight.

### Observations that are not defects

- **The route floats off curved surfaces.** The README says the path is "lifted to the car's ride height (0.15)". On flat road it is. On loops, banked walls and ramps the smoothed route is 0.5 to 1.1 units off the surface: more than 0.35 from ride height at 161 of 951 on-road points on summer2, 274 of 2090 on summer7, 107 of 1645 on desert1, 6 of 1985 on desert4. Entry 316 (height / 10) and `at.height` carry that error, up to 0.1 in the observation.
- **desert5 has 5 on-road points (of 2653) with no surface within 2 units under them**: the on-road flag is wrong at a handful of points on the track whose route the README already calls doubtful.
- **Route points are not exactly 1 unit apart**: 0.79 to 1.00 on desert2, 0.86 on winter3, 1.00 on most. `progress` counts points, so "units" are up to a few percent short there.
- **Distance from the route depends on who measures it** on the two bad tracks: the tracker's median on summer4 is 41.3 units, a memoryless nearest point over the whole route gives 19.8 (desert5: 9.4 against 6.5). On the other 15 the two agree. The tracker's figure is the honest one for "how far from where progress thinks the car is".
- On tracks with a choice of gate the table's `*` rows use the human lap's choice as a hint. The README's table and the "15 of 17" use the plain rows, which need no lap; checked.

## The README's claims

| Claim | Result |
| --- | --- |
| The search reaches the finish through every gate on 17 of 17 tracks | **Confirmed**, and by our own geometry each gate point is at its gate's detector box, in order |
| On 15 of 17, progress keeps step with the human lap (drop at most 1 unit, stall at most 0.4 s, ends at the route's length) | **Confirmed** with the author's tracker (worst of the 15: drop 0.39, stall 0.40 s) and with our own gate-free forward search (worst: 1 point back, 0.37 s) |
| summer4 and desert5 lose step (stalls of 11.5 s and 2.5 s) | **Confirmed**; our own search loses them too (desert5: 143 points back, reaches 56%) |
| The validation table, all 17 rows | **Confirmed** against our own replay and loops: gates, both lengths, distance median / 95% / max, off pace, above route, drop, stall |
| Progress equals the route's length on the tick the game reports the finish | **Confirmed** on all 17 tracks |
| "Is there road under the car" is false on under 0.5% of the human's wheels-down samples | **Confirmed**: 0 on every track |
| "11 of the 15 on the same roads as the human", and the per-track notes | Not checked: read off pictures |
| The observation is 334 numbers with the documented layout and scaling | **Confirmed**, block by block, on 435 observations |
| The "as now" entries equal RacingEnv's (largest difference 0 over 178 decisions) | **Confirmed** by the author's smoke test, and recomputed independently here |
| Observations along the human lap are finite and within ±3; 0.5 to 0.7 ms each | **Confirmed** (0.56 ms) |
| A car holding only W on desert4 has no road under it from 3050 ms | **Confirmed** (author's smoke test) |
| The route is built from the track alone | **Confirmed**: the five modules import nothing that reads a lap; fresh builds of two tracks give the cached routes; a generated track nobody drove gets a correct route |
| Routes are deterministic and the cache is current | **Confirmed** for summer1 and winter4 (to 0.0001 units); the other 15 not rebuilt |
| The route is "lifted to the car's ride height (0.15)" | True on flat road, **not on curved surfaces** (see observations) |
| Progress as "the ruler" for a lap-free environment | Holds for order and for a car on the road. **Fooled between gates by a car under a raised road** (defect 1) |
