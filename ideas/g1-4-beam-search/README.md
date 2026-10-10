# g1-4: beam search over block decisions

`scripts/search_rollout.mjs` holds one lap and tries one change at a time, each
judged by driving to the finish. This keeps many partial laps alive at the same
lap tick (save states), extends each by one 50 ms block decision in several
ways, ranks them and prunes to the best `beam`, with the top few driven to the
finish every second of lap to get a real lap time. The fastest finished lap
known (the "incumbent", at first the policy's own lap) always keeps a member in
the beam, so the result is never slower than what it started from.

Status in one line: it runs, every lap it reports passes Verify, on 2-second
stretches it finds laps 47 to 64 ms faster than the policy's own 22.061 s in
about a minute on two processes, and it has **not** beaten the 21.907 s lap or
been run over a whole lap.

## Files

| File | What |
| --- | --- |
| `beam.mjs` | the search (parent process). The header explains the loop, the elite, ranking, diversity and how several processes share a beam |
| `child.mjs` | pool child: a table of nodes (save state + decisions from the start line), candidate generation, lookahead, rollouts, and a rebuild of every node on a new car when the car's tick budget runs out |
| `calibrate.mjs` | measures how well each ranking measure agrees with the finish time |
| `scratch/` | logs of the runs quoted below, and `prof.mjs` (timings of rewind / step / save) |

Uses `ideas/shared/`: `block_rollout.mjs` (`openBlockEnv`), `policy.mjs`
(`loadPolicy`, `loadValue`, `createRng`), `laps.mjs`, `verify.mjs`.

## How to run

From the project root. Defaults: 2 processes, `ppo_sr1_<track>.u800` actor and critic.

```
# smoke test (55 to 75 s): a beam of 8 over 6.0 s .. 8.0 s of the lap, then
# every member driven to the finish, the best lap verified and saved
node ideas/g1-4-beam-search/beam.mjs desert4 start=120 depth=160 beam=8 out=g1-4-smoke

# which measure to rank by (2 minutes; two start points, one per process)
node ideas/g1-4-beam-search/calibrate.mjs desert4 at=130,330 n=18

# a full run (NOT run yet; needs the machine): the whole lap, 8 processes
node ideas/g1-4-beam-search/beam.mjs desert4 workers=8 beam=32 seconds=540 out=g1-4-beam

# the same, starting from a searched lap instead of the policy's own
node ideas/g1-4-beam-search/beam.mjs desert4 workers=8 beam=32 from=runs/rollout_desert4.json out=g1-4-beam
```

All options are listed at the top of `beam.mjs`. Results go to
`runs/<out>_<track>.json` and `.recording.json` only after Verify passes.

## What was measured

Everything below: desert4, `ppo_sr1_desert4.u800`, 2 processes, with training
and the other agents loading the machine.

### 1. What to rank by (`calibrate.mjs`)

At each start point: 18 states two decisions after it, all at the same tick,
each driven to the finish by the policy. "Agreement" is the Spearman rank
correlation between a measure and "finishes sooner" (1 = perfect, 0 = chance).

| start point | finish times of the 18 | progress | value | look 10 | look 20 | look 40 | lookvalue 20 | lookvalue 40 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1.0 s | 22.029 .. 22.193 | 0.24 | 0.28 | 0.26 | 0.25 | 0.21 | -0.04 | -0.06 |
| 3.0 s | all 22.061 (keys do nothing here: the 18 laps are identical) | - | - | - | - | - | - | - |
| 6.5 s | 22.030 .. 22.289 (17 finish) | 0.67 | 0.08 | 0.79 | 0.81 | 0.71 | 0.72 | 0.75 |
| 9.5 s | 22.040 .. 22.114 | 0.30 | 0.06 | 0.11 | 0.06 | 0.47 | 0.05 | 0.10 |
| 12.0 s | 22.045 .. 22.207 | 0.64 | 0.63 | 0.39 | 0.35 | 0.52 | 0.53 | 0.62 |
| 16.5 s | 22.036 .. 22.395 | 0.17 | 0.71 | 0.56 | 0.77 | 0.79 | 0.93 | 0.96 |
| mean of the five | | 0.40 | 0.35 | 0.42 | 0.45 | 0.54 | 0.44 | 0.47 |

`progress` = distance along the reference line now; `value` = reward so far +
critic; `look H` = distance after H decisions of policy driving; `lookvalue H`
= reward + critic after H decisions.

What this says:

- **No cheap measure is reliable.** Every one is near chance at some start
  point. Two decisions (100 ms) of different keys move the finish time by 70 to
  360 ms once the policy drives on, so the thing being predicted is itself
  noisy.
- **A lookahead does not buy much.** 10 decisions ahead (11 times the ticks)
  averages 0.42 against 0.40 for plain distance; 40 ahead (41 times the ticks)
  averages 0.54. With 18 states per point these differences are within noise.
- The critic is good late in the lap (0.71 at 16.5 s, 0.96 with a 2 s
  lookahead, where the finish bonus is inside its horizon) and useless at 6.5
  and 9.5 s.
- So the finish time has to stay in the loop. That is why the beam has the
  elite and the periodic rollouts, and why the default is the cheap `value`
  with the ticks spent on beam width instead of lookahead.

### 2. The beam on one stretch, three rankings

Beam of 8, from 6.0 s to 8.0 s of the policy's lap (40 decisions, about 1300
candidates), 2 rollouts every second of lap, then all 7 non-elite members
driven to the finish. Policy's own lap: 22.061 s.

