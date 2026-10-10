# g1-6 off-policy IQN learner: independent tests

Written by a tester who did not write the code. Run from the project root:

```
node ideas/g1-6-offpolicy-rl/tests/run_tests.mjs            # one line per check, PASS or FAIL
node ideas/g1-6-offpolicy-rl/tests/run_tests.mjs verbose=1  # also the test programs' other output
```

Result on 2026-10-10, with training running on the machine: **157 passed, 0 failed, 166 s**.
CPU only (CUDA is hidden from every Python process the suite starts), toy
sizes, at most 2 simulator processes, no training run. Exit code 0 only if
every check passes.

## What is covered

| File | Checks | What |
| --- | --- | --- |
| `test_pure.py` | 60 | `iqn.py`, `replay.py`, `Learner` and `epsilons` of `train_iqn.py`. No simulator |
| `test_server.py` + `replica_check.mjs` | 41 | `iqn_server.mjs` and `servers.py` on the real simulator, one at a time |
| `test_train_toy.py` | 14 | `train_iqn.py`'s loop at toy size (2 simulators, 5 rounds of 24 decisions, 32 units), and `--resume` |
| `test_author.mjs` | 42 | the author's `test_units.py` and `smoke_test.py`, run unchanged and reported in this format |

How the specific targets were tested:

- **Quantile Huber loss** against an implementation written here as a loop
  over every (fraction, sample) pair: seven cases worked by hand (inside and
  beyond the Huber threshold, exactly on it, a sample above and below, mean
  over samples and sum over fractions, another kappa), 300 random cases with
  1 to 8 fractions and samples and three kappas including exact ties, a batch,
  the gradient (proportional to tau when the sample is far above), and that
  minimising it on 0..100 lands on the 10 / 50 / 90% points.
- **n-step returns** two ways. Fourteen hand-worked cases: an ending on the
  2nd and 3rd decision, starting on the ending, a cut-off one and two rows on,
  the newest row, the ring's wrap, never from the newest into the oldest.
  Then a ground truth that never reads the buffer: episodes are generated as
  plain Python lists (random lengths, ending for good or cut off), written
  through `add` in chunks of random size until the ring has wrapped many
  times, and after every write 400 samples are drawn. Each observation
  carries its own serial number and simulator number, so for every sample the
  return, the weight on the estimate, and WHICH observation the estimate is
  taken from are compared with what the lists say. Six rings: 5 to 64 rows,
  1 to 4 simulators, n = 1 to 5.
- **The replay never samples an invalid start**: in the same trials, no
  sample starts on a cut-off row, on the newest row, or on a decision the
  ring has overwritten; and on one full ring 40 000 draws hit exactly the
  allowed starts, each within 25% of the even share.
- **The actor file on the Node side picks the same action as PyTorch.** The
  real server is given a network and asked to drive without exploring; for
  every row, PyTorch's best action for that row's observation must be the
  action the server took: 150 of 150 with 12 actions (hidden 30 and head 14,
  not multiples of 4, so the server's remainder loop runs), 90 of 90 with 60
  actions across six networks. Separately the file is parsed here with numpy
  from the layout in the server's comment and evaluated on 300 inputs for
  three network sizes.
- **The reward is progress only.** What the server reported (observations,
  actions, rewards, stop flags of consecutive rollouts) is written to a file,
  and `replica_check.mjs` drives the same actions on `rl/racing_env.mjs`
  opened by itself, with none of the server's code. Over 850 decisions with
  12 actions and 340 with 60: every observation is exactly the one the replica
  shows before that decision; every stop flag is right; every reward equals
  0.1 x the progress gained in that decision (worst gap 7e-9); the
  environment's own shaped reward differs from plain progress on 835 of 850
  of those decisions, and the server's reward follows plain progress on all
  of them, so none of the shaped terms is in it. As a measure that does not
  use RacingEnv's progress at all, the car's position is projected on the
  reference line's segments here: each episode's rewards add up to the line
  distance from its start to the furthest point it reached, within one unit.
- **The finish.** A network that only ever holds W crosses the line on winter2
  when an episode starts late in the lap. Three episodes finish; each one's
  return is 0.1 x (line length - where it started) to 2e-7, and its stop flag
  is 1. The README lists this as checked only for its trigger.
- **Learner.update** on two problems with known answers (values 1 and 3 when
  the episode ends with the decision; 2 for reward 1 for ever at weight 0.5),
  and the double-Q target itself: with hand-set networks the target is
  return + weight x the TARGET network's value of the action the ONLINE
  network prefers.

## What is not covered, and why

- **Whether it learns to drive.** No training run was allowed. The toy run
  takes a few gradient steps and only looks at what goes into the buffer.
- The GPU, the default sizes (8 simulators, a 2-million-decision buffer),
  speed and memory figures, `--save-laps` and the export-and-Verify step (no
  lap has finished under a trained network), `--human-inputs 0`, `--ref-file`,
  `--failure-start`, `--own-start`, `--kick`.
- A time-limit cut-off (stop 2) coming from the real server: none of the
  33 episode endings seen here was a time limit. The buffer's handling
  of stop 2 is covered by the pure tests.
- The README's "a finish is still timed to the tick (winter2: 26831 both
  ways)": not repeated.

