# Polytrack-ML

Machine learning and search for fast laps in PolyTrack 0.6.3, run against the
game's own physics headlessly in Node. The owner is Henry.

Two goals:

1. A lap **faster than the best human lap** on at least one track, by any means.
2. A **generalist** that can drive any track, community tracks included,
   reasonably well after a few attempts.

`README.md` has setup and commands. `ideas/README.md` has the twelve side
approaches and their results. This file holds what those do not: the rules,
the conventions, the state of every model, and how each one came to be.

## Hard rules

- **Local use only.** Bot laps are never submitted, uploaded, or placed where
  the game client could upload them (it uploads any stored lap that beats the
  server's copy, so a bot lap never goes into a normal browser's
  localStorage). `scripts/watch_ghost.mjs` uses a temporary Edge profile with
  `vps.kodub.com` blocked.
- **No network.** The only script that contacts Kodub's server is
  `scripts/fetch_laps.mjs`, and it only reads.
- **`data/` stays out of git.** It is Kodub's captured geometry and other
  players' leaderboard laps. So do `ideas/g1-1-human-seed-search/out/` and
  `ideas/g1-7-computed-racing-line/out/`, which derive from those laps. The
  repository is public (`github.com/henrychen4736/Polytrack-ML`); the history
  was rewritten on 10 October 2026 to remove these paths.
- **Stopping training:** kill only processes whose command line contains
  `rl/train_ppo.py` (or `train_iqn.py`), then confirm the simulator processes
  have exited. Henry's own jobs (`transcribe.py`, an Adobe `node.exe`) stay
  untouched. `TaskStop` on a job started through a shell script ends only the
  outer script and leaves the trainer and its simulators running.

## Working with Henry

- **Answer in the first line**, then give detail. He asked for this directly.
- **Commit only when he asks.** Commit messages carry no `Co-Authored-By`
  line; author and committer are `Henry Chen <henrychen4736@berkeley.edu>`.
- **Commands for him start with** `cd C:\Users\Henry\Documents\GitHub\Polytrack-ML`.
  His terminal opens in `C:\Users\Henry`.
- **Use graphify.** Run `graphify query "<question>"` before reading files to
  find code, and `graphify update .` after changing code.
- **Report results as measured.** Give finishes out of attempts and lap times
  against the human lap, say what was not tested, and correct an earlier
  claim in plain words when a better test overturns it.
- He shuts the machine down without warning. Anything long-running needs
  kept copies and a way to resume.

## How the car should be driven (Henry's knowledge of the game)

- W and S are held continuously or not at all. Tapping them is a fault.
- Holding S in the air rotates the car to land flat ("air brake"). Humans hold
  it for the whole flight on most jumps.
- A and D are tapped quickly, but deliberately, on specific turns. On a
  straight the car should hold W and touch nothing else.
- The car should not touch walls. A scrape means the direction was right and
  the line was a little off.
- Closing fast on a wall is legitimate technique and is never penalised as such.

## Coding conventions

- **Comment thoroughly, and say why.** Every file opens with a block comment:
  what it is for, how it works in plain terms, how to run it, and "Local use
  only" where it drives the simulator. Comments give the measured number that
  motivated a choice ("measured 1.6 times faster"), and record approaches that
  were tried and dropped, with the result.
- **Plain language** in comments and output. Units are always stated: a tick
  is 1 ms, a decision is 10 ms (old scheme) or 50 ms (block scheme).
- **Node side:** ES modules (`.mjs`), Node 20+, two-space indent, no
  dependencies beyond the project's own. Simulators run in separate
  processes (`sim/pool.mjs`); threads inside one process do not scale.
- **Python side:** one self-contained file per job, PyTorch only, `argparse`
  flags in kebab-case with a help string each. Use `.venv/Scripts/python`
  (CUDA PyTorch 2.6.0+cu124) and `--device cuda` for training.
- **Scripts run from the project root** and take `key=value` options (Node)
  or flags (Python). Shell wrappers are `sh` with a header comment.
- **Bash heredocs with mixed quotes fail here.** Write a patch script to the
  scratch directory with the Write tool, run it, delete it.
- **Names.** Checkpoints: `rl/checkpoints/ppo_<family>_<track>.<copy>.pt`,
  where the copy is `u<update>` (kept every N updates), `after_<steps>`,
  `final`, or `best`. Run files: `runs/<run>_<track>.json` and
  `.recording.json`; a run name holds only letters, digits, `_` and `-`.
  Files written by an idea start with its id (`g1-4-...`).
