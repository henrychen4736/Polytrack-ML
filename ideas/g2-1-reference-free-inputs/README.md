# g2-1: inputs that need no human lap

The agent's 352 inputs today include the human lap's line, speeds, orientation and keys, so it cannot run on a track that has no human lap. This folder builds a **route** from the track's geometry alone (start, checkpoints in order, finish), a **progress measure** along it, and a 334-number **observation** on top of it that uses no lap at all.

Nothing here drives a car along the route or trains a policy on the observation. *(Superseded: since 16 October route mode is in the training environment and three models have trained on it: `ppo_g2-1-route` (PPO, 90 of 170), `ppo_g2-2-route-gen` (PPO on generated tracks) and `g1-6-iqn-route2_desert4` (IQN, 21.846 s on desert4). See "Route mode in the training environment" below.)* What was checked is how the route compares with the fastest human lap on each of the 17 official tracks, and that the observation can be built from a live car state.

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
| `g2-1-default_mode_check.mjs` | Records, then compares, a fixed drive of `RacingEnv`'s default mode: proof that route mode left it unchanged. |
| `g2-1-route_mode_check.mjs` | Checks of route mode in `RacingEnv`: observation, starts, ends, demo labels, speed, the car under a raised road, a track with no human lap. |
| `g2-1-human_laps_in_route_env.mjs` | The first human laps of every track driven in a route-mode `RacingEnv`: what its episode-end rules would do to them. |
| `train_route_generalist.sh`, `eval_route_generalist.sh` | Imitation start and PPO for a route generalist, in restartable stretches; the ten-attempt test plus greedy for it. |

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
- A car holding only W on desert4 is seen to have no road under it from 3050 ms, with no human lap to compare against. (Corrected 16 October: that is a flight off a ledge. The car lands at 4.25 s on road 15 units lower, where the route also goes; see the route-mode checks below.)

## Not done, not tested

- **No policy has been trained on this observation** (the training environment now supports it; see Route mode below). Whether an agent can learn from it, and how much the missing speed and key inputs cost, is unknown.
- **Nothing has driven the route.** Where it differs from the human (summer4, desert5, the flat turn-rounds on desert2), whether a car can follow it is not known. The flights are drag-free parabolas at an assumed speed: a real 384-unit flight came up 11% short of its parabola.
- **No community track was tried.** There is none in the repository. The official tracks use at most 61 of the 186 part types each, so parts the search has never met are likely.
- **The route is the shortest way, not the fastest.** It has no model of cornering speed. On open floors it hugs the inside of every corner, which is a poor line at speed, and it prefers a slow flat U-turn to a fast banked wall.
- **No speed advice.** A speed profile from curvature (the humans corner at up to about 60 units/s² sideways) would be the natural replacement for the human's speeds; it is not built.
- The search with headings is not guaranteed to find the cheapest path.
- Peak memory for the largest track (summer5, 761 000 points) is 526 MB during the build; using a cached route needs a few MB.

## Route mode in the training environment (16 October)

The changes listed below under "Changes needed elsewhere" are made. `rl/racing_env.mjs` has a route mode, switched on with `reference: 'route'` (`reference=route` for `rl/env_server.mjs`, `--reference route` for `rl/train_ppo.py`, `rl/pretrain_bc.py` and `rl/lap_bc.py`). Without it every existing behaviour is unchanged, checked number for number (below). ROUTE MODE at the top of `rl/racing_env.mjs` gives the rules and their reasons. In short:

| | Default (`reference: 'human'`) | Route mode |
| --- | --- | --- |
| Observation | 352 numbers | 334 numbers from `observation.mjs` (`OBS_SIZE_ROUTE`); entries 15, 16, 103, 144, 145 where they were |
| Progress | along the human's line | along the route (`progress.mjs`), fenced by the game's gate counter |
| Pace term | speed / human's speed | off (`paceReward` forced to 0) |
| Blocked-lane cost | on (0.05) | **off** (`lanePenalty` forced to 0): it shifts the room beside the line by how far the car is off it, which fails 15 to 35 units off the route on open floors |
| Steering costs | straightness of the human's line | straightness of the route (`lineStraightness(route, route.up)`), 0 where the route flies |
| 'off line' | 20 units (60 over flights) | `maxOffRoute`, default **110** units, ground or air |
| 'off track' | 2 units beyond the edge of the human's road | all four wheels down, the route on the road at the nearest point, no surface within 2 units under the car (`at.overRoad` false), for more than `offTrackTicks` ms (default 0) |
| 'stalled' | 2 s without a unit of progress | the same, along the route |
| Time limit | twice the human's lap | route length / `routeSpeed` (30 units/s): 2 to 3.5 times a human lap |
| The finish | the human's line ends at the finish | progress held `finishHold` (20) units short of the route's end until the game counts the finish; more than `missedFinish` (10) units past the route's last point without a finish is 'off line' (since 18 October; see below) |
| Part-way starts, ladder, kick, failure starts, `demo()` | human lap | human lap, only to place the car; on a track with no human lap every episode starts on the start line |

