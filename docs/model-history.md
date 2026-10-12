# Model history

Every model trained in this project, in the order it was trained: what it was
built from, what changed, how it was trained, what it scored, and why it was
kept or dropped. `CLAUDE.md` holds the current status and points here.

## How to read this

- **Files.** All checkpoints are in `rl/checkpoints/` (git-ignored). A name
  ending `.u<N>.pt` is a copy kept at update N, `.after_<steps>.pt` a copy
  after a stretch, `.final.pt` the end of a run.
- **Step counters carry over** when a model starts as a copy of another, so a
  specialist copied from a 103M-step generalist starts counting at 103M.
- **Dates** are local time, October 2026.
- **Tests.** "3 attempts" is the early test: three sampled attempts on each of
  the 17 tracks, 51 in all. It cannot tell checkpoints apart and was replaced
  on 6 October by the ten-attempt test (seeds 10 to 19; 170 attempts for a
  generalist). Numbers from the two are not comparable.
- **Held-out tracks** are desert3, summer3 and winter4. The 14 training tracks
  are desert1, 2, 4, 5; summer1, 2, 4, 5, 6, 7; winter1, 2, 3, 5.
- **Sources.** Built from the session transcript, the training logs
  (`runs/rl_train_*.log`), the checkpoint files, and the test outputs listed
  at the end. Where a number was recounted from files on disk it says so.

## Lineage at a glance

```
ppo_summer1                      single track, fresh
ppo_general -> ppo_general2      first generalist; inputs extended
ppo_general3 (imitation start)   held keys            <- old-scheme benchmark
  -> ppo_rays.start              inputs extended to 352
       -> ppo_rays               (no gain)
       -> ppo_spec_*, ppo_spec2_*   first specialists
ppo_follow (imitation start)     dropped

ppo_block.bc (imitation start)   block decisions
  -> ppo_blk_*                   set 1 specialists
  -> ppo_blkgen -> ppo_blkgen2   block generalist    <- best: ppo_blkgen.best2.pt
       -> ppo_gblk_*             set 2 specialists
            -> ppo_sr1_* -> ppo_sr2_*   search, then train
       -> ppo_g3blk_*            set 3 specialists

g1-6-iqn_desert4                 off-policy learner, fresh
```

## The models

### 1. `ppo_summer1`: first single-track agent (4 Oct)
- **Built from:** fresh weights. 101 inputs, 9 actions held 10 ms.
- **Reward:** 0.1 per unit of progress, 5 for finishing plus 2 per second
  left. Half of episodes start part-way round.
- **Training:** three stretches to 5M, 21M and 39M decisions.
- **Result:** 16 of 16 sampled laps at 22.51 to 22.60 s (reference lap then
  22.279 s); greedy 25.64 s. Best lap passes Verify at 22.513 s.
- **Outcome:** stopped at a plateau (the third stretch gained 11 ms). On
  winter1 it finished 0 of 9: it had memorised one track. This led to the
  generalist.

### 2. `ppo_general`: first generalist (4 Oct)
- **Built from:** fresh weights, 14 tracks, lap-position input hidden so a
  track cannot be memorised by position.
- **Training:** five stretches to 77M. Added along the way: simulators running
  the policy themselves, starts shortly before recent crash sites, and a
  ladder of save states so part-way starts cost nothing.
- **Result (3 attempts x 17 tracks):** 7 of 51 at 45M, 9 of 51 at 77M.
- **Incident:** a stop landed mid-save and corrupted the checkpoint; it was
  rebuilt from the actor file and an older critic
  (`ppo_general.recovered_50M.pt`). Saves have been atomic since.
- **Outcome:** Henry watched it miss jumps for lack of speed and scrape walls.
  Replaced. `ppo_general_512` is a widened copy that was never trained: the
  wider network slowed collection and nothing showed size was the limit.

### 3. `ppo_general2`: road edges and contact penalty (5 Oct)
- **Built from:** `ppo_general.after_77M.pt` with inputs extended 101 to 144
  (zero weights, so the outputs were unchanged).
