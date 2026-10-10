# g1-4 beam search: independent tests

Written by a tester who did not write the code. Run from the project root:

```
node ideas/g1-4-beam-search/tests/run_tests.mjs            # one line per check, PASS or FAIL
node ideas/g1-4-beam-search/tests/run_tests.mjs verbose=1  # also the test programs' other output
```

Result on 2026-10-10, with training running on the machine: **147 passed, 0
failed, 271 s**. At most 2 simulator processes at any moment. Exit code 0
only if every check passes. No code in the folder was changed.

## What is covered

| File | Checks | What |
| --- | --- | --- |
| `test_prune.mjs` | 30 | `prune()` of `beam.mjs` and `ranks()` / `spearman()` of `calibrate.mjs`, on hand-built inputs. Both files are scripts (importing them starts a search), so the functions are cut out of the source text and compiled with the settings they read. It is the code in the file that runs. No simulator |
| `test_child.mjs` | 45 | `child.mjs` through its own protocol: `root`, `adopt`, `expand` (with and without `forced`, `mark`, `lookahead`), `commit`, `keep`, `finish`, `idle`; then the same requests on a child with `carBudget=60000` |
| `test_beam.mjs` | 65 | `beam.mjs` as a command, seven short runs late in the desert4 lap, and each reported lap replayed independently |
| `test_calibrate.mjs` | 7 | `calibrate.mjs` as a command (`at=420 n=6`), twice |

How the specific targets were tested:

- **Determinism.** `start=300 depth=320 beam=6 rollEvery=10` twice. That run
  finds a faster lap (22.061 to 22.040 s, with the elite changing hands at
  15.50 s into the lap), so it is not a comparison of two untouched laps. The
  two runs give the same tick, the same recording string, and the same
  printed search line for line (candidate count, rollouts, beam positions,
  tick total), wall-clock numbers aside.
- **The reported lap replays and passes Verify.** For six of the runs and for
  the author's saved `runs/g1-4-smoke_desert4` (21.997 s): the recording
  string in the saved file is decoded to keys and driven on the bare simulator
  (`ideas/shared/sim_session.mjs`: no training environment, none of this
  idea's code). It crosses the line on exactly the printed tick and not one
  tick sooner; the printed time, the "verified" line and both saved files
  agree; the keys are block decisions with no tick out of place. For two runs
  the game's Verify was run again here (accepts the tick, rejects one fewer).
- **The elite guarantee.** Every run ends no slower than it started. The
  sharp form: with `beam=1` the beam holds the elite and nothing else, so the
  result must be the starting lap exactly. From the policy's lap it is
  22.061 s; from `from=runs/rollout_desert4.json` it is 21.907 s and the saved
  keys equal the file's keys on all 21907 ticks. That fails if the incumbent,
  replayed decision by decision inside the beam, drifts by one tick. A beam
  of 4 from the lap file run across the finish line (no `depth`) also ends at
  21.907 s. `from=human:0` (not block decisions) is refused with the reason
  and the policy's lap is used.
- **Pruning and bucketing.** Best-first order; exact repeats (same position
  and speed to 0.001) dropped even when the beam has room; at most
  `perBucket` from one bucket while better-spread candidates remain, then
  filled from what was passed over, best first; bucket edges across (0.25)
  and along (0.5) including the two sides of the line; the bucket sizes are
  the settings; the elite kept at any score, counted towards `beam`, and a
  twin of the elite dropped instead of the elite; no process over
  `ceil(1.5 x beam / workers)` while another has candidates.
- **The forced car rebuild.** At the child: with `carBudget=60000` the child
  rebuilt its nodes on a new car several times during 18 requests and every
  reply (node ids, candidates, positions, values, finished laps) is identical
  to the child that never rebuilt. At the search: `carBudget=90000` gives one
  rebuild in mid-search and the same lap, the same recording and the same
  printed search as the run without.
- **Child details checked against independent values**: a node's tick from
  the block layout (1 + 50 x decisions); the first candidate is the decision
  the policy's own lap took there; candidates carry slice 0 where a control
  does not change and contain no repeats; the three systematic alternatives
  are present; `expand` twice with one seed is identical to the last digit;
  a committed candidate driven again from the start line (`adopt`) is the same
  car to the last digit; `look` with `lookahead=3` is the progress four
  decisions on in the lap driven from that node, and costs 200 ticks; two
  finished laps from the child, converted to keys and driven on the bare
  simulator, finish on the same tick and not one tick sooner.

## What is not covered, and why

- `rank=look` and `rank=lookvalue` in `beam.mjs` end to end (the child's
  lookahead numbers are checked; a run costs four times the ticks), the
  `lookDead` branch, `seconds=` (it stops on wall time, so it is not
  repeatable by design), `workers` other than 2, any track other than
  desert4, any checkpoint other than `ppo_sr1_desert4.u800`.
- A whole-lap run, and every measured number in the README's sections 1 to 3
  and 5 (the calibration table, the 47 to 64 ms gains, timings, tick
  budgets). Re-measuring them needs minutes per number.
- The error "the incumbent lap ended ... replay is not exact" was never
  triggered, so that branch has not been seen to work.

## Defects found

None that make a result wrong. Three things worth knowing:

1. **A small `carBudget` makes the search rebuild on every request**
   (`child.mjs:186`, `ensureCar`; `rebuild` at `child.mjs:174`). A rebuild
   spends ticks itself: a new ladder (about 22 000) plus 50 per decision per
   live node. If that is more than `carBudget`, the car is "used up" again as
   soon as it is rebuilt. Measured on the stretch run: `carBudget=75000` gave
   19 rebuilds and 150 s against 23 s; 90000 gave one. With the real budget
   (4.5 million) and the README's figures this cannot happen, so it only
   matters when testing with `carBudget`. The README's own example (30000,
   "13 times in a 10-decision run") is the same effect.
2. **The elite does not count towards its bucket** (`beam.mjs:182`, the first
   loop of `prune`). The README says at most `perBucket` are taken from one
   bucket; the elite's own bucket can hold the elite and `perBucket` others.
   Recorded as what the code does (`test_prune.mjs`), not treated as a
   failure: the README does not say which is meant.
3. **A mistyped option is silently ignored** (`beam.mjs:90`, e.g. `beem=8`
   runs with the default beam). Only `rank=` is validated.

## Did the README's claims hold?

| Claim | Verdict |
| --- | --- |
| Every lap it reports passes Verify | Confirmed on seven runs and on the saved smoke lap (replayed on the bare simulator; Verify repeated on two) |
| The same command gives the same lap to the tick | Confirmed, on a run that improves the lap |
| The result is never slower than what it started from | Confirmed, including from a lap file and with a beam of 1 |
| The policy's own lap is 22.061 s | Confirmed |
| `runs/g1-4-smoke_desert4` is 21.997 s | Confirmed: the saved recording finishes on tick 21997 on the bare simulator |
| Car rebuild ends with the same lap | Confirmed, at the child (several rebuilds, every reply identical) and in the search (one rebuild) |
| From the 21.907 s lap, short stretches find nothing | Consistent: the two runs here from that lap also ended at 21.907 s |
| Pruning: diversity buckets, 1.5 even shares per process, exact repeats dropped | Confirmed as described, with the note on the elite's bucket above |
| 2-second stretches find 47 to 64 ms | Not re-measured. One 1-second stretch here (15.0 to 16.0 s, beam 6) found 21 ms |
| Calibration table, speeds, memory and tick figures, cost of a full run | Not checked |
| The search stops with an error if the incumbent ever replays differently | Could not confirm: it never happened, so the check was never exercised |
