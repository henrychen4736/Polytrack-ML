# Polytrack-ML

Local ML and search for fast PolyTrack 0.6.3 laps, run against the game's own
physics headlessly in Node. Nothing here talks to Kodub's leaderboard server:
bot runs are for local ghosts only and must not be submitted.

## Where things stand (10 October 2026)

Two goals: a lap faster than the best human lap on at least one track, and a
generalist that can drive any track after a few attempts.

**Faster than the best human lap, on four tracks.** These are the human's own
laps with their key timings improved by search at 1 ms resolution, not laps a
model drives. Each passes the game's own Verify and is rejected one tick
sooner.

| Track | Best human | Best lap here | Faster by | File |
| --- | --- | --- | --- | --- |
| desert4 | 21.750 s | 21.709 s | 41 ms | `runs/g1-1-full2_desert4.recording.json` |
| winter2 | 26.830 s | 26.775 s | 55 ms | `runs/g1-1-full2_winter2.recording.json` |
| summer1 | 22.131 s | 22.104 s | 27 ms | `runs/g1-1-full2_summer1.recording.json` |
| summer4 | 34.105 s | 34.069 s | 36 ms | `runs/g1-1-full2_summer4.recording.json` |

**Laps a model drives by itself** are still behind the human:

| Method | desert4 | Notes |
| --- | --- | --- |
| Off-policy learner (IQN), from scratch | 21.957 s | 3 hours, 9.2 million decisions, reward is distance only; not yet put through Verify |
| PPO specialist + model-guided search | 21.880 s | after two rounds of search-then-train |
| PPO specialist alone | 22.0 to 22.1 s | imitation start, inherits from the generalist |
| Best human | 21.750 s | |

**Generalist.** The block-decision generalist was trained on 14 tracks. It
finishes 139 of 170 attempts on those and 7 of 30 on the three it has not seen
(desert3, summer3, winter4). With lookahead driving or save-state exploring it
gets round all three, but its inputs still need a human lap, so it cannot run
on a community track yet.

The fuller write-up, with every idea's result and what is left, is
[`ideas/README.md`](ideas/README.md).

## Setup

```bash
npm install
npm run setup     # clones polyrl at a pinned commit into vendor/, checks game file hashes
npm test          # both acceptance tests below
```

Needs Node 20+. `npm run capture` additionally needs Microsoft Edge.

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
  (`data/laps/<track>.json`, ten per track). Kodub's geometry; do not
  redistribute.
- `runs/`, `rl/checkpoints/`: results and model files. Both are git-ignored.
- `graphify-out/`: a knowledge graph of the code. Ask it with
  `graphify query "<question>"`; refresh it with `graphify update .`.

## Acceptance tests

1. `npm run test:verify`: 27 real leaderboard recordings (5 on summer1, 22 on
   winter1) pass the worker's own `Verify` on their exact claimed frame.
2. `npm run test:determinism`: one summer1 run gives the same state stream in
   two separate processes, and the same stream whether fed as a recording or
   stepped live through `Env.step`.

The ideas have their own tests, written by agents that did not write the code
under test: 1884 checks, 5 known failures documented in each folder's
`tests/TESTING.md`.

```bash
node ideas/run_all_tests.mjs    # every folder, one after another, about 25 minutes
```

## Driving and watching a lap

```bash
node scripts/drive_baseline.mjs summer1     # pure-pursuit lap, saves runs/baseline_summer1.json
node scripts/export_recording.mjs summer1   # encodes it as a recording and runs the game's Verify
node scripts/watch_ghost.mjs summer1        # opens the real client with the lap loaded; click Watch
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

# From a specialist's lap: change a decision, let the policy drive the rest,
# keep it only if the lap finishes sooner
.venv/Scripts/python rl/export_actor.py rl/checkpoints/ppo_gblk_desert4.final.pt
node scripts/search_rollout.mjs desert4 actor=rl/checkpoints/ppo_gblk_desert4.final.actor.bin seconds=600 passes=1

# One round of "train the specialist towards the searched lap, then search again"
sh scripts/search_round.sh desert4 rl/checkpoints/ppo_gblk_desert4.final.pt runs/rollout_desert4.recording.json r1
```

The search-then-train loop gained up to 189 ms in its first round and almost
nothing in its second, so it is close to its limit as built.

## The off-policy learner

`ideas/g1-6-offpolicy-rl/` is a separate learner (IQN with a replay buffer)
rewarded on distance along the track only, with no imitation and no reward
for matching the human.

```bash
.venv/Scripts/python -u ideas/g1-6-offpolicy-rl/train_iqn.py --track desert4 --envs 6 --device cuda --total-decisions 30000000
```

Its first run reached 21.957 s on desert4 in 3 hours from scratch and was
stopped by the clock, not because it had levelled off. The GPU is its limit,
not the simulators.

## The twelve ideas

Each folder under `ideas/` has its own README with commands and numbers.

| Folder | What it is | Result so far |
| --- | --- | --- |
| `g1-1-human-seed-search` | Search from the human's lap at 1 ms | Under the human on four tracks |
| `g1-2-stitch-human-laps` | Join the best sections of several human laps | desert4 21.730 s; nothing on the other three |
| `g1-3-search-train-rounds` | Unattended, restartable search-then-train rounds | Tested in dry runs only |
| `g1-4-beam-search` | Keep many partial laps alive at once | Does not beat the existing search |
| `g1-5-fine-key-timing` | Re-time each key press to the millisecond | desert4 21.722 s from the human lap |
| `g1-6-offpolicy-rl` | Off-policy learner, distance-only reward | desert4 21.957 s from scratch |
| `g1-7-computed-racing-line` | Racing line from a fitted car model | Not faster than the human; the car model is reusable |
| `g2-1-reference-free-inputs` | Route, progress and inputs with no human lap | Route correct on 15 of 17 tracks; not yet trained on |
| `g2-2-track-generator` | Random tracks from the game's pieces | Narrow-road tracks only; a scripted driver finishes them all |
| `g2-3-explore-and-adapt` | Retry from save states on an unseen track | Finishes winter4 in about 5 laps' worth of driving |
| `g2-4-lookahead-driving` | Try alternatives when the policy would crash | Finishes all three unseen tracks, at 9 to 39 times the cost |
| `g2-5-memory-policy` | Inputs that remember earlier attempts | Built and tested; not trained |

## What is next

1. Run the off-policy learner longer on desert4 and put its best lap through
   Verify. It is the first model here that looks able to beat the human by
   itself.
2. Send one message per block decision instead of five in
   `rl/racing_env.mjs`. Two measurements put a block decision at 11.4 ms
   against 2.5 ms for a single 50 ms step on a busy machine; it needs
   measuring on an idle one.
3. Train a generalist on the inputs that need no human lap. Episodes must end
   when there is no road under the car, or the model will learn to drive on
   the ground beneath a raised road.

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
