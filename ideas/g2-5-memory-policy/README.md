# g2-5: a policy with memory of its earlier attempts

The generalist treats every attempt at a track as its first. Here the
environment keeps a map of what earlier attempts on this track did, indexed by
distance along the track (where they crashed, the lowest speed that went wrong
and the highest that got through, with the lateral offset of each), and shows
the policy that map for the road ahead as 130 extra inputs. The policy stays
the same feed-forward network; it gets better over a handful of attempts
because its inputs change, not its weights.

Nothing here has been trained. What exists is the memory, the environment
wrapper, the agent, the measurement script and their tests, and (since 16
October 2026) the trainer changes that make it trainable, with both kinds of
reference: `train_memory.sh` and `eval_memory.sh` run the first experiment
and its test (see "Trainer changes" and "How to run").

## Which design, and why

| | A. recurrent, RL-squared | B. attempt-conditioned inputs (built) |
| --- | --- | --- |
| What is remembered | whatever the hidden state learns to keep | a fixed map: visits, crashes, surviving and doomed speed and offset per 2 units of track |
| Span to learn across | 5 attempts of 20 to 35 s = 2000 to 3500 decisions; a rollout is 256 | one decision: the memory is part of the observation |
| PPO changes | sequences, stored hidden states, truncated back-propagation, minibatches of whole sequences | none (the observation is longer) |
| Node actor (`env_server.mjs`) | a GRU cell and hidden state carried across rollouts and resets; about 3 times the multiplications of the first two layers (3 x (352+256) x 256 against (352+256) x 256), estimated, not measured | unchanged code, first layer 482 wide instead of 352: about +20% multiplications in the actor |
| Start from the trained generalist | no (new architecture) | yes: memory weights zero, identical driving, checked |
| Can learn to explore on purpose | yes, in principle | only with `carry` (below) |
| When it does not work | hard to tell why | the map can be printed and read |

I tested the prior that B is the practical one in three ways rather than
adopting it.

1. **Does the map carry signal with today's policy?** `attempts.mjs` drove
   the trained generalist (`ppo_blkgen.best2`, which ignores the memory),
   decisions sampled, on tracks it was not trained on, and recorded where each
   attempt ended. desert3, 3 sessions of 5 attempts: 15 of 15 crashed, and
   all at three places (progress 268 to 322 units, 8 times; 748 to 812,
   twice; 1156 to 1220, 5 times). summer3, same amount: 10 of 15 finished;
   of the five crashes, four were at 628 to 632 units. So a crash site seen
   once is very likely to be met again, which is the case a position-indexed
   crash map is for. (The script's own stricter count, "within 20 units of an
   earlier crash of the same session", is 4 of 12 on desert3 and 3 of 4 on
   summer3.) This is a small sample from one policy, on two tracks.

