# Graph Report - Polytrack-ML  (2026-10-12)

## Corpus Check
- 427 files · ~373,250 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 42 file(s) not represented in the graph (top: .log 21, .jsonl 15, (none) 4)

## Summary
- 2722 nodes · 6229 edges · 137 communities (130 shown, 7 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 489 edges (avg confidence: 0.92)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2658bc50`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Lookahead driver (driveLap)
- torch
- test_1_route_vs_human_sim.mjs
- generate.mjs
- test_units.py
- laps.mjs
- The models
- ref_node_fs
- PolytrackVecEnv
- test_4_sim.mjs
- shared/tests/harness.mjs
- explore.mjs
- ideas/README.md
- g2-4-lookahead-driving/tests/test_logic.mjs
- test_sim_b.mjs
- Route built from track geometry alone
- stitch_laps.mjs
- main
- policy.mjs
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
- g1-4-beam-search/tests/test_child.mjs
- test_logs.mjs
- g1-3-search-train-rounds/README.md
- section_worker.mjs
- fit_car.mjs
- g2-3-explore-and-adapt/README.md
- test_3_under_road_sim.mjs
- test_5_corridor_sim.mjs
- numpy
- search_rollout.mjs
- ref_node_child_process
- train_ppo.py
- g1-6-offpolicy-rl/README.md
- search_human.mjs
- test_6_scripts_sim.mjs
- search_timeline.mjs
- route.mjs
- fetch_laps.mjs
- search_settings.mjs
- diff_capture.mjs
- savestate_test.mjs
- test_restart.mjs
- iqn_server.mjs
- progress
- g2-2-track-generator — track encoder, piece ports, generated tracks with routes and laps
- capture_init.mjs
- paths.mjs
- g1-5 independent tests (TESTING.md)
- compare_human.mjs
- g2-3-explore-and-adapt/tests/test_logic.mjs
- racing_env.mjs
- smoothness.mjs
- polytrack_env.py
- test_follow.mjs
- g1-4-beam-search/child.mjs
- export_recording.mjs
- plot_dump.mjs
- memory_test.mjs
- Brief for the idea agents
- refine.mjs
- test_pure.py
- pieces.mjs
- RacingEnv
- g2-2-track-generator/README.md
- test_beam.mjs
- ref_node_url
- g1-5 fine key timing README
- replica_check.mjs
- check_pieces.mjs
- MemoryEnv
- smoke_real.mjs
- Polytrack-ML
- calibrate.mjs
- validate.mjs
- .create
- test_2_codec.mjs
- g2-5-memory-policy/README.md
- test_attempts.mjs
- test_track_memory.mjs
- run_all_tests.mjs
- env_server.mjs
- trace.mjs
- route_store.mjs
- g1-5: fine key timing (1 ms)
- g1-6-offpolicy-rl/tests/test_author.mjs
- test_1_raceline.mjs
- g1-7: a computed racing line
- Requests to the orchestrator
- test_3_testpad_sim.mjs
- g2-1: inputs that need no human lap
- test_memory_env.mjs
- worker_entry.mjs
- ladder_test.mjs
- rollout_child.mjs
- g2-3 Explore and adapt
- tune.mjs
- g1-2: stitch a lap from the fastest sections of several human laps
- g1-4-beam-search/tests/TESTING.md
- g1-4: beam search over block decisions
- TrackMemory
- g1-4-beam-search/README.md
- g1-1-human-seed-search/README.md
- g1-2-stitch-human-laps/README.md
- drive_line.mjs
- analyze.mjs
- g1-4-beam-search/tests/run_tests.mjs
- toy_probe.py
- check_track.mjs
- Tests of g1-1 (search from the human's lap)
- progress.mjs
- sectional.mjs
- Changes needed elsewhere
- g1-6: off-policy distributional learner, rewarded for progress only
- g2-5-memory-policy/tests/run_tests.mjs
- search.mjs
- Tests of g1-2 (independent tester)
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

## God Nodes (most connected - your core abstractions)
1. `loadTrack()` - 59 edges
2. `RacingEnv` - 55 edges
3. `Env` - 54 edges
4. `decodeState()` - 40 edges
5. `rotate()` - 36 edges
6. `SimSession` - 33 edges
7. `createRng()` - 29 edges
8. `humanLaps()` - 28 edges
9. `Lookahead driver (driveLap)` - 28 edges
10. `verifyAndSave()` - 27 edges

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

## Communities (137 total, 7 thin omitted)

### Community 0 - "Lookahead driver (driveLap)"
Cohesion: 0.26
Nodes (20): Generalist checkpoint ppo_blkgen.best2, Lookahead run log main_a (desert3/winter4 seeds, lazy defaults), Lookahead run log main_b (desert3/summer3 seeds, lazy defaults), Lookahead run log saved (verified saved laps winter4, desert3, summer3), Lookahead smoke test log (winter4 seeds 10, 12: 5 of 5 PASS), Specialist desert4 full lookahead, score progress (21.988 s), Specialist desert4 full lookahead, score reward (22.006 s), Specialist desert4 full lookahead, score value (22.042 s) (+12 more)

### Community 1 - "torch"
Cohesion: 0.06
Nodes (23): MemoryAgent, ppo_loss(), session_advantages(), write_actor(), Changes needed elsewhere, g2-5: a policy with memory of its earlier attempts, How to run, What a full run would cost (+15 more)

### Community 2 - "test_1_route_vs_human_sim.mjs"
Cohesion: 0.11
Nodes (20): RIDE_HEIGHT, SPACING, check(), fmt(), known(), median(), near(), percentile() (+12 more)

### Community 3 - "generate.mjs"
Cohesion: 0.35
Nodes (13): add(), buildRoute(), CHAIN_IDS, dot(), generateTrack(), leftOf(), loadTraversals(), outward() (+5 more)

### Community 4 - "test_units.py"
Cohesion: 0.07
Nodes (13): ReplayBuffer, actor_file_best_action(), check(), loss_by_loops(), n_step_one(), test_n_step(), test_quantile_loss(), test_sampling() (+5 more)

### Community 5 - "laps.mjs"
Cohesion: 0.07
Nodes (44): t(), `laps.mjs` — laps in one form, and conversions (no simulator), Modules, `policy.mjs` — a block policy and its value estimate in Node, Shared code contract, Units and conventions, `verify.mjs` — finish and verify a lap, BLOCK_SLICES (+36 more)

### Community 6 - "The models"
Cohesion: 0.09
Nodes (21): 10. `ppo_blk_<track>`: "set 1", specialists from imitation only (6 Oct), 11. `ppo_blkgen`: block generalist (6 to 7 Oct), 12. `ppo_blkgen2`: blocked-lane cost and steering kicks (7 Oct), 13. `ppo_gblk_<track>`: "set 2", specialists from the generalist (7 to 8 Oct), 14. `ppo_g3blk_<track>`: "set 3", rules 1, 2 and 3 (8 Oct), 15. `ppo_sr1_<track>` and `ppo_sr2_<track>`: search, then train (8 to 10 Oct), 16. `g1-6-iqn_desert4`: off-policy learner (10 Oct), 1. `ppo_summer1`: first single-track agent (4 Oct) (+13 more)

### Community 7 - "ref_node_fs"
Cohesion: 0.07
Nodes (33): h, human, line, [name = 'summer1', run = 'tuned', sectionsArg = '24'], o, profile(), rows, SECTIONS (+25 more)

### Community 8 - "PolytrackVecEnv"
Cohesion: 0.09
Nodes (10): _obs(), PolytrackVecEnv, Design in brief, Install, Known limits, Multi-track ("generalist") training, rl/: reinforcement learning on the headless simulator, Use (+2 more)

### Community 9 - "test_4_sim.mjs"
Cohesion: 0.10
Nodes (25): ROUTE_SPACING, check(), fmt(), near(), section(), detectorBox(), gatesOf(), meshOf() (+17 more)

### Community 10 - "shared/tests/harness.mjs"
Cohesion: 0.06
Nodes (36): { check, note }, clean(), runFiles, said, TMP, Tests of g1-1 (independent tester), Headline claims confirmed on all four tracks, Not covered: a worker that throws leaves search_human waiting forever (+28 more)

### Community 11 - "explore.mjs"
Cohesion: 0.07
Nodes (33): archive, args, attempt(), BACK, BACK_MIN, cellKey(), chooseCell(), file (+25 more)

### Community 12 - "ideas/README.md"
Cohesion: 0.09
Nodes (25): Deliverables: runnable code plus README per idea, Orchestrator plus twelve idea agents, g1-5 fine key timing, g1-6 off-policy learner, g1-7 computed racing line, g2-1 reference-free inputs, g2-2 track generator, g2-3 explore and adapt (+17 more)

### Community 13 - "g2-4-lookahead-driving/tests/test_logic.mjs"
Cohesion: 0.11
Nodes (15): check(), finish(), same(), ROOT, saved, TMP, dead, invariants() (+7 more)

### Community 14 - "test_sim_b.mjs"
Cohesion: 0.08
Nodes (34): a, marks, policy, args, opt, policy, settings, track (+26 more)

### Community 15 - "Route built from track geometry alone"
Cohesion: 0.20
Nodes (10): Missing speed profile from curvature, Changes needed in RacingEnv to use the route reference, Validation of route against fastest human lap on 17 official tracks, g2-1 independent tests (TESTING.md), Observation: route floats 0.5 to 1.1 units off curved surfaces, test_3: g2-1 route on a g2-2 generated track, compare_g21: g2-1 route finder as second opinion, Limitation: explore still needs a human reference lap (+2 more)

### Community 16 - "stitch_laps.mjs"
Cohesion: 0.06
Nodes (27): acceptCost, args, attempts, bestOf, checkMs, finishMode, followOptions, free (+19 more)

### Community 17 - "main"
Cohesion: 0.08
Nodes (15): Files, _decode(), IqnServers, check(), main(), test_learning(), learner_for(), Defects found (+7 more)

### Community 18 - "policy.mjs"
Cohesion: 0.08
Nodes (32): Files, args, report, rng, rows, started, [actorFile, obsFile, outFile, size], all (+24 more)

### Community 19 - "search_sections.mjs"
Cohesion: 0.09
Nodes (19): args, best, finalString, minScore, mutateOptions, opt, outFile, passes (+11 more)

### Community 20 - "CONTRACT.md"
Cohesion: 0.11
Nodes (24): ideas/shared and CONTRACT.md (orchestrator-owned), Blind replay of human keys from an inexact state does not survive (g1-2), Block decision format [steer, steerAt, w, wAt, s, sAt] per 50 ms, block_rollout.mjs (openBlockEnv, fromStart, roll), shared lap_paths.mjs (recordPath, mismatch, follow), shared laps_bc.py (imitation examples from several laps), laps.mjs (laps in one form, conversions), shared lookahead.mjs (driveLap) (+16 more)

### Community 21 - "g1-7 computed racing line README"
Cohesion: 0.14
Nodes (24): g1-7 computed racing line README, Where it could pay: tracks with flat braking zones, Fitted car model (car_model.mjs / car_model.json), check_turn_limit.mjs (pad limit vs human laps, ratio 1.00), compare_human.mjs (calibration against the human lap), Result: computed line lap 22.083 s vs human 21.750 s, drive_line.mjs (pure-pursuit tracker driving the line), fit_car.mjs (car experiments on the pad) (+16 more)

### Community 22 - "rounds.mjs"
Cohesion: 0.22
Nodes (31): paths(), seconds(), alive(), at(), attemptsOf(), ckptSteps(), createState(), dropLock() (+23 more)

### Community 23 - "SimSession"
Cohesion: 0.14
Nodes (13): Changes needed elsewhere, restore(), snapshot(), Defects found, subTick(), scoreOf(), Defects found, `sim_session.mjs` — save-state rollouts on the bare simulator (no reference lap) (+5 more)

### Community 24 - "env.mjs"
Cohesion: 0.11
Nodes (16): CACHE, humanTrace(), What is not done or not tested, Rules for working side by side, `track_info.mjs` — geometry and reference-free progress, Acceptance tests, Headless PolyTrack 0.6.3 simulator (sim/), track (+8 more)

### Community 25 - "observation.mjs"
Cohesion: 0.08
Nodes (24): LOOKAHEAD_POINTS, OBS_CONTACT, OBS_CURVATURE, OBS_EDGE_AHEAD, OBS_EDGE_NOW, OBS_FLIGHT, OBS_FRACTION, OBS_FRAME (+16 more)

### Community 26 - "track.mjs"
Cohesion: 0.15
Nodes (25): decodeParts(), partTriangles(), partVoxels(), voxelCache, voxelKey(), worldTriangles(), loadTrackInfo(), DATA (+17 more)

### Community 27 - "test_driver.mjs"
Cohesion: 0.08
Nodes (24): build(), changed, ckpts, COPIES, D, driveOne(), drives, fin() (+16 more)

### Community 28 - "beam.mjs"
Cohesion: 0.08
Nodes (26): alongBin, args, ask(), BEAM, elapsed(), elite, incumbent, latBin (+18 more)

### Community 29 - "g1-4-beam-search/tests/test_child.mjs"
Cohesion: 0.10
Nodes (16): check(), failed, finish(), passed, same(), throws(), a, b (+8 more)

### Community 30 - "test_logs.mjs"
Cohesion: 0.16
Nodes (19): cost(), early, finishedPlain, lazy, long, of(), one(), pair() (+11 more)

### Community 31 - "g1-3-search-train-rounds/README.md"
Cohesion: 0.10
Nodes (24): pickCopy(), trainPlan(), Changed after independent testing, Changes needed elsewhere, Cost of a full run, g1-3: unattended rounds of "search, train toward the searched lap, search again", Restart logic: each step asks the files what is done, Run it (+16 more)

### Community 32 - "section_worker.mjs"
Cohesion: 0.25
Nodes (17): dist2(), drive(), driveTail(), driveTo(), faster(), pos, pose, quat (+9 more)

### Community 33 - "fit_car.mjs"
Cohesion: 0.09
Nodes (21): accelRun, accelW, binBySpeed(), brake, brakeRun, coast, coastRun, entries (+13 more)

### Community 34 - "g2-3-explore-and-adapt/README.md"
Cohesion: 0.20
Nodes (12): Fine-tune plan (dry run, not executed), Plain mode baseline (attempts from the start line), Budget counted in simulated laps, Unseen test tracks: desert3, summer3, winter4, Result: winter4 explore 8 of 8 vs plain 0 of 8, g2-3 independent tests (TESTING.md), Car-replacement path forced by test hook, hook.mjs: RacingEnv instrumentation wrapper for tests (+4 more)

### Community 35 - "test_3_under_road_sim.mjs"
Cohesion: 0.08
Nodes (29): broken, brokenParts, follow(), info, route, track, attempt(), DRIVER_DEFAULTS (+21 more)

### Community 36 - "test_5_corridor_sim.mjs"
Cohesion: 0.14
Nodes (15): car, tracks, AIR_GUARD, along(), buildCorridor(), cross(), MARGIN, MAX_ROOM (+7 more)

### Community 37 - "numpy"
Cohesion: 0.05
Nodes (12): check(), finish(), one(), b64(), greedy_agreement(), network(), part(), replica() (+4 more)

### Community 38 - "search_rollout.mjs"
Cohesion: 0.12
Nodes (15): alter(), args, exported, name, opt, passes, randInt(), rng (+7 more)

### Community 39 - "ref_node_child_process"
Cohesion: 0.11
Nodes (22): IDEA_DIR, check(), failed, finish(), passed, same(), throws(), PROJECT (+14 more)

### Community 40 - "train_ppo.py"
Cohesion: 0.09
Nodes (10): block_imitation_loss(), block_parts(), held_keys(), imitation_loss(), _layer(), main(), save_checkpoint(), write_actor_weights() (+2 more)

### Community 41 - "g1-6-offpolicy-rl/README.md"
Cohesion: 0.15
Nodes (16): Double Q-learning, dueling head, target network, Full run estimate: 10 to 50 million decisions, iqn.py (network, quantile Huber loss, actor file), iqn_server.mjs (RacingEnv server, epsilon-greedy actor), Linesight (Trackmania IQN agent), Status: no training run done, no lap time, replay.py (ring replay buffer, n-step returns), servers.py (start_rollout / finish_rollout / evaluate) (+8 more)

### Community 42 - "search_human.mjs"
Cohesion: 0.07
Nodes (30): args, best, opt, outDir, OWN, passes, saveProgress(), seconds (+22 more)

### Community 43 - "test_6_scripts_sim.mjs"
Cohesion: 0.15
Nodes (16): check(), known(), median(), near(), percentile(), section(), within(), accelAt() (+8 more)

### Community 44 - "search_timeline.mjs"
Cohesion: 0.12
Nodes (13): args, best, finalString, mutateOptions, opt, outFile, rng, runsDir (+5 more)

### Community 45 - "route.mjs"
Cohesion: 0.27
Nodes (13): buildRoute(), flights(), runStage(), cross(), dist(), dot(), finishRoute(), gateStages() (+5 more)

### Community 46 - "fetch_laps.mjs"
Cohesion: 0.22
Nodes (9): allOfficial, amount, args, get(), officialDir, opt, outDir, sleep() (+1 more)

### Community 47 - "search_settings.mjs"
Cohesion: 0.11
Nodes (19): args, bigMoveChance, clamp(), current, extraChance, gaussian(), GLOBALS, mutateSettings() (+11 more)

### Community 48 - "diff_capture.mjs"
Cohesion: 0.17
Nodes (3): byId, cap, ours

### Community 49 - "savestate_test.mjs"
Cohesion: 0.07
Nodes (23): Driving and watching a lap, Layout, Polytrack-ML, Setup, Things that were not obvious, a, b, checks (+15 more)

### Community 50 - "test_restart.mjs"
Cohesion: 0.09
Nodes (32): chooseExamples(), concludeRound(), copiesToTest(), DEFAULTS, ID, parseArgs(), parseAttempt(), parseSearchLog() (+24 more)

### Community 51 - "iqn_server.mjs"
Cohesion: 0.22
Nodes (17): b64(), begin(), decisionOf(), drive(), evaluate(), greedy(), handle(), HUMAN_DOING (+9 more)

### Community 52 - "progress"
Cohesion: 0.09
Nodes (22): Defects, Not fixed, Observations that are not defects, Cost of a full run, Design questions, Files, g2-4: look ahead while driving, How to run (+14 more)

### Community 53 - "g2-2-track-generator — track encoder, piece ports, generated tracks with routes and laps"
Cohesion: 0.70
Nodes (5): Facts measured by the idea agents, g2-2-track-generator — track encoder, piece ports, generated tracks with routes and laps, Added by the orchestrator in phase 2 (not by the independent tester), surfaceBelow(), watchLap()

### Community 54 - "capture_init.mjs"
Cohesion: 0.10
Nodes (15): devDependencies, playwright-core, name, private, scripts, capture, setup, test (+7 more)

### Community 55 - "paths.mjs"
Cohesion: 0.21
Nodes (21): carState(), compare(), angleBetween(), crossings(), locate(), mismatch(), MISMATCH_WEIGHTS, MOTION_GAP (+13 more)

### Community 56 - "g1-5 independent tests (TESTING.md)"
Cohesion: 0.16
Nodes (17): child.mjs (simulator process: prepare / try, save-state ladder), fine.mjs (nudge, shiftTail, subTick, pool wrapper), subTick() sub-tick lap time estimate, g1-5 independent tests (TESTING.md), Hazard: a child that throws leaves the parent waiting for ever, Defect: smoothness.mjs flips=1 crashed (0/0 NaN), fixed, Check: save-state ladder never starts from a stale state, Position inside the finish tick makes a human lap improvable (g1-1) (+9 more)

### Community 57 - "compare_human.mjs"
Cohesion: 0.14
Nodes (23): speedFor(), car, human, kappaHuman, out, [track = 'desert4', lapIndex = '0'], curvature(), dot() (+15 more)

### Community 58 - "g2-3-explore-and-adapt/tests/test_logic.mjs"
Cohesion: 0.08
Nodes (21): check(), finish(), same(), BUDGETS, CELL_LENGTH, CELL_WIDTH, cellKey, GAIN (+13 more)

### Community 59 - "racing_env.mjs"
Cohesion: 0.13
Nodes (18): tracks, actionToControls(), clip(), controlsKey(), controlsToAction(), dot(), NUM_ACTIONS, OBS_PEDAL_OPEN (+10 more)

### Community 60 - "smoothness.mjs"
Cohesion: 0.11
Nodes (15): count, from, horizons, inRange, lap, overall, plane, rows (+7 more)

### Community 61 - "polytrack_env.py"
Cohesion: 0.07
Nodes (11): main(), parse_args(), EnvServer, PolytrackEnv, _random_policy_check(), collect(), Files, rl/requirements.txt (Python 3.10+) (+3 more)

### Community 62 - "test_follow.mjs"
Cohesion: 0.22
Nodes (9): corrections(), donorKeys(), follow(), FOLLOW_DEFAULTS, NONE, { check, eq, throws, note }, knockedOff(), OFF (+1 more)

### Community 63 - "g1-4-beam-search/child.mjs"
Cohesion: 0.16
Nodes (12): candidates(), canonical(), dot(), ensureCar(), features(), freshStart(), handlers, nodes (+4 more)

### Community 64 - "export_recording.mjs"
Cohesion: 0.22
Nodes (9): decoded, firstMismatch, key(), [name = 'summer1', run = 'baseline'], recording, recordingString, runsDir, track (+1 more)

### Community 65 - "plot_dump.mjs"
Cohesion: 0.19
Nodes (9): info, nodes, route, surface, buildSurface(), near(), CellMap, EDGE_CAP (+1 more)

### Community 66 - "memory_test.mjs"
Cohesion: 0.13
Nodes (13): check(), crash, doomedFrom, edges, far, first, log, memory (+5 more)

### Community 67 - "Brief for the idea agents"
Cohesion: 0.40
Nodes (5): Brief for the idea agents, Find your way around, Rules, The project, What to deliver

### Community 68 - "refine.mjs"
Cohesion: 0.06
Nodes (45): { check, note }, CLAIMS, better(), copy(), listFlips(), makePlane(), MOVABLE, nudge() (+37 more)

### Community 69 - "test_pure.py"
Cohesion: 0.09
Nodes (8): main(), export_actor(), IQN, quantile_huber_loss(), test_network(), loss_by_hand(), loss_of(), read_actor()

### Community 70 - "pieces.mjs"
Cohesion: 0.17
Nodes (15): cross(), derivePorts(), key(), onGridPlane(), sub(), worldPorts(), Defects, Fixed (+7 more)

### Community 71 - "RacingEnv"
Cohesion: 0.21
Nodes (4): straight(), Changes needed elsewhere, Facts that are easy to get wrong, RacingEnv

### Community 72 - "g2-2-track-generator/README.md"
Cohesion: 0.26
Nodes (9): Difficulty as a knob on the piece mix, Nine smoke checks for a generated track, Finding: official tracks are not reconstructible as piece chains, Generated track output files (track.json, route.json, lap.json), Port mating rule, Track string encoder (codec), g2-2 independent tests (TESTING.md), Fix: driveTrack reported a broken ground-level track as finished (+1 more)

### Community 73 - "test_beam.mjs"
Cohesion: 0.16
Nodes (13): a, b, BEAM, c, d, e, f, files() (+5 more)

### Community 74 - "ref_node_url"
Cohesion: 0.11
Nodes (15): failures, files, here, root, started, failures, files, here (+7 more)

### Community 75 - "g1-5 fine key timing README"
Cohesion: 0.23
Nodes (7): g1-5 fine key timing README, Result: best human lap 21.750 -> 21.722 s, verified, refine.mjs (flip-timing search, verified lap out), Result: searched lap 21.907 s, 0 ms gained, smoothness.mjs (lap time vs one flip's time), Headline claim holds: 21.722 s lap replays and verifies, Lap time is jagged at the millisecond level (g1-5)

### Community 76 - "replica_check.mjs"
Cohesion: 0.14
Nodes (10): actions, dump, episodeStartArc, finishTicks, now, obs, reasons, rewards (+2 more)

### Community 77 - "check_pieces.mjs"
Cohesion: 0.13
Nodes (13): count, firstSeed, LENGTHS, started, used, worst, checkOfficial(), matePorts() (+5 more)

### Community 78 - "MemoryEnv"
Cohesion: 0.18
Nodes (4): MemoryEnv, Not done, not tested, What is remembered, exactly, Not covered, and why

### Community 79 - "smoke_real.mjs"
Cohesion: 0.23
Nodes (10): at(), cleanUp(), keep, launch(), ours(), p, PROJECT, r (+2 more)

### Community 80 - "Polytrack-ML"
Cohesion: 0.14
Nodes (13): Coding conventions, graphify, Hard rules, How the car should be driven (Henry's knowledge of the game), Lessons that cost something to learn, Model history, Polytrack-ML, Status (12 October 2026) (+5 more)

### Community 81 - "calibrate.mjs"
Cohesion: 0.18
Nodes (10): args, HORIZONS, N, opt, rng, seed(), starts, states (+2 more)

### Community 82 - "validate.mjs"
Cohesion: 0.18
Nodes (8): EVERY, args, fresh, jobs, names, perTrack, rank, verdicts

### Community 83 - ".create"
Cohesion: 0.17
Nodes (11): 1. The piece table, 2. The generator, 3. Is a generated track real?, 4. Output, and pointing training at it, Changes made by the tester, Changes needed elsewhere, Cost of a full run, Files (+3 more)

### Community 84 - "test_2_codec.mjs"
Cohesion: 0.26
Nodes (7): deflate(), encodeExportString(), encodeSaveString(), partsToBytes(), wrap(), keyOf(), sameParts()

### Community 85 - "g2-5-memory-policy/README.md"
Cohesion: 0.28
Nodes (8): Crash-repeat measurement with attempts.mjs, 3 s doomed window assumption, MemoryAgent warm-started from the generalist, 130 extra memory inputs (482-wide observation), toy_probe: one corner with a hidden speed limit, g2-5 independent tests (TESTING.md), Fix: last observation of an attempt showed that attempt's own memory, Discrepancy: README figures are from seed=2, printed command runs seed 1

### Community 86 - "test_attempts.mjs"
Cohesion: 0.14
Nodes (11): check(), finish(), known(), same(), a, b, crashed, expected (+3 more)

### Community 87 - "test_track_memory.mjs"
Cohesion: 0.15
Nodes (12): MEMORY_DEFAULTS, MEMORY_OBS_SIZE, closeTo(), near(), BIN, DOOM_MS, GLOBALS, MEM_SIZE (+4 more)

### Community 88 - "run_all_tests.mjs"
Cohesion: 0.17
Nodes (11): folders, IDEAS, killTree(), LOGS, results, ROOT, runFolder(), t0 (+3 more)

### Community 89 - "env_server.mjs"
Cohesion: 0.21
Nodes (10): actionRng, b64(), handle(), layerTanh(), loadActor(), options, rollout(), sampleAction() (+2 more)

### Community 90 - "trace.mjs"
Cohesion: 0.18
Nodes (10): [i,j,k], [name, join, opts='{}', every='5'], paths, t0, { ticks }, trace(), track, renewCar() (+2 more)

### Community 91 - "route_store.mjs"
Cohesion: 0.21
Nodes (11): createObserver(), createTracker(), DEFAULTS, CACHE, ROUTE_VERSION, routeFor(), g2-1 tests, The README's claims (+3 more)

### Community 92 - "g1-5: fine key timing (1 ms)"
Cohesion: 0.18
Nodes (11): Changes needed elsewhere, Cost of a full run, Files, g1-5: fine key timing (1 ms), How to run, Not done, not tested, Smoke test 1: searched lap, flips from 18.0 s to the finish, Smoke test 2: best human lap, flips from 17.75 s to the finish (+3 more)

### Community 93 - "g1-6-offpolicy-rl/tests/test_author.mjs"
Cohesion: 0.29
Nodes (8): check(), failed, finish(), passed, same(), throws(), PROJECT, SCRIPTS

### Community 94 - "test_1_raceline.mjs"
Cohesion: 0.24
Nodes (5): TOLERANCE, cross(), makeCorridor(), unit(), UP

### Community 95 - "g1-7: a computed racing line"
Cohesion: 0.20
Nodes (10): 1. The fitted car (flat pad, `car_model.json`), 2. The corridor, 3. The line and the speed profile, 4. Against the human lap (desert4, 21.750 s), Changes needed elsewhere, Cost of a full run, g1-7: a computed racing line, How to run (from the project root) (+2 more)

### Community 96 - "Requests to the orchestrator"
Cohesion: 0.20
Nodes (7): Changes needed elsewhere, g1-3-search-train-rounds — imitation examples from several laps, g1-3-search-train-rounds — search_round.sh is not safe to rerun after an interruption, g2-2-track-generator — loadTrack cannot take a track that is not in data/ or vendor/, g2-4-lookahead-driving — a lookahead driver others can call; RacingEnv speed, orchestrator — duplication found in phase 2 that nobody reported, Requests to the orchestrator

### Community 97 - "test_3_testpad_sim.mjs"
Cohesion: 0.21
Nodes (11): fill(), GRAVITY, loadCarModel(), Not done or not tested, buildPad(), PLATE_CELLS, PLATE_UNITS, fmt() (+3 more)

### Community 98 - "g2-1: inputs that need no human lap"
Cohesion: 0.20
Nodes (10): Cost of a full run, g2-1: inputs that need no human lap, How the route is found, How to run, Not done, not tested, Result in short, Smoke tests, The files (+2 more)

### Community 99 - "test_memory_env.mjs"
Cohesion: 0.16
Nodes (10): attempt(), draw, edgesNow(), expectedLengths, lengths, OFF, policy, RefMemory (+2 more)

### Community 100 - "worker_entry.mjs"
Cohesion: 0.29
Nodes (6): handleControl(), memories, physicsBytes(), restoreSnapshot(), snapshots, takeSnapshot()

### Community 101 - "ladder_test.mjs"
Cohesion: 0.15
Nodes (15): attempt(), ladder, prepare(), samePrefix(), snapshot(), body(), fractions, human (+7 more)

### Community 102 - "rollout_child.mjs"
Cohesion: 0.27
Nodes (6): decide(), GROUPS, layerTanh(), prefix, prepare(), scoresFor()

### Community 103 - "g2-3 Explore and adapt"
Cohesion: 0.20
Nodes (10): Changes needed elsewhere, Cost of a full run, Design questions, and what the logs say, Files, Fine-tune (dry run only), g2-3 Explore and adapt, How to run (from the project root), Not done, not tested (+2 more)

### Community 104 - "tune.mjs"
Cohesion: 0.29
Nodes (6): joins, [name, ...rest], paths, settings, { ticks }, track

### Community 105 - "g1-2: stitch a lap from the fastest sections of several human laps"
Cohesion: 0.22
Nodes (9): g1-2: stitch a lap from the fastest sections of several human laps, How it works, How often a join survives, Not done, not tested, Section times and the theoretical best, Stitched laps, The cost of repair, What a full run would cost (+1 more)

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
Cohesion: 0.43
Nodes (4): Beam of partial laps as save states, extended one 50 ms decision at a time, Next step: a learned ranking fitted to finish times, Periodic rollouts to the finish for a real lap time, Ranking measures (progress, value, look H, lookvalue H)

### Community 110 - "g1-1-human-seed-search/README.md"
Cohesion: 0.13
Nodes (9): Changes needed elsewhere, One-off gain from how the car is angled at the finish line, g1-1: search from the human's lap, How to run, Not done, not tested, The idea, What a longer run would probably do, What happens to the rest of the lap (the open problem) (+1 more)

### Community 111 - "g1-2-stitch-human-laps/README.md"
Cohesion: 0.43
Nodes (4): Best-of-sections theoretical bound (not a close one), Plan: dynamic programming over (boundary, lap) with switch cost, Section boundaries: planes across the road every 250 ms, State mismatch in millisecond-equivalents

### Community 112 - "drive_line.mjs"
Cohesion: 0.25
Nodes (7): args, createCar, file, lines, options, settings, [track = 'desert4', which = 'all']

### Community 113 - "analyze.mjs"
Cohesion: 0.25
Nodes (6): BACK_EDGES, BUDGETS, dir, groups, restarts, runs

### Community 114 - "g1-4-beam-search/tests/run_tests.mjs"
Cohesion: 0.32
Nodes (5): HERE, PROJECT, t0, KNOWN, TESTS

### Community 115 - "toy_probe.py"
Cohesion: 0.32
Nodes (3): myopic(), p_through(), play()

### Community 116 - "check_track.mjs"
Cohesion: 0.25
Nodes (4): args, checkpoint, driven, positional

### Community 117 - "Tests of g1-1 (search from the human's lap)"
Cohesion: 0.50
Nodes (4): Headline claims, Other claims in the README, Tests of g1-1 (search from the human's lap), What is covered

### Community 118 - "progress.mjs"
Cohesion: 0.39
Nodes (8): describe(), dot(), fence(), locate(), nearest(), sub(), WINDOW, roomBeside()

### Community 119 - "sectional.mjs"
Cohesion: 0.36
Nodes (8): drive(), prepare(), angleBetween(), controlsAt(), heldAt(), nextFlipAfter(), rejoin(), REJOIN_DEFAULTS

### Community 120 - "Changes needed elsewhere"
Cohesion: 0.20
Nodes (8): Changes needed elsewhere, Goal 1: beat the human lap on one track, Goal 2: a generalist for any track, Overnight results, 10 October 2026 (added by the main session), Shared code, Tests, The ideas, Twelve ideas: what came out

### Community 121 - "g1-6: off-policy distributional learner, rewarded for progress only"
Cohesion: 0.25
Nodes (8): Changed after independent testing, Changes needed elsewhere, Design, and why, g1-6: off-policy distributional learner, rewarded for progress only, How to run, Not done or not tested, What a full run would cost, What was tested, and the numbers

### Community 122 - "g2-5-memory-policy/tests/run_tests.mjs"
Cohesion: 0.25
Nodes (3): ROOT, STAGES, t0

### Community 123 - "search.mjs"
Cohesion: 0.27
Nodes (8): change(), sameBefore(), Defect found (fixed), countFlips(), MUTABLE, mutate(), MUTATE_DEFAULTS, randInt()

### Community 124 - "Tests of g1-2 (independent tester)"
Cohesion: 0.29
Nodes (6): Tests of g1-2 (independent tester), Headline claim, Headline claim holds: desert4 21.730 s reproduced key for key, Defect (fixed): stitch_laps exited 0 on NO LAP, Other claims in the README, Tests of g1-2 (stitch a lap from several human laps)

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

## Knowledge Gaps
- **12 isolated node(s):** `numpy>=1.26`, `One-off gain from how the car is angled at the finish line`, `Verify is local; no network calls in ideas/`, `Append-only request protocol (missing / bug / offer)`, `Request (g1-3): search_round.sh not safe to rerun after interruption` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1218 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RacingEnv` connect `RacingEnv` to `torch`, `ref_node_fs`, `explore.mjs`, `test_sim_b.mjs`, `Route built from track geometry alone`, `main`, `env.mjs`, `g2-3-explore-and-adapt/README.md`, `iqn_server.mjs`, `progress`, `g2-2-track-generator — track encoder, piece ports, generated tracks with routes and laps`, `paths.mjs`, `racing_env.mjs`, `replica_check.mjs`, `.create`, `g2-5-memory-policy/README.md`, `test_track_memory.mjs`, `env_server.mjs`, `Requests to the orchestrator`, `g2-1: inputs that need no human lap`, `ladder_test.mjs`, `rollout_child.mjs`, `TrackMemory`, `Changes needed elsewhere`, `g1-6: off-policy distributional learner, rewarded for progress only`, `hook.mjs`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `loadTrack()` (e.g. with `4. Output, and pointing training at it` and `What is not done or not tested`) actually correct?**
  _`loadTrack()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `numpy>=1.26`, `One-off gain from how the car is angled at the finish line`, `Verify is local; no network calls in ideas/` to the rest of the system?**
  _12 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `torch` be split into smaller, more focused modules?**
  _Cohesion score 0.06412583182093164 - nodes in this community are weakly interconnected._
- **Why does `loadTrack()` connect `env.mjs` to `laps.mjs`, `ref_node_fs`, `shared/tests/harness.mjs`, `test_sim_b.mjs`, `stitch_laps.mjs`, `search_sections.mjs`, `track.mjs`, `section_worker.mjs`, `test_5_corridor_sim.mjs`, `search_human.mjs`, `test_6_scripts_sim.mjs`, `search_timeline.mjs`, `fetch_laps.mjs`, `search_settings.mjs`, `savestate_test.mjs`, `g2-3-explore-and-adapt/tests/test_logic.mjs`, `racing_env.mjs`, `test_follow.mjs`, `export_recording.mjs`, `refine.mjs`, `.create`, `test_2_codec.mjs`, `trace.mjs`, `ladder_test.mjs`, `tune.mjs`, `drive_line.mjs`, `sectional.mjs`, `Changes needed elsewhere`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Are the 17 inferred relationships involving `RacingEnv` (e.g. with `5. Speed, memory, tick budget` and `Design, and why`) actually correct?**
  _`RacingEnv` has 17 INFERRED edges - model-reasoned connections that need verification._
- **Should `test_1_route_vs_human_sim.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.10804597701149425 - nodes in this community are weakly interconnected._