Where this differs from the list below, the measurement behind it comes from `g2-1-human_laps_in_route_env.mjs`: the first three human laps of all 17 tracks driven with their own keys in a route-mode environment, with the end rules read every 10 ms.

- **110 units, not 80.** The humans come up to 56 units from the route on 13 tracks, 79 on summer5, **86 on summer7** and **104 on desert2**. At 80, every human lap of summer7 and desert2 would be cut off. At 110, 46 of the 51 laps pass every end rule. The other five are on the two tracks whose route goes another way: all three of summer4's ('off line' at 8.4 s, 530 units off) and two of desert5's ('stalled' at 26.2 s, where the route turns round on the floor and the humans take the loop).
- **All four wheels.** With "any wheel down", the rule `at.grounded && !at.overRoad` fires on human laps for up to 190 ms (summer1; 120 to 180 ms on desert1): a wheel on a kerb with the car's centre over the edge. With all four wheels down it fired for 0 ms on all 51 laps. In the air the rule says nothing, so a car that hops a bump is not ended.
- The stall limit stays at 2 s. Human laps stall for 0.3 to 0.5 s on 15 tracks, against 2.5 s on desert5 and 11.5 s on summer4 (the same two tracks).
- A track given as `createCar` (a community or generated track; JavaScript only) works in route mode. The route is built and cached under the track's hash, and with no human lap the only starts are the start line and the car's own earlier states.

### Passing beside the finish paid as much as finishing (fixed 18 October)

**Found by the off-policy learner** (g1-6, `train_iqn.py --reference route` on desert4, log `runs/queue2/iqn-route.log`): over 12M decisions 80 to 97 of every 100 episodes ended 'off line' at lap 100%, and the eval lap too; only a few finished (best 22.041 s). In human mode the same learner finishes 99 of 100.

**Cause.** Progress is "the nearest route point", and after the last checkpoint the tracker may run all the way to the route's last point. So a car that passes the finish line *beside* the finish box was credited the whole route. The learner is paid progress only, and the finish top-up (`route length - progress`) was then 0, so missing the finish cost nothing. Driven greedily, its latest weights (`g1-6-iqn-route_desert4.actor.bin`) take the last straight 17 to 46 units left of the route, run off the road's edge at 21.4 s, and fly past the finish line at x = -1027 while the box spans -989 to -951 (centre -970, 38 wide): route progress 1984 of 1984 at 21.95 s, no finish, then 0.8 s of falling until off-route passes 110 units at 22.75 s. Its best weights (`.best.actor.bin`) stay on the road and finish in 22.041 s.