- **Changed:** road-edge distances as inputs; a penalty for body contact;
  reward scaled by speed relative to the human; episodes end when the car is
  off the road; restarts from the agent's own state a few seconds before a
  crash.
- **Training:** one stretch of 32M, to 109M.
- **Result:** 31 of 51 with contact on 0.8% of decisions (the old agent under
  the same rules: 8 of 51, 3.1%). Finished laps were 13 to 23% slower than
  the human.
- **Outcome:** it tapped W about 29 times a second and could not hold W and S
  together. Henry asked for keys to be held and suggested starting a new
  model without the bad habits.

### 4. `ppo_general3`: held keys, imitation start (5 Oct)
- **Built from:** a fresh network taught by imitation of the human laps
  (`rl/pretrain_bc.py`). Imitation alone never finishes a lap.
- **Changed:** W and S are separate keys, read every 50 ms and held; pressing
  or releasing a key costs reward; the policy makes three separate choices.
  146 inputs, 12 actions.
- **Training:** five stretches of 38M, to 189M. The last was cut at 97% by
  the two-hour job limit.
- **Result:** 35 of 51 on the three-attempt test; on the ten-attempt test
  **114 of 170** (104 of 140 trained, 10 of 30 held out), contact 0.49%.
  Best laps: desert4 22.13 s, summer1 23.30 s.
- **Outcome:** Henry watched every track. It strafed on straights, did not
  air-brake for whole flights, still hit walls, and did not look far enough
  ahead on the long desert3 jump. Steering was tapped about 30 times a second.
  `ppo_general3.after_189M.pt` is kept as the benchmark of the old scheme.

### 5. `ppo_follow`: follow the reference (5 to 6 Oct)
- **Built from:** a fresh imitation start. Nothing from earlier models.
- **Changed:** inputs 146 to 335 (the human's orientation and keys at 21
  points ahead); an imitation term during practice; the reference rotates
  among each track's ten human laps; higher cost for changing steering.
- **Training:** six stretches to 131M. The learning rate never faded to zero.
- **Result (3 attempts):** 22, 25, 22, then 19 of 51. Laps were closer to the
  human (desert4 21.99 s) and steering calmer (6 to 15 changes a second).
- **Outcome:** dropped. It peaked at 25 against 35 for `ppo_general3`. The
  heavy imitation weight and the constant learning rate are the suspected
  causes; neither was tested.

- **Ten-attempt test, run later (12 Oct)** to fill a gap, in the environment
  as it is now:

| Copy | of 170 | trained /140 | held out /30 | contact | best desert4 |
| --- | --- | --- | --- | --- | --- |
| after_48M | 72 | 66 | 6 | 2.25% | 21.955 s (10 of 10) |
| after_74M | 85 | 77 | 8 | 2.43% | 21.900 s |
| after_109M | 80 | 71 | 9 | 1.78% | 22.076 s |
| after_131M | 55 | 49 | 6 | 1.75% | 22.245 s |

  This confirms the verdict (85 at best, against 114 for `ppo_general3`) and
  the pattern: it is the fastest of the old-scheme models where it finishes
  (desert4 21.90 s, winter1 17.17 s, winter2 27.03 s) and the least reliable.
  Raw outputs: `runs/big_follow.after_*/`.

### 6. `ppo_rays`: distance rays (6 Oct)
- **Built from:** `ppo_general3.after_189M.pt` with inputs extended to 352:
  the follower's inputs plus 17 rays from the car against the track mesh.
  Henry suggested feeding the road boundaries directly.
- **Training:** the first stretch, at a full learning rate with the imitation
  term, took the model from 35 to 15 of 51. Restarted at a low rate without
  imitation, then three more stretches to 287M.
- **Result (ten attempts):** 107, 112 and 100 of 170, against 114 for the
  model it started from. An earlier claim of "36 of 51, the best so far" came
  from the three-attempt test and was withdrawn as noise.
- **Outcome:** about 100 million more decisions bought nothing. The untrained
  352-input copy, `ppo_rays.start.pt`, became the base for the first
  specialists.

