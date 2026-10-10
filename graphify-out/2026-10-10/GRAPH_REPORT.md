# Graph Report - Polytrack-ML  (2026-10-10)

## Corpus Check
- 331 files · ~229,323 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 28 file(s) not represented in the graph (top: .jsonl 15, .log 8, (none) 3)

## Summary
- 1597 nodes · 3209 edges · 90 communities (78 shown, 12 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 159 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6b105105`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- search_sections.mjs
- RacingEnv
- ladder_test.mjs
- PolytrackVecEnv
- search_settings.mjs
- search_timeline.mjs
- ref_node_fs
- key_usage.mjs
- capture_init.mjs
- iqn_server.mjs
- test_units.py
- train_ppo.py
- rounds.mjs
- SimSession
- worker_entry.mjs
- EnvServer
- evaluate.py
- state.mjs
- train_block_specialist.sh
- track.mjs
- check_track.mjs
- compare_human.mjs
- memory_test.mjs
- eval_block_specialist.sh
- eval_generalist.sh
- train_block_specialist_from.sh
- export_recording.mjs
- search_rollout.mjs
- set3_round2.sh
- laps.mjs
- search_round.sh
- stitch_laps.mjs
- beam.mjs
- observation.mjs
- refine.mjs
- explore.mjs
- fit_car.mjs
- search_human.mjs
- g2-2-track-generator/smoke_test.mjs
- policy.mjs
- IqnServers
- route.mjs
- check_pieces.mjs
- diff_capture.mjs
- g2-3 Explore and adapt
- shared/smoke_test.mjs
- section_worker.mjs
- smoothness.mjs
- generate.mjs
- racing_env.mjs
- validate.mjs
- How to run
- smoke.mjs
- sim/drive.mjs
- plot_dump.mjs
- calibrate.mjs
- env.mjs
- g1-4-beam-search/child.mjs
- .create
- watch_ghost.mjs
- IQN
- follow.mjs
- paths.mjs
- g1-2: stitch a lap from the fastest sections of several human laps
- Env
- compare_sections.mjs
- g1-5: fine key timing (1 ms)
- Requests to the orchestrator
- line.mjs
- codec.mjs
- progress.mjs
- createRng
- attempts.mjs
- rollout_child.mjs
- g1-1: search from the human's lap
- .create
- trace.mjs
- g1-6: off-policy distributional learner, rewarded for progress only
- toy_probe.py
- toDense
- pieces.mjs
- Polytrack-ML
- rl/smoke_test.mjs
- Brief for the idea agents
- What was measured
- actor_file_best_action
- finetune_plan.sh
- smoke_test.sh

## God Nodes (most connected - your core abstractions)
1. `RacingEnv` - 40 edges
2. `loadTrack()` - 40 edges
3. `Env` - 37 edges
4. `decodeState()` - 32 edges
5. `rotate()` - 28 edges
6. `SimSession` - 21 edges
7. `Agent` - 21 edges
8. `MemoryEnv` - 20 edges
9. `verifyAndSave()` - 20 edges
10. `Polytrack-ML` - 20 edges

## Surprising Connections (you probably didn't know these)
- `Design, and why` --references--> `RacingEnv`  [INFERRED]
  ideas/g1-6-offpolicy-rl/README.md → rl/racing_env.mjs
- `Plain policy on the unseen tracks (baseline)` --references--> `RacingEnv`  [INFERRED]
  ideas/g2-4-lookahead-driving/README.md → rl/racing_env.mjs
- `Layout` --references--> `Env`  [INFERRED]
  README.md → sim/env.mjs
- `Rules for working side by side` --references--> `EnvServer`  [INFERRED]
  ideas/shared/CONTRACT.md → rl/polytrack_env.py
- `Changes needed elsewhere` --references--> `PolytrackVecEnv`  [INFERRED]
  ideas/g2-5-memory-policy/README.md → rl/polytrack_env.py

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Node environment to Python PPO training pipeline** — sim_env, rl_racing_env, rl_env_server, rl_polytrack_env, rl_train_ppo, rl_evaluate [INFERRED 0.85]

## Communities (90 total, 12 thin omitted)

### Community 0 - "search_sections.mjs"
Cohesion: 0.09
Nodes (19): args, best, finalString, minScore, mutateOptions, opt, outFile, passes (+11 more)

### Community 1 - "RacingEnv"
Cohesion: 0.22
Nodes (4): actionToControls(), dot(), RacingEnv, sub()

### Community 2 - "ladder_test.mjs"
Cohesion: 0.09
Nodes (22): Things that were not obvious, body(), fractions, human, keys, resetTimes, same(), t0 (+14 more)

### Community 3 - "PolytrackVecEnv"
Cohesion: 0.05
Nodes (16): _obs(), PolytrackEnv, PolytrackVecEnv, _random_policy_check(), Design in brief, Files, Install, Known limits (+8 more)

### Community 4 - "search_settings.mjs"
Cohesion: 0.11
Nodes (19): args, bigMoveChance, clamp(), current, extraChance, gaussian(), GLOBALS, mutateSettings() (+11 more)

### Community 5 - "search_timeline.mjs"
Cohesion: 0.12
Nodes (17): args, best, finalString, mutateOptions, opt, outFile, rng, runsDir (+9 more)

### Community 6 - "ref_node_fs"
Cohesion: 0.11
Nodes (13): allOfficial, amount, args, get(), officialDir, opt, outDir, sleep() (+5 more)

### Community 7 - "key_usage.mjs"
Cohesion: 0.13
Nodes (12): h, hu, human, humanKeys, LENGTH, line, [name, run, stretchesArg = '16', lengthArg = '15'], o (+4 more)

### Community 8 - "capture_init.mjs"
Cohesion: 0.10
Nodes (15): devDependencies, playwright-core, name, private, scripts, capture, setup, test (+7 more)

### Community 9 - "iqn_server.mjs"
Cohesion: 0.10
Nodes (28): b64(), begin(), decisionOf(), drive(), evaluate(), greedy(), handle(), HUMAN_DOING (+20 more)

### Community 11 - "test_units.py"
Cohesion: 0.08
Nodes (17): export_actor(), quantile_huber_loss(), ReplayBuffer, check(), main(), check(), loss_by_loops(), n_step_one() (+9 more)

### Community 12 - "train_ppo.py"
Cohesion: 0.08
Nodes (15): 1. What to rank by (`calibrate.mjs`), main(), Agent, block_imitation_loss(), block_parts(), held_keys(), imitation_loss(), _layer() (+7 more)

### Community 13 - "rounds.mjs"
Cohesion: 0.06
Nodes (78): chooseExamples(), concludeRound(), copiesToTest(), DEFAULTS, ID, IDEA_DIR, parseArgs(), parseAttempt() (+70 more)

### Community 14 - "SimSession"
Cohesion: 0.05
Nodes (26): Not done, not tested, Cost of a full run, Design questions, Files, g2-4: look ahead while driving, How to run, Lookahead driver, defaults (lazy, horizon 40, every 10, backing up), Not done, not tested (+18 more)

### Community 15 - "worker_entry.mjs"
Cohesion: 0.29
Nodes (6): handleControl(), memories, physicsBytes(), restoreSnapshot(), snapshots, takeSnapshot()

### Community 16 - "EnvServer"
Cohesion: 0.14
Nodes (4): EnvServer, collect(), losses(), main()

### Community 17 - "evaluate.py"
Cohesion: 0.33
Nodes (3): main(), parse_args(), torch>=2.2

### Community 18 - "state.mjs"
Cohesion: 0.27
Nodes (10): drive(), prepare(), angleBetween(), controlsAt(), heldAt(), nextFlipAfter(), rejoin(), REJOIN_DEFAULTS (+2 more)

### Community 20 - "track.mjs"
Cohesion: 0.24
Nodes (15): loadTrackInfo(), loadCaptured(), buildPath(), decodeSaveString(), loadPartConfigs(), parseTrack(), PART_SIZE, pathFromSaveString() (+7 more)

### Community 21 - "check_track.mjs"
Cohesion: 0.25
Nodes (4): args, checkpoint, driven, positional

### Community 22 - "compare_human.mjs"
Cohesion: 0.06
Nodes (41): fill(), GRAVITY, loadCarModel(), speedFor(), car, tracks, car, human (+33 more)

### Community 23 - "memory_test.mjs"
Cohesion: 0.06
Nodes (31): 2. The beam on one stretch, three rankings, 3. Against the 21.907 s lap (`from=runs/rollout_desert4.json`), 4. Checks, 5. Speed, memory, tick budget, A full run: cost and what it might gain, Changes needed elsewhere, g1-4: beam search over block decisions, How to run (+23 more)

### Community 27 - "export_recording.mjs"
Cohesion: 0.22
Nodes (9): decoded, firstMismatch, key(), [name = 'summer1', run = 'baseline'], recording, recordingString, runsDir, track (+1 more)

### Community 28 - "search_rollout.mjs"
Cohesion: 0.13
Nodes (15): alter(), args, exported, name, opt, passes, randInt(), rng (+7 more)

### Community 30 - "laps.mjs"
Cohesion: 0.16
Nodes (16): Changes needed elsewhere, `laps.mjs` — laps in one form, and conversions (no simulator), BLOCK_SLICES, BLOCK_TICKS, controlsOf(), decisionsToKeys(), keysToDecisions(), keysToTimeline() (+8 more)

### Community 32 - "stitch_laps.mjs"
Cohesion: 0.06
Nodes (25): acceptCost, args, attempts, bestOf, checkMs, finishMode, followOptions, free (+17 more)

### Community 33 - "beam.mjs"
Cohesion: 0.07
Nodes (28): alongBin, args, ask(), BEAM, elapsed(), elite, incumbent, latBin (+20 more)

### Community 34 - "observation.mjs"
Cohesion: 0.08
Nodes (25): createObserver(), LOOKAHEAD_POINTS, OBS_CONTACT, OBS_CURVATURE, OBS_EDGE_AHEAD, OBS_EDGE_NOW, OBS_FLIGHT, OBS_FRACTION (+17 more)

### Community 35 - "refine.mjs"
Cohesion: 0.09
Nodes (27): better(), copy(), listFlips(), makePlane(), MOVABLE, nudge(), openSims(), parseArgs() (+19 more)

### Community 36 - "explore.mjs"
Cohesion: 0.08
Nodes (25): archive, args, attempt(), BACK, BACK_MIN, cellKey(), chooseCell(), file (+17 more)

### Community 37 - "fit_car.mjs"
Cohesion: 0.08
Nodes (23): accelRun, accelW, binBySpeed(), brake, brakeRun, coast, coastRun, entries (+15 more)

### Community 38 - "search_human.mjs"
Cohesion: 0.08
Nodes (18): args, best, opt, outDir, OWN, passes, saveProgress(), seconds (+10 more)

### Community 39 - "g2-2-track-generator/smoke_test.mjs"
Cohesion: 0.11
Nodes (17): attempt(), DRIVER_DEFAULTS, driveTrack(), dir, failed, files, [shard, shards], started (+9 more)

### Community 40 - "policy.mjs"
Cohesion: 0.14
Nodes (15): Files, args, opt, policy, settings, track, DEFAULTS, ROOT (+7 more)

### Community 41 - "IqnServers"
Cohesion: 0.14
Nodes (3): Files, _decode(), IqnServers

### Community 42 - "route.mjs"
Cohesion: 0.22
Nodes (16): buildRoute(), flights(), runStage(), cross(), dist(), dot(), finishRoute(), gateStages() (+8 more)

### Community 43 - "check_pieces.mjs"
Cohesion: 0.13
Nodes (14): count, firstSeed, LENGTHS, started, used, worst, checkOfficial(), matePorts() (+6 more)

### Community 44 - "diff_capture.mjs"
Cohesion: 0.09
Nodes (9): BACK_EDGES, BUDGETS, dir, groups, restarts, runs, byId, cap (+1 more)

### Community 45 - "g2-3 Explore and adapt"
Cohesion: 0.12
Nodes (9): Changes needed elsewhere, Cost of a full run, Design questions, and what the logs say, Files, Fine-tune (dry run only), g2-3 Explore and adapt, How to run (from the project root), The test set (+1 more)

### Community 46 - "shared/smoke_test.mjs"
Cohesion: 0.18
Nodes (16): humanLaps(), keysToRecording(), loadLap(), normalise(), recordingToKeys(), sameKeys(), timelineToKeys(), info (+8 more)

### Community 47 - "section_worker.mjs"
Cohesion: 0.26
Nodes (17): change(), dist2(), drive(), driveTail(), driveTo(), faster(), pos, pose (+9 more)

### Community 48 - "smoothness.mjs"
Cohesion: 0.11
Nodes (15): count, from, horizons, inRange, lap, overall, plane, rows (+7 more)

### Community 49 - "generate.mjs"
Cohesion: 0.25
Nodes (17): encodeExportString(), encodeSaveString(), partsToBytes(), add(), buildRoute(), CHAIN_IDS, createRng(), dot() (+9 more)

### Community 50 - "racing_env.mjs"
Cohesion: 0.16
Nodes (14): MEMORY_DEFAULTS, MEMORY_OBS_SIZE, tracks, clip(), controlsKey(), LOOKAHEAD_POINTS, OBS_PEDAL_OPEN, OBS_SIZE (+6 more)

### Community 51 - "validate.mjs"
Cohesion: 0.12
Nodes (12): EVERY, DEFAULTS, CACHE, ROUTE_VERSION, routeFor(), args, fresh, jobs (+4 more)

### Community 52 - "How to run"
Cohesion: 0.14
Nodes (8): MemoryAgent, ppo_loss(), session_advantages(), write_actor(), How to run, What was verified, Which design, and why, compute_advantages()

### Community 53 - "smoke.mjs"
Cohesion: 0.16
Nodes (11): a, marks, policy, t(), policy, seeds, t0, [track = 'winter4', seedList = '10,12', actor = 'rl/checkpoints/ppo_blkgen.best2.actor.bin'] (+3 more)

### Community 54 - "sim/drive.mjs"
Cohesion: 0.17
Nodes (12): args, createCar, file, lines, options, settings, [track = 'desert4', which = 'all'], options (+4 more)

### Community 55 - "plot_dump.mjs"
Cohesion: 0.19
Nodes (9): info, nodes, route, surface, buildSurface(), near(), CellMap, EDGE_CAP (+1 more)

### Community 56 - "calibrate.mjs"
Cohesion: 0.16
Nodes (12): args, HORIZONS, N, opt, ranks(), rng, seed(), spearman() (+4 more)

### Community 57 - "env.mjs"
Cohesion: 0.21
Nodes (9): CACHE, humanTrace(), CAR_TICK_BUDGET, track, profile(), profile(), finishOf(), loadTrack() (+1 more)

### Community 58 - "g1-4-beam-search/child.mjs"
Cohesion: 0.20
Nodes (10): candidates(), canonical(), dot(), ensureCar(), features(), freshStart(), handlers, nodes (+2 more)

### Community 59 - ".create"
Cohesion: 0.14
Nodes (11): 1. The piece table, 2. The generator, 3. Is a generated track real?, 4. Output, and pointing training at it, Changes needed elsewhere, Cost of a full run, Files, g2-2: random track generator (+3 more)

### Community 60 - "watch_ghost.mjs"
Cohesion: 0.15
Nodes (6): HASHES, args, checkOnly, [name = 'summer1', run = 'baseline'], recordValue, trackId

### Community 62 - "follow.mjs"
Cohesion: 0.27
Nodes (12): carState(), compare(), corrections(), donorKeys(), follow(), FOLLOW_DEFAULTS, NONE, locate() (+4 more)

### Community 63 - "paths.mjs"
Cohesion: 0.18
Nodes (11): angleBetween(), MISMATCH_WEIGHTS, MOTION_GAP, recordPath(), spinBetween(), joins, [name, ...rest], paths (+3 more)

### Community 64 - "g1-2: stitch a lap from the fastest sections of several human laps"
Cohesion: 0.19
Nodes (11): crossings(), planRoute(), sectionTimes(), Changes needed elsewhere, g1-2: stitch a lap from the fastest sections of several human laps, How it works, How to run, Not done, not tested (+3 more)

### Community 65 - "Env"
Cohesion: 0.23
Nodes (3): What is not done or not tested, Env, stateFrames()

### Community 66 - "compare_sections.mjs"
Cohesion: 0.17
Nodes (10): h, human, line, [name = 'summer1', run = 'tuned', sectionsArg = '24'], o, rows, SECTIONS, total (+2 more)

### Community 67 - "g1-5: fine key timing (1 ms)"
Cohesion: 0.18
Nodes (10): Changes needed elsewhere, Cost of a full run, Files, g1-5: fine key timing (1 ms), How to run, Not done, not tested, Smoke test 1: searched lap, flips from 18.0 s to the finish, Smoke test 2: best human lap, flips from 17.75 s to the finish (+2 more)

### Community 68 - "Requests to the orchestrator"
Cohesion: 0.18
Nodes (8): Changes needed elsewhere, g1-3-search-train-rounds — imitation examples from several laps, g1-3-search-train-rounds — search_round.sh is not safe to rerun after an interruption, g1-7-computed-racing-line — fitted car model, flat test pad, corridor around any finishing lap, g2-2-track-generator — loadTrack cannot take a track that is not in data/ or vendor/, g2-2-track-generator — track encoder, piece ports, generated tracks with routes and laps, g2-4-lookahead-driving — a lookahead driver others can call; RacingEnv speed, Requests to the orchestrator

### Community 69 - "line.mjs"
Cohesion: 0.35
Nodes (8): createController(), DEFAULTS, toCarFrame(), buildLine(), dist(), indexAhead(), lineStraightness(), nearestIndex()

### Community 70 - "codec.mjs"
Cohesion: 0.27
Nodes (5): PLATE_CELLS, PLATE_UNITS, deflate(), wrap(), DETECTOR_CHECKPOINT

### Community 71 - "progress.mjs"
Cohesion: 0.33
Nodes (9): describe(), dot(), fence(), locate(), nearest(), sub(), WINDOW, roomBeside() (+1 more)

### Community 72 - "createRng"
Cohesion: 0.40
Nodes (9): goTo(), replay(), toStart(), alternatives(), driveLap(), tryOut(), fromStart(), needsFreshCar() (+1 more)

### Community 73 - "attempts.mjs"
Cohesion: 0.20
Nodes (6): args, report, rng, rows, started, BLOCK_ENV

### Community 74 - "rollout_child.mjs"
Cohesion: 0.27
Nodes (6): decide(), GROUPS, layerTanh(), prefix, prepare(), scoresFor()

### Community 75 - "g1-1: search from the human's lap"
Cohesion: 0.22
Nodes (8): Changes needed elsewhere, g1-1: search from the human's lap, How to run, Not done, not tested, The idea, What a longer run would probably do, What happens to the rest of the lap (the open problem), What was tested, with numbers

### Community 76 - ".create"
Cohesion: 0.28
Nodes (6): Modules, `policy.mjs` — a block policy and its value estimate in Node, Rules for working side by side, Shared code contract, `track_info.mjs` — geometry and reference-free progress, `verify.mjs` — finish and verify a lap

### Community 77 - "trace.mjs"
Cohesion: 0.25
Nodes (6): [i,j,k], [name, join, opts='{}', every='5'], paths, t0, { ticks }, track

### Community 78 - "g1-6: off-policy distributional learner, rewarded for progress only"
Cohesion: 0.25
Nodes (7): Changes needed elsewhere, Design, and why, g1-6: off-policy distributional learner, rewarded for progress only, How to run, Not done or not tested, What a full run would cost, What was tested, and the numbers

### Community 79 - "toy_probe.py"
Cohesion: 0.32
Nodes (3): myopic(), p_through(), play()

### Community 80 - "toDense"
Cohesion: 0.48
Nodes (6): attempt(), ladder, prepare(), samePrefix(), snapshot(), toDense()

### Community 81 - "pieces.mjs"
Cohesion: 0.52
Nodes (6): cross(), derivePorts(), key(), loadPieceTable(), onGridPlane(), sub()

### Community 82 - "Polytrack-ML"
Cohesion: 0.29
Nodes (5): Acceptance tests, Driving and watching a lap, Layout, Polytrack-ML, Setup

### Community 83 - "rl/smoke_test.mjs"
Cohesion: 0.33
Nodes (5): controlsToAction(), NUM_ACTIONS, controllerLap(), laps, ticks

### Community 84 - "Brief for the idea agents"
Cohesion: 0.33
Nodes (5): Brief for the idea agents, Find your way around, Rules, The project, What to deliver

### Community 86 - "What was measured"
Cohesion: 0.40
Nodes (5): How often a join survives, Section times and the theoretical best, Stitched laps, The cost of repair, What was measured

## Knowledge Gaps
- **546 isolated node(s):** `args`, `opt`, `seconds`, `workers`, `passes` (+541 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 811 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RacingEnv` connect `RacingEnv` to `Env`, `ladder_test.mjs`, `Requests to the orchestrator`, `line.mjs`, `iqn_server.mjs`, `IqnServers`, `rollout_child.mjs`, `g1-6: off-policy distributional learner, rewarded for progress only`, `SimSession`, `racing_env.mjs`, `rl/smoke_test.mjs`, `How to run`, `smoke.mjs`, `memory_test.mjs`, `.create`?**
  _High betweenness centrality (0.157) - this node is a cross-community bridge._
- **Why does `Rules for working side by side` connect `.create` to `EnvServer`, `PolytrackVecEnv`, `smoke.mjs`, `shared/smoke_test.mjs`?**
  _High betweenness centrality (0.095) - this node is a cross-community bridge._
- **Why does `Files` connect `IqnServers` to `RacingEnv`, `test_units.py`, `g1-6: off-policy distributional learner, rewarded for progress only`?**
  _High betweenness centrality (0.079) - this node is a cross-community bridge._
- **Are the 8 inferred relationships involving `RacingEnv` (e.g. with `5. Speed, memory, tick budget` and `Design, and why`) actually correct?**
  _`RacingEnv` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `loadTrack()` (e.g. with `4. Output, and pointing training at it` and `What is not done or not tested`) actually correct?**
  _`loadTrack()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `Env` (e.g. with `What is not done or not tested` and `Layout`) actually correct?**
  _`Env` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `args`, `opt`, `seconds` to the rest of the system?**
  _546 weakly-connected nodes found - possible documentation gaps or missing edges._