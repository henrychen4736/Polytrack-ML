# Graph Report - Polytrack-ML  (2026-10-16)

## Corpus Check
- 431 files · ~376,042 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 41 file(s) not represented in the graph (top: .log 21, .jsonl 15, (none) 4)

## Summary
- 2738 nodes · 6266 edges · 141 communities (134 shown, 7 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 497 edges (avg confidence: 0.92)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `07e830cd`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Lookahead driver (driveLap)
- session_advantages
- test_3_under_road_sim.mjs
- generate.mjs
- test_pure.py
- laps.mjs
- The models
- racing_env.mjs
- torch
- test_4_sim.mjs
- shared/tests/harness.mjs
- explore.mjs
- ideas/README.md
- loadTrack
- g2-4-lookahead-driving/tests/test_logic.mjs
- Route built from track geometry alone
- stitch_laps.mjs
- main
- attempts.mjs
- createRng
- CONTRACT.md
- g1-7 computed racing line README
- rounds.mjs
- SimSession
- env.mjs
- observation.mjs
- track.mjs
- test_driver.mjs
- beam.mjs
- test_prune.mjs
- test_logs.mjs
- g1-3 independent tests
- section_worker.mjs
- fit_car.mjs
- fine.mjs
- g2-2-track-generator/drive.mjs
- test_5_corridor_sim.mjs
- numpy
- search_rollout.mjs
- ref_node_child_process
- g2-3-explore-and-adapt/README.md
- g1-6-offpolicy-rl/README.md
- search_human.mjs
- test_6_scripts_sim.mjs
- search_timeline.mjs
- route.mjs
- refine.mjs
- search_settings.mjs
- diff_capture.mjs
- PolytrackVecEnv
- test_restart.mjs
- iqn_server.mjs
- progress
- search_sections.mjs
- capture_init.mjs
- paths.mjs
- g1-5 independent tests (TESTING.md)
- compare_human.mjs
- g2-3-explore-and-adapt/tests/test_logic.mjs
- g2-2-track-generator/README.md
- smoothness.mjs
- Polytrack-ML refactor plan
- test_follow.mjs
- g1-4-beam-search/child.mjs
- test_server.py
- plot_dump.mjs
- memory_test.mjs
- BRIEF.md
- recording.mjs
- test_beam.mjs
- g2-2-track-generator/smoke_test.mjs
- RacingEnv
- g2-4: look ahead while driving
- host.mjs
- ref_node_url
- g1-5 fine key timing README
- replica_check.mjs
- test_1_pieces.mjs
- MemoryEnv
- smoke_real.mjs
- Polytrack-ML
- calibrate.mjs
- createPool
- g2-2: random track generator
- check_pieces.mjs
- g2-5-memory-policy/README.md
- test_track_memory.mjs
- .act
- run_all_tests.mjs
- test_policy_rollout.mjs
- trace.mjs
- validate.mjs
- g1-5: fine key timing (1 ms)
- .line
- test_1_raceline.mjs
- g1-7: a computed racing line
- Requests to the orchestrator
- test_3_testpad_sim.mjs
- g2-1: inputs that need no human lap
- test_memory_env.mjs
- worker_entry.mjs
- test_lib.mjs
- The game's own Verify check
- ladder_test.mjs
- tune.mjs
- g1-2: stitch a lap from the fastest sections of several human laps
- g1-4-beam-search/tests/TESTING.md
- g1-4: beam search over block decisions
- TrackMemory
- g1-4-beam-search/README.md
- g1-1: search from the human's lap
- g1-2-stitch-human-laps/README.md
- ref_node_fs
- analyze.mjs
- g1-4-beam-search/tests/run_tests.mjs
- toy_probe.py
- g2-3 Explore and adapt
- rl/: reinforcement learning on the headless simulator
- progress.mjs
- test_2_observation_sim.mjs
- Changes needed elsewhere
- g1-6: off-policy distributional learner, rewarded for progress only
- g2-5-memory-policy/tests/run_tests.mjs
- test_train_toy.py
- bulk_check.mjs
- g1-3-search-train-rounds/tests/run_tests.mjs
- hook.mjs
- g1-6-offpolicy-rl/tests/run_tests.mjs
- set3_round2.sh
- finetune_plan.sh
- smoke_test.sh
- eval_block_specialist.sh
- eval_generalist.sh
- train_block_specialist.sh
- g2-3-explore-and-adapt/tests/run_tests.mjs
- g2-4-lookahead-driving/tests/run_tests.mjs
- g1-4-beam-search/tests/test_child.mjs
- test_sim_session.mjs
- check_track.mjs
- test_sim_b.mjs

## God Nodes (most connected - your core abstractions)
1. `loadTrack()` - 61 edges
2. `RacingEnv` - 58 edges
3. `Env` - 54 edges
4. `decodeState()` - 40 edges
5. `createRng()` - 36 edges
6. `rotate()` - 36 edges
7. `SimSession` - 33 edges
8. `humanLaps()` - 28 edges
9. `Lookahead driver (driveLap)` - 28 edges
10. `verifyAndSave()` - 27 edges

## Surprising Connections (you probably didn't know these)
- `Phase 4 (optional, only with Phase 5 of "What is next"): split `racing_env.mjs`` --references--> `RacingEnv`  [INFERRED]
  docs/refactor/plan.md → rl/racing_env.mjs
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

## Communities (141 total, 7 thin omitted)

### Community 0 - "Lookahead driver (driveLap)"
Cohesion: 0.26
Nodes (20): Generalist checkpoint ppo_blkgen.best2, Lookahead run log main_a (desert3/winter4 seeds, lazy defaults), Lookahead run log main_b (desert3/summer3 seeds, lazy defaults), Lookahead run log saved (verified saved laps winter4, desert3, summer3), Lookahead smoke test log (winter4 seeds 10, 12: 5 of 5 PASS), Specialist desert4 full lookahead, score progress (21.988 s), Specialist desert4 full lookahead, score reward (22.006 s), Specialist desert4 full lookahead, score value (22.042 s) (+12 more)

### Community 1 - "session_advantages"
Cohesion: 0.13
Nodes (15): MemoryAgent, ppo_loss(), session_advantages(), write_actor(), Changes needed elsewhere, g2-5: a policy with memory of its earlier attempts, How to run, What a full run would cost (+7 more)

### Community 2 - "test_3_under_road_sim.mjs"
Cohesion: 0.12
Nodes (20): RIDE_HEIGHT, SPACING, check(), fmt(), known(), median(), near(), percentile() (+12 more)

### Community 3 - "generate.mjs"
Cohesion: 0.29
Nodes (14): add(), buildRoute(), CHAIN_IDS, dot(), generateTrack(), leftOf(), loadTraversals(), outward() (+6 more)

### Community 4 - "test_pure.py"
Cohesion: 0.06
Nodes (19): quantile_huber_loss(), ReplayBuffer, check(), loss_by_loops(), n_step_one(), test_learning(), test_n_step(), test_quantile_loss() (+11 more)

### Community 5 - "laps.mjs"
Cohesion: 0.10
Nodes (36): { check }, BLOCK_SLICES, BLOCK_TICKS, controlsOf(), decisionsToKeys(), humanLaps(), keysToDecisions(), keysToRecording() (+28 more)

### Community 6 - "The models"
Cohesion: 0.09
Nodes (21): 10. `ppo_blk_<track>`: "set 1", specialists from imitation only (6 Oct), 11. `ppo_blkgen`: block generalist (6 to 7 Oct), 12. `ppo_blkgen2`: blocked-lane cost and steering kicks (7 Oct), 13. `ppo_gblk_<track>`: "set 2", specialists from the generalist (7 to 8 Oct), 14. `ppo_g3blk_<track>`: "set 3", rules 1, 2 and 3 (8 Oct), 15. `ppo_sr1_<track>` and `ppo_sr2_<track>`: search, then train (8 to 10 Oct), 16. `g1-6-iqn_desert4`: off-policy learner (10 Oct), 1. `ppo_summer1`: first single-track agent (4 Oct) (+13 more)

### Community 7 - "racing_env.mjs"
Cohesion: 0.06
Nodes (44): controlsToAction(), NUM_ACTIONS, OBS_PEDAL_OPEN, RAY_DIRECTIONS, controllerLap(), laps, ticks, h (+36 more)

### Community 8 - "torch"
Cohesion: 0.06
Nodes (15): main(), parse_args(), main(), EnvServer, PolytrackEnv, collect(), losses(), main() (+7 more)

### Community 9 - "test_4_sim.mjs"
Cohesion: 0.14
Nodes (21): DRIVER_DEFAULTS, check(), fmt(), near(), section(), decodeParts(), detectorBox(), gatesOf() (+13 more)

### Community 10 - "shared/tests/harness.mjs"
Cohesion: 0.08
Nodes (25): { check, note }, clean(), runFiles, said, TMP, { check, note }, clean(), counts (+17 more)

### Community 11 - "explore.mjs"
Cohesion: 0.07
Nodes (33): archive, args, attempt(), BACK, BACK_MIN, cellKey(), chooseCell(), file (+25 more)

### Community 12 - "ideas/README.md"
Cohesion: 0.10
Nodes (22): One-off gain from how the car is angled at the finish line, g1-5 fine key timing, g1-6 off-policy learner, g1-7 computed racing line, g2-1 reference-free inputs, g2-2 track generator, g2-3 explore and adapt, g2-4 lookahead driving (+14 more)

### Community 13 - "loadTrack"
Cohesion: 0.08
Nodes (19): CACHE, humanTrace(), What is not done or not tested, Facts that are easy to get wrong, Rules for working side by side, Shared code contract, `track_info.mjs` — geometry and reference-free progress, Units and conventions (+11 more)

### Community 14 - "g2-4-lookahead-driving/tests/test_logic.mjs"
Cohesion: 0.11
Nodes (15): check(), finish(), same(), ROOT, saved, TMP, dead, invariants() (+7 more)

### Community 15 - "Route built from track geometry alone"
Cohesion: 0.20
Nodes (10): Missing speed profile from curvature, Changes needed in RacingEnv to use the route reference, Validation of route against fastest human lap on 17 official tracks, g2-1 independent tests (TESTING.md), Observation: route floats 0.5 to 1.1 units off curved surfaces, test_3: g2-1 route on a g2-2 generated track, compare_g21: g2-1 route finder as second opinion, Limitation: explore still needs a human reference lap (+2 more)

### Community 16 - "stitch_laps.mjs"
Cohesion: 0.06
Nodes (27): acceptCost, args, attempts, bestOf, checkMs, finishMode, followOptions, free (+19 more)

### Community 17 - "main"
Cohesion: 0.09
Nodes (13): main(), Files, _decode(), IqnServers, check(), main(), Defects found, Did the README's claims hold? (+5 more)

### Community 18 - "attempts.mjs"
Cohesion: 0.14
Nodes (14): args, report, rng, rows, started, MEMORY_DEFAULTS, MEMORY_OBS_SIZE, BIN (+6 more)

### Community 19 - "createRng"
Cohesion: 0.09
Nodes (32): seed(), Files, a, marks, policy, t(), args, opt (+24 more)

### Community 20 - "CONTRACT.md"
Cohesion: 0.11
Nodes (24): ideas/shared and CONTRACT.md (orchestrator-owned), Blind replay of human keys from an inexact state does not survive (g1-2), Block decision format [steer, steerAt, w, wAt, s, sAt] per 50 ms, block_rollout.mjs (openBlockEnv, fromStart, roll), shared lap_paths.mjs (recordPath, mismatch, follow), shared laps_bc.py (imitation examples from several laps), laps.mjs (laps in one form, conversions), shared lookahead.mjs (driveLap) (+16 more)

### Community 21 - "g1-7 computed racing line README"
Cohesion: 0.14
Nodes (24): g1-7 computed racing line README, Where it could pay: tracks with flat braking zones, Fitted car model (car_model.mjs / car_model.json), check_turn_limit.mjs (pad limit vs human laps, ratio 1.00), compare_human.mjs (calibration against the human lap), Result: computed line lap 22.083 s vs human 21.750 s, drive_line.mjs (pure-pursuit tracker driving the line), fit_car.mjs (car experiments on the pad) (+16 more)

### Community 22 - "rounds.mjs"
Cohesion: 0.21
Nodes (32): paths(), resultsText(), seconds(), alive(), at(), attemptsOf(), ckptSteps(), createState() (+24 more)

### Community 23 - "SimSession"
Cohesion: 0.11
Nodes (15): restore(), snapshot(), Defects found, What was verified, `block_rollout.mjs` — rollouts in the training environment (needs a reference lap), `laps.mjs` — laps in one form, and conversions (no simulator), Modules, `policy.mjs` — a block policy and its value estimate in Node (+7 more)

### Community 24 - "env.mjs"
Cohesion: 0.15
Nodes (13): follow(), routeToLine(), unguarded(), Headless PolyTrack 0.6.3 simulator (sim/), prefix, prepare(), CAR_TICK_BUDGET, drive() (+5 more)

### Community 25 - "observation.mjs"
Cohesion: 0.08
Nodes (24): LOOKAHEAD_POINTS, OBS_CONTACT, OBS_CURVATURE, OBS_EDGE_AHEAD, OBS_EDGE_NOW, OBS_FLIGHT, OBS_FRACTION, OBS_FRAME (+16 more)

### Community 26 - "track.mjs"
Cohesion: 0.15
Nodes (26): gateStages(), partTriangles(), partVoxels(), voxelCache, voxelKey(), worldTriangles(), keyOf(), sameParts() (+18 more)

### Community 27 - "test_driver.mjs"
Cohesion: 0.08
Nodes (24): build(), changed, ckpts, COPIES, D, driveOne(), drives, fin() (+16 more)

### Community 28 - "beam.mjs"
Cohesion: 0.08
Nodes (26): alongBin, args, ask(), BEAM, elapsed(), elite, incumbent, latBin (+18 more)

### Community 29 - "test_prune.mjs"
Cohesion: 0.13
Nodes (12): check(), failed, finish(), passed, same(), throws(), a, b (+4 more)

### Community 30 - "test_logs.mjs"
Cohesion: 0.16
Nodes (19): cost(), early, finishedPlain, lazy, long, of(), one(), pair() (+11 more)

### Community 31 - "g1-3 independent tests"
Cohesion: 0.10
Nodes (26): Coding conventions, chooseExamples(), concludeRound(), parseArgs(), pickCopy(), trainPlan(), Changed after independent testing, Changes needed elsewhere (+18 more)

### Community 32 - "section_worker.mjs"
Cohesion: 0.15
Nodes (27): change(), dist2(), drive(), driveTail(), driveTo(), faster(), pos, pose (+19 more)

### Community 33 - "fit_car.mjs"
Cohesion: 0.09
Nodes (21): accelRun, accelW, binBySpeed(), brake, brakeRun, coast, coastRun, entries (+13 more)

### Community 34 - "fine.mjs"
Cohesion: 0.22
Nodes (16): better(), copy(), listFlips(), makePlane(), MOVABLE, nudge(), parseArgs(), shiftTail() (+8 more)

### Community 35 - "g2-2-track-generator/drive.mjs"
Cohesion: 0.17
Nodes (10): attempt(), dir, failed, files, [shard, shards], started, OFF_ROAD, OFF_SURFACE (+2 more)

### Community 36 - "test_5_corridor_sim.mjs"
Cohesion: 0.14
Nodes (15): car, tracks, AIR_GUARD, along(), buildCorridor(), cross(), MARGIN, MAX_ROOM (+7 more)

### Community 37 - "numpy"
Cohesion: 0.06
Nodes (7): Restart logic: each step asks the files what is done, one(), rel(), slow_reference(), net(), run(), _layer()

### Community 38 - "search_rollout.mjs"
Cohesion: 0.12
Nodes (15): alter(), args, exported, name, opt, passes, randInt(), rng (+7 more)

### Community 39 - "ref_node_child_process"
Cohesion: 0.11
Nodes (22): IDEA_DIR, check(), failed, finish(), passed, same(), throws(), PROJECT (+14 more)

### Community 40 - "g2-3-explore-and-adapt/README.md"
Cohesion: 0.20
Nodes (12): Fine-tune plan (dry run, not executed), Plain mode baseline (attempts from the start line), Budget counted in simulated laps, Unseen test tracks: desert3, summer3, winter4, Result: winter4 explore 8 of 8 vs plain 0 of 8, g2-3 independent tests (TESTING.md), Car-replacement path forced by test hook, hook.mjs: RacingEnv instrumentation wrapper for tests (+4 more)

### Community 41 - "g1-6-offpolicy-rl/README.md"
Cohesion: 0.15
Nodes (16): Double Q-learning, dueling head, target network, Full run estimate: 10 to 50 million decisions, iqn.py (network, quantile Huber loss, actor file), iqn_server.mjs (RacingEnv server, epsilon-greedy actor), Linesight (Trackmania IQN agent), Status: no training run done, no lap time, replay.py (ring replay buffer, n-step returns), servers.py (start_rollout / finish_rollout / evaluate) (+8 more)

### Community 42 - "search_human.mjs"
Cohesion: 0.09
Nodes (17): args, best, opt, outDir, OWN, passes, seconds, sectionTicks (+9 more)

### Community 43 - "test_6_scripts_sim.mjs"
Cohesion: 0.15
Nodes (16): check(), known(), median(), near(), percentile(), section(), within(), accelAt() (+8 more)

### Community 44 - "search_timeline.mjs"
Cohesion: 0.07
Nodes (28): saveProgress(), ask(), before(), { check, eq, note }, inputs, lap0, replay(), searchSection() (+20 more)

### Community 45 - "route.mjs"
Cohesion: 0.27
Nodes (13): buildRoute(), flights(), runStage(), cross(), dist(), dot(), finishRoute(), GRAVITY (+5 more)

### Community 46 - "refine.mjs"
Cohesion: 0.12
Nodes (14): accepted, best, bestScore, from, lap, moves, passes, plane (+6 more)

### Community 47 - "search_settings.mjs"
Cohesion: 0.10
Nodes (20): args, bigMoveChance, clamp(), current, extraChance, gaussian(), GLOBALS, mutateSettings() (+12 more)

### Community 48 - "diff_capture.mjs"
Cohesion: 0.17
Nodes (3): byId, cap, ours

### Community 49 - "PolytrackVecEnv"
Cohesion: 0.10
Nodes (8): _obs(), PolytrackVecEnv, _random_policy_check(), main(), save_checkpoint(), write_actor_weights(), parse_args(), replace_with_retry()

### Community 50 - "test_restart.mjs"
Cohesion: 0.12
Nodes (18): ALL, BASES, check(), COPIES, cutLog, expect(), fullLog, fullText (+10 more)

### Community 51 - "iqn_server.mjs"
Cohesion: 0.11
Nodes (26): blockArgs, oldActor, oldSteps, out, rolls, ROOT, server(), strip() (+18 more)

### Community 52 - "progress"
Cohesion: 0.13
Nodes (16): Defects, g2-1 tests, Not fixed, Observations that are not defects, The README's claims, What is covered, What is not covered, and why, Not done, not tested (+8 more)

### Community 53 - "search_sections.mjs"
Cohesion: 0.07
Nodes (23): args, best, finalString, minScore, mutateOptions, opt, outFile, passes (+15 more)

### Community 54 - "capture_init.mjs"
Cohesion: 0.10
Nodes (15): devDependencies, playwright-core, name, private, scripts, capture, setup, test (+7 more)

### Community 55 - "paths.mjs"
Cohesion: 0.21
Nodes (21): carState(), compare(), angleBetween(), crossings(), locate(), mismatch(), MISMATCH_WEIGHTS, MOTION_GAP (+13 more)

### Community 56 - "g1-5 independent tests (TESTING.md)"
Cohesion: 0.16
Nodes (17): child.mjs (simulator process: prepare / try, save-state ladder), fine.mjs (nudge, shiftTail, subTick, pool wrapper), subTick() sub-tick lap time estimate, g1-5 independent tests (TESTING.md), Hazard: a child that throws leaves the parent waiting for ever, Headline claim holds: 21.722 s lap replays and verifies, Check: save-state ladder never starts from a stale state, Position inside the finish tick makes a human lap improvable (g1-1) (+9 more)

### Community 57 - "compare_human.mjs"
Cohesion: 0.14
Nodes (23): speedFor(), car, human, kappaHuman, out, [track = 'desert4', lapIndex = '0'], curvature(), dot() (+15 more)

### Community 58 - "g2-3-explore-and-adapt/tests/test_logic.mjs"
Cohesion: 0.08
Nodes (21): check(), finish(), same(), BUDGETS, CELL_LENGTH, CELL_WIDTH, cellKey, GAIN (+13 more)

### Community 59 - "g2-2-track-generator/README.md"
Cohesion: 0.26
Nodes (9): Difficulty as a knob on the piece mix, Nine smoke checks for a generated track, Finding: official tracks are not reconstructible as piece chains, Generated track output files (track.json, route.json, lap.json), Port mating rule, Track string encoder (codec), g2-2 independent tests (TESTING.md), Fix: driveTrack reported a broken ground-level track as finished (+1 more)

### Community 60 - "smoothness.mjs"
Cohesion: 0.11
Nodes (15): count, from, horizons, inRange, lap, overall, plane, rows (+7 more)

### Community 61 - "Polytrack-ML refactor plan"
Cohesion: 0.16
Nodes (12): Context, Deliberately not changing, Housekeeping (needs Henry's yes), Phase 1: Bug fixes (small, no effect on results), Phase 2: One source for each shared constant (about 30 lines, no effect on results), Phase 3: Deduplication (medium; each step gated by a fixed-seed comparison), Phase 4 (optional, only with Phase 5 of "What is next"): split `racing_env.mjs`, Polytrack-ML refactor plan (+4 more)

### Community 62 - "test_follow.mjs"
Cohesion: 0.22
Nodes (9): corrections(), donorKeys(), follow(), FOLLOW_DEFAULTS, NONE, { check, eq, throws, note }, knockedOff(), OFF (+1 more)

### Community 63 - "g1-4-beam-search/child.mjs"
Cohesion: 0.16
Nodes (12): candidates(), canonical(), dot(), ensureCar(), features(), freshStart(), handlers, nodes (+4 more)

### Community 64 - "test_server.py"
Cohesion: 0.09
Nodes (8): export_actor(), IQN, actor_file_best_action(), test_network(), b64(), greedy_agreement(), network(), part()

### Community 65 - "plot_dump.mjs"
Cohesion: 0.19
Nodes (9): info, nodes, route, surface, buildSurface(), near(), CellMap, EDGE_CAP (+1 more)

### Community 66 - "memory_test.mjs"
Cohesion: 0.13
Nodes (13): check(), crash, doomedFrom, edges, far, first, log, memory (+5 more)

### Community 67 - "BRIEF.md"
Cohesion: 0.17
Nodes (7): Brief for the idea agents, Deliverables: runnable code plus README per idea, Find your way around, Orchestrator plus twelve idea agents, Rules, The project, What to deliver

### Community 68 - "recording.mjs"
Cohesion: 0.12
Nodes (23): { check, note }, CLAIMS, attempt(), ladder, prepare(), samePrefix(), snapshot(), { check, eq, note } (+15 more)

### Community 69 - "test_beam.mjs"
Cohesion: 0.16
Nodes (13): a, b, BEAM, c, d, e, f, files() (+5 more)

### Community 70 - "g2-2-track-generator/smoke_test.mjs"
Cohesion: 0.12
Nodes (13): driveTrack(), saveTrack(), difficulty, rows, started, Defects, Fixed, g2-2 tests (+5 more)

### Community 71 - "RacingEnv"
Cohesion: 0.17
Nodes (8): tracks, actionToControls(), controlsKey(), dot(), quatMultiply(), RacingEnv, sub(), toCarFrame()

### Community 72 - "g2-4: look ahead while driving"
Cohesion: 0.22
Nodes (9): Cost of a full run, Design questions, Files, g2-4: look ahead while driving, How to run, Lookahead driver, defaults (lazy, horizon 40, every 10, backing up), Numbers, Plain policy on the unseen tracks (baseline) (+1 more)

### Community 73 - "host.mjs"
Cohesion: 0.23
Nodes (7): cross(), derivePorts(), key(), onGridPlane(), sub(), DATA, decodeCaptured()

### Community 74 - "ref_node_url"
Cohesion: 0.11
Nodes (15): failures, files, here, root, started, failures, files, here (+7 more)

### Community 75 - "g1-5 fine key timing README"
Cohesion: 0.23
Nodes (7): g1-5 fine key timing README, Result: best human lap 21.750 -> 21.722 s, verified, refine.mjs (flip-timing search, verified lap out), Result: searched lap 21.907 s, 0 ms gained, smoothness.mjs (lap time vs one flip's time), Defect: smoothness.mjs flips=1 crashed (0/0 NaN), fixed, Lap time is jagged at the millisecond level (g1-5)

### Community 76 - "replica_check.mjs"
Cohesion: 0.14
Nodes (10): actions, dump, episodeStartArc, finishTicks, now, obs, reasons, rewards (+2 more)

### Community 77 - "test_1_pieces.mjs"
Cohesion: 0.13
Nodes (11): describe(), GENERATOR_IDS, mesh(), recount(), ROAD, SURFACE, table, TRACKS (+3 more)

### Community 78 - "MemoryEnv"
Cohesion: 0.16
Nodes (4): MemoryEnv, Not done, not tested, What is remembered, exactly, Not covered, and why

### Community 79 - "smoke_real.mjs"
Cohesion: 0.23
Nodes (10): at(), cleanUp(), keep, launch(), ours(), p, PROJECT, r (+2 more)

### Community 80 - "Polytrack-ML"
Cohesion: 0.15
Nodes (12): graphify, Hard rules, How the car should be driven (Henry's knowledge of the game), Lessons that cost something to learn, Model history, Polytrack-ML, Status (12 October 2026), Terms (+4 more)

### Community 81 - "calibrate.mjs"
Cohesion: 0.18
Nodes (9): args, HORIZONS, N, opt, rng, starts, states, t0 (+1 more)

### Community 82 - "createPool"
Cohesion: 0.25
Nodes (7): Not covered: a worker that throws leaves search_human waiting forever, openSims(), Not covered, and why, Shared code consolidation (promotions, duplicates removed), { check }, timeout, createPool()

### Community 83 - "g2-2: random track generator"
Cohesion: 0.20
Nodes (10): 1. The piece table, 2. The generator, 3. Is a generated track real?, 4. Output, and pointing training at it, Changes made by the tester, Changes needed elsewhere, Cost of a full run, Files (+2 more)

### Community 84 - "check_pieces.mjs"
Cohesion: 0.19
Nodes (16): checkOfficial(), matePorts(), reachable(), ROAD, deflate(), encodeExportString(), encodeSaveString(), partsToBytes() (+8 more)

### Community 85 - "g2-5-memory-policy/README.md"
Cohesion: 0.28
Nodes (8): Crash-repeat measurement with attempts.mjs, 3 s doomed window assumption, MemoryAgent warm-started from the generalist, 130 extra memory inputs (482-wide observation), toy_probe: one corner with a hidden speed limit, g2-5 independent tests (TESTING.md), Fix: last observation of an attempt showed that attempt's own memory, Discrepancy: README figures are from seed=2, printed command runs seed 1

### Community 86 - "test_track_memory.mjs"
Cohesion: 0.11
Nodes (12): check(), finish(), same(), a, b, crashed, expected, printed (+4 more)

### Community 87 - ".act"
Cohesion: 0.18
Nodes (4): block_imitation_loss(), block_parts(), held_keys(), imitation_loss()

### Community 88 - "run_all_tests.mjs"
Cohesion: 0.17
Nodes (11): folders, IDEAS, killTree(), LOGS, results, ROOT, runFolder(), t0 (+3 more)

### Community 89 - "test_policy_rollout.mjs"
Cohesion: 0.08
Nodes (36): [actorFile, obsFile, outFile, size], all, bytes, obsSize, out, policy, BLOCK_ENV, [actorFile, criticFile] (+28 more)

### Community 90 - "trace.mjs"
Cohesion: 0.14
Nodes (13): [i,j,k], [name, join, opts='{}', every='5'], paths, t0, { ticks }, trace(), track, renewCar() (+5 more)

### Community 91 - "validate.mjs"
Cohesion: 0.13
Nodes (15): EVERY, createObserver(), createTracker(), DEFAULTS, CACHE, ROUTE_VERSION, routeFor(), args (+7 more)

### Community 92 - "g1-5: fine key timing (1 ms)"
Cohesion: 0.18
Nodes (11): Changes needed elsewhere, Cost of a full run, Files, g1-5: fine key timing (1 ms), How to run, Not done, not tested, Smoke test 1: searched lap, flips from 18.0 s to the finish, Smoke test 2: best human lap, flips from 17.75 s to the finish (+3 more)

### Community 93 - ".line"
Cohesion: 0.25
Nodes (8): check(), failed, finish(), passed, same(), throws(), PROJECT, SCRIPTS

### Community 94 - "test_1_raceline.mjs"
Cohesion: 0.24
Nodes (5): TOLERANCE, cross(), makeCorridor(), unit(), UP

### Community 95 - "g1-7: a computed racing line"
Cohesion: 0.20
Nodes (10): 1. The fitted car (flat pad, `car_model.json`), 2. The corridor, 3. The line and the speed profile, 4. Against the human lap (desert4, 21.750 s), Changes needed elsewhere, Cost of a full run, g1-7: a computed racing line, How to run (from the project root) (+2 more)

### Community 96 - "Requests to the orchestrator"
Cohesion: 0.29
Nodes (6): g1-3-search-train-rounds — imitation examples from several laps, g1-3-search-train-rounds — search_round.sh is not safe to rerun after an interruption, g2-2-track-generator — loadTrack cannot take a track that is not in data/ or vendor/, g2-4-lookahead-driving — a lookahead driver others can call; RacingEnv speed, orchestrator — duplication found in phase 2 that nobody reported, Requests to the orchestrator

### Community 97 - "test_3_testpad_sim.mjs"
Cohesion: 0.21
Nodes (11): fill(), GRAVITY, loadCarModel(), Not done or not tested, buildPad(), PLATE_CELLS, PLATE_UNITS, fmt() (+3 more)

### Community 98 - "g2-1: inputs that need no human lap"
Cohesion: 0.15
Nodes (12): straight(), Changes needed elsewhere, Cost of a full run, g2-1: inputs that need no human lap, How the route is found, How to run, Not done, not tested, Result in short (+4 more)

### Community 99 - "test_memory_env.mjs"
Cohesion: 0.15
Nodes (12): known(), attempt(), draw, edgesNow(), expectedLengths, lengths, OFF, policy (+4 more)

### Community 100 - "worker_entry.mjs"
Cohesion: 0.29
Nodes (6): handleControl(), memories, physicsBytes(), restoreSnapshot(), snapshots, takeSnapshot()

### Community 101 - "test_lib.mjs"
Cohesion: 0.26
Nodes (10): copiesToTest(), DEFAULTS, ID, parseAttempt(), parseSearchLog(), summariseCopy(), legacyRows(), row() (+2 more)

### Community 102 - "The game's own Verify check"
Cohesion: 0.18
Nodes (8): Tests of g1-1 (independent tester), Headline claims, Headline claims confirmed on all four tracks, Other claims in the README, Tests of g1-1 (search from the human's lap), What is covered, Headline claim holds: desert4 21.730 s reproduced key for key, The game's own Verify check

### Community 103 - "ladder_test.mjs"
Cohesion: 0.09
Nodes (21): body(), fractions, human, keys, resetTimes, same(), t0, THROTTLE (+13 more)

### Community 104 - "tune.mjs"
Cohesion: 0.29
Nodes (6): joins, [name, ...rest], paths, settings, { ticks }, track

### Community 105 - "g1-2: stitch a lap from the fastest sections of several human laps"
Cohesion: 0.20
Nodes (10): Changes needed elsewhere, g1-2: stitch a lap from the fastest sections of several human laps, How it works, How often a join survives, Not done, not tested, Section times and the theoretical best, Stitched laps, The cost of repair (+2 more)

### Community 106 - "g1-4-beam-search/tests/TESTING.md"
Cohesion: 0.19
Nodes (13): prune(), same(), ranks(), spearman(), Diversity buckets and per-process share in pruning, Check: the same command gives the same lap, recording and log, Did the README's claims hold?, Note: the elite does not count towards its bucket (+5 more)

### Community 107 - "g1-4: beam search over block decisions"
Cohesion: 0.20
Nodes (10): 1. What to rank by (`calibrate.mjs`), 2. The beam on one stretch, three rankings, 3. Against the 21.907 s lap (`from=runs/rollout_desert4.json`), 4. Checks, A full run: cost and what it might gain, Changes needed elsewhere, g1-4: beam search over block decisions, How to run (+2 more)

### Community 108 - "TrackMemory"
Cohesion: 0.31
Nodes (4): 5. Speed, memory, tick budget, filled(), clip(), TrackMemory

### Community 109 - "g1-4-beam-search/README.md"
Cohesion: 0.39
Nodes (4): Beam of partial laps as save states, extended one 50 ms decision at a time, Next step: a learned ranking fitted to finish times, Periodic rollouts to the finish for a real lap time, Ranking measures (progress, value, look H, lookvalue H)

### Community 110 - "g1-1: search from the human's lap"
Cohesion: 0.25
Nodes (8): Changes needed elsewhere, g1-1: search from the human's lap, How to run, Not done, not tested, The idea, What a longer run would probably do, What happens to the rest of the lap (the open problem), What was tested, with numbers

### Community 111 - "g1-2-stitch-human-laps/README.md"
Cohesion: 0.31
Nodes (6): Best-of-sections theoretical bound (not a close one), Plan: dynamic programming over (boundary, lap) with switch cost, Section boundaries: planes across the road every 250 ms, State mismatch in millisecond-equivalents, Tests of g1-2 (independent tester), Defect (fixed): stitch_laps exited 0 on NO LAP

### Community 112 - "ref_node_fs"
Cohesion: 0.07
Nodes (22): args, createCar, file, lines, options, settings, [track = 'desert4', which = 'all'], allOfficial (+14 more)

### Community 113 - "analyze.mjs"
Cohesion: 0.25
Nodes (6): BACK_EDGES, BUDGETS, dir, groups, restarts, runs

### Community 114 - "g1-4-beam-search/tests/run_tests.mjs"
Cohesion: 0.38
Nodes (5): HERE, PROJECT, t0, KNOWN, TESTS

### Community 115 - "toy_probe.py"
Cohesion: 0.32
Nodes (3): myopic(), p_through(), play()

### Community 116 - "g2-3 Explore and adapt"
Cohesion: 0.22
Nodes (9): Changes needed elsewhere, Cost of a full run, Design questions, and what the logs say, Files, Fine-tune (dry run only), g2-3 Explore and adapt, How to run (from the project root), The test set (+1 more)

### Community 117 - "rl/: reinforcement learning on the headless simulator"
Cohesion: 0.20
Nodes (9): Design in brief, Files, Install, Known limits, Multi-track ("generalist") training, rl/: reinforcement learning on the headless simulator, Use, What was not tested (+1 more)

### Community 118 - "progress.mjs"
Cohesion: 0.39
Nodes (8): describe(), dot(), fence(), locate(), nearest(), sub(), WINDOW, roomBeside()

### Community 119 - "test_2_observation_sim.mjs"
Cohesion: 0.32
Nodes (5): info, matrix(), route, toCar(), toWorld()

### Community 120 - "Changes needed elsewhere"
Cohesion: 0.14
Nodes (11): Changes needed elsewhere, Changes needed elsewhere, Goal 1: beat the human lap on one track, Goal 2: a generalist for any track, Overnight results, 10 October 2026 (added by the main session), Shared code, Tests, The ideas (+3 more)

### Community 121 - "g1-6: off-policy distributional learner, rewarded for progress only"
Cohesion: 0.25
Nodes (8): Changed after independent testing, Changes needed elsewhere, Design, and why, g1-6: off-policy distributional learner, rewarded for progress only, How to run, Not done or not tested, What a full run would cost, What was tested, and the numbers

### Community 122 - "g2-5-memory-policy/tests/run_tests.mjs"
Cohesion: 0.29
Nodes (3): ROOT, STAGES, t0

### Community 123 - "test_train_toy.py"
Cohesion: 0.09
Nodes (5): check(), finish(), replica(), breaks(), Spy

### Community 124 - "bulk_check.mjs"
Cohesion: 0.22
Nodes (7): count, firstSeed, LENGTHS, started, used, worst, part()

### Community 125 - "g1-3-search-train-rounds/tests/run_tests.mjs"
Cohesion: 0.38
Nodes (5): HERE, PROJECT, t0, KNOWN, TESTS

### Community 126 - "hook.mjs"
Cohesion: 0.40
Nodes (4): freshAfter, history, m, marked

### Community 127 - "g1-6-offpolicy-rl/tests/run_tests.mjs"
Cohesion: 0.38
Nodes (5): HERE, PROJECT, t0, KNOWN, TESTS

### Community 135 - "g2-3-explore-and-adapt/tests/run_tests.mjs"
Cohesion: 0.33
Nodes (3): ROOT, STAGES, t0

### Community 136 - "g2-4-lookahead-driving/tests/run_tests.mjs"
Cohesion: 0.33
Nodes (3): ROOT, STAGES, t0

### Community 137 - "g1-4-beam-search/tests/test_child.mjs"
Cohesion: 0.29
Nodes (4): alive, script(), SETUP, targets()

### Community 138 - "test_sim_session.mjs"
Cohesion: 0.25
Nodes (5): at3000, at4000, { check, eq, throws, note }, LEFT, motionA

### Community 139 - "check_track.mjs"
Cohesion: 0.25
Nodes (4): args, checkpoint, driven, positional

### Community 140 - "test_sim_b.mjs"
Cohesion: 0.29
Nodes (6): CLAIMED, inputs, keys, policy, recording, shared

## Knowledge Gaps
- **12 isolated node(s):** `numpy>=1.26`, `One-off gain from how the car is angled at the finish line`, `Verify is local; no network calls in ideas/`, `Append-only request protocol (missing / bug / offer)`, `Request (g1-3): search_round.sh not safe to rerun after interruption` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1229 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RacingEnv` connect `RacingEnv` to `session_advantages`, `racing_env.mjs`, `explore.mjs`, `loadTrack`, `Route built from track geometry alone`, `main`, `attempts.mjs`, `createRng`, `env.mjs`, `g2-3-explore-and-adapt/README.md`, `iqn_server.mjs`, `progress`, `paths.mjs`, `Polytrack-ML refactor plan`, `g2-4: look ahead while driving`, `replica_check.mjs`, `g2-2: random track generator`, `g2-5-memory-policy/README.md`, `test_policy_rollout.mjs`, `Requests to the orchestrator`, `g2-1: inputs that need no human lap`, `ladder_test.mjs`, `TrackMemory`, `Changes needed elsewhere`, `g1-6: off-policy distributional learner, rewarded for progress only`, `hook.mjs`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `loadTrack()` (e.g. with `Phase 3: Deduplication (medium; each step gated by a fixed-seed comparison)` and `Progress (16 October 2026): phases 1 to 3 done, not committed`) actually correct?**
  _`loadTrack()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `numpy>=1.26`, `One-off gain from how the car is angled at the finish line`, `Verify is local; no network calls in ideas/` to the rest of the system?**
  _12 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `session_advantages` be split into smaller, more focused modules?**
  _Cohesion score 0.13405797101449277 - nodes in this community are weakly interconnected._
- **Why does `loadTrack()` connect `loadTrack` to `laps.mjs`, `racing_env.mjs`, `shared/tests/harness.mjs`, `test_sim_session.mjs`, `test_sim_b.mjs`, `stitch_laps.mjs`, `env.mjs`, `track.mjs`, `section_worker.mjs`, `test_5_corridor_sim.mjs`, `test_6_scripts_sim.mjs`, `search_timeline.mjs`, `search_settings.mjs`, `search_sections.mjs`, `g2-3-explore-and-adapt/tests/test_logic.mjs`, `Polytrack-ML refactor plan`, `test_follow.mjs`, `recording.mjs`, `g2-2: random track generator`, `trace.mjs`, `ladder_test.mjs`, `tune.mjs`, `ref_node_fs`, `Changes needed elsewhere`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Are the 19 inferred relationships involving `RacingEnv` (e.g. with `Phase 3: Deduplication (medium; each step gated by a fixed-seed comparison)` and `Phase 4 (optional, only with Phase 5 of "What is next"): split `racing_env.mjs``) actually correct?**
  _`RacingEnv` has 19 INFERRED edges - model-reasoned connections that need verification._
- **Should `test_3_under_road_sim.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.11904761904761904 - nodes in this community are weakly interconnected._