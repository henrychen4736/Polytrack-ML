# g2-3 Explore and adapt

On a track the generalist has not seen, get one finished lap by exploring from
save states: restart a little before wherever the furthest attempt ended, try
varied continuations, keep whatever gets further (the Go-Explore idea), until
something crosses the finish line. That lap then becomes imitation examples
for a short fine-tune on the track. The explore half is built and measured;
the fine-tune half is a printed command list and has not been run.

## Files

| File | What |
| --- | --- |
| `explore.mjs` | the explore loop for one track and one checkpoint; `mode=plain` is the comparison (ordinary attempts from the start line) |
| `analyze.mjs` | reads the logs in `out/` and prints progress against simulated laps used, and which restarts moved the frontier |
| `smoke_test.sh` | explore, then plain, on one track with the same budget (37 s of wall time on winter4) |
| `finetune_plan.sh` | DRY RUN: prints the fine-tune commands, runs nothing |
| `out/*.json` | one log per run: every attempt (where it started, kind, where and how it ended) |

## How to run (from the project root)

```sh
# once: the generalist's policy weights for the Node side (already done)
.venv/Scripts/python rl/export_actor.py rl/checkpoints/ppo_blkgen.best2.pt

# explore one track; writes runs/g2-3-explore_<track>.json + .recording.json if a lap is found
node ideas/g2-3-explore-and-adapt/explore.mjs winter4
node ideas/g2-3-explore-and-adapt/explore.mjs winter4 mode=plain laps=10 seed=3 out=g2-3-mytest

# the smoke test, and the tables
sh ideas/g2-3-explore-and-adapt/smoke_test.sh winter4 6 1
node ideas/g2-3-explore-and-adapt/analyze.mjs g2-3-b

# the fine-tune commands (printed, not run)
sh ideas/g2-3-explore-and-adapt/finetune_plan.sh winter4
```

Options are listed at the top of `explore.mjs`. One simulator, one process.
The run ends with either `FINISHED LAP: ... Verify passed` or `NO FINISHED
LAP`, the furthest point, how the attempts near it ended, and how the car was
arriving there.

## The test set

The checkpoint `rl/checkpoints/ppo_blkgen.best2.pt` lists its training tracks:
desert1, desert2, desert4, desert5, summer1, summer2, summer4, summer5,
summer6, summer7, winter1, winter2, winter3, winter5 (14 tracks; desert1 and
summer6 are listed twice). So the tracks it has not seen are **desert3, summer3
and winter4**, and all three were used. winter3 IS in its training list, so it
is not a test track, whatever was watched there earlier. The reference lap in
every run is the track's standard human lap (`refLap: -1`).

This is the constraint to be straightforward about: the generalist's inputs
include a human lap's line, and `rl/racing_env.mjs` cannot run without a
reference lap. So "unseen" here means an official track held out of training,
driven WITH its human lap as reference. Nothing here has been tried on a
community track.

## What was measured

The budget is counted in simulated time, as "laps": ticks driven divided by
the human's lap time on that track. A restart from a save state costs the
seconds it drives, a plain attempt costs the whole way from the start line.
Both modes stop at their first finished lap. Every finished lap below was
replayed from the start line on a fresh simulator and passed the game's
Verify, with the lap one tick shorter rejected (`ideas/shared/verify.mjs`).

Runs that had a finished lap, and the mean furthest point (% of the lap), by
simulated laps used. Explore: final settings, seeds 1..8 on winter4 and 1..5
on the other two. Plain: seeds 1..8 on winter4, 1..5 on the other two.

