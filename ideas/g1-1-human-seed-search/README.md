# g1-1: search from the human's lap

> **Status (18 October 2026).** Superseded numbers below: the smoke-test
> table is the first result only. Whole-lap runs since then reached 21.709,
> 26.775, 22.104 and 34.069 s from the human's laps, and the same search
> seeded with the IQN learner's own lap reached **21.720 s on desert4**, 30 ms
> under the human. See "Later results" at the end. "Starting from a model's
> lap" under "Not done" has now been done.

**Result: all four target tracks now have a verified lap faster than the best
human lap we hold**, each from one 100-second run on 2 simulator processes.

| Track | Best human (`data/laps` lap 0) | This search | Gain | File |
| --- | --- | --- | --- | --- |
| desert4 | 21.750 s | **21.722 s** | 28 ms | `runs/g1-1-smoke_desert4.recording.json` |
| winter2 | 26.830 s | **26.816 s** | 14 ms | `runs/g1-1-smoke_winter2.recording.json` |
| summer4 | 34.105 s | **34.100 s** | 5 ms | `runs/g1-1-smoke_summer4.recording.json` |
| summer1 | 22.131 s | **22.127 s** | 4 ms | `runs/g1-1-smoke_summer1.recording.json` |

Each passed the game's Verify twice: in `ideas/shared/verify.mjs` at the end
of the search, and again with `node scripts/export_recording.mjs <track>
g1-1-smoke` (finishes on the stated tick; one tick fewer is rejected). The
gains are small. Only the last 7 s of each lap was searched; the rest of each
lap is still the human's keys, untouched.

## The idea

Start from the human's exact key timeline (1 ms resolution, never converted
to 50 ms block decisions) and change one key timing at a time inside a short
section, using a save state at the section's start. Keep a change only if the
lap, driven to the finish, is faster.

What makes this work on a human lap, where the earlier searches gained almost
nothing, is the measure of "faster". One change to a human lap gains a
fraction of a millisecond, which a finish time in whole ticks cannot see. So
the car's position 30 ms before the finish is compared with the best lap's
position at the same moment, which gives the lap time to a fraction of a
tick. Laps that finish on the same tick but are ahead by that measure are
kept, and the fractions add up to whole milliseconds.

## What happens to the rest of the lap (the open problem)

The task asked what to do with the later keys after a change. The answer the
measurements gave was not the one expected:

- **Leaving the later keys unchanged works**, as long as each step is small.
  Every gain in the table came this way (123 kept steps across the four runs).
  The later keys end up a few ms "late" over a whole run and the lap still
  finishes, because they get re-timed by the changes made in their own
  sections.
- **Shifting the later keys earlier and repairing the next stretch is built
  and runs, and produced nothing on human laps.** At the default settings it
  never triggered in any run: no candidate was a whole millisecond ahead and
  close to the old path at the end of its section. Forced with `minScore=-15`
  (two runs, 70 s in total): 5 shifted laps, 183 repair tries, 8 repaired
  laps driven on, 0 kept. That is a small sample, so it shows the repair is
  not needed here, not that it cannot work. It is the case that matters when
  starting from a slower lap, which was not tested.
- **How well the car rejoins the old path does not predict the result.** With
  only well-matched candidates driven on (`followScore=-2`), a mid-lap
  section gained nothing. With nearly all driven on, the same section gained
  13 ms in 45 s, and the two largest steps (8.4 and 3.4 ms) came from
  candidates the stricter limit would have thrown away. The default is now
  -30, which only drops cars that are far off the old line.
- **Working from the last section backwards** is used because candidates
  there are cheap: on desert4, 11 s on 2 processes tries about 430 candidates
  in the last section and about 100 in a section 6 s before the finish.

## How to run

From the project root:

```
node ideas/g1-1-human-seed-search/search_human.mjs desert4 seconds=100 last=7000 out=smoke
```

That is the smoke test: 2 processes, 100 s of search, the sections starting
in the last 7 s of the lap. It prints one line per section and ends with
`PASS Verify` and the files written (`runs/g1-1-<out>_<track>.json` and
`.recording.json`). Same command with `summer1`, `summer4` or `winter2`.