| rank | best lap (verified) | members that finish | mean / worst of those | wall time | ticks |
| --- | --- | --- | --- | --- | --- |
| progress | 22.013 s (-48 ms) | 4 of 7 | 22.053 / 22.073 s | 63 s | 0.20 M |
| value | 21.997 s (-64 ms) | 7 of 7 | 22.035 / 22.086 s | 49 to 72 s | 0.24 M |
| look, 10 ahead | 22.002 s (-59 ms) | 7 of 7 | 22.062 / 22.111 s | 187 s (over the 2-minute limit; not repeated) | 0.92 M |

One run each, so the ordering is not established. What is: ranking by distance
alone left 3 of 7 members that the policy cannot bring home, and the lookahead
cost four times the ticks for no better a lap.

The first run of all (start line to 2.0 s, beam 8, rank=progress) gave 22.014 s
(-47 ms), verified. At the end of that stretch the beam was at 36.7 to 36.8
units and the policy at 36.67: the beam does get ahead over a stretch, by
centimetres, and the lap-time gain comes from which line the policy then drives.

### 3. Against the 21.907 s lap (`from=runs/rollout_desert4.json`)

| stretch | result |
| --- | --- |
| 20.0 s to the finish, beam 8, rank=value, 1283 candidates, 32 s | no improvement; the beam crossed the line itself, nothing beat 21.907 |
| 6.0 to 8.0 s, beam 8, rank=value, 1298 candidates, 50 s | no improvement; members driven on by the policy: best 21.974, mean 22.025 s |

This is the hill-climb's stall, reproduced: once the incumbent is 150 ms
better than the policy drives, "leave it for 2 s, then let the policy finish"
does not beat it. The beam's answer is to carry on to the finish line itself
rather than hand over to the policy, and that needs the whole lap (or at least
the last several seconds with a wide beam), which did not fit the smoke-test
limits. It is untested.

### 4. Checks

- Every lap reported was verified by `verifyAndSave` (finish tick accepted,
  one tick earlier rejected); `runs/g1-4-smoke_desert4` (21.997 s) also passes
  `node scripts/export_recording.mjs desert4 g1-4-smoke`.
- Repeatable: the same command gives the same lap to the tick (progress and
  value runs repeated, before and after the save-only-what-is-kept change).
- Car rebuild: with `carBudget=30000` one process rebuilt its nodes on a new
  car 13 times in a 10-decision run and ended with the same lap (22.035 s, 169
  candidates) as the run with no rebuild.
- The search stops with an error if the incumbent lap, driven again decision
  by decision inside the beam, ever ends differently. It never did.
- Nothing of mine is left running (checked the process list).

### 5. Speed, memory, tick budget

