# g1-6: off-policy distributional learner, rewarded for progress only

An IQN (implicit quantile network) learner with n-step returns and a large
replay buffer, in the manner of Linesight (which beat human records in
Trackmania with it). The reward is distance gained along the lap per 50 ms
decision and nothing else: no pace against the human, no imitation, no key
costs. Every decision the simulators drive is reused about 32 times instead
of PPO's 4, and the GPU learns while the simulators drive instead of waiting
for them.

**Status (18 October 2026).** Every lap below passes the game's Verify on its
tick and fails one tick sooner.

- desert4: 39.2M decisions in six stretches (GPU, 6 simulators). Best lap
  **21.792 s** against the human's 21.750 s, reached at 21.2M; stretches 4 to
  6 found nothing faster. Levelled off at these settings.
- Variants on desert4: `--gamma 0.995` (best 21.808 s) and `--slices 5`
  (21.956 s in 12M decisions) gave no gain.
- winter2 from nothing: **26.997 s** in 12M decisions (human 26.830 s), the
  best any model has driven there.
- `--reference route` (no human lap in the inputs): **21.846 s** on desert4,
  100 of 100 training episodes finishing, after a fix to the route finish.
- Its laps are good seeds for the g1-1 search: 21.792 to **21.720 s** on
  desert4, 30 ms under the human.

Details in "Results" at the end and `docs/model-history.md` items 16 and 21
to 24. The sections between here and "Results" were written before any
training run; statements in them that the results overturn are marked.

## Files

| File | What |
| --- | --- |
| `iqn_server.mjs` | One `RacingEnv` per Node process. Replaces the reward with progress only, offers a flat action set, acts with the Q-network (epsilon-greedy), returns rollouts in bulk |
| `servers.py` | Starts N of those; `start_rollout` / `finish_rollout` so learning overlaps driving; `evaluate` |
| `iqn.py` | The network, the quantile Huber loss, the actor file for the Node side |
| `replay.py` | Ring buffer indexed [row, simulator]; n-step returns across endings, cut-offs and the write head |
| `train_iqn.py` | The training loop and `Learner` (double Q, target network) |
| `test_units.py` | Checks without a simulator |
| `smoke_test.py` | The whole loop on the real simulator, small |

## How to run

From the project root.

```
.venv/Scripts/python ideas/g1-6-offpolicy-rl/test_units.py            # 32 checks, CPU, ~80 s on the busy machine
.venv/Scripts/python ideas/g1-6-offpolicy-rl/smoke_test.py desert4    # 2 simulators, ~20 s

# a real run (8 simulators and the GPU; see "Results" for the settings used)
.venv/Scripts/python ideas/g1-6-offpolicy-rl/train_iqn.py --track desert4 --save-laps
.venv/Scripts/python ideas/g1-6-offpolicy-rl/train_iqn.py --track desert4 --resume
.venv/Scripts/python ideas/g1-6-offpolicy-rl/train_iqn.py --help
```

A run writes `rl/checkpoints/g1-6-iqn_<track>.pt`, `.best.pt` (the network of
the fastest start-line lap) and `.actor.bin`; with `--save-laps`, each new
best lap goes to `runs/g1-6-iqn_<track>.json`, which
`node scripts/export_recording.mjs` reads and verifies. A lap time counts only
after that passes.

## Design, and why

**Reward: progress along the human's line, as a ruler only.** Per decision,
`0.1 x (units gained along the reference line)`; at the finish, the rest of
the line's length, so every finished lap has the same total. `RacingEnv`
already locates the car on that line to a fraction of a unit, and the server
reads that and discards the environment's own reward. The line says how far
round the car is; nothing pays for the human's speed, keys, or for staying on
the line. Speed is paid for by the discount: the same road is worth more the
sooner it is covered. There is no time penalty, deliberately: with a negative
reward per step, ending the episode by crashing can look better than driving
on. The shared gate-based progress is too coarse for this (it stalls between
gates).

