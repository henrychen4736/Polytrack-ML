# g2-1: inputs that need no human lap

The agent's 352 inputs today include the human lap's line, speeds, orientation and keys, so it cannot run on a track that has no human lap. This folder builds a **route** from the track's geometry alone (start, checkpoints in order, finish), a **progress measure** along it, and a 334-number **observation** on top of it that uses no lap at all.

Nothing here drives a car along the route or trains a policy on the observation. What was checked is how the route compares with the fastest human lap on each of the 17 official tracks, and that the observation can be built from a live car state.

## Result in short

- The search reaches the finish through every gate on **17 of 17** official tracks.
- On **15 of 17**, route progress keeps step with the fastest human lap for the whole lap: it never drops by more than 1 unit, never stalls for more than 0.4 s, and ends at the route's length when the lap finishes.
- On **11** of those 15 the route is on the same roads as the human throughout. On the other 4 the human leaves the route's surface for a banked wall, a loop or a mirror-image ramp, and the route goes round on the flat or by the twin ramp.
- On **summer4 and desert5** the route goes a way the human does not. On summer4 it is almost certainly a way no fast car can take. Details are in the table notes below.

## How to run

All from the project root.

```
node ideas/g2-1-reference-free-inputs/validate.mjs                 # the table for all 17 tracks
node ideas/g2-1-reference-free-inputs/validate.mjs desert4         # one track, with per-second detail
node ideas/g2-1-reference-free-inputs/validate.mjs --fresh winter1 winter4   # rebuild instead of using the cache
node ideas/g2-1-reference-free-inputs/smoke_test.mjs [track]       # route + progress + observation on the simulator (default desert4)
node ideas/g2-1-reference-free-inputs/plot_dump.mjs desert4        # then: python ideas/g2-1-reference-free-inputs/plot_route.py desert4
```

`validate.mjs` replays each track's fastest human lap once in one simulator (about 1 s per track) and keeps the trace in `cache/`; after that it starts no simulator. Routes are cached in `cache/` too, so the whole table takes 15 s. With `--fresh` on all 17 tracks it took 3.5 minutes on the machine while training was running, which is over the brief's limit for one run; rebuild a few tracks at a time. `plot_route.py` needs matplotlib (the system Python has it, `.venv` does not).

Using it from code:

```js
import { loadTrackInfo } from '../shared/track_info.mjs';
import { routeFor } from './route_store.mjs';
import { createObserver } from './observation.mjs';

const info = loadTrackInfo('desert4');           // or a save string / CreateCar inputs
const route = routeFor(info);                    // 2 to 15 s the first time, 15 ms after
const observer = createObserver(info, route);
observer.reset();
const { obs, at } = observer.observe({ state, older, held, contact, pedalOpen });
// obs: 334 numbers.  at: { progress, fraction, index, offRoute, lateral, height, edgeLeft, edgeRight, overRoad, grounded }
```

## The files

| File | What it is |
| --- | --- |
| `surface.mjs` | The collision mesh re-sampled into a graph of points a car could stand on, 2 units apart, joined where the surface carries on smoothly (normals within 37 degrees). Also the distance from each point to where its surface ends, and the direction pointing off it. |
| `route.mjs` | `buildRoute(info)`: the search and the finished route (points every unit, forward / up / left, on-road flag, room to each side, curvature, slope, the point at which each gate is taken, the flown stretches). `roomBeside()`: room to the road's edge at any point. |
| `route_store.mjs` | `routeFor(info)`: builds once, then reads from `cache/`. |
| `progress.mjs` | `createTracker(route, mesh)` and `locate(route, mesh, state)`: progress along the route, distance from it, room to the road's edge at the car, whether there is road under the car. |
| `observation.mjs` | `createObserver(info, route)`: the 334-number observation. The layout is at the top of the file and below. |
| `validate.mjs` | The validation table. |
| `smoke_test.mjs` | Simulator checks. |
| `human_traces.mjs` | The fastest human lap as car states, for validation only. Nothing else reads a lap. |
| `plot_dump.mjs`, `plot_route.py` | A picture of a track from above with the route and the human lap. |

## How the route is found

