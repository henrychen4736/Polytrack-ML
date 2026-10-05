# rl/: reinforcement learning on the headless simulator

Scaffolding to train an agent to drive fast laps. It produces working plumbing
and a training loop, not a trained agent: nothing here has been trained for
more than a few seconds.

Local use only. Nothing in this folder opens a network connection, and bot laps
must never be submitted to the leaderboards (see the top-level README).

## Files

- `racing_env.mjs`: the environment. Wraps `sim/env.mjs` and defines the
  actions, the observation, the reward and when an episode ends. All of that is
  documented at the top of the file.
- `env_server.mjs`: one environment as a process, speaking one JSON object per
  line over stdin/stdout (`reset`, `step`, `save`, `close`).
- `smoke_test.mjs`: Node-only checks of the environment.
- `polytrack_env.py`: Python client. `PolytrackEnv` (Gymnasium interface, one
  server process) and `PolytrackVecEnv` (N server processes stepped together).
- `train_ppo.py`: PPO training, self-contained in PyTorch.
- `evaluate.py`: one greedy lap from the start line; saves `runs/rl_<track>.json`.

## Install

The Node side needs nothing beyond the project's own setup (`npm install`,
`npm run setup`). For Python:

```bash
pip install -r rl/requirements.txt     # numpy and torch
```

## Use

Run everything from the project root.

```bash
node rl/smoke_test.mjs summer1         # environment checks, about 10 s
python rl/polytrack_env.py             # Python <-> Node round trip with random actions
python rl/train_ppo.py                 # train; Ctrl+C saves and stops; --resume continues
python rl/evaluate.py                  # greedy lap; saves runs/rl_summer1.json if it finishes
node scripts/export_recording.mjs summer1 rl   # encode + the game's Verify
node scripts/watch_ghost.mjs summer1 rl        # watch it
```

`python rl/train_ppo.py --help` lists every setting. The checkpoint goes to
`rl/checkpoints/ppo_<track>.pt` (git-ignored).

## Multi-track ("generalist") training

```bash
node scripts/fetch_laps.mjs            # once: human laps for every official track (read-only)
python rl/train_ppo.py --track desert1,summer1,winter1 --envs 3 --no-lap-fraction     --random-start 0.7 --failure-start 0.5
```

- `--track a,b,c` gives each environment process one of the tracks; use as many
  `--envs` as tracks. The checkpoint is `rl/checkpoints/ppo_general.pt`, and the
  log prints a per-track line every 50 updates.
- `--no-lap-fraction` hides the "how far round the lap am I" input, so the
  agent cannot memorise a track by position.
- `--failure-start` starts some episodes 1.5 to 4 s before a place where a
  recent episode of that environment crashed.
- Collection uses the server's `rollout` command: each process runs the policy
  itself for a whole batch and reports back once. The trainer writes the
  policy's weights to `<checkpoint>.actor.bin` before every batch.
- `rl/widen_checkpoint.py` makes a trained network wider without changing its
  outputs, so training can continue with more units.

Measured on an 8-core laptop (Ryzen 9 7940HS), 14 tracks:

- Collection alone runs at about 5,700 decisions/s with 256-wide layers and
  about 3,500 with 512-wide ones: in the wider network the policy's own
  arithmetic, done in JavaScript in each process, costs more than the physics.
- 14 processes are only about 2.7 times faster than one, and 28 are slower
  than 14. Each process keeps two threads busy, so 8 cores are oversubscribed.
- Whole training runs at about 2,800 decisions/s with `--random-start 0.7`,
  because every part-way start replays the human lap up to the start point.

## Design in brief

- **Actions**: 12 key combinations, W x S x {straight, left, right}, so W and S
  can be held together (humans do that over every jump). Steering is chosen
  every 10 ticks (10 ms). W and S are chosen every 50 ms and held in between,
  and every key press or release costs a little reward, so that keys are held
  rather than tapped. The network makes the three choices separately.
