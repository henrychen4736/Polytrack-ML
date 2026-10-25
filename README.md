# Polytrack-ML

Local ML and search for fast PolyTrack 0.6.3 laps, run against the game's own
physics headlessly in Node. Nothing here talks to Kodub's leaderboard server:
bot runs are for local ghosts only and must not be submitted.

## Where things stand (18 October 2026)

Two goals: a lap faster than the best human lap on at least one track, and a
generalist that can drive any track after a few attempts.

**Faster than the best human lap, on five tracks, all by search.** Every lap
below passes the game's own Verify on its tick and is rejected one tick
sooner. On desert4 the search now also beats the human starting from a lap a
model drove, not only from the human's lap.

| Track | Best human | Best lap here | Faster by | How | File |
| --- | --- | --- | --- | --- | --- |
| desert4 | 21.750 s | 21.709 s | 41 ms | human lap re-timed at 1 ms (g1-1) | `runs/g1-1-full2_desert4.recording.json` |
| desert4 | 21.750 s | 21.720 s | 30 ms | IQN learner's 21.792 s lap re-timed (g1-1, two 20-minute passes) | `runs/g1-1-iqnseed2_desert4.recording.json` |
| winter2 | 26.830 s | 26.775 s | 55 ms | human lap re-timed (g1-1) | `runs/g1-1-full2_winter2.recording.json` |
| summer1 | 22.131 s | 22.104 s | 27 ms | human lap re-timed (g1-1) | `runs/g1-1-full2_summer1.recording.json` |
| summer4 | 34.105 s | 34.069 s | 36 ms | human lap re-timed (g1-1) | `runs/g1-1-full2_summer4.recording.json` |
| winter5 | 18.425 s | 18.374 s | 51 ms | sections of several human laps joined (g1-2) | `ideas/g1-2-stitch-human-laps/out/winter5.result` |

The four g1-1 laps from the human's lap were re-verified on 17 October on the
current code at the same ticks.

**Laps a model drives by itself** are still behind the human:

| Method | desert4 | winter2 | Notes |
| --- | --- | --- | --- |
| Off-policy learner (IQN), from nothing | **21.792 s** | 26.997 s | desert4: levelled off by 39M decisions; winter2: 12M decisions, 99 of the last 100 training episodes finished |
| IQN with no human lap in its inputs (`--reference route`) | 21.846 s | | 100 of 100 training episodes finish |
| PPO specialist + model-guided search | 21.880 s | 27.009 s | search-then-train has stalled |
| PPO specialist alone | 22.0 to 22.1 s | | imitation start, inherits from the generalist |
| Best human | 21.750 s | 26.830 s | |

IQN alone is 42 ms short on desert4. Re-timing its laps by search gains 46 to
72 ms (desert4 21.792 to 21.720 s, winter2 26.997 to 26.927 s, route IQN
21.846 to 21.800 s).

**Generalist.** The block-decision generalist (`ppo_blkgen.best2.pt`) was
trained on 14 tracks. It finishes 132 of 140 attempts on those and 7 of 30
on the three it has not seen (desert3, summer3, winter4). Exploring from save
states, then ten minutes of practice towards the lap found (g2-3), takes it
to 10, 8 and 9 of 10 there; this still needs each track's human lap. The
first generalist with no human lap in its inputs (`ppo_g2-1-route`) finishes
90 of 170, none on the held-out three. Continued on 40 generated tracks with
jumps, banked turns and wide roads (`ppo_g2-2-route-gen`), it finishes 71 of
100 attempts on 10 generated tracks it never saw (15 of 100 before), still 0
of 30 on the held-out official three. The generated tracks are easier than
official ones. No community track is in the repository, so none has been
tried.

The fuller write-up, with every idea's result and what is left, is
[`ideas/README.md`](ideas/README.md); every model trained is in
[`docs/model-history.md`](docs/model-history.md).

## Race the best model

