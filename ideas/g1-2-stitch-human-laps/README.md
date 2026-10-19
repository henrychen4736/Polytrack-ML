# g1-2: stitch a lap from the fastest sections of several human laps

`data/laps/<track>.json` holds ten leaderboard laps per track, and different
players are fastest in different parts. Where two laps pass through nearly the
same car state, a lap can switch from one player's keys to the other's; this
folder measures where that is possible, plans which lap to follow in each
section, and drives the plan with a repair step that pulls the car back onto
the new player's path after each switch.

**Result so far:** one verified lap faster than the best human lap we have:
desert4 **21.730 s** against 21.750 s (20 ms), `runs/g1-2-stitch_desert4.json`.
Nothing faster on summer4, summer1 or winter2. The idea works, but the gain
available is small and the repair itself costs time; details below.

## How to run

From the project root, one simulator, no GPU:

```
node ideas/g1-2-stitch-human-laps/stitch_laps.mjs desert4 joins=4
```

That is the smoke test (39 s with training running): section table, theoretical
best of sections, the plan, a survival test of 4 joins, the stitch, and Verify.
All options are listed at the top of `stitch_laps.mjs`. The useful ones:

| Option | Meaning |
| --- | --- |
| `joins=12` | how many random switches to test for survival (0 = skip) |
| `finish=1` | follow tested joins to the finish: 0 none, 1 raw and resync, 2 repair too (slow) |
| `stitch=0` | only the tables and the survival test |
| `table=1` | every section's time for every lap |
| `risk=0.3 switchPenalty=10 maxMismatch=60` | how readily the planner proposes a switch |
| `check=2000 margin=2 acceptCost=40 attempts=8` | how a proposed switch is judged |
| `start=0` | begin on the fastest lap rather than the plan's choice |
| `judge=finish` | judge each switch by driving both cars to the finish line (off by default: `judge=check`) |
| `fallback=4` | when the car is lost, undo the last kept switch and carry on, up to 4 times (off by default: 0) |

All 17 tracks, each lap checked again from its file, one table at the end
(restartable; skips tracks already done):

```
sh ideas/g1-2-stitch-human-laps/g1-2-run_all.sh
```

Files:

- `paths.mjs` (no simulator after the recording): `recordPath`, `crossings`,
  `sectionTimes`, `mismatch`, `locate`, `planRoute`.
- `follow.mjs`: `follow(sim, donor, donorTick, until, mode)` with the three
  modes `raw`, `resync`, `repair`.
- `stitch_laps.mjs`: the script.
- `g1-2-run_all.sh`: the script on every track (default `judge=finish
  fallback=4`, 4 tracks at once), each saved lap checked again with
  `ideas/shared/verify_lap.mjs`; logs and one result line per track in `out/`.
- `scratch/tune.mjs`, `scratch/trace.mjs`: the two throwaway scripts behind the
  tuning numbers below (one join under several settings; a per-window trace of
  one follow). Not needed to run anything.

## How it works

1. **Sections.** Boundaries are planes across the road, one per 250 ms of the
   fastest lap. Each lap's crossing tick of each boundary gives comparable
   section times. A lap that passes a boundary more than 8 units from the
   fastest lap's line (another line or route) has no crossing there and cannot
   be joined or left there; its time is still counted in full.
2. **Plan.** Dynamic programming over (boundary, lap): section times plus a
   cost per switch of `switchPenalty + risk x mismatch`, where mismatch is the
   difference between the two laps' states at that boundary (position,
   velocity, orientation, spin, steering angle, wheels on the road) in
   millisecond-equivalents.
3. **Join and repair.** Work is on per-tick keys, so no key-parity fix is
   needed at a join. After a switch the donor's keys are followed in 200 ms
   windows: for each window up to 27 small corrections are tried from a save
   state (the keys 1 to 16 ms earlier or later, a steering tap of 8 to 64 ms
   either way or none, a short lift or press of the throttle), each driven
   400 ms and scored by the car's mismatch against the donor's recorded state
   there, less 2 ms per ms gained. The best is kept for 200 ms.
4. **Judging a switch.** Two cars leave the same save state, one switching and
   one not. Both are driven (with repair) to the same boundary 2 s on. The
   switch is kept only if its car gets there at least 2 ms sooner and is no
   further from its donor than `acceptCost`. Then the rest is planned again.
5. **Verify.** The finished lap goes through `ideas/shared/verify.mjs`.

## What was measured

All with training running on the machine, one simulator, each run under 2
minutes.

### Section times and the theoretical best

