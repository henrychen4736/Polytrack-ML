# Graph Report - Polytrack-ML  (2026-10-06)

## Corpus Check
- Corpus is ~48,239 words - fits in a single context window. You may not need a graph.

## Summary
- 491 nodes · 978 edges · 20 communities (17 shown, 3 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.85)
- Token cost: 75,060 input · 0 output

## Community Hubs (Navigation)
- Simulator Harness and Stage Docs
- Racing Environment and Controller
- Car State and Determinism Tests
- Python Environment Bridge
- Section Comparison Tool
- Recording Encode and Export
- Track Parsing and Path
- Controller Settings Search
- Package Config and Scripts
- Environment Server and Policy Forward
- Policy Evaluation
- PPO Training Loop
- Checkpoint Extension and Agent
- Imitation Pretraining
- Agent Action Choices
- Worker Entry and Save States
- RL Design Notes
- One-Command Track Check
- Network Layers
- Block Specialist Script

## God Nodes (most connected - your core abstractions)
1. `Env` - 28 edges
2. `RacingEnv` - 23 edges
3. `loadTrack()` - 20 edges
4. `decodeState()` - 20 edges
5. `Polytrack-ML (project README)` - 18 edges
6. `Agent` - 16 edges
7. `rl/: reinforcement learning on the headless simulator` - 14 edges
8. `PolytrackEnv` - 13 edges
9. `PolytrackVecEnv` - 13 edges
10. `rotate()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Env` --shares_data_with--> `Recording string (toggle frames per channel)`  [INFERRED]
  sim/env.mjs → README.md
- `Collection throughput measurements` --semantically_similar_to--> `Scoring laps in separate processes`  [INFERRED] [semantically similar]
  rl/README.md → README.md
- `test:determinism (same state stream across processes and replay vs live)` --references--> `Env`  [EXTRACTED]
  README.md → sim/env.mjs
- `Env` --shares_data_with--> `227-byte car state per 1 ms tick`  [EXTRACTED]
  sim/env.mjs → README.md
- `Starts part-way round (--random-start)` --conceptually_related_to--> `Pure-pursuit baseline controller`  [AMBIGUOUS]
  rl/README.md → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Drive, export, Verify and watch a lap** — scripts_drive_baseline, scripts_export_recording, readme_game_verify, scripts_watch_ghost [EXTRACTED 1.00]
- **Human-lap-guided learning (reference line, imitation, part-way starts)** — rl_readme_human_laps, rl_readme_reference_line, rl_readme_imitation_first, rl_readme_random_start, rl_readme_reward [INFERRED 0.85]
- **Node environment to Python PPO training pipeline** — sim_env, rl_racing_env, rl_env_server, rl_polytrack_env, rl_train_ppo, rl_evaluate [INFERRED 0.85]

## Communities (20 total, 3 thin omitted)

### Community 0 - "Simulator Harness and Stage Docs"
Cohesion: 0.05
Nodes (34): Acceptance tests, Captured Init payload (data/init_0.6.3.json, createcar_summer1.json), Game worker's own Verify, polyrl (vendored, pinned commit), Polytrack-ML (project README), test:verify (27 leaderboard recordings pass Verify), rl/: reinforcement learning on the headless simulator, track (+26 more)

### Community 1 - "Racing Environment and Controller"
Cohesion: 0.07
Nodes (31): Controller settings tuning (crossTrackGain, airBrake), Pure-pursuit baseline controller, Key-timing mutation search, tracks, actionToControls(), clip(), controlsKey(), controlsToAction() (+23 more)

### Community 2 - "Car State and Determinism Tests"
Cohesion: 0.06
Nodes (30): 227-byte car state per 1 ms tick, test:determinism (same state stream across processes and replay vs live), body(), fractions, human, keys, resetTimes, same() (+22 more)

### Community 3 - "Python Environment Bridge"
Cohesion: 0.06
Nodes (5): EnvServer, _obs(), PolytrackEnv, PolytrackVecEnv, _random_policy_check()

### Community 4 - "Section Comparison Tool"
Cohesion: 0.07
Nodes (35): h, human, line, [name = 'summer1', run = 'tuned', sectionsArg = '24'], o, profile(), rows, SECTIONS (+27 more)

