# Graph Report - Polytrack-ML  (2026-10-16)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 2712 nodes · 5947 edges · 138 communities (123 shown, 15 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 403 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `07e830cd`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Lookahead driver (driveLap)
- env.mjs
- test_pure.py
- test_3_under_road_sim.mjs
- PolytrackVecEnv
- refine.mjs
- laps.mjs
- numpy
- test_logs.mjs
- test_policy_rollout.mjs
- train_iqn.py
- test_beam.mjs
- search_timeline.mjs
- racing_env.mjs
- track.mjs
- generate.mjs
- test_4_sim.mjs
- explore.mjs
- test_agent.py
- rounds.mjs
- stitch_laps.mjs
- test_2_codec.mjs
- test_server.py
- g1-6-offpolicy-rl/README.md
- progress
- shared/tests/harness.mjs
- recording.mjs
- lib.mjs
- Agent
- RacingEnv
- observation.mjs
- test_driver.mjs
- beam.mjs
- test_lock.mjs
- g1-7 computed racing line README
- fit_car.mjs
- block_rollout.mjs
- createRng
- paths.mjs
- search_rollout.mjs
- test_5_corridor_sim.mjs
- search_sections.mjs
- search_human.mjs
- test_restart.mjs
- g1-5 fine key timing README
- search_settings.mjs
- Polytrack-ML refactor plan
- capture_init.mjs
- iqn_server.mjs
- raceline.mjs
- route.mjs
- g2-3-explore-and-adapt/tests/test_logic.mjs
- test_memory_env.mjs
- g1-4-beam-search/child.mjs
- Shared code contract (ideas/shared/CONTRACT.md)
- The models
- .load
- MemoryEnv
- memory_test.mjs
- test_attempts.mjs
- section_worker.mjs
- trace.mjs
- corridor.mjs
- plot_dump.mjs
- g2-2-track-generator/drive.mjs
- torch
- g1-4-beam-search/tests/run_tests.mjs
- test_track_memory.mjs
- key_usage.mjs
- g1-4-beam-search/tests/TESTING.md
- ref_node_fs
- Polytrack-ML
- test_follow.mjs
- calibrate.mjs
- TrackMemory
- test_sim.mjs
- run_all_tests.mjs
- compare_sections.mjs
- BRIEF.md
- smoke_real.mjs
- g1-7-computed-racing-line/car_model.mjs
- diff_capture.mjs
- CLAUDE.md
- ppo_rays (17 distance rays)
- plan.md
- fingerprint.mjs
- g1-5: fine key timing (1 ms)
- ref_node_url
- g1-7: a computed racing line
- controller.mjs
- Polytrack-ML
- search.mjs
- compare_human.mjs
- test_1_raceline.mjs
- ref_node_child_process
- g2-1: inputs that need no human lap
- g2-2: random track generator
- SimSession
- worker_entry.mjs
- fetch_laps.mjs
- ppo_blkgen2 / ppo_blkgen.best2.pt (best generalist)
- g1-2: stitch a lap from the fastest sections of several human laps
- test_4_car_vs_sim.mjs
- sim/drive.mjs
- g1-1-human-seed-search/README.md
- g1-1: search from the human's lap
- g1-2-stitch-human-laps/README.md
- g1-4-beam-search/README.md
- analyze.mjs
- toy_probe.py
- watch_ghost.mjs
- check_track.mjs
- Goal 2: generalist for any track
- g1-3-search-train-rounds/tests/run_tests.mjs
- g1-6-offpolicy-rl/tests/run_tests.mjs
- g2-2 tests
- sectional.mjs
- Tests of g1-1 (search from the human's lap)
- shared/laps_bc.py
- Request: search_round.sh not safe to rerun
- g2-1-reference-free-inputs/tests/run_tests.mjs
- g2-2-track-generator/tests/run_tests.mjs
- g2-3-explore-and-adapt/tests/run_tests.mjs
- g2-4-lookahead-driving/tests/run_tests.mjs
- ppo_general2 (road edges, contact penalty)
- g1-1 human-seed search
- set3_round2.sh
- Local use only rule (no bot lap submission)
- Ten-attempt test (seeds 10-19 + greedy)
- finetune_plan.sh
- smoke_test.sh
- eval_block_specialist.sh
- eval_generalist.sh
- train_block_specialist.sh
- Eager pump in worker_entry

## God Nodes (most connected - your core abstractions)
1. `loadTrack()` - 58 edges
2. `Env` - 54 edges
3. `RacingEnv` - 54 edges
4. `decodeState()` - 35 edges
5. `rotate()` - 33 edges
6. `SimSession` - 32 edges
7. `createRng()` - 30 edges
8. `humanLaps()` - 28 edges
9. `Lookahead driver (driveLap)` - 28 edges
10. `loadTrackInfo()` - 26 edges

## Surprising Connections (you probably didn't know these)
- `Layout` --references--> `Env`  [INFERRED]
  README.md → sim/env.mjs
- `Phase 4 (optional, only with Phase 5 of "What is next"): split `racing_env.mjs`` --references--> `RacingEnv`  [INFERRED]
  docs/refactor/plan.md → rl/racing_env.mjs
- `Design, and why` --references--> `RacingEnv`  [INFERRED]
  ideas/g1-6-offpolicy-rl/README.md → rl/racing_env.mjs
- `Plain policy on the unseen tracks (baseline)` --references--> `RacingEnv`  [INFERRED]
  ideas/g2-4-lookahead-driving/README.md → rl/racing_env.mjs
- `Things that were not obvious` --references--> `stateLength()`  [INFERRED]
  README.md → sim/state.mjs

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

## Communities (138 total, 15 thin omitted)

### Community 0 - "Lookahead driver (driveLap)"
Cohesion: 0.05
Nodes (59): Missing speed profile from curvature, Changes needed in RacingEnv to use the route reference, Validation of route against fastest human lap on 17 official tracks, g2-1 independent tests (TESTING.md), Observation: route floats 0.5 to 1.1 units off curved surfaces, test_3: g2-1 route on a g2-2 generated track, compare_g21: g2-1 route finder as second opinion, Difficulty as a knob on the piece mix (+51 more)

### Community 1 - "env.mjs"
Cohesion: 0.05
Nodes (45): args, createCar, file, lines, options, settings, [track = 'desert4', which = 'all'], CACHE (+37 more)

### Community 2 - "test_pure.py"
Cohesion: 0.05
Nodes (21): export_actor(), IQN, quantile_huber_loss(), ReplayBuffer, actor_file_best_action(), check(), loss_by_loops(), n_step_one() (+13 more)

### Community 3 - "test_3_under_road_sim.mjs"
Cohesion: 0.05
Nodes (46): EVERY, describe(), dot(), fence(), locate(), nearest(), sub(), WINDOW (+38 more)

### Community 4 - "PolytrackVecEnv"
Cohesion: 0.05
Nodes (19): main(), parse_args(), EnvServer, _obs(), PolytrackEnv, PolytrackVecEnv, _random_policy_check(), Design in brief (+11 more)

### Community 5 - "refine.mjs"
Cohesion: 0.06
Nodes (49): better(), copy(), listFlips(), makePlane(), MOVABLE, nudge(), openSims(), parseArgs() (+41 more)

### Community 6 - "laps.mjs"
Cohesion: 0.08
Nodes (46): keys, policy, realStep, seed, CLAIMED, inputs, keys, policy (+38 more)

### Community 7 - "numpy"
Cohesion: 0.08
Nodes (6): net(), run(), collect(), main(), torch>=2.2, _layer()

### Community 8 - "test_logs.mjs"
Cohesion: 0.07
Nodes (34): check(), finish(), same(), ROOT, saved, TMP, dead, invariants() (+26 more)

### Community 9 - "test_policy_rollout.mjs"
Cohesion: 0.07
Nodes (36): [actorFile, obsFile, outFile, size], all, bytes, obsSize, out, policy, Orchestrator duplication cleanup (rng, pool, policy), [actorFile, criticFile] (+28 more)

### Community 10 - "train_iqn.py"
Cohesion: 0.07
Nodes (15): Files, _decode(), IqnServers, check(), main(), test_learning(), learner_for(), Defects found (+7 more)

### Community 11 - "test_beam.mjs"
Cohesion: 0.06
Nodes (29): check(), failed, finish(), passed, same(), throws(), a, b (+21 more)

### Community 12 - "search_timeline.mjs"
Cohesion: 0.06
Nodes (34): saveProgress(), ask(), before(), { check, eq, note }, inputs, lap0, replay(), searchSection() (+26 more)

### Community 13 - "racing_env.mjs"
Cohesion: 0.06
Nodes (32): actions, dump, episodeStartArc, finishTicks, now, obs, reasons, rewards (+24 more)

### Community 14 - "track.mjs"
Cohesion: 0.13
Nodes (29): pad, toCarFrame(), overlappingParts(), partTriangles(), partVoxels(), voxelCache, voxelKey(), worldTriangles() (+21 more)

### Community 15 - "generate.mjs"
Cohesion: 0.10
Nodes (32): count, firstSeed, LENGTHS, started, used, worst, add(), buildRoute() (+24 more)

### Community 16 - "test_4_sim.mjs"
Cohesion: 0.11
Nodes (26): loadGenerated(), check(), fmt(), near(), section(), decodeParts(), detectorBox(), gatesOf() (+18 more)

### Community 17 - "explore.mjs"
Cohesion: 0.07
Nodes (35): archive, args, attempt(), BACK, BACK_MIN, cellKey(), chooseCell(), file (+27 more)

### Community 18 - "test_agent.py"
Cohesion: 0.09
Nodes (17): MemoryAgent, ppo_loss(), session_advantages(), write_actor(), Changes needed elsewhere, g2-5: a policy with memory of its earlier attempts, How to run, What a full run would cost (+9 more)

### Community 19 - "rounds.mjs"
Cohesion: 0.19
Nodes (31): paths(), seconds(), alive(), at(), attemptsOf(), ckptSteps(), createState(), dropLock() (+23 more)

### Community 20 - "stitch_laps.mjs"
Cohesion: 0.06
Nodes (27): acceptCost, args, attempts, bestOf, checkMs, finishMode, followOptions, free (+19 more)

### Community 21 - "test_2_codec.mjs"
Cohesion: 0.11
Nodes (19): checkOfficial(), matePorts(), reachable(), ROAD, deflate(), encodeExportString(), encodeSaveString(), partsToBytes() (+11 more)

### Community 22 - "test_server.py"
Cohesion: 0.07
Nodes (9): check(), finish(), b64(), greedy_agreement(), network(), part(), replica(), breaks() (+1 more)

### Community 23 - "g1-6-offpolicy-rl/README.md"
Cohesion: 0.10
Nodes (23): Changed after independent testing, Changes needed elsewhere, Design, and why, Double Q-learning, dueling head, target network, Full run estimate: 10 to 50 million decisions, g1-6: off-policy distributional learner, rewarded for progress only, How to run, iqn.py (network, quantile Huber loss, actor file) (+15 more)

### Community 24 - "progress"
Cohesion: 0.06
Nodes (31): Defects, g2-1 tests, Not fixed, Observations that are not defects, The README's claims, What is covered, What is not covered, and why, Changes needed elsewhere (+23 more)

### Community 25 - "shared/tests/harness.mjs"
Cohesion: 0.10
Nodes (22): { check, note }, clean(), runFiles, said, TMP, { check, note }, clean(), counts (+14 more)

### Community 26 - "recording.mjs"
Cohesion: 0.13
Nodes (19): { check, note }, CLAIMS, { check }, attempt(), ladder, prepare(), samePrefix(), snapshot() (+11 more)

### Community 27 - "lib.mjs"
Cohesion: 0.11
Nodes (24): chooseExamples(), concludeRound(), copiesToTest(), DEFAULTS, ID, parseArgs(), parseSearchLog(), pickCopy() (+16 more)

### Community 28 - "Agent"
Cohesion: 0.09
Nodes (12): 1. What to rank by (`calibrate.mjs`), losses(), Agent, block_imitation_loss(), block_parts(), held_keys(), imitation_loss(), main() (+4 more)

### Community 29 - "RacingEnv"
Cohesion: 0.15
Nodes (7): Changes needed elsewhere, Changes needed elsewhere, actionToControls(), RacingEnv, sub(), prefix, prepare()

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
Nodes (22): IDEA_DIR, check(), failed, finish(), passed, same(), throws(), PROJECT (+14 more)

### Community 34 - "g1-7 computed racing line README"
Cohesion: 0.15
Nodes (22): g1-7 computed racing line README, Where it could pay: tracks with flat braking zones, Fitted car model (car_model.mjs / car_model.json), check_turn_limit.mjs (pad limit vs human laps, ratio 1.00), compare_human.mjs (calibration against the human lap), Result: computed line lap 22.083 s vs human 21.750 s, drive_line.mjs (pure-pursuit tracker driving the line), fit_car.mjs (car experiments on the pad) (+14 more)

### Community 35 - "fit_car.mjs"
Cohesion: 0.09
Nodes (21): accelRun, accelW, binBySpeed(), brake, brakeRun, coast, coastRun, entries (+13 more)

### Community 36 - "block_rollout.mjs"
Cohesion: 0.09
Nodes (19): A full run: cost and what it might gain, Changes needed elsewhere, Files, g1-4: beam search over block decisions, How to run, Not done or not tested, a, marks (+11 more)

### Community 37 - "createRng"
Cohesion: 0.12
Nodes (15): args, opt, policy, settings, track, alternatives(), DEFAULTS, driveLap() (+7 more)

### Community 38 - "paths.mjs"
Cohesion: 0.21
Nodes (18): carState(), compare(), angleBetween(), crossings(), locate(), mismatch(), MISMATCH_WEIGHTS, MOTION_GAP (+10 more)

### Community 39 - "search_rollout.mjs"
Cohesion: 0.11
Nodes (16): A short look ahead does not predict lap time, alter(), args, exported, name, opt, passes, randInt() (+8 more)

### Community 40 - "test_5_corridor_sim.mjs"
Cohesion: 0.15
Nodes (12): check(), fmt(), known(), median(), near(), percentile(), section(), createCar (+4 more)

### Community 41 - "search_sections.mjs"
Cohesion: 0.09
Nodes (19): args, best, finalString, minScore, mutateOptions, opt, outFile, passes (+11 more)

### Community 42 - "search_human.mjs"
Cohesion: 0.09
Nodes (17): args, best, opt, outDir, OWN, passes, seconds, sectionTicks (+9 more)

### Community 43 - "test_restart.mjs"
Cohesion: 0.11
Nodes (20): parseAttempt(), ALL, BASES, check(), COPIES, cutLog, expect(), fullLog (+12 more)

### Community 44 - "g1-5 fine key timing README"
Cohesion: 0.16
Nodes (15): g1-5 fine key timing README, child.mjs (simulator process: prepare / try, save-state ladder), fine.mjs (nudge, shiftTail, subTick, pool wrapper), Result: best human lap 21.750 -> 21.722 s, verified, refine.mjs (flip-timing search, verified lap out), Result: searched lap 21.907 s, 0 ms gained, smoothness.mjs (lap time vs one flip's time), subTick() sub-tick lap time estimate (+7 more)

### Community 45 - "search_settings.mjs"
Cohesion: 0.11
Nodes (19): args, bigMoveChance, clamp(), current, extraChance, gaussian(), GLOBALS, mutateSettings() (+11 more)

### Community 46 - "Polytrack-ML refactor plan"
Cohesion: 0.12
Nodes (18): Context, Deliberately not changing, Housekeeping (needs Henry's yes), Phase 1: Bug fixes (small, no effect on results), Phase 2: One source for each shared constant (about 30 lines, no effect on results), Phase 3: Deduplication (medium; each step gated by a fixed-seed comparison), Phase 4 (optional, only with Phase 5 of "What is next"): split `racing_env.mjs`, Polytrack-ML refactor plan (+10 more)

### Community 47 - "capture_init.mjs"
Cohesion: 0.10
Nodes (15): devDependencies, playwright-core, name, private, scripts, capture, setup, test (+7 more)

### Community 48 - "iqn_server.mjs"
Cohesion: 0.22
Nodes (17): b64(), begin(), decisionOf(), drive(), evaluate(), greedy(), handle(), HUMAN_DOING (+9 more)

### Community 49 - "raceline.mjs"
Cohesion: 0.24
Nodes (18): speedFor(), curvature(), dot(), optimiseLine(), optimiseTime(), shiftedPoints(), speedProfile(), sub() (+10 more)

### Community 50 - "route.mjs"
Cohesion: 0.25
Nodes (15): buildRoute(), flights(), runStage(), cross(), dist(), dot(), finishRoute(), gateStages() (+7 more)

### Community 51 - "g2-3-explore-and-adapt/tests/test_logic.mjs"
Cohesion: 0.11
Nodes (14): BUDGETS, CELL_LENGTH, CELL_WIDTH, cellKey, GAIN, HERE, keys, logs (+6 more)

### Community 52 - "test_memory_env.mjs"
Cohesion: 0.16
Nodes (11): attempt(), draw, edgesNow(), expectedLengths, lengths, OFF, policy, RefMemory (+3 more)

### Community 53 - "g1-4-beam-search/child.mjs"
Cohesion: 0.16
Nodes (12): candidates(), canonical(), dot(), ensureCar(), features(), freshStart(), handlers, nodes (+4 more)

### Community 54 - "Shared code contract (ideas/shared/CONTRACT.md)"
Cohesion: 0.12
Nodes (14): Twelve ideas: what came out (ideas/README.md), Five known test failures, Overnight results, 10 October 2026, stepBlock: one message per 50 ms block, Shared code contract (ideas/shared/CONTRACT.md), Promoted modules (phase 2), Rules for working side by side (runs/ prefixes, two simulators), Requests to the orchestrator (ideas/shared/REQUESTS.md) (+6 more)

### Community 55 - "The models"
Cohesion: 0.12
Nodes (17): 10. `ppo_blk_<track>`: "set 1", specialists from imitation only (6 Oct), 11. `ppo_blkgen`: block generalist (6 to 7 Oct), 12. `ppo_blkgen2`: blocked-lane cost and steering kicks (7 Oct), 13. `ppo_gblk_<track>`: "set 2", specialists from the generalist (7 to 8 Oct), 14. `ppo_g3blk_<track>`: "set 3", rules 1, 2 and 3 (8 Oct), 15. `ppo_sr1_<track>` and `ppo_sr2_<track>`: search, then train (8 to 10 Oct), 16. `g1-6-iqn_desert4`: off-policy learner (10 Oct), 1. `ppo_summer1`: first single-track agent (4 Oct) (+9 more)

### Community 56 - ".load"
Cohesion: 0.15
Nodes (15): Changes needed elsewhere, trace(), renewCar(), restore(), snapshot(), Tests of g1-2 (independent tester), Defects found, Headline claim (+7 more)

### Community 57 - "MemoryEnv"
Cohesion: 0.17
Nodes (4): MemoryEnv, Not done, not tested, What is remembered, exactly, Not covered, and why

### Community 58 - "memory_test.mjs"
Cohesion: 0.13
Nodes (13): check(), crash, doomedFrom, edges, far, first, log, memory (+5 more)

### Community 59 - "test_attempts.mjs"
Cohesion: 0.14
Nodes (11): check(), finish(), known(), same(), a, b, crashed, expected (+3 more)

### Community 60 - "section_worker.mjs"
Cohesion: 0.28
Nodes (15): dist2(), drive(), driveTail(), driveTo(), faster(), pos, pose, quat (+7 more)

### Community 61 - "trace.mjs"
Cohesion: 0.12
Nodes (14): recordPath(), spinBetween(), [i,j,k], [name, join, opts='{}', every='5'], paths, t0, { ticks }, track (+6 more)

### Community 62 - "corridor.mjs"
Cohesion: 0.17
Nodes (13): car, tracks, AIR_GUARD, along(), buildCorridor(), cross(), MARGIN, MAX_ROOM (+5 more)

### Community 63 - "plot_dump.mjs"
Cohesion: 0.19
Nodes (9): info, nodes, route, surface, buildSurface(), near(), CellMap, EDGE_CAP (+1 more)

### Community 64 - "g2-2-track-generator/drive.mjs"
Cohesion: 0.15
Nodes (13): attempt(), DRIVER_DEFAULTS, driveTrack(), dir, failed, files, [shard, shards], started (+5 more)

### Community 65 - "torch"
Cohesion: 0.24
Nodes (4): main(), main(), main(), widen_net()

### Community 66 - "g1-4-beam-search/tests/run_tests.mjs"
Cohesion: 0.15
Nodes (8): HERE, PROJECT, t0, KNOWN, TESTS, ROOT, STAGES, t0

### Community 67 - "test_track_memory.mjs"
Cohesion: 0.20
Nodes (8): closeTo(), near(), BIN, DOOM_MS, GLOBALS, MEM_SIZE, PER_POINT, POINTS

### Community 68 - "key_usage.mjs"
Cohesion: 0.13
Nodes (12): h, hu, human, humanKeys, LENGTH, line, [name, run, stretchesArg = '16', lengthArg = '15'], o (+4 more)

### Community 69 - "g1-4-beam-search/tests/TESTING.md"
Cohesion: 0.21
Nodes (12): prune(), same(), ranks(), spearman(), Diversity buckets and per-process share in pruning, Check: the same command gives the same lap, recording and log, Did the README's claims hold?, Note: the elite does not count towards its bucket (+4 more)

### Community 70 - "ref_node_fs"
Cohesion: 0.16
Nodes (11): decoded, firstMismatch, key(), [name = 'summer1', run = 'baseline'], recording, recordingString, runsDir, track (+3 more)

### Community 71 - "Polytrack-ML"
Cohesion: 0.15
Nodes (13): Coding conventions, graphify, Hard rules, How the car should be driven (Henry's knowledge of the game), Lessons that cost something to learn, Model history, Polytrack-ML, Status (12 October 2026) (+5 more)

### Community 72 - "test_follow.mjs"
Cohesion: 0.22
Nodes (9): corrections(), donorKeys(), follow(), FOLLOW_DEFAULTS, NONE, { check, eq, throws, note }, knockedOff(), OFF (+1 more)

### Community 73 - "calibrate.mjs"
Cohesion: 0.18
Nodes (10): args, HORIZONS, N, opt, rng, seed(), starts, states (+2 more)

### Community 74 - "TrackMemory"
Cohesion: 0.19
Nodes (8): 2. The beam on one stretch, three rankings, 3. Against the 21.907 s lap (`from=runs/rollout_desert4.json`), 4. Checks, 5. Speed, memory, tick budget, What was measured, filled(), clip(), TrackMemory

### Community 75 - "test_sim.mjs"
Cohesion: 0.19
Nodes (7): check(), finish(), same(), HERE, ROOT, TMP, written

### Community 76 - "run_all_tests.mjs"
Cohesion: 0.17
Nodes (11): folders, IDEAS, killTree(), LOGS, results, ROOT, runFolder(), t0 (+3 more)

### Community 77 - "compare_sections.mjs"
Cohesion: 0.15
Nodes (11): h, human, line, [name = 'summer1', run = 'tuned', sectionsArg = '24'], o, profile(), rows, SECTIONS (+3 more)

### Community 78 - "BRIEF.md"
Cohesion: 0.18
Nodes (8): Brief for the idea agents, Deliverables: runnable code plus README per idea, Find your way around, Orchestrator plus twelve idea agents, Rules, ideas/shared and CONTRACT.md (orchestrator-owned), The project, What to deliver

### Community 79 - "smoke_real.mjs"
Cohesion: 0.23
Nodes (10): at(), cleanUp(), keep, launch(), ours(), p, PROJECT, r (+2 more)

### Community 80 - "g1-7-computed-racing-line/car_model.mjs"
Cohesion: 0.27
Nodes (8): fill(), GRAVITY, loadCarModel(), buildPad(), PLATE_CELLS, PLATE_UNITS, loadCarModel(), Car physics facts (turning limit 0.42 units per km/h)

### Community 81 - "diff_capture.mjs"
Cohesion: 0.17
Nodes (3): byId, cap, ours

### Community 82 - "CLAUDE.md"
Cohesion: 0.20
Nodes (8): Goal 1: lap faster than best human, Lap time jagged to the millisecond, How to read this, Lineage at a glance, Model history, Where the evidence is, Sub-human laps from human-lap search (four tracks), The twelve ideas (g1-1 to g2-5)

### Community 83 - "ppo_rays (17 distance rays)"
Cohesion: 0.18
Nodes (8): Block decision scheme (50 ms), ppo_blk_<track> (set 1 specialists), ppo_blkgen (block generalist), ppo_block.bc.pt (block-scheme imitation start), ppo_rays (17 distance rays), ppo_spec_<track> (first specialists), ppo_spec2_<track> (steering costs), Phase 1: bug fixes (pool, wrappers, crash save)

### Community 84 - "plan.md"
Cohesion: 0.20
Nodes (8): Old scheme (10 ms, 12 key combinations), CAR_TICK_BUDGET constant, OBS_INDEX sent in env_server ready message, Phase 2: one source per shared constant, Phase 3: deduplication (policy module, RacingEnv interface), RacingEnv.replaceCar() and info() public, rl/policy.mjs single network module, Car tick budget (~6M ticks per car)

### Community 85 - "fingerprint.mjs"
Cohesion: 0.20
Nodes (8): blockArgs, oldActor, oldSteps, out, rolls, ROOT, server(), strip()

### Community 86 - "g1-5: fine key timing (1 ms)"
Cohesion: 0.18
Nodes (11): Changes needed elsewhere, Cost of a full run, Files, g1-5: fine key timing (1 ms), How to run, Not done, not tested, Smoke test 1: searched lap, flips from 18.0 s to the finish, Smoke test 2: best human lap, flips from 17.75 s to the finish (+3 more)

### Community 87 - "ref_node_url"
Cohesion: 0.25
Nodes (8): check(), failed, finish(), passed, same(), throws(), PROJECT, SCRIPTS

### Community 88 - "g1-7: a computed racing line"
Cohesion: 0.18
Nodes (11): 1. The fitted car (flat pad, `car_model.json`), 2. The corridor, 3. The line and the speed profile, 4. Against the human lap (desert4, 21.750 s), Changes needed elsewhere, Cost of a full run, g1-7: a computed racing line, How to run (from the project root) (+3 more)

### Community 89 - "controller.mjs"
Cohesion: 0.25
Nodes (10): follow(), routeToLine(), unguarded(), profile(), createController(), DEFAULTS, toCarFrame(), dist() (+2 more)

### Community 90 - "Polytrack-ML"
Cohesion: 0.20
Nodes (8): Housekeeping awaiting Henry's yes, Acceptance tests, Captured Init payload (data/init_0.6.3.json), Driving and watching a lap, Layout, Polytrack-ML, Setup, Things that were not obvious

### Community 91 - "search.mjs"
Cohesion: 0.29
Nodes (8): change(), sameBefore(), Defect found (fixed), countFlips(), MUTABLE, mutate(), MUTATE_DEFAULTS, randInt()

### Community 92 - "compare_human.mjs"
Cohesion: 0.20
Nodes (5): car, human, kappaHuman, out, [track = 'desert4', lapIndex = '0']

### Community 93 - "test_1_raceline.mjs"
Cohesion: 0.24
Nodes (5): TOLERANCE, cross(), makeCorridor(), unit(), UP

### Community 94 - "ref_node_child_process"
Cohesion: 0.20
Nodes (6): failures, files, here, root, started, HASHES

### Community 95 - "g2-1: inputs that need no human lap"
Cohesion: 0.20
Nodes (10): Cost of a full run, g2-1: inputs that need no human lap, How the route is found, How to run, Not done, not tested, Result in short, Smoke tests, The files (+2 more)

### Community 96 - "g2-2: random track generator"
Cohesion: 0.20
Nodes (10): 1. The piece table, 2. The generator, 3. Is a generated track real?, 4. Output, and pointing training at it, Changes made by the tester, Cost of a full run, Files, g2-2: random track generator (+2 more)

### Community 98 - "worker_entry.mjs"
Cohesion: 0.29
Nodes (6): handleControl(), memories, physicsBytes(), restoreSnapshot(), snapshots, takeSnapshot()

### Community 99 - "fetch_laps.mjs"
Cohesion: 0.22
Nodes (9): allOfficial, amount, args, get(), officialDir, opt, outDir, sleep() (+1 more)

### Community 100 - "ppo_blkgen2 / ppo_blkgen.best2.pt (best generalist)"
Cohesion: 0.25
Nodes (8): Held-out tracks (desert3, summer3, winter4), Next: resume off-policy learner on desert4, g1-6-iqn_desert4 (off-policy IQN learner), ppo_blkgen2 / ppo_blkgen.best2.pt (best generalist), ppo_g3blk_<track> (set 3, rules 1-3), ppo_gblk_<track> (set 2 specialists), ppo_sr1_/ppo_sr2_<track> (search, then train), Fixed-seed fingerprint (docs/refactor/fingerprint.mjs)

### Community 101 - "g1-2: stitch a lap from the fastest sections of several human laps"
Cohesion: 0.22
Nodes (9): g1-2: stitch a lap from the fastest sections of several human laps, How it works, How often a join survives, Not done, not tested, Section times and the theoretical best, Stitched laps, The cost of repair, What a full run would cost (+1 more)

### Community 102 - "test_4_car_vs_sim.mjs"
Cohesion: 0.36
Nodes (7): within(), accelAt(), car, crossing(), dist(), speedAt(), turnOf()

### Community 103 - "sim/drive.mjs"
Cohesion: 0.39
Nodes (6): options, track, driveLap(), loadHumanLap(), loadReferenceLine(), buildLine()

### Community 105 - "g1-1: search from the human's lap"
Cohesion: 0.25
Nodes (8): Changes needed elsewhere, g1-1: search from the human's lap, How to run, Not done, not tested, The idea, What a longer run would probably do, What happens to the rest of the lap (the open problem), What was tested, with numbers

### Community 106 - "g1-2-stitch-human-laps/README.md"
Cohesion: 0.43
Nodes (4): Best-of-sections theoretical bound (not a close one), Plan: dynamic programming over (boundary, lap) with switch cost, Section boundaries: planes across the road every 250 ms, State mismatch in millisecond-equivalents

### Community 107 - "g1-4-beam-search/README.md"
Cohesion: 0.39
Nodes (4): Beam of partial laps as save states, extended one 50 ms decision at a time, Next step: a learned ranking fitted to finish times, Ranking measures (progress, value, look H, lookvalue H), Check: beam=1 returns the starting lap exactly

### Community 108 - "analyze.mjs"
Cohesion: 0.25
Nodes (6): BACK_EDGES, BUDGETS, dir, groups, restarts, runs

### Community 109 - "toy_probe.py"
Cohesion: 0.32
Nodes (3): myopic(), p_through(), play()

### Community 110 - "watch_ghost.mjs"
Cohesion: 0.25
Nodes (5): args, checkOnly, [name = 'summer1', run = 'baseline'], recordValue, trackId

### Community 111 - "check_track.mjs"
Cohesion: 0.25
Nodes (4): args, checkpoint, driven, positional

### Community 112 - "Goal 2: generalist for any track"
Cohesion: 0.29
Nodes (7): Goal 2: generalist for any track, Next: reference-free generalist (g2-1 inputs), Next: one message per block decision in stepBlock, Human lap / reference lap, ppo_follow (follow the reference), Phase 4: split racing_env.mjs (deferred), Drivable ground at height 0

### Community 113 - "g1-3-search-train-rounds/tests/run_tests.mjs"
Cohesion: 0.38
Nodes (5): HERE, PROJECT, t0, KNOWN, TESTS

### Community 114 - "g1-6-offpolicy-rl/tests/run_tests.mjs"
Cohesion: 0.38
Nodes (5): HERE, PROJECT, t0, KNOWN, TESTS

### Community 115 - "g2-2 tests"
Cohesion: 0.29
Nodes (7): Defects, Fixed, g2-2 tests, Not fixed, Observations that are not defects, The README's claims, What is not covered, and why

### Community 116 - "sectional.mjs"
Cohesion: 0.38
Nodes (6): angleBetween(), controlsAt(), heldAt(), nextFlipAfter(), rejoin(), REJOIN_DEFAULTS

### Community 117 - "Tests of g1-1 (search from the human's lap)"
Cohesion: 0.33
Nodes (6): Headline claims, Not covered, and why, Other claims in the README, Tests of g1-1 (search from the human's lap), What is covered, splice()

### Community 119 - "Request: search_round.sh not safe to rerun"
Cohesion: 0.33
Nodes (3): Request: search_round.sh not safe to rerun, search_round.sh script, train_block_specialist_from.sh script

### Community 120 - "g2-1-reference-free-inputs/tests/run_tests.mjs"
Cohesion: 0.33
Nodes (5): failures, files, here, root, started

### Community 121 - "g2-2-track-generator/tests/run_tests.mjs"
Cohesion: 0.33
Nodes (5): failures, files, here, root, started

### Community 122 - "g2-3-explore-and-adapt/tests/run_tests.mjs"
Cohesion: 0.33
Nodes (3): ROOT, STAGES, t0

### Community 123 - "g2-4-lookahead-driving/tests/run_tests.mjs"
Cohesion: 0.33
Nodes (3): ROOT, STAGES, t0

### Community 124 - "ppo_general2 (road edges, contact penalty)"
Cohesion: 0.40
Nodes (4): ppo_general (first generalist), ppo_general2 (road edges, contact penalty), ppo_general3 (held keys, imitation start), ppo_summer1 (first single-track agent)

### Community 125 - "g1-1 human-seed search"
Cohesion: 0.40
Nodes (3): Caveat: sub-human laps are re-timed human laps, Lap time is jagged at the millisecond, Position inside the finish tick (sub-tick measure)

## Knowledge Gaps
- **34 isolated node(s):** `numpy>=1.26`, `One-off gain from how the car is angled at the finish line`, `Full run estimate: 10 to 50 million decisions`, `Status: no training run done, no lap time`, `Not covered: the practice step has never been run for real` (+29 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1256 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RacingEnv` connect `RacingEnv` to `Lookahead driver (driveLap)`, `g2-2: random track generator`, `env.mjs`, `block_rollout.mjs`, `test_policy_rollout.mjs`, `TrackMemory`, `train_iqn.py`, `racing_env.mjs`, `Polytrack-ML refactor plan`, `iqn_server.mjs`, `explore.mjs`, `test_agent.py`, `g1-6-offpolicy-rl/README.md`, `progress`, `g2-1: inputs that need no human lap`?**
  _High betweenness centrality (0.115) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `loadTrack()` (e.g. with `Phase 3: Deduplication (medium; each step gated by a fixed-seed comparison)` and `Progress (16 October 2026): phases 1 to 3 done, not committed`) actually correct?**
  _`loadTrack()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `numpy>=1.26`, `One-off gain from how the car is angled at the finish line`, `Full run estimate: 10 to 50 million decisions` to the rest of the system?**
  _34 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Lookahead driver (driveLap)` be split into smaller, more focused modules?**
  _Cohesion score 0.053534660260809885 - nodes in this community are weakly interconnected._
- **Why does `createRng()` connect `createRng` to `beam.mjs`, `block_rollout.mjs`, `laps.mjs`, `search_rollout.mjs`, `test_logs.mjs`, `calibrate.mjs`, `test_policy_rollout.mjs`, `search_sections.mjs`, `search_timeline.mjs`, `racing_env.mjs`, `Polytrack-ML refactor plan`, `generate.mjs`, `search_settings.mjs`, `explore.mjs`, `stitch_laps.mjs`, `search.mjs`, `section_worker.mjs`, `RacingEnv`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `Env` (e.g. with `What is not done or not tested` and `Layout`) actually correct?**
  _`Env` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `env.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.04850055534987042 - nodes in this community are weakly interconnected._