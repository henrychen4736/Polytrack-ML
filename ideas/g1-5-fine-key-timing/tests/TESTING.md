# Tests of g1-5 (fine key timing)

Written by an independent tester, not by the author.

```
node ideas/g1-5-fine-key-timing/tests/run_tests.mjs
```

100 checks, all passing, about 1 minute with training running; never more
than 2 simulator processes at once. One `PASS` / `FAIL` line per check, a
final count, exit 0 only if nothing failed. The helpers come from
`ideas/shared/tests/` (`harness.mjs`, `headline.mjs`).

## Headline claim

**Holds.** `runs/g1-5-smoke-human_desert4.recording.json`, claimed 21.722 s:

- replayed from the start line with `sim/env.mjs` it finishes on tick 21722,
  and stopped at 21721 it has not finished;
- the game's Verify accepts 21722 and rejects 21721;
- `runs/g1-5-smoke-human_desert4.json` holds the same keys;
- lap 0 of `data/laps/desert4.json` replays to its stated 21750 and is the
  fastest of the ten, so this lap is 28 ms faster;
- the nine moves in `smoke_human_desert4.json`, applied to the human lap by
  hand with `nudge` / `shiftTail`, give exactly the saved lap, so the log
  explains the whole result; seven are tail shifts, five at −10 ms, as the
  README says;
- every key flip before tick 17740 is the human's;
- the first three of those moves (the ones at flips after 21.0 s) come out
  again, identically, from a fresh `refine.mjs` run.

It is a **different lap** from g1-1's desert4 lap, which is also 21722 ticks:
the key timings differ, so the equal time is a coincidence.

The other result, `runs/g1-5-smoke_desert4` (the searched lap, "0 ms gained"),
also holds: it is the input `runs/rollout_desert4.recording.json` key for key,
replays to 21907, Verify accepts 21907 and rejects 21906, and its log shows no
accepted change in 821 drives.

## What is covered