What the human lap still does: it is the ruler; it decides where an attempt
is cut off (60 units from it on the ground, 100 in the air, against the
trainer's 20 and 60; `--max-off-line`); `off track` is judged against the road
edges beside it; it supplies the save states that episodes start from; and
its speeds, orientation and keys are among the 352 inputs. `--human-inputs 0`
zeroes those inputs (the line's shape, the road edges and the rays stay).
The default keeps them: they are information, not a target.

**Actions: 12 key combinations, one per 50 ms** (`--slices 1`).
- Not 10 ms: one decision then changes the outcome so little that the values
  of two actions differ by less than the network's error, and the car feathers
  the keys; the project already found that with PPO.
- Not the 1500 block decisions: a Q-network needs one output per action.
- `--slices 5` gives 60 actions: a combination and the 10 ms slice in which
  all keys switch to it. It is a subset of the block decisions, so 10 ms
  timing is available without factoring. Start with 12 (Linesight's set, also
  at 50 ms), since the extra 48 are near-duplicates whose values differ very
  little, and leave timing to `search_rollout.mjs` or a later run with 60.
- With 12 actions the block is driven as ONE 50 ms simulator step instead of
  five 10 ms steps. Measured on desert4 with the machine busy: 2.5 ms against
  11.4 ms per decision (the cost is the message to the simulator thread, not
  the physics). A finish is still timed to the tick (winter2: 26831 both ways).

**IQN, not QR-DQN or plain DQN.** While exploring, the same keys at the same
place end either cleanly or in a wall; a network fitted to the average chases
a target that jumps between the two, and fitting the spread is steadier. IQN
over QR-DQN because it is the one with the record in this exact kind of task
and costs the same to write. Acting needs only the average, taken at 8 fixed
fractions whose embedding is exported as plain numbers, so the Node side needs
no cosines. Also used: double Q-learning, a dueling head (the value common to
all actions is roughly 100 times the differences between them at 50 ms), a slowly
following target network. Not used: prioritised replay (uniform sampling is simpler;
it is the first thing to try if crashes are learned too slowly).

**n-step 3, discount 0.99 per decision.** 0.99 means reward 3.5 s ahead counts
half, enough to brake for a corner. Three real rewards (150 ms) before the
estimate; longer returns are biased by the exploring decisions inside them.

**Servers to replay buffer.** The rollout reply holds observations, actions,
rewards and a stop flag per decision (0 on, 1 ended for good, 2 cut off by the
tick limit). No "next observation" is sent or stored: it is the next row. A
cut-off, and the newest row, are treated as the end of what is known: a return
reaching one stops before it and bootstraps from that row's own observation.
Observations are stored as float16 (0.7 GB per million decisions).

**Exploration.** Epsilon-greedy, a different epsilon per simulator
(`eps^(1 + 2k/(N-1))`: 0.1 down to 0.001 across 8), so some simulators always
show what the current driving is worth for a whole lap. Random actions hold W
90% of the time and S 10%; uniform keys cancel and the car does not move.
Epsilon falls from 1 to 0.1 over the first million decisions.

**Starts.** 80% of episodes begin from a save state part-way along the human
lap (the environment's ladder). That fills the buffer with the whole track
from the first minute. It only sets where practice begins. Lap times come
from a start-line lap without exploring, every 50 rounds.

## What was tested, and the numbers

All on CPU with at most 2 simulators, the machine busy with other training.

`test_units.py`, 32 checks, all pass:
- Quantile loss equals a written-out loop version; a hand-worked case gives
  0.75; minimising it on samples of 0..100 finds 10.2 / 50.5 / 89.9 for the
  10 / 50 / 90% points.
- n-step returns: eleven hand-worked cases (ending on the 2nd and 3rd decision,
  cut-off one and two rows on, newest row, across the ring's wrap, never from
  newest into oldest), then 20 000 random samples against a one-at-a-time
  reference, worst gap 4.8e-07.
- Sampling: never starts on a cut-off or the newest row; all 155 allowed
  decisions drawn, 223 to 295 times each for 258 expected; next observation is
  in the same simulator, 1 to 3 decisions later.
- The actor file, read back the way the Node server reads it, picks the
  network's best action on 200 inputs.
- `Learner.update` solves a two-state problem with a known answer: values
  0.99 / 1.77 / 1.96 for 1 / 1.8 / 2, and the spread (0.21 and 3.65 for 0 and 4).

`smoke_test.py desert4`, passes:
- Node and PyTorch pick the same action on 200 of 200 decisions.
- 7 episodes ended; each return equals 0.1 x the line distance covered, to 4e-15.
- Random actions hold W 92% of the time.
- 10 gradient steps, loss 1.16 to 0.62, finite. An evaluation lap runs to an
  ending (off track after 35 decisions; the network is untrained).

`train_iqn.py` at toy size (2 simulators, CPU): 3600 decisions and 93 gradient
steps on desert4 with 12 actions, 900 decisions on winter2 with 60 actions.
Loss finite throughout (0.46 falling to 0.19 on desert4), checkpoints written.
Speed on the busy machine: 5.3 to 6.9 ms simulating plus 1.4 ms choosing per
decision, about 100 decisions per second per process.

## Not done or not tested

- **No training run.** Nothing here shows the learner reaches a finish, let
  alone the human's time. Every setting is a reasoned first guess, untuned.
  *(Superseded: see "Results". It finishes reliably and reaches 21.792 s on
  desert4.)*
- No lap has finished under this code, so `--save-laps` and the
  export-and-Verify step are untested. Only the finish reward's trigger was
  checked (winter2 from 95% round).
- Never run on the GPU. Resume (`--resume`) is written but not exercised.
  *(Superseded: every run since 10 October was on the GPU; `--resume` and
  `--save-laps` work at full size.)*
- No loader for `search_rollout.mjs` or `rl/evaluate.py`: the actor file is
  not a PPO actor, so "let the policy drive the rest" needs a small adapter
  around `greedy` in `iqn_server.mjs`.
- Not written: prioritised replay, seeding the buffer with human laps,
  Linesight's fixed-horizon "mini-races" (in place of a discount), widening a
  12-action network to 60, multi-track training.
- Discounted progress is not exactly lap time: it prefers road covered now to
  road covered later. If laps finish but stay slow, raise `--gamma` (0.995).
  *(Tried 17 October: one stretch at 0.995 from stretch 3, best 21.808 s, no
  gain.)*

## Changes needed elsewhere

None are required to run this. These would help:

1. `rl/racing_env.mjs` `stepBlock`: send the five 10 ms slices to the
   simulator in one message. Five messages cost 11.4 ms per decision here
   against 2.5 ms for one 50 ms step, on the busy machine. This would speed up
   `--slices 5` and, more to the point, every block-decision PPO run and
   search. Worth measuring on an idle machine first.
   **Done (17 October 2026).** `stepBlock` now sends the block as one key
   schedule (`Env.stepSchedule`, "key schedules" in `sim/worker_entry.mjs`)
   and gets its 50 states back in one message; rewards and cut-offs are still
   worked out per 10 ms slice, so results are identical number for number
   (`g2-1-default_mode_check.mjs` and a trace of states, rewards, finish
   ticks and stored keys over 9,000+ decisions, 12 finished laps included).
   Measured on desert4 with an 8-process search running (about 90% CPU):
   1.77 to 1.81 ms per decision before, 1.39 to 1.40 ms after with one
   process (1.3 times faster); 2,404 to 2,456 decisions per second before,
   2,905 to 2,946 after with eight (1.2 times). The 3 to 4 times expected
   from the 11.4 ms measurement did not appear: here the five-message block
   already cost 1.8 ms, and one 50 ms step 1.5 ms, so the simulator itself
   is most of what is left.
2. `rl/racing_env.mjs`: a reward switch that skips the shaped terms. The
   server discards them; the saving is small.
   **Done (17 October 2026).** `shapedReward: 0` makes every step report
   reward 0 and skips the pace, contact, key-press, lane and finish terms,
   and the full decode of every tick the contact impulse sum needed (the
   contact input is read from each state's impulse count instead).
   `iqn_server.mjs` now sets it. With the same decisions, observations,
   states, contact counts, episode ends and finish ticks are identical to
   `shapedReward: 1` (3,000 decisions each on desert4 and winter2, slices 1
   and 5, about 200 episode ends); the default leaves everything as before.
   Saving, three alternating runs of 4,000 decisions each on desert4: 1.420
   to 1.395 ms per decision with slices 1 (1.7%), 1.537 to 1.481 ms with
   slices 5 (3.6%). The g1-6 tests pass (157 of 157).
3. A reference-free ruler (g2-1's route) in place of the human's line, so the
   cut-off and `off track` rules stop depending on where the human drove.
   **Done (18 October 2026).** `--reference route` in `train_iqn.py`, carried
   through `iqn_server.mjs` and read back from the checkpoint by
   `eval_lap.py`. See "Results".
4. A ladder of save states from the agent's own best lap (`refFile` already
   allows it by hand: `--ref-file runs/g1-6-iqn_<track>.recording.json`).

## What a full run would cost

Uses 8 simulator processes, the GPU, about 1.4 GB of RAM for a 2 million
decision buffer.

- **Decisions needed: 10 to 50 million** (140 to 700 hours of driving). This
  is an estimate from Linesight's scale and the size of this problem (22 to
  34 s laps, 440 to 680 decisions each, a line-following observation instead
  of images), not a measurement. The low end is where I would expect laps
  that finish near the PPO specialists; beating the human, if it happens, is
  towards the high end.
- **Speed.** The project's best figure, 14 000 10 ms decisions per second on 8
  processes, is 2800 of these decisions per second; the single 50 ms step
  should do somewhat better. That gives **1 hour per 10 million, 5 hours for
  50 million**, on an otherwise idle machine. Measured today with other
  training running: about 100 per second per process, so 800 per second on 8,
  which is 3.5 hours per 10 million and 17 hours for 50 million.
- **GPU.** One gradient step per 16 decisions: 175 steps per second at 2800
  decisions per second, batch 512. That should be well within an RTX 4060 for
  a network this small, but it is unmeasured; on the busy CPU a step at batch
  64 took 65 ms, so the CPU is not an option. If the log shows `waiting` near
  0%, the learner is the bottleneck: lower `--reuse`.
- First sign of life to look for: `lap %` of recent episodes rising and
  `stalled` endings falling within the first million decisions (10 to 20
  minutes). If that does not happen, stop and look before spending hours.

## Changed after independent testing

`tests/` holds an independent test suite (`node
ideas/g1-6-offpolicy-rl/tests/run_tests.mjs`; see `tests/TESTING.md`). One
defect was found and fixed:

- The evaluation lap is driven by simulator 0, which then starts a new
  episode in the next round, but the last row it had stored before the
  evaluation stayed marked "the episode goes on". Returns starting up to
  `n - 1` rows before it ran on into the unrelated new episode (seen in a toy
  run: lap fraction 0.017 followed by 0.264 under a "goes on" flag). Fix:
  `ReplayBuffer.cut(env)` in `replay.py` marks that row as a cut-off, and
  `train_iqn.py` calls it after each evaluation.

Also now tested, which the lists above give as untested: the finish reward on
real finishes (winter2, three episodes that cross the line) and `--resume` at
toy size.

## Results (added by the main session, 10 to 18 October 2026)

All lap times pass the game's Verify on their tick and fail one tick sooner.
GPU, 6 simulators unless stated.

**desert4, default settings, in stretches.** First run 3 hours, 9.2M
decisions: 21.977 s. Then 2-hour stretches of 6M decisions (`--resume
--save-laps --total-decisions 6000000 --lr 1e-4 --lr-end 0 --envs 6`):

| Stretch | Decisions at end | Best lap | End-of-stretch network |
| --- | --- | --- | --- |
| 3 | 21.2M | **21.792 s** | |
| 4 | 27.2M | nothing faster | 21.838 s |
| 5 | 33.2M | nothing faster | 21.811 s |
| 6 | 39.2M | nothing faster | 21.909 s |

About 40 ms gained per stretch up to stretch 3, then none: levelled off at
these settings. Copies per stretch: `rl/checkpoints/g1-6-iqn_desert4.s<k>.*`.
The lap that set a best is driven by `.best.actor.bin` (`eval_lap.py
--actor`), not `.best.pt`.

**Variants on desert4** (17 to 18 October, `scripts/queue_untried.sh`):

| Run | Settings | Best lap | Verdict |
| --- | --- | --- | --- |
| `g1-6-iqn-g995_desert4` | `--gamma 0.995`, one 6M stretch from stretch 3 | 21.808 s (end of stretch 21.848 s) | no gain |
| `g1-6-iqn-s5_desert4` | `--slices 5` (60 actions, 10 ms timing), from nothing, 12M decisions (paused at 10.56M, resumed with an empty buffer) | 21.956 s | no gain; the 12-action run had 21.977 s at 9.2M |

**winter2 from nothing** (`g1-6-iqn_winter2`, default settings, 12M
decisions, 2.3 hours): **26.997 s** (human 26.830 s); 99 of the last 100
training episodes finished. The best any model had driven on winter2 before
was 27.009 s (search-then-train). No tuning was needed for a second track.

**Route inputs, no human lap** (`--reference route`: 334 inputs, progress and
reward measured along the g2-1 route; the human lap only places part-way
starts):

- First run (`g1-6-iqn-route_desert4`): best lap 22.041 s, but 80 to 97 of
  every 100 training episodes ended 'off line' at 100% of the route. A car
  crossing the finish line beside the finish box was credited the whole
  route, so finishing paid nothing more and the learner stopped finishing.
- Fix, in route mode only: `finishHold` 20 units and `missedFinish` 10 units
  in `rl/racing_env.mjs` (the default mode was checked unchanged).
- Rerun (`g1-6-iqn-route2_desert4`): **21.846 s**, 100 of 100 training
  episodes finished (`rl/checkpoints/g1-6-iqn-route2_desert4.pt`). That is
  96 ms behind the human with no human lap in the inputs, and faster than
  every human-reference PPO model on desert4 (21.880 s with search).

**Its laps as seeds for search** (g1-1 `search_human.mjs seed=<recording>
seconds=1200 workers=8`, two runs): desert4 21.792 to 21.733 to **21.720 s**
(30 ms under the human); winter2 26.997 to 26.937 to 26.927 s; route desert4
21.846 to 21.801 to 21.800 s. g1-5 fine timing found nothing more on the
21.720 s lap. Files: `runs/g1-1-iqnseed*`, `runs/g1-1-routeseed*`.

**What is left.** No IQN run beats the human by itself (42 ms short on
desert4). Not tried: its own best lap as the ruler (`--ref-file`),
`search_rollout.mjs` from its lap (needs an adapter), IQN on several tracks
at once, or on route inputs over generated tracks.
