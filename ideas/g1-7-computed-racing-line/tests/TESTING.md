# g1-7 tests

Written by an independent tester, not by the author of the code.

```
node ideas/g1-7-computed-racing-line/tests/run_tests.mjs            # everything, about 100 s
node ideas/g1-7-computed-racing-line/tests/run_tests.mjs raceline   # only the files whose name contains "raceline"
node ideas/g1-7-computed-racing-line/tests/test_4_car_vs_sim.mjs    # one file on its own
```

One line per check, starting `PASS`, `FAIL` or `KNOWN FAIL`; a final count;
exit code 0 only if every check passes. Test files run one after another, so
there is never more than one simulator of ours (a test that launches one of
the author's scripts waits for it).

**Last run: 220 passed, 0 failed, 3 known failures; exit code 1.** The three
known failures are defects 5, 6 and 7 below, left in the code.

## What is covered

| File | Simulator | What it checks |
| --- | --- | --- |
| `test_1_raceline.mjs` | no | `curvature` on a straight, on circles of radius 25 to 240 (left and right), on a banked plane, on a crest, at the ends and at a corner entry. `speedProfile` with a made-up car whose numbers are constants, so every expected value is worked out by hand: a straight at constant acceleration (speed at every point and the lap time), a standing start, top speed, a 10% slope up and down, a constant-radius corner (speed = the car's limit for that radius), a corner between two straights (braking point, braking rate, corner speed, exit), pinned stretches, the cap near a jump; and against an independently written forward-backward pass. The same with the fitted car against the README's numbers. `shiftedPoints`, `optimiseLine`, `optimiseTime` on cases with a known answer, including bounds and pinned points. |
| `test_2_car_model.mjs` | no | `loadCarModel` on a small made-up table (interpolation, gap filling, clamping, `share`, `speedFor`), the real `car_model.json` (shape, `kappaMax` never rising with speed, `speedFor(kappaMax(v)) = v`, signs), and all 112 numbers of the README's car table against the JSON. |
| `test_3_testpad_sim.mjs` | 1 | `buildPad`: the parts read back with `sim/track.mjs`; the surface measured with 4278 downward rays (one height, no holes, ends at the stated bounds, nothing sticking up); the car left alone for 5 s (does not move, sink or tilt; rides 0.134 above the plates); faces -z; the ground plane at y = 0 beyond the pad. |
| `test_4_car_vs_sim.mjs` | 1 | The fitted model against a fresh measurement that shares nothing with `fit_car.mjs` (speed from positions, curvature as heading change per unit of path, one run per speed): W acceleration at 50 / 100 / 200 / 300 / 400 km/h, the model integrated over 8 s, coasting, braking at 350 / 250 / 150 km/h and the braking distance, W+A turning radius and acceleration at 134 / 226 / 320 / 416 / 512 km/h, steering ramp, slip angle, S+A. |
| `test_5_corridor_sim.mjs` | 1 | `buildCorridor` on desert4: every array against its definition, the labels recomputed from the rule, the README's rows for desert4, summer1 and winter2; the widths against our own measurement of the road at 1082 sides (a different probe: 0.05-unit steps following the surface); a car placed at each bound still has road under its outer edge (2581 bounds). The README's "human turns at the pad limit, ratio 1.00" re-derived on desert4 from per-tick positions with our own filter and our own curvature. |
| `test_6_scripts_sim.mjs` | 1 at a time | The scripts as the README runs them: `check_turn_limit.mjs` on the five tracks, `fit_car.mjs` (must rewrite `car_model.json` byte for byte), `compare_human.mjs desert4` (every number of README section 4, and `out/line_desert4.json` byte for byte), `drive_line.mjs desert4 human` at the default settings. The three laps under `runs/` replayed and put through the game's Verify. The 22.083 s lap driven again from the line file. |

## What is not covered, and why

- `drive_line.mjs` was not run with settings that finish. A finished lap makes it write `runs/g1-7-*_desert4.json`, and the tester may not write outside `ideas/`. What it does there (drive with those settings, Verify) is done inside `test_6` with saving switched off, and the result is the saved lap key for key.
- The sweep of nine driver settings per line (README: 1 of 9, 5 of 9, 3 of 9 finish). It takes 2 minutes. Only two of the 27 runs were repeated: computed line with gain 2 / lookahead 0.06 finishes in 22.083 s; human line at the defaults does not finish.
- The paper results for winter2 (26.723 s predicted) and summer1 (24.5 s). `compare_human.mjs` takes 25 s per track.
- Whether a computed line helps a search or a policy. Nothing in the folder claims it.
- Slopes: `speedProfile`'s gravity term is tested as arithmetic (v² = 2 g h). That the real car on a real slope behaves like that with g = 14.3 was not measured; the README says the same.

## Defects

### Fixed

1. **A bend tighter than the car's tightest turn made the lap time infinite.** `raceline.mjs` line 238 (was `limit[k] = car.speedFor(...)`). `speedFor` returns 0 for a curvature above the largest in the table (radius under 7.5 units); two points at speed 0 give a step time of 1/0, and `optimiseTime` can never leave such a line because no trial is "shorter" than infinity. Fix: the limit is floored at 0.1 units/s, the floor the same function already uses for the start line. No number on desert4 changes (`compare_human.mjs` output is byte for byte the same).
2. **Above 575 km/h the model said steering adds thrust.** `car_model.mjs` line 97. The full-lock table ends at 575 km/h and its last value (3.05 units/s²) was carried upward while the straight-line value keeps falling (0.29 at 675), so `accel(v, 1)` was up to ten times `accel(v, 0)`. Fix: full lock is never given more than the straight-line number. Changes nothing below 575 km/h beyond 0.05 units/s².

3. **Road ending in the last unit before the 20-unit search limit read as "20 or wider".** `corridor.mjs` `roomBeside`, line 81. The edge search needs two misses in a row and stopped at 20, so a road ending 19.0 to 19.5 out got only one miss and was reported as 20. The bound then put a car's outer edge up to 0.3 units past the road (2 bounds of 2581 on desert4; 3 sides overstated by 1 unit). Fix: a single pending miss at the 20-unit stop counts as the edge. desert4's median width moves from 31.24 to 31.21; the computed line and every README number are unchanged.
4. **Two comments in `testpad.mjs` were wrong.** Lines 6 and 14: the plates' surface is at y = 0.21, not 0.2, and the car spawns 1.35 units from the origin, not at it. Comments corrected; no code change.

### Not fixed (the three known failures)

5. **`car.brake(v, 1)`, braking with a steering key down, is not a property of the speed.** `fit_car.mjs` lines 124 and 139 (the S+A runs and their binning), used by `car_model.mjs` line 69. Measured: S+A from 300 km/h decelerates at 31.1 units/s² at 216 km/h; the model says 21.6 (31% less). The cause is that S+A is not a steady state: the wheel angle goes from +0.026 rad at 100 ms to -0.24 rad at 800 ms (the car is sliding and the game counter-steers), and the deceleration follows the time since the keys went down: about -80 in the first 100 ms, -25 to -37 for the next second, then -20. The table puts samples from different runs into speed bins, so each bin mixes early and late parts of different slides. That also explains the step in the README's table between 275 and 300 km/h (-34 to -39 against -16 to -24 below). Consequences: the README's sentence "Holding a steering key never makes the car slide" holds for W+A only (confirmed at 300 to 512 km/h); the S+A columns (radius and acceleration) and the suggestion that a brake-while-steering penalty could be exploited rest on these numbers and should not be relied on. None of the desert4 results use them (the human never brakes there). A fix needs a different experiment, not a small edit.
6. **The turning limit is stored with 4 decimals.** `fit_car.mjs` line 45 rounds every table to 4 decimals; for curvature that is ±1.4% at 500 km/h (0.0035) and ±1.7% at 575. The measured error is smaller than that worst case (-0.4% at 512 km/h, 0.0% at 416), so nothing downstream is visibly wrong, but the precision is poorer than the measurement and is one of the things `TOLERANCE = 0.03` in `raceline.mjs` has to absorb. Fix would be one more argument on that line plus regenerating `car_model.json`, which changes every predicted time in the README by a few ms; left to the author.
7. **The computed line starts 0.59 units beside the car.** `raceline.mjs` `optimiseTime`, line 191: the search may shift point 0, and in `out/line_desert4.json` it does (shift -0.59 at the start line, where the car's position is fixed). `optimiseLine` pins its first and last stations; `optimiseTime` does not. The gain it buys is fictitious but tiny. Not fixed because pinning it changes the computed line and with it the README's 21.792 s and the saved 22.083 s lap.

### Observations that are not defects

- `optimiseLine` solves on every 4th point and fills in between with straight interpolation of the shift, so at 1-unit scale the line has small kinks at the stations. `curvature()` (chords 8 points long) does not see them. The README already says this solver is not converged and is the wrong objective.
- The brake is weaker in the first 0.2 s after S goes down than the table says (-100.9 against -108.7 at 350 km/h, 150 ms in), because the table comes from one long stop from 600 km/h. Over a whole stop from 400 to 100 km/h the model's distance is 2.7% short (54.3 against 55.8 units).
- README "300 km/h in 5.6 s": measured 5.49 s (and the model integrates to 5.47 s). 100 km/h in 1.5 s and 320 km/h after 6 s are right.

## The README's claims

| Claim | Result |
| --- | --- |
| The car table, section 1 (all 112 numbers) | Matches `car_model.json`; `fit_car.mjs` reproduces the file byte for byte |
| W acceleration, coasting, straight-line braking | **Confirmed** by an independent measurement: acceleration within 0.4% at five speeds; speed and distance after 8 s within 0.1%; coasting within 0.4%; braking within 2% once 0.4 s into the stop |
| Tightest turn against speed (`kappaMax`) | **Confirmed**: within 0.8% at 134, 226, 320, 416 and 512 km/h |
| Full lock with W costs about a quarter of the acceleration | **Confirmed**: within 1.5% of `accel(v, 1)` at the same five speeds |
| Wheels reach their limit in 100 ms; no slide with a steering key (W+A) | **Confirmed** (slip 0.5°, 0.3°, 0.2° at 300, 400, 500 km/h) |
| Brakes "far weaker with a steering key down: -41 at 300 km/h and above, -16 to -24 below" | Weaker, yes. **The numbers are wrong as a function of speed** (defect 5) |
| Ground plane at y = 0, 314 km/h against 320 after 6 s | **Confirmed** (313.2 and 320.3) |
| Human turning / pad limit = 1.00 on five tracks | **Confirmed**: the script gives medians 0.98 to 1.02, 90th percentile at most 1.04 on all five; our own derivation on desert4 gives median 1.001 (10th 0.997, 90th 1.006) |
| Corridor make-up for desert4, summer1, winter2 | **Confirmed** to the percent; median widths 31.2, 24.4, 30.8 |
| Corridor widths come from the collision triangles | **Confirmed** against our own probe: median difference 0.00 units, 97.5% of sides within 0.5 (after fix 3) |
| Calibration 15.067 s human against 15.084 s model; human line predicted 21.919 s; minimum curvature 22.841 s; time search 21.792 s, largest shift 2.2 units | **Confirmed**, to the digit |
| Laps 22.083 s (computed), 22.133 s (model), 22.441 s (human's path), all verified | **Confirmed**: each replays to that tick and passes the game's Verify; one tick earlier is rejected |
| "Only model finishes at the default settings" | Confirmed for the human line (leaves the road at point 1418); the other two not run |
| Verdict: the computed line is not faster than the human on desert4 | **Holds**: the best lap is 0.333 s slower than the human's 21.750 s |
| 1 of 9 / 5 of 9 / 3 of 9 settings finish; winter2 and summer1 on paper | Not checked (see "not covered") |
