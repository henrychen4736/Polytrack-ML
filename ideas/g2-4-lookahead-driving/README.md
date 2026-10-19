# g2-4: look ahead while driving

Every 0.5 s the driver saves the simulator, drives the policy's own
continuation 2 s into the future, and if that one crashes it tries 24
alternatives (forced steering / pedal for 0.2 or 0.5 s then the policy, and
policy samples), commits to the first 0.5 s of the best, and carries on. If
nothing from the current point survives, it goes back up to 3 s and chooses
differently there. The simulator is exact, so a try-out that crashes would
have crashed for real.

Result in one line: on the three official tracks the generalist
(`ppo_blkgen.best2`) was not trained on, the plain policy finished 6 of 16
attempts and the lookahead driver 16 of 16 with the same seeds, at 9 to 39
times the simulator ticks of a plain lap (about 1 to 6 times slower than real
time on this machine while training was running).

## Files

- `lookahead.mjs`: `driveLap(renv, policy, options)`, the driver. Modes `plain`
  (no lookahead, the baseline), `lazy` (alternatives only when the policy's own
  continuation fails; the default) and `full` (all continuations at every replan).
- `drive.mjs`: command line: one track, one checkpoint, a list of seeds;
  verifies the fastest finished lap with the game's Verify.
- `smoke.mjs`: the smoke test (plain policy against lookahead, same seeds).
- `logs/`: output and one JSON line per attempt for every number below.

## How to run

From the project root. Weights files first (CPU, 1 s each; both already exist
for `ppo_blkgen.best2`, written by this work):

```
.venv/Scripts/python rl/export_actor.py rl/checkpoints/ppo_blkgen.best2.pt
.venv/Scripts/python ideas/shared/export_critic.py rl/checkpoints/ppo_blkgen.best2.pt   # only for score=value
```

```
# smoke test: winter4, seeds 10 and 12, one simulator, 64 s measured
node ideas/g2-4-lookahead-driving/smoke.mjs

# one track, one checkpoint; saves runs/g2-4-gen_winter4.json + .recording.json if verified
node ideas/g2-4-lookahead-driving/drive.mjs winter4 actor=rl/checkpoints/ppo_blkgen.best2.actor.bin seeds=10 out=gen

# the baseline, as rl/evaluate.py --policy sample
node ideas/g2-4-lookahead-driving/drive.mjs winter4 actor=rl/checkpoints/ppo_blkgen.best2.actor.bin mode=plain sample=1 seeds=10..19
```

All options are listed at the top of `drive.mjs`. `keep=<ms>` (with `out=`,
added 17 October 2026, off by default) also writes every different finished
lap of the attempts within that many ms of the fastest to
`runs/g2-4-<out>_<track>.candidates.json`, which
`ideas/g1-3-search-train-rounds/laps_bc.py` turns into imitation examples
(only the fastest lap is verified; the others are not checked one by one).

## Test set

The checkpoint's own record of its training tracks (`saved['track']` in
`ppo_blkgen.best2.pt`) is desert1, 2, 4, 5, summer1, 2, 4, 5, 6, 7, winter1,
2, 3, 5: 14 of the 17 official tracks. The unseen ones are **desert3, summer3
and winter4** (3 x 10 attempts = the "30" of the brief). winter3 is in the
training list, so it was not used. The reference is each track's standard
human lap, at `maxOffLine` 40 as in `BLOCK_ENV`.

## Numbers

Everything was run with at most two simulator processes while training was
running. `x ticks` is simulator ticks stepped, try-outs included, divided by
the lap's own ticks; `x real time` is wall time divided by the lap's duration.

### Plain policy on the unseen tracks (baseline)

| Track | sampled, seeds 10..19 | top choices |
| --- | --- | --- |
| desert3 | 1 of 10 (20.901 s) | stalled at 17.7% of the line |
| summer3 | 7 of 10 (20.882 to 28.195 s) | off track at 66.5% |
| winter4 | 1 of 10 (20.424 s); eight of the nine failures end at 66.7 to 66.9% | off track at 36.4% |

