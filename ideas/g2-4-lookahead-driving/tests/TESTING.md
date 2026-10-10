# g2-4 lookahead driving: independent tests

Written by a tester who did not write the code. Run from the project root:

```
node ideas/g2-4-lookahead-driving/tests/run_tests.mjs
```

170 checks, 170 pass (after one fix, below), 1.5 to 3 minutes depending on
what else the machine is doing. At most two simulator processes at once, no
single run over 90 s. `test_drive.mjs` writes `runs/g2-4-test-drv_winter4.*`
and removes them.

## What is covered

`test_logic.mjs` (no simulator, 108 checks). `driveLap()` on `toy_env.mjs`, a
hand-built stand-in for `RacingEnv`: a straight road with three lanes, walls,
stretches where the lane cannot be changed, slow spots, and strict save
states (rewinding to a dropped mark, or to a mark of an earlier car, throws).
Every expected lap, counter and tick count is worked out by hand in the
comments.

- Plain, lazy and full on a clear road: the lap, 6 replans, and the cost
  (1230, 3460 and 23530 ticks); 24 alternatives with the default lists.
- A wall the policy drives into: the first surviving alternative is committed,
  `troubled` / `rescued` / `picks`, 5760 ticks. `score=reward`, `progress`
  and `value` each pick the continuation their rule says; a tie keeps the
  policy's own.
- The "too slow" rule at its boundary: 49.99 against a limit of 50 fails,
  exactly 50 does not, and only the speed at the end of the try-out counts.
- Dead end and backing up: one and two replan points back with the longer
  horizon, the committed decisions taken back, 11260 ticks; `back=2` is just
  enough and `back=1` / `maxBackups=0` end in the wall after two dead ends.
- A finished continuation beats a better-paid survivor; the earlier finish wins.
- Sampling: plain `sample=1` is one draw per decision from the seed's own
  stream; lazy with samples repeats for a seed and differs between seeds.
- The car used up in the middle of a lap (the path the README says was never
  reached): the lap must not change and the cost must be every tick stepped.
- For every case: the committed decisions equal the toy's actual history,
  replay from the start to the same tick, `simTicks` equals the ticks the toy
  counted, and no save state is left behind.

`test_logs.mjs` (no simulator, 16 checks): the README's tables against the
author's `logs/*.jsonl`, including that plain and lookahead used the same
seeds.

`test_sim_a.mjs` (winter4, seed 10, 15 checks) and `test_sim_b.mjs`
(22 checks), one simulator each:

- Same seed twice: the same plain attempt and the same lookahead lap to the
  tick, with the same cost and picks.
- `simTicks` against a meter of the tester's own (the lap clock's advance over
  every block decision, try-outs included): 172540 = 172540.
- The baseline is an honest plain policy: `mode=plain sample=1` is identical
  to a sampled rollout written with shared `roll()` from the same seed, to
  the environment's own end of episode.
- The committed decisions alone, from the start line, end on the driver's
  tick; as keys on the bare simulator they finish on the same tick and pass
  the game's Verify (rejected one tick short).
- The three saved laps, from the files alone: `runs/g2-4-gen_winter4`
  19819, `g2-4-gen_desert3` 20793, `g2-4-gen_summer3` 21503 ticks; the
  recording and per-tick keys agree; each finishes on that tick on the bare
  simulator; Verify passes there and rejects one tick either side; the keys
  are exactly a sequence of block decisions.
- Seed 12: plain stops at 66.7%, top choices go off track at 36.4%, lookahead
  finishes in 21.726 s at 12.5 x.

`test_drive.mjs` (9 checks): `drive.mjs` as a child process: seed ranges and
lists, the summary line, the `log=` file, the usage error, and `out=`: the
documented command reproduces `runs/g2-4-gen_winter4` key for key.

## Not covered, and why

- desert3 and summer3 were not re-driven (desert3 seed 11 took the author
  124 s for one lap, over the limit); their saved laps were verified and their
  logs checked.
- winter4 seeds 11, 13, 14 were not re-driven (seed 11 took the author 147 s).
- `mode=full` and `score=value` on the real simulator, and the horizon /
  interval variants: toy world and logs only.
- `smoke.mjs` was not run; `test_sim_a.mjs` makes the same checks and more.
- The fresh-car path on the real simulator (it needs 4.5 million ticks).

## Defects

1. FIXED. `lookahead.mjs`, `simTicks` after the car is replaced in mid-lap
   (lines 150 to 153, 202 to 204, 254). `simTicks` was
   `renv.env.frames - ticks0`, but `env.frames` goes back to 0 when a new car
   is built (`sim/env.mjs _newCar`). In the toy case the driver reported
   -4496140 ticks for a lap that cost 4260. The path is reachable in normal
   use: `drive.mjs` drives all seeds on one car, and ten seeds at the measured
   17 x (39 x at worst) pass 4.5 million ticks. Fix: the ticks stepped on
   earlier cars are added up (`ticksOnOldCars`). The lap itself was already
   right on that path (same decisions, same finish tick).

No other defect found. Two things that are not defects but matter for how the
numbers are read:

2. The comparison "16 of 16 against 6 of 16" is one plain attempt against one
   lookahead lap that costs 9 to 39 plain laps. Same seeds, same environment,
   same stopping rule: yes. Same cost: no, and the README says so. At equal
   simulated cost the plain policy would have had about 17 attempts per lap.
   g2-3's logs give that baseline: repeated plain attempts finish summer3 in 5
   of 5 runs within 5 laps of driving and desert3 in 3 of 5 within 10, and
   winter4 in 0 of 8. So winter4 is the track where the lookahead does
   something retries do not; on the other two it mostly buys the finish
   sooner or more surely, not a finish that was out of reach.
3. `tryOut` counts `contact` and never uses it (`lookahead.mjs` line 93).

Four of the author's logged laps took over 2 minutes of wall time each
(124, 147, 169 and 244 s), as the task notes said.

## The README's claims

| Claim | Result |
| --- | --- |
| Training tracks of `ppo_blkgen.best2.pt`: 14, without desert3, summer3, winter4 | Confirmed from the checkpoint |
| winter4: lookahead finishes where the plain policy does not | Confirmed by re-running seeds 10 and 12 (plain stalls at 66.8% / 66.7%; lookahead 19.819 s and 21.726 s) |
| Saved laps 19.819, 20.793, 21.503 s finish on the stated tick and pass Verify | Confirmed for all three, from the files, on the bare simulator |
| Costs 8.7 x and 12.5 x ticks for those two laps, no back-ups | Confirmed, and the tick count itself confirmed by an independent meter |
| Plain 9 of 30 sampled; top choices finish none (17.7%, 66.5%, 36.4%) | Confirmed from the logs; winter4 top choice and three sampled seeds re-run |
| 16 of 16 against 6 of 16 on the same seeds; lap times; 16 to 32, 9.3, 9 to 39 x; mean 17 x | Confirmed from the logs (5 of the 16 laps re-driven or verified here) |
| "The committed decisions driven again end on the same tick" | Confirmed, and also on the bare simulator with Verify |
| Lazy leaves a good driver alone (desert4 specialist, 22.061 s, 0 of 42 replans) | Confirmed from the logs; the same property holds exactly in the toy world; not re-run |
| Full / score / horizon tables | Numbers match the logs; not re-run |
| "The fresh-car path is written but was never reached" | Reached in the toy world: the lap was right, the tick count was wrong (fixed) |