Play a track in the real PolyTrack client against two ghosts: the project's
best generalist (`models/ppo_blkgen.best2.actor.bin`, included, so nothing
needs training) and the fastest human lap on the public leaderboard. Needs
Node 20+ and Microsoft Edge; no Python, no GPU.

```bash
npm install
npm run setup                        # the simulator files (see Setup below)
npm run capture                      # what the client sends its physics worker, into data/
node scripts/fetch_laps.mjs desert4  # the track's top public laps, into data/laps/ (read only)
npm run race -- desert4              # any official track: desert1..5, summer1..7, winter1..5
```

The first race on a track lets the model drive it in this project's headless
copy of the game's physics, checks the lap with the game's own Verify and
keeps it in `runs/race-generalist_<track>.recording.json` (5 to 30 s; later
races reuse it, `--redo` drives again). Then the client opens in a
temporary Edge window. On the track's page, the leaderboard on the left
holds "Best human" (blue) and "Best generalist (bot)" (orange): click them
to pick them as opponents, then press Play. Watch replays a picked ghost.

On desert4 the model's lap is 22.090 s against the human's 21.750 s. The
generalist finishes 132 of 140 attempts on the 14 tracks it trained on but
only 7 of 30 on desert3, summer3 and winter4; where none of its 11 tries
finishes, only the human ghost is shown.

Nothing reaches Kodub's server: the window's profile is thrown away on
close, the leaderboard and ghosts are answered on your machine, and every
other request, uploads included, is blocked (`scripts/game_client.mjs`).
Don't copy a bot lap into the game in your normal browser; it would upload it.

## Setup

```bash
npm install
npm run setup     # clones polyrl at a pinned commit into vendor/, checks game file hashes
npm test          # both acceptance tests below
```

Needs Node 20+. `npm run capture` additionally needs Microsoft Edge.

### Getting the data

The code needs two things that are deliberately not published here:

- `data/init_0.6.3.json` and `data/createcar_<track>.json`: what the real
  game client sends its physics worker. `npm run capture` regenerates them in
  headless Edge with `vps.kodub.com` blocked.
- `data/laps/<track>.json`: the ten fastest leaderboard laps per track, used
  as reference laps. `node scripts/fetch_laps.mjs` downloads them. It is the
  only script here that contacts Kodub's server, and it only reads.

Files derived from those laps (`ideas/g1-1-human-seed-search/out/`,
`ideas/g1-7-computed-racing-line/out/`) are not published either; the scripts
in those folders recreate them.

Training needs Python with PyTorch. The project's `.venv` has the CUDA build;
use `.venv/Scripts/python` and `--device cuda` to train on the GPU.

## Layout

- `sim/`: the headless simulator. `host.mjs` boots the unmodified simulation
  worker with the `Init` payload captured from the real client;
  `worker_entry.mjs` adds an eager pump and save states; `env.mjs` is `Env`
  with `reset`, `step`, `replay`, `saveState` and `loadState` (one 227-byte
  state per 1 ms tick); `state.mjs` decodes the car state; `recording.mjs` is
  the lap codec; `pool.mjs` runs simulators in separate processes;
  `trackmesh.mjs` gives track geometry and ray casts.
- `rl/`: reinforcement learning. `racing_env.mjs` is the training environment
  (observation, reward, block decisions, mark and rewind); `env_server.mjs`
  serves it to Python; `train_ppo.py` is the PPO trainer; `evaluate.py` tests
  a checkpoint; `pretrain_bc.py` and `lap_bc.py` make imitation examples. See
  [`rl/README.md`](rl/README.md).
- `scripts/`: searches, training wrappers and tools (see below).
- `ideas/`: twelve separate approaches, each in its own folder with a README
  and tests, plus `ideas/shared/` for code they have in common.
- `data/`: messages the real client posted to its worker, and human laps
  (`data/laps/<track>.json`, ten per track). **Not in this repository**: it is
  Kodub's geometry and other players' laps, which are not ours to
  redistribute. See "Getting the data" below.
