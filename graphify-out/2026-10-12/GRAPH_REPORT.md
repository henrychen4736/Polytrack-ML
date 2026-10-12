# Graph Report - Polytrack-ML  (2026-10-12)

## Corpus Check
- 427 files · ~372,489 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 42 file(s) not represented in the graph (top: .log 21, .jsonl 15, (none) 4)

## Summary
- 2698 nodes · 5968 edges · 134 communities (124 shown, 10 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 439 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2658bc50`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Lookahead driver (driveLap)
- test_agent.py
- test_3_under_road_sim.mjs
- generate.mjs
- test_pure.py
- laps.mjs
- g1-3-search-train-rounds/README.md
- key_usage.mjs
- PolytrackVecEnv
- test_1_pieces.mjs
- shared/tests/harness.mjs
- explore.mjs
- README.md
- test_logs.mjs
- test_sim_b.mjs
- Route built from track geometry alone
- stitch_laps.mjs
- IqnServers
- ref_node_fs
- search_sections.mjs
- CONTRACT.md
- g1-7 computed racing line README
- rounds.mjs
- SimSession
- env.mjs
- observation.mjs
- track.mjs
- test_driver.mjs
- beam.mjs
- test_beam.mjs
- recording.mjs
- g1-3 independent tests
- section_worker.mjs
- fit_car.mjs
- Changes needed elsewhere
- g2-2-track-generator/smoke_test.mjs
- corridor.mjs
- test_train_toy.py
- search_rollout.mjs
- test_lock.mjs
- train_ppo.py
- g1-6-offpolicy-rl/README.md
- search_human.mjs
- test_5_corridor_sim.mjs
- search_timeline.mjs
- route.mjs
- fetch_laps.mjs
- search_settings.mjs
- diff_capture.mjs
- savestate_test.mjs
- test_restart.mjs
- iqn_server.mjs
- progress
- test_4_sim.mjs
- watch_ghost.mjs
- paths.mjs
- g1-5 independent tests (TESTING.md)
- raceline.mjs
- g2-3-explore-and-adapt/tests/test_logic.mjs
- racing_env.mjs
- smoothness.mjs
- pretrain_bc.py
- test_follow.mjs
- g1-4-beam-search/child.mjs
- export_recording.mjs
- plot_dump.mjs
- memory_test.mjs
- BRIEF.md
- refine.mjs
- test_server.py
- test_lib.mjs
- RacingEnv
- Env
- .load
- ref_node_url
- g1-5 fine key timing README
- replica_check.mjs
- pieces.mjs
- MemoryEnv
- smoke_real.mjs
- Polytrack-ML
- calibrate.mjs
- validate.mjs
- g2-2: random track generator
- ideas/README.md
- compare_sections.mjs
- test_attempts.mjs
- test_track_memory.mjs
- run_all_tests.mjs
- openBlockEnv
- trace.mjs
- route_store.mjs
- g1-5: fine key timing (1 ms)
- g1-2-stitch-human-laps/tests/test_script.mjs
- test_1_raceline.mjs
- g1-7: a computed racing line
- Requests to the orchestrator
- compare_human.mjs
- g2-1: inputs that need no human lap
- test_memory_env.mjs
- worker_entry.mjs
- ladder_test.mjs
- rollout_child.mjs
- test_worker.mjs
- follow.mjs
- g1-2: stitch a lap from the fastest sections of several human laps
- g1-4-beam-search/README.md
- g1-4: beam search over block decisions
- TrackMemory
- g1-1: search from the human's lap
- g1-2-stitch-human-laps/README.md
- sim/drive.mjs
- analyze.mjs
- g2-4: look ahead while driving
- toy_probe.py
- check_track.mjs
- mutate
- progress.mjs
- sectional.mjs
- Twelve ideas: what came out
- test_2_observation_sim.mjs
- g1-5-fine-key-timing/tests/test_child.mjs
- search.mjs
- checker
- hook.mjs
- read_actor
- set3_round2.sh
- finetune_plan.sh
- smoke_test.sh
- eval_block_specialist.sh
- eval_generalist.sh
- train_block_specialist.sh

## God Nodes (most connected - your core abstractions)
1. `RacingEnv` - 55 edges
2. `Env` - 51 edges
3. `loadTrack()` - 50 edges
4. `SimSession` - 33 edges
5. `decodeState()` - 30 edges
6. `humanLaps()` - 28 edges
7. `Lookahead driver (driveLap)` - 28 edges
8. `MemoryEnv` - 25 edges
9. `verifyAndSave()` - 25 edges
10. `generateTrack()` - 23 edges

## Surprising Connections (you probably didn't know these)
- `Coding conventions` --references--> `best()`  [INFERRED]
  CLAUDE.md → ideas/g2-5-memory-policy/tests/test_agent.py
- `Design, and why` --references--> `RacingEnv`  [INFERRED]
  ideas/g1-6-offpolicy-rl/README.md → rl/racing_env.mjs
- `Plain policy on the unseen tracks (baseline)` --references--> `RacingEnv`  [INFERRED]
  ideas/g2-4-lookahead-driving/README.md → rl/racing_env.mjs
- `Shared code` --references--> `RacingEnv`  [INFERRED]
  ideas/README.md → rl/racing_env.mjs
- `Goal 2: a generalist for any track` --references--> `loadTrack()`  [INFERRED]
  ideas/README.md → sim/env.mjs

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Goal 1 search ideas that improve an existing lap** — ideas_g1_1_human_seed_search_readme, ideas_g1_2_stitch_human_laps_readme, ideas_g1_3_search_train_rounds_readme, ideas_g1_4_beam_search_readme, ideas_readme_g1_5_fine_key_timing [EXTRACTED 1.00]
- **Ground-under-the-road trap: progress and finishes credited off the road** — ideas_g2_1_reference_free_inputs_tests_testing_progress_under_raised_road_defect, ideas_g2_2_track_generator_readme_drivable_ground_at_height_0, ideas_g2_2_track_generator_tests_testing_drivetrack_ground_level_false_finish_fix, ideas_g2_2_track_generator_tests_testing_watchlap_road_under_car, ideas_g2_1_reference_free_inputs_tests_testing_under_road_test_on_generated_track [EXTRACTED 1.00]
- **Modules promoted to ideas/shared in phase 2** — ideas_shared_contract_car_model_mjs, ideas_shared_contract_track_build_mjs, ideas_shared_contract_route_progress_mjs, ideas_shared_contract_lookahead_mjs, ideas_shared_contract_lap_paths_mjs, ideas_shared_contract_laps_bc_py [EXTRACTED 1.00]
- **Evidence that only finish time can judge a candidate** — ideas_g1_5_fine_key_timing_readme_short_horizon_unreliable, ideas_g1_5_fine_key_timing_readme_lap_time_not_smooth, ideas_shared_contract_short_lookahead_fact, ideas_shared_contract_verify_mjs [INFERRED 0.85]
- **Defects found by independent testers** — ideas_g1_1_human_seed_search_tests_testing_mutate_window_defect, ideas_g1_2_stitch_human_laps_tests_testing_no_lap_exit_code_defect, ideas_g1_2_stitch_human_laps_tests_testing_simsession_load_defect, ideas_g1_3_search_train_rounds_tests_testing_critic_warmup_defect, ideas_g1_4_beam_search_tests_testing_carbudget_rebuild_loop, ideas_readme_independent_testing [INFERRED 0.85]
- **Independent testers' defect reports across idea folders** — ideas_g1_5_fine_key_timing_tests_testing_defect_smoothness_flips1, ideas_g1_6_offpolicy_rl_tests_testing_defect_eval_lap_replay, ideas_g1_7_computed_racing_line_tests_testing_defect_brake_steering, ideas_shared_tests_testing_defect_simsession_load [INFERRED 0.85]
- **Reference-free generalist pipeline: geometric route, generated tracks, attempt memory** — ideas_g2_1_reference_free_inputs_readme_geometric_route, ideas_g2_1_reference_free_inputs_readme_observation_334, ideas_g2_2_track_generator_readme_chain_generator, ideas_g2_5_memory_policy_readme_track_memory_map, ideas_g2_5_memory_policy_readme_curriculum [INFERRED 0.85]
- **Node environment to Python PPO training pipeline** — sim_env, rl_racing_env, rl_env_server, rl_polytrack_env, rl_train_ppo, rl_evaluate [INFERRED 0.85]
- **Save-state search pattern: branch from a save state, judge by finish time, pass Verify** — ideas_g1_1_human_seed_search_readme_section_search, ideas_g1_2_stitch_human_laps_readme_switch_judging, ideas_g1_4_beam_search_readme_beam_over_block_decisions, ideas_g1_4_beam_search_readme_periodic_rollouts, readme_game_verify [INFERRED 0.85]
- **Three ways to get the generalist round unseen tracks (explore, lookahead, memory)** — ideas_g2_3_explore_and_adapt_readme_explore_loop, ideas_g2_4_lookahead_driving_readme_lookahead_driver, ideas_g2_5_memory_policy_readme_design_b_attempt_conditioned_inputs, ideas_g2_3_explore_and_adapt_readme_unseen_tracks_test_set, ideas_g2_3_explore_and_adapt_readme_ppo_blkgen_best2_generalist [INFERRED 0.85]

## Communities (134 total, 10 thin omitted)

### Community 0 - "Lookahead driver (driveLap)"
Cohesion: 0.07
Nodes (50): Changes needed elsewhere, Cost of a full run, Design questions, and what the logs say, Files, Fine-tune (dry run only), Fine-tune plan (dry run, not executed), g2-3 Explore and adapt, How to run (from the project root) (+42 more)

### Community 1 - "test_agent.py"
Cohesion: 0.07
Nodes (17): MemoryAgent, ppo_loss(), session_advantages(), write_actor(), Changes needed elsewhere, Curriculum, g2-5: a policy with memory of its earlier attempts, How to run (+9 more)

### Community 2 - "test_3_under_road_sim.mjs"
Cohesion: 0.12
Nodes (20): RIDE_HEIGHT, SPACING, check(), fmt(), known(), median(), near(), percentile() (+12 more)

### Community 3 - "generate.mjs"
Cohesion: 0.15
Nodes (28): checkOfficial(), matePorts(), reachable(), ROAD, deflate(), encodeExportString(), encodeSaveString(), partsToBytes() (+20 more)

### Community 4 - "test_pure.py"
Cohesion: 0.06
Nodes (26): export_actor(), quantile_huber_loss(), ReplayBuffer, check(), main(), actor_file_best_action(), check(), loss_by_loops() (+18 more)

### Community 5 - "laps.mjs"
Cohesion: 0.11
Nodes (35): BLOCK_SLICES, BLOCK_TICKS, controlsOf(), decisionsToKeys(), humanLaps(), keysToDecisions(), keysToRecording(), keysToTimeline() (+27 more)

### Community 7 - "key_usage.mjs"
Cohesion: 0.12
Nodes (13): h, hu, human, humanKeys, LENGTH, line, [name, run, stretchesArg = '16', lengthArg = '15'], o (+5 more)

### Community 8 - "PolytrackVecEnv"
Cohesion: 0.05
Nodes (16): _obs(), PolytrackEnv, PolytrackVecEnv, _random_policy_check(), Design in brief, Files, Install, Known limits (+8 more)

### Community 9 - "test_1_pieces.mjs"
Cohesion: 0.08
Nodes (13): check(), fmt(), section(), describe(), GENERATOR_IDS, ROAD, SURFACE, table (+5 more)

### Community 10 - "shared/tests/harness.mjs"
Cohesion: 0.12
Nodes (16): { check, note }, clean(), runFiles, said, TMP, { check, eq, note }, clean(), runFiles (+8 more)

### Community 11 - "explore.mjs"
Cohesion: 0.07
Nodes (33): archive, args, attempt(), BACK, BACK_MIN, cellKey(), chooseCell(), file (+25 more)

### Community 12 - "README.md"
Cohesion: 0.12
Nodes (14): One-off gain from how the car is angled at the finish line, Periodic rollouts to the finish for a real lap time, g1-5 fine key timing, g1-6 off-policy learner, g1-7 computed racing line, Overnight results, 10 October 2026, Block-decision generalist (139/170 seen, 7/30 unseen), Goal 1: a lap faster than the best human lap (+6 more)

### Community 13 - "test_logs.mjs"
Cohesion: 0.07
Nodes (34): check(), finish(), same(), ROOT, saved, TMP, dead, invariants() (+26 more)

### Community 14 - "test_sim_b.mjs"
Cohesion: 0.09
Nodes (28): seed(), args, opt, policy, settings, track, alternatives(), DEFAULTS (+20 more)

### Community 15 - "Route built from track geometry alone"
Cohesion: 0.12
Nodes (18): Missing speed profile from curvature, Changes needed in RacingEnv to use the route reference, Validation of route against fastest human lap on 17 official tracks, g2-1 independent tests (TESTING.md), Observation: route floats 0.5 to 1.1 units off curved surfaces, test_3: g2-1 route on a g2-2 generated track, compare_g21: g2-1 route finder as second opinion, Difficulty as a knob on the piece mix (+10 more)

### Community 16 - "stitch_laps.mjs"
Cohesion: 0.06
Nodes (27): acceptCost, args, attempts, bestOf, checkMs, finishMode, followOptions, free (+19 more)

### Community 17 - "IqnServers"
Cohesion: 0.10
Nodes (8): Files, What was tested, and the numbers, _decode(), IqnServers, Defects found, Did the README's claims hold?, g1-6 off-policy IQN learner: independent tests, What is not covered, and why

### Community 18 - "ref_node_fs"
Cohesion: 0.07
Nodes (34): Files, args, report, rng, rows, started, [actorFile, obsFile, outFile, size], all (+26 more)

### Community 19 - "search_sections.mjs"
Cohesion: 0.08
Nodes (19): args, best, finalString, minScore, mutateOptions, opt, outFile, passes (+11 more)

### Community 20 - "CONTRACT.md"
Cohesion: 0.12
Nodes (21): Blind replay of human keys from an inexact state does not survive (g1-2), Block decision format [steer, steerAt, w, wAt, s, sAt] per 50 ms, block_rollout.mjs (openBlockEnv, fromStart, roll), shared lap_paths.mjs (recordPath, mismatch, follow), shared laps_bc.py (imitation examples from several laps), laps.mjs (laps in one form, conversions), shared lookahead.mjs (driveLap), Generalist checkpoint ppo_blkgen.best2 (trained on 14 tracks) (+13 more)

### Community 21 - "g1-7 computed racing line README"
Cohesion: 0.14
Nodes (24): g1-7 computed racing line README, Where it could pay: tracks with flat braking zones, Fitted car model (car_model.mjs / car_model.json), check_turn_limit.mjs (pad limit vs human laps, ratio 1.00), compare_human.mjs (calibration against the human lap), Result: computed line lap 22.083 s vs human 21.750 s, drive_line.mjs (pure-pursuit tracker driving the line), fit_car.mjs (car experiments on the pad) (+16 more)

### Community 22 - "rounds.mjs"
Cohesion: 0.22
Nodes (30): paths(), resultsText(), seconds(), at(), attemptsOf(), ckptSteps(), createState(), dropLock() (+22 more)

### Community 23 - "SimSession"
Cohesion: 0.13
Nodes (11): mesh(), What was verified, `block_rollout.mjs` — rollouts in the training environment (needs a reference lap), `laps.mjs` — laps in one form, and conversions (no simulator), Modules, `policy.mjs` — a block policy and its value estimate in Node, `sim_session.mjs` — save-state rollouts on the bare simulator (no reference lap), `track_info.mjs` — geometry and reference-free progress (+3 more)

### Community 24 - "env.mjs"
Cohesion: 0.15
Nodes (15): CACHE, What is not done or not tested, CAR_TICK_BUDGET, at3000, at4000, { check, eq, throws, note }, LEFT, motionA (+7 more)

### Community 25 - "observation.mjs"
Cohesion: 0.08
Nodes (22): LOOKAHEAD_POINTS, OBS_CONTACT, OBS_CURVATURE, OBS_EDGE_AHEAD, OBS_EDGE_NOW, OBS_FLIGHT, OBS_FRACTION, OBS_FRAME (+14 more)

### Community 26 - "track.mjs"
Cohesion: 0.13
Nodes (25): partTriangles(), partVoxels(), voxelCache, voxelKey(), worldTriangles(), DATA, decodeCaptured(), loadCaptured() (+17 more)

### Community 27 - "test_driver.mjs"
Cohesion: 0.08
Nodes (24): build(), changed, ckpts, COPIES, D, driveOne(), drives, fin() (+16 more)

### Community 28 - "beam.mjs"
Cohesion: 0.08
Nodes (26): alongBin, args, ask(), BEAM, elapsed(), elite, incumbent, latBin (+18 more)

### Community 29 - "test_beam.mjs"
Cohesion: 0.06
Nodes (29): check(), failed, finish(), passed, same(), throws(), a, b (+21 more)

### Community 30 - "recording.mjs"
Cohesion: 0.16
Nodes (15): { check, note }, CLAIMS, { check }, attempt(), ladder, prepare(), samePrefix(), snapshot() (+7 more)

### Community 31 - "g1-3 independent tests"
Cohesion: 0.10
Nodes (27): chooseExamples(), concludeRound(), parseArgs(), pickCopy(), trainPlan(), Changed after independent testing, Changes needed elsewhere, Cost of a full run (+19 more)

### Community 32 - "section_worker.mjs"
Cohesion: 0.25
Nodes (17): dist2(), drive(), driveTail(), driveTo(), faster(), pos, pose, quat (+9 more)

### Community 33 - "fit_car.mjs"
Cohesion: 0.09
Nodes (21): accelRun, accelW, binBySpeed(), brake, brakeRun, coast, coastRun, entries (+13 more)

### Community 34 - "Changes needed elsewhere"
Cohesion: 0.16
Nodes (9): straight(), Changes needed elsewhere, Changes needed elsewhere, Changes needed elsewhere, actionToControls(), dot(), quatMultiply(), sub() (+1 more)

### Community 35 - "g2-2-track-generator/smoke_test.mjs"
Cohesion: 0.07
Nodes (27): follow(), attempt(), DRIVER_DEFAULTS, driveTrack(), dir, failed, files, [shard, shards] (+19 more)

### Community 36 - "corridor.mjs"
Cohesion: 0.17
Nodes (13): car, tracks, AIR_GUARD, along(), buildCorridor(), cross(), MARGIN, MAX_ROOM (+5 more)

### Community 37 - "test_train_toy.py"
Cohesion: 0.09
Nodes (4): check(), finish(), replica(), Spy

### Community 38 - "search_rollout.mjs"
Cohesion: 0.12
Nodes (15): alter(), args, exported, name, opt, passes, randInt(), rng (+7 more)

### Community 39 - "test_lock.mjs"
Cohesion: 0.11
Nodes (22): IDEA_DIR, check(), failed, finish(), passed, same(), throws(), PROJECT (+14 more)

### Community 40 - "train_ppo.py"
Cohesion: 0.06
Nodes (17): main(), parse_args(), main(), torch>=2.2, Agent, block_imitation_loss(), block_parts(), held_keys() (+9 more)

### Community 41 - "g1-6-offpolicy-rl/README.md"
Cohesion: 0.10
Nodes (23): Changed after independent testing, Changes needed elsewhere, Design, and why, Double Q-learning, dueling head, target network, Full run estimate: 10 to 50 million decisions, g1-6: off-policy distributional learner, rewarded for progress only, How to run, iqn.py (network, quantile Huber loss, actor file) (+15 more)

### Community 42 - "search_human.mjs"
Cohesion: 0.08
Nodes (17): args, best, opt, outDir, OWN, passes, seconds, sectionTicks (+9 more)

### Community 43 - "test_5_corridor_sim.mjs"
Cohesion: 0.12
Nodes (20): check(), fmt(), known(), median(), near(), percentile(), section(), within() (+12 more)

### Community 44 - "search_timeline.mjs"
Cohesion: 0.12
Nodes (13): args, best, finalString, mutateOptions, opt, outFile, rng, runsDir (+5 more)

### Community 45 - "route.mjs"
Cohesion: 0.24
Nodes (15): buildRoute(), flights(), runStage(), cross(), dist(), dot(), finishRoute(), gateStages() (+7 more)

### Community 46 - "fetch_laps.mjs"
Cohesion: 0.15
Nodes (11): allOfficial, amount, args, get(), officialDir, opt, outDir, sleep() (+3 more)

### Community 47 - "search_settings.mjs"
Cohesion: 0.11
Nodes (19): args, bigMoveChance, clamp(), current, extraChance, gaussian(), GLOBALS, mutateSettings() (+11 more)

### Community 48 - "diff_capture.mjs"
Cohesion: 0.17
Nodes (3): byId, cap, ours

### Community 49 - "savestate_test.mjs"
Cohesion: 0.12
Nodes (13): a, b, checks, sha(), checks, finishOf(), hash(), human (+5 more)

### Community 50 - "test_restart.mjs"
Cohesion: 0.12
Nodes (18): ALL, BASES, check(), COPIES, cutLog, expect(), fullLog, fullText (+10 more)

### Community 51 - "iqn_server.mjs"
Cohesion: 0.11
Nodes (28): b64(), begin(), decisionOf(), drive(), evaluate(), greedy(), handle(), HUMAN_DOING (+20 more)

### Community 52 - "progress"
Cohesion: 0.22
Nodes (10): Defects, Not fixed, Observations that are not defects, Defects, g2-4 lookahead driving: independent tests, Not covered, and why, The README's claims, What is covered (+2 more)

### Community 53 - "test_4_sim.mjs"
Cohesion: 0.24
Nodes (16): ROUTE_SPACING, near(), decodeParts(), detectorBox(), gatesOf(), meshOf(), overlappingParts(), dist() (+8 more)

### Community 54 - "watch_ghost.mjs"
Cohesion: 0.07
Nodes (20): devDependencies, playwright-core, name, private, scripts, capture, setup, test (+12 more)

### Community 55 - "paths.mjs"
Cohesion: 0.21
Nodes (21): carState(), compare(), angleBetween(), crossings(), locate(), mismatch(), MISMATCH_WEIGHTS, MOTION_GAP (+13 more)

### Community 56 - "g1-5 independent tests (TESTING.md)"
Cohesion: 0.17
Nodes (17): child.mjs (simulator process: prepare / try, save-state ladder), fine.mjs (nudge, shiftTail, subTick, pool wrapper), subTick() sub-tick lap time estimate, g1-5 independent tests (TESTING.md), Hazard: a child that throws leaves the parent waiting for ever, Check: save-state ladder never starts from a stale state, Position inside the finish tick makes a human lap improvable (g1-1), policy.mjs (loadPolicy, loadValue, createRng) (+9 more)

### Community 57 - "raceline.mjs"
Cohesion: 0.24
Nodes (18): speedFor(), curvature(), dot(), optimiseLine(), optimiseTime(), shiftedPoints(), speedProfile(), sub() (+10 more)

### Community 58 - "g2-3-explore-and-adapt/tests/test_logic.mjs"
Cohesion: 0.08
Nodes (21): check(), finish(), same(), BUDGETS, CELL_LENGTH, CELL_WIDTH, cellKey, GAIN (+13 more)

### Community 59 - "racing_env.mjs"
Cohesion: 0.18
Nodes (16): controlsToAction(), NUM_ACTIONS, OBS_PEDAL_OPEN, RAY_DIRECTIONS, controllerLap(), laps, ticks, createController() (+8 more)

### Community 60 - "smoothness.mjs"
Cohesion: 0.11
Nodes (15): count, from, horizons, inRange, lap, overall, plane, rows (+7 more)

### Community 61 - "pretrain_bc.py"
Cohesion: 0.12
Nodes (4): EnvServer, collect(), losses(), main()

### Community 62 - "test_follow.mjs"
Cohesion: 0.18
Nodes (8): FOLLOW_DEFAULTS, { check, eq, throws, note }, knockedOff(), OFF, track, Tests of g1-2 (independent tester), Headline claim holds: desert4 21.730 s reproduced key for key, Defect (fixed): stitch_laps exited 0 on NO LAP

### Community 63 - "g1-4-beam-search/child.mjs"
Cohesion: 0.21
Nodes (9): candidates(), canonical(), dot(), features(), freshStart(), handlers, nodes, rebuild() (+1 more)

### Community 64 - "export_recording.mjs"
Cohesion: 0.22
Nodes (9): decoded, firstMismatch, key(), [name = 'summer1', run = 'baseline'], recording, recordingString, runsDir, track (+1 more)

### Community 65 - "plot_dump.mjs"
Cohesion: 0.18
Nodes (10): humanTrace(), info, nodes, route, surface, buildSurface(), near(), CellMap (+2 more)

### Community 66 - "memory_test.mjs"
Cohesion: 0.13
Nodes (13): check(), crash, doomedFrom, edges, far, first, log, memory (+5 more)

### Community 67 - "BRIEF.md"
Cohesion: 0.15
Nodes (8): Brief for the idea agents, Deliverables: runnable code plus README per idea, Find your way around, Orchestrator plus twelve idea agents, Rules, ideas/shared and CONTRACT.md (orchestrator-owned), The project, What to deliver

### Community 68 - "refine.mjs"
Cohesion: 0.10
Nodes (32): better(), copy(), listFlips(), makePlane(), MOVABLE, nudge(), openSims(), parseArgs() (+24 more)

### Community 69 - "test_server.py"
Cohesion: 0.12
Nodes (4): IQN, b64(), network(), part()

### Community 70 - "test_lib.mjs"
Cohesion: 0.26
Nodes (10): copiesToTest(), DEFAULTS, ID, parseAttempt(), parseSearchLog(), summariseCopy(), legacyRows(), row() (+2 more)

### Community 71 - "RacingEnv"
Cohesion: 0.26
Nodes (4): Facts that are easy to get wrong, tracks, controlsKey(), RacingEnv

### Community 72 - "Env"
Cohesion: 0.16
Nodes (7): Acceptance tests, Driving and watching a lap, Layout, Polytrack-ML, Setup, Things that were not obvious, Env

### Community 73 - ".load"
Cohesion: 0.43
Nodes (5): Changes needed elsewhere, restore(), snapshot(), Defects found, Was anyone affected by defect 1?

### Community 74 - "ref_node_url"
Cohesion: 0.04
Nodes (39): HERE, PROJECT, t0, KNOWN, TESTS, HERE, PROJECT, t0 (+31 more)

### Community 75 - "g1-5 fine key timing README"
Cohesion: 0.19
Nodes (9): g1-5 fine key timing README, Result: best human lap 21.750 -> 21.722 s, verified, refine.mjs (flip-timing search, verified lap out), Result: searched lap 21.907 s, 0 ms gained, smoothness.mjs (lap time vs one flip's time), Defect: smoothness.mjs flips=1 crashed (0/0 NaN), fixed, Headline claim holds: 21.722 s lap replays and verifies, Lap time is jagged at the millisecond level (g1-5) (+1 more)

### Community 76 - "replica_check.mjs"
Cohesion: 0.11
Nodes (18): check(), failed, finish(), passed, same(), throws(), actions, dump (+10 more)

### Community 77 - "pieces.mjs"
Cohesion: 0.17
Nodes (12): count, firstSeed, LENGTHS, started, used, worst, cross(), derivePorts() (+4 more)

### Community 78 - "MemoryEnv"
Cohesion: 0.22
Nodes (4): MemoryEnv, Not done, not tested, What is remembered, exactly, Not covered, and why

### Community 79 - "smoke_real.mjs"
Cohesion: 0.23
Nodes (10): at(), cleanUp(), keep, launch(), ours(), p, PROJECT, r (+2 more)

### Community 80 - "Polytrack-ML"
Cohesion: 0.14
Nodes (13): Coding conventions, graphify, Hard rules, How the car should be driven (Henry's knowledge of the game), Lessons that cost something to learn, Model history, Polytrack-ML, Status (12 October 2026) (+5 more)

### Community 81 - "calibrate.mjs"
Cohesion: 0.13
Nodes (16): prune(), same(), args, HORIZONS, N, opt, ranks(), rng (+8 more)

### Community 82 - "validate.mjs"
Cohesion: 0.14
Nodes (10): EVERY, args, fresh, jobs, names, perTrack, rank, verdicts (+2 more)

### Community 83 - "g2-2: random track generator"
Cohesion: 0.22
Nodes (9): 1. The piece table, 2. The generator, 3. Is a generated track real?, 4. Output, and pointing training at it, Changes made by the tester, Cost of a full run, Files, g2-2: random track generator (+1 more)

### Community 84 - "ideas/README.md"
Cohesion: 0.20
Nodes (11): g2-1 reference-free inputs, g2-2 track generator, g2-3 explore and adapt, g2-4 lookahead driving, g2-5 memory policy, Results first, Shared code consolidation (promotions, duplicates removed), Defect: progress credited under a raised road (+3 more)

### Community 85 - "compare_sections.mjs"
Cohesion: 0.15
Nodes (11): h, human, line, [name = 'summer1', run = 'tuned', sectionsArg = '24'], o, profile(), rows, SECTIONS (+3 more)

### Community 86 - "test_attempts.mjs"
Cohesion: 0.14
Nodes (11): check(), finish(), known(), same(), a, b, crashed, expected (+3 more)

### Community 87 - "test_track_memory.mjs"
Cohesion: 0.15
Nodes (11): MEMORY_DEFAULTS, MEMORY_OBS_SIZE, closeTo(), near(), BIN, DOOM_MS, GLOBALS, MEM_SIZE (+3 more)

### Community 88 - "run_all_tests.mjs"
Cohesion: 0.17
Nodes (11): folders, IDEAS, killTree(), LOGS, results, ROOT, runFolder(), t0 (+3 more)

### Community 89 - "openBlockEnv"
Cohesion: 0.18
Nodes (11): a, marks, policy, t(), openBlockEnv(), Rules for working side by side, Shared code contract, Units and conventions (+3 more)

### Community 90 - "trace.mjs"
Cohesion: 0.14
Nodes (13): [i,j,k], [name, join, opts='{}', every='5'], paths, t0, { ticks }, trace(), track, renewCar() (+5 more)

### Community 91 - "route_store.mjs"
Cohesion: 0.23
Nodes (10): createObserver(), createTracker(), DEFAULTS, CACHE, ROUTE_VERSION, routeFor(), g2-1 tests, The README's claims (+2 more)

### Community 92 - "g1-5: fine key timing (1 ms)"
Cohesion: 0.18
Nodes (11): Changes needed elsewhere, Cost of a full run, Files, g1-5: fine key timing (1 ms), How to run, Not done, not tested, Smoke test 1: searched lap, flips from 18.0 s to the finish, Smoke test 2: best human lap, flips from 17.75 s to the finish (+3 more)

### Community 93 - "g1-2-stitch-human-laps/tests/test_script.mjs"
Cohesion: 0.22
Nodes (9): { check, note }, clean(), counts, filesOf(), NAMES, read(), recheck(), said (+1 more)

### Community 94 - "test_1_raceline.mjs"
Cohesion: 0.24
Nodes (5): TOLERANCE, cross(), makeCorridor(), unit(), UP

### Community 95 - "g1-7: a computed racing line"
Cohesion: 0.15
Nodes (13): 1. The fitted car (flat pad, `car_model.json`), 2. The corridor, 3. The line and the speed profile, 4. Against the human lap (desert4, 21.750 s), Changes needed elsewhere, Cost of a full run, g1-7: a computed racing line, How to run (from the project root) (+5 more)

### Community 96 - "Requests to the orchestrator"
Cohesion: 0.20
Nodes (8): Changes needed elsewhere, g1-3-search-train-rounds — imitation examples from several laps, g1-3-search-train-rounds — search_round.sh is not safe to rerun after an interruption, g2-2-track-generator — loadTrack cannot take a track that is not in data/ or vendor/, g2-4-lookahead-driving — a lookahead driver others can call; RacingEnv speed, orchestrator — duplication found in phase 2 that nobody reported, Requests to the orchestrator, makeRng()

### Community 97 - "compare_human.mjs"
Cohesion: 0.15
Nodes (11): fill(), GRAVITY, loadCarModel(), car, human, kappaHuman, out, [track = 'desert4', lapIndex = '0'] (+3 more)

### Community 98 - "g2-1: inputs that need no human lap"
Cohesion: 0.20
Nodes (10): Cost of a full run, g2-1: inputs that need no human lap, How the route is found, How to run, Not done, not tested, Result in short, Smoke tests, The files (+2 more)

### Community 99 - "test_memory_env.mjs"
Cohesion: 0.16
Nodes (11): attempt(), draw, edgesNow(), expectedLengths, lengths, OFF, policy, RefMemory (+3 more)

### Community 100 - "worker_entry.mjs"
Cohesion: 0.29
Nodes (6): handleControl(), memories, physicsBytes(), restoreSnapshot(), snapshots, takeSnapshot()

### Community 101 - "ladder_test.mjs"
Cohesion: 0.22
Nodes (9): body(), fractions, human, keys, resetTimes, same(), t0, THROTTLE (+1 more)

### Community 102 - "rollout_child.mjs"
Cohesion: 0.27
Nodes (6): decide(), GROUPS, layerTanh(), prefix, prepare(), scoresFor()

### Community 103 - "test_worker.mjs"
Cohesion: 0.23
Nodes (11): ask(), before(), { check, eq, note }, inputs, lap0, replay(), searchSection(), valid() (+3 more)

### Community 104 - "follow.mjs"
Cohesion: 0.23
Nodes (10): corrections(), donorKeys(), follow(), NONE, joins, [name, ...rest], paths, settings (+2 more)

### Community 105 - "g1-2: stitch a lap from the fastest sections of several human laps"
Cohesion: 0.22
Nodes (9): g1-2: stitch a lap from the fastest sections of several human laps, How it works, How often a join survives, Not done, not tested, Section times and the theoretical best, Stitched laps, The cost of repair, What a full run would cost (+1 more)

### Community 106 - "g1-4-beam-search/README.md"
Cohesion: 0.13
Nodes (13): ensureCar(), Beam of partial laps as save states, extended one 50 ms decision at a time, Rebuild of every node on a new car when the tick budget runs out, Next step: a learned ranking fitted to finish times, Ranking measures (progress, value, look H, lookvalue H), Defects found, Check: the same command gives the same lap, recording and log, Did the README's claims hold? (+5 more)

### Community 107 - "g1-4: beam search over block decisions"
Cohesion: 0.20
Nodes (10): 1. What to rank by (`calibrate.mjs`), 2. The beam on one stretch, three rankings, 3. Against the 21.907 s lap (`from=runs/rollout_desert4.json`), 4. Checks, A full run: cost and what it might gain, Changes needed elsewhere, g1-4: beam search over block decisions, How to run (+2 more)

### Community 108 - "TrackMemory"
Cohesion: 0.29
Nodes (5): 5. Speed, memory, tick budget, filled(), What is covered, clip(), TrackMemory

### Community 110 - "g1-1: search from the human's lap"
Cohesion: 0.25
Nodes (8): Changes needed elsewhere, g1-1: search from the human's lap, How to run, Not done, not tested, The idea, What a longer run would probably do, What happens to the rest of the lap (the open problem), What was tested, with numbers

### Community 111 - "g1-2-stitch-human-laps/README.md"
Cohesion: 0.43
Nodes (4): Best-of-sections theoretical bound (not a close one), Plan: dynamic programming over (boundary, lap) with switch cost, Section boundaries: planes across the road every 250 ms, State mismatch in millisecond-equivalents

### Community 112 - "sim/drive.mjs"
Cohesion: 0.17
Nodes (12): args, createCar, file, lines, options, settings, [track = 'desert4', which = 'all'], options (+4 more)

### Community 113 - "analyze.mjs"
Cohesion: 0.25
Nodes (6): BACK_EDGES, BUDGETS, dir, groups, restarts, runs

### Community 114 - "g2-4: look ahead while driving"
Cohesion: 0.20
Nodes (10): Cost of a full run, Design questions, Files, g2-4: look ahead while driving, How to run, Lookahead driver, defaults (lazy, horizon 40, every 10, backing up), Not done, not tested, Numbers (+2 more)

### Community 115 - "toy_probe.py"
Cohesion: 0.32
Nodes (3): myopic(), p_through(), play()

### Community 116 - "check_track.mjs"
Cohesion: 0.25
Nodes (4): args, checkpoint, driven, positional

### Community 117 - "mutate"
Cohesion: 0.31
Nodes (8): change(), sameBefore(), Defect found (fixed), Headline claims, Other claims in the README, Tests of g1-1 (search from the human's lap), What is covered, mutate()

### Community 118 - "progress.mjs"
Cohesion: 0.39
Nodes (8): describe(), dot(), fence(), locate(), nearest(), sub(), WINDOW, roomBeside()

### Community 119 - "sectional.mjs"
Cohesion: 0.31
Nodes (8): drive(), prepare(), angleBetween(), controlsAt(), heldAt(), nextFlipAfter(), rejoin(), REJOIN_DEFAULTS

### Community 120 - "Twelve ideas: what came out"
Cohesion: 0.29
Nodes (7): Goal 1: beat the human lap on one track, Goal 2: a generalist for any track, Overnight results, 10 October 2026 (added by the main session), Shared code, Tests, The ideas, Twelve ideas: what came out

### Community 121 - "test_2_observation_sim.mjs"
Cohesion: 0.32
Nodes (5): info, matrix(), route, toCar(), toWorld()

### Community 122 - "g1-5-fine-key-timing/tests/test_child.mjs"
Cohesion: 0.29
Nodes (4): { check, eq, note }, inputs, lap, encodeRecording()

### Community 123 - "search.mjs"
Cohesion: 0.33
Nodes (5): countFlips(), createRng(), MUTABLE, MUTATE_DEFAULTS, randInt()

### Community 124 - "checker"
Cohesion: 0.22
Nodes (7): createPool(), checker(), { check }, timeout, { check, eq }, info, state()

### Community 126 - "hook.mjs"
Cohesion: 0.40
Nodes (4): freshAfter, history, m, marked

## Knowledge Gaps
- **12 isolated node(s):** `numpy>=1.26`, `One-off gain from how the car is angled at the finish line`, `Verify is local; no network calls in ideas/`, `Append-only request protocol (missing / bug / offer)`, `Request (g1-3): search_round.sh not safe to rerun after interruption` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1211 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RacingEnv` connect `RacingEnv` to `Lookahead driver (driveLap)`, `test_agent.py`, `explore.mjs`, `test_sim_b.mjs`, `Route built from track geometry alone`, `IqnServers`, `env.mjs`, `Changes needed elsewhere`, `g1-6-offpolicy-rl/README.md`, `iqn_server.mjs`, `progress`, `test_4_sim.mjs`, `paths.mjs`, `racing_env.mjs`, `replica_check.mjs`, `g2-2: random track generator`, `test_track_memory.mjs`, `Requests to the orchestrator`, `g2-1: inputs that need no human lap`, `ladder_test.mjs`, `rollout_child.mjs`, `TrackMemory`, `g2-4: look ahead while driving`, `Twelve ideas: what came out`, `hook.mjs`?**
  _High betweenness centrality (0.109) - this node is a cross-community bridge._
- **Are the 17 inferred relationships involving `RacingEnv` (e.g. with `5. Speed, memory, tick budget` and `Design, and why`) actually correct?**
  _`RacingEnv` has 17 INFERRED edges - model-reasoned connections that need verification._
- **What connects `numpy>=1.26`, `One-off gain from how the car is angled at the finish line`, `Verify is local; no network calls in ideas/` to the rest of the system?**
  _12 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Lookahead driver (driveLap)` be split into smaller, more focused modules?**
  _Cohesion score 0.07161125319693094 - nodes in this community are weakly interconnected._
- **Why does `loadTrack()` connect `env.mjs` to `laps.mjs`, `key_usage.mjs`, `test_1_pieces.mjs`, `shared/tests/harness.mjs`, `test_sim_b.mjs`, `stitch_laps.mjs`, `search_sections.mjs`, `track.mjs`, `recording.mjs`, `section_worker.mjs`, `Changes needed elsewhere`, `corridor.mjs`, `test_5_corridor_sim.mjs`, `search_timeline.mjs`, `fetch_laps.mjs`, `search_settings.mjs`, `savestate_test.mjs`, `watch_ghost.mjs`, `g2-3-explore-and-adapt/tests/test_logic.mjs`, `racing_env.mjs`, `test_follow.mjs`, `export_recording.mjs`, `g2-2: random track generator`, `compare_sections.mjs`, `trace.mjs`, `g1-2-stitch-human-laps/tests/test_script.mjs`, `ladder_test.mjs`, `test_worker.mjs`, `follow.mjs`, `sim/drive.mjs`, `Twelve ideas: what came out`, `g1-5-fine-key-timing/tests/test_child.mjs`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `Env` (e.g. with `What is not done or not tested` and `Layout`) actually correct?**
  _`Env` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `test_agent.py` be split into smaller, more focused modules?**
  _Cohesion score 0.07357357357357357 - nodes in this community are weakly interconnected._