# g1-3: unattended rounds of "search, train toward the searched lap, search again"

`scripts/search_round.sh` does one round and leaves the decisions between
rounds to a person. `rounds.mjs` runs as many rounds as asked on one track
without supervision: it carries the fastest verified lap forward, picks the
copy to search with, stops when rounds stop paying, and picks up where it was
after a shutdown. No round has been run with it: the practice step is an hour
of GPU training, which was not allowed here. What was and was not exercised is
listed below.

## Run it

From the project root. One launch works on one track; run one launch per track
side by side, as round 1 and 2 were.

```sh
# first launch on a track: the checkpoint to start from and every searched lap so far
node ideas/g1-3-search-train-rounds/rounds.mjs desert4 rounds=3 \
  base=rl/checkpoints/ppo_sr1_desert4.u800.pt \
  lap=runs/rollout_desert4.recording.json,runs/rollout_r1_desert4.recording.json

# every later launch (after a shutdown, after "out of time", or to raise the target)
node ideas/g1-3-search-train-rounds/rounds.mjs desert4 rounds=3

# what would it do now? runs and writes nothing
node ideas/g1-3-search-train-rounds/rounds.mjs desert4 rounds=3 dry=1

# the tests
node ideas/g1-3-search-train-rounds/test_restart.mjs    # decisions and restart logic, about 2.5 min
node ideas/g1-3-search-train-rounds/smoke_real.mjs      # a real launch of everything but the practice, about 3.5 min
```

`rounds=N` is a total for the track, not "N more". Exit codes: 0 the target is
reached or the track has stopped, 3 out of time (launch again), 2 another
launch holds the track, 1 error. All settings and their defaults are
`DEFAULTS` in `lib.mjs`; a mistyped setting is an error.

To take over a track from the hand-run rounds, give `base=` the copy that
round picked and `lap=` all the laps searched so far; the driver verifies each
and trains towards the fastest.

