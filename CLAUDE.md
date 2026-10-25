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
  localStorage). `scripts/watch_ghost.mjs` and `scripts/race.mjs` open the
  client through `scripts/game_client.mjs`: a temporary browser profile (Edge
  by default, `browser=chrome` or `browser=firefox`, the latter Playwright's
  own build) in which every request to `vps.kodub.com` is answered locally
  (GET only) or blocked.
- **One model is published:** `models/ppo_blkgen.best2.actor.bin`, so that
  `npm run race -- <track>` works from a fresh clone (Henry's decision, 25
  October 2026). The race shows the best human and the generalist as
  leaderboard ghosts; their recordings never leave the machine.
- **No network.** The only script that contacts Kodub's server is
  `scripts/fetch_laps.mjs`, and it only reads.
- **`data/` stays out of git.** It is Kodub's captured geometry and other
  players' leaderboard laps. So do `ideas/g1-1-human-seed-search/out/`,
  `ideas/g1-7-computed-racing-line/out/` and
  `ideas/g2-5-memory-policy/out/smoke.bin`, which derive from those laps. The
  repository is public (`github.com/henrychen4736/Polytrack-ML`); the history
  was rewritten on 10 October 2026 to remove the first two paths, and again
  on 18 October 2026 to remove `smoke.bin`, the dated `graphify-out/20*/`
  graph copies and `ideas/test_logs/` (backup bundle beside the repository:
  `Polytrack-ML-history-backup-20261018.bundle`).
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
  the ideas. Last full count 17 October 2026: 1885 checks pass, 4 known
  failures listed in each `tests/TESTING.md`. Since 18 October 4 more fail
  (the runner reports them as failed, not known; they are written up in
  those folders' `tests/TESTING.md`): 3 in g2-4 (one-message `stepBlock` runs
  the rest of a block when an episode ends mid-block, so `simTicks` counts
  more) and 1 in g2-3 (real `g2-3-adapt*` checkpoints now exist). Henry has
  not decided whether to update the expected values.
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
  and keys are in the model's inputs and its line measures progress. On summer1 the
  environment's default reference is polyrl's fixture lap (22.279 s), which
  is why test output prints that as "human"; the best human lap there is
  22.131 s.
- **Old scheme.** One decision per 10 ms from 12 key combinations, W and S
  re-read every 50 ms.
- **Block decision.** One decision per 50 ms: for each of steering, W and S, a
  target and the 10 ms slice in which it switches. 22 output scores, six
  choices. Checkpoints record `num_actions` 1500 as a marker for this mode.
- **Generalist / specialist.** A policy trained on many tracks / on one.
- **Held-out tracks.** desert3, summer3 and winter4: no generalist has trained
  on them. The 14 training tracks are desert1, 2, 4, 5; summer1, 2, 4, 5, 6,
  7; winter1, 2, 3, 5.

## Status (18 October 2026)

**Goal 1 is met by search, now also on a model's lap.** Re-timing the keys of
the IQN learner's own 21.792 s desert4 lap (g1-1 search, two 20-minute
passes) gave **21.720 s, 30 ms faster than the best human**: the first
better-than-human lap whose driving came from a model rather than a human
lap. No model beats the human by itself yet: IQN alone is 42 ms short.
Stitching human laps (g1-2) beat the human on winter5 too (18.374 s against
18.425 s).

| Track | Best human | Human lap re-timed by search | Model's lap re-timed by search | Best lap a model drives alone |
| --- | --- | --- | --- | --- |
| desert4 | 21.750 s | 21.709 s | **21.720 s** (IQN lap) | 21.792 s (IQN), 21.846 s (IQN, no human lap in inputs) |
| winter2 | 26.830 s | 26.775 s | 26.927 s (IQN lap) | 26.997 s (IQN, from nothing in 12M decisions) |
| summer1 | 22.131 s | 22.104 s | | 22.334 s |
| summer4 | 34.105 s | 34.069 s | | 34.500 s |
| winter5 | 18.425 s | 18.374 s (g1-2 stitch) | | |