### 7. `ppo_spec_<track>`: first specialists (6 Oct)
- **Built from:** `ppo_rays.start.pt`, one track each (desert4, summer4), 12M
  decisions, low learning rate fading to zero.
- **Result:** desert4 10 of 10, 22.18 to 22.45 s. summer4 collapsed late in
  its run to 0 of 10 with only the last checkpoint kept; the rerun with kept
  copies gave 10 of 10 at 35.29 s (`u4400`) and a fastest lap of 34.89 s.
- **Outcome:** this is where `--keep-every` came from. Henry found both
  wobbly where they should hold W alone, and air-braking only on the biggest
  jumps. On desert4 it never pressed S.

- **Retested 12 Oct:** `ppo_spec_summer4.final.pt` 9 of 10, best 34.886 s
  (the original script printed "96/10" for this file; 9 is right).
  `ppo_spec_desert4.pt` 10 of 10, best 22.181 s. Raw outputs:
  `runs/big_spec_final/`.

### 8. `ppo_spec2_<track>`: steering costs (6 Oct)
- **Built from:** `ppo_rays.start.pt` again.
- **Changed:** changing steering costs more the straighter the road; holding
  A or D on a straight costs; flipping straight from A to D costs.
- **Result:** desert4 10 of 10 at 22.14 s with steering close to the human's
  (2.0 changes a second on straights against 2.7). summer4 8 of 10 at
  35.56 s, still 13.9 changes a second on straights.
- **Incident:** a Windows file lock killed both runs; the trainer now retries
  the rename for up to five seconds.
- **Outcome:** superseded by block decisions the same night.

- **Final files, tested 12 Oct** (only kept copies were tested at the time):
  `ppo_spec2_desert4.pt` 10 of 10, best 22.133 s, greedy 22.230 s.
  `ppo_spec2_summer4.pt` 6 of 10, best 36.612 s, greedy did not finish. So
  on summer4 the kept copy `a3500` (8 of 10, 35.56 s) is the one to use.

### 9. `ppo_block.bc.pt`: the block scheme's imitation start (6 Oct)
- **Why:** Henry asked whether the model should decide "should I change what
  I am pressing" and have a second layer execute it. Measured on human laps,
  40% of 50 ms blocks have no steering key, 36% hold one throughout, 24%
  change once, and 1.7% change twice or more.
- **Built from:** a fresh network, imitation only, on 14 tracks. Matches the
  human's targets 83% (steering) and 98% (W, S).
- **Outcome:** never practised; it cannot finish a lap. It is the start for
  everything below. Examples: `bc_block.npz`.

### 10. `ppo_blk_<track>`: "set 1", specialists from imitation only (6 Oct)
- **Built from:** `ppo_block.bc.pt`. desert4, summer4, summer1, winter2.
- **Training:** 5M block decisions each, first runs on the GPU, imitation term
  on, copies every 200 updates.
- **Result:** desert4 10 of 10, 22.27 s. summer4 10 of 10 at 36.04 s, or 9 of
  10 at 35.65 s. summer1 9 of 10, 22.58 s. winter2 9 of 10, 28.53 s.
- **Outcome:** the wobble was gone and key use matched the human's (desert4:
  W held 100%, no steering key on 89% of straights against 91%), at a cost of
  0.1 to 0.8 s against the old specialists. Runs for desert1 and desert2 were
  stopped early and deleted.

- **Discount settings.** From here on training uses `--gamma 0.995
  --gae-lambda 0.9`, where the old scheme used 0.999 and 0.97. No reason was
  written down at the time. The numbers are the old ones converted from 10 ms
  to 50 ms decisions (0.999^5 = 0.995, 0.97^5 = 0.86), so the horizon in
  seconds is unchanged.
- **Retested 12 Oct:** every number above reproduced exactly (the test is
  deterministic for a given seed). The original outputs had been overwritten
  by set 2's, because both families wrote to `runs/big_blk/`; the test script
  now writes to `runs/big_<PREFIX>/`. Set 1 is in `runs/big_blk/`, set 2 in
  `runs/big_gblk/`.