Options (full list at the top of `search_human.mjs`): `seed=human:0` (or a
path, to continue from a saved lap), `workers=2`, `section=1500`, `step=750`,
`order=back`, `from=` / `to=` / `last=` to choose sections, `passes=1`,
`rngSeed=1`, and any setting in `SEARCH_DEFAULTS` of `section_worker.mjs`.

To continue a run over the whole lap:

```
node ideas/g1-1-human-seed-search/search_human.mjs desert4 seed=runs/g1-1-smoke_desert4.recording.json seconds=1200 workers=8 out=full
```

Files: `search_human.mjs` (which section, for how long, the final check),
`section_worker.mjs` (one simulator; the whole search loop for a section).
`out/` holds the unverified lap written on every improvement, in case a long
run is stopped early.

## What was tested, with numbers

Machine under load from training: 14 000 to 16 000 ticks per second per
simulator process (the contract's 34 000 was not available), and each call to
the simulator costs about 2 ms on top of its ticks.

Smoke tests, 100 s, 2 processes, 9 sections (the last 7 s of the lap):

| Track | Changes tried | Driven to the finish | Steps kept | Result |
| --- | --- | --- | --- | --- |
| desert4 | 1629 | 1326 | 41 | 21.750 → 21.722 s |
| winter2 | 1749 | 1586 | 21 | 26.830 → 26.816 s |
| summer4 | 1770 | 1509 | 33 | 34.105 → 34.100 s |
| summer1 | 1652 | 1328 | 28 | 22.131 → 22.127 s |

The gain is uneven. On desert4, 18 of the 28 ms came from one section
(18.75 s into the lap) and five of the nine sections gave nothing. On summer1
only the last two sections gave anything.

Other desert4 runs, same code or close to it: two sections at 16.5 to 17.25 s
for 40 s reached 21.717 s (33 ms); the same with `minScore=-15` reached
21.726 s and 21.728 s. So results vary by several ms with the sections and
seed chosen.

Things to know about the numbers:

- The first 2 to 3 ms on desert4 and summer1 come from the last 1.5 s and are
  partly not driving faster: by the position measure the car is only 0.4 ms
  ahead there, yet the clock drops 3 ticks. The likely cause is that the
  finish is triggered by more than the car's centre, so how the car is angled
  at the line matters. It is real lap time by the game's own check, but it is
  a one-off, not something more search will keep finding.
- The sub-tick measure is a guide, not the clock. Summed over a run it
  disagrees with the clock by up to a third (desert4: 32.6 ms measured, 28 ms
  on the clock). A step must also finish no later than the best lap, and the
  final time is always the game's.
- The winter2, summer4 and summer1 laps were produced before a small fix to
  how two processes' results are compared (a step that gained a tick on the
  clock but not by the position measure could be dropped). The desert4 run
  was repeated after the fix and gave the same 21.722 s.

## Not done, not tested

- **The first two thirds of each lap were never searched.** No full-lap run
  was made (rule 3). This is the main thing left.
- More than one pass, more than 2 processes, section lengths other than
  1500 ms, and `order=front` were not tried.
- Starting from anything but lap 0 of `data/laps`, including a model's lap,
  where the shift-and-repair step should matter.
- The repair step's settings (stretch length, 24 tries, match weights) were
  never tuned, since it never had a success to tune against.
- Only one random seed per track for the table above.
- Changes are single key-timing moves, deleted taps and added taps of up to
  40 ms. Nothing proposes a different line on purpose (earlier braking point,
  wider entry); the search finds such things only by accident.

## What a longer run would probably do

Per section searched for 11 s on 2 processes, the four runs gained 0 to 18 ms,
on average about 1.4 ms (51 ms over 36 sections). A whole lap is 29 to 45
sections. If the earlier sections behave like the last nine, one pass over a
whole lap with the same number of candidates per section would gain roughly
40 to 60 ms. Each candidate costs about 3 times as much on average as in the
smoke test, because early sections have a long drive to the finish. That is an extrapolation from
late sections only: early sections may do worse, because a change there has
20 s of unchanged later keys to survive instead of 5. The mid-lap sections
tested (15 to 19 s on desert4) did at least as well as the last ones, which is
the only evidence either way.

