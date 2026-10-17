# Shared code contract

Read `ideas/BRIEF.md` first. This file lists what `ideas/shared/` offers, the
facts about the codebase that are easy to get wrong, and the rules that keep
thirteen agents out of each other's way. Only the orchestrator writes in
`ideas/shared/`; ask for changes in `REQUESTS.md`.

Phase 2 (after the twelve ideas were written and tested) added modules
promoted from idea folders and the facts the agents measured: see "Added in
phase 2" at the end. `REQUESTS.md` records what was decided about each request.

Everything here wraps the existing code in `sim/` and `rl/`; nothing is a
fork. All of it was run by `node ideas/shared/smoke_test.mjs` (13 s, one
simulator at a time, 19 checks, all passing on desert4); that file is also the
shortest working example of every function.

Import from your folder as `../shared/<file>.mjs`. Run everything from the
project root. Paths given to shared functions are relative to the project root.

## Units and conventions

- 1 tick = 1 physics step = 1 ms. A lap time is `finishFrames` ticks.
- Positions are world units, roughly metres; y is up. One track grid cell is 5
  units. Speed is km/h in the car state (`speedKmh`), units/s where stated.
- Quaternions are `[x, y, z, w]`. Car frame: x = left, y = up, z = forward.
- `keys`: one `{ up, right, down, left, reset }` per tick; `keys[t]` is held
  while tick `t` is computed. `up` = W, `down` = S, `left` = A, `right` = D.
- `decision`: `[steer, steerAt, w, wAt, s, sAt]`, one per 50 ms. steer 0 none /
  1 left / 2 right; w, s 0 or 1; `...At` 0..4 = the 10 ms slice of the block in
  which that control switches to its target.
- A lap from the start line begins with ONE EMPTY TICK, then the decisions:
  decision k covers ticks `1 + 50k .. 50 + 50k`.

## Modules

### `laps.mjs` — laps in one form, and conversions (no simulator)

Used by: every g1 idea, g2-3, g2-4, g2-5.