**Goal 2 is open.** The best generalist (`ppo_blkgen.best2.pt`) finishes 139
of 170 attempts overall: 132 of 140 on its training tracks, 7 of 30 on the
held-out three. Exploring from save states, then ten minutes of practice
towards the lap found (g2-3), takes it to 10, 8 and 9 of 10 on winter4,
desert3 and summer3. The first generalist with no human lap in its inputs
(`ppo_g2-1-route`) finishes 90 of 170, none on held-out tracks. Continued on
40 generated tracks with jumps, banked turns and wide roads
(`ppo_g2-2-route-gen`), it finishes 71 of 100 on 10 generated tracks it never
saw (15 of 100 before), still 0 of 30 on the held-out official three. That is
the first evidence of driving unseen tracks with no human lap; the generated
tracks are easier than official ones. No community track is in the
repository, so none has been tried.

## Model history

`docs/model-history.md` is the full record of every model trained: 26
entries, each with what it was built from, what changed, the training, the
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
| 5 | `ppo_follow` | Follow the reference lap | 85 of 170: fast, unreliable; dropped |
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
| 16 | `g1-6-iqn_desert4` | Off-policy learner | 21.792 s, levelled off by 39M decisions; **closest model** |
| 17 | `g1-3-<track>-r1` | Search-then-train round 3 | 1 of 4 tracks gained (11 ms); stalled |
| 18 | `g2-3-adapt_<track>` | Generalist + 10 min towards an explored lap | 8 to 10 of 10 on held-out tracks |
| 19 | `ppo_g2-1-route` | No human lap in the inputs | 90 of 170, 0 of 30 held out |
| 20 | `g2-5-mem_route` | + memory of earlier attempts | No effect (2 of 150 vs 0 of 150) |
| 21 | `g1-6-iqn-g995_desert4` | IQN, gamma 0.995 | No gain (best 21.808 s) |
| 22 | `g1-6-iqn-s5_desert4` | IQN, 60 actions (10 ms timing), from nothing | 21.956 s in 12M; no gain |
| 23 | `g1-6-iqn_winter2` | IQN on winter2 from nothing | 26.997 s in 12M; best model there |
| 24 | `g1-6-iqn-route2_desert4` | IQN on route inputs (no human lap) | 21.846 s, 100 of 100 finish |
| 25 | `g1-3-cand_desert4` | PPO trained on 51 near-best searched laps | own best 21.961 s (was 21.987 s) |
| 26 | `ppo_g2-2-route-gen` | Route generalist + 40 generated tracks | 71 of 100 on unseen generated tracks |

## The models last trained, and what they are for

All from the queue of 16 to 17 October (`scripts/queue_unfinished.sh`,
restartable; log `runs/queue/queue.log`). Details and tables in
`docs/model-history.md` items 16 to 20.

**`g1-6-iqn_desert4` (off-policy learner). The closest to goal 1.**

- Resumed in 2-hour stretches of 6M decisions (`--resume --save-laps
  --total-decisions 6000000 --lr 1e-4 --lr-end 0 --envs 6`). Verified best
  eval lap **21.792 s** after stretch 3 (21.2M decisions), 42 ms short of the
  human. About 40 ms gained per stretch until then; stretches 4 to 6 (to
  39.2M) found nothing faster, so it has levelled off at these settings. Copies per stretch:
  `rl/checkpoints/g1-6-iqn_desert4.s<k>.*`; the lap that set a best is driven
  by `.best.actor.bin` (`eval_lap.py --actor`), not `.best.pt`.
- `--resume` and `--save-laps` now work at full size. A resumed run refills
  the replay buffer from empty (about 50,000 decisions) before learning.
- Next: change something rather than resume as is: `--slices 5` (10 ms
  timing), a larger `--gamma` (0.995), its own best lap as the ruler
  (`--ref-file`), or `search_rollout.mjs` from its lap (needs an adapter).

