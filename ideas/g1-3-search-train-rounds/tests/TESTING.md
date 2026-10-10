# g1-3 search-and-train rounds: independent tests

Written by a tester who did not write the code. Run from the project root:

```
node ideas/g1-3-search-train-rounds/tests/run_tests.mjs            # one line per check, PASS or FAIL
node ideas/g1-3-search-train-rounds/tests/run_tests.mjs verbose=1  # also the test programs' other output
```

Result on 2026-10-10, with training and round 2 of the real pipeline running
on the machine: **220 passed, 0 failed, 333 s** (about 150 s of that is the author's own `test_restart.mjs`). At most 2 simulator processes; no training, no
search, no GPU. Exit code 0 only if every check passes.

**What the tests touch.** The scenarios live in `tests/scratch/` (removed at
the end) and the driver is pointed at them with `dry=1 root=<folder>`. The
real `rl/checkpoints/` and `runs/` are only read: two searched desert4 laps
(`rollout_desert4`, `rollout_r1_desert4`), `bc_search_r1_desert4.npz`, and the
step counter of `ppo_sr1_desert4.u800.pt`. Nothing there is written, renamed
or deleted, and the suite checks that no `g1-3*` name appears in either
folder. The author's `smoke_real.mjs` is **not** run: it is a real launch
that writes `g1-3-smoke-*` files under the real folders.

## What is covered

| File | Checks | What |
| --- | --- | --- |
| `test_lib.mjs` | 101 | every exported function of `lib.mjs` on hand-built inputs. No simulator, no files |
| `test_driver.mjs` | 48 | `rounds.mjs` with `dry=1` on 19 hand-built folders (24 runs), one for each moment the machine could have stopped; every folder hashed before and after |
| `test_lock.mjs` | 16 | the lock, with real (non-dry) launches that cannot get as far as a round |
| `test_python.mjs` | 13 | `ckpt_steps.py` and `laps_bc.py` |
| `test_author.mjs` | 42 | the author's `test_restart.mjs`, run unchanged and reported in this format |

The scenario folders use stand-in checkpoints that hold only a step counter
(`make_ckpts.py`), which is all the driver reads from a checkpoint in a dry
run, so "interrupted at update 20 / 400 / 730 / 900 / complete" are exact
and chosen, not whatever round 1 happened to leave. Test output is written
by hand so that the pick has a known answer.

How the specific targets were tested:

- **Which lap is carried forward.** First launch given a slower lap first, a
  faster lap, one claiming a tick too few, one claiming a tick too many, a
  half-written file and a missing file: both real laps verify, the four bad
  ones are left out without stopping the launch, 21.907 s is trained towards.
  After a round whose lap is slower (21.913 against 21.907): the old lap
  stays and round 2 trains towards it. After a round with three searches
  (21.950 recorded, 21.913 and 21.907 on disk, best so far 21.913): the
  fastest becomes the best lap, also when its 6 ms gain is under `minGain`.
- **Which copy is picked.** `pickCopy` on built rows: the 8-of-10 gate (7 is
  out however fast, exactly 8 is in), scores exactly `closeMs` apart count as
  equal and more finishes wins, 11 ms apart does not, equal finishes go to
  the lower score in either order, a complete tie to the later copy, "close"
  is measured from the best score and not chained, no copy through the gate
  falls back to the most finishes, none finished gives no pick, and rule
  `best` with its tie. Then the same through the driver on hand-written
  test output: c1000 (fastest, 7 of 10) is set aside and c800 wins on
  finishes then score; `pick=best` takes c1000; a copy picked before a
  shutdown stays picked although the rule would now choose another; no copy
  finishing stops the track.
- **The stop rule at its boundaries.** A gain of exactly `minGain` pays and 1
  ms less does not; a slower lap and no lap at all are strikes; the second
  strike in a row stops; a paying round clears the strikes; `patience` 1 and
  3; and through the driver: one strike carries on to round 2, a second
  stops the track whatever `rounds=` says, `rounds=1` is a total.
- **What counts as done after an interruption, at every step.**
  examples: a leftover `.tmp.npz` is not "done". practice: not recorded as
  begun (the base is copied again, full leg, warm-up 30); at update 20
  (1200 left, the 10 warm-up updates still owed); at 400 (820 left, learning
  rate 0.0000336066, no warm-up, the base NOT copied over the checkpoint, the
  trainer's `u200` renamed `c200`, update 400 not kept for testing); at 900
  on a second leg (the leg's `u200` / `u400` renamed `c600` / `c800`, the
  checkpoint kept as `c900`, with `minutes=10` a leg of 210 updates whose
  rates are 5e-5 x 320/1220 and 5e-5 x 110/1220); at 730 (just under 60%:
  not kept; with `minutes=3` no leg and exit code 3); checkpoint gone (an
  error, not a restart from the base). test: complete practice makes the
  end copy; an attempt cut off mid-output is run again, one that did not
  finish is not; exactly the 12 missing of 44 are run. pick: above. search:
  one recorded in the state is not looked at again, a lap on disk that
  verifies is done, a lap claiming a tick too few is run again with its own
  seed, and the round is not concluded while one is outstanding.
- **The learning rate across legs.** `trainPlan` is applied leg after leg to
  a round cut at updates (400), (10, 520, 1030) and (1, 2, 1219), each leg's
  two rates are put through the trainer's own rule
  (`lr + (lr_end - lr) x (u - 1) / n`, `rl/train_ppo.py`), and the 1220
  rates are compared with the uninterrupted round's: equal to 6 digits.
- **The practice command** is compared option by option with
  `scripts/train_block_specialist_from.sh` as `scripts/search_round.sh` calls
  it, and the test command with that script's (seeds 10 to 19 sampled, seed 0
  top choices, `--max-off-line 40`).
- **A dry run changes no file.** Each of the 23 scenario runs: every file
  under the folder hashed (names and contents) before and after. One more dry
  run on the real project with the README's command and a tag of its own:
  afterwards no `g1-3*` name exists under the real `rl/checkpoints/` or
  `runs/`, and the idea folder outside `tests/` is byte for byte unchanged.
- **The lock refuses a second launch.** A lock naming a live process:
  refused with exit code 2, the lock file left as it was, no state made; a
  dry run beside it still answers. The driver dead but a program it started
  alive: refused. Both dead: taken over, and removed at the end. Written
  before the last boot: ignored. Then two live launches: the first is kept
  busy verifying four laps that cannot verify, the second is refused with
  exit code 2 and names the first's process id, a launch of another series
  (`tag=`) is not refused, the first ends by itself and removes its lock, and
  a launch after that is accepted.
- **`laps_bc.py`**: one lap gives 438 examples of 352 inputs, identical to
  what `rl/lap_bc.py` wrote from the same lap; every example's steer / W / S
  target is the lap's own block decision there (worked out from the keys with
  `ideas/shared/laps.mjs`) and the switch slice is the decision's where a
  control changes and 5 where it does not; three laps give the first twice
  and then the others. **`ckpt_steps.py`**: exact counters; a file that is
  not a checkpoint is an error.