| Function | Returns |
| --- | --- |
| `TRACKS` | the 17 track names with human laps |
| `humanLaps(track)` | the ten laps of `data/laps/<track>.json`, fastest first, as lap objects |
| `loadLap(what, track?)` | one lap object. `what`: `'human:3'` (needs `track`), `'fixture:summer1'`, a path to `runs/x_<track>.json` or `runs/x_<track>.recording.json`, or an object of either file shape |
| `recordingToKeys(recording, frames)` / `keysToRecording(keys)` | exact |
| `keysToTimeline(keys)` / `timelineToKeys(timeline, frames)` | exact; a timeline is `{ up: [flip ticks], right, down, left, reset }` |
| `recordingToTimeline(str)` / `timelineToRecording(timeline)` | exact (sim/recording.mjs) |
| `decisionsToKeys(decisions, { before = [0,0,0], lead = 1 })` | the keys `stepBlock` holds: `lead` empty ticks + 50 per decision. Exact (checked against the environment's own key log over a 22 s lap) |
| `keysToDecisions(keys, { before, lead })` | `{ decisions, wrongTicks, before }`. LOSSY for human laps |
| `sameKeys(a, b)` | boolean |

A lap object is `{ track, frames, finished, recording, keys, source }` with
`keys.length === frames`.

```js
const human = humanLaps('desert4')[0];            // 21750 ms
const { decisions, wrongTicks } = keysToDecisions(human.keys);
```

`keysToDecisions` on the fastest human lap gets 2.8% (desert4), 1.7% (summer1)
and 5.7% (winter2) of ticks wrong, because humans switch keys on any tick and
sometimes twice inside 50 ms. That is enough to change where the car goes.
The decisions are a starting point for a human-seeded search (g1-1), not a
replay of the human lap; g1-5 should work on `keys` or a timeline directly.

### `sim_session.mjs` — save-state rollouts on the bare simulator (no reference lap)

Used by: g1-2, g1-5, g1-7, g2-1, g2-2, g2-3, g2-4 (and g1-4 if it ranks by a
reference-free measure).

```js
const sim = await SimSession.create('desert4');   // or CreateCar inputs of your own track
await sim.restart();                               // start line, tick 0
const r = await sim.drive(keys.slice(0, 5000));    // { tick, finished, finishFrames, contactTicks, state }
const point = await sim.save();  /* ... */  await sim.load(point);  sim.drop(point);
```

| Member | Meaning |
| --- | --- |
| `SimSession.create(track)` | boots one simulator (about 1 s) |
| `restart()` | new car at tick 0; kills and frees every earlier point |
| `drive(keys)` | per-tick keys; stops at the finish |
| `hold(controls, n)` | the same keys for n ticks |
| `save()` → point, `load(point)`, `drop(point)` | a point stores about 0.18 MB (desert4) plus its own copy of the keys; `load` restores `sim.keys` from that copy (it used to only cut the list back, which was wrong after driving another branch: `tests/TESTING.md`) |
| `tick`, `keys`, `state`, `finished` | lap clock in ms; every key driven so far; decoded car state (`sim/state.mjs`); crossed the line |
| `motion()` | `{ velocity: [x,y,z] units/s, spin: [x,y,z] rad/s }`, world axes, measured over the last 4 ticks. The car state has neither; position + quaternion + velocity + spin is what "two car states nearly match" has to compare |
| `budgetLeft` | false after about 4.5 million ticks on one car; call `restart()` (see "Car tick budget") |
| `close()` | stop the simulator |

`result.state` fields: `position`, `quaternion`, `speedKmh`, `nextCheckpointIndex`,
`wheelContact[4]`, `collisionImpulses[]`, `steering`, `finishFrames`, `frames`.
`contactTicks` counts ticks on which the car's body (not the wheels) touched
anything; clean human laps have zero.

Same keys from the same point finish on the same tick (checked). Measured
with training running on the machine: 34 000 ticks per second of wall time
(a 22 s lap in 0.65 s), 5 ms per `save()`, 2 ms per `load()`.

### `block_rollout.mjs` — rollouts in the training environment (needs a reference lap)

Used by: g1-1, g1-3, g1-4, g1-6, g2-3, g2-4, g2-5.

```js
const renv = await openBlockEnv('desert4');                 // RacingEnv with BLOCK_ENV
let obs = await fromStart(renv);
const r = await roll(renv, obs, { policy, horizon: 2000 }); // top choices to the finish
```

| Function | Meaning |
| --- | --- |
| `BLOCK_ENV` | `{ ticks: 10, block: 5, pedalEvery: 5, lapFraction: 0, maxOffLine: 40 }`: the options every block checkpoint is tested with |
| `openBlockEnv(track, extra = {})` | `RacingEnv.create`; `extra` e.g. `{ refLap: 3 }` or `{ refFile: 'runs/..recording.json' }` |
| `fromStart(renv)` | car to the start line, returns `obs`. Builds a new car when the old one is used up |
| `roll(renv, obs, { explicit, policy, horizon, sampleUntil, rng, temperature })` | drives up to `horizon` decisions: `explicit[k]` if given, else the policy (sampled for `k < sampleUntil`, top choice after). Returns `{ decisions, obs, done, finished, finishFrames, reason, reward, progress, speed, tick }` |
| `needsFreshCar(renv)` | true when the next `fromStart` will replace the car |

Save states here are RacingEnv's own: `const m = await renv.mark()`,
`({ obs } = await renv.rewind(m))`, `renv.dropMark(m)`. A mark stores about
0.19 MB; several hundred at once (beam search) is a few hundred MB per
process, so drop what you prune. `mark()` only works after a `fromStart()`
(it needs the ladder's base snapshot). `progress` is distance along the
REFERENCE line in units; `reason` is one of `finished`, `stalled`,
`off line`, `off track`, `time limit`.

The environment cuts an attempt off when it is more than `maxOffLine` units
from the reference line (60 over stretches the reference flew). A search that
is meant to leave the human's line (g1-1, g1-6, g1-7) must raise `maxOffLine`
or use `sim_session.mjs`.

### `policy.mjs` — a block policy and its value estimate in Node

Used by: g1-1, g1-3, g1-4, g2-3, g2-4, g2-5. The code lives in
`rl/policy.mjs` (since 16 October 2026), where training and the search use it
too; this file re-exports it.

```js
const policy = loadPolicy('rl/checkpoints/ppo_sr1_desert4.u800.actor.bin');
const decision = policy.decide(obs);               // or decide(obs, createRng(1), 1) to sample
```

| Function | Meaning |
| --- | --- |
| `loadPolicy(file, { obsSize })` | `{ hidden, scores(obs) → 22 logits, decide(obs, rng?, temperature?) → decision, logProb(obs, decision) }`. Hidden width is read off the file size |
| `loadValue(file, { obsSize })` | `value(obs) → number`: the critic's estimate of discounted training reward to go |
| `createRng(seed)` | seeded generator in [0, 1) |
| `GROUPS`, `NUM_SCORES` | layout of the 22 scores |

Weights files: `python rl/export_actor.py <ckpt.pt>` writes `<ckpt>.actor.bin`
(many already exist in `rl/checkpoints/`); `.venv/Scripts/python
ideas/shared/export_critic.py <ckpt.pt>` writes `<ckpt>.critic.bin` next to it
(CPU, 1 s; `ppo_sr1_desert4.u800.critic.bin` exists). Checked: the policy's
top-choice lap on desert4 is 22.061 s, the same as `search_rollout.mjs`
reports, and passes Verify.

The value is in training-reward units discounted at 0.995 per 50 ms decision
(a reward 7 s away counts half) and was fitted only on states the policy
visits. Measured: 59 on the desert4 start line, 78 five seconds in. Use it to
rank states a short way apart; it is not a lap-time prediction, and
`search_rollout.mjs` records that ranking by distance one second ahead made
laps slower (22.147 s against 22.061 s), so judge by finish time whenever a
candidate can be driven to the finish.

### `track_info.mjs` — geometry and reference-free progress

Used by: g1-4, g1-6, g1-7, g2-1, g2-2, g2-3, g2-4.

```js
const info = loadTrackInfo('desert4');             // or a save string / CreateCar inputs
const { distance, fraction, checkpoint, toGate } = info.progress(sim.state);
```

| Field | Meaning |
| --- | --- |
| `createCar` | `{ trackData, mountainVertices, mountainOffset }` for `Env.reset` / `SimSession.create` |
| `parts` | placed parts: `{ typeId, x, y, z, rotation, rotationAxis, checkpointOrder, startOrder }`, grid cells |
| `path` | `{ start: { position, quaternion }, gates: [{ center, size, isFinish, order, alternatives }], points, cumulative, length }`: checkpoints in order, then the finish |
| `mesh` | built on first use: `{ triangles, count, raycast(from, dir, max), raycastFar(from, dir, max) }`; `dir` a unit vector; returns distance or `Infinity` |
| `progress(state)` | distance in units along the straight gate-to-gate path, from the game's checkpoint counter and the straight-line distance to the next gate |

`progress` is exact about order (it uses the game's own checkpoint count) and
coarse between gates: tracks have 2 to 10 gates (most 3 to 5), and the value
stalls when the road leads away from the next gate. Good for ranking attempts
seconds apart or for "furthest point reached"; too coarse as a per-step
reward. A finer route is g2-1's deliverable; if it works, it will be promoted
here in phase 2.

Per-part-type data (collision triangles, detector boxes, start offsets for
all 186 part types) is `loadCaptured('init_0.6.3.json').trackParts` from
`sim/host.mjs`. Encoding a track back to a save string is not shared (only
g2-2 needs it); the codec is in `vendor/polyrl/node/track_codec.mjs`.

### `verify.mjs` — finish and verify a lap

Used by: every idea that reports a lap time.

```js
const r = await verifyAndSave({ track: 'desert4', keys, name: 'g1-4-beam' });
if (r.ok) console.log(r.seconds, r.files);
```

| Function | Meaning |
| --- | --- |
| `scoreKeys(env, track, keys, maxFrames?)` | play keys from the start, `{ finished, finishFrames, checkpoints, recording }`; about 0.3 s per lap. Replaces the Env's car |
| `verifyAndSave({ track, keys, name, env?, save = true })` | finds the finish tick, runs the game's Verify at that tick (must pass) and one tick earlier (must fail), then writes `runs/<name>_<track>.json` and `runs/<name>_<track>.recording.json`. Returns `{ ok, finished, finishFrames, seconds, recording, verified, offByOneRejected, roundTrip, files }` |

A time counts only if `ok` is true. The two files are in the formats the
existing tools read (`export_recording.mjs`, `watch_ghost.mjs`, `refFile`,
`rl/lap_bc.py`, `loadLap`). Without `env`, it boots its own simulator and
closes it; that counts towards your simulator limit while it runs. With
`env`, that simulator's car is replaced, so all its save states die: verify at
the end, or on a separate Env.

## Rules for working side by side

**Files under `runs/`.** Run names start with your idea id and a dash:
`g1-4-beam` → `runs/g1-4-beam_desert4.json`. `verifyAndSave` refuses anything
else. If you call `RacingEnv.save(run)` or `rollout_child`'s `save` yourself,
use the same prefix. Never write a name without it: `runs/` holds about two
thousand files, and running jobs read `rollout_*`, `s*_`, `ev*`, `bg_*`,
`big_*`, `blk_*`, `g3r1_*` among others. Logs and scratch output go in your
own folder, not `runs/`.

**Files under `rl/checkpoints/`.** Read anything. Write only new files named
`<idea id>-...` (e.g. `g1-6-iqn_desert4.pt`), or the `.actor.bin` /
`.critic.bin` that the export scripts put next to an existing checkpoint.
Never write to a `ppo_*.pt` name: trainers replace those files as they run.

**Two simulators at most, about 2 minutes.** Each `Env.create`,
`SimSession.create`, `openBlockEnv`, pool child and env_server is one
simulator. Several in one Node process do not run in parallel
(`sim/pool.mjs`), so for a test use either one process with one simulator, or
`createPool(track, 2, ...)`. Take `workers` as an argument defaulting to 2 in
tests and say in your README what a full run would use. Close what you open
(`close()`, `pool.close()`), and check with your process list that nothing of
yours is left; do not kill node or python processes you did not start (about
20 belong to training and searches).

**Your own pool child.** `createPool(track, n, childFile, setup)` resolves
`childFile` relative to `sim/`, so pass `'../ideas/<your folder>/child.mjs'`.
The protocol is in `sim/pool.mjs`: a `{ track, ...setup }` message, reply
`{ ready: true }`, then `{ id, ... }` requests answered with the same `id`.
`pool.runAll(requests)` sends request k to child k.

**Python.** `.venv/Scripts/python`, CPU only for anything you run now
(`map_location="cpu"`); the GPU is training. `rl/polytrack_env.py` has
`EnvServer` / `PolytrackVecEnv` if you need the environment from Python
(`sys.path` needs `rl/`).

## Facts that are easy to get wrong

- **Car tick budget.** One simulator car can be stepped about 6 million ticks
  in total, and restoring a save state does not give ticks back. Budget 4.5
  million, then `sim.restart()` / `fromStart(renv)`; every point or mark from
  the old car is then dead. A 22 s lap is 22 000 ticks, so a search that
  re-drives to the finish gets about 200 full laps per car.
- **Save states belong to one car.** `Env.reset`, `replay`, `evaluate`,
  Verify-with-`env`, `RacingEnv.setReference`, `demo` and a ladder rebuild all
  replace the car. Save and load only between step calls.
- **`RacingEnv` cannot run without a reference lap.** Observation, reward,
  `progress`, `off line` and `off track` all come from it, and the ladder of
  save states is built by replaying it. `refFile` accepts any
  `{ frames, recording }` file, which is how a stitched or computed lap (g1-2,
  g1-7) can become the reference without code changes, provided it finishes.
- **Which human lap.** `refLap: -1` (the default) is `sim/drive.mjs
  loadHumanLap`: on summer1 and winter1 that is polyrl's fixture lap. On
  summer1 the fixture is 22.279 s but `data/laps/` lap 0 is 22.131 s (on
  winter1 both are 17.011 s; the other fifteen tracks have no fixture). The
  summer1 "human" time in BRIEF.md is the fixture's. To beat the best human
  lap we have, compare against `humanLaps(track)[0].frames`.
- **Observation size is 352** (`OBS_SIZE`), not the 144 or 335 some comments
  still say. Checkpoints older than the ray inputs have fewer inputs;
  `loadPolicy` throws on those unless given `obsSize`.
- **Decision labels.** In imitation data (`demo()`, `rl/lap_bc.py`) a switch
  slice of 5 means "no change". `keysToDecisions` writes 0 there instead;
  `stepBlock` ignores the slice when the target equals the current state, so
  both drive identically.
- **After the last key, the last keys are held.** A recording is a list of
  flips, so replaying keys that stop early keeps the final keys down until
  `maxFrames`.
- **The gate path is not the road.** `path.points` are straight lines between
  checkpoint centres and can cut through walls.
- **Verify is local.** `worker.verify` runs the game's routine inside our own
  simulator; nothing is sent anywhere. Nothing in `ideas/` may add network
  calls.

## Added in phase 2

Everything above is as the twelve idea agents used it (with the testers'
three fixes). What follows was added after they finished: modules promoted
from idea folders, two small shared modules that replace copies, and the
facts the agents measured.

A promoted module is a file here that re-exports from the idea folder where
the code and its tests still live. Import the shared file, not the idea
folder: the shared file's header says what is confirmed and what is not, and
the idea folder stays free to change its internals.

| Shared file | What it gives | Code lives in | Confirmed by an independent tester |
| --- | --- | --- | --- |
| `rng.mjs` | `createRng(seed)` → a function giving floats in [0, 1). The one seeded generator; imports no simulator | `sim/search.mjs` | yes (`shared/tests`) |
| `pool.mjs` | `createPool(track, n, childFile, setup)` → `{ runAll, evaluateAll, close }`: a child that dies rejects the request with its error text instead of leaving the parent waiting for ever | `sim/pool.mjs` (written here, promoted 16 October 2026) | `tests/test_pool.mjs`, 6 checks |
| `track_info.mjs` (added) | `surfaceBelow(mesh, p, above = 1, reach = 3)` → height of the track surface under point `p`, or `null`; `watchLap(mesh, states, maxGap = 1.5)` → `{ offRoad, worstGap, lowest, firstOff }` | here (moved from g2-2's tests) | written by g2-2's tester |
| `car_model.mjs` | `loadCarModel()` → `{ accel(v, share), coast(v), brake(v), kappaMax(v), speedFor(kappa), topSpeed }`, speeds in units/s, accelerations in units/s², curvature in 1/units; `buildPad({ wide, long })` → CreateCar inputs of a flat pad | g1-7 | straight-line numbers and the turning limit: yes. Braking while steering: NO (it throws here) |
| `track_build.mjs` | `encodeSaveString(parts, environment)` → `trackData`; `encodeExportString`; `loadPieceTable()`; `worldPorts(part)` → `[{ axis, out, plane, a, b, center, width, pitch }]`; `matePorts(parts)`; `generateTrack({ seed, length, difficulty })` → `{ createCar, route, parts }`; `loadGenerated(file)` | g2-2 | yes |
| `route_progress.mjs` | `routeFor(info)` → route; `createTracker(route, mesh).update(state)` and `locate(route, mesh, state)` → `{ progress, fraction, index, offRoute, lateral, height, edgeLeft, edgeRight, overRoad, grounded }`, units along a 1-unit route | g2-1 | yes on 15 of 17 tracks; read the warnings |
| `lookahead.mjs` | `driveLap(renv, policy, { mode: 'lazy' })` → `{ decisions, finished, finishFrames, simTicks, ... }`: a finished lap from a policy that does not finish alone | g2-4 | yes (5 of 16 laps re-driven, the rest from logs) |
| `lap_paths.mjs` | `recordPath(env, track, lap)`, `mismatch(a, b)`, `stateAt`, `locate`, `crossings`, `sectionTimes`, `follow(sim, donorPath, donorTick, until, 'repair')` | g1-2 | yes |
| `laps_bc.py` | `python ideas/shared/laps_bc.py <track> <out.npz> <lap> [<lap> ...]`: imitation examples from several laps | g1-3 | yes: one lap gives `rl/lap_bc.py`'s arrays |

Examples are in each file's header. Three things to know before using them:

- **Two progress measures, on purpose.** `info.progress(state)`
  (`track_info.mjs`) is coarse and cannot be wrong about the road, because
  there is no road in it. `createTracker(...).update(state).progress`
  (`route_progress.mjs`) is fine-grained and can be wrong:
  1. On **summer4** and **desert5** the route goes a way the human does not,
     and progress stalls for 11.5 s and 2.5 s of the human lap.
  2. **Open defect, not fixed:** a car on the ground underneath a raised road
     is credited progress between gates. Measured by the tester: 218 units
     (to 250 of 457) for a car that was never on the road; the checkpoint
     count stops it at the next gate. The guard is the tracker's own flag:
     end the attempt, or stop paying, when `at.grounded && !at.overRoad`.
     Nothing does that for you.
  3. Where the route flies it is a drag-free parabola (a real 384-unit
     flight came up 11% short), and on curved surfaces the route floats 0.5
     to 1.1 units off the road, so `height` and `offRoute` are loose there.
- **The car model's braking-while-steering numbers are wrong** as a function
  of speed (31% off at 216 km/h: it is a slide, and depends on the time since
  the keys went down). `car.brake(v)` in a straight line is within 2%.
- **`lookahead.driveLap` needs a `RacingEnv`**, so a human lap. It is for
  official tracks the policy was not trained on, not for community tracks,
  and one lap costs 9 to 39 plain laps of simulator ticks.

### Facts measured by the idea agents

Each is from one folder's README or its tester's `tests/TESTING.md`; the
folder is named so the measurement can be found.

- **There is drivable ground at y = 0, everywhere.** A car that leaves the
  road does not fall out of the world: it lands on a flat plane at height 0
  and drives on, only slightly slower than on road (314 against 320 km/h
  after 6 s of W; g1-7, confirmed by its tester; g2-2 saw 385 km/h on it).
  What follows from that:
  - "Still moving, upright, wheels down" does not mean "on the track". Ask
    `surfaceBelow` / `watchLap`, or the tracker's `overRoad`: the mesh holds
    only the track's parts, never the ground plane.
  - Any progress measure that matches the car to the nearest point of a
    line keeps counting for a car driving along under or beside the road.
    `RacingEnv` is protected by its `off line` and `off track` cut-offs; a
    new environment has to add its own.
  - A track built AT ground level can be "finished" by a car that left the
    road. g2-2's tester drove a ground-level track with a piece missing and
    the car finished with the checkpoint counted. On a raised track the same
    car drove underneath to within 0.4 units of the finish and was given
    nothing (gate boxes are at least 5.3 units up). The generator starts
    roads at grid level 2 (10 units up) by default; keep that for anything a
    learner or a search is scored on, and do not accept "finished" from a
    ground-level track without `watchLap`.
- **`RacingEnv.stepBlock` is 3 to 7 times slower than the bare simulator.**
  The 34 000 ticks per second above is `SimSession`. A block decision is five
  10-tick steps, each its own message to the simulator thread, and the
  message, not the physics, is the cost: 11.4 ms per decision against 2.5 ms
  for one 50-tick step (g1-6, desert4, machine busy; a finish is still timed
  to the tick that way); 6 ms per decision, about 7 500 ticks per second
  (g1-4); 5 to 10 thousand ticks per second (g2-4). In a search, per
  candidate: rewind 2.7 to 5 ms, the 50 ticks 3.5 to 11 ms, a save state
  12 ms (g1-4). One message per block is the first item under
  `rl/racing_env.mjs` in `ideas/README.md`, "Changes needed elsewhere".
  Under training load the bare simulator itself ran at 13 000 to 16 000 ticks
  per second per process, plus about 2 ms per call (g1-1, g1-2).
- **The generalist checkpoint `ppo_blkgen.best2` was trained on 14 tracks**
  (its own `saved['track']`, read by three testers): desert1, 2, 4, 5;
  summer1, 2, 4, 5, 6, 7; winter1, 2, 3, 5. It has not seen **desert3,
  summer3 and winter4**. winter3 is in the list, so it is not a test track.
  "Unseen" still means an official track driven with its human lap as the
  reference (g2-3, g2-4, g2-5). Its plain sampled attempts on those three:
  desert3 1 of 10, summer3 7 of 10, winter4 1 of 10, with winter4 failing at
  66.7 to 66.9% of the lap nearly every time (g2-4).
- **Lap time is jagged at the millisecond level** as a function of one key
  flip's time (g1-5, desert4): flat or gently sloped stretches broken by
  cliffs of about 10 ms. The median change between neighbouring milliseconds
  is about 1 ms, but the largest is 10 to 12 ms on every late flip measured.
  Moving one flip by 1 ms more than about 8 s before the finish almost
  always loses the lap when the rest is replayed blind (58.5% of all
  candidates lost it). So: enumerate, do not line-search; and one-flip moves
  only work in the last 4 to 8 s unless something repairs the rest of the lap.
- **Position inside the finish tick is what makes a human lap improvable**
  (g1-1). One change to a human lap is worth a fraction of a millisecond,
  which whole ticks cannot see. g1-1 ranks candidates by the car's position
  30 ms before the finish against the best lap's at the same moment, and
  that is how 4 to 28 ms were found in 100 s. The measure is a guide, not
  the clock: summed over a run it disagrees with the clock by up to a third
  (desert4: 32.6 ms measured, 28 ms real), because the finish is not
  triggered by the car's centre crossing a plane (g1-5: a lap finishing on
  tick 21908 scored 21906.4; g1-1: 3 ticks gained in the last 1.5 s with the
  car only 0.4 ms ahead by position). Keep "finishes no later on the clock"
  as a second condition, and report only the clock.
- **A short look ahead does not predict lap time.** Besides the 22.147 s
  against 22.061 s above: rank agreement with the real finish time, over
  five points of desert4, is 0.40 for progress, 0.35 for the critic's value
  and 0.54 at best for a 2 s policy rollout (g1-4); for one moved flip it
  ranged from -0.72 to +0.98 (g1-5). The critic is good late in a lap (0.71
  at 16.5 s) and useless mid-lap (0.06 to 0.08). Two decisions (100 ms) of
  different keys move the finish time by 70 to 360 ms once the policy drives
  on (g1-4).
- **A worker process that threw used to leave its parent waiting for ever**
  with `sim/pool.mjs` (found by the testers of g1-1 and g1-5; never
  triggered in the reported runs). `pool.mjs` here fixed it, and since
  16 October 2026 that fix is `sim/pool.mjs` itself, so every pool has it.
- **Blind replay of a human lap's keys from a state that is not exactly
  theirs does not survive** (g1-2): 0 of 20 raw switches between human laps
  on desert4 reached the finish, and a car 2 cm off its own lap is lost
  within 3 s. `lap_paths.follow(..., 'repair')` held 20 of 20 for 3 s and 6
  of 6 tested to the finish, at a cost of -26 to +39 ms (median +8). In the
  air nothing can be corrected: on summer4 the car lands 1 to 4 units off.
- **`sim/search.mjs` `mutate()` can move a flip up to 20 ticks outside the
  window it was given** (236 of 1000 mutations; g1-1's tester). A search
  that mutates inside a section after a save state must check that nothing
  before the save point changed.
- **`env.frames` goes back to 0 when a new car is built** (`sim/env.mjs`
  `_newCar`). A cost counted as a difference of `env.frames` is wrong across
  a car replacement (g2-4's tester: -4 496 140 ticks reported for a lap that
  cost 4260).
- **`rl/train_ppo.py --resume` continues the weights, not the run**:
  `--total-steps`, the learning-rate line, `--critic-warmup` and the
  `.u<update>.pt` names all count from the start of the process, and
  `scripts/train_block_specialist_from.sh` copies the base checkpoint over
  the working one on every start (g1-3). Do not rerun
  `scripts/search_round.sh` after an interruption; `g1-3/rounds.mjs` copes.
- **The car** (g1-7, confirmed by its tester): turning is limited by the
  steering key, not by grip (slip under 1 degree above 200 km/h); the
  tightest radius is about 0.42 units per km/h up to 300 km/h (125 units at
  300, 200 at 400), and human laps turn at exactly that limit; full lock
  with W still gives 75% of straight-line acceleration at 300 km/h; W thrust
  is about 20 units/s² with drag 0.029 units/s² per km/h; 300 km/h takes
  5.5 s. The car's origin rides 0.134 above the surface. Random keys must
  favour W or the car does not move (g1-6).
- **The ten human laps of a track do not all share a line** (g1-2): on
  summer1 only laps 0, 1, 2 and 5 do; on summer4 three laps leave the common
  line for the last third. Code that mixes or averages them must check.
- **Official tracks are not chains of joined road pieces** (g2-2): only 4 of
  17 (summer5, summer6, desert2, desert4) can be followed from start to
  finish across mated road surfaces alone; the rest need jumps, blocks or
  walls. They use 129 of the part types; the generator uses 16.

### Tests

`node ideas/run_all_tests.mjs` runs every folder's `tests/run_tests.mjs` in
turn (never in parallel) and prints one line per folder; `ideas/README.md`
has the last result. After changing a shared module, run at least
`node ideas/shared/tests/run_tests.mjs` and the suites of the folders that
import it.