1. **Surface graph.** A track is 25 000 to 91 000 collision triangles. They are sampled into 0.1 to 0.8 million points with normals. Joining by normal keeps road and wall apart and keeps a loop or a banked wall in one piece.
2. **Search by stages.** A shortest-path search runs from the start position, one stage per gate. A stage ends at the points lying in that gate's detector box. Where a track offers several parts for one gate (summer3, summer6, summer7, winter3, desert3, desert5), all of them are tried.
3. **Heading.** Each search state carries the direction the car is heading in. A step may differ from it by at most 67 degrees and the heading follows slowly, so the path cannot reverse on a 13-unit road. The path may not run along the rim of a surface, which keeps it off beams and kerb crests.
4. **Flights.** Where the car is heading squarely off the end of a surface, the search throws it off at up to 13 speeds, follows the parabola with ray casts, and adds a flight to wherever it lands the right way up. The speeds stop at what a car could have reached by then at full throttle. A flight of L units costs `25 + 1.5 L + L²/100` against 1 per unit driven, so the search flies only where the road does not go.
5. **Finish.** The path is smoothed, resampled to one point per unit, lifted to the car's ride height (0.15), and measured.

Numbers taken from the human laps and built into the code, so that the reader knows what is not purely geometric: the ride height 0.15, gravity 20 units/s², the acceleration curve (19.5 units/s² at rest falling to 5 at 140 units/s), the top speed 146 units/s, and the take-off speeds tried (the humans take off at 34 to 141). These are properties of the car, not of any track. The flight cost, the heading limits and the ramp rule were chosen while looking at these 17 tracks, so the results below are not a held-out test.

## Validation against the fastest human lap

Produced by `validate.mjs`. Distances in units (a road is 13 wide, one grid cell is 5).

| Track | Gates reached | Length route / human | Human's distance from route: median / 95% / max | Off pace | Human above route | Largest drop | Longest stall | Build |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| summer1 | 4 of 4 | 1253 / 1318 | 5.0 / 36 / 44 | 0% | 0% | 0.0 | 0.3 s | 2.0 s |
| summer2 | 3 of 3 | 950 / 990 | 9.5 / 33 / 37 | 0% | 1% | 0.0 | 0.3 s | 3.6 s |
| summer3 | 4 of 4 | 1408 / 1426 | 8.5 / 25 / 33 | 0% | 0% | 0.0 | 0.3 s | 7.2 s |
| summer4 | 5 of 5 | 2747 / 2478 | 41 / 518 / 530 | **48%** | 16% | 0.1 | **11.5 s** | 15.2 s |
| summer5 | 9 of 9 | 3797 / 3966 | 5.6 / 68 / 79 | 0% | 16% | 0.0 | 0.3 s | 15.0 s |
| summer6 | 10 of 10 | 2943 / 2964 | 4.6 / 37 / 45 | 0% | 0% | 0.0 | 0.3 s | 9.5 s |
| summer7 | 5 of 5 | 2089 / 2218 | 4.9 / 51 / 85 | 3% | 9% | 0.4 | 0.4 s | 7.9 s |
| winter1 | 3 of 3 | 1249 / 1294 | 4.8 / 34 / 35 | 0% | 2% | 0.0 | 0.3 s | 4.1 s |
| winter2 | 3 of 3 | 2808 / 2823 | 3.7 / 42 / 55 | 0% | 0% | 0.0 | 0.2 s | 13.5 s |
| winter3 | 6 of 6 | 2753 / 2774 | 3.2 / 35 / 39 | 0% | 9% | 0.0 | 0.3 s | 9.5 s |
| winter4 | 5 of 5 | 1853 / 1860 | 3.8 / 19 / 24 | 0% | 0% | 0.0 | 0.3 s | 4.7 s |
| winter5 | 3 of 3 | 1760 / 1748 | 2.6 / 21 / 23 | 0% | 0% | 0.0 | 0.3 s | 13.3 s |
| desert1 | 4 of 4 | 1644 / 1645 | 3.8 / 24 / 36 | 0% | 0% | 0.0 | 0.3 s | 6.4 s |
| desert2 | 5 of 5 | 2060 / 2371 | 4.5 / 72 / 104 | 4% | 19% | 0.0 | 0.3 s | 10.6 s |
| desert3 | 2 of 2 | 1542 / 1584 | 30 / 52 / 56 | 0% | 19% | 0.0 | 0.4 s | 8.7 s |
| desert4 | 4 of 4 | 1984 / 1985 | 5.9 / 28 / 33 | 0% | 9% | 0.0 | 0.3 s | 12.1 s |
| desert5 | 5 of 5 | 2667 / 2498 | 9.4 / 96 / 156 | **11%** | 25% | 1.0 | **2.5 s** | 12.6 s |