## What is not covered, and why

- **The practice step itself.** Starting `rl/train_ppo.py` was forbidden (and
  would compete with the running round 2). So not seen: a real leg, a real
  continuation, the files a real leg leaves, stopping the trainer at the time
  limit (`taskkill /T /F`), and that the trainer accepts the command line.
  The command's options were compared with the shell scripts by reading.
- **A real test step and a real search** (`rl/evaluate.py`,
  `rl/export_actor.py`, `scripts/search_rollout.mjs` started by the driver):
  only the commands are checked. The author's `smoke_real.mjs` covers these
  and was not run here, because it writes under the real `rl/checkpoints/`
  and `runs/`.
- A complete round, several rounds in a row on live results, and the two-hour
  limit as a real timeout.
- Whether `top3`, 3 x 200 s searches or `extraLaps` give faster laps (the
  README says the same).

## Defects found

1. **Fixed. A round interrupted inside the critic warm-up lost the rest of
   it** (`lib.mjs:274`, `trainPlan`). The rule was "warm-up 30 if no update is
   done, else 0". `rl/train_ppo.py` counts `--critic-warmup` from the start of
   the process and writes the checkpoint every 10 updates, so a shutdown in
   the first minute of practice (update 10 or 20) made the next leg train the
   policy against a critic that had had a third or two thirds of its warm-up.
   Now `max(0, warmup - updates done)`. From update 30 on nothing changes.
   `test_lib.mjs` and the `practice-20` scenario check it.