### Community 5 - "Recording Encode and Export"
Cohesion: 0.07
Nodes (32): Recording string (toggle frames per channel), decoded, firstMismatch, key(), [name = 'summer1', run = 'baseline'], recording, recordingString, runsDir (+24 more)

### Community 6 - "Track Parsing and Path"
Cohesion: 0.15
Nodes (18): buildPath(), decodeSaveString(), DETECTOR_CHECKPOINT, DETECTOR_FINISH, loadPartConfigs(), parseTrack(), PART_SIZE, pathFromSaveString() (+10 more)

### Community 7 - "Controller Settings Search"
Cohesion: 0.10
Nodes (20): args, bigMoveChance, clamp(), current, extraChance, gaussian(), GLOBALS, mutateSettings() (+12 more)

### Community 8 - "Package Config and Scripts"
Cohesion: 0.10
Nodes (15): devDependencies, playwright-core, name, private, scripts, capture, setup, test (+7 more)

### Community 9 - "Environment Server and Policy Forward"
Cohesion: 0.15
Nodes (13): actionRng, b64(), handle(), layerTanh(), loadActor(), options, rollout(), sampleAction() (+5 more)

### Community 10 - "Policy Evaluation"
Cohesion: 0.12
Nodes (3): main(), parse_args(), PPO checkpoint (rl/checkpoints/ppo_<track>.pt, ppo_general.pt)

### Community 11 - "PPO Training Loop"
Cohesion: 0.17
Nodes (7): compute_advantages(), imitation_loss(), main(), save_checkpoint(), write_actor_weights(), parse_args(), replace_with_retry()

### Community 12 - "Checkpoint Extension and Agent"
Cohesion: 0.20
Nodes (5): main(), Multi-track generalist training, Agent, main(), widen_net()

### Community 13 - "Imitation Pretraining"
Cohesion: 0.19
Nodes (4): collect(), losses(), main(), block_imitation_loss()

### Community 15 - "Worker Entry and Save States"
Cohesion: 0.29
Nodes (6): handleControl(), memories, physicsBytes(), restoreSnapshot(), snapshots, takeSnapshot()

### Community 16 - "RL Design Notes"
Cohesion: 0.28
Nodes (8): Gymnasium interface, Imitation first (behaviour cloning of top human laps), Stable-Baselines3, What was not tested, rl/requirements.txt (Python 3.10+), gymnasium>=0.29 (optional), numpy>=1.26, torch>=2.2

### Community 17 - "One-Command Track Check"
Cohesion: 0.25
Nodes (4): args, checkpoint, driven, positional

## Ambiguous Edges - Review These
- `Pure-pursuit baseline controller` → `Starts part-way round (--random-start)`  [AMBIGUOUS]
  rl/README.md · relation: conceptually_related_to

## Knowledge Gaps
- **124 isolated node(s):** `name`, `private`, `type`, `setup`, `test:verify` (+119 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 228 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Pure-pursuit baseline controller` and `Starts part-way round (--random-start)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `rl/: reinforcement learning on the headless simulator` connect `Simulator Harness and Stage Docs` to `Racing Environment and Controller`, `Recording Encode and Export`, `Environment Server and Policy Forward`, `Policy Evaluation`, `PPO Training Loop`, `Checkpoint Extension and Agent`, `Imitation Pretraining`, `RL Design Notes`?**
  _High betweenness centrality (0.239) - this node is a cross-community bridge._
- **Why does `Polytrack-ML (project README)` connect `Simulator Harness and Stage Docs` to `Car State and Determinism Tests`, `Recording Encode and Export`, `Controller Settings Search`, `Package Config and Scripts`, `Worker Entry and Save States`?**
  _High betweenness centrality (0.135) - this node is a cross-community bridge._
- **Why does `Env` connect `Car State and Determinism Tests` to `Simulator Harness and Stage Docs`, `Racing Environment and Controller`, `Section Comparison Tool`, `Recording Encode and Export`, `Track Parsing and Path`, `Controller Settings Search`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **What connects `name`, `private`, `type` to the rest of the system?**
  _124 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Simulator Harness and Stage Docs` be split into smaller, more focused modules?**
  _Cohesion score 0.053410893707033315 - nodes in this community are weakly interconnected._
- **Should `Racing Environment and Controller` be split into smaller, more focused modules?**
  _Cohesion score 0.07017543859649122 - nodes in this community are weakly interconnected._