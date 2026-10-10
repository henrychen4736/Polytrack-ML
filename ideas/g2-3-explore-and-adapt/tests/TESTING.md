# g2-3 explore and adapt: independent tests

Written by a tester who did not write the code. Run from the project root:

```
node ideas/g2-3-explore-and-adapt/tests/run_tests.mjs
```

94 checks, 94 pass, about 2 minutes with training running. At most two
simulator processes at once. Everything the tests write under `runs/` and
`out/` is named `g2-3-test-*` and removed at the end.

## What is covered

`test_logic.mjs` (no simulator, 47 checks)

- `cellKey`, `offer` and `chooseCell` of `explore.mjs`, cut out of the source
  text and run on hand-built cases (the script has no exports): cell borders
  along the road and sideways, the clamp at 4 side cells, "soonest arrival
  keeps the cell" at its tick boundary, the dropped save state, a save state
  of an earlier car left alone, the restart window (both ends, at 80 units/s)
  and the 1 / (1 + tries) weights (exact pick boundaries and 4 : 2 : 1 shares).
- `analyze.mjs` on two made-up logs with a hand-worked table (a lap finished
  at 10.01 laps must not count as "within 10"; 1.5 s and 1.51 s behind the
  frontier fall in different rows).
- The README's table and figures recomputed from the author's logs in `out/`
  with code written here: all six rows, the 2.7 / 9.4 / 5.5 laps, 9 to 62
  attempts, the lap-time ranges, the plain stop at 66.7 to 67.2%.
- What the logs say about the comparison: same seeds, same policy file, same
  unit of budget for both modes; attempt 1 identical in both; no unfinished
  run stopped short of 10 laps (so the wall-clock limit never cut one); every
  plain attempt starts on the line and is charged its own driven ticks.
- The restart rules followed in all 26 final-setting logs (294 restarts): the
  level is floor(stale / 4) mod 3, every restart is 0.5 s to 1.5 / 3 / 5 s
  behind the frontier, the frontier never goes back, "moved" means > 5 units.
- `finetune_plan.sh`: runs nothing, and every option in the commands it
  prints is one `train_ppo.py` / `evaluate.py` / `lap_bc.py` defines.

`test_sim.mjs` (simulator, 47 checks). It runs `explore.mjs` six times on
winter4 as a child process (two at a time, each under 35 s) with `hook.mjs`
loaded in front of it. The hook wraps `RacingEnv`'s `reset`, `stepBlock`,
`mark`, `rewind` and `dropMark`, counts the ticks really stepped, and keeps
its own record of the decisions that led to the car's present state across
every rewind.

- Determinism: seed 1 twice gives the same run attempt for attempt and the
  same lap to the tick (19920).
- A finished lap is real: the saved keys equal, key for key, the hook's
  record of what the simulator was actually given (after 10, 5 and 61
  rewinds); the saved recording played from the start line on the bare
  simulator finishes on the stated tick; the game's Verify passes there and
  rejects one tick less. Also done for the 18 saved laps behind the README's
  explore rows (8 winter4, 5 desert3, 5 summer3).
- Budget: the cost the script reports is exactly 50 ticks x the block
  decisions the hook counted, in both modes.
- The car-replacement path, which the README says has never run: the hook
  makes the car look used up after attempt 3. The run then builds a second
  car, rebuilds cells by replaying their decisions, and every attempt starts
  and ends exactly as on one car; the lap found is the same; the replays are
  charged (5.10 laps against 2.85).
- Plain mode: no save state taken or restored, every attempt from the line,
  same first attempt, same seed, ran its whole budget.
- Headline, seeds 1 and 2: explore finishes after 2.85 and 9.37 laps of
  simulated time (19.920 s and 25.539 s laps); plain uses 10.9 and 10.8 laps
  on 13 attempts each and stops at 66.9%.

## Not covered, and why

- The fine-tune ("adapt") half: it is a printed plan; nothing to run. Only
  the flags were checked. Whether one found lap makes the generalist finish
  the track is untested by anyone.
- `smoke_test.sh` itself was not run; `test_sim.mjs` makes the same two runs
  (seed 1, explore and plain) with more checks.
- desert3 and summer3 were not re-run, only their logs and saved laps checked.
- Seeds 3 to 8 on winter4 were not re-run (time). Their logs and saved laps
  were checked; seeds 1 and 2 reproduce their logs exactly, so the rest very
  likely do.
- The `kinds`, `tail`, `hot`, `back`, `perLevel`, `refLap` options were only
  run at their defaults.
- The levels and windows are checked from logs, not by driving the loop on a
  fake environment: the loop is top-level script code.

## Defects and discrepancies

No defect in `explore.mjs` or `analyze.mjs` was found, and no code was changed.

1. README, lines 75 and 93: "winter4 plain ... 2 laps: 53%". The eight logs
   give 51.6% (52). 53.3% is what `analyze.mjs g2-3-s` prints, because that
   filter also matches `g2-3-smoke_plain_winter4.json`, seed 1 a second time,
   as a ninth run. One point; the conclusion drawn from it is unchanged.
   README not edited.
2. `explore.mjs` lines 159 and 224, `ticksUsed += 50`: a block that ends an
   attempt is charged 50 ticks although it stops when the episode ends. The
   reported cost is therefore slightly ABOVE the ticks really stepped: 2.848
   reported against 2.833 real laps (seed 1), 9.368 against 9.299 (seed 2),
   10.867 against 10.854 (plain). It errs against explore (more attempts),
   so the comparison is not flattered by it. Left as it is.
3. `explore.mjs` line 268: the wall-clock limit (`seconds=100`) can end a run
   before its budget; such a run would not repeat on a faster or slower
   machine. None of the 65 logged runs was ended by it (checked).
4. `explore.mjs` lines 193 to 195: when the car is replaced, `goTo` calls
   `toStart()` twice. Harmless (the second restores a save state).

## The README's claims

| Claim | Result |
| --- | --- |
| The checkpoint was trained on 14 tracks; desert3, summer3, winter4 are unseen | Confirmed from `saved["track"]` in `ppo_blkgen.best2.pt` (16 entries, 14 distinct, desert1 and summer6 twice) |
| winter4: explore finishes within 10 laps of simulated time, plain stops near 67% | Confirmed by re-running seeds 1 and 2 (both modes); logs of seeds 3 to 8 consistent; all 8 saved laps verify |
| The table (six rows), 2.7 to 9.4 laps, median 5.5, 9 to 62 attempts, lap-time ranges | Confirmed from the logs, except 53% which is 52% (above) |
| Every finished lap replays from the start line and passes Verify | Confirmed for the 18 explore laps of the table and the three test laps, independently of the script |
| Same budget, both modes stop at the first finish | Confirmed (logs and re-runs); cost counted in the same unit and slightly over-counted in both |
| Smoke test: seed 1 finishes on attempt 11 after 2.85 laps, 19.920 s; plain 6.72 laps, 8 attempts, 66.9% | Explore half confirmed exactly; plain half confirmed from its log, re-run here at 10 laps instead of 6 |
| Restart distance: 20 of 203, 16 of 77, 1 of 14; kinds 13 / 16 / 12 / 10%; off-line cells 9% of 140 against 23% of 56 | Confirmed from the logs (lift has 71 restarts, README says 72 to 78) |
| 73 to 131 cells per run; dropping `sample` still 8 of 8 on winter4, median 5.3 | Confirmed from the logs |
| The car-replacement path "has never executed" | It has now, forced by the test hook, and it works |
| Fine-tune steps 2 to 4 | Not run by the author, not run here |