- Per candidate (`scratch/prof.mjs`, one process alone / two at once): rewind
  2.7 / 5 ms, the 50 ticks 3.5 / 6 to 11 ms, a save state 12 ms. Plain policy
  driving in `RacingEnv` is 6 ms per decision, about 7 500 ticks per second,
  far below the bare simulator's 34 000, because a block is five 10-tick steps
  each with its own round trip to the simulator.
- Saving only the kept candidates (the `commit` step) is in; it saved 4 to
  11% of wall time on the two runs compared, less than hoped, because rewind + step is the larger part
  under load.
- In the beam, measured: about 4.1 distinct candidates per member per decision
  (of 6 generated; the rest hold the same keys), about 0.7 s of wall time per
  decision of lap for a beam of 8 on two processes, 3 to 4 s per pair of
  rollouts from mid-lap.
- Memory: a node is 0.19 MB and only kept members are saved, so a beam of 32
  is 6 MB in total. Not a constraint.
- Ticks: a beam of 32 over a whole 22 s lap is about 2.9 M ticks of candidates
  + 0.7 M of commits + 0.5 M of rollouts = 4.1 M across all processes, about
  0.5 M per process on eight. One car (4.5 M) lasts a whole pass; the rebuild
  only matters for lookahead runs or several passes.

## A full run: cost and what it might gain

Not run. Estimate for 8 processes, 10 minutes, rank=value, no lookahead:

- At the speed measured now (loaded machine): one pass over the whole lap with
  a beam of about 32 takes 7 to 9 minutes (440 decisions x about 0.9 s, plus 22
  rounds of rollouts). On the quiet machine it should be several times faster:
  `runs/rollout_desert4.log` shows `search_rollout.mjs` doing 40 rollouts per
  second on 8 processes, roughly ten times the tick rate I measured today. Then
  either a beam of 100+ or several passes with different seeds fit.
- Gain: unknown. Honest reading of the evidence: from the policy's own lap,
  single 2-second stretches gave 47 to 64 ms with a beam of 8, so a whole pass
  plausibly lands in the range `search_rollout.mjs` already reaches (100 to
  250 ms, i.e. around 21.85 to 21.95 s). Whether it gets past 21.907 s, let
  alone the human's 21.750 s, depends on the one thing not tested: a wide beam
  run all the way across the line from `from=runs/rollout_desert4.json`. The
  two stretch tests from that lap found nothing, and the calibration says the
  ranking is weak, so I would not expect more than a few tens of ms from it
  without a better ranking measure.

## Not done or not tested

- A whole-lap run, a run with 8 processes, any track other than desert4, any
  checkpoint other than `ppo_sr1_desert4.u800`.
- Tuning: beam width, `samples`, bucket sizes (`latBin`, `alongBin`,
  `perBucket` are first guesses; the beam's spread at one tick was 0.4 to 2.4
  units across and only 0.1 to 0.4 along), `rollEvery` / `rollTop`.
- Whether diversity buckets help at all: no run compared with and without.
- Members never move between processes (a process may hold up to 1.5 even
  shares). If one process's members are all pruned it idles for the rest of the
  pass. The child's `adopt` command (drive a decision list, make a node) is
  what a rebalance would use; the parent does not call it for that yet.
- Ranking by time at equal progress was not implemented: members are all at
  the same tick, where "further along" and "earlier at the same place" order
  them the same to first order.
- The calibration is 18 states at each of five points on one track; treat the
  table as a direction, not a result.
- A learned ranking measure fitted to finish times (the rollouts produce
  exactly that training data) is the obvious next step and is not started.

## Changes needed elsewhere

None to run this. Two that would make it faster:

- `rl/racing_env.mjs` `stepBlock`: stepping a 50 ms block as five 10-tick
  steps costs about 6 ms; one 50-tick call with the key switches inside it
  (the simulator takes per-tick keys) would bring candidates close to the bare
  simulator's speed. The per-step reward and off-line checks would have to be
  made per block.
- A save state that can be sent to another simulator process would let a beam
  be shared properly across processes instead of each process owning the
  members it made.