| Track | Best human | Best of sections (free switches) | Default plan |
| --- | --- | --- | --- |
| desert4 | 21.750 | 21.680 (-70 ms) | 21.734 (-16 ms), 1 switch |
| winter2 | 26.830 | 26.778 (-52 ms) | 26.830, no switch |
| summer1 | 22.131 | 21.438 (-693 ms) | 22.027 (-104 ms), 4 switches |
| summer4 | 34.105 | 33.505 (-600 ms) | 33.637 (-468 ms), 10 switches |

"Best of sections" assumes a switch is free wherever two laps cross the same
boundary, however different their speed and line. It is an upper bound and not
a close one: on summer1 and summer4 most of it comes from laps that are quick
in a section because of the speed or line they entered with. On summer1 only
laps 0, 1, 2 and 5 share a line; the other six are more than 8 units away for
67 of 88 boundaries. On summer4 three laps leave the common line for the last
third.

### How often a join survives

Random switches (lap i to lap j at a random boundary, mismatch not limited).
"On path" = 3 s after the join the car is within 1.5 units of the donor's path.

| Track | Way of following | On path after 3 s | Finishes the lap |
| --- | --- | --- | --- |
| desert4 | raw (donor's keys, one time shift) | 4 of 20 | 0 of 20 |
| desert4 | resync (time shift re-measured every 200 ms) | 3 of 20 | 0 of 20 |
| desert4 | repair | 20 of 20 | 6 of 6 tested |
| summer4 | raw | 1 of 12 | 0 of 12 |
| summer4 | resync | 2 of 12 | 1 of 12 (89 ms slower than the two halves) |
| summer4 | repair | 7 of 12 | not tested |

(desert4: two runs, `joins=14 finish=1` and `joins=6 finish=2 seed=3`;
summer4: `joins=12 seed=2`.)

So a raw switch between human laps essentially never survives to the finish,
and the repair step is what makes the idea possible at all. On desert4 the six
repaired joins followed to the finish ended -26, 0, +3, +8, +14 and +39 ms
against "first player's time to the join plus second player's time from it"
(median +8 ms).

### The cost of repair

- Just after a join it is nearly free: on desert4 two joins were within 1 ms
  of the donor's clock after 3 s (one 1 ms behind, one 1 ms ahead).
- Following a donor for a long time costs time. The same two joins followed to
  the finish (10 and 18 s) lost 7 and 39 ms. A correction can lose a little
  speed, and with the throttle already down the donor's keys never win it
  back, so the car falls steadily behind.
- On summer4 it is worse: the track has jumps, the car cannot be corrected in
  the air, and it lands 1 to 4 units off the donor's line. One follow of lap 5
  from boundary 18 was 150 ms behind after 15 s and lost the path after 19 s.
- Weight of time in the repair score (`timeWeight`), two desert4 joins to the
  finish: 0 lost 17 and 95 ms, 0.5 lost 15 and 48, 2 (the default) lost 7 and
  39; searching every window even when the car is already close (`good=-1000`,
  three times the cost) lost -3 and 19.

### Stitched laps

| Track | Settings | Outcome |
| --- | --- | --- |
| desert4 | defaults | lap 1, then lap 7 from boundary 68 (17.0 s): **21.730 s, Verify PASS**, 20 ms faster than the best human. Also passes `node scripts/export_recording.mjs desert4 g1-2-stitch` (finishes on tick 21730, 21729 rejected) |
| desert4 | `risk=0.1 switchPenalty=3` | 3 switches kept, each ahead after 2 s, lap 21.794 s (44 ms slower): the later repair cost more than the switches won |
| winter2 | defaults | no switch planned; lap 0 unchanged |
| winter2 | `risk=0.1 switchPenalty=3` | 1 switch kept, 26.892 s (62 ms slower) |
| summer1 | defaults | 3 switches tried, all refused; lap 1 unchanged (22.159 s) |
| summer1 | `start=0 check=3000 risk=0.1 switchPenalty=3` | 4 tried, 3 lost the path, 1 was 2 ms slower; lap 0 unchanged |
| summer4 | defaults | 3 switches kept, 4 refused, then the car lost the path after boundary 116: no lap |

The desert4 lap that works has a single switch 4.7 s before the finish, so
little repaired driving follows it. That is the pattern in all the runs: a
switch pays when what it gains is larger than what the repair loses over the
rest of the lap, and on these four tracks the gains on offer between laps that
share a line are 5 to 20 ms each.

### Judging by finish time, and falling back (17 October 2026)

Two options, both off by default (the default run still writes the 21.730 s
lap key for key; checked):

- `judge=finish`: at each planned switch both cars (stay, switch) are driven
  with repair to the finish line, and the switch is kept only if its lap ends
  `margin` ms sooner. The run then carries on from the chosen car's state
  `check` ms after the switch, so later switches are still tried (unlike
  `check=99999`, which stopped after the first). The fastest lap any judged
  car finished is kept too and is the result if the stitch that carries on
  ends slower or lost. This is the forward, greedy version of the finish-time
  test; the backwards version (decide the last switch first) is not built.
- `fallback=N`: when the car loses the path, go back to the state just before
  the last kept switch, forbid that switch there and for `check` ms of
  boundaries after it, plan again from there, and carry on; at most N times.
  An undone switch does not use up one of `attempts`. Save points that die
  when the car is renewed (tick budget) are restored by driving their keys
  again, which gives the identical state.

Measured, one simulator each, three at a time, with an IQN trainer on the GPU:

| Track, settings | `judge=check` (the rule before) | new option | Time |
| --- | --- | --- | --- |
| desert4, defaults | 21.730 s | `judge=finish`: the same switch kept (stay 21.758, switch 21.730 to the finish), 21.730 s | 9 s |
| desert4, `risk=0.1 switchPenalty=3` | 3 kept, 2 refused: 21.794 s (+44 ms on the human) | `judge=finish`: the first switch refused (2 s ahead, but 21.843 against 21.758 at the finish), one kept: 21.754 s (+4 ms) | 62 s |
| summer4, defaults | 3 kept, then lost after boundary 116: NO LAP | `fallback=6`: one switch undone, then a different one kept: **34.374 s, Verify PASS** (+269 ms on the human). With `fallback=3` and a one-boundary ban: still NO LAP (the same switch was planned again 250 ms later) | 55 s |
| summer4, defaults | as above | `judge=finish fallback=6`: all 8 switches refused, every switching car lost before the finish; lap 7 unchanged, 34.270 s | 100 s |

So judging by finish time does what it should (it refused the switch that
was ahead after 2 s and cost 85 ms by the line), and fallback turns summer4's
"no lap" into a lap. Neither has produced a lap faster than the 21.730 s
already found. On summer4 no switch survives repair to the finish at all.

`g1-2-run_all.sh` smoke (desert4 and summer4, two at a time, 96 s):

```
track       human s stitched s    gain  what happened
desert4      21.750     21.730      20  switched, Verify PASS on tick 21730
summer4      34.105     34.270    -165  no switch kept: a human lap, Verify PASS
```

The lap begun on is the plan's choice, so the gain can be negative (summer4
keeps lap 7). `start=0` in `STITCH_OPTS` makes the gain never negative, but on
desert4 the plan from lap 0 has no switch at all and loses the 21.730 s lap
(measured), so it is not the default.