## Defects found

1. **Fixed. The evaluation lap broke the "next row is the next decision"
   rule of the replay buffer.** `train_iqn.py:265` drives the evaluation lap
   on simulator 0; `iqn_server.mjs:338` then makes that simulator start a new
   episode in the next round. The last row it had stored before the
   evaluation was still marked "the episode goes on" (stop 0), so n-step
   returns starting up to n - 1 rows before it collected rewards from, and
   took their estimate from, an unrelated episode elsewhere on the track.
   Seen in the toy run before the fix: lap fraction 0.017 followed by 0.264,
   0.335 by 0.260, 0.002 by 0.106 and 0.143 by 0.320, all under a "goes on"
   flag, and the 3-step return from the row before each reached two rows into
   the new episode. With the defaults (an evaluation every 50 rounds, 128
   decisions a round, 8 simulators) that is 2 wrong samples in every 51 200
   decisions, so the effect on learning was small, but the targets were
   wrong. Fix: `ReplayBuffer.cut(env)` (`replay.py:77`) marks the newest row
   of that simulator as a cut-off, and `train_iqn.py:269` calls it after the
   evaluation. `test_train_toy.py` failed three checks before the fix and
   passes after; `test_pure.py` checks `cut` itself.

Not defects, but not what a reader of the README would assume:

2. **Progress only counts forwards.** `rl/racing_env.mjs` looks for the
   nearest line point from the last one forwards only (`sim/line.mjs:59`), so
   a car that rolls or reverses back along the road loses at most half a unit
   of progress (0.05 reward), not the distance it went back; it earns nothing
   again until it passes its furthest point. In the dumps here 5 of 17
   episodes ended more than a unit behind their furthest point. The reward is
   therefore "0.1 x new road reached", which is what the test compares
   against. It cannot be farmed by driving back and forth. This is the
   existing environment's behaviour, not this idea's code.
3. `replay.py:137` (`sample`): if no row is a valid start (every held row is
   a cut-off or the newest), the redraw loop never ends. Only possible in a
   tiny buffer; the trainer's `--learn-start` keeps it away.
4. `train_iqn.py:269` assumes the evaluation uses simulator 0, which is
   `servers.evaluate`'s default. Calling `evaluate(server=k)` elsewhere needs
   `buffer.cut(k)`.

## Did the README's claims hold?

| Claim | Verdict |
| --- | --- |
| The reward is distance gained along the lap per decision and nothing else | Confirmed, with the note that distance lost is not charged (2 above) |
| At the finish, the rest of the line's length, so every finished lap has the same total | Confirmed on three real finishes (the README had only checked the trigger) |
| Node and PyTorch pick the same action | Confirmed: 150 of 150 (12 actions), 90 of 90 (60 actions), and from the file alone on 300 inputs x 3 sizes |
| Quantile loss equals a written-out loop; a hand-worked case; quantiles 10 / 50 / 90 | Confirmed with an implementation and hand cases of our own |
| n-step returns across endings, cut-offs, the newest row and the wrap | Confirmed against ground truth kept outside the buffer |
| Sampling never starts on a cut-off or the newest row, and covers the rest evenly | Confirmed |
| No "next observation" is needed: it is the next row | **Wrong at one place**: the row before an evaluation lap (defect 1, fixed) |
| Episodes carry on from one rollout into the next | Confirmed (the simulator that is never evaluated shows no break at round boundaries; the replica reproduces 850 consecutive observations across three rollouts) |
| Random actions hold W about 90% of the time, S 10% | Confirmed (88 to 90% and 10 to 12% over 400 and 250 random actions) |
| Epsilon per simulator: 0.1 down to 0.001 across 8 | Confirmed |
| 12 actions; 60 with `--slices 5`, a combination and its switch slice | Confirmed: the replica drives the 60 actions as block decisions with one shared slice and gets the server's observations and rewards exactly |
| Observations stored as float16 | Confirmed |
| `Learner.update` solves a problem with a known answer; double Q, target network | Confirmed on problems of our own |
| `--resume` "written but not exercised" | Now exercised at toy size: it continues the decision count and loads the network |
| The author's `test_units.py` (32 checks) and `smoke_test.py` pass | Confirmed: 32 and 8 checks, all passing (run after the fix above; they do not look at the row before an evaluation, so they could not see defect 1) |
| It learns to drive; speeds; cost of a full run; the 10 to 50 million decision estimate | Could not confirm: no training run |
