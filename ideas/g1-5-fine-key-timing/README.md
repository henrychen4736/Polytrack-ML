# g1-5: fine key timing (1 ms)

Take a lap that finishes and move each key change ("flip") to the best
millisecond: for every flip, every time within a window of where it is now is
driven from a save state just before the flip to the finish line, and the best
is kept if the lap finishes sooner. Two moves per flip: the flip alone
("nudge"), and the flip together with every later flip ("tail shift"). The
result is checked with the game's Verify and is never slower than the input.

Short version of what was found, all on desert4:

- Lap time against one flip's time is **not smooth**. It is flat or gently
  sloped in stretches, broken by cliffs of about 10 ms, and for any flip more
  than roughly 8 s before the finish almost every 1 ms move loses the lap
  altogether. A line search has nothing to follow; the script enumerates the
  window instead.
- On the searched lap (`runs/rollout_desert4.recording.json`, 21.907 s), the
  last 3.9 s: **0 ms gained** from 820 candidates. The lap is already the best
  point in every one-flip window tried. Timing precision of single flips is
  not where its remaining 157 ms are.
- On the best human lap (`human:0`, 21.750 s), the last 4 s, one pass, 90 s on
  2 processes: **21.750 -> 21.722 s, verified**. Seven of the nine accepted
  changes were tail shifts, five of them at the edge of the window (-10 ms).

## Files

| File | What |
| --- | --- |
| `refine.mjs` | the search: lap file in, verified lap out |
| `smoothness.mjs` | the measurement: lap time against one flip's time |
| `fine.mjs` | the two moves, the sub-tick lap time, the process pool wrapper |
| `child.mjs` | one simulator process: `prepare` (car to a tick, saved) and `try` (drive a candidate from there). Keeps a save state every 500 ticks so `prepare` never drives from the start line twice |
| `smoothness_desert4.json`, `smoothness_human_desert4.json` | the measurement data (every flip, every d: finish tick, sub-tick time, ms ahead at 300 and 1000 ms) |
| `smoke_desert4.json`, `smoke_human_desert4.json` | the two smoke-test logs |

## How to run

From the project root.

```
# the smoke test: last 3.9 s of the searched desert4 lap, 2 processes, 90 s
node ideas/g1-5-fine-key-timing/refine.mjs runs/rollout_desert4.recording.json from=18000 window=10 seconds=90 name=g1-5-smoke log=ideas/g1-5-fine-key-timing/smoke_desert4.json

# the same on the best human lap
node ideas/g1-5-fine-key-timing/refine.mjs human:0 track=desert4 from=17750 window=10 seconds=90 name=g1-5-smoke-human log=ideas/g1-5-fine-key-timing/smoke_human_desert4.json

# the smoothness measurement (defaults: 8 flips, +-10 ticks, about 100 s)
node ideas/g1-5-fine-key-timing/smoothness.mjs runs/rollout_desert4.recording.json
```

`refine.mjs` options: `workers=2 window=10 from=0 to=Infinity order=back|forward
moves=nudge,shift passes=3 seconds=Infinity ties=0 name=g1-5-fine log=<file>`.
It writes `runs/<name>_<track>.json` and `.recording.json` through
`ideas/shared/verify.mjs` and exits 1 if Verify fails or the result is slower
than the input (neither happened).

## What was run, and the numbers

Everything was on desert4 with training running on the machine, 2 simulator
processes.

### Smoke test 1: searched lap, flips from 18.0 s to the finish

`runs/rollout_desert4.recording.json`, 21 of its 81 flips, window 10, both
moves, order back. 820 candidates driven to the finish in 90 s (it stopped on
the time limit with one flip of the first pass left). **No candidate finished
on or before tick 21907.** Result 21.907 s, Verify PASS (the input, unchanged).

### Smoke test 2: best human lap, flips from 17.75 s to the finish

`human:0` (21.750 s), window 10, both moves, order back, 1173 candidates in
91 s, one pass, not finished (stopped on the time limit at 18.3 s, working
backwards).

