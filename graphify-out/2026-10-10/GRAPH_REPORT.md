# Graph Report - Polytrack-ML  (2026-10-10)

## Corpus Check
- 449 files · ~366,741 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 41 file(s) not represented in the graph (top: .log 21, .jsonl 15, (none) 3)

## Summary
- 2404 nodes · 5261 edges · 126 communities (115 shown, 11 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 391 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6b105105`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- search_sections.mjs
- RacingEnv
- savestate_test.mjs
- PolytrackVecEnv
- search_settings.mjs
- search_timeline.mjs
- host.mjs
- decodeState
- capture_init.mjs
- iqn_server.mjs
- numpy
- test_pure.py
- train_ppo.py
- rounds.mjs
- MemoryEnv
- worker_entry.mjs
- test_beam.mjs
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
- g1-5-fine-key-timing/tests/test_child.mjs
- search_round.sh
- stitch_laps.mjs
- beam.mjs
- observation.mjs
- refine.mjs
- explore.mjs
- fit_car.mjs
- search_human.mjs
- g2-2-track-generator/smoke_test.mjs
- createRng
- IqnServers
- route.mjs
- test_1_pieces.mjs
- analyze.mjs
- progress
- laps.mjs
- ref_node_fs
- smoothness.mjs
- generate.mjs
- racing_env.mjs
- validate.mjs
- test_agent.py
- policy.mjs
- g2-3-explore-and-adapt/tests/test_logic.mjs
- plot_dump.mjs
- calibrate.mjs
- SimSession
- g1-4-beam-search/child.mjs
- g2-2: random track generator
- ref_node_child_process
- test_server.py
- test_follow.mjs
- tune.mjs
- paths.mjs
- env.mjs
- test_lib.mjs
- g1-5: fine key timing (1 ms)
- .create
- g2-2-track-generator/drive.mjs
- test_3_testpad_sim.mjs
- progress.mjs
- test_driver.mjs
- attempts.mjs
- rollout_child.mjs
- g1-1: search from the human's lap
- .create
- trace.mjs
- g1-6: off-policy distributional learner, rewarded for progress only
- toy_probe.py
- test_4_sim.mjs
- test_sim_b.mjs
- test_6_scripts_sim.mjs
- test_restart.mjs
- Brief for the idea agents
- raceline.mjs
- g1-2: stitch a lap from the fastest sections of several human laps
- test_units.py
- finetune_plan.sh
- smoke_test.sh
- g2-4-lookahead-driving/tests/test_logic.mjs
- test_logs.mjs
- test_memory_env.mjs
- trainPlan
- test_attempts.mjs
- test_2_codec.mjs
- replica_check.mjs
- test_track_memory.mjs
- env_server.mjs
- fine.mjs
- g2-2-track-generator — track encoder, piece ports, generated tracks with routes and laps
- test_lock.mjs
- run_all_tests.mjs
- smoke_real.mjs
- g1-7: a computed racing line
- test_1_raceline.mjs
- g2-1: inputs that need no human lap
- TrackMemory
- g1-6-offpolicy-rl/tests/test_author.mjs
- compare_human.mjs
- Twelve ideas: what came out
- ladder_test.mjs
- g1-4 beam search: independent tests
- g2-5-memory-policy/tests/run_tests.mjs
- g1-3-search-train-rounds/tests/run_tests.mjs
- g1-4-beam-search/tests/run_tests.mjs
- subTick
- g1-6-offpolicy-rl/tests/run_tests.mjs
- g1-5-fine-key-timing/tests/test_headline.mjs
- g1-7-computed-racing-line/tests/run_tests.mjs
- g2-1-reference-free-inputs/tests/run_tests.mjs
- g2-2-track-generator/tests/run_tests.mjs
- hook.mjs
- shared/pool.mjs

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
- `Layout` --references--> `Env`  [INFERRED]
  README.md → sim/env.mjs

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Node environment to Python PPO training pipeline** — sim_env, rl_racing_env, rl_env_server, rl_polytrack_env, rl_train_ppo, rl_evaluate [INFERRED 0.85]

## Communities (126 total, 11 thin omitted)

### Community 0 - "search_sections.mjs"
Cohesion: 0.06
Nodes (54): change(), dist2(), drive(), driveTail(), driveTo(), faster(), pos, pose (+46 more)

### Community 1 - "RacingEnv"
Cohesion: 0.20
Nodes (7): straight(), Changes needed elsewhere, Changes needed elsewhere, Facts measured by the idea agents, actionToControls(), RacingEnv, sub()

### Community 2 - "savestate_test.mjs"
Cohesion: 0.09
Nodes (18): Things that were not obvious, a, b, checks, sha(), checks, finishOf(), hash() (+10 more)

### Community 3 - "PolytrackVecEnv"
Cohesion: 0.07
Nodes (11): _obs(), PolytrackVecEnv, Design in brief, Files, Install, Known limits, Multi-track ("generalist") training, rl/: reinforcement learning on the headless simulator (+3 more)

### Community 4 - "search_settings.mjs"
Cohesion: 0.11
Nodes (19): args, bigMoveChance, clamp(), current, extraChance, gaussian(), GLOBALS, mutateSettings() (+11 more)

### Community 5 - "search_timeline.mjs"
Cohesion: 0.09
Nodes (18): Acceptance tests, Driving and watching a lap, Layout, Polytrack-ML, Setup, args, best, finalString (+10 more)

### Community 6 - "host.mjs"
Cohesion: 0.08
Nodes (17): byId, cap, ours, allOfficial, amount, args, get(), officialDir (+9 more)

### Community 7 - "decodeState"
Cohesion: 0.08
Nodes (34): h, human, line, [name = 'summer1', run = 'tuned', sectionsArg = '24'], o, profile(), rows, SECTIONS (+26 more)

### Community 8 - "capture_init.mjs"
Cohesion: 0.10
Nodes (15): devDependencies, playwright-core, name, private, scripts, capture, setup, test (+7 more)

### Community 9 - "iqn_server.mjs"
Cohesion: 0.22
Nodes (17): b64(), begin(), decisionOf(), drive(), evaluate(), greedy(), handle(), HUMAN_DOING (+9 more)

### Community 10 - "numpy"
Cohesion: 0.07
Nodes (3): EnvServer, collect(), main()

### Community 11 - "test_pure.py"
Cohesion: 0.07
Nodes (16): export_actor(), quantile_huber_loss(), check(), main(), ground_truth_trial(), learner_for(), loss_by_hand(), loss_of() (+8 more)

### Community 12 - "train_ppo.py"
Cohesion: 0.07
Nodes (15): main(), losses(), Agent, block_imitation_loss(), block_parts(), held_keys(), imitation_loss(), _layer() (+7 more)

### Community 13 - "rounds.mjs"
Cohesion: 0.22
Nodes (31): paths(), seconds(), alive(), at(), attemptsOf(), ckptSteps(), createState(), dropLock() (+23 more)

### Community 14 - "MemoryEnv"
Cohesion: 0.10
Nodes (14): MemoryEnv, Changes needed elsewhere, Curriculum, g2-5: a policy with memory of its earlier attempts, Not done, not tested, What a full run would cost, What is remembered, exactly, What was verified (+6 more)

### Community 15 - "worker_entry.mjs"
Cohesion: 0.29
Nodes (6): handleControl(), memories, physicsBytes(), restoreSnapshot(), snapshots, takeSnapshot()

### Community 16 - "test_beam.mjs"
Cohesion: 0.06
Nodes (29): check(), failed, finish(), passed, same(), throws(), a, b (+21 more)

### Community 17 - "PolytrackEnv"
Cohesion: 0.12
Nodes (8): main(), parse_args(), PolytrackEnv, _random_policy_check(), rl/requirements.txt (Python 3.10+), gymnasium>=0.29 (optional), numpy>=1.26, torch>=2.2

### Community 18 - "shared/tests/harness.mjs"
Cohesion: 0.08
Nodes (24): { check, note }, runFiles, said, TMP, { check, note }, clean(), counts, filesOf() (+16 more)

### Community 20 - "track.mjs"
Cohesion: 0.17
Nodes (23): overlappingParts(), partTriangles(), partVoxels(), voxelCache, voxelKey(), worldTriangles(), recount(), loadTrackInfo() (+15 more)

### Community 21 - "check_track.mjs"
Cohesion: 0.25
Nodes (4): args, checkpoint, driven, positional

### Community 22 - "test_5_corridor_sim.mjs"
Cohesion: 0.14
Nodes (15): AIR_GUARD, along(), buildCorridor(), cross(), MARGIN, MAX_ROOM, roomBeside(), SPACING (+7 more)

### Community 23 - "memory_test.mjs"
Cohesion: 0.13
Nodes (13): check(), crash, doomedFrom, edges, far, first, log, memory (+5 more)

### Community 27 - "recording.mjs"
Cohesion: 0.14
Nodes (21): { check, note }, CLAIMS, attempt(), ladder, prepare(), samePrefix(), snapshot(), ROOT (+13 more)

### Community 28 - "search_rollout.mjs"
Cohesion: 0.13
Nodes (15): alter(), args, exported, name, opt, passes, randInt(), rng (+7 more)

### Community 30 - "g1-5-fine-key-timing/tests/test_child.mjs"
Cohesion: 0.14
Nodes (16): saveProgress(), ask(), before(), { check, eq, note }, inputs, lap0, replay(), searchSection() (+8 more)

### Community 32 - "stitch_laps.mjs"
Cohesion: 0.06
Nodes (27): acceptCost, args, attempts, bestOf, checkMs, finishMode, followOptions, free (+19 more)

### Community 33 - "beam.mjs"
Cohesion: 0.08
Nodes (26): alongBin, args, ask(), BEAM, elapsed(), elite, incumbent, latBin (+18 more)

### Community 34 - "observation.mjs"
Cohesion: 0.08
Nodes (23): LOOKAHEAD_POINTS, OBS_CONTACT, OBS_CURVATURE, OBS_EDGE_AHEAD, OBS_EDGE_NOW, OBS_FLIGHT, OBS_FRACTION, OBS_FRAME (+15 more)

### Community 35 - "refine.mjs"
Cohesion: 0.12
Nodes (14): accepted, best, bestScore, from, lap, moves, passes, plane (+6 more)

### Community 36 - "explore.mjs"
Cohesion: 0.07
Nodes (35): archive, args, attempt(), BACK, BACK_MIN, cellKey(), chooseCell(), file (+27 more)

### Community 37 - "fit_car.mjs"
Cohesion: 0.09
Nodes (21): accelRun, accelW, binBySpeed(), brake, brakeRun, coast, coastRun, entries (+13 more)

### Community 38 - "search_human.mjs"
Cohesion: 0.09
Nodes (17): args, best, opt, outDir, OWN, passes, seconds, sectionTicks (+9 more)

### Community 39 - "g2-2-track-generator/smoke_test.mjs"
Cohesion: 0.14
Nodes (11): dir, failed, files, [shard, shards], started, saveLap(), loadGenerated(), saveTrack() (+3 more)

### Community 40 - "createRng"
Cohesion: 0.16
Nodes (12): seed(), args, opt, policy, settings, track, alternatives(), DEFAULTS (+4 more)

### Community 41 - "IqnServers"
Cohesion: 0.10
Nodes (8): Files, What was tested, and the numbers, _decode(), IqnServers, Defects found, Did the README's claims hold?, g1-6 off-policy IQN learner: independent tests, What is not covered, and why

### Community 42 - "route.mjs"
Cohesion: 0.21
Nodes (16): buildRoute(), flights(), runStage(), cross(), dist(), dot(), finishRoute(), gateStages() (+8 more)

### Community 43 - "test_1_pieces.mjs"
Cohesion: 0.10
Nodes (24): count, firstSeed, LENGTHS, started, used, worst, checkOfficial(), matePorts() (+16 more)

### Community 44 - "analyze.mjs"
Cohesion: 0.25
Nodes (6): BACK_EDGES, BUDGETS, dir, groups, restarts, runs

### Community 45 - "progress"
Cohesion: 0.04
Nodes (42): clean(), 1. What to rank by (`calibrate.mjs`), 2. The beam on one stretch, three rankings, 3. Against the 21.907 s lap (`from=runs/rollout_desert4.json`), 4. Checks, A full run: cost and what it might gain, Changes needed elsewhere, g1-4: beam search over block decisions (+34 more)

### Community 46 - "laps.mjs"
Cohesion: 0.09
Nodes (40): { check }, BLOCK_SLICES, BLOCK_TICKS, controlsOf(), decisionsToKeys(), humanLaps(), keysToDecisions(), keysToRecording() (+32 more)

### Community 47 - "ref_node_fs"
Cohesion: 0.10
Nodes (24): RIDE_HEIGHT, check(), fmt(), known(), median(), near(), percentile(), section() (+16 more)

### Community 48 - "smoothness.mjs"
Cohesion: 0.11
Nodes (15): count, from, horizons, inRange, lap, overall, plane, rows (+7 more)

### Community 49 - "generate.mjs"
Cohesion: 0.35
Nodes (13): add(), buildRoute(), CHAIN_IDS, dot(), generateTrack(), leftOf(), loadTraversals(), outward() (+5 more)

### Community 50 - "racing_env.mjs"
Cohesion: 0.13
Nodes (14): tracks, controlsKey(), controlsToAction(), dot(), LOOKAHEAD_POINTS, NUM_ACTIONS, OBS_PEDAL_OPEN, OBS_S_HELD (+6 more)

### Community 51 - "validate.mjs"
Cohesion: 0.11
Nodes (18): EVERY, createObserver(), createTracker(), DEFAULTS, CACHE, ROUTE_VERSION, routeFor(), g2-1 tests (+10 more)

### Community 52 - "test_agent.py"
Cohesion: 0.09
Nodes (7): MemoryAgent, ppo_loss(), session_advantages(), write_actor(), How to run, rel(), slow_reference()

### Community 53 - "policy.mjs"
Cohesion: 0.08
Nodes (32): Files, a, marks, policy, policy, seeds, t0, [track = 'winter4', seedList = '10,12', actor = 'rl/checkpoints/ppo_blkgen.best2.actor.bin'] (+24 more)

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
Cohesion: 0.08
Nodes (20): Changes needed elsewhere, restore(), Defects found, Defects found, What was verified, `block_rollout.mjs` — rollouts in the training environment (needs a reference lap), `sim_session.mjs` — save-state rollouts on the bare simulator (no reference lap), tester (shared, g1-1, g1-2, g1-5) — SimSession.load() fixed; two smaller fixes in shared (+12 more)

### Community 58 - "g1-4-beam-search/child.mjs"
Cohesion: 0.18
Nodes (11): candidates(), canonical(), dot(), ensureCar(), features(), freshStart(), handlers, nodes (+3 more)

### Community 59 - "g2-2: random track generator"
Cohesion: 0.20
Nodes (9): 1. The piece table, 2. The generator, 3. Is a generated track real?, 4. Output, and pointing training at it, Changes made by the tester, Cost of a full run, Files, g2-2: random track generator (+1 more)

### Community 60 - "ref_node_child_process"
Cohesion: 0.11
Nodes (9): PROJECT, SCRIPTS, ROOT, STAGES, t0, ROOT, STAGES, t0 (+1 more)

### Community 61 - "test_server.py"
Cohesion: 0.06
Nodes (8): IQN, check(), finish(), b64(), network(), part(), replica(), Spy

### Community 62 - "test_follow.mjs"
Cohesion: 0.23
Nodes (11): carState(), compare(), corrections(), donorKeys(), follow(), FOLLOW_DEFAULTS, NONE, { check, eq, throws, note } (+3 more)

### Community 63 - "tune.mjs"
Cohesion: 0.22
Nodes (8): recordPath(), spinBetween(), joins, [name, ...rest], paths, settings, { ticks }, track

### Community 64 - "paths.mjs"
Cohesion: 0.24
Nodes (17): angleBetween(), crossings(), locate(), mismatch(), MISMATCH_WEIGHTS, MOTION_GAP, planRoute(), sectionTimes() (+9 more)

### Community 65 - "env.mjs"
Cohesion: 0.10
Nodes (18): args, createCar, file, lines, options, settings, [track = 'desert4', which = 'all'], CACHE (+10 more)

### Community 66 - "test_lib.mjs"
Cohesion: 0.13
Nodes (24): chooseExamples(), concludeRound(), copiesToTest(), DEFAULTS, ID, IDEA_DIR, parseArgs(), parseAttempt() (+16 more)

### Community 67 - "g1-5: fine key timing (1 ms)"
Cohesion: 0.17
Nodes (11): Changes needed elsewhere, Cost of a full run, Files, g1-5: fine key timing (1 ms), How to run, Not done, not tested, Smoke test 1: searched lap, flips from 18.0 s to the finish, Smoke test 2: best human lap, flips from 17.75 s to the finish (+3 more)

### Community 68 - ".create"
Cohesion: 0.18
Nodes (8): Changes needed elsewhere, g1-3-search-train-rounds — imitation examples from several laps, g1-3-search-train-rounds — search_round.sh is not safe to rerun after an interruption, g2-2-track-generator — loadTrack cannot take a track that is not in data/ or vendor/, g2-4-lookahead-driving — a lookahead driver others can call; RacingEnv speed, orchestrator — duplication found in phase 2 that nobody reported, Requests to the orchestrator, makeRng()

### Community 69 - "g2-2-track-generator/drive.mjs"
Cohesion: 0.16
Nodes (15): follow(), chainIntact(), attempt(), DRIVER_DEFAULTS, driveTrack(), OFF_ROAD, OFF_SURFACE, routeToLine() (+7 more)

### Community 70 - "test_3_testpad_sim.mjs"
Cohesion: 0.18
Nodes (11): fill(), GRAVITY, loadCarModel(), car, tracks, buildPad(), PLATE_CELLS, PLATE_UNITS (+3 more)

### Community 71 - "progress.mjs"
Cohesion: 0.33
Nodes (9): describe(), dot(), fence(), locate(), nearest(), sub(), WINDOW, roomBeside() (+1 more)

### Community 72 - "test_driver.mjs"
Cohesion: 0.08
Nodes (24): build(), changed, ckpts, COPIES, D, driveOne(), drives, fin() (+16 more)

### Community 73 - "attempts.mjs"
Cohesion: 0.13
Nodes (12): args, report, rng, rows, started, MEMORY_DEFAULTS, MEMORY_OBS_SIZE, [actorFile, criticFile] (+4 more)

### Community 74 - "rollout_child.mjs"
Cohesion: 0.27
Nodes (6): decide(), GROUPS, layerTanh(), prefix, prepare(), scoresFor()

### Community 75 - "g1-1: search from the human's lap"
Cohesion: 0.22
Nodes (8): Changes needed elsewhere, g1-1: search from the human's lap, How to run, Not done, not tested, The idea, What a longer run would probably do, What happens to the rest of the lap (the open problem), What was tested, with numbers

### Community 76 - ".create"
Cohesion: 0.18
Nodes (10): t(), Facts that are easy to get wrong, `laps.mjs` — laps in one form, and conversions (no simulator), Modules, `policy.mjs` — a block policy and its value estimate in Node, Rules for working side by side, Shared code contract, `track_info.mjs` — geometry and reference-free progress (+2 more)

### Community 77 - "trace.mjs"
Cohesion: 0.13
Nodes (13): [i,j,k], [name, join, opts='{}', every='5'], paths, t0, { ticks }, trace(), track, renewCar() (+5 more)

### Community 78 - "g1-6: off-policy distributional learner, rewarded for progress only"
Cohesion: 0.25
Nodes (7): Changed after independent testing, Changes needed elsewhere, Design, and why, g1-6: off-policy distributional learner, rewarded for progress only, How to run, Not done or not tested, What a full run would cost

### Community 79 - "toy_probe.py"
Cohesion: 0.32
Nodes (3): myopic(), p_through(), play()

### Community 80 - "test_4_sim.mjs"
Cohesion: 0.15
Nodes (16): ROUTE_SPACING, check(), near(), section(), decodeParts(), detectorBox(), gatesOf(), meshOf() (+8 more)

### Community 81 - "test_sim_b.mjs"
Cohesion: 0.12
Nodes (17): check(), finish(), same(), ROOT, saved, TMP, invariants(), keys (+9 more)

### Community 82 - "test_6_scripts_sim.mjs"
Cohesion: 0.18
Nodes (14): check(), fmt(), known(), near(), section(), accelAt(), car, crossing() (+6 more)

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

### Community 87 - "test_units.py"
Cohesion: 0.07
Nodes (11): ReplayBuffer, actor_file_best_action(), check(), loss_by_loops(), n_step_one(), test_learning(), test_n_step(), test_network() (+3 more)

### Community 90 - "g2-4-lookahead-driving/tests/test_logic.mjs"
Cohesion: 0.17
Nodes (8): dead, L, R, run(), S, replayToy(), ToyEnv, toyPolicy

### Community 91 - "test_logs.mjs"
Cohesion: 0.16
Nodes (19): cost(), early, finishedPlain, lazy, long, of(), one(), pair() (+11 more)

### Community 92 - "test_memory_env.mjs"
Cohesion: 0.16
Nodes (11): attempt(), draw, edgesNow(), expectedLengths, lengths, OFF, policy, RefMemory (+3 more)

### Community 93 - "trainPlan"
Cohesion: 0.15
Nodes (16): pickCopy(), trainPlan(), Changed after independent testing, Changes needed elsewhere, Cost of a full run, g1-3: unattended rounds of "search, train toward the searched lap, search again", Run it, The decisions, and why (+8 more)

### Community 94 - "test_attempts.mjs"
Cohesion: 0.14
Nodes (11): check(), finish(), known(), same(), a, b, crashed, expected (+3 more)

### Community 95 - "test_2_codec.mjs"
Cohesion: 0.22
Nodes (9): deflate(), encodeExportString(), encodeSaveString(), partsToBytes(), wrap(), keyOf(), sameParts(), withHole() (+1 more)

### Community 96 - "replica_check.mjs"
Cohesion: 0.13
Nodes (11): actions, dump, episodeStartArc, finishTicks, now, obs, reasons, rewards (+3 more)

### Community 97 - "test_track_memory.mjs"
Cohesion: 0.20
Nodes (8): closeTo(), near(), BIN, DOOM_MS, GLOBALS, MEM_SIZE, PER_POINT, POINTS

### Community 98 - "env_server.mjs"
Cohesion: 0.21
Nodes (10): actionRng, b64(), handle(), layerTanh(), loadActor(), options, rollout(), sampleAction() (+2 more)

### Community 99 - "fine.mjs"
Cohesion: 0.30
Nodes (11): better(), copy(), listFlips(), makePlane(), MOVABLE, nudge(), parseArgs(), shiftTail() (+3 more)

### Community 100 - "g2-2-track-generator — track encoder, piece ports, generated tracks with routes and laps"
Cohesion: 0.16
Nodes (13): Defects, Fixed, g2-2 tests, Not fixed, Observations that are not defects, The grass, The README's claims, What is covered (+5 more)

### Community 101 - "test_lock.mjs"
Cohesion: 0.19
Nodes (10): stateOf(), before, clean(), DRIVER, launch(), lockFile(), PROJECT, TAGS (+2 more)

### Community 102 - "run_all_tests.mjs"
Cohesion: 0.17
Nodes (11): folders, IDEAS, killTree(), LOGS, results, ROOT, runFolder(), t0 (+3 more)

### Community 103 - "smoke_real.mjs"
Cohesion: 0.23
Nodes (10): at(), cleanUp(), keep, launch(), ours(), p, PROJECT, r (+2 more)

### Community 104 - "g1-7: a computed racing line"
Cohesion: 0.17
Nodes (11): 1. The fitted car (flat pad, `car_model.json`), 2. The corridor, 3. The line and the speed profile, 4. Against the human lap (desert4, 21.750 s), Changes needed elsewhere, Cost of a full run, g1-7: a computed racing line, How to run (from the project root) (+3 more)

### Community 105 - "test_1_raceline.mjs"
Cohesion: 0.22
Nodes (6): TOLERANCE, within(), cross(), makeCorridor(), unit(), UP

### Community 106 - "g2-1: inputs that need no human lap"
Cohesion: 0.18
Nodes (10): Cost of a full run, g2-1: inputs that need no human lap, How the route is found, How to run, Not done, not tested, Result in short, Smoke tests, The files (+2 more)

### Community 107 - "TrackMemory"
Cohesion: 0.29
Nodes (5): 5. Speed, memory, tick budget, filled(), What is covered, clip(), TrackMemory

### Community 108 - "g1-6-offpolicy-rl/tests/test_author.mjs"
Cohesion: 0.29
Nodes (8): check(), failed, finish(), passed, same(), throws(), PROJECT, SCRIPTS

### Community 109 - "compare_human.mjs"
Cohesion: 0.20
Nodes (5): car, human, kappaHuman, out, [track = 'desert4', lapIndex = '0']

### Community 110 - "Twelve ideas: what came out"
Cohesion: 0.20
Nodes (9): Goal 1: beat the human lap on one track, Goal 2: a generalist for any track, Results first, Shared code, Tests, The ideas, Twelve ideas: what came out, Verified laps under `runs/` (+1 more)

### Community 111 - "ladder_test.mjs"
Cohesion: 0.22
Nodes (9): body(), fractions, human, keys, resetTimes, same(), t0, THROTTLE (+1 more)

### Community 112 - "g1-4 beam search: independent tests"
Cohesion: 0.25
Nodes (8): prune(), same(), ranks(), spearman(), Did the README's claims hold?, g1-4 beam search: independent tests, What is covered, What is not covered, and why

### Community 113 - "g2-5-memory-policy/tests/run_tests.mjs"
Cohesion: 0.25
Nodes (3): ROOT, STAGES, t0

### Community 114 - "g1-3-search-train-rounds/tests/run_tests.mjs"
Cohesion: 0.38
Nodes (5): HERE, PROJECT, t0, KNOWN, TESTS

### Community 115 - "g1-4-beam-search/tests/run_tests.mjs"
Cohesion: 0.38
Nodes (5): HERE, PROJECT, t0, KNOWN, TESTS

### Community 116 - "subTick"
Cohesion: 0.29
Nodes (6): openSims(), subTick(), scoreOf(), Not covered, and why, Other claims in the README, Tests of g1-5 (fine key timing)

### Community 117 - "g1-6-offpolicy-rl/tests/run_tests.mjs"
Cohesion: 0.38
Nodes (5): HERE, PROJECT, t0, KNOWN, TESTS

### Community 119 - "g1-7-computed-racing-line/tests/run_tests.mjs"
Cohesion: 0.33
Nodes (5): failures, files, here, root, started

### Community 120 - "g2-1-reference-free-inputs/tests/run_tests.mjs"
Cohesion: 0.33
Nodes (5): failures, files, here, root, started

### Community 121 - "g2-2-track-generator/tests/run_tests.mjs"
Cohesion: 0.33
Nodes (5): failures, files, here, root, started

### Community 122 - "hook.mjs"
Cohesion: 0.40
Nodes (4): freshAfter, history, m, marked

### Community 123 - "shared/pool.mjs"
Cohesion: 0.50
Nodes (3): createPool(), { check }, timeout

## Knowledge Gaps
- **808 isolated node(s):** `args`, `opt`, `seconds`, `workers`, `passes` (+803 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1212 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RacingEnv` connect `RacingEnv` to `decodeState`, `iqn_server.mjs`, `MemoryEnv`, `explore.mjs`, `IqnServers`, `progress`, `racing_env.mjs`, `test_agent.py`, `policy.mjs`, `g2-2: random track generator`, `paths.mjs`, `env.mjs`, `.create`, `attempts.mjs`, `rollout_child.mjs`, `.create`, `g1-6: off-policy distributional learner, rewarded for progress only`, `replica_check.mjs`, `env_server.mjs`, `g2-1: inputs that need no human lap`, `TrackMemory`, `Twelve ideas: what came out`, `ladder_test.mjs`, `hook.mjs`?**
  _High betweenness centrality (0.140) - this node is a cross-community bridge._
- **Why does `Rules for working side by side` connect `.create` to `numpy`, `PolytrackVecEnv`, `policy.mjs`, `laps.mjs`?**
  _High betweenness centrality (0.093) - this node is a cross-community bridge._
- **Why does `Files` connect `IqnServers` to `RacingEnv`, `test_pure.py`, `g1-6: off-policy distributional learner, rewarded for progress only`?**
  _High betweenness centrality (0.085) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `loadTrack()` (e.g. with `4. Output, and pointing training at it` and `What is not done or not tested`) actually correct?**
  _`loadTrack()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `Env` (e.g. with `What is not done or not tested` and `Layout`) actually correct?**
  _`Env` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 16 inferred relationships involving `RacingEnv` (e.g. with `5. Speed, memory, tick budget` and `Design, and why`) actually correct?**
  _`RacingEnv` has 16 INFERRED edges - model-reasoned connections that need verification._
- **What connects `args`, `opt`, `seconds` to the rest of the system?**
  _808 weakly-connected nodes found - possible documentation gaps or missing edges._