Cost of a full run, for the same number of candidates per section as the
smoke test: about 30 process-minutes for a 22 s lap and 60 for a 34 s lap,
so about 4 and 8 minutes on 8 processes if each runs as fast as the two did
here (not checked; the machine was already busy). `seconds=1200 workers=8`
would be several times the smoke test's effort per section. Memory is about
30 MB per process.

Against the other searches: `search_rollout.mjs` gains 100 to 370 ms in ten
minutes, but from a model lap 0.2 to 0.9 s behind the human, and has not
reached the human's time. This search gains far less per minute and starts
ahead of all of them.

## Changes needed elsewhere

None. Suggestions only:

- `sim/sectional.mjs` and `scripts/search_sections.mjs` could take the
  sub-tick measure (`rejoin()` in `section_worker.mjs` returns `lead`, the
  gain with its fraction, and the distance from the path's line instead of
  from its nearest tick). The nearest-tick distance alone adds up to 0.6 ms
  of penalty to a car exactly on the old line.
- `data/laps` lap 0 is what every row above is compared with; on summer1 that
  is 22.131 s, not the 22.279 s fixture.

## Later results (added by the main session)

All laps below pass the game's Verify on their tick and fail one tick sooner.

**Whole-lap runs from the human's lap (10 October 2026).** Two 20-minute
whole-lap runs per track, 8 processes (`seconds=1200 workers=8`), the first
seeded with the smoke-test lap (`out=full`) and the second with the first's
lap (`out=full2`). Files `runs/g1-1-full2_<track>.recording.json`.

| Track | Best human | Smoke test | Run 1 | Run 2 | Under the human by |
| --- | --- | --- | --- | --- | --- |
| desert4 | 21.750 s | 21.722 s | 21.710 s | 21.709 s | 41 ms |
| winter2 | 26.830 s | 26.816 s | 26.793 s | 26.775 s | 55 ms |
| summer1 | 22.131 s | 22.127 s | 22.107 s | 22.104 s | 27 ms |
| summer4 | 34.105 s | 34.100 s | 34.087 s | 34.069 s | 36 ms |

On 17 October all four `full2` laps were re-verified on the current code and
still pass at 21.709, 22.104, 34.069 and 26.775 s.

**Seeded with a model's lap (17 to 18 October 2026).** The same search,
started from a lap the IQN learner (`ideas/g1-6-offpolicy-rl/`) drove by
itself, two 20-minute runs of one pass each on 8 processes, the second seeded
with the first's lap:

```
node ideas/g1-1-human-seed-search/search_human.mjs desert4 seed=runs/g1-6-iqn-s3best_desert4.recording.json seconds=1200 workers=8 out=iqnseed
node ideas/g1-1-human-seed-search/search_human.mjs desert4 seed=runs/g1-1-iqnseed_desert4.recording.json seconds=1200 workers=8 out=iqnseed2
```

| Track | Model lap (seed) | Run 1 | Run 2 | Best human | Files |
| --- | --- | --- | --- | --- | --- |
| desert4 | 21.792 s (IQN) | 21.733 s | **21.720 s** | 21.750 s | `runs/g1-1-iqnseed_desert4`, `runs/g1-1-iqnseed2_desert4` |
| winter2 | 26.997 s (IQN) | 26.937 s | 26.927 s | 26.830 s | `runs/g1-1-iqnseed_winter2`, `runs/g1-1-iqnseed2_winter2` |
| desert4 | 21.846 s (IQN, route inputs, no human lap) | 21.801 s | 21.800 s | 21.750 s | `runs/g1-1-routeseed_desert4`, `runs/g1-1-routeseed2_desert4` |

So the search gains 46 to 72 ms from a model's lap, against 41 to 55 ms from
a human lap, and on desert4 the result is 30 ms under the human: the first
better-than-human lap here whose driving came from a model. It is still 11 ms
slower than the search from the human's own lap (21.709 s). The shift-and-
repair step was not examined separately in these runs. g1-5's fine timing
then found no change on the 21.720 s lap (see `ideas/g1-5-fine-key-timing/`).