- **Verify before claiming.** A lap time counts only when the lap finishes
  and the game's own Verify passes on that tick and fails one tick sooner
  (`scripts/export_recording.mjs`, or `ideas/shared/verify.mjs`).
- **Tests.** `npm test` for the simulator; `node ideas/run_all_tests.mjs` for
  the ideas (1884 checks, 5 known failures listed in each `tests/TESTING.md`).
  Tests for a piece of code are written by someone who did not write it.

## Training and testing practice

- **Stretches.** Training runs in stretches of about two hours. The learning
  rate fades to zero within each stretch (`--lr-end 0`); a checkpoint saved
  mid-fade is not trusted.
- **Kept copies.** `--keep-every N` saves a copy every N updates. A run can
  get worse as well as better, so the copy to use is chosen by test, never
  assumed to be the last.
- **The ten-attempt test.** Ten attempts per track from the start line with
  the policy's usual randomness (seeds 10 to 19), plus one "greedy" attempt
  with top choices only. Generalists: `scripts/eval_generalist.sh` (17 tracks,
  170 attempts). Specialists: `scripts/eval_block_specialist.sh`. Three
  attempts per track cannot tell checkpoints apart.
- **Training-log finish counts overstate reliability**: they include starts
  part-way round the lap, which are easier.
- **"best lap" in a specialist's log** is a leftover from the checkpoint it
  was copied from (15.856 s or 15.424 s), not a lap on that track.
- **Reward numbers are not comparable across reward changes.** Finish counts
  and lap times are.

## Terms

- **Human lap / reference.** Lap 0 of `data/laps/<track>.json` is the best
  human lap. The training environment needs a reference lap: its line, speeds
  and keys are in the model's inputs and its line measures progress.
- **Old scheme.** One decision per 10 ms from 12 key combinations, W and S
  re-read every 50 ms.
- **Block decision.** One decision per 50 ms: for each of steering, W and S, a
  target and the 10 ms slice in which it switches. 22 output scores, six
  choices. Checkpoints record `num_actions` 1500 as a marker for this mode.
- **Generalist / specialist.** A policy trained on many tracks / on one.
- **Held-out tracks.** desert3, summer3 and winter4: no generalist has trained
  on them. The 14 training tracks are desert1, 2, 4, 5; summer1, 2, 4, 5, 6,
  7; winter1, 2, 3, 5.

## Status (12 October 2026)

**Goal 1 is met by search on human laps, not yet by a model.**

| Track | Best human | Human lap re-timed by search | Best lap a model drives |
| --- | --- | --- | --- |
| desert4 | 21.750 s | 21.709 s | 21.880 s (PPO + search), 21.957 s (IQN, unverified) |
| winter2 | 26.830 s | 26.775 s | 27.020 s |
| summer1 | 22.131 s | 22.104 s | 22.334 s |
| summer4 | 34.105 s | 34.069 s | 34.500 s |

**Goal 2 is open.** The best generalist (`ppo_blkgen.best2.pt`) finishes 139
of 170 attempts overall: 132 of 140 on its training tracks, 7 of 30 on the
held-out three. Lookahead driving and save-state exploring get it round all
three, but only winter4 shows an advantage over simple retries at equal cost.
Every model still needs a human lap as reference, so none can run on a
community track.

## Model history

`docs/model-history.md` is the full record of every model trained: 16
families, each with what it was built from, what changed, the training, the
test results, and why it was kept or dropped. Read it when you need to know
why a model exists or was abandoned, which checkpoint a model was copied
from, what an earlier approach scored, or before proposing an approach that
may already have been tried. The table below is the index.