- **Imitation first**: `rl/pretrain_bc.py` trains a new network to press what
  the top human laps pressed, before PPO starts. See the top of that file.
- **Observation**: 146 numbers scaled to about -1..1 (the table at the top of
  `racing_env.mjs` is the reference; the summary below covers the first 101,
  the rest are road-edge distances and key state). 21 describe the car
  (speed, velocity in the car's frame, which way is up, rotation rate, wheel
  contacts, steering angle, previous keys, offset from the line, lap fraction).
  60 are the next 20 reference-line points in the car's frame, spaced
  max(2 units, 0.15 s of travel) apart. 20 are the human's speed at those points.
- **Reward**: 0.1 per unit gained along the reference line, and on finishing,
  5 + 2 per second left before the tick limit. Every finished lap collects the
  same progress reward, so the faster of two finished laps always has the larger
  total.
- **Episode end**: finish (terminated); or truncated on a stall (under 1 unit
  of progress in 2 s), more than 20 units from the line, or the tick limit
  (twice the human's lap time).
- **Starts part-way round**: with probability `--random-start` (0.5 in
  training) an episode begins at a random point of the human's lap, reached by
  replaying the human's keys up to there. Without this the agent can only
  practise a corner after surviving all the ones before it. Evaluation always
  starts on the start line.
- **Algorithm**: PPO, written directly in PyTorch in one file. PPO suits a
  small discrete action set and many parallel environments, and is stable with
  little tuning. It is hand-written rather than Stable-Baselines3 because torch
  was already installed and SB3 and Gymnasium were not, and a single commented
  file is easier to follow and change.

## What was tested

On this machine (Windows 11, Node 20.16, Python 3.12.4, torch 2.5.0 CPU,
numpy 2.1.2):

- `node rl/smoke_test.mjs summer1` passes: observations finite and in range;
  a start at 50% of the human lap lands 0.5 units from the line; the
  pure-pursuit controller driven through the actions at 5 ticks per decision
  finishes in 23835 ticks, the same as `scripts/drive_baseline.mjs`; a faster
  finished lap earned more reward than a slower one.
- The lap saved by that test, and the same lap replayed and saved through the
  Python client, both pass `scripts/export_recording.mjs` (the game's Verify).
- Speed: about 5,800 decisions/s (58,000 ticks/s) for one environment inside
  Node; about 2,100 to 2,700 decisions/s for one environment through the Python
  client; about 7,000 decisions/s for 8 environments through
  `PolytrackVecEnv`. Training with 8 environments ran at about 2,300 to 2,800
  decisions/s, held back by resets that replay the human lap and by the
  per-step network call.
- `train_ppo.py` for 20,480 steps (10 updates, about 8 s), `--resume`, and
  `evaluate.py` with the resulting checkpoint and with `--policy random` all
  ran without error. After those few seconds the policy drives a few percent of
  the lap, as expected.
- `node rl/smoke_test.mjs winter1`: the environment checks pass. The controller
  lap is skipped because the pure-pursuit controller does not get round winter1.

## What was not tested

- Any real training run. Whether these settings (reward weights, 10 ms
  decisions, discount, network size) reach a finished lap, and how long that
  takes, is unknown.
- `evaluate.py` saving a lap driven by a trained policy: no policy has finished
  a lap yet. The save path itself was exercised from Python with the
  controller's lap.
- The Gymnasium code path (`observation_space`, `action_space`, use from
  Stable-Baselines3): `gymnasium` is not installed here.
- `--device cuda`.

## Known limits

- Eight environments give about 3 times one environment's speed through
  Python, not 8 times: the client reads the JSON replies one after another.
  A binary protocol or more ticks per decision would help if this becomes the
  bottleneck.
- The speed scaling assumes at most about 300 km/h. winter1 reaches about 400;
  the values are clipped at 3, so nothing breaks, but the speed inputs run past 1.