**The route's end is not the problem.** On all 17 tracks the route's last point is within 2.2 units of the finish box (winter2's stops 2.2 short; 15 are inside or within 0.6). The first three human laps of every track, stepped 1 ms at a time, are 0 to 2.3 units short of the route's end on the tick before the finish, and at most 2.1 units past its last point (winter2 lap 0). The flaw is the same on every track; it matters where a car can reach the finish line's plane outside the box, as on desert4's wide last straight.

**Fix** (route mode only, `rl/racing_env.mjs` `_locateOnRoute` and `step`):
- `finishHold` (default 20 units): until the game counts the finish, progress stops 20 units short of the route's end. Crossing the line pays them (the finish top-up in the shaped reward and in `iqn_server.mjs` already pays `length - progress`), so missing the finish now costs 20 units (2.0 of the learner's reward). For a human lap that is the last 0.15 s.
- `missedFinish` (default 10 units): a car more than 10 units beyond the route's last point, along the route's direction there, with no finish counted, is ended as 'off line'. That is 5 times the furthest a human lap goes past it, and it ends a missed finish at once instead of 0.8 s later.
- The observation is unchanged (it reads the tracker's own numbers), so existing route checkpoints see the same inputs. `finishHold: 0, missedFinish: Infinity` gives the old behaviour.

Driven again with the fix, the latest weights end 'off line' at 22.00 s with progress 1964 of 1984 (fraction 0.99, no longer 100%); the best weights still finish in 22.041 s.

**Effect on models trained before it.** `ppo_g2-1-route` and `g2-5-mem_route` (PPO with the shaped reward) were already paid `finishBonus` (5) plus the time bonus only for a real finish, so missing the finish already cost them; and in the 170-attempt test of `ppo_g2-1-route.after_38989824` (and the g2-5 test) no attempt ended at 97% or more of the lap. Their training would have differed only in the last 20 units of each lap and in the rare missed finish. The IQN route run (`g1-6-iqn-route_desert4`) is the one it affected: paid progress only, it had no reason to finish.

### The off-policy learner on route inputs (18 October 2026, added by the main session)

`ideas/g1-6-offpolicy-rl/train_iqn.py --reference route` (the flag is carried
through `iqn_server.mjs` and read back from the checkpoint by `eval_lap.py`),
desert4, from nothing, 12M decisions, GPU, 6 simulators. Laps verified
(Verify passes on the tick and fails one sooner).

| Run | Route finish rule | Training episodes ending | Best lap |
| --- | --- | --- | --- |
| `g1-6-iqn-route_desert4` | before the fix | 80 to 97 of every 100 'off line' at 100% of the route | 22.041 s |
| `g1-6-iqn-route2_desert4` | `finishHold` 20, `missedFinish` 10 | 100 of 100 finished | **21.846 s** |

The rerun's lap is 96 ms behind the human (21.750 s) with no human lap in the
inputs, against 21.792 s for the same learner with the human lap's inputs,
and faster than every human-reference PPO model on desert4 (21.880 s with
search). The g1-1 search seeded with it reached 21.801 s, then 21.800 s
(`runs/g1-1-routeseed*`). Checkpoint
`rl/checkpoints/g1-6-iqn-route2_desert4.pt`. The human lap still places the
part-way starts. Only desert4 was tried.

### Checks

- **Default mode unchanged** (`g2-1-default_mode_check.mjs`). It was recorded on the unmodified files, then compared after the change: 1521 block decisions and resets on desert4 with every start kind switched on (part-way, failure, own state, kick, rotating references; episodes ended 10 off line, 5 off track, 5 stalled), 803 old-scheme steps, a `demo()` of human lap 1 (435 decisions), 40 decisions after `mark()` and the same 40 after `rewind()`, and the server's start-up line. Every observation, reward, end flag and info was identical (SHA-1 per decision).
- **Route mode** (`g2-1-route_mode_check.mjs`). All checks pass:
  - over 1500 random block decisions with every start kind, the observation is always 334 numbers, finite and within ±3;
  - the time limit on desert4 is 66 133 ms (1984 units / 30);
  - a part-way start half-way through the human's lap begins at route progress 653.9, the same as a memoryless `locate()` gives;
  - `mark` and `rewind` repeat exactly;
  - `demo()` of the fastest human lap gives 434 decisions, with labels identical to the default mode's, and reaches 1975.7 of 1984 units at its last whole block;
  - on the g2-2 generated track with a piece taken out, the 'off track' rule fires on 2513 of the 2513 four-wheels-down samples of the car driving on the ground beneath the road, starting with the first one (2521 ms), and on 0 samples of a car that stays on the road. That was the open defect in `tests/TESTING.md` (progress credited under a raised road); now it ends the episode;
  - the same generated track, which has no human lap, runs from the start line even with randomStart 1.
- **The smoke test's "no road under it from 3050 ms"** (above) for a car holding only W on desert4 is a flight, not the car leaving the road. The car goes off a ledge at 2.85 s and lands at 4.25 s on road 15 units lower, where the route also goes. Route mode does not end the episode there; the car stalls against a wall at 11.06 s.
- **Speed** is about the same as the default mode. In one process on desert4 with the same driver: 328 against 277 block decisions per second for a random driver, 335 against 411 with W held. The off-policy learner was running on the same machine at the time.
- **Smoke run** (2 to 3 simulators at a time, CPU):
  - `pretrain_bc.py --reference route` on desert4 and winter2, 2 laps each, 5 epochs: 1941 examples, 14 s;
  - `train_ppo.py --reference route` from that start, 2 environments, 4 updates (2048 decisions): 258 decisions/s, and every kind of episode end occurred;
  - `evaluate.py`, greedy and sampled (it builds the route environment from the checkpoint), `export_actor.py`, and `loadPolicy(..., { obsSize: OBS_SIZE_ROUTE })` all work on the result;
  - `train_ppo.py --resume` with the wrong `--reference` stops with a message.
  - `eval_route_generalist.sh` on that 4-update checkpoint: 187 attempts (17 tracks, 10 sampled and 1 greedy each) in 12.6 minutes, 3 at a time; none finished, as expected after 4 updates (the greedy attempts ended stalled on 14 tracks, off track on 3).
  - `train_route_generalist.sh` end to end with its outputs in a scratch folder (`CK`, `LOGS`), 1 or 2 simulators, three stretches of 512 to 1024 decisions: the imitation start on all 14 tracks (7235 examples from lap 0, about 1 minute), the copy, the critic-only start, a new stretch per call, `.after_<steps>.pt` after each, and a kept copy left by an interrupted stretch renamed to `.s<k>.u<update>.pt`.

### Files changed

- `rl/racing_env.mjs`: route mode (`reference`, `maxOffRoute`, `routeSpeed`, `offTrackTicks`, and since 18 October `finishHold`, `missedFinish`; `createCar`; `OBS_SIZE_ROUTE`, `routeOffRoad`). The route modules are imported only in route mode.
- `rl/env_server.mjs`: `reference` as a text option. The observation size comes from the environment (`renv.obsSize`), also for the actor it runs. The start-up line adds `reference`, gives the route's length as `lineLength`, and gives `humanFrames: null` when there is no human lap.
- `rl/train_ppo.py`: `--reference` and `--max-off-route`. Checkpoints record `reference` (and `max_off_route`). `--resume` and `--bc-data` refuse a checkpoint or examples of the other size.
- `rl/evaluate.py`: builds the environment the checkpoint was trained in (`reference`, `max_off_route`); adds `--max-off-route`.
- `rl/pretrain_bc.py`: `--reference route` (each lap once; the reference lap is not switched) and `--workers`. The checkpoint records `reference`.
- `rl/lap_bc.py`: argparse, `--reference route`.
- `rl/export_actor.py`: prints `obsSize` and `reference`.
- `rl/polytrack_env.py`: documentation only (it already took the size from the server).
- `rl/policy.mjs`, `ideas/shared/policy.mjs`: the error message names the route size; `OBS_SIZE` and `OBS_SIZE_ROUTE` are re-exported.

### Training it

```
cd C:\Users\Henry\Documents\GitHub\Polytrack-ML
sh ideas/g2-1-reference-free-inputs/train_route_generalist.sh
sh ideas/g2-1-reference-free-inputs/eval_route_generalist.sh rl/checkpoints/ppo_g2-1-route.after_<steps>.pt
```

`train_route_generalist.sh` first makes the imitation start from the human laps (lap 0 of the 14 training tracks by default; `LAPS=10` uses all ten). It then runs PPO in stretches of 13M block decisions with the block generalist's settings, keeping copies as it goes. After a shutdown, rerunning it carries on. Its header lists every setting and output, and says which settings are reconstructed rather than known. summer4 is left out of practice because its route is wrong; desert5 stays in. `eval_route_generalist.sh` is the ten-attempt test plus one greedy attempt per track.

Not tested (as of 16 October; the first item is superseded: `ppo_g2-1-route` trained 39M decisions on 17 October, 90 of 170):
- a full training run (nothing beyond the 4-update smoke run);
- the training script's later stretches end to end;
- any community track;
- the searches (`scripts/search_rollout.mjs` and the callers of `ideas/shared/block_rollout.mjs`) with a route checkpoint. They need `{ reference: 'route' }` in the environment options and `obsSize: OBS_SIZE_ROUTE` in `loadPolicy`, and nothing passes those yet.

## Changes needed elsewhere

The list as written before route mode existed (done 16 October, see above). To switch `rl/racing_env.mjs` to these modules it would need:

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
