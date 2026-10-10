# Graph Report - Polytrack-ML  (2026-10-10)

## Corpus Check
- 457 files · ~367,212 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 41 file(s) not represented in the graph (top: .log 21, .jsonl 15, (none) 3)

## Summary
- 2405 nodes · 5262 edges · 133 communities (118 shown, 15 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 391 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `def87fb3`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- search_sections.mjs
- RacingEnv
- ladder_test.mjs
- PolytrackVecEnv
- search_settings.mjs
- search_timeline.mjs
- env.mjs
- decodeState
- capture_init.mjs
- iqn_server.mjs
- numpy
- test_pure.py
- train_ppo.py
- rounds.mjs
- Changes needed elsewhere
- worker_entry.mjs
- test_prune.mjs
- PolytrackEnv
- shared/tests/harness.mjs
- train_block_specialist.sh
- track.mjs
- check_track.mjs
- test_5_corridor_sim.mjs
- memory_test.mjs
- eval_block_specialist.sh
- eval_generalist.sh
- train_block_specialist_from.sh
- recording.mjs
- search_rollout.mjs
- set3_round2.sh
- test_worker.mjs
- search_round.sh
- stitch_laps.mjs
- beam.mjs
- observation.mjs
- policy.mjs
- explore.mjs
- fit_car.mjs
- search_human.mjs
- g2-2-track-generator/smoke_test.mjs
- createRng
- IqnServers
- route.mjs
- check_pieces.mjs
- analyze.mjs
- progress
- ref_node_fs
- test_3_under_road_sim.mjs
- refine.mjs
- generate.mjs
- racing_env.mjs
- validate.mjs
- test_agent.py
- test_policy_rollout.mjs
- g2-3-explore-and-adapt/tests/test_logic.mjs
- plot_dump.mjs
- calibrate.mjs
- SimSession
- g1-4-beam-search/child.mjs
- loadTrack
- g2-3-explore-and-adapt/tests/run_tests.mjs
- test_train_toy.py
- test_follow.mjs
- trace.mjs
- paths.mjs
- state.mjs
- test_lib.mjs
- g1-5: fine key timing (1 ms)
- .create
- pretrain_bc.py
- test_3_testpad_sim.mjs
- progress.mjs
- test_driver.mjs
- attempts.mjs
- rollout_child.mjs
- g1-1: search from the human's lap
- Modules
- Tests of g1-2 (stitch a lap from several human laps)
- Env
- toy_probe.py
- test_4_sim.mjs
- test_sim_b.mjs
- test_6_scripts_sim.mjs
- test_restart.mjs
- Brief for the idea agents
- raceline.mjs
- g1-2: stitch a lap from the fastest sections of several human laps
- finetune_plan.sh
- smoke_test.sh
- g2-4-lookahead-driving/tests/test_logic.mjs
- test_logs.mjs
- test_memory_env.mjs
- trainPlan
- test_attempts.mjs
- codec.mjs
- replica_check.mjs
- test_track_memory.mjs
- IQN
- test_python.mjs
- pieces.mjs
- test_lock.mjs
- run_all_tests.mjs
- smoke_real.mjs
- g1-7: a computed racing line
- test_1_raceline.mjs
- g2-1: inputs that need no human lap
- TrackMemory
- test_beam.mjs
- compare_human.mjs
- Twelve ideas: what came out
- key_usage.mjs
- g1-4 beam search: independent tests
- g2-5-memory-policy/tests/run_tests.mjs
- g1-3-search-train-rounds/tests/run_tests.mjs
- g1-4-beam-search/tests/run_tests.mjs
- .load
- g1-6-offpolicy-rl/tests/run_tests.mjs
- MemoryEnv
- ref_node_child_process
- g2-1-reference-free-inputs/tests/run_tests.mjs
- compare_sections.mjs
- watch_ghost.mjs
- shared/pool.mjs
- g1-4-beam-search/tests/test_child.mjs
- export_recording.mjs
- drive_line.mjs
- test_2_observation_sim.mjs
- g2-4-lookahead-driving/tests/run_tests.mjs
- actor_file_best_action
- read_actor

## God Nodes (most connected - your core abstractions)
1. `loadTrack()` - 58 edges
2. `Env` - 54 edges
3. `RacingEnv` - 50 edges
4. `decodeState()` - 40 edges
5. `rotate()` - 36 edges
6. `SimSession` - 33 edges
7. `createRng()` - 29 edges
8. `humanLaps()` - 28 edges
9. `loadTrackInfo()` - 26 edges
10. `verifyAndSave()` - 26 edges

## Surprising Connections (you probably didn't know these)
- `Design, and why` --references--> `RacingEnv`  [INFERRED]
  ideas/g1-6-offpolicy-rl/README.md → rl/racing_env.mjs
- `Plain policy on the unseen tracks (baseline)` --references--> `RacingEnv`  [INFERRED]
  ideas/g2-4-lookahead-driving/README.md → rl/racing_env.mjs
- `Shared code` --references--> `RacingEnv`  [INFERRED]
  ideas/README.md → rl/racing_env.mjs
- `Goal 2: a generalist for any track` --references--> `loadTrack()`  [INFERRED]
  ideas/README.md → sim/env.mjs
- `Rules for working side by side` --references--> `EnvServer`  [INFERRED]
  ideas/shared/CONTRACT.md → rl/polytrack_env.py

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Node environment to Python PPO training pipeline** — sim_env, rl_racing_env, rl_env_server, rl_polytrack_env, rl_train_ppo, rl_evaluate [INFERRED 0.85]

## Communities (133 total, 15 thin omitted)

### Community 0 - "search_sections.mjs"
Cohesion: 0.06
Nodes (53): change(), dist2(), drive(), driveTail(), driveTo(), faster(), pos, pose (+45 more)

### Community 1 - "RacingEnv"
Cohesion: 0.18
Nodes (8): straight(), Changes needed elsewhere, Changes needed elsewhere, Facts measured by the idea agents, Facts that are easy to get wrong, actionToControls(), RacingEnv, sub()

### Community 2 - "ladder_test.mjs"
Cohesion: 0.10
Nodes (19): Things that were not obvious, body(), fractions, human, keys, resetTimes, same(), t0 (+11 more)

### Community 3 - "PolytrackVecEnv"
Cohesion: 0.07
Nodes (11): _obs(), PolytrackVecEnv, Design in brief, Files, Install, Known limits, Multi-track ("generalist") training, rl/: reinforcement learning on the headless simulator (+3 more)

### Community 4 - "search_settings.mjs"
Cohesion: 0.11
Nodes (19): args, bigMoveChance, clamp(), current, extraChance, gaussian(), GLOBALS, mutateSettings() (+11 more)

### Community 5 - "search_timeline.mjs"
Cohesion: 0.09
Nodes (20): saveProgress(), { check, eq, note }, inputs, lap, replay(), save(), args, best (+12 more)

### Community 6 - "env.mjs"
Cohesion: 0.08
Nodes (16): byId, cap, ours, allOfficial, amount, args, get(), officialDir (+8 more)

### Community 7 - "decodeState"
Cohesion: 0.18
Nodes (19): follow(), routeToLine(), unguarded(), profile(), options, track, profile(), createController() (+11 more)

### Community 8 - "capture_init.mjs"
Cohesion: 0.10
Nodes (15): devDependencies, playwright-core, name, private, scripts, capture, setup, test (+7 more)

### Community 9 - "iqn_server.mjs"
Cohesion: 0.11
Nodes (28): b64(), begin(), decisionOf(), drive(), evaluate(), greedy(), handle(), HUMAN_DOING (+20 more)

### Community 11 - "test_pure.py"
Cohesion: 0.06
Nodes (25): export_actor(), quantile_huber_loss(), ReplayBuffer, check(), main(), check(), loss_by_loops(), n_step_one() (+17 more)

### Community 12 - "train_ppo.py"
Cohesion: 0.07
Nodes (14): main(), Agent, block_imitation_loss(), block_parts(), held_keys(), imitation_loss(), _layer(), main() (+6 more)

### Community 13 - "rounds.mjs"
Cohesion: 0.22
Nodes (30): paths(), alive(), at(), attemptsOf(), ckptSteps(), createState(), dropLock(), existingCopies() (+22 more)

### Community 14 - "Changes needed elsewhere"
Cohesion: 0.15
Nodes (10): Changes needed elsewhere, Curriculum, g2-5: a policy with memory of its earlier attempts, What a full run would cost, What was verified, Which design, and why, Defects, g2-5 memory policy: independent tests (+2 more)

### Community 15 - "worker_entry.mjs"
Cohesion: 0.29
Nodes (6): handleControl(), memories, physicsBytes(), restoreSnapshot(), snapshots, takeSnapshot()

### Community 16 - "test_prune.mjs"
Cohesion: 0.13
Nodes (12): check(), failed, finish(), passed, same(), throws(), a, b (+4 more)

### Community 17 - "PolytrackEnv"
Cohesion: 0.12
Nodes (8): main(), parse_args(), PolytrackEnv, _random_policy_check(), rl/requirements.txt (Python 3.10+), gymnasium>=0.29 (optional), numpy>=1.26, torch>=2.2

### Community 18 - "shared/tests/harness.mjs"
Cohesion: 0.12
Nodes (15): { check, note }, runFiles, said, TMP, { check, eq, note }, clean(), runFiles, said (+7 more)

### Community 20 - "track.mjs"
Cohesion: 0.16
Nodes (25): u8(), overlappingParts(), partTriangles(), partVoxels(), voxelCache, voxelKey(), worldTriangles(), loadTrackInfo() (+17 more)

### Community 21 - "check_track.mjs"
Cohesion: 0.25
Nodes (4): args, checkpoint, driven, positional

### Community 22 - "test_5_corridor_sim.mjs"
Cohesion: 0.16
Nodes (13): AIR_GUARD, along(), buildCorridor(), cross(), MARGIN, MAX_ROOM, roomBeside(), SPACING (+5 more)

### Community 23 - "memory_test.mjs"
Cohesion: 0.13
Nodes (13): check(), crash, doomedFrom, edges, far, first, log, memory (+5 more)

### Community 27 - "recording.mjs"
Cohesion: 0.15
Nodes (17): { check, note }, CLAIMS, attempt(), ladder, prepare(), samePrefix(), snapshot(), { check, eq, note } (+9 more)

### Community 28 - "search_rollout.mjs"
Cohesion: 0.13
Nodes (15): alter(), args, exported, name, opt, passes, randInt(), rng (+7 more)

### Community 30 - "test_worker.mjs"
Cohesion: 0.33
Nodes (8): ask(), before(), { check, eq, note }, inputs, lap0, replay(), searchSection(), valid()

### Community 32 - "stitch_laps.mjs"
Cohesion: 0.06
Nodes (25): acceptCost, args, attempts, bestOf, checkMs, finishMode, followOptions, free (+17 more)

### Community 33 - "beam.mjs"
Cohesion: 0.08
Nodes (26): alongBin, args, ask(), BEAM, elapsed(), elite, incumbent, latBin (+18 more)

### Community 34 - "observation.mjs"
Cohesion: 0.08
Nodes (24): LOOKAHEAD_POINTS, OBS_CONTACT, OBS_CURVATURE, OBS_EDGE_AHEAD, OBS_EDGE_NOW, OBS_FLIGHT, OBS_FRACTION, OBS_FRAME (+16 more)

### Community 35 - "policy.mjs"
Cohesion: 0.11
Nodes (22): Files, [actorFile, obsFile, outFile, size], all, bytes, obsSize, out, policy, forward() (+14 more)

### Community 36 - "explore.mjs"
Cohesion: 0.07
Nodes (33): archive, args, attempt(), BACK, BACK_MIN, cellKey(), chooseCell(), file (+25 more)

### Community 37 - "fit_car.mjs"
Cohesion: 0.09
Nodes (21): accelRun, accelW, binBySpeed(), brake, brakeRun, coast, coastRun, entries (+13 more)

### Community 38 - "search_human.mjs"
Cohesion: 0.09
Nodes (17): args, best, opt, outDir, OWN, passes, seconds, sectionTicks (+9 more)

### Community 39 - "g2-2-track-generator/smoke_test.mjs"
Cohesion: 0.08
Nodes (24): attempt(), DRIVER_DEFAULTS, driveTrack(), dir, failed, files, [shard, shards], started (+16 more)

### Community 40 - "createRng"
Cohesion: 0.18
Nodes (11): args, opt, policy, settings, track, alternatives(), DEFAULTS, driveLap() (+3 more)

### Community 41 - "IqnServers"
Cohesion: 0.07
Nodes (15): Changed after independent testing, Changes needed elsewhere, Design, and why, Files, g1-6: off-policy distributional learner, rewarded for progress only, How to run, Not done or not tested, What a full run would cost (+7 more)

### Community 42 - "route.mjs"
Cohesion: 0.29
Nodes (13): buildRoute(), flights(), runStage(), cross(), dist(), dot(), finishRoute(), gateStages() (+5 more)

### Community 43 - "check_pieces.mjs"
Cohesion: 0.14
Nodes (12): count, firstSeed, LENGTHS, started, used, worst, checkOfficial(), matePorts() (+4 more)

### Community 44 - "analyze.mjs"
Cohesion: 0.25
Nodes (6): BACK_EDGES, BUDGETS, dir, groups, restarts, runs

### Community 45 - "progress"
Cohesion: 0.04
Nodes (42): clean(), 1. What to rank by (`calibrate.mjs`), 2. The beam on one stretch, three rankings, 3. Against the 21.907 s lap (`from=runs/rollout_desert4.json`), 4. Checks, A full run: cost and what it might gain, Changes needed elsewhere, g1-4: beam search over block decisions (+34 more)

### Community 46 - "ref_node_fs"
Cohesion: 0.09
Nodes (37): { check }, CACHE, humanTrace(), BLOCK_SLICES, BLOCK_TICKS, controlsOf(), decisionsToKeys(), humanLaps() (+29 more)

### Community 47 - "test_3_under_road_sim.mjs"
Cohesion: 0.13
Nodes (19): RIDE_HEIGHT, check(), fmt(), known(), median(), near(), percentile(), section() (+11 more)

### Community 48 - "refine.mjs"
Cohesion: 0.06
Nodes (45): better(), copy(), listFlips(), makePlane(), MOVABLE, nudge(), openSims(), parseArgs() (+37 more)

### Community 49 - "generate.mjs"
Cohesion: 0.29
Nodes (14): add(), buildRoute(), CHAIN_IDS, dot(), generateTrack(), leftOf(), loadTraversals(), outward() (+6 more)

### Community 50 - "racing_env.mjs"
Cohesion: 0.11
Nodes (17): freshAfter, history, m, marked, tracks, controlsKey(), controlsToAction(), dot() (+9 more)

### Community 51 - "validate.mjs"
Cohesion: 0.10
Nodes (19): EVERY, createObserver(), createTracker(), DEFAULTS, CACHE, ROUTE_VERSION, routeFor(), g2-1 tests (+11 more)

### Community 52 - "test_agent.py"
Cohesion: 0.10
Nodes (7): MemoryAgent, ppo_loss(), session_advantages(), write_actor(), How to run, rel(), slow_reference()

### Community 53 - "test_policy_rollout.mjs"
Cohesion: 0.11
Nodes (21): seed(), a, marks, policy, t(), policy, seeds, t0 (+13 more)

### Community 54 - "g2-3-explore-and-adapt/tests/test_logic.mjs"
Cohesion: 0.08
Nodes (21): check(), finish(), same(), BUDGETS, CELL_LENGTH, CELL_WIDTH, cellKey, GAIN (+13 more)

### Community 55 - "plot_dump.mjs"
Cohesion: 0.19
Nodes (9): info, nodes, route, surface, buildSurface(), near(), CellMap, EDGE_CAP (+1 more)

### Community 56 - "calibrate.mjs"
Cohesion: 0.18
Nodes (9): args, HORIZONS, N, opt, rng, starts, states, t0 (+1 more)

### Community 57 - "SimSession"
Cohesion: 0.13
Nodes (11): CAR_TICK_BUDGET, same(), SimSession, at3000, at4000, { check, eq, throws, note }, LEFT, motionA (+3 more)

### Community 58 - "g1-4-beam-search/child.mjs"
Cohesion: 0.20
Nodes (10): candidates(), canonical(), dot(), ensureCar(), features(), freshStart(), handlers, nodes (+2 more)

### Community 59 - "loadTrack"
Cohesion: 0.10
Nodes (21): { check, note }, clean(), counts, filesOf(), NAMES, read(), recheck(), said (+13 more)

### Community 60 - "g2-3-explore-and-adapt/tests/run_tests.mjs"
Cohesion: 0.33
Nodes (3): ROOT, STAGES, t0

### Community 61 - "test_train_toy.py"
Cohesion: 0.09
Nodes (4): check(), finish(), replica(), Spy

### Community 62 - "test_follow.mjs"
Cohesion: 0.25
Nodes (5): FOLLOW_DEFAULTS, { check, eq, throws, note }, knockedOff(), OFF, track

### Community 63 - "trace.mjs"
Cohesion: 0.12
Nodes (17): corrections(), donorKeys(), follow(), recordPath(), spinBetween(), [i,j,k], [name, join, opts='{}', every='5'], paths (+9 more)

### Community 64 - "paths.mjs"
Cohesion: 0.20
Nodes (22): carState(), compare(), NONE, angleBetween(), crossings(), locate(), mismatch(), MISMATCH_WEIGHTS (+14 more)

### Community 65 - "state.mjs"
Cohesion: 0.31
Nodes (6): drive(), prepare(), nextFlipAfter(), STATE_BYTES, stateFinished(), stateFrames()

### Community 66 - "test_lib.mjs"
Cohesion: 0.21
Nodes (15): copiesToTest(), DEFAULTS, ID, parseArgs(), parseAttempt(), parseSearchLog(), pickCopy(), resultsText() (+7 more)

### Community 67 - "g1-5: fine key timing (1 ms)"
Cohesion: 0.17
Nodes (11): Changes needed elsewhere, Cost of a full run, Files, g1-5: fine key timing (1 ms), How to run, Not done, not tested, Smoke test 1: searched lap, flips from 18.0 s to the finish, Smoke test 2: best human lap, flips from 17.75 s to the finish (+3 more)

### Community 68 - ".create"
Cohesion: 0.18
Nodes (8): Changes needed elsewhere, g1-3-search-train-rounds — imitation examples from several laps, g1-3-search-train-rounds — search_round.sh is not safe to rerun after an interruption, g2-2-track-generator — loadTrack cannot take a track that is not in data/ or vendor/, g2-4-lookahead-driving — a lookahead driver others can call; RacingEnv speed, orchestrator — duplication found in phase 2 that nobody reported, Requests to the orchestrator, makeRng()

### Community 69 - "pretrain_bc.py"
Cohesion: 0.12
Nodes (4): EnvServer, collect(), losses(), main()

### Community 70 - "test_3_testpad_sim.mjs"
Cohesion: 0.21
Nodes (10): fill(), loadCarModel(), car, tracks, buildPad(), PLATE_CELLS, PLATE_UNITS, pad (+2 more)

### Community 71 - "progress.mjs"
Cohesion: 0.33
Nodes (9): describe(), dot(), fence(), locate(), nearest(), sub(), WINDOW, roomBeside() (+1 more)

### Community 72 - "test_driver.mjs"
Cohesion: 0.08
Nodes (24): build(), changed, ckpts, COPIES, D, driveOne(), drives, fin() (+16 more)

### Community 73 - "attempts.mjs"
Cohesion: 0.15
Nodes (11): args, report, rng, rows, started, MEMORY_DEFAULTS, MEMORY_OBS_SIZE, MEM_SIZE (+3 more)

### Community 74 - "rollout_child.mjs"
Cohesion: 0.27
Nodes (6): decide(), GROUPS, layerTanh(), prefix, prepare(), scoresFor()

### Community 75 - "g1-1: search from the human's lap"
Cohesion: 0.22
Nodes (8): Changes needed elsewhere, g1-1: search from the human's lap, How to run, Not done, not tested, The idea, What a longer run would probably do, What happens to the rest of the lap (the open problem), What was tested, with numbers

### Community 76 - "Modules"
Cohesion: 0.13
Nodes (10): What was verified, `block_rollout.mjs` — rollouts in the training environment (needs a reference lap), `laps.mjs` — laps in one form, and conversions (no simulator), Modules, `policy.mjs` — a block policy and its value estimate in Node, Shared code contract, `sim_session.mjs` — save-state rollouts on the bare simulator (no reference lap), `track_info.mjs` — geometry and reference-free progress (+2 more)

### Community 77 - "Tests of g1-2 (stitch a lap from several human laps)"
Cohesion: 0.25
Nodes (7): trace(), renewCar(), Headline claim, Not covered, and why, Other claims in the README, Tests of g1-2 (stitch a lap from several human laps), source()

### Community 78 - "Env"
Cohesion: 0.16
Nodes (7): Acceptance tests, Driving and watching a lap, Layout, Polytrack-ML, Setup, track, Env

### Community 79 - "toy_probe.py"
Cohesion: 0.32
Nodes (3): myopic(), p_through(), play()

### Community 80 - "test_4_sim.mjs"
Cohesion: 0.08
Nodes (27): check(), fmt(), near(), section(), decodeParts(), detectorBox(), gatesOf(), meshOf() (+19 more)

### Community 81 - "test_sim_b.mjs"
Cohesion: 0.12
Nodes (18): check(), finish(), same(), ROOT, saved, TMP, invariants(), keys (+10 more)

### Community 82 - "test_6_scripts_sim.mjs"
Cohesion: 0.14
Nodes (18): GRAVITY, check(), fmt(), known(), median(), near(), percentile(), section() (+10 more)

### Community 83 - "test_restart.mjs"
Cohesion: 0.12
Nodes (18): ALL, BASES, check(), COPIES, cutLog, expect(), fullLog, fullText (+10 more)

### Community 84 - "Brief for the idea agents"
Cohesion: 0.33
Nodes (5): Brief for the idea agents, Find your way around, Rules, The project, What to deliver

### Community 85 - "raceline.mjs"
Cohesion: 0.22
Nodes (18): speedFor(), curvature(), dot(), optimiseLine(), optimiseTime(), shiftedPoints(), speedProfile(), sub() (+10 more)

### Community 86 - "g1-2: stitch a lap from the fastest sections of several human laps"
Cohesion: 0.20
Nodes (9): g1-2: stitch a lap from the fastest sections of several human laps, How it works, How often a join survives, Not done, not tested, Section times and the theoretical best, Stitched laps, The cost of repair, What a full run would cost (+1 more)

### Community 90 - "g2-4-lookahead-driving/tests/test_logic.mjs"
Cohesion: 0.17
Nodes (8): dead, L, R, run(), S, replayToy(), ToyEnv, toyPolicy

### Community 91 - "test_logs.mjs"
Cohesion: 0.16
Nodes (19): cost(), early, finishedPlain, lazy, long, of(), one(), pair() (+11 more)

### Community 92 - "test_memory_env.mjs"
Cohesion: 0.13
Nodes (14): check(), finish(), known(), attempt(), draw, edgesNow(), expectedLengths, lengths (+6 more)

### Community 93 - "trainPlan"
Cohesion: 0.13
Nodes (16): chooseExamples(), concludeRound(), trainPlan(), Changed after independent testing, Changes needed elsewhere, Cost of a full run, g1-3: unattended rounds of "search, train toward the searched lap, search again", Run it (+8 more)

### Community 94 - "test_attempts.mjs"
Cohesion: 0.17
Nodes (7): a, b, crashed, expected, printed, ROOT, table

### Community 95 - "codec.mjs"
Cohesion: 0.40
Nodes (7): deflate(), encodeExportString(), encodeSaveString(), partsToBytes(), wrap(), withHole(), loadPartConfigs()

### Community 96 - "replica_check.mjs"
Cohesion: 0.11
Nodes (17): check(), failed, finish(), passed, same(), throws(), actions, dump (+9 more)

### Community 97 - "test_track_memory.mjs"
Cohesion: 0.18
Nodes (8): same(), closeTo(), near(), BIN, clip(), DOOM_MS, GLOBALS, PER_POINT

### Community 99 - "test_python.mjs"
Cohesion: 0.20
Nodes (11): check(), failed, finish(), passed, same(), throws(), PROJECT, SCRIPTS (+3 more)

### Community 100 - "pieces.mjs"
Cohesion: 0.26
Nodes (12): cross(), derivePorts(), key(), onGridPlane(), sub(), worldPorts(), The grass, What is covered (+4 more)

### Community 101 - "test_lock.mjs"
Cohesion: 0.19
Nodes (10): stateOf(), before, clean(), DRIVER, launch(), lockFile(), PROJECT, TAGS (+2 more)

### Community 102 - "run_all_tests.mjs"
Cohesion: 0.17
Nodes (11): folders, IDEAS, killTree(), LOGS, results, ROOT, runFolder(), t0 (+3 more)

### Community 103 - "smoke_real.mjs"
Cohesion: 0.21
Nodes (11): IDEA_DIR, at(), cleanUp(), keep, launch(), ours(), p, PROJECT (+3 more)

### Community 104 - "g1-7: a computed racing line"
Cohesion: 0.17
Nodes (11): 1. The fitted car (flat pad, `car_model.json`), 2. The corridor, 3. The line and the speed profile, 4. Against the human lap (desert4, 21.750 s), Changes needed elsewhere, Cost of a full run, g1-7: a computed racing line, How to run (from the project root) (+3 more)

### Community 105 - "test_1_raceline.mjs"
Cohesion: 0.24
Nodes (5): TOLERANCE, cross(), makeCorridor(), unit(), UP

### Community 106 - "g2-1: inputs that need no human lap"
Cohesion: 0.18
Nodes (10): Cost of a full run, g2-1: inputs that need no human lap, How the route is found, How to run, Not done, not tested, Result in short, Smoke tests, The files (+2 more)

### Community 107 - "TrackMemory"
Cohesion: 0.29
Nodes (4): 5. Speed, memory, tick budget, filled(), What is covered, TrackMemory

### Community 108 - "test_beam.mjs"
Cohesion: 0.16
Nodes (13): a, b, BEAM, c, d, e, f, files() (+5 more)

### Community 109 - "compare_human.mjs"
Cohesion: 0.20
Nodes (5): car, human, kappaHuman, out, [track = 'desert4', lapIndex = '0']

### Community 110 - "Twelve ideas: what came out"
Cohesion: 0.18
Nodes (10): Goal 1: beat the human lap on one track, Goal 2: a generalist for any track, Overnight results, 10 October 2026 (added by the main session), Results first, Shared code, Tests, The ideas, Twelve ideas: what came out (+2 more)

### Community 111 - "key_usage.mjs"
Cohesion: 0.13
Nodes (12): h, hu, human, humanKeys, LENGTH, line, [name, run, stretchesArg = '16', lengthArg = '15'], o (+4 more)

### Community 112 - "g1-4 beam search: independent tests"
Cohesion: 0.24
Nodes (9): prune(), same(), ranks(), spearman(), Defects found, Did the README's claims hold?, g1-4 beam search: independent tests, What is covered (+1 more)

### Community 113 - "g2-5-memory-policy/tests/run_tests.mjs"
Cohesion: 0.25
Nodes (3): ROOT, STAGES, t0

### Community 114 - "g1-3-search-train-rounds/tests/run_tests.mjs"
Cohesion: 0.38
Nodes (5): HERE, PROJECT, t0, KNOWN, TESTS

### Community 115 - "g1-4-beam-search/tests/run_tests.mjs"
Cohesion: 0.38
Nodes (5): HERE, PROJECT, t0, KNOWN, TESTS

### Community 116 - ".load"
Cohesion: 0.29
Nodes (7): Changes needed elsewhere, restore(), Defects found, Defects found, Tests of g1-5 (fine key timing), tester (shared, g1-1, g1-2, g1-5) — SimSession.load() fixed; two smaller fixes in shared, Was anyone affected by defect 1?

### Community 117 - "g1-6-offpolicy-rl/tests/run_tests.mjs"
Cohesion: 0.38
Nodes (5): HERE, PROJECT, t0, KNOWN, TESTS

### Community 118 - "MemoryEnv"
Cohesion: 0.24
Nodes (4): MemoryEnv, Not done, not tested, What is remembered, exactly, Not covered, and why

### Community 119 - "ref_node_child_process"
Cohesion: 0.15
Nodes (10): failures, files, here, root, started, failures, files, here (+2 more)

### Community 120 - "g2-1-reference-free-inputs/tests/run_tests.mjs"
Cohesion: 0.33
Nodes (5): failures, files, here, root, started

### Community 121 - "compare_sections.mjs"
Cohesion: 0.17
Nodes (10): h, human, line, [name = 'summer1', run = 'tuned', sectionsArg = '24'], o, rows, SECTIONS, total (+2 more)

### Community 122 - "watch_ghost.mjs"
Cohesion: 0.18
Nodes (6): HASHES, args, checkOnly, [name = 'summer1', run = 'baseline'], recordValue, trackId

### Community 123 - "shared/pool.mjs"
Cohesion: 0.50
Nodes (3): createPool(), { check }, timeout

### Community 126 - "g1-4-beam-search/tests/test_child.mjs"
Cohesion: 0.24
Nodes (5): alive, script(), SETUP, targets(), createPool()

### Community 127 - "export_recording.mjs"
Cohesion: 0.22
Nodes (9): decoded, firstMismatch, key(), [name = 'summer1', run = 'baseline'], recording, recordingString, runsDir, track (+1 more)

### Community 128 - "drive_line.mjs"
Cohesion: 0.25
Nodes (7): args, createCar, file, lines, options, settings, [track = 'desert4', which = 'all']

### Community 129 - "test_2_observation_sim.mjs"
Cohesion: 0.32
Nodes (5): info, matrix(), route, toCar(), toWorld()

### Community 130 - "g2-4-lookahead-driving/tests/run_tests.mjs"
Cohesion: 0.33
Nodes (3): ROOT, STAGES, t0

## Knowledge Gaps
- **809 isolated node(s):** `args`, `opt`, `seconds`, `workers`, `passes` (+804 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1213 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RacingEnv` connect `RacingEnv` to `ladder_test.mjs`, `decodeState`, `iqn_server.mjs`, `Changes needed elsewhere`, `explore.mjs`, `IqnServers`, `progress`, `racing_env.mjs`, `test_agent.py`, `test_policy_rollout.mjs`, `loadTrack`, `paths.mjs`, `.create`, `attempts.mjs`, `rollout_child.mjs`, `replica_check.mjs`, `g2-1: inputs that need no human lap`, `TrackMemory`, `Twelve ideas: what came out`?**
  _High betweenness centrality (0.143) - this node is a cross-community bridge._
- **Why does `Rules for working side by side` connect `loadTrack` to `PolytrackVecEnv`, `pretrain_bc.py`, `Modules`, `ref_node_fs`, `test_policy_rollout.mjs`?**
  _High betweenness centrality (0.093) - this node is a cross-community bridge._
- **Why does `Files` connect `IqnServers` to `RacingEnv`, `test_pure.py`?**
  _High betweenness centrality (0.085) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `loadTrack()` (e.g. with `4. Output, and pointing training at it` and `What is not done or not tested`) actually correct?**
  _`loadTrack()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `Env` (e.g. with `What is not done or not tested` and `Layout`) actually correct?**
  _`Env` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 16 inferred relationships involving `RacingEnv` (e.g. with `5. Speed, memory, tick budget` and `Design, and why`) actually correct?**
  _`RacingEnv` has 16 INFERRED edges - model-reasoned connections that need verification._
- **What connects `args`, `opt`, `seconds` to the rest of the system?**
  _809 weakly-connected nodes found - possible documentation gaps or missing edges._