Columns:

- **Off pace**: share of the lap, in 1-second windows, in which the route progress gained was under 0.4 times or over 2.5 times the distance the human drove. This is the test of "can it be the ruler for progress". Distance from the route cannot be that test: on an open floor the human's wide line is up to 79 units from the route's tight one (summer5) and progress still keeps step.
- **Human above route**: share of the human's time on the road spent more than 5 units above the route's surface, which means on a banked wall or loop that the route does not climb.
- **Largest drop / longest stall**: of route progress along the human lap. The environment ends an episode after 2 s without a unit of progress.
- In every row the tracker ended within 0.2% of the route's length when the human finished, and the test "is there road under the car" (`at.overRoad`) was false on under 0.5% of the wheels-down samples of every human lap (it prints as 0.00).

Notes per track, from the pictures:

- **summer1, summer2, summer3, summer6, winter1 to winter5, desert1, desert4 (11 tracks)**: same roads as the human throughout, including the flights. The remaining distance is line choice: the route cuts corners on the inside with a 5-unit margin, the human takes them wide.
- **summer5**: same roads through all 9 gates. Twice the human rides a banked wall at the edge of a large floor (up to 44 units above it) and the route stays on the floor.
- **summer7**: same roads; one banked stretch as on summer5.
- **desert2**: after gate 3 the human turns round on a banked wall. The route turns round on the flat floor next to it, in a tight loop. A car would have to slow right down for it.
- **desert3**: the track is symmetric, with two ramps side by side. The route takes the left ramp, the human the right one; both fly about 230 units onto the same floor.
- **desert5**: the human turns round through a loop structure about 100 units high. The route makes a U-turn on the floor instead, 156 units away at worst. Progress stalls for 2.5 s of the human lap.
- **summer4**: wrong. After gate 1 the route hops a level 20-unit gap onto the top of a 20-unit-wide wall of blocks, follows it to the far end of the track, joins the road there against its direction, takes gate 2, makes a U-turn on the floor behind it and drives back. The human drops off the floor to a lower level and flies twice. The cause is the cost: two designed flights cost 700, the wall top costs less. The surface on top of the wall is real, so no geometric rule excludes it.

## The observation (334 numbers)

"As now" means identical, entry for entry, to the existing 352-number observation.

| Entries | Content | |
| --- | --- | --- |
| 0 to 16 | speed, velocity, world up, rotation rate, wheel contacts, steering angle, held keys | as now |
| 17 to 19 | nearest route point in the car's frame, / 10 | was the human line's |
| 20 | fraction of the route covered (0 unless `lapFraction`) | was of the human line |
| 21 to 80 | 20 route points ahead in the car's frame, each divided by its distance along the route; gap = max(2, speed × 0.15 s) | was the human line |
| 81 to 100 | curvature at those points, rad per unit / 0.05, + = left | was the human's speed |
| 101, 102 | room from the car to the road's edge, left and right, / 10 | as now, but measured at the car |
| 103 | body contact in the last step | as now |
| 104 to 143 | room beside the route at the 20 points, left then right, / 10 | as now, about the route |
| 144, 145 | S held; pedals read at the coming decision | as now, same positions |
| 146 to 271 | route forward (3) and road up (3) in the car's frame, at the nearest point and the 20 ahead | was 9 each: the human car's forward, up and keys |
| 272 to 291 | slope at the 20 points | new |
| 292 to 311 | 1 where the route is on the road at that point, 0 where it flies | new |
| 312 to 314 | distance to the next flight, its length, its take-off speed | new |
| 315 | distance to the next gate | new |
| 316 | height of the car above the route, / 10 | new |
| 317 to 333 | the 16 rays from the car and 1 straight down | as now (were 335 to 351) |

Gone and not replaced: the human's speed at each point ahead, and the human's keys. Nothing derived from the track says how fast a corner can be taken.

## Smoke tests

`smoke_test.mjs`, one simulator at a time, 13 s, run on desert4 and winter2. All checks pass on both.

- The car numbers, contact flag, pedal flags and the 17 rays are equal to `RacingEnv`'s own observation on the same car states: largest difference 0 over 178 block decisions (desert4) and 144 (winter2).
- Driving the fastest human lap's keys on `SimSession`, which has no reference lap: 435 observations (desert4) and 537 (winter2), all finite and within ±3; route progress never drops; progress equals the route's length on the tick the game reports the finish (21 750 ms and 26 830 ms).
- 0.5 to 0.7 ms per observation.
- A car holding only W on desert4 is seen to have no road under it from 3050 ms, with no human lap to compare against.