| Test file | What is checked |
| --- | --- |
| `test_fine.mjs` (42 checks, no simulator) | `listFlips` order and indices; `nudge`: the one flip moves, one tick short of a neighbour is allowed and reaching it is `null`, tick 0 allowed and below it `null`, the input is not modified; `shiftTail`: which flips move (a flip one tick before `from` does not, reset does not), `null` when a shifted flip would meet an unshifted one or go below 0, shifted flips keep their spacing, in per-tick keys the result is the old keys d ticks later; both moves on 400 random timelines always give strictly increasing flips that survive timeline → keys → timeline; `subTick` (on the plane, half a tick past it, short of it, unfinished, moving backwards), `makePlane`, `better`, `parseArgs`. Then the README's smoothness numbers against `smoothness_desert4.json` and `smoothness_human_desert4.json`: 16 flips, 58.5 % lost, the lost count of every flip, the three printed rows of finish tick against d, the human lap's 10 flips and best d values |
| `test_headline.mjs` (15, 1 simulator) | the two lists above |
| `test_child.mjs` (23; 1 worker process + 1 replay simulator) | `child.mjs` through `openSims`. `prepare` puts the car at the tick asked for; `try` from the start line and from a save state at 18000 gives the same finish tick and the identical position; twice gives the identical reply; `maxFrames` one tick short is not a finish, exactly the finish tick is; `samples` are reported at the ticks asked for with exactly the positions of a plain replay. **Eight moved versions of a late flip: the finish tick from the save state equals the finish tick replayed from the start line.** The ladder of save states: after it was built with one lap, a lap that differs 9 s in is not started from a stale state (it gets its own result, "lost", not the old lap's 21750), and the old lap gets its own again; a brake tap starting exactly on a ladder tick and one tick before it both match the replay; `prepare` going backwards to a tick between ladder ticks |
| `test_scripts.mjs` (20; the scripts' own 2 workers) | `refine.mjs`: exit 1 with no lap and with a lap that does not finish (nothing written); a real run on the human lap from 21.0 s exits 0, reports PASS Verify, the recording file / log / printed line agree, the accepted changes form a strictly improving chain, the logged moves applied by hand give the saved lap, the changes equal the README log's, and the saved lap replays and verifies independently. `smoothness.mjs`: exit 1 with no lap and with a lap that does not finish; a 2-flip run writes a file in which every d from −3 to 3 is present, d = 0 finishes on the input's tick, and `lost` matches the points; `flips=1` |

Test files written to `runs/` (`g1-5-test-*`) and to `tests/tmp/` are removed
at the end.

## Defects found

1. **`smoothness.mjs flips=1` crashed** (`smoothness.mjs`, the line choosing
   the sample, line 48 before the fix, line 50 now): the spacing was
   `k * (n − 1) / (count − 1)` = 0 / 0 = NaN, `inRange[NaN]` is `undefined`,
   and the script died with a TypeError on its first flip (exit 1, no file).
   **Fixed** with `Math.max(1, count − 1)`; covered by `test_scripts.mjs`.
2. **`SimSession.load()` in `ideas/shared/`** (reported by g1-2, fixed there,
   see `ideas/shared/tests/TESTING.md`). This folder was **not affected**:
   `child.mjs` reads `sim.keys` only in `sim.keys === undefined` ("has a car
   been made yet"). It takes the lap from the timeline the parent sends, uses
   `sim.tick` (which `load()` always set correctly) to know where the car is,
   and the result goes to Verify as a timeline. `test_child.mjs` compares the
   child's answers with replays from the start line, and the headline lap
   verifies independently.

Related fix in the shared module that touches this folder: `SimSession.motion()`
on the finish tick used to be measured across up to 49 ticks instead of 4.
`child.mjs` sends that velocity to `subTick()`. `subTick` is only used by the
smoothness summary and by `ties=1` (off by default), so no reported time
changes; the sub-tick values in a new smoothness run may differ slightly from
those in the two stored data files.

## Other claims in the README

Confirmed:

- Smoke test 1 (searched lap, 0 ms gained, the input returned unchanged) and
  smoke test 2 (21.750 → 21.722 s with the nine listed moves).
- Smoothness tables for both laps, as far as they are in the two data files:
  lost counts per flip, 58.5 % lost overall, the rows for flips 18581, 20691
  and 18578, best d of −2 (6.85 ms) and +1 (4.40 ms) at 13534 and 17103, no
  flip of the searched lap with a gain.
- "The result is never slower than the input and exits 1 otherwise": the
  accept rule (`better`) was tested; the exit-1 path for a slower result
  cannot be reached without breaking the code, so it was not run.
- "exits 1 if Verify fails": covered only by the non-finishing input.

Could not confirm:

- The row for flip **18231** of the searched lap: the README itself says its
  data file was not kept.
- The rank correlations (−0.72 to +0.98) and the "0.05 / 0.15 ms per ms of d"
  slopes: they are in the data files' `ahead` fields but were not recomputed.
- "`subTick` disagreed with the tick count by more than one tick (21908 scored
  21906.4)": not looked for.
- The timings (0.11 s per candidate, 0.69 s per whole-lap drive) and the cost
  estimates for a full run.

## Not covered, and why

- `ties=1`, `order=forward`, `moves=nudge` alone, `passes` above 1, `workers`
  other than 2, tracks other than desert4: time, and the README lists them as
  not run by the author either.
- `refine.mjs` when nothing is gained: it then saves the input lap under the
  run name and exits 0. Seen in the author's smoke test 1 (and checked from
  its files), not run again.
- `child.mjs` replacing a used-up car (4.5 million ticks) and rebuilding the
  ladder.
- **A child that throws.** `prepare` beyond the finish throws inside the
  message handler ("the lap finishes before tick ..."); nothing is sent back,
  so the parent would wait for ever. `refine.mjs` and `smoothness.mjs` never
  ask for that, so it was not triggered; it is a hazard for new callers of
  `openSims`.
- `smoothness.mjs` with no flip in range (`from` past the end): it writes a
  file with `lostFraction` NaN and exits 0. Not tested.
