# Twelve ideas: what came out

Twelve agents each wrote the code for one idea, four independent testers
tested them, and an orchestrator owned the shared code. Everything is under
`ideas/`; nothing outside it was edited. This page is the summary. Each
folder has its own `README.md` (the author's) and `tests/TESTING.md` (the
tester's, which wins where the two disagree).

## Results first

**Goal 1, a lap faster than the best human lap: reached on four tracks, with
a caveat you should decide on.** Starting a search from the human's own keys
(g1-1) gave verified laps faster than the fastest of the ten human laps we
hold on desert4, winter2, summer4 and summer1. Two other methods (g1-2, g1-5)
independently got under the human on desert4. All were replayed and passed
the game's Verify in the hands of a tester who did not write the code.

The caveat: each of these is **a human's lap with its last few seconds
re-timed**, not a lap a model or a search drove from the start line. In the
g1-1 laps every key before 17.3 s (desert4), 20.3 s (winter2), 30.5 s
(summer4) and 21.3 s (summer1) is the human's. Only the last 7 s of each lap
was searched, for 100 s on two processes. Whether that counts is your call.
Nothing that drives the whole lap itself has beaten the human: the best such
lap is still the existing searched lap, 21.907 s on desert4.

**Goal 2, a generalist for any track: no generalist was trained; four of the
pieces it needs now exist and are tested.**

- On the three official tracks the current generalist never trained on, a
  lookahead driver (g2-4) finished 16 of 16 laps against 6 of 16 for the
  policy alone, and explore-from-save-states (g2-3) found a finished lap in
  18 of 18 runs. Both still need the track's human lap as a reference.
- A track generator (g2-2) makes valid random tracks from 16 of the game's
  road pieces, each with a centre line and a finishing lap.
- A route and observation built from the track alone (g2-1) keep step with
  the human lap on 15 of 17 official tracks. Nothing has been trained on it.
- The memory policy (g2-5) and the off-policy learner (g1-6) are code and
  tests only: no training run was allowed tonight.

### Verified laps under `runs/`

Each is saved as `runs/<name>_<track>.json` and `.recording.json`, finishes
on the stated tick, and passes the game's Verify. "Best human" is lap 0 of
`data/laps/<track>.json`. All times in seconds.

| Track | Lap | Best human | Difference | File (`runs/…`) | From | Checked by a tester |
| --- | --- | --- | --- | --- | --- | --- |
| desert4 | **21.722** | 21.750 | **−0.028** | `g1-1-smoke_desert4` | human lap, last 7 s searched | yes |
| desert4 | **21.722** | 21.750 | **−0.028** | `g1-5-smoke-human_desert4` | human lap, last 4 s re-timed (a different lap from the one above; the equal time is a coincidence) | yes |
| desert4 | **21.730** | 21.750 | **−0.020** | `g1-2-stitch_desert4` | human lap 1 to 17.0 s, then human lap 7 | yes, reproduced key for key |
| winter2 | **26.816** | 26.830 | **−0.014** | `g1-1-smoke_winter2` | human lap, last 7 s searched | yes |
| summer4 | **34.100** | 34.105 | **−0.005** | `g1-1-smoke_summer4` | human lap, last 7 s searched | yes |
| summer1 | **22.127** | 22.131 | **−0.004** | `g1-1-smoke_summer1` | human lap, last 7 s searched | yes |
| desert4 | 21.907 | 21.750 | +0.157 | `g1-5-smoke_desert4` | the existing searched lap, unchanged (fine timing found nothing) | yes |
| desert4 | 21.997 | 21.750 | +0.247 | `g1-4-smoke_desert4` | beam search over 2 s of the specialist's lap | yes |
| desert4 | 22.061 | 21.750 | +0.311 | `g2-4-spec-lazy_desert4` | the specialist's own lap (lookahead changed nothing) | from logs only |
| desert4 | 22.083 | 21.750 | +0.333 | `g1-7-computed_desert4` | computed line, driven by the pure-pursuit controller | yes |
| desert4 | 22.133 | 21.750 | +0.383 | `g1-7-model_desert4` | human's line at the car model's speeds | yes |
| desert4 | 22.441 | 21.750 | +0.691 | `g1-7-human_desert4` | human's line and speeds, same controller | yes |
| winter4 (unseen) | 19.819 | 19.311 | +0.508 | `g2-4-gen_winter4` | generalist with lookahead | yes |
| desert3 (unseen) | 20.793 | 20.302 | +0.491 | `g2-4-gen_desert3` | generalist with lookahead | yes |
| summer3 (unseen) | 21.503 | 20.276 | +1.227 | `g2-4-gen_summer3` | generalist with lookahead | yes |
| winter4 (unseen) | 19.920 | 19.311 | +0.609 | `g2-3-explore_winter4` | generalist, explore from save states | yes |
| desert3 (unseen) | 20.976 | 20.302 | +0.674 | `g2-3-explore_desert3` | generalist, explore from save states | yes |
| summer3 (unseen) | 21.678 | 20.276 | +1.402 | `g2-3-explore_summer3` | generalist, explore from save states | yes |

g2-3 saved 47 more laps of its seed runs (`runs/g2-3-s*`, `-b*`, `-c*`, `-smoke`):
19.920 to 25.539 s on winter4, 20.976 to 25.781 s on desert3, 20.851 to
22.139 s on summer3. Two of them, `g2-3-s1_desert3` and `g2-3-s4_desert3`,
hold a plain-policy lap, not an explore lap. g1-3, g1-6, g2-1, g2-2 and g2-5
produced no lap under `runs/`.

On summer1 the best human lap is 22.131 s. The 22.279 s that older notes
call "the human" is a different, slower lap (the trainers' default
reference). Every comparison above uses 22.131 s.

### What to be careful with

Things that make a reported result weaker than it looks, collected from the
testers' notes and from reading the folders side by side:

- **The sub-human laps are small, late and from one run each.** 4 to 28 ms,
  all from the last 7 s, one random seed per track. On desert4, 18 of the
  28 ms came from one section and five of nine sections gave nothing; other
  desert4 runs gave 21.717, 21.726 and 21.728 s. The first 2 to 3 ms on
  desert4 and summer1 come from how the car is angled at the line, a one-off.
  The laps are real (independently replayed and verified), but the code has
  been fixed twice since (once by its author, after which only desert4 was
  rerun and gave the same 21.722 s; once by the tester), and a rerun of the
  other three is not shown to give the same times. g1-1's projection of 40 to 60 ms from a
  whole-lap pass is an extrapolation from late sections only.
- **g1-2's plan promises more than the stitch delivers.** The section table
  says 104 ms is on offer on summer1 and 468 ms on summer4; the stitch
  itself kept one switch on desert4 (20 ms) and nothing on the other three
  (summer4 produced no lap at all).
- **g2-4's "16 of 16 against 6 of 16" is at unequal cost.** One lookahead
  lap costs 9 to 39 plain laps of simulator time (mean 17). With that many
  retries the plain policy also finishes summer3 (5 of 5 runs) and usually
  desert3 (3 of 5). winter4 is the track where lookahead does something
  retries do not (plain: 0 of 8). Five seeds on a track are also five
  variations of one lap, not five independent attempts. The same holds for
  g2-3: the clear result is winter4 (8 of 8 against 0 of 8); desert3 (5 of 5
  against 3 of 5) is not clear, and summer3 is not a hard case.
- **"Unseen track" still means "with its human lap as the reference".** No
  result here is on a community track. g2-1's route is the only thing that
  needs no human lap, and nothing drives by it yet.
- **g2-1's rules were tuned on the same 17 tracks it is scored on**, two of
  the 17 routes are wrong (summer4, desert5), and its progress measure has
  an open defect: a car driving on the ground under a raised road is
  credited progress between gates (218 units in the tester's case). A
  learner rewarded on it would be paid for driving on the grass unless the
  environment ends the attempt when `overRoad` is false.
- **g1-7's braking-while-steering numbers are wrong** as a function of speed
  (31% off at 216 km/h). The rest of the car model was confirmed within 2%.
  Its verdict stands: the computed line is not faster than the human on
  desert4 (22.083 s against 21.750 s), and the spread between controller
  settings is ten times the gap between the lines.
- **g1-4's gains are against the specialist's own lap (22.061 s), not the
  human.** From the existing 21.907 s lap the beam found nothing. Its three
  ranking methods were compared on one run each.
- **g1-3 has never run a round.** Everything confirmed about it is from dry
  runs on stand-in checkpoints; its training step is an hour of GPU.
- **g2-5's crash-repeat figures do not come from the command its README
  prints** (the figures are seed 2, the command runs seed 1; on summer3 the
  finding holds for one seed of two). Nothing has been trained.
- **g2-2's "54 of 54 tracks driven" was not re-driven as such** (the tester
  drove 17 and replayed 20 saved laps, all fine). Some numbers in its
  README's body are stale after two fixes by the tester.

## The ideas

Commands are run from the project root. "Left" is the main thing not done.

### Goal 1: beat the human lap on one track

**g1-1 human-seed search** — `ideas/g1-1-human-seed-search/`
Start from the human's exact keys and change one key timing at a time inside
a short section, from a save state, keeping a change only if the lap driven
to the finish is faster (measured to a fraction of a tick).
`node ideas/g1-1-human-seed-search/search_human.mjs desert4 seconds=100 last=7000 out=smoke`
Result: desert4 21.722, winter2 26.816, summer4 34.100, summer1 22.127 s,
each faster than the best human lap, each from 100 s on two processes.
Left: the first two thirds of every lap were never searched. A whole-lap run
on 8 processes is about 4 to 8 minutes per track and is the obvious next step.

**g1-2 stitch human laps** — `ideas/g1-2-stitch-human-laps/`
Plan which of the ten human laps to follow in each 250 ms section, switch
where two laps pass through nearly the same car state, and repair the car
back onto the new lap's path with small key corrections.
`node ideas/g1-2-stitch-human-laps/stitch_laps.mjs desert4 joins=4`
Result: desert4 21.730 s (20 ms under the human) from one switch. No gain on
winter2 or summer1; no finished lap on summer4.
Left: judging a switch by the finish time instead of 2 s ahead; a fallback
when the car loses the path; the other 13 tracks.

**g1-3 search-train rounds** — `ideas/g1-3-search-train-rounds/`
A driver that repeats "search, train the specialist toward the searched lap,
search again" unattended, carries the fastest verified lap forward, stops
when rounds stop paying, and resumes after a shutdown.
`node ideas/g1-3-search-train-rounds/rounds.mjs desert4 rounds=3 base=rl/checkpoints/ppo_sr1_desert4.u800.pt lap=runs/rollout_desert4.recording.json,runs/rollout_r1_desert4.recording.json`
(add `dry=1` to see what it would do without running anything)
Result: none yet. Restart logic, lap verification, the copy-picking rule and
the lock were confirmed in dry runs; no round has been run.
Left: run it. One round is 50 to 60 minutes with the GPU and 8 simulators.

**g1-4 beam search** — `ideas/g1-4-beam-search/`
Keep many partial laps alive as save states, extend each by one 50 ms
decision several ways, rank and prune, and drive the top few to the finish
every second of lap for a real time.
`node ideas/g1-4-beam-search/beam.mjs desert4 start=120 depth=160 beam=8 out=g1-4-smoke`
Result: desert4 21.997 s, 64 ms faster than the specialist's own 22.061 s,
from 2 s of the lap. Not faster than the 21.907 s searched lap or the human.
Left: a whole-lap run on 8 processes (7 to 9 minutes); a ranking measure
that predicts finish time (none of the cheap ones does: agreement 0.35 to
0.54).

**g1-5 fine key timing** — `ideas/g1-5-fine-key-timing/`
Move each key change of a finished lap to its best millisecond by driving
every time in a window around it from a save state to the finish.
`node ideas/g1-5-fine-key-timing/refine.mjs human:0 track=desert4 from=17750 window=10 seconds=90 name=g1-5-smoke-human`
Result: the best human desert4 lap 21.750 → 21.722 s by re-timing its last
4 s. The existing searched lap (21.907 s) gained nothing.
Left: it only works in the last 4 to 8 s of a lap; earlier, a 1 ms move
grows into a crash. It needs a repair step after an early move, not written.

**g1-6 off-policy learner** — `ideas/g1-6-offpolicy-rl/`
An IQN learner (as Trackmania's Linesight used) with n-step returns and a
replay buffer, rewarded on distance gained and nothing else.
`.venv/Scripts/python ideas/g1-6-offpolicy-rl/train_iqn.py --track desert4 --save-laps`
Result: none. The pieces are tested (reward is progress only, Node and
PyTorch pick the same action, replay arithmetic); no training run was made.
Left: train it. An estimated 10 to 50 million decisions, 3.5 to 17 hours on
8 simulators with the machine as busy as tonight.

**g1-7 computed racing line** — `ideas/g1-7-computed-racing-line/`
Fit a model of the car on a flat pad, measure the road's width around a lap,
and compute the fastest line and speeds the model allows.
`node ideas/g1-7-computed-racing-line/drive_line.mjs desert4 computed crossTrackGain=2 lookaheadPerKmh=0.06`
Result: the answer is no on desert4: 22.083 s driven, 0.333 s slower than
the human. The useful output is the car model (acceleration, braking and
turning limit against speed, confirmed within 2%) and the flat test pad.
Left: nothing worth doing on the line itself; the car model can bound speeds
for a planner or prune a search.

### Goal 2: a generalist for any track

**g2-1 reference-free inputs** — `ideas/g2-1-reference-free-inputs/`
A route found from the track's geometry alone, progress along it, and a
334-number observation that uses no human lap.
`node ideas/g2-1-reference-free-inputs/validate.mjs`
Result: a route through every gate on 17 of 17 official tracks; on 15 its
progress keeps step with the fastest human lap (never drops more than 1
unit, longest stall 0.4 s). Wrong on summer4 and desert5.
Left: nothing drives the route and no policy has been trained on the
observation. Switching `rl/racing_env.mjs` to it is eight listed changes
(below). One open defect (progress under a raised road).

**g2-2 track generator** — `ideas/g2-2-track-generator/`
Random valid tracks from 16 of the game's narrow-road pieces, each with its
centre line and a finishing lap from a scripted follower.
`node ideas/g2-2-track-generator/generate.mjs --count 20 --seed 500 --length 600 --difficulty mixed --out ideas/g2-2-track-generator/tracks/sample`
then `node ideas/g2-2-track-generator/drive_folder.mjs --dir ideas/g2-2-track-generator/tracks/sample`
Result: every generated track driven was finished by the follower (the
author counts 54 of 54; the tester drove 17 fresh ones and replayed 20 saved
laps). 0.21 s per track to generate, 3.2 s to drive.
Left: no jumps, wide roads, banked turns or loops, so the tracks are easier
than official ones; the training environment cannot open a generated track
until `sim/env.mjs` `loadTrack` accepts one (three lines, below).

**g2-3 explore and adapt** — `ideas/g2-3-explore-and-adapt/`
On a new track, restart from a save state a little before where the furthest
attempt ended and try varied continuations until a lap finishes, then
fine-tune on that lap.
`node ideas/g2-3-explore-and-adapt/explore.mjs winter4`
Result: a finished lap within 10 laps of simulated driving in 8 of 8 runs on
winter4 (plain retries: 0 of 8), 5 of 5 on desert3 (plain 3 of 5), 5 of 5 on
summer3 (plain 5 of 5).
Left: the "adapt" half. The fine-tune is a printed command list, about 10
minutes per track with the GPU, never run.

**g2-4 lookahead driving** — `ideas/g2-4-lookahead-driving/`
Every 0.5 s, save the simulator and drive the policy's own choice 2 s ahead;
if that crashes, try 24 alternatives and commit to the best; back up as far
as 3 s out of dead ends.
`node ideas/g2-4-lookahead-driving/drive.mjs winter4 actor=rl/checkpoints/ppo_blkgen.best2.actor.bin seeds=10 out=gen`
Result: 16 of 16 laps finished on desert3, summer3 and winter4 against 6 of
16 for the policy alone on the same seeds, at 9 to 39 times the simulator
time of a plain lap.
Left: it still needs a human lap; the finished laps have not been used as
training examples.

**g2-5 memory policy** — `ideas/g2-5-memory-policy/`
The environment keeps a per-track map of what earlier attempts did (where
they crashed, at what speed) and shows the policy that map for the road
ahead as 130 extra inputs.
`node ideas/g2-5-memory-policy/attempts.mjs track=desert3 policy=rl/checkpoints/ppo_blkgen.best2.actor.bin attempts=5 sessions=3 sample=1 seed=2`
Result: none for the idea itself. Measured with the present generalist: on
desert3 it crashes at the same three places attempt after attempt (15 of 15
crashed, seed 2), which is what a memory could use. The plumbing is tested;
a warm-started 482-input network reproduces the 352-input one.
Left: train it (2 to 4 hours for a first experiment), after eleven listed
changes to the training code. One known defect in the session-end flag.

## Shared code

`ideas/shared/` holds what several ideas use; `ideas/shared/CONTRACT.md` is
its reference, and ends with the facts the agents measured (the drivable
ground at height 0, why `RacingEnv` is 3 to 7 times slower than the bare
simulator, which tracks the generalist has seen, and others).
`ideas/shared/REQUESTS.md` records each agent's request and what was decided.

In the consolidation after the ideas were finished:

- Promoted to shared (the code stays in its idea folder; other folders
  import the shared file): the fitted car model and test pad (g1-7), the
  track encoder, piece table and generator (g2-2), route-based progress
  (g2-1, as a second measure beside the coarse one, with its failures
  stated), the lookahead driver (g2-4), lap paths and the follow-with-repair
  helper (g1-2), the multi-lap imitation-example builder (g1-3), and the
  "is there road under the car" check a tester wrote.
- Duplicates removed: three copies of the seeded random generator; and three
  folders now start worker processes through one shared pool in which a
  worker that throws is reported instead of leaving the search waiting for
  ever.

## Tests

Every folder has `tests/run_tests.mjs`, written by a tester who did not
write the folder's code. One command runs them all, one after another:

```
node ideas/run_all_tests.mjs
```

Last run (after the consolidation, with training running on the machine):

```
ok     shared                          193 passed    0 failed   0 known    120 s
ok     g1-1-human-seed-search           76 passed    0 failed   0 known     81 s
ok     g1-2-stitch-human-laps           93 passed    0 failed   0 known    148 s
ok     g1-3-search-train-rounds        220 passed    0 failed   0 known    318 s
ok     g1-4-beam-search                147 passed    0 failed   0 known    165 s
ok     g1-5-fine-key-timing            100 passed    0 failed   0 known     55 s
ok     g1-6-offpolicy-rl               157 passed    0 failed   0 known    116 s
KNOWN  g1-7-computed-racing-line       220 passed    0 failed   3 known     63 s
KNOWN  g2-1-reference-free-inputs      156 passed    0 failed   1 known     65 s
ok     g2-2-track-generator            144 passed    0 failed   0 known    119 s
ok     g2-3-explore-and-adapt           94 passed    0 failed   0 known    119 s
ok     g2-4-lookahead-driving          170 passed    0 failed   0 known     92 s
KNOWN  g2-5-memory-policy              114 passed    0 failed   1 known     56 s

13 folders: 1884 passed, 0 failed, 5 known failures, 25.3 minutes

Known failures (written up in each folder's tests/TESTING.md, left in place):
  g1-7-computed-racing-line: KNOWN FAIL car_model.json: the turning limit is stored finely enough to be good to 0.5% at 500 km/h | stored as 0.0035: 4 decimals is +-1.4% at 500 km/h (and +-0.6% at 300)
  g1-7-computed-racing-line: KNOWN FAIL turning: S+A from 300 km/h, the deceleration 0.5 to 0.8 s in matches car.brake(v, 1) within 15% | measured -31.1 at 216 km/h, model -21.6 units/s^2 (-31%)
  g1-7-computed-racing-line: KNOWN FAIL line file: the computed line starts where the car starts (shift 0 at the first point) | shift at point 0 is -0.59 units
  g2-1-reference-free-inputs: KNOWN FAIL under the road: no progress is credited for distance driven on the ground beneath the road | 218 units of progress credited while under the road (progress reached 250 of 457); only the gate
  g2-5-memory-policy: FAIL (known defect) refLaps: every attempt that is followed by a cleared memory was flagged sessionEnd
```

The exit code is 1 because of the five known failures; nothing else failed.
"Known" failures are defects a tester found, wrote up in that folder's
`tests/TESTING.md` and left failing on purpose, because the fix is the
author's decision.

## Changes needed elsewhere

Nothing outside `ideas/` was edited, because training was running from
`sim/`, `rl/` and `scripts/`. These are the changes the folders ask for,
grouped by the file they touch. The first three unblock the most.

**`rl/racing_env.mjs`**
- `stepBlock`: send a 50 ms block to the simulator as one step with the key
  switches inside it, not five 10 ms steps. Five messages cost 11.4 ms per
  decision against 2.5 ms for one (g1-6); three folders measured the same
  slowdown. This would speed up every block-decision training run and
  search by roughly 3 to 4 times. Rewards and cut-offs would then be worked
  out per block. (g1-4, g1-6, g2-4)
- A reference-free mode (`reference: 'route'`) built on g2-1: in `create()`,
  `_locate()`, `_observe()` and `_info()` use the route and its observer;
  `OBS_SIZE` 352 → 334; `paceReward: 0` and the lane cost off or rewritten;
  `off line` at about 80 units or dropped; `off track` becomes
  `at.grounded && !at.overRoad`; `maxTicks` from the route's length; only
  start-line and own-state starts on a track with no lap. Eight items,
  spelled out in g2-1's README. Existing checkpoints do not fit the new
  input size. (g2-1; g1-6 asks for the same ruler)
- `save()`: use the base name when the track is a file path. (g2-2)
- An option to end an attempt on a hard body contact or a collapse in speed,
  so a search does not pay 2 s for every wall. (g2-3)
- A switch to skip the shaped reward terms. Small saving. (g1-6)

**`sim/env.mjs`**
- `loadTrack(name)`: when `name` ends in `.track.json`, read that file and
  return its `trackData`. Three lines; without them no training environment
  can open a generated track. (g2-2)

**`sim/pool.mjs`** (done, 16 October 2026)
- Reject a request when its child exits, and keep the child's last error
  lines. `ideas/shared/pool.mjs`'s version replaced it, and that file now
  re-exports it. (found by the testers of g1-1 and g1-5)

**`sim/search.mjs`**
- `mutate()` can move a key flip up to 20 ticks outside the window it was
  given (236 of 1000 mutations). Callers that mutate after a save state must
  filter; clamping inside `mutate()` would fix it for all. (g1-1's tester)

**`sim/sectional.mjs`, `scripts/search_sections.mjs`**
- Could use g1-1's sub-tick measure (`rejoin()` in its `section_worker.mjs`)
  in place of the nearest-tick distance, which adds up to 0.6 ms of penalty
  to a car exactly on the old line. Suggestion. (g1-1)

**`sim/worker_entry.mjs`**
- A save state that can be sent to another simulator process, so a beam can
  be shared across processes. (g1-4)

**`rl/train_ppo.py`**
- `--resume` continues the weights but not the run: `--total-steps`, the
  learning-rate line, `--critic-warmup` and the `.u<update>.pt` names all
  count from the start of the process, so a resumed run is a new stretch
  (the shell wrappers now resume instead of starting over; see below). A
  `--target-steps` (stop at this step count, schedule over the whole run)
  would make an interrupted run resume exactly where it stopped. (g1-3)
- `--ref-file` is one file for every track; training on a folder of
  generated tracks needs one per track (the `.lap.json` beside each). (g2-2)
- For the memory policy: `--memory`, `--session-max`; pad `--bc-data`
  examples from 352 to 482 inputs; optional `--carry`; finish rate by
  attempt number in the progress line. (g2-5)
- Everything that fixes the input size follows `OBS_SIZE` if the
  reference-free observation is adopted. (g2-1)

**`rl/env_server.mjs`, `rl/polytrack_env.py`**
- Accept the memory options, create `MemoryEnv` when `memory` is given, use
  the environment's own input count in place of the constant `OBS_SIZE`
  (three places), and return `sessionEnds` from `rollout`; decode it in
  `polytrack_env.py`. (g2-5)

**`rl/rollout_child.mjs`, `rl/env_server.mjs`** (done, 16 October 2026)
- Both carried a private copy of the policy network code. The code of
  `ideas/shared/policy.mjs` is now `rl/policy.mjs`, both use it, and the
  shared file re-exports it; each keeps its own order of additions, so no
  result changed by a bit. The hidden width is read from the file. (shared;
  g2-5 needs the input count, which `loadNet` takes as `obsSize`)

**`rl/evaluate.py`, `scripts/eval_generalist.sh`**
- Evaluate in sessions of several attempts, for a memory policy. (g2-5)
- `evaluate.py` always saves a 1.4 MB lap file; make it optional. (g1-3)

**`scripts/search_rollout.mjs`**
- Write the best lap as it goes (it writes only at the end, which is how
  winter2's round-1 result was lost) and accept `start=<lap>` to continue
  from one. (g1-3)
- Optionally keep the near-best finished candidates, as extra training
  examples. (g1-3)

**`scripts/train_block_specialist_from.sh`, `scripts/search_round.sh`**
- (done, 16 October 2026) `train_block_specialist_from.sh` copied the base
  checkpoint over the working one every time it started, so rerunning
  `search_round.sh` after an interruption threw away the practice done. It
  now copies only when the working checkpoint does not exist, so a rerun
  continues from the last save as a new stretch (fresh learning-rate fade,
  kept copies renumbered). (g1-3)
- Take the checkpoint name as given (it forces `ppo_<prefix>_<track>.pt`).
  (g2-3)

Files the folders wrote outside `ideas/`, all new and none replacing an
existing file: the laps under `runs/` listed above (names start with the
idea's id); `rl/checkpoints/ppo_blkgen.best2.actor.bin` and `.critic.bin`,
`rl/checkpoints/ppo_sr1_desert4.u800.critic.bin` (exports of existing
checkpoints); `rl/checkpoints/g2-3-bc_winter4.npz`.

## Overnight results, 10 October 2026 (added by the main session)

Run after the sections above were written, on the idle machine.

**Search from the human's lap (g1-1), two whole-lap passes of 20 minutes per
track on 8 processes.** All four pass the game's Verify and are rejected one
tick sooner. Laps: `runs/g1-1-full2_<track>.recording.json` (copies in
`ideas/g1-1-human-seed-search/out/`).

| Track | Best human | Smoke test | Pass 1 | Pass 2 | Under the human by |
| --- | --- | --- | --- | --- | --- |
| desert4 | 21.750 s | 21.722 s | 21.710 s | 21.709 s | 41 ms |
| winter2 | 26.830 s | 26.816 s | 26.793 s | 26.775 s | 55 ms |
| summer1 | 22.131 s | 22.127 s | 22.107 s | 22.104 s | 27 ms |
| summer4 | 34.105 s | 34.100 s | 34.087 s | 34.069 s | 36 ms |

Pass 2 added 1 to 3 ms on desert4 and summer1, so those two are close to what
this search finds; winter2 and summer4 still gained 18 ms each.

**Off-policy learner (g1-6), first real run: desert4, GPU, 6 simulators, 3
hours, 9.2 million decisions, from scratch.** Reward is distance along the
track only; no imitation start. Log: `runs/g1-6-iqn_desert4.log`; checkpoints
`rl/checkpoints/g1-6-iqn_desert4.pt` and `.best.pt`.

| Decisions | Best lap from the start line, no exploring |
| --- | --- |
| 0.46 M | 26.70 s |
| 1.04 M | 23.97 s |
| 2.15 M | 22.75 s |
| 3.4 M | 22.23 s |
| 6.3 M | 22.02 s |
| 9.2 M | 21.957 s |

For comparison the PPO specialists drive 22.0 to 22.1 s after an imitation
start and about 100 million decisions of generalist training, and the human
lap is 21.750 s. The learner's laps still vary from run to run (22.07 to
22.33 s over the last four checks), and the run was stopped by the clock, not
because it had levelled off. The GPU was the limit (95% of the time spent
learning, about 760 decisions per second). No lap from this run has been
exported or put through Verify yet.

**Search-then-train, round 2 (`scripts/search_round.sh`).** Searched laps
after round 2 against round 1: desert4 21.880 s (was 21.907), summer4 34.505
(34.500), summer1 22.371 (22.334), winter2 27.031 (27.020). Only desert4
improved, so no third round was run.