| # | Family | What it was | Verdict |
| --- | --- | --- | --- |
| 1 | `ppo_summer1` | First single-track agent | Memorised one track |
| 2 | `ppo_general` | First generalist, 14 tracks | 9 of 51; replaced |
| 3 | `ppo_general2` | + road edges, contact penalty | 31 of 51; tapped W |
| 4 | `ppo_general3` | + held keys, imitation start | 114 of 170; old-scheme benchmark |
| 5 | `ppo_follow` | Follow the reference lap | Peaked below #4; dropped |
| 6 | `ppo_rays` | + 17 distance rays | No gain over #4 |
| 7 | `ppo_spec_*` | First specialists | Wobbly on straights |
| 8 | `ppo_spec2_*` | + steering costs | Superseded by blocks |
| 9 | `ppo_block.bc.pt` | Block scheme, imitation only | Start for all below |
| 10 | `ppo_blk_*` | Set 1: specialists from imitation | Clean driving, slower |
| 11 | `ppo_blkgen` | Block generalist | 139 of 170 |
| 12 | `ppo_blkgen2` | + lane cost, steering kicks | 139 of 170; **best generalist** (`ppo_blkgen.best2.pt`) |
| 13 | `ppo_gblk_*` | Set 2: specialists from #12 | Best specialists |
| 14 | `ppo_g3blk_*` | Set 3: + rules 1, 2, 3 | No better than #13 |
| 15 | `ppo_sr1_*`, `ppo_sr2_*` | Search, then train | Stalled after two rounds |
| 16 | `g1-6-iqn_desert4` | Off-policy learner | Matched PPO in 3 hours |

## The models last trained, and what they are for

**`ppo_sr2_<track>` (round 2 of search-then-train). Finished; nothing running.**

| Track | Copy picked | Its own best of ten | Searched lap | File |
| --- | --- | --- | --- | --- |
| desert4 | `final` | 21.998 s | 21.880 s | `runs/rollout_r2_desert4.recording.json` |
| summer4 | `u1000` | 34.824 s | 34.505 s | `runs/rollout_r2_summer4.recording.json` |
| summer1 | `u800` | 22.443 s | 22.371 s | `runs/rollout_r2_summer1.recording.json` |
| winter2 | `u1000` | 27.136 s | 27.031 s | `runs/rollout_r2_winter2.recording.json` |

The intention was a model that drives a better-than-human lap by itself, by
alternating search and training. It closed part of the gap and then stalled
130 to 400 ms short. Carry forward the fastest verified lap per track, which
for summer4, summer1 and winter2 is round 1's. To run more rounds, use
`ideas/g1-3-search-train-rounds/rounds.mjs`, which is restartable;
`scripts/search_round.sh` restarts the practice from scratch if rerun after
an interruption.

**`g1-6-iqn_desert4` (off-policy learner). Stopped by the clock, not finished.**

- Files: `rl/checkpoints/g1-6-iqn_desert4.pt` (latest, 9.2M),
  `g1-6-iqn_desert4.best.pt`, `.actor.bin`; log `runs/g1-6-iqn_desert4.log`.
- Not done: its 21.957 s lap has not been exported or put through Verify, and
  `--resume` and `--save-laps` are tested only at toy size.
- The intention is the first model that beats the human unaided. Next: resume
  it on desert4, verify its best lap, and see whether it passes 21.750 s. It
  was limited by the GPU (95% of time in learning), not the simulators.

## What is next

1. Resume the off-policy learner on desert4 and verify its best lap.
2. Send one message per block decision instead of five in
   `rl/racing_env.mjs` (`stepBlock`). Two agents measured about 11 ms per
   block decision against 2.5 ms for one 50 ms step on a busy machine;
   measure on an idle one first.
3. Train a generalist on the inputs that need no human lap
   (`ideas/g2-1-reference-free-inputs/`). Eight changes to
   `rl/racing_env.mjs` are listed in that folder's README. End the episode
   when there is no road under the car: the world has drivable ground at
   height 0, and progress along a line keeps counting for a car driving
   beneath a raised road.

## Lessons that cost something to learn

- Extending a trained model's inputs with zero weights is exact, but learning
  must restart at a low rate and without the imitation term, or it is damaged.
- A specialist inherits the generalist's habits, good and bad.
- Old-scheme models need their randomness (greedy was worse than sampled);
  block models mostly finish greedy.
- A behaviour change cannot be bolted on at test time: forcing keys to stick
  took summer4 from 5 of 6 to 0 of 6.
- The rays are correct and unused. Nothing in training has forced the model
  to rely on them.
- Scoring a candidate by distance covered a second later builds slower laps
  (22.147 s against 22.061 s). Judge by finish time.
- Lap time is jagged to the millisecond in one key press's timing. Comparing
  position just before the finish to a fraction of a tick is what lets a
  search improve a human lap.
- One car can be stepped about 6 million ticks, save-state restores included.
  Long searches rebuild on a fresh car.
- The GPU makes the PPO learning step about 1.9 times faster, about 15%
  overall; the simulators are PPO's limit. For the off-policy learner the GPU
  is the limit.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