- `runs/`, `rl/checkpoints/`: results and model files. Both are git-ignored.
- `models/`: the one model published with the code, the best generalist's
  actor (`ppo_blkgen.best2.actor.bin`, 647 KB), for `npm run race`.
- `graphify-out/`: a knowledge graph of the code. Ask it with
  `graphify query "<question>"`; refresh it with `graphify update .`.

## Acceptance tests

1. `npm run test:verify`: 27 real leaderboard recordings (5 on summer1, 22 on
   winter1) pass the worker's own `Verify` on their exact claimed frame.
2. `npm run test:determinism`: one summer1 run gives the same state stream in
   two separate processes, and the same stream whether fed as a recording or
   stepped live through `Env.step`.

The ideas have their own tests, written by agents that did not write the code
under test. Last full count (17 October 2026): 1885 checks pass, 4 known
failures documented in each folder's `tests/TESTING.md`. Since 18 October 4
more fail (the runner still reports them as failed, not known; they are
written up in those folders' `tests/TESTING.md`): 3 in g2-4, because one-message
`stepBlock` runs the rest of a block when an episode ends mid-block, and 1 in
g2-3, because the real fine-tune wrote `g2-3-adapt*` checkpoints. Whether to
update those expected values is not decided.

```bash
node ideas/run_all_tests.mjs    # every folder, one after another, about 25 minutes
```

## Driving and watching a lap

```bash
node scripts/drive_baseline.mjs summer1     # pure-pursuit lap, saves runs/baseline_summer1.json
node scripts/export_recording.mjs summer1   # encodes it as a recording and runs the game's Verify
node scripts/watch_ghost.mjs summer1        # opens the real client on the track page with the lap loaded; click Watch
node scripts/search_timeline.mjs summer1 seconds=120   # mutate key timings, saves runs/search_summer1.recording.json
node scripts/watch_ghost.mjs summer1 search # watch the searched lap
node scripts/search_settings.mjs summer1 seconds=120   # tune the controller's settings, saves runs/tuned_summer1.json
node scripts/export_recording.mjs summer1 tuned        # encode + Verify the tuned lap
node scripts/watch_ghost.mjs summer1 tuned             # watch it
```

`watch_ghost.mjs` uses a temporary Edge profile with `vps.kodub.com` blocked.
Never put a bot recording into localStorage in a normal browser: the client
uploads any stored lap that beats the server's copy.

## Training a specialist

A specialist is a PPO policy for one track. It makes one "block decision" per
50 ms: for each of steering, W and S, what the key should be at the end of the
block and in which 10 ms slice it changes.

```bash
# Start from the generalist and practise on one track (about 45 minutes)
sh scripts/train_block_specialist_from.sh desert4 rl/checkpoints/ppo_blkgen.best2.pt

# Test the kept copies: ten attempts each plus one with top choices only
PREFIX=gblk sh scripts/eval_block_specialist.sh desert4
```

A run can get worse as well as better, so copies are kept every 200 updates
and the one to use is chosen by the ten-attempt test, not assumed to be the
last.

## Searching for a faster lap

```bash
# From the human's lap, at 1 ms key timing (the method behind the table above)
node ideas/g1-1-human-seed-search/search_human.mjs desert4 seconds=1200 workers=8 out=full

# The same search from a model's lap (how 21.720 s was found from IQN's lap)
node ideas/g1-1-human-seed-search/search_human.mjs desert4 seed=runs/g1-6-iqn-s3best_desert4.recording.json seconds=1200 workers=8 out=iqnseed

# From a specialist's lap: change a decision, let the policy drive the rest,
# keep it only if the lap finishes sooner
.venv/Scripts/python rl/export_actor.py rl/checkpoints/ppo_gblk_desert4.final.pt
node scripts/search_rollout.mjs desert4 actor=rl/checkpoints/ppo_gblk_desert4.final.actor.bin seconds=600 passes=1

# One round of "train the specialist towards the searched lap, then search again"
sh scripts/search_round.sh desert4 rl/checkpoints/ppo_gblk_desert4.final.pt runs/rollout_desert4.recording.json r1
```

The search-then-train loop gained up to 189 ms in its first round and almost
nothing in its second; a third round (`ideas/g1-3-search-train-rounds/rounds.mjs`)
gained only on winter2 (27.020 to 27.009 s), so it has stalled as built.

## The off-policy learner

`ideas/g1-6-offpolicy-rl/` is a separate learner (IQN with a replay buffer)
rewarded on distance along the track only, with no imitation and no reward
for matching the human.

```bash
# From nothing (each run is one stretch; the learning rate fades to --lr-end)
.venv/Scripts/python -u ideas/g1-6-offpolicy-rl/train_iqn.py --track desert4 --envs 6 --device cuda --total-decisions 12000000

# Another 2-hour stretch of an existing run, saving each new best lap
.venv/Scripts/python -u ideas/g1-6-offpolicy-rl/train_iqn.py --track desert4 --envs 6 --device cuda --resume --save-laps --total-decisions 6000000 --lr 1e-4 --lr-end 0

# With no human lap in its inputs (progress measured along the g2-1 route)
.venv/Scripts/python -u ideas/g1-6-offpolicy-rl/train_iqn.py --track desert4 --envs 6 --device cuda --reference route --total-decisions 12000000

# Drive the lap that set a best, from the start line
.venv/Scripts/python ideas/g1-6-offpolicy-rl/eval_lap.py rl/checkpoints/g1-6-iqn_desert4.best.pt --actor rl/checkpoints/g1-6-iqn_desert4.best.actor.bin
```

Results (all laps verified):

- desert4, six stretches to 39.2M decisions: 21.977 s at 9.2M, **21.792 s**
  by 21.2M (stretch 3), then nothing faster (end-of-stretch networks 21.838,
  21.811, 21.909 s). Levelled off at these settings.
- `--gamma 0.995`, one stretch from stretch 3: best 21.808 s, no gain.
- `--slices 5` (60 actions, 10 ms key timing), from nothing, 12M decisions:
  best 21.956 s, no gain.
- winter2 from nothing, 12M decisions: 26.997 s, 99 of the last 100
  training episodes finished; the best any model had driven there.
- `--reference route` on desert4: the first run reached 22.041 s, but 80 to
  97 of every 100 training episodes ended 'off line' at 100% of the route,
  because passing beside the finish box was credited the whole route. After
  the route-mode finish fix (`finishHold` 20, `missedFinish` 10 in
  `rl/racing_env.mjs`) the rerun reached **21.846 s** with 100 of 100
  finishing (`rl/checkpoints/g1-6-iqn-route2_desert4.pt`).

The GPU is its limit, not the simulators. Its laps make good seeds for the
g1-1 search (`search_human.mjs <track> seed=<recording>`): see the table at
the top.

## The twelve ideas

Each folder under `ideas/` has its own README with commands and numbers.

| Folder | What it is | Result so far (18 October 2026) |
| --- | --- | --- |
| `g1-1-human-seed-search` | Search from a lap at 1 ms key timing | Under the human on four tracks from the human's lap; desert4 21.720 s from IQN's 21.792 s lap |
| `g1-2-stitch-human-laps` | Join the best sections of several human laps | All 17 tracks: beats the human on desert4 (21.730 s) and winter5 (18.374 s) |
| `g1-3-search-train-rounds` | Unattended, restartable search-then-train rounds | Round 3 gained only on winter2 (27.009 s); stalled |
| `g1-4-beam-search` | Keep many partial laps alive at once | Does not beat the existing search; whole-lap desert4 run no gain (21.880 s) |
| `g1-5-fine-key-timing` | Re-time each key press to the millisecond | desert4 21.722 s from the human lap; no change on the 21.720 s lap |
| `g1-6-offpolicy-rl` | Off-policy learner, distance-only reward | desert4 21.792 s, winter2 26.997 s, desert4 with no human lap 21.846 s |
| `g1-7-computed-racing-line` | Racing line from a fitted car model | Not faster than the human; the car model is reusable |
| `g2-1-reference-free-inputs` | Route, progress and inputs with no human lap | PPO route generalist 90 of 170, 0 of 30 held out |
| `g2-2-track-generator` | Random tracks from the game's pieces | Jumps, banks, wide roads; route generalist 71 of 100 on unseen generated tracks |
| `g2-3-explore-and-adapt` | Retry from save states, then practise on an unseen track | 10, 8 and 9 of 10 on winter4, desert3, summer3 after 10 minutes |
| `g2-4-lookahead-driving` | Try alternatives when the policy would crash | Finishes all three unseen tracks, at 9 to 39 times the cost |
| `g2-5-memory-policy` | Inputs that remember earlier attempts | Trained; no effect (2 of 150 with memory, 0 of 150 without) |

## What is next

1. Combine the two things that work: IQN on the route inputs over generated
   tracks plus official ones (a generalist that learns per decision far
   faster than PPO), then g2-3-style explore and adapt on unseen tracks.
2. A community track: Henry to add one to the repository by hand (the
   no-network rule forbids fetching one).
3. desert4 by a model alone: IQN is 42 ms short. The search gains 70 to 72 ms
   from human-reference IQN laps, so a model whose own lap is about 20 ms better would do it.
4. The route generalist: fix the summer4 and desert5 routes and teach the
   route to take banked walls (desert2, summer5).

Done since the 10 October list: the off-policy learner was run to 39.2M
decisions on desert4 and its laps verified (21.792 s); one message per block
decision in `rl/racing_env.mjs` (17 October: identical results, 1.2 to 1.3
times faster); a generalist on the inputs with no human lap
(`ppo_g2-1-route`, `ppo_g2-2-route-gen`).

## Things that were not obvious

- polyrl's `physics_assets.json` is off by one float32 ULP on 164 of 186 parts
  and on the car hull. With it, only 2 of the 27 recordings verify. Always boot
  from the captured `Init`.
- On Windows, git's `autocrlf` rewrites the vendored worker bundle. `npm run
  setup` clones with it off.
- The state buffer is variable-length and reused, so bytes past
  `stateLength()` are stale. Compare or hash only the written prefix.
- The stock non-realtime loop polls on a timer, which cost about 9 ms per
  `step` call on Windows. `sim/worker_entry.mjs` runs the same loop eagerly.
- Simulator threads inside one Node process do not scale past about two, so
  searches score laps in separate processes (`sim/pool.mjs`).
- Mountains made no difference on summer1 or winter1. Tracks without a capture
  in `data/` run with none, which is only safe if the car cannot reach the
  backdrop terrain.
- The best human lap on summer1 is 22.131 s (`data/laps/summer1.json`, lap 0),
  not the 22.279 s lap in polyrl's fixtures.
- The world has drivable ground at height 0. A progress measure based on
  distance along a line keeps counting for a car driving under a raised road,
  and a finish test can be passed by driving across the grass unless it checks
  for road under the car.
- Lap time is jagged at the millisecond level: moving one key press by 1 ms
  can change the lap by about 10 ms. Comparing the car's position just before
  the finish, to a fraction of a tick, is what lets a search improve a human
  lap.
- One car can be stepped about 6 million ticks in total, and save-state
  restores do not give ticks back. Long searches have to make a fresh car and
  rebuild their save states.
- The learning rate must fade to zero within each training stretch, or the
  saved checkpoints are unreliable. Three attempts per track is too few to
  judge a checkpoint; use ten.