Files: `rounds.mjs` (the driver), `lib.mjs` (every decision as a plain
function), `laps_bc.py` (imitation examples from one or several laps),
`ckpt_steps.py` (reads a checkpoint's step counter), `test_restart.mjs`,
`smoke_real.mjs`.

What a round writes:

| What | Where |
| --- | --- |
| state (best lap, next checkpoint, each round's picks and results) | `ideas/g1-3-search-train-rounds/work/<track>/state.json` |
| **results table** | `ideas/g1-3-search-train-rounds/results/<track>.txt` |
| training log, test output, search logs | `ideas/g1-3-search-train-rounds/work/<track>/` |
| checkpoint, kept copies, examples | `rl/checkpoints/g1-3-<track>-r<n>.pt`, `.c<update>.pt`, `-bc.npz` |
| searched laps | `runs/g1-3-r<n>s<k>_<track>.recording.json` (and `.json`) |

The results table, as the smoke test wrote it (the numbers are from a 30 s
search with two processes and mean nothing):

```
round  starting lap  copy picked  finishes  policy alone  searched lap  gain (ms)
    1      21.907 s        c1220       1/1      22.067 s      22.004 s        -97
```

## The decisions, and why

**Which lap to train towards.** The fastest lap that passes the game's Verify,
from any round. Every lap is verified by the driver itself (played from the
start line; Verify must pass on the claimed tick and fail one tick earlier),
whatever the file or a log says. On desert4 this means round 2 trains towards
round 0's 21.907 s, not round 1's 21.913 s. (The round 2 running now does the
same: `bc_search_r2_desert4.npz` is identical to the examples of the 21.907 s
lap.)

**Which checkpoint the next round starts from.** The copy picked in the latest
round, also when that round's lap was slower. Going back to the older
checkpoint would repeat the same round, and the newer one has practised more:
desert4's round 1 lost 6 ms on the searched lap while the policy's own best
lap improved by 26 ms (22.061 to 22.035 s).

**Which copy to search with** (`pickCopy` in `lib.mjs`). Finishes out of ten
do count, as a gate and as a tie-break, but not as the score:

1. copies that finished fewer than `minFinishes` (8) of their ten sampled laps
   are set aside (if none passes, those with the most finishes stay);
2. the score is the mean of the three fastest sampled laps;
3. scores within `closeMs` (10) of the best count as equal, and then more
   finishes wins.

Why: the search starts from the fastest of sixteen laps the policy drives by
itself, so its fast laps matter rather than its typical lap; but the single
fastest of ten, which the shell script uses, is one draw (summer4's picked
copy had 34.741 s and then 34.918 s). And more than half of the search's
candidates let the policy drive the rest of the lap, so a copy that crashes
often wastes search time (summer4's round-1 search had 55% of candidates
finish in time, desert4's 81%). On the round-1 data this rule picks the same
copy as the script on summer1, summer4 and winter2 and a different one on
desert4 (update 1000 instead of 800). **Whether it leads to faster searched
laps has not been measured.** `pick=best` is the script's rule.

**When to stop** (`concludeRound`). A round pays if its lap beats the best lap
before it by at least `minGain` (10 ms). `patience` (2) rounds in a row that
do not pay stop the track. On desert4, round 1 (gain -6 ms) is one such round;
a second would stop it. The track also stops if no kept copy finishes a lap in
testing.

**Restarting.** Each step asks the files what is already done:

- examples: the file exists (it is written under another name and renamed);
- practice: the step counter inside the checkpoint says how many of the
  round's updates are done. The rest is run as a new leg with
  `--total-steps` for what is left, a learning rate that continues the
  round's straight line, and no second critic warm-up (`trainPlan`). The
  trainer's kept copies, which it numbers from the start of the process, are
  renamed after the round's update count;
- test: an attempt is done when its output has a result line, so only missing
  or cut-off attempts run;
- search: done when its lap exists and verifies, otherwise run again.

**The two-hour limit.** A launch stops itself after `minutes` (105): a leg of
practice is sized to end before then and is stopped if it has not; a test or
search that would not fit is left for the next launch. `rounds=1` and
`rounds=10` are equally safe to launch. A lock file stops two launches working
on one track.

**The search writes its lap only at the end** (how winter2's round-1 result
was lost). Worked around without touching `search_rollout.mjs`: a round runs
three searches of 200 s with different seeds instead of one of 600 s and keeps
the fastest verified lap, so a shutdown costs at most the search in progress.
The round-0 logs support the shorter budget (the first pass, 186 to 240 s,
found 154 of 154, 106 of 107, 364 of 368 and 141 of 141 ms of the gain), but
three separate searches do not build on each other and **3 x 200 s against
1 x 600 s has not been measured**. `searches=1 searchSeconds=600` is the old
behaviour.

**More examples than one lap.** Two things are possible without changes
elsewhere, and one is not:

- Built: each round now ends with up to three different verified laps.
  `extraLaps=2` adds to the imitation set up to two other verified laps (from
  any round) within `extraWithin` (50) ms of the best; `laps_bc.py` repeats
  the best lap so it stays at least half of the examples. **Off by default**,
  because whether it helps is unmeasured and the default should reproduce the
  round that gained. `tag=` runs a second series on the same track beside the
  first, for exactly this comparison:
  `rounds.mjs summer4 tag=x2 extraLaps=2 base=... lap=...`.
- Not possible from outside: the thousands of finished candidates inside one
  search. They exist only in the memory of `search_rollout.mjs`; see below.

## What was tested

`test_restart.mjs`: 41 checks, all passing (2.5 min, one simulator at a time,
CPU only). It copies the real round-1 files into scenario folders under the
driver's names and runs the driver with `dry=1`.

- The decision functions on the real round-1 test output: `pick=best`
  reproduces what `search_round.sh` picked on all four tracks; the default
  rule picks u1000 on all four; finishes are counted as the script printed.
- First launch with two laps, the later one slower: both verify, 21.907 s is
  trained towards.
- Shutdown before practice: one leg of 1220 updates with the warm-up.
- Shutdown 400 updates into practice (real `u400` checkpoint): 820 updates
  left, `--lr 0.0000336066`, no warm-up, the stray `u200` copy renamed, the
  base not copied over the checkpoint; with 20 minutes a leg of 510 updates
  whose learning rate ends where the next would start; with 3 minutes no leg.
- Shutdown at update 1000: the checkpoint is kept as a copy for testing.
- Shutdown during testing, one attempt cut off: 12 of 44 attempts run again.
- Tests complete: pick and the three search commands.
- winter2's real interrupted search (log stops at 502 s, no lap): run again.
- A lap file claiming one tick too few is not accepted.
- desert4 round 1 complete: gain -6 ms, 21.907 s stays the best, round 2
  starts from the picked copy and trains towards the round-0 lap; with a
  previous strike the track stops. summer4: gain 189 ms, the new lap becomes
  the best.
- A dry run changes no file.

`smoke_real.mjs`: 11 checks, all passing (3.5 min; at most 2 simulators). A
real launch on desert4's real round-1 checkpoint, set up as "practice just
finished", in a separate series (`tag=smoke`), cut down to 2 test attempts and
one 30 s search with 2 processes. Launch 1 with one minute made the examples,
saw practice as done and exited 3; launch 2 ran the tests, picked, exported
the weights, searched, verified the lap (22.004 s, slower than 21.907 s, so
not carried forward) and wrote the results; launch 3 had nothing to do. Its
files were removed afterwards.

`laps_bc.py` with one lap writes arrays identical to `rl/lap_bc.py`'s
(compared with `bc_search_r1_desert4.npz`: 438 examples, equal); with two laps
876 examples.

## What was not tested

- **The practice step has never been run by this driver.** The command is
  built from `train_block_specialist_from.sh` plus the four leg options, and
  only printed. Not seen working: a real leg, a real continuation after an
  interruption, the renaming of copies a real leg leaves, stopping the trainer
  at the time limit (`taskkill /T`).
- A complete round, several rounds in a row, and the stop rule firing on live
  results.
- The lock refusing a second live launch (only its clean removal was seen).
- Testing at full width (44 attempts, 8 at a time); the 40 s per attempt used
  for the time check is a guess.
- Whether the `top3` pick, 3 x 200 s searches, or `extraLaps` give faster laps
  than what round 1 did.

The first real launch should be watched through one practice leg. To check a
continuation cheaply: stop it after a few minutes and launch again; the second
launch should print "N of 1220 updates done ... continuing".

## Changes needed elsewhere

1. **`scripts/search_round.sh` / `train_block_specialist_from.sh` are not safe
   to rerun after an interruption.** The second copies the base checkpoint
   over `ppo_<prefix>_<track>.pt` whenever it starts, discarding the practice
   done so far, and `--total-steps` then runs the whole amount again. This
   applies to the round 2 running now: if it is cut off during practice, do
   not rerun the same command.
2. **`scripts/search_rollout.mjs` should write its best lap as it goes** (after
   every section) and accept `start=<lap>` to continue from one. That removes
   the reason for 3 x 200 s and lets a search build on the best lap of an
   earlier round instead of always starting from the policy's own laps.
3. **`scripts/search_rollout.mjs` could keep its near-best candidates.** Every
   finished candidate comes back with its decisions and finish tick; an option
   that writes those within, say, 30 ms of the final best to a file would give
   hundreds of laps per search. `rl/lap_bc.py` labels from keys through
   `demo()`, which is the right labelling (it marks "no change" slices), so
   the file should hold keys or go through `decisionsToKeys` in
   `ideas/shared/laps.mjs`.
4. **`rl/train_ppo.py --resume` continues the weights but not the run**:
   `--total-steps`, the learning-rate line, `--critic-warmup` and the
   `.u<update>.pt` names all count from the start of the process. A
   `--target-steps` (stop at this step count, schedule over the whole run)
   would replace `trainPlan` and the renaming here.
5. Minor: `rl/evaluate.py` always saves a 1.4 MB lap file; the driver deletes
   those of its own test attempts (`keepAttempts=1` keeps them).

## Cost of a full run

One round on one track: examples 10 s; practice 34 to 41 min (1220 updates at
36 per minute alone, 30 assumed under load; GPU plus 8 simulator processes);
testing 44 attempts, a few minutes with 8 processes; three searches of about
4 min each with 8 processes. About 50 to 60 minutes, so two rounds do not fit
in one two-hour launch: expect one "out of time" exit and relaunch per round
or two. Disk per round: about 30 MB of checkpoints and 5 MB of laps. Four
tracks side by side is four launches, as rounds 1 and 2 were run.

## Changed after independent testing

`tests/` holds an independent test suite (`node
ideas/g1-3-search-train-rounds/tests/run_tests.mjs`; see `tests/TESTING.md`).
One change to the code came out of it:

- `lib.mjs` `trainPlan`: a leg that continues a round interrupted inside the
  30-update critic warm-up now asks for the warm-up updates still owed
  (`max(0, warmup - updates done)`) instead of none. `train_ppo.py` counts
  `--critic-warmup` from the start of the process and writes the checkpoint
  every 10 updates, so an interruption at update 10 or 20 used to drop the
  rest of the warm-up. From update 30 on nothing changes ("no second
  warm-up" above still holds).