**`g2-3-adapt_<track>` (explore, then ten minutes of practice).**
`ideas/g2-3-explore-and-adapt/finetune_run.sh <track>`. winter4 1 to 10 of
10, desert3 1 to 8, summer3 5 to 9; searched laps 19.669, 20.520, 20.475 s
(human 19.311, 20.302, 20.276 s). Uses the track's human lap.

**`ppo_g2-1-route` (no human lap in the inputs).** `reference: 'route'` in
`rl/racing_env.mjs`, `--reference route` in the trainers. 90 of 170 (copy
`after_38989824`), 0 of 30 held out; desert2, desert5, summer4, summer5 0 of
10 (two wrong routes, two banked-wall turns). Train more with
`ideas/g2-1-reference-free-inputs/train_route_generalist.sh` (each call is a
new stretch). Still uses the human lap to place part-way starts.

**`g2-5-mem_route` (memory of earlier attempts).** No effect: 2 of 150
with memory, 0 of 150 without, on the held-out tracks. Trainer flags
`--memory 1 --session-max 6`; `ideas/g2-5-memory-policy/train_memory.sh`,
`eval_memory.sh`.

**`g1-3-<track>-r1` (search-then-train round 3, by `rounds.mjs`).** Only
winter2 gained (27.020 to 27.009 s). Stalled; one more non-paying round stops
each track.

## Results of 17 to 18 October (second queue, `scripts/queue_untried.sh`)

Every idea the docs suggested and nobody had tried was run, one at a time.
Details in `docs/model-history.md` items 21 to 26 and `ideas/README.md`.

- Search from a model's lap (g1-1 on IQN's lap): desert4 21.792 to **21.720
  s** (human 21.750 s); winter2 26.997 to 26.927 s; route IQN 21.846 to
  21.800 s. g1-5 fine timing then found nothing more (0 of 5090 changes).
- IQN variants on desert4: gamma 0.995 and 60 actions (10 ms timing) gave
  no gain over 21.792 s. IQN on winter2 from nothing reached 26.997 s in 12M
  decisions. IQN on the route inputs: 22.041 s at first, because passing
  beside the finish box paid as much as finishing (fixed in route mode:
  `finishHold` 20 units, `missedFinish` 10 units); rerun 21.846 s.
- g1-2 stitching on all 17 tracks (`judge=finish fallback=4`): beats the
  human on desert4 (21.730 s) and winter5 (18.374 s), slower elsewhere.
- g1-4 beam search over the whole desert4 lap: no gain (21.880 s).
- Training on near-best search candidates: the search itself found 21.820
  s; the trained policy's own best went 21.987 to 21.961 s.
- Engine: one message per block decision (1.2 to 1.3 times faster, not 3 to
  4), `crashEnd` (opt-in early end on a crash; median 5.5 to 3.9 simulated
  laps to a first finish in g2-3 explore, 8 seeds), `--target-steps` in
  `train_ppo.py` (exact resume), `shapedReward: 0` (2 to 4% faster).
- Generated tracks load everywhere (`.track.json` paths, `--rotate-every`);
  the generator makes jumps, banked turns, wide roads (loops and wall rides
  not possible with the piece table).
- Not tried: a community track (none in the repository; the no-network rule
  forbids fetching one).
- Tests: 3 g2-4 checks now fail by design (an episode ending mid-block runs
  the rest of the block, so `simTicks` counts 30 to 260 more ticks); 1 g2-3
  check fails because the real fine-tune wrote `g2-3-adapt*` checkpoints.
  Henry to decide whether to update those expected values.

## What is next

1. Combine the two things that work: IQN on the route inputs over generated
   tracks plus official ones (a generalist that learns per decision far
   faster than PPO), then g2-3-style explore and adapt on unseen tracks.
2. A community track: Henry to add one to the repository by hand.
3. desert4 by a model alone: 42 ms short; the search gains 46 to 72 ms from
   IQN laps, so a model whose own lap is about 20 ms better would do it.
4. The route generalist: fix the summer4 and desert5 routes and teach the
   route to take banked walls (desert2, summer5).

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
