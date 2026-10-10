# g1-7: a computed racing line

Fit a model of the car by experiment, measure the road's width around a lap,
compute the line and speeds the model says are fastest, and compare with the
human. Everything so far follows a human's line; this asks whether arithmetic
can do better.

**Verdict: no, not on desert4, and the reason is clear.** The car model is
good (it reproduces the human's flat-road driving to 0.02 s in 15 s), and it
says the human's line is already within 0.13 s of the best line the model can
find, which is less than the model's own error (0.17 s). Driven in the
simulator by the same simple tracker, the computed line and the human's line
come out level (22.083 s and 22.133 s), both a third of a second behind the
human's 21.750 s. The time that is left on desert4 is not in the line: the
human holds W for 100% of the lap and corners at exactly the car's turning
limit. It is in the jumps, the loop and the banked climb, which a
line-and-speed model does not describe. The fitted car model and the test pad
are the parts worth keeping.

## What is here

| File | What it does | Simulator |
| --- | --- | --- |
| `testpad.mjs` | `buildPad({ wide, long })`: a track of flat plates to measure the car on | none |
| `fit_car.mjs` | the experiments; writes `car_model.json` | 1, about 20 s |
| `car_model.mjs` | `loadCarModel()`: `accel`, `brake`, `coast`, `kappaMax`, `speedFor` | none |
| `corridor.mjs` | `buildCorridor(track, lap)`: road width left and right of a lap's path, and which points are flat / air / near a jump / banked | 1, about 1 s |
| `raceline.mjs` | `optimiseLine` (minimum curvature), `optimiseTime` (search on predicted lap time), `speedProfile` (forward-backward pass) | none |
| `check_turn_limit.mjs` | does the pad's turning limit hold on real tracks? | 1 at a time, 2 s per track |
| `compare_human.mjs` | corridor, calibration against the human, the lines, where they differ; writes `out/line_<track>.json` | 1, about 1 s, then 25 s of arithmetic |
| `drive_line.mjs` | drives the lines in the simulator with `sim/controller.mjs`, verifies and saves finished laps | 1 |

## How to run (from the project root)

```
node ideas/g1-7-computed-racing-line/fit_car.mjs                          # 20 s; writes car_model.json
node ideas/g1-7-computed-racing-line/check_turn_limit.mjs desert4 summer1 summer4 winter2 desert1   # 12 s
node ideas/g1-7-computed-racing-line/compare_human.mjs desert4            # 25 s; writes out/line_desert4.json
node ideas/g1-7-computed-racing-line/drive_line.mjs desert4 computed crossTrackGain=2 lookaheadPerKmh=0.06   # one lap, 8 s: 22.083 s, verified
node ideas/g1-7-computed-racing-line/drive_line.mjs desert4 all           # one lap per line at the default settings (only "model" finishes at those)
node ideas/g1-7-computed-racing-line/drive_line.mjs desert4 all sweep=1   # 9 driver settings per line, 2 min 6 s
node ideas/g1-7-computed-racing-line/drive_line.mjs desert4 computed sweep=1   # one line only, about 40 s
```

Every command uses one simulator process. All were run; the numbers below are
from those runs.

## 1. The fitted car (flat pad, `car_model.json`)

Units are world units (about metres) and seconds; 1 unit/s = 3.6 km/h.
"Lateral" is speed squared over radius.

| km/h | W accel | coast | S brake | W+A radius | lateral | W+A accel | slip deg | wheel angle rad | S+A radius | S+A accel |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 19.7 | -0.3 | -61 | | | | | | | |
| 50 | 18.6 | -1.4 | -67 | 11 | 18 | 17.8 | 10.3 | 0.366 | 6 | -18 |
| 100 | 17.1 | -2.9 | -74 | 25 | 31 | 14.8 | 3.4 | 0.123 | 21 | -16 |
| 150 | 15.6 | -4.4 | -80 | 44 | 40 | 12.3 | 1.7 | 0.066 | 42 | -19 |
| 200 | 14.2 | -5.9 | -87 | 67 | 46 | 10.7 | 1.1 | 0.043 | 66 | -21 |
| 250 | 12.7 | -7.3 | -94 | 96 | 50 | 9.4 | 0.70 | 0.030 | 95 | -24 |
| 300 | 11.3 | -8.8 | -100 | 125 | 56 | 8.4 | 0.50 | 0.023 | 125 | -39 |
| 350 | 9.8 | -10.3 | -109 | 159 | 60 | 7.5 | 0.37 | 0.018 | 152 | -41 |
| 400 | 8.3 | -11.8 | -112 | 200 | 62 | 6.8 | 0.29 | 0.014 | 179 | -42 |
| 450 | 6.8 | -13.2 | -113 | 238 | 66 | 6.2 | 0.23 | 0.012 | 204 | -41 |
| 500 | 5.3 | -14.7 | -115 | 286 | 68 | 5.2 | 0.18 | 0.010 | | |
| 550 | 3.8 | -16.2 | -116 | 323 | 72 | 3.9 | 0.14 | 0.009 | | |
| 600 | 2.3 | -17.3 | -117 | | | | | | | |

The full table (every 25 km/h, plus A with no pedal) is in `car_model.json`.

What it says, in plain terms:

- **Straight line.** W gives a thrust of about 20 units/s² that does not
  depend on speed, against a drag proportional to speed (0.029 units/s² per
  km/h). Top speed: 668.9 km/h after 45 s and still creeping; the two numbers
  cross at about 683. From rest: about 100 km/h in 1.5 s, 300 in 5.6 s, 500 in
  12.6 s.
- **Brakes** are strong: 6 g at rest rising to 12 g above 400 km/h (600 km/h to
  a stop in 1.78 s). With a steering key down they are far weaker: -41
  units/s² at 300 km/h and above, -16 to -24 below. Brake in a straight line.
- **Turning is limited by the steering, not by grip.** Holding a steering key
  never makes the car slide: the slip angle is under 1 degree above 200 km/h.
  What changes with speed is how far the key turns the wheels (0.41 rad
  standing, 0.023 at 300 km/h, 0.010 at 500). The radius that results is about
  0.42 units per km/h up to 300 km/h and 0.5 to 0.6 above. So "the grip limit"
  for this car is a curve of tightest radius against speed, and a corner of
  radius R has one top speed: 125 units, 300 km/h; 200 units, 400 km/h.
- The wheels reach their limit 100 ms after the key goes down, at every speed.
- **Turning costs little.** At full lock with W the car still gains speed:
  75% of its straight-line acceleration at 300 km/h, nearly all of it above
  450. A straighter line is therefore worth less here than in a normal car.
- Off the road plates the world has a ground plane at y = 0 that the car
  drives on, slightly slower (314 against 320 km/h after 6 s of W).

**Checked against real laps** (`check_turn_limit.mjs`): wherever the fastest
human held W and one steering key steadily on flat road, the curvature of
their path divided by the pad's limit at that speed has a median of 1.00
(0.98 to 1.02 across speed bands) on desert4, summer1, summer4, winter2 and
desert1, with a 90th percentile of at most 1.04. The pad number is the track
number.

Not measured: sliding started by anything other than a steering key (brake
taps, landings), air control, the car on banked road, reverse. "Gravity" from
the fall of the human's car in flight came out at 14.3 (desert4), 17.3
(summer1) and 25.2 (winter2) units/s², so something besides gravity pushes
the car down in the air, or the keys held in flight matter; I did not
separate them.

## 2. The corridor

`buildCorridor(track, lap)` takes the ORDER of the road and the centre from a
lap that finishes, one point per unit, and measures the WIDTH from the track's
collision triangles (sideways rays for walls, downward probes for open
edges), square to the path. It is not a corridor from the track alone: over
jumps and stacked levels, working out which piece follows which without a lap
is a route-finding problem this does not attempt. Any finishing lap will do
as the seed (a policy's lap on a community track, for instance).

Each point is labelled, and the line may only be moved at "free" points:

| Track | free (flat road) | in the air | within 15 units of a jump | banked or loop | median width where free |
| --- | --- | --- | --- | --- | --- |
| desert4 | 69% | 5% | 6% | 20% | 31.2 units |
| summer1 | 57% | 17% | 8% | 18% | 24.4 |
| winter2 | 48% | 23% | 6% | 23% | 30.8 |

Everywhere else the line is the lap's own path and the speed keeps its ratio
to the lap's speed. The margin kept from the road edge is 1.7 units (half the
car's 1.5-unit-wide collision shape, plus room for the tracker).

## 3. The line and the speed profile

Two ways of choosing the line, one speed profile (limit from
`car.speedFor(curvature)`, forward pass with W, backward pass with S, gravity
along the slope).

**Minimum curvature is the wrong objective for this car.** On desert4 it is
predicted 0.92 s *slower* than the human's line (22.841 s against 21.919 s).
The human takes the long corners at a constant radius, exactly the one the
steering gives at that speed (240 units at 450 km/h). The minimum-curvature
line has less bend in total, but gets it by running straighter early and
turning tighter late (176 units), which this car can only do at 372 km/h.
Adding a path-length term makes it worse. (Its solver is also not fully
converged: ten times the sweeps moves the prediction by 0.04 s.)

**Search on the predicted lap time** (`optimiseTime`): start from the human's
line, push it sideways with smooth bumps, keep a push if the predicted lap
gets shorter. About 6000 tries, 17 s.

## 4. Against the human lap (desert4, 21.750 s)

Calibration first: the model driven along the human's own path, each flat
stretch entered at the human's speed.

| Stretch (points) | human | model | W held | steering held |
| --- | --- | --- | --- | --- |
| 0..56 | 2.488 s | 2.486 s | 100% | 9% |
| 147..492 | 4.829 | 4.903 | 100% | 42% |
| 706..1162 | 4.240 | 4.227 | 100% | 52% |
| 1407..1843 | 3.510 | 3.468 | 100% | 70% |
| total | 15.067 | 15.084 | | |

Whole lap on paper:

| | predicted | real |
| --- | --- | --- |
| human's line | 21.919 s | 21.750 s |
| minimum-curvature line | 22.841 s | |
| time-search line | 21.792 s | |

The time-search line is 0.127 s faster than the human's line *by the model's
own account*, and the model is 0.169 s off on the human's line, so the
difference is inside the error. The line itself barely moves: at most 2.2
units sideways, 1.0 unit shorter (1984.3 against 1985.3). Speeds are the
same shape: flat out everywhere, a few km/h higher at the end.

In the simulator, each line driven by `sim/controller.mjs` (pure pursuit) at
nine settings, fastest finishing lap, all three verified with the game's
Verify and saved under `runs/g1-7-*_desert4.json`:

| Line and speed targets | finished | fastest | against the human |
| --- | --- | --- | --- |
| human's path, human's speeds | 1 of 9 | 22.441 s | +0.691 s |
| human's path, model's speeds | 5 of 9 | 22.133 s | +0.383 s |
| computed path, model's speeds | 3 of 9 | 22.083 s | +0.333 s |

Read this as "level". The spread between driver settings on one line (22.13
to 22.67 s) is ten times the gap between the lines, and which settings finish
changed between two runs whose speed targets differed by a few ms of
predicted time. Nearly every failure is at the same place: the landing of the
second jump (point 1400 to 1440), taken at 450 km/h off a banked climb. For
reference, the project's best searched lap on desert4 is 21.907 s, so the
tracker's laps are 0.18 s behind that too.

Other tracks, on paper only (not driven):

- winter2: model on the human's line 26.723 s against 26.830 s real; the time
  search gains 0.033 s. Same picture as desert4.
- summer1: the model does **not** explain the human. On points 678..863 the
  human turns 18% tighter than the pad's limit for 2.9 s (steering held 100%,
  W 96%), the model has to slow down for it, and the whole-lap prediction is
  24.5 s against 22.131 s real. Something there is outside the model (a
  slide, a lift, or road tilted under the 15-degree cut-off); I did not find
  out which. Do not trust the line computed for summer1.

## Why the idea does not pay here

1. The human is already on the limits the model knows about: W held all lap,
   steering at the car's limit through the long corners.
2. Turning costs little speed and the road is wide, so moving the line a unit
   or two changes almost nothing.
3. What the model cannot see is where the time is: 31% of desert4 is flight,
   jump approach, loop or banked climb, and the profile just copies the human
   there. It cannot say whether a jump still works at another speed.
4. A line is not a lap. Turning it into keys needs a tracker, and the one
   available loses 0.3 s and is unreliable at the jump.

Where it could still pay: a track with real braking zones on flat road (the
brake numbers are strong and the brake-while-steering penalty is large, which
a human may not exploit fully). None of the three tracks I looked at is one;
I did not check the other fourteen.

## Using a computed line as the reference in `rl/racing_env.mjs`

`refFile` takes a lap (`{ frames, recording }`), replays it, and builds from
the replay: the line's points, speeds, wheel-contact flags and car
orientations; the keys per line point (`refW`, `refS`, `refSteer`, which are
policy inputs); the clearance profile; and the ladder of save states for
starting episodes mid-lap. A bare line has no keys, no orientations and
nothing to replay, so three of those are missing. The route that works today
with no code change: drive the line with `drive_line.mjs` and pass the saved
lap, e.g. `refFile: 'runs/g1-7-computed_desert4.recording.json'` (22.083 s,
verified). To accept a bare line instead, `setReference` would need: the
orientation at each point built from the path's direction and the road's
normal; `refW/refS/refSteer` from the speed profile (W where below the
profile, the steering share from curvature over `kappaMax`); and the ladder
built from some lap that follows the line, which brings back the need for a
tracker. I would not build that.

## Not done or not tested

- A corridor from the track alone (no seed lap).
- Driving summer1 or winter2 lines in the simulator.
- A better tracker (per-tick steering to hold a curvature, or a short search
  around the tracker's keys). `scripts/search_rollout.mjs` or g1-5 starting
  from `runs/g1-7-computed_desert4.json` would be the cheap way to find out
  whether the computed line is a better starting point than the human's.
- Braking zones: no test track with one was built; `buildPad` could be
  extended with corner pieces to check the brake numbers in a real corner.
- `fit_car.mjs` was not repeated for the S+A column above 450 km/h or for
  turning below 25 km/h.

## Changes needed elsewhere

None. An entry in `ideas/shared/REQUESTS.md` offers `car_model.mjs`,
`testpad.mjs` and `corridor.mjs` for sharing.

## Cost of a full run

All of it for one track is about 3 minutes on one core: fit 20 s (once, not
per track), compare 25 s, sweep 2 min. All 17 tracks on paper: about 8
minutes, one simulator.

## Changes made by the tester

An independent tester added `tests/` (run `node ideas/g1-7-computed-racing-line/tests/run_tests.mjs`,
about 100 s) and made three small fixes, written up in `tests/TESTING.md`. None
changes a number in this README.

- `raceline.mjs` `speedProfile`: the cornering limit is floored at 0.1 units/s
  (a bend tighter than the car's tightest turn used to give an infinite lap time).
- `car_model.mjs` `accel`: full lock never gets more acceleration than a
  straight line (above 575 km/h the carried-up table said it did).
- `corridor.mjs` `roomBeside`: a road that ends within the last unit before the
  20-unit search limit no longer reads as "20 or wider".

Three defects were found and left for the author (the suite reports them as
known failures): braking with a steering key down (`car.brake(v, 1)` and the
S+A columns of the table in section 1) is a slide whose deceleration depends on
time, not on speed, and the model is 31% off where it was measured; the
turning limit is stored with 4 decimals (±1.4% at 500 km/h); and `optimiseTime`
moves the first point of the line 0.59 units away from where the car starts.