```
left  at 21194: shift -10 ms -> 21.749      left  at 19042: shift -10 ms -> 21.744
left  at 21120: nudge -10 ms -> 21.748      left  at 18986: shift  -7 ms -> 21.743
left  at 21053: nudge  +9 ms -> 21.747      right at 18638: shift -10 ms -> 21.723  (-20 ms)
left  at 19204: shift -10 ms -> 21.746      right at 18335: shift  +7 ms -> 21.722
left  at 19103: shift -10 ms -> 21.745
```

**21.750 -> 21.722 s (28 ms), Verify PASS**, saved as
`runs/g1-5-smoke-human_desert4.recording.json`. This is a human's lap with its
last four seconds re-timed, not a lap the project drove; whether that counts
towards goal 1 is the owner's call. Five accepted moves sit on the window edge,
so a wider window or more passes would very likely find more; not run.

### Smoothness

`smoothness.mjs` moves one flip by every d in the window and drives to the
finish. "Lost" = not finished within 300 ms of the input's time.

Searched lap, 16 flips spread over the lap, d = -20..+20 (656 drives; this
run took 226 s, over the 2 minute limit, before the defaults were reduced):

| flip tick | lost / tried | best d | notes |
| --- | --- | --- | --- |
| 91, 5361, 7311, 7861, 9021 | 40 / 41 each | 0 | every move loses the lap |
| 2881 | 0 / 41 | any | no effect at all (identical laps) |
| 10251, 11711 | 39 / 41 | 0 | |
| 13311, 14251, 15601 | 35, 31, 26 / 41 | 0 | finishers spread over 70 to 154 ms |
| 17921, 18581, 19151, 20691 | 4, 0, 9, 0 / 41 | 0 | finishers spread over 11 to 61 ms |
| 21841 | 0 / 41 | any | no effect (66 ms before the finish) |

No sampled flip had a d that beat d = 0. 58.5% of all candidates lost the lap.

Finish tick minus the input's, by d, for three late flips of the searched lap
(the plot data; the rest is in `smoothness_desert4.json`):

```
d            -10  -9  -8  -7  -6  -5  -4  -3  -2  -1   0   1   2   3   4   5   6   7   8   9  10
18231 right   13  13  11  12  10  14  14   4  10  13   0   8   3   9  11  14  17  18  18  24  21
18581 right   11   7   9  14   4   4  12  10  12  11   0   0   0   0   0   0   0   0   0   0   0
20691 left     9   9   9  10  10  11  10  11  11  11   0   0   0   0   0   0   0   0   0   0   0
```

(18231 is from an earlier 4-flip probe run whose file was not kept.) The
picture: the input lap sits in a dip one tick wide, or on the edge of a flat
shelf, with a step of about 10 ms next to it. Median change between
neighbouring milliseconds over the late flips is about 1 ms, but the largest
is 10 to 12 ms on every one of them.

Best human lap, 10 flips, d = -10..+10 (211 drives, 130 s): the six sampled
flips before 12.2 s lose the lap on 19 or 20 of 20 moves; 13534 and 17103 lose
about half and have a best d of -2 (6.9 ms) and +1 (4.4 ms); 18578 loses none
and is the one flip measured that looks like a slope:

```
d            -10  -9  -8  -7  -6  -5  -4  -3  -2  -1   0   1   2   3   4   5   6   7   8   9  10
18578 right   20  13  14  14  13  14   1   1   1   0   0  -1  -1  -1  -2  -1  -2  -1  -4  -5  -6
```

Still with a 13 ms cliff at d = -5. What the 10 ms step is physically was not
investigated.

**Short horizon against the finish.** How far ahead of the unmoved lap the car
is 1 s after the flip IS smooth, close to a straight line in d, and tiny:
about 0.05 ms per ms of d on the searched lap's flip 18231, 0.15 on the human
lap's 18578. Its rank correlation with the real lap time was all over the
place from flip to flip (-0.72 to +0.91 at 300 ms, -0.72 to +0.98 at 1000 ms).
So the contract's warning holds here too: a short-horizon score would have
chosen moves whose real effect is a 10 ms loss or a lost lap. `refine.mjs`
only ever judges by the finish tick.