2. **How much does B give up by not exploring on purpose?** `toy_probe.py`
   solves a toy exactly: one corner with a hidden speed limit, score = speed
   if through, 0 if crashed, five attempts. The memory of this design (highest
   surviving speed, lowest doomed speed) is all there is to know there, so the
   best any design can do, a recurrent one included, is the "session" row.

   | driver | try 1 | try 2 | try 3 | try 5 | sum of 5 |
   | --- | --- | --- | --- | --- | --- |
   | no memory (today) | 0.359, through 72% | 0.359, 72% | 0.359, 72% | 0.359, 72% | 1.796 |
   | uses the memory, each attempt for itself (B, `carry` 0) | 0.359, 72% | 0.444, 100% | 0.444, 100% | 0.444, 100% | 2.134 |
   | best over the session (the limit for A, and B's target with `carry` 1) | 0.344, 56% | 0.412, 70% | 0.524, 92% | 0.566, 100% | 2.412 |

   Plain B gets 55% of the possible gain and all of the reliability: it never
   crashes twice. What it does not do is go faster once it has a safe speed;
   that needs crashing on purpose early, and it costs finishes on tries 1 to
   3. Henry's requirement is "after a few tries, reasonably well", which is
   the middle row. The toy is one-dimensional and its numbers do not transfer
   to the game; the shape of the result is the point.

3. **Is A's extra power out of reach for B?** No. A's advantage is that
   reward in attempt 3 can pay for a risk taken in attempt 1. With B the
   memory is the state that passes between attempts, so the same credit can
   be passed through the critic: at the end of an attempt that is not the
   session's last, add `carry` x the value of the next attempt's first
   observation (which contains the updated memory). That is
   `session_advantages` in `memory_agent.py`, 3 changed lines against
   `compute_advantages`, tested. It is off by default; with the discount at
   0.995 per decision an attempt of 400 decisions passes back only 13% of
   what follows it, so `carry` would mostly matter for crashes late in an
   attempt.

So B, with A's objective available as one setting. What B cannot do is
remember something nobody thought to put in the map (for example which of two
routes was taken); the list of remembered things is the design's limit.

## What is remembered, exactly

`track_memory.mjs`. Bins of 2 units of progress. Per bin, since the memory was
last cleared:

- `visits`: attempts that drove through it.
- `crashes`: attempts that ended in it as `stalled`, `off line` or `off track`.
- `passSpeed`, `passLat`, `passTick`: the highest speed at which an attempt
  came through and was still going 3 s later, with its lateral offset and lap
  clock.
- `failSpeed`, `failLat`: the lowest speed at which an attempt came through
  and stopped making progress within 3 s, with its lateral offset.

Plus: attempts made, whether any finished, the furthest progress reached.

Shown to the policy (130 numbers after the existing 352, layout at the top of
`track_memory.mjs`): the six per-bin numbers for each of 21 stretches of road,
the car's own and those of the 20 lookahead points the observation already
has, each taken over every bin in the stretch so a crash site cannot fall
between two points; then attempts so far, has-finished, ahead or behind its
own best surviving pass through here, and how far beyond the car anything is
known. On a first attempt all 130 are zero.

Indexing is by `renv.progress`, distance along the reference line. Only
`MemoryEnv._sample` and `_extend` read it (`progress`, `lateral`,
`progressIndex`, the lookahead gap), so g2-1's human-free route replaces it
there and nowhere else. That is now done: with `reference: 'route'`
(RacingEnv's route mode) the bins are on the route (`progressLine`), the
observation is 334 + 130 = 464, the lookahead stretches are the route's
points by the same formula as `observation.mjs`, and a `refLaps` change of
the human lap that only places the car does not clear the memory. Lateral
offsets are then from the route; shown /10 and clipped at 30 units. The two ideas fit: after one finished attempt,
`passSpeed` / `passLat` over the whole track are a lap the car drove itself,
the same kind of input the human reference supplies today, and on a community
track it is the only one there will be.

Assumptions worth knowing:

- The 3 s "doomed" window is a guess taken from the 1.5 to 4 s back-off of the
  existing failure starts. It is blunt: in the smoke test, where the car is
  steered off the road 0.8 s before leaving it, the 2.2 s of normal driving
  before that are marked doomed as well (doomed speeds up to 214 km/h,
  surviving ones only up to 45).
- Speed and lateral offset are not the only causes of a crash (attitude in the
  air, a scrape earlier). They are the two the policy can most directly act on.
- `time limit` endings count as visits only.
- Part-way starts (`randomStart`) hand the car over at the human's speed, so
  the first bin or two of such an attempt record the human's speed, not the
  car's own. Harmless while the human's speeds are an input anyway; with g2-1
  there are no such starts.

## Curriculum

`memory_env.mjs`. Attempts are grouped into sessions: 1 to `sessionMax`
(default 6) consecutive attempts on one track with one memory, length drawn
afresh each time, memory cleared between sessions and whenever the reference
line changes. At 6, two attempts in seven are a first try, so driving a track
cold keeps being practised, and every update holds every attempt number.

The memory inputs only teach anything where the policy fails, and a policy
that never fails never learns to read a crash memory. On its training tracks
the generalist now finishes about 94 of 100 training episodes, so there:

- keep `failureStart` high (0.5) and `kick` on: a start a few seconds before a
  crash site, on an attempt whose memory shows that crash, is exactly the case
  the inputs are for, and those two options manufacture it;
- prefer the setting where failure is common. That is the reference-free
  generalist (g2-1) and generated tracks (g2-2): without the human's speeds in
  the input, "how fast can this corner be taken" is unknown on the first try
  and known on the second. With the human reference in the input, most of
  what the memory could say is already said, and I expect the memory to be
  used mainly at jumps and at places where the car cannot follow the human.

The reward is unchanged. With `carry` 0 each attempt is an ordinary episode.

## How to run

From the project root. Each uses one simulator.

```
node ideas/g2-5-memory-policy/memory_test.mjs                    # map and session checks, 12 s
.venv/Scripts/python ideas/g2-5-memory-policy/smoke_test.py      # end to end, 20 s
.venv/Scripts/python ideas/g2-5-memory-policy/toy_probe.py       # the toy table, 2 s
node ideas/g2-5-memory-policy/attempts.mjs track=desert3 policy=rl/checkpoints/ppo_blkgen.best2.actor.bin attempts=5 sessions=3 sample=1
```

Training and its test (16 simulators, about 2 hours a stretch; restartable):

```
sh ideas/g2-5-memory-policy/train_memory.sh                     # from ppo_blkgen.best2.pt -> rl/checkpoints/g2-5-mem.pt
REFERENCE=route sh ideas/g2-5-memory-policy/train_memory.sh     # from ppo_g2-1-route.pt -> rl/checkpoints/g2-5-mem_route.pt
sh ideas/g2-5-memory-policy/eval_memory.sh rl/checkpoints/g2-5-mem.after_<steps>.pt
```

`train_memory.sh` widens the starting checkpoint once (only if
`g2-5-mem[_route].pt` does not exist yet), then runs `STRETCHES` (default 1)
stretches of `STEPS` (default 13 million) decisions with the first
experiment's settings; a rerun after a stop starts a new stretch from the
last save. Its header gives every setting and why (learning rate 5e-5, no
imitation term, from CLAUDE.md's lesson on widened inputs). `eval_memory.sh`
runs `attempts.mjs` on desert3, summer3 and winter4 with `memory=1` and
`memory=0`, 10 sessions of 5 sampled attempts each, and prints finishes per
attempt number side by side. `rl/evaluate.py` also drives a memory
checkpoint (one attempt: attempt 1, memory empty), so
`scripts/eval_generalist.sh`'s ten-attempt test measures its first-try
driving; the session test is `eval_memory.sh`.

`attempts.mjs` is the measurement: per attempt number, finish rate, mean lap
time and mean share of the lap, with the memory carried across the attempts of
a session. `memory=0` runs the same policy with the memory inputs held at zero
(the baseline); a 352-input policy file is accepted too. Success is: on tracks
not trained on (desert3, summer3 and winter4 for `ppo_blkgen.best2`), finish
rate on attempts 2, 3 and 5 clearly above attempt 1 and above the `memory=0`
run, with attempt 1 no worse than today's generalist. Use `sample=1` and
several sessions: with top choices the simulator repeats exactly, so one
session per track is all there is. Lap times it prints are not verified laps;
run `scripts/export_recording.mjs` on a saved lap before quoting one.

Files: `train_memory.sh`, `eval_memory.sh` (training and its test), `track_memory.mjs` (the map), `memory_env.mjs` (`MemoryEnv`, wraps
`RacingEnv`), `memory_agent.py` (`MemoryAgent` subclasses `Agent`;
`from_checkpoint`, `write_actor`, `session_advantages`, `ppo_loss`),
`attempts.mjs`, `memory_test.mjs`, `smoke_test.py`, `toy_probe.py`. `out/`
holds what the smoke test writes.

## What was verified

All on CPU, one simulator at a time, the longest run 104 s.

- `memory_test.mjs`, 21 checks: on made-up traces the map classifies
  surviving and doomed stretches as specified, keeps the bracket (108 got
  through, 144 did not), lines up with the lookahead stretches, shows a single
  crash bin in exactly one 12-unit stretch, and does not credit road before a
  part-way start. In the real environment (desert4) sessions last 1 to 3
  attempts at `sessionMax` 3, the memory is empty exactly on attempt 1, and a
  change of reference starts a new session.
- `smoke_test.py`: a `MemoryAgent` warm-started from `ppo_blkgen.best2.pt`
  gives the generalist's actor and critic outputs on 2048 random inputs
  (largest difference 2.3e-05). Its actor file, run by the shared Node policy
  code on 482-number observations, drove two consecutive attempts on desert3.
  Attempt 1 (crashed to order at 118 units): all memory inputs zero over 76
  decisions. Attempt 2: attempts-so-far reads 1/8, the crash-ahead input is
  lit on 41 of 163 decisions, first at decision 34 in the furthest stretch.
  Node and torch agree on the 22 scores for all 239 observations (4.8e-06).
  Log-probabilities, values, advantages (equal to `compute_advantages` at
  `carry` 0; at 0.5 only attempt 1's last step changes), PPO loss, backward
  and one Adam step all run; the zero-initialised memory weights receive
  gradient (actor 5.7e-03, critic 4.6e-01).
- `attempts.mjs` with the memory-blind generalist: the crash-repeat numbers
  above. Throughput was 55 to 105 decisions per second with training running
  on the machine.

## Not done, not tested

- No training. Whether a policy learns to use these inputs, and how much
  finish rate it buys on attempt 2 to 5, is not known. The trainer runs
  (below); only smoke runs of a few updates were made.
- No route-reference generalist exists yet (`rl/checkpoints/ppo_g2-1-route.pt`
  is made by `ideas/g2-1-reference-free-inputs/train_route_generalist.sh`), so
  route mode was smoke-tested on a network with fresh weights only.
- `carry` > 0 is tested for arithmetic and for running (5 updates); its
  effect on learning is unknown.
- `MemoryEnv.demo` (imitation examples with a zero memory) is untested; the
  trainer pads examples itself instead. `step()` without blocks is refused.
- winter4 was not measured. The crash-repeat figures are 30 attempts in all.
- `rl/rollout_child.mjs`, `scripts/search_rollout.mjs` and the other
  searches cannot use a memory policy: they assume 352 (or 334) inputs. A
  search would also need a memory that persists across its rollouts, which
  is a design question, not a size change.
- Design A was not built.

## Trainer changes (made 16 October 2026)

All opt-in: without `memory` / `--memory` every file behaves exactly as
before (checked, see below).

`memory_env.mjs`
- Sizes from the environment: the observation is `renv.obsSize + 130`, so 482
  with a human lap as reference and 464 with `reference: 'route'`
  (`MEMORY_OBS_SIZE`, `MEMORY_OBS_SIZE_ROUTE`). Nothing assumes 352.
- Route mode: the bins are on the route (`progressLine` = `renv.route ??
  renv.line`), progress, lateral offset and the lookahead stretches all come
  from the route, and a `refLaps` change of the human lap (which in route
  mode only places the car) does not end the session.
- Defect 2 of `tests/TESTING.md` fixed: when a `refLaps` switch is due at the
  next `reset()` (human reference), the attempt ends its session and is
  flagged `sessionEnd`. All 115 checks of `tests/run_tests.mjs` pass.

`rl/env_server.mjs`: accepts `memory`, `sessionMax`, `sessionSeed`; with
`memory` given (1, or 0 for the zero baseline) it holds a `MemoryEnv`; the
memory module is not even imported otherwise. `sessionSeed` defaults to the
server's `seed`, so the 16 servers of a run draw different session lengths.
The ready line gains `memory: {on, size, baseObsSize, sessionMax}`; a rollout
reply gains `sessionEnds`, taken from the NEXT reset's `info.attempt === 1`
(exact whatever cleared the memory); each episode's info has `attempt`.

`rl/polytrack_env.py`: `rollout()` returns `session_ends` (steps, N) for a
memory server.

`rl/train_ppo.py`: `--memory 0|1`, `--session-max` (6), `--carry` (0; needs
`--memory`). `session_advantages` now lives there (one copy;
`memory_agent.py` re-exports it) and is used only when `--carry` > 0. The
progress line gains `finished by attempt 1:a/b 2:.. 3:.. 4+:..` over the
last 100 attempts of each number (part-way starts included). `--bc-data`
examples of the plain width are padded with 130 zeros. Resuming a plain
checkpoint into a memory run stops with the `extend_checkpoint_inputs.py`
command to run. Checkpoints record `memory`, `session_max`, `carry`.

`rl/extend_checkpoint_inputs.py`: unchanged code (it reads the old size from
the checkpoint); docstring gives both widenings. Measured: 352 -> 482 from
`ppo_blkgen.best2.pt`, largest output difference actor 5.7e-06, critic
1.7e-05 on 4096 random inputs; 334 -> 464 (a fresh route network), 2.4e-07
and 8.3e-07. The reference is kept in the widened file.

`rl/evaluate.py`: drives a memory checkpoint (recorded `memory`, or 130 more
inputs than the plain size) in a memory environment; one run is attempt 1.

`attempts.mjs`: takes 482, 352, 464 or 334-input policies and builds the
matching environment (`reference=` overrides the guess from the size).

`rl/export_actor.py`: works as it is (482 and 464 checked).

## What was checked

- Default mode unchanged: `ideas/g2-1-reference-free-inputs/g2-1-default_mode_check.mjs`
  recorded on the files before these changes and compared after: SAME on all
  parts (1521 block decisions with every start kind, 803 old-scheme steps,
  435 demo decisions, mark/rewind, the server's start-up line). Also the
  server's full ready line and two 400-decision `rollout` replies in default
  mode with `ppo_blkgen.best2`, hashed before and after: identical.
  `npm test` passes.
- Server with memory, 2 x 1500 decisions on desert3, `failureStart` 0.5,
  `kick` 0.3, `ownStart` 0.5, `refLaps` 10 with `refEvery` 3 (to force
  switches): human reference, 482 inputs, attempt numbers `1 2 3| 1 2| 1 2|
  ... 1 2 3 4| ...` (sessions cut short by the switches, as they should be);
  route reference, 464 inputs, `1 2 3 4| 1 2| 1 2 3| 1 2| 1 2 3 4 5| ...`
  (not cut by `refLaps`). In both, `sessionEnds` agreed with `MemoryEnv`'s own
  flag on every attempt (0 disagreements), and session ends fell only on
  attempt ends.
- Smoke training, 3 simulators, CPU, 5 updates of 768 decisions: human
  reference from the widened `ppo_blkgen.best2` with `--carry 0.5` and
  padded `--bc-data`: ran, 481 decisions/s, last line `finished by attempt
  1:6/7 2:3/3 3:2/3 4+:1/3`. Route reference from a fresh 464-input network:
  ran, 419 decisions/s, `1:0/16 2:0/11 3:0/6 4+:0/8` (an untrained network
  stalls). `train_memory.sh` with `ENVS=3` and a few thousand steps into a
  scratch folder: widened, trained a stretch, and a second call started
  stretch 2 from the save. `export_actor.py`, `evaluate.py` (desert3, attempt
  1) and `eval_memory.sh` (desert3, 2 sessions of 3) ran on the result.

## What a full run would cost

Measured from the logs: the block generalist trains at about 1860 decisions
per second on 16 environments (`runs/rl_train_blkgen2_a.log`), 13 million
decisions in about 2 hours, and took 103 million in all. The memory adds about
5% to that (a fifth more actor arithmetic, the actor being about a quarter of
the time; the map itself is a few array reads per decision).

- First experiment, 2 to 4 hours (13 to 26 million decisions, 16
  environments, CPU for the simulators): fine-tune the warm-started generalist
  with `--memory 1 --session-max 6 --failure-start 0.5 --kick 0.3`, three
  tracks held out, then `attempts.mjs` on the held-out tracks with `memory=1`
  and `memory=0`, 10 sessions of 5 attempts each (about 10 minutes per track
  on one simulator). This answers whether the inputs get used at all. My
  honest expectation is a small effect here, because the human reference
  already tells the policy most of what the memory would.
- The run that matters is the same thing on the reference-free generalist
  (g2-1), where the memory is the only source of "how fast through here". No
  such generalist exists yet, so its cost is that of training one, likely the
  same order as the current generalist (100 million decisions, about 15
  hours), with the memory inputs present from the start rather than added
  afterwards.
- Design A would need the sequence trainer and the recurrent Node actor
  written first (several days of work) and, going by RL-squared results on
  far shorter episodes, several times the samples; I would not start it
  before B has been shown to fall short.