| track, mode | runs | 1 lap | 2 laps | 3 laps | 5 laps | 8 laps | 10 laps |
| --- | --- | --- | --- | --- | --- | --- | --- |
| winter4 explore | 8 | 0, 36% | 0, 36% | 3, 75% | 3, 79% | 7, 96% | **8**, 100% |
| winter4 plain | 8 | 0, 36% | 0, 53% | 0, 67% | 0, 67% | 0, 67% | **0**, 67% |
| desert3 explore | 5 | 0, 31% | 1, 48% | 3, 86% | 4, 91% | 5, 100% | **5**, 100% |
| desert3 plain | 5 | 0, 18% | 0, 44% | 2, 88% | 2, 88% | 2, 90% | **3**, 94% |
| summer3 explore | 5 | 0, 66% | 5, 100% | 5, 100% | 5, 100% | 5, 100% | **5**, 100% |
| summer3 plain | 5 | 0, 66% | 2, 80% | 4, 93% | 5, 100% | 5, 100% | **5**, 100% |

Reading it honestly:

- **winter4** is the case the idea is for. Plain attempts stop at 66.7 to
  67.2% every time (0 of 8 runs, about 105 attempts in all, counting the
  ones that ended earlier). Explore found a lap in all 8 runs, after 2.7 to
  9.4 simulated laps (median 5.5), 9 to 62 attempts.
- **desert3**: plain finishes sometimes (3 of 5 runs inside 10 laps); explore
  finished in all 5, after 1.3 to 6.5 laps.
- **summer3** is not a hard case for this checkpoint: the top-choice lap ends
  at 66% and almost anything else finishes. Explore is ahead only because its
  second attempt starts from a save state, not from the line.
- Explore is not better everywhere early on: on winter4 at 2 laps it is
  BEHIND plain (36% against 53%). The top-choice attempt leaves the road at
  36.4%, explore spends about a lap of budget restarting close to that spot,
  while a plain sampled attempt simply drives past it. See "not done".
- 5 to 8 seeds per cell. The winter4 difference (8 of 8 against 0 of 8) is
  clear; the desert3 difference (5 of 5 against 3 of 5) is not.
- The laps found are slow and not clean: 19.920 to 25.539 s on winter4
  (human 19.311 s), 20.976 to 25.781 s on desert3 (human 20.302 s), 21.678 to
  21.749 s on summer3 (human 20.276 s). They are a lap to learn from, not a
  result against the human.

Smoke test (`sh smoke_test.sh winter4 6 1`, 37 s of wall time, one simulator
at a time, training running on the machine): explore finished on attempt 11
after 2.85 laps, 19.920 s, Verify passed; plain used 6.72 laps on 8 attempts
and stopped at 66.9%, all six attempts near it `stalled`, arriving on average
2.9 units left of the line at 435 km/h.

### Design questions, and what the logs say

**How far back to restart.** The first version backed off in levels of 1.5,
3, 5, 8 and 12 s. Over 15 runs on the three tracks, 0 of 33 restarts from
more than 5 s behind the frontier moved it, against 33 of 195 from closer.
The levels are now 1.5, 3, 5 s and go round again after the last. With those
settings (18 runs): 20 of 203 restarts from up to 1.5 s back moved the
frontier (10%), 16 of 77 from 1.5 to 3 s (21%), 1 of 14 from 3 to 5 s. So 1.5
to 3 s is the best single distance, shorter than the 2 to 6 s training uses,
and the close restarts are cheap enough to be worth trying first. On winter4
the change took finished runs within 10 laps from 3 of 5 to 8 of 8 (different
seed counts, so take the direction, not the size).

**How to vary continuations.** Four kinds, picked at random: the policy's
usual randomness (`sample`), a raised temperature of 2 for 0.5 to 1.5 s
(`hot`), steering forced to one side for 0.1 to 0.4 s (`kick`), W released
with or without S for 0.2 to 0.6 s (`lift`). With the final settings they
moved the frontier on 13%, 16%, 12% and 10% of restarts (72 to 78 restarts
each): no kind is clearly better. Dropping `sample` made no difference on
winter4 (8 of 8 either way, median 5.3 against 5.5 laps), so all four stay.
The model-guided mutations of `search_rollout.mjs` were NOT tried: they
change one decision of an existing finished lap, and here there is no
finished lap to change.

