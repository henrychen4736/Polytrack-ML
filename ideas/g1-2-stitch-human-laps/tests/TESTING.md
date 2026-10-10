# Tests of g1-2 (stitch a lap from several human laps)

Written by an independent tester, not by the author.

```
node ideas/g1-2-stitch-human-laps/tests/run_tests.mjs
```

93 checks, all passing, about 3 minutes with training running; one simulator
at a time. One `PASS` / `FAIL` line per check, a final count, exit 0 only if
nothing failed. The helpers come from `ideas/shared/tests/` (`harness.mjs`,
`headline.mjs`).

## Headline claim

**Holds.** `runs/g1-2-stitch_desert4.recording.json`, claimed 21.730 s:

- replayed from the start line with `sim/env.mjs` it finishes on tick 21730,
  and stopped at 21729 it has not finished;
- the game's Verify accepts 21730 and rejects 21729;
- `runs/g1-2-stitch_desert4.json` holds the same keys;
- lap 0 of `data/laps/desert4.json` replays to its stated 21750 and is the
  fastest of the ten, so the stitched lap is 20 ms faster;
- "lap 1, then lap 7 from boundary 68 (17.0 s)": the lap is human lap 1 key
  for key up to tick 17082 and no other human lap beyond tick 970;
- **it reproduces**: `stitch_laps.mjs desert4 joins=0` run now writes a lap
  that is key for key the same (with the fixed `SimSession`, see below).

## What is covered

| Test file | What is checked |
| --- | --- |
| `test_paths.mjs` (37 checks, no simulator) | `angleBetween` (0, quarter turn, half turn, q and −q); `mismatch` with every term worked by hand (3-4-5 distance, cost 163 + 75π), symmetric, own weights; `stateAt`; `locate` (nearest tick, distance, range limits, clamping); `crossings` on straight synthetic laps with exact expected ticks: a lap at half speed, one beyond the 8-unit reach, one crossing a boundary point 60° off, a wider reach; `sectionTimes` with one, two and many missed boundaries (rows always add up to the lap time); `planRoute` on a 2-lap, 3-section table worked by hand: the cheapest route, `route().time` without switch costs, no switch on the start line, forbidden and expensive switches, the order of `switchCost`'s arguments, a 1 × 1 table |
| `test_headline.mjs` (11, 1 simulator) | the list above |
| `test_follow.mjs` (29, 1 simulator) | `recordPath`: every list filled for ticks 0..frames, throws when the lap does not finish on its stated tick, and position / quaternion / steering / wheels at ticks 2 and 5000 are exactly the car's when driven tick by tick; `path.velocity` and `path.spin` equal `SimSession.motion()`; `carState`, `compare` (and its `slack`). `follow` from exactly on the lap: raw stops exactly at `until`, does not overshoot a 50-tick `until`, drives nothing when already there, reaches the finish on the lap's tick with the lap's keys; resync and repair the same, repair trying only the 5 uncorrected windows. `follow` from a car knocked 2 cm off the lap: raw and resync lose the path, repair is within 1.5 units 3 s later after 327 candidate drives. **After that repair `sim.keys`, replayed from the start line on a new car, ends in the identical car state.** A car told to follow from the wrong place is reported lost after one window |
| `test_script.mjs` (16; one run at a time) | `stitch_laps.mjs`: the README's best human / best of sections / planned route for winter2, summer1 and summer4 (`stitch=0`); the default desert4 run prints the README's numbers, keeps one switch, reports PASS Verify on 21730 and writes the headline lap again; a run forced to lose the car reports `NO LAP`, writes nothing and exits non-zero; a run that accepts every switch (5 kept, 1 refused) passes Verify and its lap replays independently; the survival test with `joins=2` prints a tally for raw, resync and repair |

Test files written to `runs/` (`g1-2-test-*`) are removed at the end.

## Defects found

1. **`stitch_laps.mjs` exited 0 when the stitch produced no lap** (the
   `NO LAP` branch, line 285; it fell through to the final `process.exit(0)`).
   A caller looping over tracks could not tell "no lap" from "lap saved".
   **Fixed**: that branch now closes the simulator and exits 1 (lines 286 to
   289). `stitch=0` still exits 0, as no lap was asked for.
2. **`SimSession.load()` in `ideas/shared/`** (the author's own report):
   reproduced and fixed in the shared module, see
   `ideas/shared/tests/TESTING.md`. This folder was **not affected**: the
   `snapshot` / `restore` pair in `stitch_laps.mjs` put the keys back by hand,
   and `follow.mjs` only ever loads the point it has just saved on the branch
   it is driving, where the old behaviour was right. The workaround can stay;
   it is now redundant. Evidence that the keys are right: the headline lap and
   two further stitched laps (one with 5 kept and 1 refused switches, one
   manual run with 8 and 2) pass the game's Verify, which replays `sim.keys`
   from the start line.

Observation, not a defect: `angleBetween(q, q)` is not exactly 0 for the
game's float32 quaternions (they are not exactly unit length), so a lap
compared with itself shows up to about 0.1 ms of "mismatch". That is far below
the 6 ms (`good`) and 40 ms (`acceptCost`) it is compared with.

## Other claims in the README

Confirmed:

- Section table: best human / best of sections / default plan for desert4
  (21.750 / 21.680 / 21.734, 1 switch), winter2 (26.830 / 26.778 / 26.830),
  summer1 (22.131 / 21.438 / 22.027), summer4 (34.105 / 33.505 / 33.637).
- desert4 with defaults: lap 1, then lap 7 from boundary 68, 21.730 s, Verify
  PASS.
- "A raw switch essentially never survives; the repair makes it possible": in
  the test a car only 2 cm and 18 ms of mismatch off its own lap is lost by
  raw and by resync within 3 s, and held by repair. (One case, not the
  README's 20-join table.)
- "A kept switch can still make the lap slower with loose settings": the
  accept-everything runs gave 21.783 s and 21.870 s.

Not re-run (each is a run of 1 to 2 minutes or more per row): the join
survival table (20 desert4 joins, 12 summer4 joins, repair to the finish), the
`timeWeight` comparison, the winter2 / summer1 / summer4 stitch outcomes, and
the summer4 "no lap" result.

## Not covered, and why

- `scratch/tune.mjs` and `scratch/trace.mjs`: throwaway scripts by the
  author's own description; not run.
- `renewCar()` in `stitch_laps.mjs` (a new car after 4.5 million ticks): not
  reached in any run short enough for a test.
- `follow`'s give-up for a car that runs out of donor lap without finishing
  (`lastTick`), and the `trace` option.
- `table=1`, `start=`, `check=99999`, `finish=2` (repair to the finish for
  every tested join: about 20 s a join).
- Tracks other than desert4 for anything that drives; only the tables were
  run on three more.
- `recordPath` on a lap object without `source`.
