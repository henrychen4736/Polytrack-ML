# Tests of `ideas/shared/`

Written by an independent tester, not by the author of the modules.

```
node ideas/shared/tests/run_tests.mjs
```

187 checks, all passing, about 100 s with training running. One simulator
alive at a time. The runner prints one `PASS` / `FAIL` line per check, a final
count, and exits 0 only if nothing failed. `smoke_test.mjs` (the author's) also
still passes after the fixes below.

## What is covered

| Test file | Module | What is checked |
| --- | --- | --- |
| `test_laps.mjs` (48 checks, no simulator) | `laps.mjs` | keys ↔ timeline ↔ recording on hand-written laps (a key held from tick 0, a flip on the last tick, an empty lap, gaps up to 16 million ticks); `decisionsToKeys` tick by tick for hand-written decisions (`lead`, `before`, carry-over between blocks); `keysToDecisions` exact on 50 random block-driven stretches, and its losses counted by hand (a 10 ms tap lost, a press 14 ms and 46 ms into a block, a short last block, left + right together); `sameKeys`; `humanLaps` on all 17 tracks (ten laps, fastest first, `keys.length === frames`); every form `loadLap` takes, and that it throws on the wrong ones; the contract's 2.8 / 1.7 / 5.7 % |
| `test_sim_session.mjs` (40) | `sim_session.mjs` | a new car; the same keys in one call and in 261 uneven pieces give the identical car; `load()` restores the car, the clock, `state`, `motion()` **and `keys`** (see defect 1); a point saved after the finish; the finish on tick 21750 and not 21749; keys given past the finish are not driven; contact ticks; a lap that does not move; `restart()` kills old points; a track given as CreateCar inputs |
| `test_verify.mjs` (34) | `verify.mjs` | `scoreKeys` at the finish tick, one tick short, on 3 s of keys, on no keys; the game's Verify accepts the human lap on 21750 and rejects both 21749 and 21751; `verifyAndSave` with and without an Env, `save: false` writes nothing, an unfinished lap writes nothing, keys 400 too long are cut, keys 40 too short are padded with the last key and the saved file has exactly `finishFrames` keys, the saved recording passes Verify again, nine bad run names are refused |
| `test_track_info.mjs` (21) | `track_info.mjs` | gates and cumulative lengths on all 17 tracks; `progress()` on made-up states with the expected value worked out (start line, each gate centre, halfway between two gates, far away, finished, counter past the last gate); ray casts down, up, too short, `raycastFar`; a track given as inputs or as a save string; the computed start position against the real car |
| `test_policy_rollout.mjs` (30) | `policy.mjs`, `block_rollout.mjs` | `decide` is the top score of each group; the chances `logProb` gives for all 1500 decisions add up to 1; sampling frequencies over 30 000 draws match the softmax; `createRng`; wrong file sizes throw; `fromStart` twice gives the identical observation; the policy's lap is 22061 ticks; explicit decisions with `null` gaps; `mark` / `rewind` restore observation and progress; the same sampled 2 s twice from one mark; an attempt with no keys ends as `stalled`; the same lap driven by RacingEnv and by SimSession finishes on the same tick |
| `test_export_critic.py` (14, Python, CPU) | `export_critic.py`, `policy.mjs` | the script on a **copy** of a checkpoint in `tests/tmp/` (nothing under `rl/checkpoints/` is written): exit 0, file size and layout; exit non-zero with no argument, on a non-block checkpoint, on a missing file; then the 22 scores, the value, the top decision and its log-probability from `policy.mjs` against PyTorch on three observations (largest difference about 1e-6) |

`harness.mjs` (check / run / runAll) and `headline.mjs` (independent re-check
of a claimed lap: replay, one tick fewer, Verify, the human lap) are used by
the g1-1, g1-2 and g1-5 tests as well. `print_scores.mjs` is a helper for the
Python test.

## Defects found

1. **`SimSession.load()` left the wrong keys in `sim.keys`** (reported by
   g1-2). `sim_session.mjs`, `load()`, was `this.keys.length = point.tick`
   (line 172 before the fix, line 192 now). After "save A, drive, save B, load A, drive
   other keys, load B", `sim.keys` held the other branch's keys from A's tick
   on, or holes (`undefined` entries) if that branch was shorter than B. The
   car itself was always restored correctly; only the record was wrong, so a
   lap saved from `sim.keys` was not the lap that had been driven.
   Reproduced: 4 checks of `test_sim_session.mjs` failed. **Fixed**: `save()`
   stores a copy of the keys in the point (one reference per tick, 0.17 MB for
   a 22 s lap) and `load()` writes them back into the same array object. The
   line in `CONTRACT.md` was updated.
2. **`motion()` on the finish tick was measured across up to 49 ticks, not 4.**
   `sim_session.mjs`, `hold()`: the early return at the finish (line 95 before
   the fix, lines 95 to 102 now) skipped the trim of `this.recent`. **Fixed** (trim before that
   return). Effect before the fix: small (velocity averaged over 49 ms rather
   than 4); it feeds `subTick()` of g1-5, which is off by default.
3. **`loadPolicy` / `loadValue` could not take an absolute path on Windows.**
   `policy.mjs`, `loadNet()` (line 38 before the fix, line 44 now): `new URL('C:\\...',
   ROOT)` has the scheme `c:` and `readFileSync` throws "The URL must be of
   scheme file", although the comment says "relative to the project root (or
   absolute)". **Fixed** with `path.resolve`.

No defect was found in `laps.mjs`, `verify.mjs`, `track_info.mjs`,
`block_rollout.mjs` or `export_critic.py`.

## Was anyone affected by defect 1?

- **g1-1: no.** It does not import `sim_session.mjs` at all (it uses
  `sim/env.mjs` save states directly); checked in its `test_headlines.mjs`.
- **g1-5: no.** `child.mjs` uses a SimSession but reads `sim.keys` only as
  "has a car been made yet". The laps it scores come from the parent's
  timeline, and its `test_child.mjs` compares save-state answers with replays
  from the start line.
- **g1-2: no**, because its author worked around it (`snapshot` / `restore`
  in `stitch_laps.mjs`). Its headline lap reproduces key for key with the
  fixed module.
- All six headline laps of these three folders replay and verify
  independently (their own `TESTING.md`).
- Other users of the module (`g1-7 fit_car.mjs`, `g2-1 smoke_test.mjs`) were
  not examined here; the fix only adds a field to a point and makes `load()`
  restore more, so code that worked before still works.

## Claims in `CONTRACT.md`

Confirmed: conversions exact both ways; `keysToDecisions` wrong on 2.8 / 1.7 /
5.7 % of ticks; best human laps 21750 / 26830 / 34105 / 22131 and the summer1
fixture at 22279; same keys from the same point finish on the same tick; clean
human lap has zero contact ticks; a point stores 0.18 MB; desert4 has 4 gates
and a 1920-unit path, 2 to 10 gates on every track; the policy's lap is
22.061 s; values 59 and 78; Verify rejects one tick fewer (and one tick more);
run names without an idea prefix are refused.

Not checked: the speed figures (34 000 ticks/s, 5 ms per save, 2 ms per load),
which depend on the machine's load; the "about 6 million ticks per car" limit
(it would take minutes of stepping per test).

## Not covered, and why

- `budgetLeft` turning false and `needsFreshCar` turning true: reaching 4.5
  million ticks is about 2 minutes of simulator time per test.
- `openBlockEnv` with `refLap` / `refFile`, and tracks other than desert4 for
  the simulator-backed tests: time. The pure checks run on all 17 tracks.
- `loadValue` against PyTorch is on one checkpoint (`ppo_sr1_desert4.u1200`).
- Two SimSessions in one process stepping at the same time.

## Added by the orchestrator in phase 2 (not by the independent tester)

`run_tests.mjs` now also runs `test_pool.mjs` (6 checks, no simulator) for the
new `pool.mjs`: 193 checks in all, all passing in the final run of
`node ideas/run_all_tests.mjs`.

The modules promoted in phase 2 (`car_model.mjs`, `track_build.mjs`,
`route_progress.mjs`, `lookahead.mjs`, `lap_paths.mjs`, `laps_bc.py`) re-export
code that lives, and is tested, in its idea folder; they have no tests of
their own here. Each was called once through the shared file after the
promotion: the car model loads and `brake(v, share > 0)` throws; a generated
track opens in `loadTrackInfo` with track surface 0.14 under the start
position; `routeFor` returns the desert4 route (length 1984); `laps_bc.py`
writes 438 examples from the 21.907 s desert4 lap, the count g1-3 reports.
`lookahead.mjs` and `lap_paths.mjs` were only imported. `surfaceBelow` and
`watchLap`, moved into `track_info.mjs`, are exercised by g2-2's suite, which
imports them from here. `rng.mjs` is the generator `test_policy_rollout.mjs`
already checks through `policy.mjs`.