### 11. `ppo_blkgen`: block generalist (6 to 7 Oct)
- **Built from:** `ppo_block.bc.pt`, 14 tracks, rotating reference laps.
- **Training:** seven stretches of 13M, a copy kept after each.
- **Result (of 170):** 92, 111, 128, 127, 135, **139**, 128. The sixth
  (`after_78M`, saved as `ppo_blkgen.best.pt`, "model 6") scored 132 of 140
  trained and 7 of 30 held out.
- **Outcome:** stopped when two stretches in a row failed to gain. winter4 was
  0 of 10 in every stretch: the forward ray falls from 101 units to 5 in half
  a second and the model does not react. The wall is seen and ignored.

### 12. `ppo_blkgen2`: blocked-lane cost and steering kicks (7 Oct)
- **Built from:** `ppo_blkgen.best.pt`.
- **Changed:** a cost when the car's sideways position will not fit through
  the road within the next second (zero on the human laps); on 30% of part-way
  starts, a short burst of random steering first, to force recoveries.
- **Training:** one full stretch and one stopped at 88% for a shutdown.
- **Result:** 131, then **139 of 170** (132 trained, 7 held out), contact
  0.41%, and the first winter4 finish.
- **Outcome:** held-out tracks stayed at 7 of 30 for three tests running, so
  this line stopped. Saved as **`ppo_blkgen.best2.pt`**: the current best
  generalist and the base for every specialist below. It is a `blkgen2` model
  under a `blkgen` name.

### 13. `ppo_gblk_<track>`: "set 2", specialists from the generalist (7 to 8 Oct)
- **Built from:** `ppo_blkgen.best2.pt`. 5M decisions each, learning rate
  5e-5 fading to zero.
- **Result (best lap of ten, finishes):**

| Track | u1600 | u2000 | u2400 | final |
| --- | --- | --- | --- | --- |
| desert4 | 22.065 (10) | 21.981 (8) | 22.004 (10) | 22.046 (9) |
| summer4 | 35.083 (9) | 34.967 (9) | 35.024 (9) | 35.066 (9) |
| summer1 | 22.554 (10) | 22.504 (10) | 22.474 (9) | 22.503 (9) |
| winter2 | 27.530 (10) | 27.208 (8) | 27.225 (7) | 27.226 (8) |

- **Outcome:** inheriting from the generalist roughly halves set 1's gap to
  the human. These became the base for the searches and for sets 14 and 15.
  An earlier report of "desert4 10 of 10 at 21.98 s" merged two copies; the
  table is recounted from the test files.

### 14. `ppo_g3blk_<track>`: "set 3", rules 1, 2 and 3 (8 Oct)
- **Built from:** `ppo_blkgen.best2.pt`, same total training as set 2, in two
  rounds of 2.5M.
- **Changed:** rule 1, pace reward allowed up to 1.3 times the human's speed
  and a wider limit on distance from the line; rule 2, a key-timing search on
  the best lap between rounds; rule 3, the faster of searched lap and human
  lap becomes the reference.
- **Result:** desert4 21.99 s, summer4 35.06 s, summer1 22.56 s, winter2
  27.47 s (all 10 of 10). No better than set 2.
- **Outcome:** rule 3 never applied, because no searched lap beat the human.
  The search gained 43 to 90 ms in ten minutes, which showed it was too weak
  and led to `scripts/search_rollout.mjs`.

### 15. `ppo_sr1_<track>` and `ppo_sr2_<track>`: search, then train (8 to 10 Oct)
- **The loop** (`scripts/search_round.sh`): take the lap found by
  `search_rollout.mjs`, turn it into imitation examples (`rl/lap_bc.py`),
  practise 2.5M decisions with a pull toward it (weight 0.05), test the kept
  copies, search again from the fastest.
- **Built from:** round 1 from the set 2 copies (desert4 `final`, summer4
  `u2000`, summer1 `u2400`, winter2 `u2000`); round 2 from round 1's picks.
- **Searched lap after each round:**

