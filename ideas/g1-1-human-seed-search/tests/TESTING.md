# Tests of g1-1 (search from the human's lap)

Written by an independent tester, not by the author.

```
node ideas/g1-1-human-seed-search/tests/run_tests.mjs
```

76 checks, all passing, about 90 s with training running; never more than 2
simulator processes at once. One `PASS` / `FAIL` line per check, a final
count, exit 0 only if nothing failed. The helpers come from
`ideas/shared/tests/` (`harness.mjs`, `headline.mjs`).

## Headline claims

All four hold. Each lap was replayed from the start line with `sim/env.mjs`
and given to the game's Verify directly, without `ideas/shared/verify.mjs` or
any code of this folder.

| Track | Claimed | Finishes on that tick | Verify | One tick fewer | Best human lap (lap 0, replayed) | Faster by |
| --- | --- | --- | --- | --- | --- | --- |
| desert4 | 21.722 s | yes | passes | rejected | 21.750 s, fastest of the ten | 28 ms |
| winter2 | 26.816 s | yes | passes | rejected | 26.830 s, fastest of the ten | 14 ms |
| summer4 | 34.100 s | yes | passes | rejected | 34.105 s, fastest of the ten | 5 ms |
| summer1 | 22.127 s | yes | passes | rejected | 22.131 s, fastest of the ten | 4 ms |

Also confirmed: `runs/g1-1-smoke_<track>.json` holds the same keys as the
`.recording.json`; `out/g1-1-smoke_<track>.recording.json` is the same lap;
"only the last 7 s was searched, the rest is the human's keys": every key flip
before (lap time − 7 s) is the human's, and the first difference is at 17.306 s
(desert4), 20.282 s (winter2), 30.457 s (summer4), 21.254 s (summer1).

The laps were **not** affected by the `SimSession.load()` defect: this folder
does not use `ideas/shared/sim_session.mjs` (checked by the test).

## What is covered

| Test file | What is checked |
| --- | --- |
| `test_headlines.mjs` (41 checks, 1 simulator) | the table above |
| `test_worker.mjs` (24; 1 worker process + 1 replay simulator) | `section_worker.mjs` through its messages. `prepare`: the human lap finishes on 21750 from the start and from a save state at 20000; a limit one tick short gives `null`; a lap that never moves gives `null`. `search` on the last section and on a mid-lap section: counts consistent, the returned lap is a valid timeline, never slower, `gained > 0` exactly when a step was kept, **the returned lap replayed from the start line finishes on the tick the worker says**, and no key flip before the section start changed. `seconds` is honoured. `adopt`. The defect below, with two seeds |
| `test_script.mjs` (11; the script's own 2 workers) | `search_human.mjs`: exit 1 and nothing written when the starting lap does not finish; exit 0 and "no improvement, nothing saved" with `seconds=0`; `seed=<saved lap>` is driven and comes out at 21.722 s; `last=1500` selects 2 sections; a 16 s search on the last 1.5 s finishes with PASS Verify, writes `runs/g1-1-<out>_desert4.*`, and that lap replays and verifies independently (it found 21.747 s in every run made here) |

The test files written to `runs/` (`g1-1-test-run_*`) and to `out/` are
removed at the end.

## Defect found (fixed)

**A candidate could move a key flip to before the section start, where the
save state had already been made.** `section_worker.mjs`, `change()` (the call
to `mutate()`, line 251 before the fix; lines 269 to 283 now). `mutate()` of
`sim/search.mjs` picks a flip inside the window but then moves it by up to
`maxShift` = 20 ticks either way without keeping it inside the window. A flip
within 20 ticks after the section start could therefore land before it. The
worker drives candidates from a save state at the section start, so such a
candidate was timed as one lap (the flip taking effect at the section start)
and written down as another (the flip earlier). The same applied to the repair
step, which calls `change()` from its own save state.

Measured on the human desert4 lap with a section starting on a flip (tick
21180): 236 of 1000 mutations moved a flip before the start. With every
finishing candidate accepted (`minLead=-1e9`), seeds 1 and 5 returned laps with
flips at 21177 to 21179.

Consequence before the fix: the final check in `search_human.mjs` replays the
result from the start line and compares the tick, so a wrong lap would have
ended the run with `FAIL` and exit 1, not a false time; the four headline laps
passed that check and pass it again here. What it cost was the chance of a
whole run thrown away at the end.

Fix: `change()` throws such a candidate away and draws another (up to 8
times), with a `sameBefore()` helper. `test_worker.mjs` runs the two seeds
with forced acceptance and checks that no flip before the start changed and
that the lap replays to the worker's tick.

## Other claims in the README

- "Every gain came from small steps" and "the big step never triggered": not
  checked. The author's run logs were not kept, and the tests here do not
  print the split (one manual run with forced acceptance kept 86 small steps,
  0 big, 0 repaired).
- The table of candidates tried / kept, the 13 ms and 33 ms side experiments,
  and the per-section figures: **not re-run** (each is a 40 to 100 s run on 2
  processes per track; the result of such a run depends on how many candidates
  the time limit allows, so it would not reproduce tick for tick anyway).
- "the sub-tick measure disagrees with the clock by up to a third": seen here
  too (a 5 s search of the last section gained 2 ms on the clock and 0.2 ms by
  the measure); not tested as a claim.

## Not covered, and why

- **The big step and the repair** (`repair()`, `splice`): no candidate in any
  test run qualified for one (the README says the same of its own runs), so
  these paths ran only inside the forced-acceptance case, if at all. They are
  untested.
- **The car-replacement path** (`rebuild()` after 4.5 million ticks): needs
  several minutes of search in one section.
- **A worker that throws** (for example `accept()` finding that a lap does not
  repeat): the error is not sent to the parent, so `search_human.mjs` would
  wait for ever. Not triggered by anything seen; not tested.
- `SEARCH_DEFAULTS` cannot be imported for a test without booting a simulator
  (the module starts one at import), so the defaults are not checked.
- Tracks other than desert4 for the worker and script tests; `order=front`,
  `passes`, `workers` other than 2.
- Whether two search runs with the same seed give the same lap: they do not
  have to (the time limit decides how many candidates are tried).