9 of 30 sampled (the brief says 7 of 30 from `rl/evaluate.py`; this is the
Node sampler with a different random stream). The top-choice policy finished
none of the three. A plain lap takes 0.15 to 0.25 x real time (5 to 8 thousand
ticks per wall second in `RacingEnv`, not the 34 thousand of the bare
simulator in the contract).

### Lookahead driver, defaults (lazy, horizon 40, every 10, backing up)

| Track | seeds | finished | lap times (s) | human (s) | plain, same seeds | x ticks |
| --- | --- | --- | --- | --- | --- | --- |
| desert3 | 10..15 | 6 of 6 | 20.793 to 21.313 | 20.302 | 1 of 6 | 16 to 32 |
| summer3 | 10..14 | 5 of 5 | 21.502, 21.503 | 20.276 | 5 of 5 (20.882 to 28.195) | 9.3 |
| winter4 | 10..14 | 5 of 5 | 19.819, 21.726, 21.749, 21.953, 25.069 | 19.311 | 0 of 5 | 9 to 39 |

16 of 16 against 6 of 16. Mean cost 17 x ticks; wall time 1.3 to 6 x real
time with two processes side by side, 1.0 and 1.4 x in the smoke test with
one. The cost is 5 x where nothing goes wrong (horizon / every + the commit)
and the rest is spent at the 2 to 11 replans per lap where the policy's own
continuation failed.

The seeds matter less than the count suggests: the driver follows the policy's
top choices until the first trouble, and the seed only changes the sampled
alternatives. Five seeds on a track are five variations of one lap (summer3
gave the same lap five times), not five independent attempts. What the table
does show is that all three unseen tracks can be finished, including the two
where the top-choice policy cannot get past 18% and 36%.

Laps are not faster than the plain policy's when that finishes: summer3
21.50 s against a median of 21.07 s for the five plain finishers on the same
seeds. This is a robustness tool; a rescued place costs time (winter4 seed 11
needed 4 back-ups and took 25.069 s).

### Design questions

**Replan only when the policy's continuation fails (lazy), or always (full)?**
Lazy. On winter4 seed 10, full with 12 continuations chosen by summed reward
took 22.773 s and 73 x ticks; lazy took 19.819 s and 8.7 x ticks. With forced
alternatives in the candidate set, the score picked a forced one at 16 of 49
replans and the lap got worse (it also drove itself into 2 dead ends that lazy
never met). One lap, so the size of the difference is not established, but
the direction and the cost are clear.

**Does it make a good driver slower?** Specialist `ppo_sr1_desert4.u800` on
desert4 (human 21.750 s), one lap each, all verified:

| Driver | Lap (s) | x ticks |
| --- | --- | --- |
| plain, top choices | 22.061 | 1 |
| lazy lookahead | 22.061 (the same lap: 0 of 42 replans in trouble) | 4.8 |
| full, policy + 4 samples, score progress | 21.988 | 19.6 |
| full, policy + 4 samples, score reward | 22.006 | 20.0 |
| full, policy + 4 samples, score value | 22.042 | 19.9 |

Lazy leaves a good driver exactly alone. Full lookahead over policy samples
only (no forced alternatives) was 19 to 73 ms FASTER than the policy here with
all three scores, progress included. That is the opposite sign from the
22.147 s warning in `search_rollout.mjs`, on one lap per setting; the
differences from that experiment are a 2 s horizon instead of 1 s and
replanning every 0.5 s. It is far short of what `search_rollout.mjs` gains
(21.907 s) and not what this idea is for.