| Track | Before | Round 1 | Round 2 |
| --- | --- | --- | --- |
| desert4 | 21.907 s | 21.913 s | 21.880 s |
| summer4 | 34.689 s | 34.500 s | 34.505 s |
| summer1 | 22.414 s | 22.334 s | 22.371 s |
| winter2 | 27.082 s | 27.020 s | 27.031 s |

- **Outcome:** round 1 helped three tracks, round 2 only desert4. The loop is
  near its limit as built and no third round was run.

### 16. `g1-6-iqn_desert4`: off-policy learner (10 Oct)
- **Built from:** fresh weights. Its own code in `ideas/g1-6-offpolicy-rl/`:
  IQN with a replay buffer, 12 actions per 50 ms, 352 inputs.
- **Reward:** distance along the track only. No imitation, no pay for
  matching the human.
- **Training:** one run, GPU, 6 simulators, stopped by a three-hour timer at
  9.2M decisions.
- **Result (lap from the start line, no exploring):** 26.70 s at 0.46M,
  23.97 s at 1.04M, 22.75 s at 2.15M, 22.02 s at 6.3M, **21.957 s** at 9.2M.
  Its last four check laps were 22.07 to 22.33 s.
- **Verified 12 Oct:** the 21.957 s lap cannot be reproduced. Training drove
  each check lap with a weights file written before that round's gradient
  steps, then saved the network after them, so the saved "best" checkpoint is
  not the network that drove the best lap. What the saved files drive, both
  passing the game's Verify:
  - `g1-6-iqn_desert4.pt` (latest, 9.2M): **21.977 s**,
    `runs/g1-6-iqn-latest_desert4.recording.json`
  - `g1-6-iqn_desert4.best.pt` (8.0M): 22.023 s,
    `runs/g1-6-iqn-best_desert4.recording.json`

  The trainer now also keeps the weights file that drove the best lap
  (`.best.actor.bin`), and `ideas/g1-6-offpolicy-rl/eval_lap.py` drives and
  saves a lap from any checkpoint.
- **Outcome:** it matched the PPO specialists from nothing in three hours.
  Its verified best is 21.977 s against the human's 21.750 s.

## Where the evidence is

All under `runs/` (git-ignored).

| What | Where |
| --- | --- |
| Training logs | `rl_train_<family>[_<stretch>].log`. The first lines give the tracks, the "resumed ... at N steps" line and the imitation data. Command lines are not in the logs. |
| Three-attempt tests | `eval_general*`, `eval_follow1` to `4`, `eval_rays1` to `5` |
| Ten-attempt generalist tests | `big_<checkpoint name>/`, summary in `big_eval_summary.txt` |
| Specialist tests | `big_blk/` (set 1), `big_gblk/` (set 2), `set3/` (set 3), `search_round/` (search-then-train), `big_spec/` and `big_spec_final/` (old-scheme specialists) |
| Searched laps | `rollout_<track>`, `rollout_r1_<track>`, `rollout_r2_<track>` (`.log` and `.recording.json`) |
| Human-lap search | `g1-1-full2_<track>.recording.json` and `.log` |
| Off-policy run | `g1-6-iqn_desert4.log`, `g1-6-iqn-latest_desert4.recording.json` |

Traps in the names:

- `eval_general3/` holds **`ppo_general2`'s** results; `eval_general4` to
  `eval_general8` hold `ppo_general3`'s five stretches.
- `ppo_blkgen.best2.pt` is a `ppo_blkgen2` model.
- The `ppo_gblk_desert4` and `ppo_gblk_summer4` logs start with about 500
  lines of an earlier attempt that was deleted (copied from
  `ppo_blkgen.best.pt` at 78M steps). The files on disk are the rerun from
  `best2.pt`, which begins at the line "resumed ... at 102727680 steps".
- `ppo_rays.after_a.pt` is the damaged first stretch and is not on the path to
  the later ray checkpoints, which restart from `ppo_rays.start.pt`.
- `ppo_general_512.pt` shows 45.0M steps but was never trained; the counter
  came with the checkpoint it was widened from.
- Commit hashes quoted in older notes no longer exist. History was rewritten
  on 10 October to remove the game data and the co-author lines; find commits
  by subject.