Smaller things, not fixed:

2. `rounds.mjs:204` (`takeLock`): the lock is "look, then write", not one
   atomic step. Two launches started within the same few milliseconds could
   both pass. Launched by hand a minute apart, as the README describes, this
   does not happen; a scheduler that starts two at once could hit it.
3. `lib.mjs:71` (`parseArgs`): a number setting given nothing (`rounds=`)
   becomes 0 without complaint (`rounds=three` is refused).
4. `lib.mjs:313` (`chooseExamples`): laps are told apart by file name only,
   so with `extraLaps` the same lap saved under two names is used twice.
5. `laps_bc.py:48`: "the first lap is at least half of the examples" holds
   when the laps have the same number of decisions; an extra lap that is 50
   ms longer has one more row, and the first lap is then one row short of
   half. Of no practical weight.
6. **The author's `test_restart.mjs` depended on a real file that has since changed** (`test_restart.mjs:72`, fixed there; see the claims table). Its other scenarios copy real round-1 files too and will break the same way if those are rewritten; the tests in this folder build their own.
7. After an interruption the trainer's kept copies fall at the interruption
   point plus multiples of 200 (for example c610, c810, c1010, c1210), so the
   copies tested are not the 800 / 1000 / 1200 of an uninterrupted round. The
   driver handles them correctly; the README does not mention it.

## Did the README's claims hold?

| Claim | Verdict |
| --- | --- |
| It carries the fastest verified lap forward, never simply the latest | Confirmed |
| Every lap is verified by the driver itself; a file claiming one tick too few is not accepted | Confirmed, and one tick too many, a half-written file and a missing file likewise |
| The next round starts from the copy picked in the latest round, also when its lap was slower | Confirmed |
| `pickCopy`: gate at 8 of 10, mean of the three fastest, within 10 ms more finishes wins | Confirmed on hand-built rows and through the driver |
| On the round-1 data `top3` picks u1000 on all four tracks and `best` reproduces the script | Confirmed by the author's test, which reads the real round-1 output (run here through `test_author.mjs`); not re-derived independently |
| Stop after `patience` rounds in a row gaining less than `minGain` | Confirmed at the boundaries |
| Practice continues after an interruption: updates left, a learning rate on the round's straight line, renamed copies | Confirmed in the dry run, and the stitched learning rate against the trainer's own formula. **Never run for real** |
| "no second critic warm-up" | Correct from update 30 on; **wrong for an interruption at update 10 or 20** (defect 1, fixed) |
| Test attempts without a result line are run again, the others are not | Confirmed |
| A search is done when its lap exists and verifies, otherwise run again | Confirmed |
| A dry run runs and writes nothing | Confirmed by hashing |
| A lock file stops two launches working on one track | Confirmed, including the second live launch that the README lists as not seen |
| `laps_bc.py` with one lap equals `rl/lap_bc.py`'s arrays (438 examples) | Confirmed |
| Round 2's `bc_search_r2_desert4.npz` is identical to the examples of the 21.907 s lap | Confirmed (read only: its arrays equal `bc_search_r1_desert4.npz`'s) |
| `test_restart.mjs`: 41 checks, all passing | 40 of 41 as found: one check read winter2's real round-1 search log as "interrupted", and that search was run again at 02:09 on 2026-10-10, so the log is now complete (27.241 to 27.020 s). The test was wrong, not the code; it now cuts desert4's log instead and all 41 pass. The README's "winter2's real interrupted search (log stops at 502 s, no lap)" is out of date for the same reason |
| `smoke_real.mjs`: 11 checks, all passing; the results table it wrote | Not run (it writes under the real folders); the table's row format is reproduced character for character by `resultsText` in `test_lib.mjs` |
| Exit codes 0 / 3 / 2 / 1 | Confirmed: 0 (target reached, stopped, dry run), 3 (out of time, in a dry run with `minutes=3`), 2 (lock), 1 (errors) |
| Costs and timings (36 updates a minute, 50 to 60 minutes a round) | Not checked |