**What this decides.** (1) Enumerate, do not line-search. (2) One-flip moves
only work in about the last 4 to 8 s of a lap; earlier, the lap is replayed
open loop for so long that a 1 ms change grows into a crash. This is the same
ceiling `sim/sectional.mjs` describes, measured per flip. (3) The tail shift
is the move that paid on the human lap.

### Sub-tick lap time

`subTick()` in `fine.mjs` estimates the crossing time inside the finish tick
from how far past a plane the car is. In the data it disagreed with the tick
count by more than one tick in places (a lap finishing on tick 21908 scored
21906.4), so the finish is not detected on the plane it assumes. It is used
for the smoothness summary only; in `refine.mjs` it is an off-by-default
tie-break (`ties=1`), untested.

## Not done, not tested

- Only desert4. No other track, no `rollout_r1_*` lap.
- No complete pass and no second pass anywhere; `order=forward`, `ties=1`,
  windows other than 10, and `workers` above 2 were not run.
- Whole-lap refinement does not work as built, for the reason above. The
  missing piece is a repair after an early move: re-time the next few flips so
  the car rejoins the old path (the 1 s response to a flip's time is smooth, so
  that part could be solved rather than searched), or hand the rest of the lap
  to the policy as `search_rollout.mjs` does. Not written.
- Early stop for a candidate that has clearly crashed: every lost lap is
  driven to the best finish tick. That is most of the cost of an early flip.
- Whether the searched lap's 0 ms is specific to this lap. It was selected as
  the fastest of many, so sitting in a dip is expected; an unselected policy
  lap might behave more like the human one. Not tested.

## Changes needed elsewhere

None.

## Cost of a full run

Measured here, under training load: 0.11 s per candidate on the last 4 s
(2 processes, so about 9 candidates per second), 0.69 s of one process per
candidate driven a whole lap.

- **Recommended: the last 8 s on 8 processes.** Searched lap, about 35 flips x
  40 candidates = 1400 drives of 4 s on average: about 1 minute per pass if 8
  processes scale as 2 did (not measured), 3 passes about 3 minutes. Human lap
  (186 flips, about 70 in the last 8 s): about 2 minutes per pass. With
  `window=20`, double it.
- **A whole lap on 8 processes**: 81 flips x 40 = 3240 drives x 0.69 s / 8 =
  about 5 minutes per pass for a searched lap, 11 minutes for the human lap
  (7440 drives). By the smoothness numbers most of that is spent on flips where
  every move loses the lap, so it is not worth running before the repair step
  exists.
- Car tick budget: handled in `child.mjs` (a fresh car when 4.5 million ticks
  are used; the ladder of save states is rebuilt).

## Later result: the 21.720 s lap from a model (18 October 2026, added by the main session)

Run on the desert4 lap the g1-1 search made from the IQN learner's lap
(`runs/g1-1-iqnseed2_desert4.recording.json`, 21.720 s, 30 ms under the
human):

```
node ideas/g1-5-fine-key-timing/refine.mjs runs/g1-1-iqnseed2_desert4.recording.json from=13000 window=10 workers=8 seconds=900 name=g1-5-iqnseed log=runs/g1-5-iqnseed_desert4.log.json
```

The last 8.7 s of the lap (from tick 13000), window +-10 ticks, nudge and
tail shift, 8 processes: **5090 drives, 0 changes**, 21.720 s in and out
(Verify passes on tick 21720). It stopped after one pass, in 119 s of the 900
allowed, because nothing changed. As on the searched 21.907 s lap above, a
lap the g1-1 search has already been over has no one-flip gains left in this
window. Log: `runs/g1-5-iqnseed_desert4.log`.