**How to score.** In lazy mode the score only chooses among survivors at a
trouble spot. winter4, seeds 11 and 12: reward 25.069 / 21.726 s, progress
21.389 / 21.875 s, value 21.389 / 25.080 s. All finish; the spread between
seeds is larger than between scores, so two seeds do not separate them.
`reward` (summed training reward: progress at the human's pace minus contact)
stays the default because it is the only one that charges for hitting things
inside the horizon.

**What counts as failed.** Cut off by the environment, or slower at the
horizon than 0.4 x the human's speed at that place. The second rule is needed
because `stalled` only fires 2 s after the car stops, which is the whole
horizon. On desert4 with the specialist it never fired falsely (0 of 42).

**Horizon and replan interval** (winter4, seeds 10 and 12; default first):

| horizon, every | laps (s) | x ticks | back-ups |
| --- | --- | --- | --- |
| 40, 10 | 19.819, 21.726 | 8.7, 12.5 | 0, 0 |
| 20, 10 | 20.508, 20.289 | 7.6, 7.8 | 1, 1 |
| 40, 20 | 19.847, 19.996 | 7.0, 7.0 | 0, 0 |

A 1 s horizon sees trouble too late and has to back up. Replanning every 1 s
was cheaper and no worse on these two, and also finished desert3 seeds 10 and
11 (21.403, 22.506 s; 11.5 and 16 x ticks against 16 and 32). It may be the
better default; four laps are not enough to change it.

**Backing up.** Without it (first version, `logs/lazy.jsonl`), desert3 seeds
11 and 12 ended off track at 53.4%: at the last replans all 25 continuations
failed. Two cures were measured on seed 11: horizon 80 without backing up
finished in 22.669 s at 39.8 x ticks; horizon 40 with backing up finished in
20.793 s at 31.8 x ticks. Backing up is kept. It is not free on other laps:
winter4 seed 11 finished in 23.582 s without it (a "failed" continuation was
committed and the car recovered) and 25.069 s with it.

## What was verified

- Smoke test: 5 of 5 checks pass in 64 s (`logs/smoke.txt`): lookahead gets at
  least as far as the plain policy on both seeds (finished against stalled at
  66.8%), the committed decisions driven again from the start line end on the
  same tick, and the fastest lap passes the game's Verify.
- `drive.mjs` runs Verify on the fastest finished lap of each run (pass at the
  finish tick, fail one tick earlier, same tick as the driver reported). Every
  run above printed `verified`. Runs with several seeds verified only their
  fastest lap; the other finished laps are the environment's `finished`,
  which has matched Verify every time it was checked.
- Saved, verified laps: `runs/g2-4-gen_winter4` (19.819 s), `g2-4-gen_desert3`
  (20.793 s), `g2-4-gen_summer3` (21.503 s), `g2-4-spec-lazy_desert4`
  (22.061 s), each as `.json` and `.recording.json`.

## Not done, not tested

- Still needs a reference lap: the policy's inputs, the `off line` /
  `off track` cut-offs, `progress` and the "too slow" rule all come from the
  human lap. For a community track this driver needs either a reference-free
  observation or a computed reference lap (g2-1 / g1-7); the driver itself
  only needs "failed or not" and a score, which `track_info.progress` plus
  body contact could supply.
- Only one generalist checkpoint, three unseen tracks, 5 or 6 correlated seeds
  each. No community track.
- Design comparisons are on one or two laps each; they show what works, not
  which setting is best.
- The fresh-car path (more than 4.5 million ticks in one lap) is written but
  was never reached: the costliest lap used about 1 million.
- The try-outs run one after another in one simulator. The 24 alternatives at
  a trouble spot are independent and could go to a pool of processes.
- No use of the laps for training (the finished laps on unseen tracks are
  demonstrations a generalist could be trained toward with `rl/lap_bc.py`).

## Changes needed elsewhere

None. Two notes for the orchestrator: `rl/checkpoints/ppo_blkgen.best2.actor.bin`
and `.critic.bin` were written by the export scripts; and the contract's
34 000 ticks per second is the bare simulator, `RacingEnv.stepBlock` measured
5 to 10 thousand here.

## Cost of a full run

Ten seeds on each of the three unseen tracks: 30 laps of about 21 s at 17 x
ticks on average is about 11 million ticks, 25 to 35 minutes with two
processes at the 5 to 8 thousand ticks per second measured. All 17 tracks
with ten seeds: about 2.5 hours with two processes, 40 minutes with eight.
