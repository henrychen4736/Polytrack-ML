# Graph Report - Polytrack-ML  (2026-10-18)

## Corpus Check
- 472 files · ~453,653 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 65 file(s) not represented in the graph (top: .log 28, .result 17, .jsonl 15)

## Summary
- 2854 nodes · 6321 edges · 171 communities (141 shown, 30 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 400 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `79fa26e2`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Lookahead driver (driveLap)
- ref_node_fs
- check_track.mjs
- test_3_under_road_sim.mjs
- ReplayBuffer
- refine.mjs
- laps.mjs
- torch
- lib.mjs
- test_policy_rollout.mjs
- g1-4-beam-search/tests/test_child.mjs
- ref_node_child_process
- g2-3-explore-and-adapt/README.md
- rotate
- check_pieces.mjs
- g2-4-lookahead-driving/tests/test_logic.mjs
- explore.mjs
- numpy
- rounds.mjs
- stitch_laps.mjs
- validate.mjs
- createRng
- g1-6-offpolicy-rl/README.md
- compare_human.mjs
- shared/tests/harness.mjs
- recording.mjs
- test_3_generator.mjs
- PolytrackVecEnv
- racing_env.mjs
- observation.mjs
- test_driver.mjs
- beam.mjs
- test_lock.mjs
- g1-7 computed racing line README
- fit_car.mjs
- g2-2-track-generator/drive.mjs
- test_logs.mjs
- paths.mjs
- search_rollout.mjs
- test_6_scripts_sim.mjs
- search_sections.mjs
- search_human.mjs
- test_restart.mjs
- pretrain_bc.py
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
- track.mjs
- test_5_corridor_sim.mjs
- g1-5 fine key timing README
- test_sim_b.mjs
- MemoryEnv
- test_4_sim.mjs
- test_beam.mjs
- key_usage.mjs
- g1-4-beam-search/tests/TESTING.md
- diff_capture.mjs
- Polytrack-ML
- test_follow.mjs
- calibrate.mjs
- .load
- test_1_pieces.mjs
- run_all_tests.mjs
- fingerprint.mjs
- BRIEF.md
- smoke_real.mjs
- test_3_testpad_sim.mjs
- Polytrack-ML
- README.md
- ppo_rays (17 distance rays)
- g1-5 independent tests (TESTING.md)
- trace.mjs
- g1-4: beam search over block decisions
- replica_check.mjs
- g1-7: a computed racing line
- g2-2-track-generator/README.md
- savestate_test.mjs
- g1-5: fine key timing (1 ms)
- search.mjs
- test_python.mjs
- g2-3 Explore and adapt
- progress
- route.mjs
- search_timeline.mjs
- g2-2-track-generator/smoke_test.mjs
- test_network
- ppo_blkgen2 / ppo_blkgen.best2.pt (best generalist)
- g1-2: stitch a lap from the fastest sections of several human laps
- g2-5-memory-policy/README.md
- decodeState
- SimSession
- test_sim.mjs
- g1-2-stitch-human-laps/README.md
- g1-4-beam-search/README.md
- analyze.mjs
- toy_probe.py
- g2-1: inputs that need no human lap
- g2-2-train_route_on_generated.sh
- Next: one message per block decision in stepBlock
- g2-4: look ahead while driving
- g1-3 independent tests
- g1-3-train_on_candidates.sh
- g2-2-eval_route_on_generated.sh
- test_1_raceline.mjs
- Requests to the orchestrator (ideas/shared/REQUESTS.md)
- g1-2-run_all.sh
- train_memory.sh
- g2-2-make_set.sh script
- queue_unfinished.sh
- g1-1: search from the human's lap
- test_server.py
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
- compare_sections.mjs
- host.mjs
- test_agent.py
- g1-4-beam-search/tests/run_tests.mjs
- g2-5-memory-policy/tests/run_tests.mjs
- driveTrack
- g2-2: random track generator
- train_route_generalist.sh
- eval_route_generalist.sh
- finetune_run.sh
- g1-4 beam search
- search_round.sh
- train_block_specialist_from.sh
- g1-3 search-train rounds README
- stepBlock: one message per 50 ms block
- progress.mjs
- route_store.mjs
- rl/: reinforcement learning on the headless simulator
- ref_node_url
- test_sim_session.mjs
- sim/drive.mjs
- g1-1-human-seed-search/README.md
- pickCopy
- train_ppo.py
- queue_untried.sh
- g2-3-explore-and-adapt/tests/run_tests.mjs
- sectional.mjs
- Brief for the idea agents
- g2-4 lookahead driving: independent tests
- Model history
- Tests of g1-1 (search from the human's lap)
- read_actor

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
  docs/archive/refactor-2026-10/plan.md → rl/racing_env.mjs
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
- **Reference-free generalist pipeline: geometric route, generated tracks, attempt memory** — ideas_g2_1_reference_free_inputs_readme_geometric_route, ideas_g2_1_reference_free_inputs_readme_observation_334, ideas_g2_2_track_generator_readme_chain_generator, ideas_g2_5_memory_policy_readme_track_memory_map, ideas_g2_5_memory_policy_readme_curriculum [INFERRED 0.85]
- **Node environment to Python PPO training pipeline** — sim_env, rl_racing_env, rl_env_server, rl_polytrack_env, rl_train_ppo, rl_evaluate [INFERRED 0.85]
- **Three ways to get the generalist round unseen tracks (explore, lookahead, memory)** — ideas_g2_3_explore_and_adapt_readme_explore_loop, ideas_g2_4_lookahead_driving_readme_lookahead_driver, ideas_g2_5_memory_policy_readme_design_b_attempt_conditioned_inputs, ideas_g2_3_explore_and_adapt_readme_unseen_tracks_test_set, ideas_g2_3_explore_and_adapt_readme_ppo_blkgen_best2_generalist [INFERRED 0.85]

## Communities (171 total, 30 thin omitted)

### Community 0 - "Lookahead driver (driveLap)"
Cohesion: 0.26
Nodes (20): Generalist checkpoint ppo_blkgen.best2, Lookahead run log main_a (desert3/winter4 seeds, lazy defaults), Lookahead run log main_b (desert3/summer3 seeds, lazy defaults), Lookahead run log saved (verified saved laps winter4, desert3, summer3), Lookahead smoke test log (winter4 seeds 10, 12: 5 of 5 PASS), Specialist desert4 full lookahead, score progress (21.988 s), Specialist desert4 full lookahead, score reward (22.006 s), Specialist desert4 full lookahead, score value (22.042 s) (+12 more)

### Community 1 - "ref_node_fs"
Cohesion: 0.07
Nodes (29): { check }, { check, note }, clean(), counts, filesOf(), NAMES, read(), recheck() (+21 more)

### Community 2 - "check_track.mjs"
Cohesion: 0.25
Nodes (5): args, checkpoint, driven, flag(), positional

### Community 3 - "test_3_under_road_sim.mjs"
Cohesion: 0.09
Nodes (25): RIDE_HEIGHT, SPACING, check(), fmt(), known(), median(), near(), percentile() (+17 more)

### Community 4 - "ReplayBuffer"
Cohesion: 0.10
Nodes (9): ReplayBuffer, check(), n_step_one(), test_n_step(), test_sampling(), buffer_from(), ground_truth_trial(), stream() (+1 more)

### Community 5 - "refine.mjs"
Cohesion: 0.06
Nodes (47): better(), copy(), listFlips(), makePlane(), MOVABLE, nudge(), openSims(), parseArgs() (+39 more)

### Community 6 - "laps.mjs"
Cohesion: 0.10
Nodes (39): Block decision [steer, steerAt, w, wAt, s, sAt], BLOCK_SLICES, BLOCK_TICKS, controlsOf(), decisionsToKeys(), humanLaps(), keysToDecisions(), keysToRecording() (+31 more)

### Community 7 - "torch"
Cohesion: 0.07
Nodes (24): main(), export_actor(), IQN, quantile_huber_loss(), Files, IqnServers, check(), main() (+16 more)

### Community 8 - "lib.mjs"
Cohesion: 0.18
Nodes (12): concludeRound(), copiesToTest(), DEFAULTS, ID, parseAttempt(), parseSearchLog(), summariseCopy(), readAttempt() (+4 more)

### Community 9 - "test_policy_rollout.mjs"
Cohesion: 0.07
Nodes (40): [actorFile, obsFile, outFile, size], all, bytes, obsSize, out, policy, BLOCK_ENV, [actorFile, criticFile] (+32 more)

### Community 11 - "g1-4-beam-search/tests/test_child.mjs"
Cohesion: 0.10
Nodes (16): check(), failed, finish(), passed, same(), throws(), a, b (+8 more)

### Community 12 - "ref_node_child_process"
Cohesion: 0.09
Nodes (16): failures, files, here, root, started, failures, files, here (+8 more)

### Community 13 - "g2-3-explore-and-adapt/README.md"
Cohesion: 0.17
Nodes (14): Fine-tune plan (dry run, not executed), Plain mode baseline (attempts from the start line), Budget counted in simulated laps, Unseen test tracks: desert3, summer3, winter4, Result: winter4 explore 8 of 8 vs plain 0 of 8, g2-3 independent tests (TESTING.md), Car-replacement path forced by test hook, hook.mjs: RacingEnv instrumentation wrapper for tests (+6 more)

### Community 14 - "rotate"
Cohesion: 0.13
Nodes (22): u8(), chooseTracks(), FEATURE_SETS, hasFeature(), structureFailures(), TEST_KINDS, TRAIN_CYCLE, saveTrack() (+14 more)

### Community 15 - "check_pieces.mjs"
Cohesion: 0.08
Nodes (24): count, firstSeed, LENGTHS, started, used, worst, checkOfficial(), matePorts() (+16 more)

### Community 16 - "g2-4-lookahead-driving/tests/test_logic.mjs"
Cohesion: 0.16
Nodes (9): dead, invariants(), L, R, run(), S, replayToy(), ToyEnv (+1 more)

### Community 17 - "explore.mjs"
Cohesion: 0.07
Nodes (33): archive, args, attempt(), BACK, BACK_MIN, cellKey(), chooseCell(), file (+25 more)

### Community 18 - "numpy"
Cohesion: 0.08
Nodes (5): _decode(), one(), net(), run(), track_label()

### Community 19 - "rounds.mjs"
Cohesion: 0.21
Nodes (28): paths(), seconds(), at(), attemptsOf(), ckptSteps(), createState(), dropLock(), existingCopies() (+20 more)

### Community 20 - "stitch_laps.mjs"
Cohesion: 0.06
Nodes (30): acceptCost, allowedCost(), args, attempts, banned, bestOf, checkMs, fallbacks (+22 more)

### Community 21 - "validate.mjs"
Cohesion: 0.18
Nodes (8): EVERY, args, fresh, jobs, names, perTrack, rank, verdicts

### Community 22 - "createRng"
Cohesion: 0.15
Nodes (7): [mode, file], trace, laps, track, W_ONLY, OBS_SIZE_ROUTE, createRng()

### Community 23 - "g1-6-offpolicy-rl/README.md"
Cohesion: 0.10
Nodes (23): Changed after independent testing, Changes needed elsewhere, Design, and why, Double Q-learning, dueling head, target network, Full run estimate: 10 to 50 million decisions, g1-6: off-policy distributional learner, rewarded for progress only, How to run, iqn.py (network, quantile Huber loss, actor file) (+15 more)

### Community 24 - "compare_human.mjs"
Cohesion: 0.14
Nodes (11): fill(), GRAVITY, loadCarModel(), car, tracks, car, human, kappaHuman (+3 more)

### Community 25 - "shared/tests/harness.mjs"
Cohesion: 0.07
Nodes (34): { check, note }, clean(), runFiles, said, TMP, ask(), before(), { check, eq, note } (+26 more)

### Community 26 - "recording.mjs"
Cohesion: 0.07
Nodes (34): { check, note }, CLAIMS, attempt(), ladder, prepare(), samePrefix(), snapshot(), args (+26 more)

### Community 27 - "test_3_generator.mjs"
Cohesion: 0.17
Nodes (12): ROUTE_SPACING, check(), fmt(), near(), section(), detectorBox(), dist(), examine() (+4 more)

### Community 28 - "PolytrackVecEnv"
Cohesion: 0.10
Nodes (6): main(), parse_args(), _obs(), PolytrackEnv, PolytrackVecEnv, _random_policy_check()

### Community 29 - "racing_env.mjs"
Cohesion: 0.06
Nodes (29): straight(), Changes needed elsewhere, freshAfter, history, m, marked, Changes needed elsewhere, tracks (+21 more)

### Community 30 - "observation.mjs"
Cohesion: 0.07
Nodes (26): createObserver(), LOOKAHEAD_POINTS, OBS_CONTACT, OBS_CURVATURE, OBS_EDGE_AHEAD, OBS_EDGE_NOW, OBS_FLIGHT, OBS_FRACTION (+18 more)

### Community 31 - "test_driver.mjs"
Cohesion: 0.08
Nodes (24): build(), changed, ckpts, COPIES, D, driveOne(), drives, fin() (+16 more)

### Community 32 - "beam.mjs"
Cohesion: 0.08
Nodes (26): alongBin, args, ask(), BEAM, elapsed(), elite, incumbent, latBin (+18 more)

### Community 33 - "test_lock.mjs"
Cohesion: 0.19
Nodes (10): stateOf(), before, clean(), DRIVER, launch(), lockFile(), PROJECT, TAGS (+2 more)

### Community 34 - "g1-7 computed racing line README"
Cohesion: 0.15
Nodes (20): g1-7 computed racing line README, Where it could pay: tracks with flat braking zones, Fitted car model (car_model.mjs / car_model.json), check_turn_limit.mjs (pad limit vs human laps, ratio 1.00), compare_human.mjs (calibration against the human lap), Result: computed line lap 22.083 s vs human 21.750 s, drive_line.mjs (pure-pursuit tracker driving the line), fit_car.mjs (car experiments on the pad) (+12 more)

### Community 35 - "fit_car.mjs"
Cohesion: 0.09
Nodes (21): accelRun, accelW, binBySpeed(), brake, brakeRun, coast, coastRun, entries (+13 more)

### Community 36 - "g2-2-track-generator/drive.mjs"
Cohesion: 0.18
Nodes (14): follow(), follow(), attempt(), OFF_ROAD, OFF_SURFACE, routeToLine(), driveJump(), jumpTrack() (+6 more)

### Community 37 - "test_logs.mjs"
Cohesion: 0.16
Nodes (19): cost(), early, finishedPlain, lazy, long, of(), one(), pair() (+11 more)

### Community 38 - "paths.mjs"
Cohesion: 0.23
Nodes (17): carState(), compare(), angleBetween(), crossings(), locate(), mismatch(), MISMATCH_WEIGHTS, MOTION_GAP (+9 more)

### Community 39 - "search_rollout.mjs"
Cohesion: 0.10
Nodes (17): alter(), args, exported, keepMs, name, near, opt, passes (+9 more)

### Community 40 - "test_6_scripts_sim.mjs"
Cohesion: 0.14
Nodes (17): check(), fmt(), known(), median(), near(), percentile(), section(), within() (+9 more)

### Community 41 - "search_sections.mjs"
Cohesion: 0.08
Nodes (20): args, best, finalString, minScore, mutateOptions, opt, outFile, passes (+12 more)

### Community 42 - "search_human.mjs"
Cohesion: 0.09
Nodes (17): args, best, opt, outDir, OWN, passes, seconds, sectionTicks (+9 more)

### Community 43 - "test_restart.mjs"
Cohesion: 0.12
Nodes (18): ALL, BASES, check(), COPIES, cutLog, expect(), fullLog, fullText (+10 more)

### Community 44 - "pretrain_bc.py"
Cohesion: 0.10
Nodes (5): EnvServer, collect(), losses(), main(), block_imitation_loss()

### Community 45 - "search_settings.mjs"
Cohesion: 0.11
Nodes (19): args, bigMoveChance, clamp(), current, extraChance, gaussian(), GLOBALS, mutateSettings() (+11 more)

### Community 46 - "Polytrack-ML refactor plan"
Cohesion: 0.16
Nodes (12): Context, Deliberately not changing, Housekeeping (needs Henry's yes), Phase 1: Bug fixes (small, no effect on results), Phase 2: One source for each shared constant (about 30 lines, no effect on results), Phase 3: Deduplication (medium; each step gated by a fixed-seed comparison), Phase 4 (optional, only with Phase 5 of "What is next"): split `racing_env.mjs`, Polytrack-ML refactor plan (+4 more)

### Community 47 - "capture_init.mjs"
Cohesion: 0.10
Nodes (15): devDependencies, playwright-core, name, private, scripts, capture, setup, test (+7 more)

### Community 48 - "iqn_server.mjs"
Cohesion: 0.22
Nodes (17): b64(), begin(), decisionOf(), drive(), evaluate(), greedy(), handle(), HUMAN_DOING (+9 more)

### Community 49 - "raceline.mjs"
Cohesion: 0.24
Nodes (18): speedFor(), curvature(), dot(), optimiseLine(), optimiseTime(), shiftedPoints(), speedProfile(), sub() (+10 more)

### Community 50 - "plot_dump.mjs"
Cohesion: 0.19
Nodes (9): info, nodes, route, surface, buildSurface(), near(), CellMap, EDGE_CAP (+1 more)

### Community 51 - "g2-3-explore-and-adapt/tests/test_logic.mjs"
Cohesion: 0.11
Nodes (14): BUDGETS, CELL_LENGTH, CELL_WIDTH, cellKey, GAIN, HERE, keys, logs (+6 more)

### Community 52 - "generate.mjs"
Cohesion: 0.12
Nodes (36): BANKED_IDS, CHECKPOINT_WIDE, compositeEnds(), COMPOSITES, featurePieces(), FINISH_WIDE, flightDistance(), GRAVITY (+28 more)

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
Nodes (8): recordPath(), spinBetween(), joins, [name, ...rest], paths, settings, { ticks }, track

### Community 57 - "Route built from track geometry alone"
Cohesion: 0.22
Nodes (9): Missing speed profile from curvature, Changes needed in RacingEnv to use the route reference, Validation of route against fastest human lap on 17 official tracks, g2-1 independent tests (TESTING.md), Observation: route floats 0.5 to 1.1 units off curved surfaces, test_3: g2-1 route on a g2-2 generated track, compare_g21: g2-1 route finder as second opinion, Limitation: explore still needs a human reference lap (+1 more)

### Community 58 - "memory_test.mjs"
Cohesion: 0.04
Nodes (45): 5. Speed, memory, tick budget, args, KINDS, report, rng, rows, started, MEMORY_DEFAULTS (+37 more)

### Community 59 - "test_memory_env.mjs"
Cohesion: 0.15
Nodes (11): known(), attempt(), draw, edgesNow(), expectedLengths, lengths, OFF, policy (+3 more)

### Community 60 - "section_worker.mjs"
Cohesion: 0.25
Nodes (17): dist2(), drive(), driveTail(), driveTo(), faster(), pos, pose, quat (+9 more)

### Community 61 - "track.mjs"
Cohesion: 0.21
Nodes (10): deflate(), encodeExportString(), encodeSaveString(), partsToBytes(), wrap(), keyOf(), sameParts(), DETECTOR_CHECKPOINT (+2 more)

### Community 62 - "test_5_corridor_sim.mjs"
Cohesion: 0.16
Nodes (13): AIR_GUARD, along(), buildCorridor(), cross(), MARGIN, MAX_ROOM, roomBeside(), SPACING (+5 more)

### Community 63 - "g1-5 fine key timing README"
Cohesion: 0.26
Nodes (6): g1-5 fine key timing README, Result: best human lap 21.750 -> 21.722 s, verified, refine.mjs (flip-timing search, verified lap out), Result: searched lap 21.907 s, 0 ms gained, smoothness.mjs (lap time vs one flip's time), Defect: smoothness.mjs flips=1 crashed (0/0 NaN), fixed

### Community 64 - "test_sim_b.mjs"
Cohesion: 0.06
Nodes (44): a, marks, policy, t(), args, finishedLaps, keepMs, opt (+36 more)

### Community 65 - "MemoryEnv"
Cohesion: 0.12
Nodes (9): MemoryEnv, Changes needed elsewhere, Curriculum, g2-5: a policy with memory of its earlier attempts, Not done, not tested, What a full run would cost, What is remembered, exactly, Which design, and why (+1 more)

### Community 66 - "test_4_sim.mjs"
Cohesion: 0.19
Nodes (17): DRIVER_DEFAULTS, decodeParts(), gatesOf(), meshOf(), overlappingParts(), partTriangles(), partVoxels(), voxelCache (+9 more)

### Community 67 - "test_beam.mjs"
Cohesion: 0.16
Nodes (13): a, b, BEAM, c, d, e, f, files() (+5 more)

### Community 68 - "key_usage.mjs"
Cohesion: 0.11
Nodes (18): profile(), h, hu, human, humanKeys, LENGTH, line, [name, run, stretchesArg = '16', lengthArg = '15'] (+10 more)

### Community 69 - "g1-4-beam-search/tests/TESTING.md"
Cohesion: 0.21
Nodes (12): prune(), same(), ranks(), spearman(), Diversity buckets and per-process share in pruning, Check: the same command gives the same lap, recording and log, Did the README's claims hold?, Note: the elite does not count towards its bucket (+4 more)

### Community 70 - "diff_capture.mjs"
Cohesion: 0.10
Nodes (10): byId, cap, ours, handleControl(), memories, physicsBytes(), restoreSnapshot(), schedules (+2 more)

### Community 71 - "Polytrack-ML"
Cohesion: 0.15
Nodes (13): Coding conventions, graphify, Hard rules, How the car should be driven (Henry's knowledge of the game), Lessons that cost something to learn, Model history, Polytrack-ML, Status (12 October 2026) (+5 more)

### Community 72 - "test_follow.mjs"
Cohesion: 0.22
Nodes (9): corrections(), donorKeys(), follow(), FOLLOW_DEFAULTS, NONE, { check, eq, throws, note }, knockedOff(), OFF (+1 more)

### Community 73 - "calibrate.mjs"
Cohesion: 0.18
Nodes (10): args, HORIZONS, N, opt, rng, seed(), starts, states (+2 more)

### Community 74 - ".load"
Cohesion: 0.21
Nodes (11): Changes needed elsewhere, restore(), snapshot(), Tests of g1-2 (independent tester), Defects found, Headline claim, Headline claim holds: desert4 21.730 s reproduced key for key, Defect (fixed): stitch_laps exited 0 on NO LAP (+3 more)

### Community 75 - "test_1_pieces.mjs"
Cohesion: 0.14
Nodes (15): cross(), derivePorts(), key(), onGridPlane(), sub(), TILTED_IDS, describe(), GENERATOR_IDS (+7 more)

### Community 76 - "run_all_tests.mjs"
Cohesion: 0.17
Nodes (11): folders, IDEAS, killTree(), LOGS, results, ROOT, runFolder(), t0 (+3 more)

### Community 77 - "fingerprint.mjs"
Cohesion: 0.11
Nodes (13): blockArgs, oldActor, oldSteps, out, rolls, ROOT, server(), strip() (+5 more)

### Community 78 - "BRIEF.md"
Cohesion: 0.24
Nodes (6): Deliverables: runnable code plus README per idea, Orchestrator plus twelve idea agents, ideas/shared and CONTRACT.md (orchestrator-owned), Shared code contract (ideas/shared/CONTRACT.md), Promoted modules (phase 2), Rules for working side by side (runs/ prefixes, two simulators)

### Community 79 - "smoke_real.mjs"
Cohesion: 0.21
Nodes (11): IDEA_DIR, at(), cleanUp(), keep, launch(), ours(), p, PROJECT (+3 more)

### Community 80 - "test_3_testpad_sim.mjs"
Cohesion: 0.39
Nodes (5): buildPad(), PLATE_CELLS, PLATE_UNITS, pad, Car physics facts (turning limit 0.42 units per km/h)

### Community 81 - "Polytrack-ML"
Cohesion: 0.22
Nodes (7): Acceptance tests, Captured Init payload (data/init_0.6.3.json), Driving and watching a lap, Layout, Polytrack-ML, Setup, Things that were not obvious

### Community 82 - "README.md"
Cohesion: 0.22
Nodes (6): Goal 1: lap faster than best human, Lap time jagged to the millisecond, Next: resume off-policy learner on desert4, g1-6-iqn_desert4 (off-policy IQN learner), Sub-human laps from human-lap search (four tracks), The twelve ideas (g1-1 to g2-5)

### Community 83 - "ppo_rays (17 distance rays)"
Cohesion: 0.13
Nodes (12): Block decision scheme (50 ms), Old scheme (10 ms, 12 key combinations), ppo_blk_<track> (set 1 specialists), ppo_blkgen (block generalist), ppo_block.bc.pt (block-scheme imitation start), ppo_general (first generalist), ppo_general2 (road edges, contact penalty), ppo_general3 (held keys, imitation start) (+4 more)

### Community 84 - "g1-5 independent tests (TESTING.md)"
Cohesion: 0.19
Nodes (13): child.mjs (simulator process: prepare / try, save-state ladder), fine.mjs (nudge, shiftTail, subTick, pool wrapper), subTick() sub-tick lap time estimate, g1-5 independent tests (TESTING.md), Hazard: a child that throws leaves the parent waiting for ever, Headline claim holds: 21.722 s lap replays and verifies, Check: save-state ladder never starts from a stale state, Car tick budget (~6M ticks per car) (+5 more)

### Community 85 - "trace.mjs"
Cohesion: 0.18
Nodes (10): [i,j,k], [name, join, opts='{}', every='5'], paths, t0, { ticks }, trace(), track, renewCar() (+2 more)

### Community 86 - "g1-4: beam search over block decisions"
Cohesion: 0.18
Nodes (11): 1. What to rank by (`calibrate.mjs`), 2. The beam on one stretch, three rankings, 3. Against the 21.907 s lap (`from=runs/rollout_desert4.json`), 4. Checks, A full run: cost and what it might gain, Changes needed elsewhere, Files, g1-4: beam search over block decisions (+3 more)

### Community 87 - "replica_check.mjs"
Cohesion: 0.11
Nodes (17): check(), failed, finish(), passed, same(), throws(), actions, dump (+9 more)

### Community 88 - "g1-7: a computed racing line"
Cohesion: 0.18
Nodes (11): 1. The fitted car (flat pad, `car_model.json`), 2. The corridor, 3. The line and the speed profile, 4. Against the human lap (desert4, 21.750 s), Changes needed elsewhere, Cost of a full run, g1-7: a computed racing line, How to run (from the project root) (+3 more)

### Community 89 - "g2-2-track-generator/README.md"
Cohesion: 0.26
Nodes (9): Difficulty as a knob on the piece mix, Nine smoke checks for a generated track, Finding: official tracks are not reconstructible as piece chains, Generated track output files (track.json, route.json, lap.json), Port mating rule, Track string encoder (codec), g2-2 independent tests (TESTING.md), Fix: driveTrack reported a broken ground-level track as finished (+1 more)

### Community 90 - "savestate_test.mjs"
Cohesion: 0.20
Nodes (9): sha(), checks, finishOf(), hash(), human, keys, t0, track (+1 more)

### Community 91 - "g1-5: fine key timing (1 ms)"
Cohesion: 0.18
Nodes (11): Changes needed elsewhere, Cost of a full run, Files, g1-5: fine key timing (1 ms), How to run, Not done, not tested, Smoke test 1: searched lap, flips from 18.0 s to the finish, Smoke test 2: best human lap, flips from 17.75 s to the finish (+3 more)

### Community 92 - "search.mjs"
Cohesion: 0.31
Nodes (8): change(), sameBefore(), Defect found (fixed), countFlips(), MUTABLE, mutate(), MUTATE_DEFAULTS, randInt()

### Community 93 - "test_python.mjs"
Cohesion: 0.20
Nodes (11): check(), failed, finish(), passed, same(), throws(), PROJECT, SCRIPTS (+3 more)

### Community 94 - "g2-3 Explore and adapt"
Cohesion: 0.22
Nodes (9): Changes needed elsewhere, Cost of a full run, Design questions, and what the logs say, Files, Fine-tune (dry run only), g2-3 Explore and adapt, How to run (from the project root), The test set (+1 more)

### Community 95 - "progress"
Cohesion: 0.22
Nodes (10): Defects, g2-1 tests, Not fixed, Observations that are not defects, The README's claims, What is not covered, and why, Not done, not tested, Not done, not tested (+2 more)

### Community 96 - "route.mjs"
Cohesion: 0.26
Nodes (14): buildRoute(), flights(), runStage(), cross(), dist(), dot(), finishRoute(), gateStages() (+6 more)

### Community 97 - "search_timeline.mjs"
Cohesion: 0.09
Nodes (19): saveProgress(), { check, eq, note }, inputs, lap, replay(), args, best, finalString (+11 more)

### Community 98 - "g2-2-track-generator/smoke_test.mjs"
Cohesion: 0.14
Nodes (10): dir, failed, files, [shard, shards], started, saveLap(), loadGenerated(), difficulty (+2 more)

### Community 100 - "ppo_blkgen2 / ppo_blkgen.best2.pt (best generalist)"
Cohesion: 0.22
Nodes (10): Goal 2: generalist for any track, Held-out tracks (desert3, summer3, winter4), Next: reference-free generalist (g2-1 inputs), Human lap / reference lap, ppo_blkgen2 / ppo_blkgen.best2.pt (best generalist), ppo_follow (follow the reference), ppo_g3blk_<track> (set 3, rules 1-3), ppo_gblk_<track> (set 2 specialists) (+2 more)

### Community 101 - "g1-2: stitch a lap from the fastest sections of several human laps"
Cohesion: 0.22
Nodes (9): g1-2: stitch a lap from the fastest sections of several human laps, How it works, How often a join survives, Not done, not tested, Section times and the theoretical best, Stitched laps, The cost of repair, What a full run would cost (+1 more)

### Community 102 - "g2-5-memory-policy/README.md"
Cohesion: 0.23
Nodes (9): 3 s doomed window assumption, MemoryAgent warm-started from the generalist, 130 extra memory inputs (482-wide observation), toy_probe: one corner with a hidden speed limit, g2-5 independent tests (TESTING.md), Defects, g2-5 memory policy: independent tests, Fix: last observation of an attempt showed that attempt's own memory (+1 more)

### Community 103 - "decodeState"
Cohesion: 0.27
Nodes (8): CAR_TICK_BUDGET, drive(), prepare(), nextFlipAfter(), decodeState(), STATE_BYTES, stateFinished(), stateFrames()

### Community 104 - "SimSession"
Cohesion: 0.21
Nodes (3): same(), SimSession, Defects found

### Community 105 - "test_sim.mjs"
Cohesion: 0.19
Nodes (7): check(), finish(), same(), HERE, ROOT, TMP, written

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

### Community 113 - "g2-4: look ahead while driving"
Cohesion: 0.18
Nodes (10): Cost of a full run, Design questions, Files, g2-4: look ahead while driving, How to run, Lookahead driver, defaults (lazy, horizon 40, every 10, backing up), Numbers, Plain policy on the unseen tracks (baseline) (+2 more)

### Community 114 - "g1-3 independent tests"
Cohesion: 0.21
Nodes (10): chooseExamples(), parseArgs(), trainPlan(), alive(), takeLock(), g1-3 independent tests, Defects found, Check: learning rate across legs equals the uninterrupted round (+2 more)

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

### Community 124 - "g1-1: search from the human's lap"
Cohesion: 0.25
Nodes (8): Changes needed elsewhere, g1-1: search from the human's lap, How to run, Not done, not tested, The idea, What a longer run would probably do, What happens to the rest of the lap (the open problem), What was tested, with numbers

### Community 125 - "test_server.py"
Cohesion: 0.10
Nodes (9): check(), finish(), b64(), greedy_agreement(), network(), part(), replica(), breaks() (+1 more)

### Community 137 - "g1-6-offpolicy-rl/tests/run_tests.mjs"
Cohesion: 0.38
Nodes (5): HERE, PROJECT, t0, KNOWN, TESTS

### Community 138 - "compare_sections.mjs"
Cohesion: 0.17
Nodes (10): h, human, line, [name = 'summer1', run = 'tuned', sectionsArg = '24'], o, rows, SECTIONS, total (+2 more)

### Community 139 - "host.mjs"
Cohesion: 0.14
Nodes (12): allOfficial, amount, args, get(), officialDir, opt, outDir, sleep() (+4 more)

### Community 141 - "g1-4-beam-search/tests/run_tests.mjs"
Cohesion: 0.38
Nodes (5): HERE, PROJECT, t0, KNOWN, TESTS

### Community 142 - "g2-5-memory-policy/tests/run_tests.mjs"
Cohesion: 0.29
Nodes (3): ROOT, STAGES, t0

### Community 143 - "driveTrack"
Cohesion: 0.22
Nodes (11): driveTrack(), worldPorts(), Defects, Fixed, g2-2 tests, Not fixed, Observations that are not defects, The grass (+3 more)

### Community 144 - "g2-2: random track generator"
Cohesion: 0.20
Nodes (10): 1. The piece table, 2. The generator, 3. Is a generated track real?, 4. Output, and pointing training at it, Changes made by the tester, Changes needed elsewhere, Cost of a full run, Files (+2 more)

### Community 145 - "train_route_generalist.sh"
Cohesion: 0.83
Nodes (3): keep_copies(), train_route_generalist.sh script, steps_done()

### Community 153 - "progress.mjs"
Cohesion: 0.39
Nodes (8): describe(), dot(), fence(), locate(), nearest(), sub(), WINDOW, roomBeside()

### Community 154 - "route_store.mjs"
Cohesion: 0.31
Nodes (6): DEFAULTS, CACHE, ROUTE_VERSION, routeFor(), Reference-free RacingEnv mode (reference: 'route'), Drivable ground plane at y = 0

### Community 155 - "rl/: reinforcement learning on the headless simulator"
Cohesion: 0.22
Nodes (9): Design in brief, Files, Install, Known limits, Multi-track ("generalist") training, rl/: reinforcement learning on the headless simulator, Use, What was not tested (+1 more)

### Community 156 - "ref_node_url"
Cohesion: 0.16
Nodes (8): HERE, PROJECT, t0, KNOWN, TESTS, ROOT, STAGES, t0

### Community 157 - "test_sim_session.mjs"
Cohesion: 0.25
Nodes (5): at3000, at4000, { check, eq, throws, note }, LEFT, motionA

### Community 158 - "sim/drive.mjs"
Cohesion: 0.43
Nodes (5): options, track, driveLap(), loadHumanLap(), loadReferenceLine()

### Community 160 - "pickCopy"
Cohesion: 0.38
Nodes (7): pickCopy(), resultsText(), Did the README's claims hold?, g1-3 search-and-train rounds: independent tests, What is covered, What is not covered, and why, best()

### Community 161 - "train_ppo.py"
Cohesion: 0.05
Nodes (25): MemoryAgent, ppo_loss(), write_actor(), How to run, What was verified, What is covered, expand_tracks(), rl/requirements.txt (Python 3.10+) (+17 more)

### Community 162 - "queue_untried.sh"
Cohesion: 0.53
Nodes (3): run_step(), say(), queue_untried.sh script

### Community 163 - "g2-3-explore-and-adapt/tests/run_tests.mjs"
Cohesion: 0.33
Nodes (3): ROOT, STAGES, t0

### Community 164 - "sectional.mjs"
Cohesion: 0.47
Nodes (5): angleBetween(), controlsAt(), heldAt(), rejoin(), REJOIN_DEFAULTS

### Community 165 - "Brief for the idea agents"
Cohesion: 0.40
Nodes (5): Brief for the idea agents, Find your way around, Rules, The project, What to deliver

### Community 166 - "g2-4 lookahead driving: independent tests"
Cohesion: 0.40
Nodes (5): Defects, g2-4 lookahead driving: independent tests, Not covered, and why, The README's claims, What is covered

### Community 167 - "Model history"
Cohesion: 0.50
Nodes (4): How to read this, Lineage at a glance, Model history, Where the evidence is

### Community 168 - "Tests of g1-1 (search from the human's lap)"
Cohesion: 0.50
Nodes (4): Headline claims, Other claims in the README, Tests of g1-1 (search from the human's lap), What is covered

## Knowledge Gaps
- **41 isolated node(s):** `./ideas/g2-2-track-generator/g2-2-features.mjs`, `g1-7 corridor (deferred)`, `Orchestrator duplication cleanup (rng, pool, policy)`, `Request: loadTrack cannot open generated tracks`, `A short look ahead does not predict lap time` (+36 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1327 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **30 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RacingEnv` connect `racing_env.mjs` to `ref_node_fs`, `torch`, `test_policy_rollout.mjs`, `g2-3-explore-and-adapt/README.md`, `g2-2: random track generator`, `explore.mjs`, `createRng`, `g1-6-offpolicy-rl/README.md`, `recording.mjs`, `train_ppo.py`, `g2-4 lookahead driving: independent tests`, `Polytrack-ML refactor plan`, `iqn_server.mjs`, `Route built from track geometry alone`, `memory_test.mjs`, `test_sim_b.mjs`, `replica_check.mjs`, `g2-5-memory-policy/README.md`, `g2-1: inputs that need no human lap`, `g2-4: look ahead while driving`?**
  _High betweenness centrality (0.131) - this node is a cross-community bridge._
- **Are the 15 inferred relationships involving `RacingEnv` (e.g. with `Phase 3: Deduplication (medium; each step gated by a fixed-seed comparison)` and `Phase 4 (optional, only with Phase 5 of "What is next"): split `racing_env.mjs``) actually correct?**
  _`RacingEnv` has 15 INFERRED edges - model-reasoned connections that need verification._
- **What connects `./ideas/g2-2-track-generator/g2-2-features.mjs`, `g1-7 corridor (deferred)`, `Orchestrator duplication cleanup (rng, pool, policy)` to the rest of the system?**
  _41 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `ref_node_fs` be split into smaller, more focused modules?**
  _Cohesion score 0.06638714185883997 - nodes in this community are weakly interconnected._
- **Why does `Env` connect `ref_node_fs` to `test_3_under_road_sim.mjs`, `laps.mjs`, `compare_sections.mjs`, `rotate`, `check_pieces.mjs`, `createRng`, `shared/tests/harness.mjs`, `recording.mjs`, `racing_env.mjs`, `sim/drive.mjs`, `g2-2-track-generator/drive.mjs`, `test_6_scripts_sim.mjs`, `search_settings.mjs`, `section_worker.mjs`, `test_5_corridor_sim.mjs`, `test_sim_b.mjs`, `test_4_sim.mjs`, `key_usage.mjs`, `Polytrack-ML`, `savestate_test.mjs`, `search_timeline.mjs`, `g2-2-track-generator/smoke_test.mjs`, `decodeState`, `test_sim.mjs`?**
  _High betweenness centrality (0.073) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `loadTrack()` (e.g. with `Phase 3: Deduplication (medium; each step gated by a fixed-seed comparison)` and `Progress (16 October 2026): phases 1 to 3 done, not committed`) actually correct?**
  _`loadTrack()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Should `test_3_under_road_sim.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.09365079365079365 - nodes in this community are weakly interconnected._