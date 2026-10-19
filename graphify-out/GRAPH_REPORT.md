# Graph Report - Polytrack-ML  (2026-10-18)

## Corpus Check
- 476 files · ~484,210 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 99 file(s) not represented in the graph (top: .log 60, .result 17, .jsonl 15)

## Summary
- 2868 nodes · 6351 edges · 157 communities (128 shown, 29 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 408 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `28793098`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Lookahead driver (driveLap)
- env.mjs
- check_track.mjs
- test_3_under_road_sim.mjs
- ReplayBuffer
- refine.mjs
- laps.mjs
- torch
- lib.mjs
- shared/policy.mjs
- g1-4-beam-search/tests/test_child.mjs
- ref_node_url
- test_worker.mjs
- track.mjs
- test_1_pieces.mjs
- test_logs.mjs
- explore.mjs
- train_ppo.py
- rounds.mjs
- stitch_laps.mjs
- validate.mjs
- attempts.mjs
- g1-6-offpolicy-rl/README.md
- compare_human.mjs
- shared/tests/harness.mjs
- recording.mjs
- test_4_sim.mjs
- polytrack_env.py
- RacingEnv
- observation.mjs
- test_driver.mjs
- beam.mjs
- test_lock.mjs
- g1-7 computed racing line README
- fit_car.mjs
- rotate
- env_server.mjs
- paths.mjs
- search_rollout.mjs
- test_5_corridor_sim.mjs
- search_sections.mjs
- search_human.mjs
- test_restart.mjs
- Agent
- search_settings.mjs
- Polytrack-ML refactor plan
- capture_init.mjs
- iqn_server.mjs
- raceline.mjs
- plot_dump.mjs
- g2-3-explore-and-adapt/tests/test_logic.mjs
- generate.mjs
- g1-4-beam-search/child.mjs
- Twelve ideas: what came out (ideas/README.md)
- The models
- tune.mjs
- Route built from track geometry alone
- memory_test.mjs
- test_memory_env.mjs
- section_worker.mjs
- g2-2-track-generator/smoke_test.mjs
- corridor.mjs
- g1-5 fine key timing README
- createRng
- MemoryEnv
- g1-7 independent tests (TESTING.md)
- test_beam.mjs
- ref_node_fs
- prune
- diff_capture.mjs
- Polytrack-ML
- test_follow.mjs
- calibrate.mjs
- .load
- rollout_child.mjs
- run_all_tests.mjs
- fingerprint.mjs
- BRIEF.md
- smoke_real.mjs
- g1-7-computed-racing-line/car_model.mjs
- Polytrack-ML
- README.md
- ppo_rays (17 distance rays)
- plan.md
- trace.mjs
- g1-4: beam search over block decisions
- replica_check.mjs
- g1-7: a computed racing line
- rl/smoke_test.mjs
- ladder_test.mjs
- g1-5: fine key timing (1 ms)
- search.mjs
- ._observe
- g2-3 Explore and adapt
- progress
- buildRoute
- search_timeline.mjs
- worker_entry.mjs
- test_network
- ppo_blkgen2 / ppo_blkgen.best2.pt (best generalist)
- g1-2: stitch a lap from the fastest sections of several human laps
- g2-5-memory-policy/README.md
- test_track_memory.mjs
- SimSession
- g1-4-beam-search/tests/TESTING.md
- g1-2-stitch-human-laps/README.md
- g1-4-beam-search/README.md
- analyze.mjs
- toy_probe.py
- g2-1: inputs that need no human lap
- g2-2-train_route_on_generated.sh
- Goal 2: generalist for any track
- g2-4: look ahead while driving
- TrackMemory
- g1-3-train_on_candidates.sh
- g2-2-eval_route_on_generated.sh
- test_1_raceline.mjs
- Requests to the orchestrator (ideas/shared/REQUESTS.md)
- g1-2-run_all.sh
- train_memory.sh
- g2-2-make_set.sh script
- queue_unfinished.sh
- g1-1-human-seed-search/README.md
- numpy
- set3_round2.sh
- Local use only rule (no bot lap submission)
- Ten-attempt test (seeds 10-19 + greedy)
- finetune_plan.sh
- smoke_test.sh
- eval_block_specialist.sh
- eval_generalist.sh
- train_block_specialist.sh
- Eager pump in worker_entry
- eval_memory.sh
- g1-6-offpolicy-rl/tests/run_tests.mjs
- test_4_car_vs_sim.mjs
- fetch_laps.mjs
- .demo
- g1-4-beam-search/tests/run_tests.mjs
- g2-5-memory-policy/tests/run_tests.mjs
- RefMemory
- hook.mjs
- train_route_generalist.sh
- eval_route_generalist.sh
- finetune_run.sh
- g1-4 beam search
- search_round.sh
- train_block_specialist_from.sh
- g1-3 search-train rounds README
- stepBlock: one message per 50 ms block
- rl/: reinforcement learning on the headless simulator
- g1-3-search-train-rounds/tests/run_tests.mjs
- widen_checkpoint.py
- queue_untried.sh

## God Nodes (most connected - your core abstractions)
1. `RacingEnv` - 70 edges
2. `loadTrack()` - 61 edges
3. `Env` - 59 edges
4. `decodeState()` - 45 edges
5. `createRng()` - 38 edges
6. `rotate()` - 36 edges
7. `generateTrack()` - 34 edges
8. `SimSession` - 32 edges
9. `loadTrackInfo()` - 31 edges
10. `humanLaps()` - 28 edges

## Surprising Connections (you probably didn't know these)
- `Coding conventions` --references--> `best()`  [INFERRED]
  CLAUDE.md → ideas/g2-5-memory-policy/tests/test_agent.py
- `Phase 4 (optional, only with Phase 5 of "What is next"): split `racing_env.mjs`` --references--> `RacingEnv`  [INFERRED]
  docs/refactor/plan.md → rl/racing_env.mjs
- `Design, and why` --references--> `RacingEnv`  [INFERRED]
  ideas/g1-6-offpolicy-rl/README.md → rl/racing_env.mjs
- `Plain policy on the unseen tracks (baseline)` --references--> `RacingEnv`  [INFERRED]
  ideas/g2-4-lookahead-driving/README.md → rl/racing_env.mjs
- `Defects` --references--> `RacingEnv`  [INFERRED]
  ideas/g2-5-memory-policy/tests/TESTING.md → rl/racing_env.mjs

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Block-scheme model lineage** — docs_model_history_ppo_block_bc, docs_model_history_ppo_blk, docs_model_history_ppo_blkgen, docs_model_history_ppo_blkgen2, docs_model_history_ppo_gblk, docs_model_history_ppo_g3blk, docs_model_history_ppo_sr [EXTRACTED 1.00]
- **g1-3 round decisions in lib.mjs** — ideas_g1_3_search_train_rounds_lib, ideas_g1_3_search_train_rounds_readme_pickcopy_rule, ideas_g1_3_search_train_rounds_readme_concluderound, ideas_g1_3_search_train_rounds_readme_trainplan, ideas_g1_3_search_train_rounds_readme_carry_fastest_verified [EXTRACTED 1.00]
- **Methods that got under the human lap on desert4 (all from human keys)** — ideas_readme_g1_1_human_seed_search, ideas_readme_g1_2_stitch_human_laps, ideas_readme_g1_5_fine_key_timing, ideas_readme_human_lap_retiming_caveat [EXTRACTED 1.00]
- **Modules promoted from idea folders to ideas/shared in phase 2** — ideas_shared_car_model, ideas_shared_track_build, ideas_shared_route_progress, ideas_shared_lookahead, ideas_shared_lap_paths, ideas_shared_laps_bc, ideas_shared_contract_promoted_modules [EXTRACTED 1.00]
- **Ground-under-the-road trap: progress and finishes credited off the road** — ideas_g2_1_reference_free_inputs_tests_testing_progress_under_raised_road_defect, ideas_g2_2_track_generator_readme_drivable_ground_at_height_0, ideas_g2_2_track_generator_tests_testing_drivetrack_ground_level_false_finish_fix, ideas_g2_2_track_generator_tests_testing_watchlap_road_under_car, ideas_g2_1_reference_free_inputs_tests_testing_under_road_test_on_generated_track [EXTRACTED 1.00]
- **Old-scheme (10 ms) model lineage** — docs_model_history_ppo_summer1, docs_model_history_ppo_general, docs_model_history_ppo_general2, docs_model_history_ppo_general3, docs_model_history_ppo_rays, docs_model_history_ppo_spec, docs_model_history_ppo_spec2, docs_model_history_ppo_follow [EXTRACTED 1.00]
- **Refactor phases under bit-identical constraint** — docs_refactor_plan_phase1_bug_fixes, docs_refactor_plan_phase2_shared_constants, docs_refactor_plan_phase3_dedup, docs_refactor_plan_fingerprint, docs_refactor_plan_bit_identical_constraint [EXTRACTED 1.00]
- **Independent testers' defect reports across idea folders** — ideas_g1_5_fine_key_timing_tests_testing_defect_smoothness_flips1, ideas_g1_6_offpolicy_rl_tests_testing_defect_eval_lap_replay, ideas_g1_7_computed_racing_line_tests_testing_defect_brake_steering, ideas_shared_tests_testing_defect_simsession_load [INFERRED 0.85]
- **Reference-free generalist pipeline: geometric route, generated tracks, attempt memory** — ideas_g2_1_reference_free_inputs_readme_geometric_route, ideas_g2_1_reference_free_inputs_readme_observation_334, ideas_g2_2_track_generator_readme_chain_generator, ideas_g2_5_memory_policy_readme_track_memory_map, ideas_g2_5_memory_policy_readme_curriculum [INFERRED 0.85]
- **Node environment to Python PPO training pipeline** — sim_env, rl_racing_env, rl_env_server, rl_polytrack_env, rl_train_ppo, rl_evaluate [INFERRED 0.85]
- **Three ways to get the generalist round unseen tracks (explore, lookahead, memory)** — ideas_g2_3_explore_and_adapt_readme_explore_loop, ideas_g2_4_lookahead_driving_readme_lookahead_driver, ideas_g2_5_memory_policy_readme_design_b_attempt_conditioned_inputs, ideas_g2_3_explore_and_adapt_readme_unseen_tracks_test_set, ideas_g2_3_explore_and_adapt_readme_ppo_blkgen_best2_generalist [INFERRED 0.85]

## Communities (157 total, 29 thin omitted)

### Community 0 - "Lookahead driver (driveLap)"
Cohesion: 0.12
Nodes (34): Fine-tune plan (dry run, not executed), Plain mode baseline (attempts from the start line), Generalist checkpoint ppo_blkgen.best2, Budget counted in simulated laps, Unseen test tracks: desert3, summer3, winter4, Result: winter4 explore 8 of 8 vs plain 0 of 8, g2-3 independent tests (TESTING.md), Car-replacement path forced by test hook (+26 more)

### Community 1 - "env.mjs"
Cohesion: 0.08
Nodes (19): What is not done or not tested, at3000, at4000, { check, eq, throws, note }, LEFT, motionA, track, FIX (+11 more)

### Community 2 - "check_track.mjs"
Cohesion: 0.25
Nodes (5): args, checkpoint, driven, flag(), positional

### Community 3 - "test_3_under_road_sim.mjs"
Cohesion: 0.08
Nodes (32): DEFAULTS, gateStages(), GRAVITY, RIDE_HEIGHT, SPACING, CACHE, routeFor(), check() (+24 more)

### Community 4 - "ReplayBuffer"
Cohesion: 0.10
Nodes (9): ReplayBuffer, check(), n_step_one(), test_n_step(), test_sampling(), buffer_from(), ground_truth_trial(), stream() (+1 more)

### Community 5 - "refine.mjs"
Cohesion: 0.06
Nodes (49): better(), copy(), listFlips(), makePlane(), MOVABLE, nudge(), openSims(), parseArgs() (+41 more)

### Community 6 - "laps.mjs"
Cohesion: 0.05
Nodes (72): a, marks, policy, t(), CACHE, humanTrace(), policy, seeds (+64 more)

### Community 7 - "torch"
Cohesion: 0.07
Nodes (25): main(), export_actor(), IQN, quantile_huber_loss(), Files, IqnServers, check(), main() (+17 more)

### Community 8 - "lib.mjs"
Cohesion: 0.11
Nodes (26): chooseExamples(), concludeRound(), copiesToTest(), DEFAULTS, ID, parseArgs(), parseAttempt(), parseSearchLog() (+18 more)

### Community 9 - "shared/policy.mjs"
Cohesion: 0.14
Nodes (18): [actorFile, obsFile, outFile, size], all, bytes, obsSize, out, policy, [actorFile, criticFile], out (+10 more)

### Community 11 - "g1-4-beam-search/tests/test_child.mjs"
Cohesion: 0.13
Nodes (11): check(), failed, finish(), passed, same(), throws(), alive, script() (+3 more)

### Community 12 - "ref_node_url"
Cohesion: 0.09
Nodes (18): PROJECT, PY, failures, files, here, root, started, failures (+10 more)

### Community 13 - "test_worker.mjs"
Cohesion: 0.17
Nodes (13): ask(), before(), { check, eq, note }, inputs, lap0, replay(), searchSection(), valid() (+5 more)

### Community 14 - "track.mjs"
Cohesion: 0.09
Nodes (34): pad, chooseTracks(), FEATURE_SETS, hasFeature(), structureFailures(), TEST_KINDS, TRAIN_CYCLE, saveTrack() (+26 more)

### Community 15 - "test_1_pieces.mjs"
Cohesion: 0.06
Nodes (39): count, firstSeed, LENGTHS, started, used, worst, checkOfficial(), matePorts() (+31 more)

### Community 16 - "test_logs.mjs"
Cohesion: 0.07
Nodes (34): check(), finish(), same(), ROOT, saved, TMP, dead, invariants() (+26 more)

### Community 17 - "explore.mjs"
Cohesion: 0.07
Nodes (35): archive, args, attempt(), BACK, BACK_MIN, cellKey(), chooseCell(), file (+27 more)

### Community 18 - "train_ppo.py"
Cohesion: 0.05
Nodes (9): MemoryAgent, ppo_loss(), write_actor(), How to run, What was verified, rel(), slow_reference(), compute_advantages() (+1 more)

### Community 19 - "rounds.mjs"
Cohesion: 0.18
Nodes (32): paths(), seconds(), alive(), at(), attemptsOf(), ckptSteps(), createState(), dropLock() (+24 more)

### Community 20 - "stitch_laps.mjs"
Cohesion: 0.06
Nodes (30): acceptCost, allowedCost(), args, attempts, banned, bestOf, checkMs, fallbacks (+22 more)

### Community 21 - "validate.mjs"
Cohesion: 0.11
Nodes (19): EVERY, describe(), dot(), fence(), locate(), nearest(), sub(), WINDOW (+11 more)

### Community 22 - "attempts.mjs"
Cohesion: 0.16
Nodes (12): args, KINDS, report, rng, rows, started, MEMORY_DEFAULTS, MEMORY_OBS_SIZE (+4 more)

### Community 23 - "g1-6-offpolicy-rl/README.md"
Cohesion: 0.10
Nodes (23): Changed after independent testing, Changes needed elsewhere, Design, and why, Double Q-learning, dueling head, target network, Full run estimate: 10 to 50 million decisions, g1-6: off-policy distributional learner, rewarded for progress only, How to run, iqn.py (network, quantile Huber loss, actor file) (+15 more)

### Community 24 - "compare_human.mjs"
Cohesion: 0.20
Nodes (5): car, human, kappaHuman, out, [track = 'desert4', lapIndex = '0']

### Community 25 - "shared/tests/harness.mjs"
Cohesion: 0.09
Nodes (24): { check, note }, clean(), runFiles, said, TMP, Tests of g1-1 (independent tester), Headline claims confirmed on all four tracks, { check, note } (+16 more)

### Community 26 - "recording.mjs"
Cohesion: 0.08
Nodes (31): { check, note }, CLAIMS, { check }, attempt(), ladder, prepare(), samePrefix(), snapshot() (+23 more)

### Community 27 - "test_4_sim.mjs"
Cohesion: 0.14
Nodes (21): loadGenerated(), check(), fmt(), near(), section(), decodeParts(), detectorBox(), gatesOf() (+13 more)

### Community 28 - "polytrack_env.py"
Cohesion: 0.06
Nodes (18): main(), parse_args(), expand_tracks(), _obs(), PolytrackEnv, PolytrackVecEnv, _random_policy_check(), track_label() (+10 more)

### Community 29 - "RacingEnv"
Cohesion: 0.15
Nodes (4): Changes needed elsewhere, tracks, actionToControls(), RacingEnv

### Community 30 - "observation.mjs"
Cohesion: 0.08
Nodes (24): createObserver(), LOOKAHEAD_POINTS, OBS_CONTACT, OBS_CURVATURE, OBS_EDGE_AHEAD, OBS_EDGE_NOW, OBS_FLIGHT, OBS_FRACTION (+16 more)

### Community 31 - "test_driver.mjs"
Cohesion: 0.08
Nodes (24): build(), changed, ckpts, COPIES, D, driveOne(), drives, fin() (+16 more)

### Community 32 - "beam.mjs"
Cohesion: 0.08
Nodes (26): alongBin, args, ask(), BEAM, elapsed(), elite, incumbent, latBin (+18 more)

### Community 33 - "test_lock.mjs"
Cohesion: 0.11
Nodes (20): IDEA_DIR, check(), failed, finish(), passed, same(), throws(), PROJECT (+12 more)

### Community 34 - "g1-7 computed racing line README"
Cohesion: 0.23
Nodes (11): g1-7 computed racing line README, Where it could pay: tracks with flat braking zones, Fitted car model (car_model.mjs / car_model.json), check_turn_limit.mjs (pad limit vs human laps, ratio 1.00), Result: computed line lap 22.083 s vs human 21.750 s, drive_line.mjs (pure-pursuit tracker driving the line), fit_car.mjs (car experiments on the pad), summer1: model does not explain the human (18% tighter turn) (+3 more)

### Community 35 - "fit_car.mjs"
Cohesion: 0.09
Nodes (21): accelRun, accelW, binBySpeed(), brake, brakeRun, coast, coastRun, entries (+13 more)

### Community 36 - "rotate"
Cohesion: 0.07
Nodes (35): follow(), laps, track, W_ONLY, toCarFrame(), follow(), attempt(), DRIVER_DEFAULTS (+27 more)

### Community 37 - "env_server.mjs"
Cohesion: 0.18
Nodes (15): actionRng, b64(), handle(), labelled(), MEMORY_KEYS, options, resetEpisode(), rollout() (+7 more)

### Community 38 - "paths.mjs"
Cohesion: 0.22
Nodes (18): carState(), compare(), NONE, angleBetween(), crossings(), locate(), mismatch(), MISMATCH_WEIGHTS (+10 more)

### Community 39 - "search_rollout.mjs"
Cohesion: 0.10
Nodes (17): alter(), args, exported, keepMs, name, near, opt, passes (+9 more)

### Community 40 - "test_5_corridor_sim.mjs"
Cohesion: 0.15
Nodes (12): check(), fmt(), known(), median(), near(), percentile(), section(), createCar (+4 more)

### Community 41 - "search_sections.mjs"
Cohesion: 0.08
Nodes (20): args, best, finalString, minScore, mutateOptions, opt, outFile, passes (+12 more)

### Community 42 - "search_human.mjs"
Cohesion: 0.08
Nodes (18): args, best, opt, outDir, OWN, passes, saveProgress(), seconds (+10 more)

### Community 43 - "test_restart.mjs"
Cohesion: 0.12
Nodes (18): ALL, BASES, check(), COPIES, cutLog, expect(), fullLog, fullText (+10 more)

### Community 44 - "Agent"
Cohesion: 0.07
Nodes (9): EnvServer, collect(), losses(), main(), Agent, block_imitation_loss(), block_parts(), held_keys() (+1 more)

### Community 45 - "search_settings.mjs"
Cohesion: 0.11
Nodes (19): args, bigMoveChance, clamp(), current, extraChance, gaussian(), GLOBALS, mutateSettings() (+11 more)

### Community 46 - "Polytrack-ML refactor plan"
Cohesion: 0.18
Nodes (12): Context, Deliberately not changing, Housekeeping (needs Henry's yes), Phase 1: Bug fixes (small, no effect on results), Phase 2: One source for each shared constant (about 30 lines, no effect on results), Phase 3: Deduplication (medium; each step gated by a fixed-seed comparison), Phase 4 (optional, only with Phase 5 of "What is next"): split `racing_env.mjs`, Polytrack-ML refactor plan (+4 more)

### Community 47 - "capture_init.mjs"
Cohesion: 0.10
Nodes (15): devDependencies, playwright-core, name, private, scripts, capture, setup, test (+7 more)

### Community 48 - "iqn_server.mjs"
Cohesion: 0.21
Nodes (18): b64(), begin(), decisionOf(), drive(), evaluate(), greedy(), handle(), HUMAN_DOING (+10 more)

### Community 49 - "raceline.mjs"
Cohesion: 0.24
Nodes (18): speedFor(), curvature(), dot(), optimiseLine(), optimiseTime(), shiftedPoints(), speedProfile(), sub() (+10 more)

### Community 50 - "plot_dump.mjs"
Cohesion: 0.19
Nodes (9): info, nodes, route, surface, buildSurface(), near(), CellMap, EDGE_CAP (+1 more)

### Community 51 - "g2-3-explore-and-adapt/tests/test_logic.mjs"
Cohesion: 0.08
Nodes (21): check(), finish(), same(), BUDGETS, CELL_LENGTH, CELL_WIDTH, cellKey, GAIN (+13 more)

### Community 52 - "generate.mjs"
Cohesion: 0.12
Nodes (38): BANKED_IDS, CHECKPOINT_WIDE, compositeEnds(), COMPOSITES, featurePieces(), FINISH_WIDE, flightDistance(), GRAVITY (+30 more)

### Community 53 - "g1-4-beam-search/child.mjs"
Cohesion: 0.17
Nodes (12): candidates(), canonical(), dot(), ensureCar(), features(), freshStart(), handlers, nodes (+4 more)

### Community 54 - "Twelve ideas: what came out (ideas/README.md)"
Cohesion: 0.18
Nodes (6): Twelve ideas: what came out (ideas/README.md), Caveat: sub-human laps are re-timed human laps, Five known test failures, Overnight results, 10 October 2026, Lap time is jagged at the millisecond, Position inside the finish tick (sub-tick measure)

### Community 55 - "The models"
Cohesion: 0.12
Nodes (17): 10. `ppo_blk_<track>`: "set 1", specialists from imitation only (6 Oct), 11. `ppo_blkgen`: block generalist (6 to 7 Oct), 12. `ppo_blkgen2`: blocked-lane cost and steering kicks (7 Oct), 13. `ppo_gblk_<track>`: "set 2", specialists from the generalist (7 to 8 Oct), 14. `ppo_g3blk_<track>`: "set 3", rules 1, 2 and 3 (8 Oct), 15. `ppo_sr1_<track>` and `ppo_sr2_<track>`: search, then train (8 to 10 Oct), 16. `g1-6-iqn_desert4`: off-policy learner (10 Oct), 1. `ppo_summer1`: first single-track agent (4 Oct) (+9 more)

### Community 56 - "tune.mjs"
Cohesion: 0.22
Nodes (9): corrections(), donorKeys(), follow(), joins, [name, ...rest], paths, settings, { ticks } (+1 more)

### Community 57 - "Route built from track geometry alone"
Cohesion: 0.07
Nodes (32): Missing speed profile from curvature, Changes needed in RacingEnv to use the route reference, Validation of route against fastest human lap on 17 official tracks, g2-1 independent tests (TESTING.md), g2-1 tests, Observation: route floats 0.5 to 1.1 units off curved surfaces, The README's claims, test_3: g2-1 route on a g2-2 generated track (+24 more)

### Community 58 - "memory_test.mjs"
Cohesion: 0.13
Nodes (13): check(), crash, doomedFrom, edges, far, first, log, memory (+5 more)

### Community 59 - "test_memory_env.mjs"
Cohesion: 0.10
Nodes (17): check(), finish(), known(), same(), a, b, crashed, expected (+9 more)

### Community 60 - "section_worker.mjs"
Cohesion: 0.18
Nodes (23): dist2(), drive(), driveTail(), driveTo(), faster(), pos, pose, quat (+15 more)

### Community 61 - "g2-2-track-generator/smoke_test.mjs"
Cohesion: 0.15
Nodes (11): deflate(), encodeExportString(), encodeSaveString(), partsToBytes(), wrap(), difficulty, rows, started (+3 more)

### Community 62 - "corridor.mjs"
Cohesion: 0.17
Nodes (13): car, tracks, AIR_GUARD, along(), buildCorridor(), cross(), MARGIN, MAX_ROOM (+5 more)

### Community 63 - "g1-5 fine key timing README"
Cohesion: 0.16
Nodes (15): g1-5 fine key timing README, child.mjs (simulator process: prepare / try, save-state ladder), fine.mjs (nudge, shiftTail, subTick, pool wrapper), Result: best human lap 21.750 -> 21.722 s, verified, refine.mjs (flip-timing search, verified lap out), Result: searched lap 21.907 s, 0 ms gained, smoothness.mjs (lap time vs one flip's time), subTick() sub-tick lap time estimate (+7 more)

### Community 64 - "createRng"
Cohesion: 0.11
Nodes (15): [mode, file], trace, args, finishedLaps, keepMs, opt, policy, settings (+7 more)

### Community 65 - "MemoryEnv"
Cohesion: 0.12
Nodes (9): MemoryEnv, Changes needed elsewhere, Curriculum, g2-5: a policy with memory of its earlier attempts, Not done, not tested, What a full run would cost, What is remembered, exactly, Which design, and why (+1 more)

### Community 66 - "g1-7 independent tests (TESTING.md)"
Cohesion: 0.24
Nodes (11): compare_human.mjs (calibration against the human lap), optimiseTime (search on predicted lap time), speedProfile (forward-backward pass), g1-7 independent tests (TESTING.md), Known failure: turning limit stored with 4 decimals, Known failure: computed line starts 0.59 units beside the car, Fix: full-lock accel never exceeds straight-line accel, Fix: corridor roomBeside edge at the 20-unit search limit (+3 more)

### Community 67 - "test_beam.mjs"
Cohesion: 0.16
Nodes (13): a, b, BEAM, c, d, e, f, files() (+5 more)

### Community 68 - "ref_node_fs"
Cohesion: 0.06
Nodes (44): args, createCar, file, lines, options, settings, [track = 'desert4', which = 'all'], OBS_PEDAL_OPEN (+36 more)

### Community 69 - "prune"
Cohesion: 0.39
Nodes (7): prune(), same(), ranks(), spearman(), Diversity buckets and per-process share in pruning, Note: the elite does not count towards its bucket, What is covered

### Community 70 - "diff_capture.mjs"
Cohesion: 0.17
Nodes (3): byId, cap, ours

### Community 71 - "Polytrack-ML"
Cohesion: 0.15
Nodes (13): Coding conventions, graphify, Hard rules, How the car should be driven (Henry's knowledge of the game), Lessons that cost something to learn, Model history, Polytrack-ML, Status (12 October 2026) (+5 more)

### Community 72 - "test_follow.mjs"
Cohesion: 0.20
Nodes (7): FOLLOW_DEFAULTS, recordPath(), spinBetween(), { check, eq, throws, note }, knockedOff(), OFF, track

### Community 73 - "calibrate.mjs"
Cohesion: 0.18
Nodes (10): args, HORIZONS, N, opt, rng, seed(), starts, states (+2 more)

### Community 74 - ".load"
Cohesion: 0.21
Nodes (11): Changes needed elsewhere, restore(), snapshot(), Tests of g1-2 (independent tester), Defects found, Headline claim, Headline claim holds: desert4 21.730 s reproduced key for key, Defect (fixed): stitch_laps exited 0 on NO LAP (+3 more)

### Community 76 - "run_all_tests.mjs"
Cohesion: 0.17
Nodes (11): folders, IDEAS, killTree(), LOGS, results, ROOT, runFolder(), t0 (+3 more)

### Community 77 - "fingerprint.mjs"
Cohesion: 0.11
Nodes (13): blockArgs, oldActor, oldSteps, out, rolls, ROOT, server(), strip() (+5 more)

### Community 78 - "BRIEF.md"
Cohesion: 0.12
Nodes (14): Brief for the idea agents, Deliverables: runnable code plus README per idea, Find your way around, Orchestrator plus twelve idea agents, Rules, ideas/shared and CONTRACT.md (orchestrator-owned), The project, What to deliver (+6 more)

### Community 79 - "smoke_real.mjs"
Cohesion: 0.23
Nodes (10): at(), cleanUp(), keep, launch(), ours(), p, PROJECT, r (+2 more)

### Community 80 - "g1-7-computed-racing-line/car_model.mjs"
Cohesion: 0.27
Nodes (8): fill(), GRAVITY, loadCarModel(), buildPad(), PLATE_CELLS, PLATE_UNITS, loadCarModel(), Car physics facts (turning limit 0.42 units per km/h)

### Community 81 - "Polytrack-ML"
Cohesion: 0.20
Nodes (8): Housekeeping awaiting Henry's yes, Acceptance tests, Captured Init payload (data/init_0.6.3.json), Driving and watching a lap, Layout, Polytrack-ML, Setup, Things that were not obvious

### Community 82 - "README.md"
Cohesion: 0.20
Nodes (8): Goal 1: lap faster than best human, Lap time jagged to the millisecond, How to read this, Lineage at a glance, Model history, Where the evidence is, Sub-human laps from human-lap search (four tracks), The twelve ideas (g1-1 to g2-5)

### Community 83 - "ppo_rays (17 distance rays)"
Cohesion: 0.12
Nodes (12): Block decision scheme (50 ms), ppo_blk_<track> (set 1 specialists), ppo_blkgen (block generalist), ppo_block.bc.pt (block-scheme imitation start), ppo_general (first generalist), ppo_general2 (road edges, contact penalty), ppo_general3 (held keys, imitation start), ppo_rays (17 distance rays) (+4 more)

### Community 84 - "plan.md"
Cohesion: 0.20
Nodes (8): Old scheme (10 ms, 12 key combinations), CAR_TICK_BUDGET constant, OBS_INDEX sent in env_server ready message, Phase 2: one source per shared constant, Phase 3: deduplication (policy module, RacingEnv interface), RacingEnv.replaceCar() and info() public, rl/policy.mjs single network module, Car tick budget (~6M ticks per car)

### Community 85 - "trace.mjs"
Cohesion: 0.18
Nodes (10): [i,j,k], [name, join, opts='{}', every='5'], paths, t0, { ticks }, trace(), track, renewCar() (+2 more)

### Community 86 - "g1-4: beam search over block decisions"
Cohesion: 0.20
Nodes (10): 2. The beam on one stretch, three rankings, 3. Against the 21.907 s lap (`from=runs/rollout_desert4.json`), 4. Checks, A full run: cost and what it might gain, Changes needed elsewhere, Files, g1-4: beam search over block decisions, How to run (+2 more)

### Community 87 - "replica_check.mjs"
Cohesion: 0.11
Nodes (18): check(), failed, finish(), passed, same(), throws(), actions, dump (+10 more)

### Community 88 - "g1-7: a computed racing line"
Cohesion: 0.18
Nodes (11): 1. The fitted car (flat pad, `car_model.json`), 2. The corridor, 3. The line and the speed profile, 4. Against the human lap (desert4, 21.750 s), Changes needed elsewhere, Cost of a full run, g1-7: a computed racing line, How to run (from the project root) (+3 more)

### Community 89 - "rl/smoke_test.mjs"
Cohesion: 0.33
Nodes (5): controlsToAction(), NUM_ACTIONS, controllerLap(), laps, ticks

### Community 90 - "ladder_test.mjs"
Cohesion: 0.09
Nodes (21): body(), fractions, human, keys, resetTimes, same(), t0, THROTTLE (+13 more)

### Community 91 - "g1-5: fine key timing (1 ms)"
Cohesion: 0.18
Nodes (11): Changes needed elsewhere, Cost of a full run, Files, g1-5: fine key timing (1 ms), How to run, Not done, not tested, Smoke test 1: searched lap, flips from 18.0 s to the finish, Smoke test 2: best human lap, flips from 17.75 s to the finish (+3 more)

### Community 92 - "search.mjs"
Cohesion: 0.20
Nodes (12): change(), sameBefore(), Defect found (fixed), Headline claims, Other claims in the README, Tests of g1-1 (search from the human's lap), What is covered, countFlips() (+4 more)

### Community 93 - "._observe"
Cohesion: 0.21
Nodes (6): straight(), Changes needed elsewhere, dot(), quatMultiply(), sub(), toCarFrame()

### Community 94 - "g2-3 Explore and adapt"
Cohesion: 0.22
Nodes (9): Changes needed elsewhere, Cost of a full run, Design questions, and what the logs say, Files, Fine-tune (dry run only), g2-3 Explore and adapt, How to run (from the project root), The test set (+1 more)

### Community 95 - "progress"
Cohesion: 0.16
Nodes (12): 1. What to rank by (`calibrate.mjs`), Defects, Not fixed, Observations that are not defects, Not done, not tested, Defects, g2-4 lookahead driving: independent tests, Not covered, and why (+4 more)

### Community 96 - "buildRoute"
Cohesion: 0.29
Nodes (11): buildRoute(), flights(), runStage(), cross(), dist(), dot(), finishRoute(), Heap (+3 more)

### Community 97 - "search_timeline.mjs"
Cohesion: 0.10
Nodes (17): Not covered: a worker that throws leaves search_human waiting forever, { check }, timeout, args, best, finalString, mutateOptions, opt (+9 more)

### Community 98 - "worker_entry.mjs"
Cohesion: 0.29
Nodes (7): handleControl(), memories, physicsBytes(), restoreSnapshot(), schedules, snapshots, takeSnapshot()

### Community 100 - "ppo_blkgen2 / ppo_blkgen.best2.pt (best generalist)"
Cohesion: 0.25
Nodes (8): Held-out tracks (desert3, summer3, winter4), Next: resume off-policy learner on desert4, g1-6-iqn_desert4 (off-policy IQN learner), ppo_blkgen2 / ppo_blkgen.best2.pt (best generalist), ppo_g3blk_<track> (set 3, rules 1-3), ppo_gblk_<track> (set 2 specialists), ppo_sr1_/ppo_sr2_<track> (search, then train), Fixed-seed fingerprint (docs/refactor/fingerprint.mjs)

### Community 101 - "g1-2: stitch a lap from the fastest sections of several human laps"
Cohesion: 0.22
Nodes (9): g1-2: stitch a lap from the fastest sections of several human laps, How it works, How often a join survives, Not done, not tested, Section times and the theoretical best, Stitched laps, The cost of repair, What a full run would cost (+1 more)

### Community 102 - "g2-5-memory-policy/README.md"
Cohesion: 0.32
Nodes (6): 3 s doomed window assumption, MemoryAgent warm-started from the generalist, 130 extra memory inputs (482-wide observation), toy_probe: one corner with a hidden speed limit, g2-5 independent tests (TESTING.md), Fix: last observation of an attempt showed that attempt's own memory

### Community 103 - "test_track_memory.mjs"
Cohesion: 0.19
Nodes (8): closeTo(), filled(), near(), BIN, DOOM_MS, GLOBALS, PER_POINT, POINTS

### Community 105 - "g1-4-beam-search/tests/TESTING.md"
Cohesion: 0.15
Nodes (10): a, b, head, PROJECT, rows, Check: the same command gives the same lap, recording and log, Did the README's claims hold?, g1-4 beam search: independent tests (+2 more)

### Community 106 - "g1-2-stitch-human-laps/README.md"
Cohesion: 0.43
Nodes (4): Best-of-sections theoretical bound (not a close one), Plan: dynamic programming over (boundary, lap) with switch cost, Section boundaries: planes across the road every 250 ms, State mismatch in millisecond-equivalents

### Community 107 - "g1-4-beam-search/README.md"
Cohesion: 0.36
Nodes (5): Beam of partial laps as save states, extended one 50 ms decision at a time, Next step: a learned ranking fitted to finish times, Periodic rollouts to the finish for a real lap time, Ranking measures (progress, value, look H, lookvalue H), Check: beam=1 returns the starting lap exactly

### Community 108 - "analyze.mjs"
Cohesion: 0.25
Nodes (6): BACK_EDGES, BUDGETS, dir, groups, restarts, runs

### Community 109 - "toy_probe.py"
Cohesion: 0.32
Nodes (3): myopic(), p_through(), play()

### Community 110 - "g2-1: inputs that need no human lap"
Cohesion: 0.20
Nodes (10): Cost of a full run, g2-1: inputs that need no human lap, How the route is found, How to run, Not done, not tested, Result in short, Smoke tests, The files (+2 more)

### Community 111 - "g2-2-train_route_on_generated.sh"
Cohesion: 0.83
Nodes (3): keep_copies(), g2-2-train_route_on_generated.sh script, steps_done()

### Community 112 - "Goal 2: generalist for any track"
Cohesion: 0.29
Nodes (7): Goal 2: generalist for any track, Next: reference-free generalist (g2-1 inputs), Next: one message per block decision in stepBlock, Human lap / reference lap, ppo_follow (follow the reference), Phase 4: split racing_env.mjs (deferred), Drivable ground at height 0

### Community 113 - "g2-4: look ahead while driving"
Cohesion: 0.17
Nodes (11): Cost of a full run, Design questions, Files, g2-4: look ahead while driving, How to run, Lookahead driver, defaults (lazy, horizon 40, every 10, backing up), Not done, not tested, Numbers (+3 more)

### Community 114 - "TrackMemory"
Cohesion: 0.21
Nodes (7): 5. Speed, memory, tick budget, Defects, g2-5 memory policy: independent tests, The README's claims, What is covered, clip(), TrackMemory

### Community 117 - "test_1_raceline.mjs"
Cohesion: 0.24
Nodes (5): TOLERANCE, cross(), makeCorridor(), unit(), UP

### Community 119 - "Requests to the orchestrator (ideas/shared/REQUESTS.md)"
Cohesion: 0.29
Nodes (6): Requests to the orchestrator (ideas/shared/REQUESTS.md), g1-7 corridor (deferred), Orchestrator duplication cleanup (rng, pool, policy), Request: loadTrack cannot open generated tracks, Request: search_round.sh not safe to rerun, SimSession.load() key restore bug (fixed)

### Community 121 - "train_memory.sh"
Cohesion: 0.60
Nodes (3): keep_copies(), train_memory.sh script, steps_done()

### Community 123 - "queue_unfinished.sh"
Cohesion: 0.70
Nodes (3): run_step(), say(), queue_unfinished.sh script

### Community 124 - "g1-1-human-seed-search/README.md"
Cohesion: 0.14
Nodes (9): Changes needed elsewhere, One-off gain from how the car is angled at the finish line, g1-1: search from the human's lap, How to run, Not done, not tested, The idea, What a longer run would probably do, What happens to the rest of the lap (the open problem) (+1 more)

### Community 125 - "numpy"
Cohesion: 0.06
Nodes (13): _decode(), check(), finish(), one(), read_actor(), b64(), greedy_agreement(), part() (+5 more)

### Community 137 - "g1-6-offpolicy-rl/tests/run_tests.mjs"
Cohesion: 0.38
Nodes (5): HERE, PROJECT, t0, KNOWN, TESTS

### Community 138 - "test_4_car_vs_sim.mjs"
Cohesion: 0.36
Nodes (7): within(), accelAt(), car, crossing(), dist(), speedAt(), turnOf()

### Community 139 - "fetch_laps.mjs"
Cohesion: 0.22
Nodes (9): allOfficial, amount, args, get(), officialDir, opt, outDir, sleep() (+1 more)

### Community 141 - "g1-4-beam-search/tests/run_tests.mjs"
Cohesion: 0.38
Nodes (5): HERE, PROJECT, t0, KNOWN, TESTS

### Community 142 - "g2-5-memory-policy/tests/run_tests.mjs"
Cohesion: 0.29
Nodes (3): ROOT, STAGES, t0

### Community 143 - "RefMemory"
Cohesion: 0.31
Nodes (5): attempt(), edgesNow(), RefMemory, sample(), clip()

### Community 144 - "hook.mjs"
Cohesion: 0.40
Nodes (4): freshAfter, history, m, marked

### Community 145 - "train_route_generalist.sh"
Cohesion: 0.83
Nodes (3): keep_copies(), train_route_generalist.sh script, steps_done()

### Community 155 - "rl/: reinforcement learning on the headless simulator"
Cohesion: 0.22
Nodes (9): Design in brief, Files, Install, Known limits, Multi-track ("generalist") training, rl/: reinforcement learning on the headless simulator, Use, What was not tested (+1 more)

### Community 156 - "g1-3-search-train-rounds/tests/run_tests.mjs"
Cohesion: 0.11
Nodes (11): HERE, PROJECT, t0, KNOWN, TESTS, ROOT, STAGES, t0 (+3 more)

### Community 162 - "queue_untried.sh"
Cohesion: 0.53
Nodes (3): run_step(), say(), queue_untried.sh script

## Knowledge Gaps
- **42 isolated node(s):** `./ideas/g2-2-track-generator/g2-2-features.mjs`, `g1-7 corridor (deferred)`, `Orchestrator duplication cleanup (rng, pool, policy)`, `Request: loadTrack cannot open generated tracks`, `A short look ahead does not predict lap time` (+37 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1326 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **29 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RacingEnv` connect `RacingEnv` to `Lookahead driver (driveLap)`, `env.mjs`, `laps.mjs`, `torch`, `.demo`, `track.mjs`, `hook.mjs`, `explore.mjs`, `train_ppo.py`, `attempts.mjs`, `g1-6-offpolicy-rl/README.md`, `recording.mjs`, `rotate`, `env_server.mjs`, `Polytrack-ML refactor plan`, `iqn_server.mjs`, `Route built from track geometry alone`, `createRng`, `ref_node_fs`, `rollout_child.mjs`, `replica_check.mjs`, `rl/smoke_test.mjs`, `ladder_test.mjs`, `._observe`, `progress`, `g2-5-memory-policy/README.md`, `g2-1: inputs that need no human lap`, `g2-4: look ahead while driving`, `TrackMemory`?**
  _High betweenness centrality (0.121) - this node is a cross-community bridge._
- **Are the 15 inferred relationships involving `RacingEnv` (e.g. with `Phase 3: Deduplication (medium; each step gated by a fixed-seed comparison)` and `Phase 4 (optional, only with Phase 5 of "What is next"): split `racing_env.mjs``) actually correct?**
  _`RacingEnv` has 15 INFERRED edges - model-reasoned connections that need verification._
- **What connects `./ideas/g2-2-track-generator/g2-2-features.mjs`, `g1-7 corridor (deferred)`, `Orchestrator duplication cleanup (rng, pool, policy)` to the rest of the system?**
  _42 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Lookahead driver (driveLap)` be split into smaller, more focused modules?**
  _Cohesion score 0.12367149758454106 - nodes in this community are weakly interconnected._
- **Why does `createRng()` connect `createRng` to `laps.mjs`, `shared/policy.mjs`, `.demo`, `track.mjs`, `test_logs.mjs`, `explore.mjs`, `stitch_laps.mjs`, `attempts.mjs`, `beam.mjs`, `rotate`, `env_server.mjs`, `search_rollout.mjs`, `search_sections.mjs`, `search_settings.mjs`, `Polytrack-ML refactor plan`, `iqn_server.mjs`, `generate.mjs`, `g1-4-beam-search/child.mjs`, `section_worker.mjs`, `ref_node_fs`, `calibrate.mjs`, `rollout_child.mjs`, `g1-4: beam search over block decisions`, `search.mjs`, `search_timeline.mjs`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `loadTrack()` (e.g. with `Phase 3: Deduplication (medium; each step gated by a fixed-seed comparison)` and `Progress (16 October 2026): phases 1 to 3 done, not committed`) actually correct?**
  _`loadTrack()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Should `env.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.08115942028985507 - nodes in this community are weakly interconnected._