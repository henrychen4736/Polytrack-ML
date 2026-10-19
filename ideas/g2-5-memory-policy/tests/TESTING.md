# g2-5 memory policy: independent tests

Written by a tester who did not write the code. Run from the project root:

```
node ideas/g2-5-memory-policy/tests/run_tests.mjs
```

115 checks, all pass since defect 2 below was fixed (16 October 2026; before
that 114 passed and the runner exited with code 1). About 1 minute with
training running. CPU only, no
training, at most two simulator processes at once. Temporary files go to
`tests/tmp/` and are removed.

## What is covered

`test_track_memory.mjs` (no simulator, 39 checks): `TrackMemory` on hand-built
attempts, every expected number worked out in the comments.

- Bin borders, the clamp at both ends, the bin count.
- A crash at 40 units in bin 20 and at 39.99 in bin 19; one crash, in one bin.
- "Still going 3 s later" against "stopped within 3 s" at the boundary: a
  sample 3001 ms before the stop is a pass, one exactly 3000 ms before is
  doomed. The 3 s count back from when the car stopped getting anywhere, not
  from the end of the episode (2 s of standing still change nothing). A car
  that slid back is recorded at its furthest point.
- Time limit (visited only), finished (all passes, fastest lap time kept),
  empty trace, a start part-way round.
- The bracket: highest surviving speed and lowest doomed speed, each with the
  lateral offset (and clock) of its own attempt; a standstill stored as 1.
- `features()` over a stretch of three bins by hand (most visits, summed
  crashes, caps, clipping), where one stretch ends and the next begins, edges
  off the bin borders, the offset argument, a dirty output array.
- A single crash in any bin ahead shows in exactly one of the 21 stretches.
- The four globals at and beyond their clips; all 130 inputs exactly zero for
  an empty memory; `clear()`.

`test_memory_env.mjs` (one simulator, desert3, 21 checks): `MemoryEnv` against
a slow reference memory written in the test from the README's description and
fed by a trace the test records itself. All 130 memory inputs of every
observation of attempts 2, 3 and 4 are compared with it (largest difference
under 1e-5).

- 482-long observations whose first 352 numbers are `RacingEnv`'s own.
- Attempt 1: every memory input of every observation exactly zero.
- `memory: 0`, `newSession()`, and sessions of random length: the lengths are
  predicted in the test from the seed (mulberry32 written again) and must
  match, with `sessionEnd` on the last attempt of each and no other.
- A reference change from outside (`setReference`) and from inside
  (`refLaps`): a new, empty map of the right size.

`test_agent.py` (CPU, one simulator for 15 s, 42 checks)

- `session_advantages`: five cases by hand; equal to a slow reference written
  from the definition on 60 x 5 random steps at carry 0, 0.3 and 1 (largest
  difference under 1e-9); identical to `compute_advantages` at carry 0; each
  attempt end inside a session gains exactly carry x the next first value.
- Warm start: the first layers are the checkpoint's 352 columns bit for bit
  plus 130 zero columns, every other tensor identical; same scores, value and
  top choice on 4096 random 482-number inputs.
- `write_actor`: size, and byte-identical to `rl/export_actor.py`'s file for
  the 352-input agent.
- `attempts.mjs` with the warm-started actor (two attempts, the first
  sabotaged): row layout, flags, zero memory in attempt 1, the sabotage window.
- Node against PyTorch on the 22 scores for all 239 recorded observations,
  twice: with the warm-started weights, and with RANDOM memory weights (with
  zero weights a Node actor that ignored inputs 352 to 481 would also pass).
- `act()` on 482 inputs gives the checkpoint's log-probabilities, entropies
  and values; `ppo_loss` equals the loss written out in the test, with ratios
  outside the clip range; the zero memory weights receive gradient.
- `toy_probe.py`: prints the README's table; rows 1 and 2 recomputed by brute
  force over the 71 limits, row 3's total by an independent memoised search
  (2.412), the 55% share.

`test_attempts.mjs` (two simulators, 11 checks): the README's measurement on
desert3 (3 sessions of 5 sampled attempts) with `memory=1` and `memory=0` side
by side: the same 15 attempts in both, memory zero exactly on attempt 1 (and
always with `memory=0`), the printed table and crash-repeat count recomputed
from the per-attempt lines.

The author's `memory_test.mjs` and `smoke_test.py` are run last, as one check
each: they still pass after the fix below.

## Not covered, and why

- Training: none was run by anyone. Whether a policy learns to use the inputs
  is unknown.
- `MemoryEnv` under `env_server.mjs` / `train_ppo.py`: written after these
  tests (16 October 2026) and checked only by their author's smoke runs
  (README, "Trainer changes"); route mode (`reference: 'route'`, 464 inputs)
  likewise. No independent tests of them yet.
- `MemoryEnv.demo()` and `save()`: not exercised.
- The claim that the memory's stretches are the SAME points as the
  observation's lookahead points: the test recomputes the edges with the same
  formula; it does not read the points back out of the 352 inputs.
- winter4, and `attempts.mjs` with a policy that actually uses the memory
  (none exists).

## Defects