## Not done, not tested

- **No policy has been trained on this observation.** Whether an agent can learn from it, and how much the missing speed and key inputs cost, is unknown.
- **Nothing has driven the route.** Where it differs from the human (summer4, desert5, the flat turn-rounds on desert2), whether a car can follow it is not known. The flights are drag-free parabolas at an assumed speed: a real 384-unit flight came up 11% short of its parabola.
- **No community track was tried.** There is none in the repository. The official tracks use at most 61 of the 186 part types each, so parts the search has never met are likely.
- **The route is the shortest way, not the fastest.** It has no model of cornering speed. On open floors it hugs the inside of every corner, which is a poor line at speed, and it prefers a slow flat U-turn to a fast banked wall.
- **No speed advice.** A speed profile from curvature (the humans corner at up to about 60 units/s² sideways) would be the natural replacement for the human's speeds; it is not built.
- The search with headings is not guaranteed to find the cheapest path.
- Peak memory for the largest track (summer5, 761 000 points) is 526 MB during the build; using a cached route needs a few MB.

## Changes needed elsewhere

`rl/racing_env.mjs` was not touched. To switch it to these modules it would need:

1. **`create()`**: an option such as `reference: 'route'`. In that mode build `info = loadTrackInfo(cfg.track)`, `route = routeFor(info)`, `observer = createObserver(info, route, { lapFraction, minGap, gapSeconds })`, and skip `setReference()`.
2. **`_locate()`**: replace the body with `this.at = this.observer.tracker.update(this.state)`, then `progress = at.progress`, `progressIndex = at.index`, `offLine = at.offRoute`, `edgeLeft = at.edgeLeft`, `edgeRight = at.edgeRight`.
3. **`_observe()`**: return `this.observer.observe({ state, older, held: actionToControls(previousAction), contact: contactTicks > 0, pedalOpen, at: this.at }).obs`.
4. **`OBS_SIZE`** 352 → 334. `OBS_S_HELD` (144) and `OBS_PEDAL_OPEN` (145) keep their positions. Everything that fixes the input size follows: `rl/train_ppo.py`, `rl/polytrack_env.py`, `rl/export_actor.py`, `rl/evaluate.py`, and `obsSize` in `ideas/shared/policy.mjs`. Existing checkpoints do not fit; entries 0 to 16 and the rays could be carried over as `rl/extend_checkpoint_inputs.py` does.
5. **Reward**: the pace term divides by the human's speed at the line point; there is none, so `paceReward: 0`. `straight` and `openRoad` can be computed as now with `lineStraightness(route, route.up)`, which only reads `points`. `_laneCost()` reads the human-line clearance table; switch it off (`lanePenalty: 0`) or rewrite it on `route.edgeLeft / edgeRight`. `line.length` → `route.length`, `line.grounded` → `route.grounded`.
6. **Episode ends**: `off line` at 20 or 40 units would end correct driving, since the human laps are up to 55 units from the route on the 11 clean tracks and 104 on desert2; use about 80, or drop it. `off track` becomes `at.grounded && !at.overRoad`. `maxTicks` is twice the human's lap time; without a lap it needs another budget, for example `route.length / 30` seconds.
7. **Starts part-way round**: `randomStart`, `failureStart`, `kick`, the ladder of save states and `demo()` all replay the human's keys to place the car. On a track with no lap only start-line starts and `ownStart` remain. On the 17 official tracks the human lap can still place the car while the observation and reward come from the route.
8. **`_info()`**: `fraction` from `route.length`.

`ideas/shared/track_info.mjs`: a request to replace its coarse `progress()` with `progress.mjs` is in `ideas/shared/REQUESTS.md`.

## Cost of a full run

- Building all 17 routes: 2 to 15 s each, 2.6 minutes in total, one CPU core, once. After that 15 ms per track.
- A new track: the same, once, plus 526 MB at most while building.
- Per step in training: 0.5 to 0.7 ms per observation, about the same work as the existing one plus two short ray fans for the room at the car.
- Training a generalist on it would cost what the present generalist's training costs. That is the experiment that decides whether this works, and it has not been run.