## Not done, not tested

- Only desert4 gave a faster lap. summer4 gives no stitched lap faster than
  its own human laps (34.374 s with `fallback=6`).
- **The run over all 17 tracks** (`g1-2-run_all.sh`) has been run on desert4
  and summer4 only; about 10 minutes expected for all 17 with 4 at a time.
- The backwards, finish-time version (decide the last switch first, then the
  one before it against that result) is not built; `judge=finish` is the
  forward version.
- The repair corrections are one fixed set and one round per window. Not
  tried: two corrections in one window, corrections placed before a jump
  rather than after it, a longer look-ahead over jumps.
- The mismatch weights for spin, steering and wheels are guesses.
- Survival with repair to the finish was measured on 6 desert4 joins only.
- The stitched lap as a reference for a specialist (`refFile`) was not tried.

## Changes needed elsewhere

None required. One thing found in shared code (also in `REQUESTS.md`):
`SimSession.load()` only shortens `sim.keys`, so loading a point after a
different branch was driven leaves the wrong keys in `sim.keys`;
`stitch_laps.mjs` works around it with `snapshot` / `restore`.

## What a full run would cost

- Tables and plan for one track: 10 s. All 17 tracks: 3 minutes.
- Stitch with defaults: 15 to 80 s per track, one process.
- A survival test worth quoting (100 joins, repair to the finish,
  `joins=100 finish=2`): about 25 minutes per track on one process at the
  speed measured here (13 000 ticks/s under load; about a third of that time
  on an idle machine). It could be split over processes by seed.
- The backwards, finish-time version sketched above: each candidate switch
  costs one repaired drive to the finish (5 to 40 s); 50 candidates per track
  on 8 processes is about 5 minutes per track.
