# Graph Report - Polytrack-ML  (2026-10-12)

## Corpus Check
- 399 files · ~367,112 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2684 nodes · 5954 edges · 135 communities (123 shown, 12 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 438 edges (avg confidence: 0.93)
- Token cost: 449,291 input · 0 output

## Community Hubs (Navigation)
- g2-3 Explore-and-Adapt Design
- g2-5 Memory Agent (Python)
- g2-1 Progress Tracker and Observer
- g2-2 Track Generator Bulk Check
- g1-6 IQN Network and Replay
- Idea Test Suites (g1-2, g1-3, g1-5)
- g1-3 Lap Imitation Examples
- Section Comparison Scripts
- PolytrackEnv Gym Wrappers
- g2-2 Generator Driver Defaults
- g1-1 Test Runner and Script Tests
- g2-3 Explore Cell Archive Code
- g1-1 Human-Seed Search Findings
- g2-4 Lookahead Drive Tests
- g2-4 Lookahead Drive Script
- g2-1 Reference-Free Route Design
- g1-2 Stitch Laps Script
- g1-6 Off-Policy RL Write-up
- Policy Node Scoring
- Section Search Script
- Shared Contract and Block Rollout
- g1-7 Racing Line Results
- g1-3 Rounds Driver
- Shared Modules Overview
- Headless Simulator and Human Traces
- g2-1 Observation Layout
- Track Geometry and Voxels
- g1-3 Driver Tests
- g1-4 Beam Search Core
- g1-4 Test Harness
- g1-5 Simulator Child and Headline Tests
- g1-3 Copy Picking and Train Plan
- g1-1 Section Worker
- g1-7 Car Model Fitting
- RacingEnv Core
- g2-2 Track Driving
- g1-7 Corridor Builder
- g1-6 Python Test Helpers
- Rollout Search Script
- g1-3 Test Harness
- Block Policy and Imitation Loss
- g1-6 IQN Design Concepts
- g1-1 Human-Seed Search Script
- g1-7 Test Checks
- Timeline Search and RNG
- g2-1 Route Builder
- Lap Fetching (Local Only)
- Search Settings Tuning
- Client Capture Verification
- Project README and Determinism
- g1-3 Restart Test
- g1-6 IQN Env Server
- g2-4 Lookahead Write-up
- g2-4 Log Tests
- Package Config
- g1-2 Lap Paths and Mismatch
- g1-5 Fine Timing Test Findings
- g1-7 Racing Line Optimiser
- g2-3 Logic Tests
- RacingEnv Actions and Block Test
- g1-5 Smoothness Probe
- Env Server Client (Python)
- g1-2 Donor Following
- g1-4 Beam Child Process
- Recording Export and g1-5 Child Tests
- g2-1 Surface and Plot Dump
- g2-5 Memory Smoke Test
- Idea Agents Brief
- g1-5 Refine Search
- IQN Model Class
- g1-3 Rounds Library
- g1-4 Beam Tests
- Node Env Server
- g1-2 Test Findings
- Test Runners (g1-3, g2-3)
- g1-5 Fine Timing Findings
- g1-6 Replica Check
- g2-5 Attempts and Memory Env
- MemoryEnv Class
- g1-3 Real Smoke Test
- g1-4 Pruning and Rank Tests
- g1-4 Ranking Calibration
- Test Runners (g1-7, g2-1)
- g2-2 Track Generator Write-up
- g2-3 Simulator Tests
- g2-5 Memory Env Tests
- g2-5 Attempts Tests
- g2-5 Track Memory Tests
- All-Ideas Test Runner
- g1-7 Car Model and Test Pad
- g1-2 Trace Scratch
- g1-5 Sub-Tick Scoring
- g1-5 Write-up Sections
- g1-6 Author Tests
- g1-7 Racing Line Tests
- g1-7 Write-up Sections
- Shared Change Requests
- g1-7 Human Comparison
- g2-1 Write-up Sections
- Reference Memory
- Simulator Worker Entry
- Save-State Ladder Test
- Rollout Child Process
- g1-1 Worker Tests
- g1-2 Tuning Scratch
- g1-2 Write-up Sections
- g1-4 Beam Search Findings
- g1-4 Write-up Sections
- TrackMemory Class
- g1-1 Write-up Sections
- g1-2 Stitching Concepts
- g1-7 Drive Line Script
- g2-3 Run Analysis
- g2-5 Test Runner
- g2-5 Toy Probe
- Track Check Script
- g1-4 Test Runner
- g1-5 Fine Moves
- g1-6 Test Runner
- Ideas Overview and Goals
- Policy Evaluation Script
- g2-2 Test Runner
- g2-4 Test Runner
- Shared Process Pool
- Actor File Reader (Python)
- g2-3 Test Hook
- Actor File Test Reader
- Set 3 Round 2 Script
- g2-3 Finetune Plan Script
- g2-3 Smoke Test Script
- Block Specialist Eval Script
- Generalist Eval Script
- Block Specialist Training Script

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
- `Layout` --references--> `Env`  [INFERRED]
  README.md → sim/env.mjs
- `Goal 2: a generalist for any track` --references--> `loadTrack()`  [INFERRED]
  ideas/README.md → sim/env.mjs
- `Shared code` --references--> `RacingEnv`  [INFERRED]
  ideas/README.md → rl/racing_env.mjs
- `Design, and why` --references--> `RacingEnv`  [INFERRED]
  ideas/g1-6-offpolicy-rl/README.md → rl/racing_env.mjs
- `Plain policy on the unseen tracks (baseline)` --references--> `RacingEnv`  [INFERRED]
  ideas/g2-4-lookahead-driving/README.md → rl/racing_env.mjs

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Node environment to Python PPO training pipeline** — sim_env, rl_racing_env, rl_env_server, rl_polytrack_env, rl_train_ppo, rl_evaluate [INFERRED 0.85]
- **Goal 1 search ideas that improve an existing lap** — ideas_g1_1_human_seed_search_readme, ideas_g1_2_stitch_human_laps_readme, ideas_g1_3_search_train_rounds_readme, ideas_g1_4_beam_search_readme, ideas_readme_g1_5_fine_key_timing [EXTRACTED 1.00]
- **Save-state search pattern: branch from a save state, judge by finish time, pass Verify** — ideas_g1_1_human_seed_search_readme_section_search, ideas_g1_2_stitch_human_laps_readme_switch_judging, ideas_g1_4_beam_search_readme_beam_over_block_decisions, ideas_g1_4_beam_search_readme_periodic_rollouts, readme_game_verify [INFERRED 0.85]
- **Defects found by independent testers** — ideas_g1_1_human_seed_search_tests_testing_mutate_window_defect, ideas_g1_2_stitch_human_laps_tests_testing_no_lap_exit_code_defect, ideas_g1_2_stitch_human_laps_tests_testing_simsession_load_defect, ideas_g1_3_search_train_rounds_tests_testing_critic_warmup_defect, ideas_g1_4_beam_search_tests_testing_carbudget_rebuild_loop, ideas_readme_independent_testing [INFERRED 0.85]
- **Independent testers' defect reports across idea folders** — ideas_g1_5_fine_key_timing_tests_testing_defect_smoothness_flips1, ideas_g1_6_offpolicy_rl_tests_testing_defect_eval_lap_replay, ideas_g1_7_computed_racing_line_tests_testing_defect_brake_steering, ideas_shared_tests_testing_defect_simsession_load [INFERRED 0.85]
- **Modules promoted to ideas/shared in phase 2** — ideas_shared_contract_car_model_mjs, ideas_shared_contract_track_build_mjs, ideas_shared_contract_route_progress_mjs, ideas_shared_contract_lookahead_mjs, ideas_shared_contract_lap_paths_mjs, ideas_shared_contract_laps_bc_py [EXTRACTED 1.00]
- **Evidence that only finish time can judge a candidate** — ideas_g1_5_fine_key_timing_readme_short_horizon_unreliable, ideas_g1_5_fine_key_timing_readme_lap_time_not_smooth, ideas_shared_contract_short_lookahead_fact, ideas_shared_contract_verify_mjs [INFERRED 0.85]
- **Three ways to get the generalist round unseen tracks (explore, lookahead, memory)** — ideas_g2_3_explore_and_adapt_readme_explore_loop, ideas_g2_4_lookahead_driving_readme_lookahead_driver, ideas_g2_5_memory_policy_readme_design_b_attempt_conditioned_inputs, ideas_g2_3_explore_and_adapt_readme_unseen_tracks_test_set, ideas_g2_3_explore_and_adapt_readme_ppo_blkgen_best2_generalist [INFERRED 0.85]
- **Reference-free generalist pipeline: geometric route, generated tracks, attempt memory** — ideas_g2_1_reference_free_inputs_readme_geometric_route, ideas_g2_1_reference_free_inputs_readme_observation_334, ideas_g2_2_track_generator_readme_chain_generator, ideas_g2_5_memory_policy_readme_track_memory_map, ideas_g2_5_memory_policy_readme_curriculum [INFERRED 0.85]
- **Ground-under-the-road trap: progress and finishes credited off the road** — ideas_g2_1_reference_free_inputs_tests_testing_progress_under_raised_road_defect, ideas_g2_2_track_generator_readme_drivable_ground_at_height_0, ideas_g2_2_track_generator_tests_testing_drivetrack_ground_level_false_finish_fix, ideas_g2_2_track_generator_tests_testing_watchlap_road_under_car, ideas_g2_1_reference_free_inputs_tests_testing_under_road_test_on_generated_track [EXTRACTED 1.00]

## Communities (135 total, 12 thin omitted)

### Community 0 - "g2-3 Explore-and-Adapt Design"
Cohesion: 0.07
Nodes (50): Changes needed elsewhere, Cost of a full run, Design questions, and what the logs say, Files, Fine-tune (dry run only), Fine-tune plan (dry run, not executed), g2-3 Explore and adapt, How to run (from the project root) (+42 more)

### Community 1 - "g2-5 Memory Agent (Python)"
Cohesion: 0.05
Nodes (23): MemoryAgent, ppo_loss(), session_advantages(), write_actor(), Changes needed elsewhere, Curriculum, g2-5: a policy with memory of its earlier attempts, How to run (+15 more)

### Community 2 - "g2-1 Progress Tracker and Observer"
Cohesion: 0.06
Nodes (48): EVERY, createObserver(), createTracker(), describe(), dot(), fence(), locate(), nearest() (+40 more)

### Community 3 - "g2-2 Track Generator Bulk Check"
Cohesion: 0.07
Nodes (45): count, firstSeed, LENGTHS, started, used, worst, checkOfficial(), matePorts() (+37 more)

### Community 4 - "g1-6 IQN Network and Replay"
Cohesion: 0.06
Nodes (25): export_actor(), quantile_huber_loss(), ReplayBuffer, check(), main(), check(), loss_by_loops(), n_step_one() (+17 more)

### Community 5 - "Idea Test Suites (g1-2, g1-3, g1-5)"
Cohesion: 0.08
Nodes (44): { check }, PROJECT, PY, { check, eq }, BLOCK_SLICES, BLOCK_TICKS, controlsOf(), decisionsToKeys() (+36 more)

### Community 7 - "Section Comparison Scripts"
Cohesion: 0.07
Nodes (38): h, human, line, [name = 'summer1', run = 'tuned', sectionsArg = '24'], o, profile(), rows, SECTIONS (+30 more)

### Community 8 - "PolytrackEnv Gym Wrappers"
Cohesion: 0.05
Nodes (16): _obs(), PolytrackEnv, PolytrackVecEnv, _random_policy_check(), Design in brief, Files, Install, Known limits (+8 more)

### Community 9 - "g2-2 Generator Driver Defaults"
Cohesion: 0.09
Nodes (30): DRIVER_DEFAULTS, ROUTE_SPACING, check(), fmt(), near(), section(), decodeParts(), detectorBox() (+22 more)

### Community 10 - "g1-1 Test Runner and Script Tests"
Cohesion: 0.07
Nodes (31): { check, note }, clean(), runFiles, said, TMP, Tests of g1-1 (independent tester), Headline claims confirmed on all four tracks, Not covered: a worker that throws leaves search_human waiting forever (+23 more)

### Community 11 - "g2-3 Explore Cell Archive Code"
Cohesion: 0.07
Nodes (35): archive, args, attempt(), BACK, BACK_MIN, cellKey(), chooseCell(), file (+27 more)

### Community 12 - "g1-1 Human-Seed Search Findings"
Cohesion: 0.09
Nodes (23): One-off gain from how the car is angled at the finish line, g1-5 fine key timing, g1-6 off-policy learner, g1-7 computed racing line, g2-1 reference-free inputs, g2-2 track generator, g2-3 explore and adapt, g2-4 lookahead driving (+15 more)

### Community 13 - "g2-4 Lookahead Drive Tests"
Cohesion: 0.09
Nodes (21): check(), finish(), same(), ROOT, saved, TMP, dead, invariants() (+13 more)

### Community 14 - "g2-4 Lookahead Drive Script"
Cohesion: 0.09
Nodes (23): a, marks, policy, args, opt, policy, settings, track (+15 more)

### Community 15 - "g2-1 Reference-Free Route Design"
Cohesion: 0.12
Nodes (18): Missing speed profile from curvature, Changes needed in RacingEnv to use the route reference, Validation of route against fastest human lap on 17 official tracks, g2-1 independent tests (TESTING.md), Observation: route floats 0.5 to 1.1 units off curved surfaces, test_3: g2-1 route on a g2-2 generated track, compare_g21: g2-1 route finder as second opinion, Difficulty as a knob on the piece mix (+10 more)

### Community 16 - "g1-2 Stitch Laps Script"
Cohesion: 0.06
Nodes (27): acceptCost, args, attempts, bestOf, checkMs, finishMode, followOptions, free (+19 more)

### Community 17 - "g1-6 Off-Policy RL Write-up"
Cohesion: 0.08
Nodes (15): Changed after independent testing, Changes needed elsewhere, Design, and why, Files, g1-6: off-policy distributional learner, rewarded for progress only, How to run, Not done or not tested, What a full run would cost (+7 more)

### Community 18 - "Policy Node Scoring"
Cohesion: 0.10
Nodes (26): Files, [actorFile, obsFile, outFile, size], all, bytes, obsSize, out, policy, forward() (+18 more)

### Community 19 - "Section Search Script"
Cohesion: 0.07
Nodes (26): args, best, finalString, minScore, mutateOptions, opt, outFile, passes (+18 more)

### Community 20 - "Shared Contract and Block Rollout"
Cohesion: 0.12
Nodes (23): Blind replay of human keys from an inexact state does not survive (g1-2), Block decision format [steer, steerAt, w, wAt, s, sAt] per 50 ms, block_rollout.mjs (openBlockEnv, fromStart, roll), shared lap_paths.mjs (recordPath, mismatch, follow), shared laps_bc.py (imitation examples from several laps), laps.mjs (laps in one form, conversions), shared lookahead.mjs (driveLap), policy.mjs (loadPolicy, loadValue, createRng) (+15 more)

### Community 21 - "g1-7 Racing Line Results"
Cohesion: 0.14
Nodes (24): g1-7 computed racing line README, Where it could pay: tracks with flat braking zones, Fitted car model (car_model.mjs / car_model.json), check_turn_limit.mjs (pad limit vs human laps, ratio 1.00), compare_human.mjs (calibration against the human lap), Result: computed line lap 22.083 s vs human 21.750 s, drive_line.mjs (pure-pursuit tracker driving the line), fit_car.mjs (car experiments on the pad) (+16 more)

### Community 22 - "g1-3 Rounds Driver"
Cohesion: 0.23
Nodes (29): paths(), seconds(), at(), attemptsOf(), ckptSteps(), createState(), dropLock(), existingCopies() (+21 more)

### Community 23 - "Shared Modules Overview"
Cohesion: 0.09
Nodes (18): t(), mesh(), What was verified, `block_rollout.mjs` — rollouts in the training environment (needs a reference lap), `laps.mjs` — laps in one form, and conversions (no simulator), Modules, `policy.mjs` — a block policy and its value estimate in Node, Rules for working side by side (+10 more)

### Community 24 - "Headless Simulator and Human Traces"
Cohesion: 0.15
Nodes (11): CACHE, What is not done or not tested, Acceptance tests, Headless PolyTrack 0.6.3 simulator (sim/), track, Env, loadTrack(), decodeState() (+3 more)

### Community 25 - "g2-1 Observation Layout"
Cohesion: 0.08
Nodes (23): LOOKAHEAD_POINTS, OBS_CONTACT, OBS_CURVATURE, OBS_EDGE_AHEAD, OBS_EDGE_NOW, OBS_FLIGHT, OBS_FRACTION, OBS_FRAME (+15 more)

### Community 26 - "Track Geometry and Voxels"
Cohesion: 0.17
Nodes (23): partTriangles(), partVoxels(), voxelCache, voxelKey(), worldTriangles(), loadCaptured(), buildPath(), decodeSaveString() (+15 more)

### Community 27 - "g1-3 Driver Tests"
Cohesion: 0.08
Nodes (24): build(), changed, ckpts, COPIES, D, driveOne(), drives, fin() (+16 more)

### Community 28 - "g1-4 Beam Search Core"
Cohesion: 0.08
Nodes (26): alongBin, args, ask(), BEAM, elapsed(), elite, incumbent, latBin (+18 more)

### Community 29 - "g1-4 Test Harness"
Cohesion: 0.10
Nodes (16): check(), failed, finish(), passed, same(), throws(), a, b (+8 more)

### Community 30 - "g1-5 Simulator Child and Headline Tests"
Cohesion: 0.13
Nodes (17): { check, note }, CLAIMS, attempt(), ladder, prepare(), samePrefix(), snapshot(), { check, eq, note } (+9 more)

### Community 31 - "g1-3 Copy Picking and Train Plan"
Cohesion: 0.10
Nodes (26): chooseExamples(), parseArgs(), pickCopy(), resultsText(), trainPlan(), Changed after independent testing, Changes needed elsewhere, Cost of a full run (+18 more)

### Community 32 - "g1-1 Section Worker"
Cohesion: 0.16
Nodes (25): change(), dist2(), drive(), driveTail(), driveTo(), faster(), pos, pose (+17 more)

### Community 33 - "g1-7 Car Model Fitting"
Cohesion: 0.09
Nodes (21): accelRun, accelW, binBySpeed(), brake, brakeRun, coast, coastRun, entries (+13 more)

### Community 34 - "RacingEnv Core"
Cohesion: 0.20
Nodes (6): Changes needed elsewhere, Changes needed elsewhere, Facts that are easy to get wrong, actionToControls(), RacingEnv, sub()

### Community 35 - "g2-2 Track Driving"
Cohesion: 0.10
Nodes (23): follow(), attempt(), driveTrack(), dir, failed, files, [shard, shards], started (+15 more)

### Community 36 - "g1-7 Corridor Builder"
Cohesion: 0.12
Nodes (17): car, tracks, AIR_GUARD, along(), buildCorridor(), cross(), MARGIN, MAX_ROOM (+9 more)

### Community 37 - "g1-6 Python Test Helpers"
Cohesion: 0.11
Nodes (6): check(), finish(), b64(), part(), replica(), Spy

### Community 38 - "Rollout Search Script"
Cohesion: 0.11
Nodes (16): alter(), args, exported, name, opt, passes, randInt(), rng (+8 more)

### Community 39 - "g1-3 Test Harness"
Cohesion: 0.12
Nodes (19): check(), failed, finish(), passed, same(), throws(), PROJECT, SCRIPTS (+11 more)

### Community 40 - "Block Policy and Imitation Loss"
Cohesion: 0.11
Nodes (10): 1. What to rank by (`calibrate.mjs`), block_imitation_loss(), block_parts(), held_keys(), imitation_loss(), main(), save_checkpoint(), write_actor_weights() (+2 more)

### Community 41 - "g1-6 IQN Design Concepts"
Cohesion: 0.15
Nodes (16): Double Q-learning, dueling head, target network, Full run estimate: 10 to 50 million decisions, iqn.py (network, quantile Huber loss, actor file), iqn_server.mjs (RacingEnv server, epsilon-greedy actor), Linesight (Trackmania IQN agent), Status: no training run done, no lap time, replay.py (ring replay buffer, n-step returns), servers.py (start_rollout / finish_rollout / evaluate) (+8 more)

### Community 42 - "g1-1 Human-Seed Search Script"
Cohesion: 0.09
Nodes (17): args, best, opt, outDir, OWN, passes, seconds, sectionTicks (+9 more)

### Community 43 - "g1-7 Test Checks"
Cohesion: 0.17
Nodes (14): check(), fmt(), known(), near(), section(), accelAt(), car, crossing() (+6 more)

### Community 44 - "Timeline Search and RNG"
Cohesion: 0.11
Nodes (18): args, best, finalString, mutateOptions, opt, outFile, rng, runsDir (+10 more)

### Community 45 - "g2-1 Route Builder"
Cohesion: 0.19
Nodes (17): buildRoute(), flights(), runStage(), cross(), dist(), dot(), finishRoute(), gateStages() (+9 more)

### Community 46 - "Lap Fetching (Local Only)"
Cohesion: 0.10
Nodes (15): allOfficial, amount, args, get(), officialDir, opt, outDir, sleep() (+7 more)

### Community 47 - "Search Settings Tuning"
Cohesion: 0.11
Nodes (19): args, bigMoveChance, clamp(), current, extraChance, gaussian(), GLOBALS, mutateSettings() (+11 more)

### Community 48 - "Client Capture Verification"
Cohesion: 0.10
Nodes (7): byId, cap, ours, FIX, bootWorker(), DATA, decodeCaptured()

### Community 49 - "Project README and Determinism"
Cohesion: 0.10
Nodes (17): Driving and watching a lap, Layout, Polytrack-ML, Setup, Things that were not obvious, a, b, checks (+9 more)

### Community 50 - "g1-3 Restart Test"
Cohesion: 0.12
Nodes (18): ALL, BASES, check(), COPIES, cutLog, expect(), fullLog, fullText (+10 more)

### Community 51 - "g1-6 IQN Env Server"
Cohesion: 0.21
Nodes (17): b64(), begin(), decisionOf(), drive(), evaluate(), greedy(), handle(), HUMAN_DOING (+9 more)

### Community 52 - "g2-4 Lookahead Write-up"
Cohesion: 0.11
Nodes (20): Defects, Not fixed, Observations that are not defects, Cost of a full run, Design questions, Files, g2-4: look ahead while driving, How to run (+12 more)

### Community 53 - "g2-4 Log Tests"
Cohesion: 0.16
Nodes (19): cost(), early, finishedPlain, lazy, long, of(), one(), pair() (+11 more)

### Community 54 - "Package Config"
Cohesion: 0.10
Nodes (15): devDependencies, playwright-core, name, private, scripts, capture, setup, test (+7 more)

### Community 55 - "g1-2 Lap Paths and Mismatch"
Cohesion: 0.23
Nodes (15): angleBetween(), crossings(), locate(), mismatch(), MISMATCH_WEIGHTS, MOTION_GAP, planRoute(), sectionTimes() (+7 more)

### Community 56 - "g1-5 Fine Timing Test Findings"
Cohesion: 0.16
Nodes (17): child.mjs (simulator process: prepare / try, save-state ladder), fine.mjs (nudge, shiftTail, subTick, pool wrapper), subTick() sub-tick lap time estimate, g1-5 independent tests (TESTING.md), Hazard: a child that throws leaves the parent waiting for ever, Defect: smoothness.mjs flips=1 crashed (0/0 NaN), fixed, Check: save-state ladder never starts from a stale state, Position inside the finish tick makes a human lap improvable (g1-1) (+9 more)

### Community 57 - "g1-7 Racing Line Optimiser"
Cohesion: 0.24
Nodes (18): speedFor(), curvature(), dot(), optimiseLine(), optimiseTime(), shiftedPoints(), speedProfile(), sub() (+10 more)

### Community 58 - "g2-3 Logic Tests"
Cohesion: 0.11
Nodes (14): BUDGETS, CELL_LENGTH, CELL_WIDTH, cellKey, GAIN, HERE, keys, logs (+6 more)

### Community 59 - "RacingEnv Actions and Block Test"
Cohesion: 0.13
Nodes (15): tracks, controlsKey(), controlsToAction(), dot(), LOOKAHEAD_POINTS, NUM_ACTIONS, OBS_PEDAL_OPEN, OBS_S_HELD (+7 more)

### Community 60 - "g1-5 Smoothness Probe"
Cohesion: 0.11
Nodes (15): count, from, horizons, inRange, lap, overall, plane, rows (+7 more)

### Community 61 - "Env Server Client (Python)"
Cohesion: 0.14
Nodes (4): EnvServer, collect(), losses(), main()

### Community 62 - "g1-2 Donor Following"
Cohesion: 0.21
Nodes (13): carState(), compare(), corrections(), donorKeys(), follow(), FOLLOW_DEFAULTS, NONE, stateAt() (+5 more)

### Community 63 - "g1-4 Beam Child Process"
Cohesion: 0.17
Nodes (12): candidates(), canonical(), dot(), ensureCar(), features(), freshStart(), handlers, nodes (+4 more)

### Community 64 - "Recording Export and g1-5 Child Tests"
Cohesion: 0.12
Nodes (13): { check, eq, note }, inputs, lap, decoded, firstMismatch, key(), [name = 'summer1', run = 'baseline'], recording (+5 more)

### Community 65 - "g2-1 Surface and Plot Dump"
Cohesion: 0.18
Nodes (10): humanTrace(), info, nodes, route, surface, buildSurface(), near(), CellMap (+2 more)

### Community 66 - "g2-5 Memory Smoke Test"
Cohesion: 0.13
Nodes (13): check(), crash, doomedFrom, edges, far, first, log, memory (+5 more)

### Community 67 - "Idea Agents Brief"
Cohesion: 0.13
Nodes (10): Brief for the idea agents, Deliverables: runnable code plus README per idea, Find your way around, Orchestrator plus twelve idea agents, Rules, ideas/shared and CONTRACT.md (orchestrator-owned), The project, What to deliver (+2 more)

### Community 68 - "g1-5 Refine Search"
Cohesion: 0.12
Nodes (14): accepted, best, bestScore, from, lap, moves, passes, plane (+6 more)

### Community 70 - "g1-3 Rounds Library"
Cohesion: 0.22
Nodes (12): concludeRound(), copiesToTest(), DEFAULTS, ID, parseAttempt(), parseSearchLog(), summariseCopy(), Stop rule (minGain 10 ms, patience 2) (+4 more)

### Community 71 - "g1-4 Beam Tests"
Cohesion: 0.16
Nodes (13): a, b, BEAM, c, d, e, f, files() (+5 more)

### Community 72 - "Node Env Server"
Cohesion: 0.21
Nodes (10): actionRng, b64(), handle(), layerTanh(), loadActor(), options, rollout(), sampleAction() (+2 more)

### Community 73 - "g1-2 Test Findings"
Cohesion: 0.20
Nodes (12): Changes needed elsewhere, restore(), snapshot(), Tests of g1-2 (independent tester), Defects found, Headline claim, Headline claim holds: desert4 21.730 s reproduced key for key, Defect (fixed): stitch_laps exited 0 on NO LAP (+4 more)

### Community 74 - "Test Runners (g1-3, g2-3)"
Cohesion: 0.16
Nodes (8): HERE, PROJECT, t0, KNOWN, TESTS, ROOT, STAGES, t0

### Community 75 - "g1-5 Fine Timing Findings"
Cohesion: 0.23
Nodes (7): g1-5 fine key timing README, Result: best human lap 21.750 -> 21.722 s, verified, refine.mjs (flip-timing search, verified lap out), Result: searched lap 21.907 s, 0 ms gained, smoothness.mjs (lap time vs one flip's time), Headline claim holds: 21.722 s lap replays and verifies, Lap time is jagged at the millisecond level (g1-5)

### Community 76 - "g1-6 Replica Check"
Cohesion: 0.14
Nodes (10): actions, dump, episodeStartArc, finishTicks, now, obs, reasons, rewards (+2 more)

### Community 77 - "g2-5 Attempts and Memory Env"
Cohesion: 0.16
Nodes (10): args, report, rng, rows, started, MEMORY_DEFAULTS, MEMORY_OBS_SIZE, MEM_SIZE (+2 more)

### Community 78 - "MemoryEnv Class"
Cohesion: 0.22
Nodes (4): MemoryEnv, Not done, not tested, What is remembered, exactly, Not covered, and why

### Community 79 - "g1-3 Real Smoke Test"
Cohesion: 0.21
Nodes (11): IDEA_DIR, at(), cleanUp(), keep, launch(), ours(), p, PROJECT (+3 more)

### Community 80 - "g1-4 Pruning and Rank Tests"
Cohesion: 0.23
Nodes (11): prune(), same(), ranks(), spearman(), Diversity buckets and per-process share in pruning, Did the README's claims hold?, Note: the elite does not count towards its bucket, g1-4 beam search: independent tests (+3 more)

### Community 81 - "g1-4 Ranking Calibration"
Cohesion: 0.18
Nodes (10): args, HORIZONS, N, opt, rng, seed(), starts, states (+2 more)

### Community 82 - "Test Runners (g1-7, g2-1)"
Cohesion: 0.15
Nodes (10): failures, files, here, root, started, failures, files, here (+2 more)

### Community 83 - "g2-2 Track Generator Write-up"
Cohesion: 0.17
Nodes (11): 1. The piece table, 2. The generator, 3. Is a generated track real?, 4. Output, and pointing training at it, Changes made by the tester, Changes needed elsewhere, Cost of a full run, Files (+3 more)

### Community 84 - "g2-3 Simulator Tests"
Cohesion: 0.19
Nodes (7): check(), finish(), same(), HERE, ROOT, TMP, written

### Community 85 - "g2-5 Memory Env Tests"
Cohesion: 0.21
Nodes (9): check(), finish(), known(), draw, expectedLengths, lengths, OFF, policy (+1 more)

### Community 86 - "g2-5 Attempts Tests"
Cohesion: 0.15
Nodes (8): same(), a, b, crashed, expected, printed, ROOT, table

### Community 87 - "g2-5 Track Memory Tests"
Cohesion: 0.22
Nodes (6): closeTo(), near(), BIN, DOOM_MS, GLOBALS, PER_POINT

### Community 88 - "All-Ideas Test Runner"
Cohesion: 0.17
Nodes (11): folders, IDEAS, killTree(), LOGS, results, ROOT, runFolder(), t0 (+3 more)

### Community 89 - "g1-7 Car Model and Test Pad"
Cohesion: 0.32
Nodes (8): fill(), GRAVITY, loadCarModel(), buildPad(), PLATE_CELLS, PLATE_UNITS, pad, loadCarModel()

### Community 90 - "g1-2 Trace Scratch"
Cohesion: 0.18
Nodes (10): [i,j,k], [name, join, opts='{}', every='5'], paths, t0, { ticks }, trace(), track, renewCar() (+2 more)

### Community 91 - "g1-5 Sub-Tick Scoring"
Cohesion: 0.25
Nodes (11): better(), listFlips(), makePlane(), openSims(), subTick(), scoreOf(), Defects found, Not covered, and why (+3 more)

### Community 92 - "g1-5 Write-up Sections"
Cohesion: 0.18
Nodes (11): Changes needed elsewhere, Cost of a full run, Files, g1-5: fine key timing (1 ms), How to run, Not done, not tested, Smoke test 1: searched lap, flips from 18.0 s to the finish, Smoke test 2: best human lap, flips from 17.75 s to the finish (+3 more)

### Community 93 - "g1-6 Author Tests"
Cohesion: 0.25
Nodes (8): check(), failed, finish(), passed, same(), throws(), PROJECT, SCRIPTS

### Community 94 - "g1-7 Racing Line Tests"
Cohesion: 0.22
Nodes (6): TOLERANCE, within(), cross(), makeCorridor(), unit(), UP

### Community 95 - "g1-7 Write-up Sections"
Cohesion: 0.18
Nodes (11): 1. The fitted car (flat pad, `car_model.json`), 2. The corridor, 3. The line and the speed profile, 4. Against the human lap (desert4, 21.750 s), Changes needed elsewhere, Cost of a full run, g1-7: a computed racing line, How to run (from the project root) (+3 more)

### Community 96 - "Shared Change Requests"
Cohesion: 0.18
Nodes (8): Changes needed elsewhere, g1-3-search-train-rounds — imitation examples from several laps, g1-3-search-train-rounds — search_round.sh is not safe to rerun after an interruption, g1-7-computed-racing-line — fitted car model, flat test pad, corridor around any finishing lap, g2-2-track-generator — loadTrack cannot take a track that is not in data/ or vendor/, g2-4-lookahead-driving — a lookahead driver others can call; RacingEnv speed, orchestrator — duplication found in phase 2 that nobody reported, Requests to the orchestrator

### Community 97 - "g1-7 Human Comparison"
Cohesion: 0.20
Nodes (5): car, human, kappaHuman, out, [track = 'desert4', lapIndex = '0']

### Community 98 - "g2-1 Write-up Sections"
Cohesion: 0.20
Nodes (10): Cost of a full run, g2-1: inputs that need no human lap, How the route is found, How to run, Not done, not tested, Result in short, Smoke tests, The files (+2 more)

### Community 99 - "Reference Memory"
Cohesion: 0.31
Nodes (5): attempt(), edgesNow(), RefMemory, sample(), clip()

### Community 100 - "Simulator Worker Entry"
Cohesion: 0.29
Nodes (6): handleControl(), memories, physicsBytes(), restoreSnapshot(), snapshots, takeSnapshot()

### Community 101 - "Save-State Ladder Test"
Cohesion: 0.22
Nodes (9): body(), fractions, human, keys, resetTimes, same(), t0, THROTTLE (+1 more)

### Community 102 - "Rollout Child Process"
Cohesion: 0.27
Nodes (6): decide(), GROUPS, layerTanh(), prefix, prepare(), scoresFor()

### Community 103 - "g1-1 Worker Tests"
Cohesion: 0.33
Nodes (8): ask(), before(), { check, eq, note }, inputs, lap0, replay(), searchSection(), valid()

### Community 104 - "g1-2 Tuning Scratch"
Cohesion: 0.22
Nodes (8): recordPath(), spinBetween(), joins, [name, ...rest], paths, settings, { ticks }, track

### Community 105 - "g1-2 Write-up Sections"
Cohesion: 0.22
Nodes (9): g1-2: stitch a lap from the fastest sections of several human laps, How it works, How often a join survives, Not done, not tested, Section times and the theoretical best, Stitched laps, The cost of repair, What a full run would cost (+1 more)

### Community 106 - "g1-4 Beam Search Findings"
Cohesion: 0.36
Nodes (5): Beam of partial laps as save states, extended one 50 ms decision at a time, Next step: a learned ranking fitted to finish times, Periodic rollouts to the finish for a real lap time, Ranking measures (progress, value, look H, lookvalue H), Check: beam=1 returns the starting lap exactly

### Community 107 - "g1-4 Write-up Sections"
Cohesion: 0.22
Nodes (9): 2. The beam on one stretch, three rankings, 3. Against the 21.907 s lap (`from=runs/rollout_desert4.json`), 4. Checks, A full run: cost and what it might gain, Changes needed elsewhere, g1-4: beam search over block decisions, How to run, Not done or not tested (+1 more)

### Community 108 - "TrackMemory Class"
Cohesion: 0.31
Nodes (4): 5. Speed, memory, tick budget, filled(), clip(), TrackMemory

### Community 110 - "g1-1 Write-up Sections"
Cohesion: 0.25
Nodes (8): Changes needed elsewhere, g1-1: search from the human's lap, How to run, Not done, not tested, The idea, What a longer run would probably do, What happens to the rest of the lap (the open problem), What was tested, with numbers

### Community 111 - "g1-2 Stitching Concepts"
Cohesion: 0.43
Nodes (4): Best-of-sections theoretical bound (not a close one), Plan: dynamic programming over (boundary, lap) with switch cost, Section boundaries: planes across the road every 250 ms, State mismatch in millisecond-equivalents

### Community 112 - "g1-7 Drive Line Script"
Cohesion: 0.25
Nodes (7): args, createCar, file, lines, options, settings, [track = 'desert4', which = 'all']

### Community 113 - "g2-3 Run Analysis"
Cohesion: 0.25
Nodes (6): BACK_EDGES, BUDGETS, dir, groups, restarts, runs

### Community 114 - "g2-5 Test Runner"
Cohesion: 0.25
Nodes (3): ROOT, STAGES, t0

### Community 115 - "g2-5 Toy Probe"
Cohesion: 0.32
Nodes (3): myopic(), p_through(), play()

### Community 116 - "Track Check Script"
Cohesion: 0.25
Nodes (4): args, checkpoint, driven, positional

### Community 117 - "g1-4 Test Runner"
Cohesion: 0.38
Nodes (5): HERE, PROJECT, t0, KNOWN, TESTS

### Community 118 - "g1-5 Fine Moves"
Cohesion: 0.43
Nodes (6): copy(), MOVABLE, nudge(), parseArgs(), shiftTail(), Headline claim

### Community 119 - "g1-6 Test Runner"
Cohesion: 0.38
Nodes (5): HERE, PROJECT, t0, KNOWN, TESTS

### Community 120 - "Ideas Overview and Goals"
Cohesion: 0.29
Nodes (7): Goal 1: beat the human lap on one track, Goal 2: a generalist for any track, Overnight results, 10 October 2026 (added by the main session), Shared code, Tests, The ideas, Twelve ideas: what came out

### Community 121 - "Policy Evaluation Script"
Cohesion: 0.33
Nodes (3): main(), parse_args(), torch>=2.2

### Community 122 - "g2-2 Test Runner"
Cohesion: 0.33
Nodes (5): failures, files, here, root, started

### Community 123 - "g2-4 Test Runner"
Cohesion: 0.33
Nodes (3): ROOT, STAGES, t0

### Community 124 - "Shared Process Pool"
Cohesion: 0.40
Nodes (4): Shared code consolidation (promotions, duplicates removed), createPool(), { check }, timeout

### Community 126 - "g2-3 Test Hook"
Cohesion: 0.40
Nodes (4): freshAfter, history, m, marked

## Knowledge Gaps
- **818 isolated node(s):** `numpy>=1.26`, `MUTABLE`, `MUTATE_DEFAULTS`, `Other claims in the README`, `1. The fitted car (flat pad, `car_model.json`)` (+813 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1199 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RacingEnv` connect `RacingEnv Core` to `g2-3 Explore-and-Adapt Design`, `g2-5 Memory Agent (Python)`, `g2-2 Generator Driver Defaults`, `g2-3 Explore Cell Archive Code`, `g2-4 Lookahead Drive Script`, `g2-1 Reference-Free Route Design`, `g1-6 Off-Policy RL Write-up`, `Headless Simulator and Human Traces`, `g1-6 IQN Env Server`, `g2-4 Lookahead Write-up`, `g1-2 Lap Paths and Mismatch`, `RacingEnv Actions and Block Test`, `Node Env Server`, `g1-6 Replica Check`, `g2-5 Attempts and Memory Env`, `g2-2 Track Generator Write-up`, `Shared Change Requests`, `g2-1 Write-up Sections`, `Save-State Ladder Test`, `Rollout Child Process`, `TrackMemory Class`, `Ideas Overview and Goals`, `g2-3 Test Hook`?**
  _High betweenness centrality (0.108) - this node is a cross-community bridge._
- **Why does `Changes needed elsewhere` connect `RacingEnv Core` to `Shared Change Requests`, `g2-5 Memory Agent (Python)`, `Idea Agents Brief`, `Simulator Worker Entry`, `Rollout Search Script`, `Node Env Server`, `g1-1 Human-Seed Search Findings`, `Timeline Search and RNG`, `MemoryEnv Class`, `Headless Simulator and Human Traces`, `Ideas Overview and Goals`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Why does `loadTrack()` connect `Headless Simulator and Human Traces` to `g2-2 Track Generator Bulk Check`, `Idea Test Suites (g1-2, g1-3, g1-5)`, `Section Comparison Scripts`, `g1-1 Test Runner and Script Tests`, `g2-4 Lookahead Drive Tests`, `g1-2 Stitch Laps Script`, `Section Search Script`, `Track Geometry and Voxels`, `g1-5 Simulator Child and Headline Tests`, `g1-1 Section Worker`, `RacingEnv Core`, `g1-7 Corridor Builder`, `g1-7 Test Checks`, `Timeline Search and RNG`, `Lap Fetching (Local Only)`, `Search Settings Tuning`, `Client Capture Verification`, `Project README and Determinism`, `RacingEnv Actions and Block Test`, `g1-2 Donor Following`, `Recording Export and g1-5 Child Tests`, `g2-2 Track Generator Write-up`, `g2-3 Simulator Tests`, `g1-2 Trace Scratch`, `Save-State Ladder Test`, `g1-1 Worker Tests`, `g1-2 Tuning Scratch`, `g1-7 Drive Line Script`, `Ideas Overview and Goals`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Are the 17 inferred relationships involving `RacingEnv` (e.g. with `5. Speed, memory, tick budget` and `Design, and why`) actually correct?**
  _`RacingEnv` has 17 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `Env` (e.g. with `What is not done or not tested` and `Layout`) actually correct?**
  _`Env` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `loadTrack()` (e.g. with `4. Output, and pointing training at it` and `What is not done or not tested`) actually correct?**
  _`loadTrack()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `numpy>=1.26`, `MUTABLE`, `MUTATE_DEFAULTS` to the rest of the system?**
  _818 weakly-connected nodes found - possible documentation gaps or missing edges._