1. FIXED. `memory_env.mjs` `stepBlock` (now lines 137 to 142): the observation
   returned with the LAST decision of an attempt was built after the attempt
   had been added to the memory. So the final observation of a first attempt
   was not all zero: it showed that attempt's own crash and "attempts so far"
   at 1/8 (and at 2/8 at the end of attempt 2, where the reference says 1/8).
   This contradicted the comment three lines below it and the README ("on a
   first attempt all 130 are zero"). Fix: build the observation before the
   commit. Effect of the bug in practice was small (that observation is not
   acted on; a trainer that bootstraps from it would have seen it). Found by
   the comparison with the reference memory.

2. FIXED on 16 October 2026, by the author of the trainer changes (not by
   this tester), in both of the ways suggested below: (a) `memory_env.mjs`
   `stepBlock` now reads `RacingEnv`'s counter and, when a `refLaps` switch
   is due at the next `reset()`, ends the session there (so the memory is
   cleared even if the same lap is drawn again) and sets the flag; in route
   mode a reference change does not touch the memory's bins (they are on the
   route), so it ends nothing; (b) `rl/env_server.mjs` gives the trainer its
   session ends from the next reset's `info.attempt === 1`, exact also for a
   `setReference()` from outside. The check below now passes (run: `1 2| 1 2
   3| (new line) 1 2`). Original report:
   `memory_env.mjs` line 152,
   `info.sessionEnd = this.attemptsLeft <= 0`. When `RacingEnv` switches
   reference inside `reset()` (`refLaps` training), the memory is cleared, but
   the attempt before it was not flagged `sessionEnd` (test run: `1 2 3 4| 1
   (new line) 1 2`, the lone `1` has no flag). The doc comment says the flag
   "says whether the next reset() will clear it". Consequence: with `carry` >
   0 and `refLaps` > 0, `session_advantages` passes value across a cleared
   memory. Neither is a default, and carry 0 is unaffected. Not fixed because
   the wrapper cannot know at the end of an attempt what the next `reset()`
   will do without reading `RacingEnv`'s private counter
   (`episodesOnReference`); the clean fix is for the trainer to take the flag
   from the next reset's `info.attempt === 1`.

3. README, "How to run" (line 154) and point 1 of "Which design": the command
   printed has no `seed=`, so it runs seed 1, but the figures quoted are those
   of `seed=2`. With `seed=2`: desert3 15 of 15 crashed at the three places
   (8, 2, 5), script count 4 of 12; summer3 10 of 15 finished, four crashes at
   628 to 632 units. All as written. With the command as printed (seed 1):
   desert3 14 of 15 crashed and one finished (21.036 s), crashes at 270 to 312
   (6), 748 to 812 (3), 1160 to 1172 (4) and 1374 (1), script count 6 of 11;
   summer3 10 of 15 finished, crashes at 312, 618, 634, 906, 916, script count
   0 of 4. So "a crash site seen once is very likely to be met again" holds on
   desert3 for both seeds, and on summer3 for one seed of two. README not
   edited.

Smaller observations, not counted as defects:

- `memory_env.mjs` lines 160 and 174: attempts are recorded by `renv.progress`
  but read out from `renv.progressIndex`, which can differ by up to half a
  unit. Near a bin border the car's "own" stretch can start one bin ahead of
  the bin its trace is written to.
- `track_memory.mjs` line 171: the README says a crash is counted in the bin
  the attempt "ended in"; the code uses the furthest point reached. The same
  place unless the car bounced back.
- `track_memory.mjs` line 159: a pass at 0 km/h (the first sample on the start
  line) is not stored, so bin 0 never has a surviving speed.

## The README's claims

| Claim | Result |
| --- | --- |
| On a first attempt all 130 inputs are zero | Confirmed after fix 1 (before it, false for the last observation of the attempt) |
| The map classifies surviving and doomed stretches as specified, keeps the bracket, shows a crash bin in exactly one stretch, does not credit road before a part-way start | Confirmed on independent hand-built cases |
| Sessions last 1 to `sessionMax` attempts; memory empty exactly on attempt 1; a reference change starts a new session | Confirmed, lengths predicted from the seed; `sessionEnd` was not set before a `refLaps` change (defect 2, since fixed) |
| The warm-started 482-input agent gives the 352-input checkpoint's outputs | Confirmed (weights bit for bit; outputs within 1e-4 on 4096 inputs; same top choices) |
| Node and PyTorch agree on the actor's scores | Confirmed, also with non-zero memory weights |
| `session_advantages` equals `compute_advantages` at carry 0; with carry only the ending step of an attempt inside a session changes | Confirmed against a slow reference; the change at that step is carry x the next first value, and it then flows back to the attempt's earlier steps through the usual recursion |
| Toy table (0.359 / 0.444 / 2.134 / 2.412, 55%) | Confirmed, rows 1 and 2 by brute force, row 3's total by an independent search |
| desert3 and summer3 crash-repeat figures | Reproduced with `seed=2` only; the printed command gives other numbers (item 3) |
| `ppo_blkgen.best2.pt` was not trained on desert3, summer3, winter4 | Confirmed from the checkpoint |
| Whether a policy learns to use the memory | Untested by the author and here |