**An archive that is not one line.** Cells are 20 units of road by 2 units
sideways; a cell keeps the state that reached it soonest. A run holds 73 to
131 cells. The sideways cells did get used, but restarts from cells more than
3 units off the line moved the frontier less often (9% of 140) than cells
within 1 unit (23% of 56). That is a hint that off-line cells should be picked
less often; it is not acted on, because the two are confounded (cells close
to a crash are also the ones furthest off the line).

**What a lost cause looks like.** Not detected directly. The loop treats it
by outcome: a cell is picked with weight 1 / (1 + tries), and four attempts
in a row without a new frontier move the restart window further back. On
winter4 the states inside the last 1.5 s before the 66.8% crash are the lost
causes in practice: the laps that got through started 1.5 to 3 s back.

## Fine-tune (dry run only)

`sh ideas/g2-3-explore-and-adapt/finetune_plan.sh winter4` prints four steps:
the found lap to imitation examples (`rl/lap_bc.py`), `rl/train_ppo.py` from
a copy of the generalist with an imitation weight of 0.05 towards them
(500 000 decisions), ten attempts before and after, and explore plus
`search_rollout.mjs` again with the adapted policy. It follows
`scripts/search_round.sh`, with the training command written out so the
checkpoint can be named `g2-3-adapt_<track>.pt`.

Only step 1 was run, as a check that a found lap is usable:
`rl/checkpoints/g2-3-bc_winter4.npz`, 398 decisions (19.90 s of the 19.920 s
lap), so the whole lap stays within 40 units of the human's line. Steps 2 to
4 were not run.

## Not done, not tested

- **The fine-tune.** Whether training towards one slow, scrappy lap makes the
  generalist finish the track from the start line is the actual question of
  "adapt", and it is untested. 500 000 decisions is a guess.
- **No reference-free version.** Progress, the archive's cells and the
  cut-offs all use the reference line (`renv.progress`, `renv.lateral`). On a
  community track the cells would need `track_info.mjs` `progress` (coarse
  between gates) or g2-1's route, and a policy that needs no human lap.
- **Stopping at the first finish.** The loop does not go on to find a better
  lap; `search_rollout.mjs` needs a policy that finishes on its own, which is
  what the fine-tune is for.
- **Wasted budget is visible in the logs and not fixed.** A stalled attempt
  drives 2 s against a wall before the environment calls it (about 0.1 lap
  each). After a top-choice attempt fails early, a plain sampled attempt from
  the line would often be the better second try (winter4 at 2 laps).
- **One process.** Save states live in one simulator, so the loop is not
  parallel. The car tick budget (4.5 million ticks, about 230 winter4 laps)
  is handled by replaying a cell's decisions on the new car; no run came near
  it, so that path has never executed.
- **One checkpoint**, `ppo_blkgen.best2.pt`, and three tracks.

## Changes needed elsewhere

None for what exists. Two that would help:

- `rl/racing_env.mjs`: an option to end an attempt on a hard body contact or
  a collapse in speed, so a search does not pay 2 s for every wall.
- `scripts/train_block_specialist_from.sh`: take the checkpoint name as given
  (it forces `ppo_<prefix>_<track>.pt`), so idea runs can use it directly.

Files written outside this folder, all with the idea's prefix:
`runs/g2-3-*` (100 files: the verified laps of every run above;
`runs/g2-3-explore_{winter4,desert3,summer3}.recording.json` are the laps of
the default command), `rl/checkpoints/ppo_blkgen.best2.actor.bin` (export of
an existing checkpoint) and `rl/checkpoints/g2-3-bc_winter4.npz`. Two early
runs (`g2-3-s1_desert3`, `g2-3-s4_desert3`) hold the plain-mode lap, not the
explore one: plain laps did not yet have their own name.

## Cost of a full run

Explore: 10 simulated laps of one track take 10 to 35 s of wall time on one
simulator with training running; the whole table above (41 runs) took about
25 minutes run one after another. Fine-tune, if run as printed: about 10
minutes per track with 8 simulators and the GPU (850 decisions per second in
the sr2 logs), plus 21 evaluation attempts.
