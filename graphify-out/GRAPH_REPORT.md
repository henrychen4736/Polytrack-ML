# Graph Report - Polytrack-ML  (2026-10-08)

## Corpus Check
- 77 files · ~58,720 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 2 file(s) not represented in the graph (top: (none) 2)

## Summary
- 553 nodes · 1042 edges · 32 communities (21 shown, 11 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6207d834`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- search_sections.mjs
- racing_env.mjs
- Env
- PolytrackVecEnv
- search_settings.mjs
- search_timeline.mjs
- env.mjs
- key_usage.mjs
- capture_init.mjs
- env_server.mjs
- train_ppo.py
- Agent
- losses
- Tensor
- worker_entry.mjs
- EnvServer
- main
- sectional.mjs
- train_block_specialist.sh
- track.mjs
- check_track.mjs
- _layer
- rl/requirements.txt (Python 3.10+)
- eval_block_specialist.sh
- eval_generalist.sh
- train_block_specialist_from.sh
- export_recording.mjs
- search_rollout.mjs
- set3_round2.sh
- encodeRecording
- search_round.sh

## God Nodes (most connected - your core abstractions)
1. `RacingEnv` - 29 edges
2. `Env` - 27 edges
3. `loadTrack()` - 22 edges
4. `decodeState()` - 21 edges
5. `Polytrack-ML` - 20 edges
6. `Agent` - 16 edges
7. `PolytrackVecEnv` - 14 edges
8. `EnvServer` - 12 edges
9. `PolytrackEnv` - 12 edges
10. `rotate()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Layout` --references--> `Env`  [INFERRED]
  README.md → sim/env.mjs
- `Things that were not obvious` --references--> `stateLength()`  [INFERRED]
  README.md → sim/state.mjs
- `PolytrackEnv` --references--> `gymnasium>=0.29 (optional)`  [EXTRACTED]
  rl/polytrack_env.py → rl/requirements.txt
- `What was tested` --references--> `PolytrackVecEnv`  [INFERRED]
  rl/README.md → rl/polytrack_env.py
- `Files` --references--> `PolytrackEnv`  [INFERRED]
  rl/README.md → rl/polytrack_env.py

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Node environment to Python PPO training pipeline** — sim_env, rl_racing_env, rl_env_server, rl_polytrack_env, rl_train_ppo, rl_evaluate [INFERRED 0.85]

## Communities (32 total, 11 thin omitted)

### Community 0 - "search_sections.mjs"
Cohesion: 0.09
Nodes (19): args, best, finalString, minScore, mutateOptions, opt, outFile, passes (+11 more)

### Community 1 - "racing_env.mjs"
Cohesion: 0.07
Nodes (27): tracks, actionToControls(), clip(), controlsKey(), controlsToAction(), dot(), LOOKAHEAD_POINTS, makeRng() (+19 more)

### Community 2 - "Env"
Cohesion: 0.06
Nodes (31): Things that were not obvious, body(), fractions, human, keys, resetTimes, same(), t0 (+23 more)

### Community 3 - "PolytrackVecEnv"
Cohesion: 0.06
Nodes (13): _obs(), PolytrackEnv, PolytrackVecEnv, _random_policy_check(), Design in brief, Files, Install, Known limits (+5 more)

### Community 4 - "search_settings.mjs"
Cohesion: 0.06
Nodes (45): h, human, line, [name = 'summer1', run = 'tuned', sectionsArg = '24'], o, profile(), rows, SECTIONS (+37 more)

### Community 5 - "search_timeline.mjs"
Cohesion: 0.11
Nodes (18): args, best, finalString, mutateOptions, opt, outFile, rng, runsDir (+10 more)

### Community 6 - "env.mjs"
Cohesion: 0.05
Nodes (30): Acceptance tests, Driving and watching a lap, Layout, Polytrack-ML, Setup, track, byId, cap (+22 more)

### Community 7 - "key_usage.mjs"
Cohesion: 0.11
Nodes (17): h, hu, human, humanKeys, LENGTH, line, [name, run, stretchesArg = '16', lengthArg = '15'], o (+9 more)

### Community 8 - "capture_init.mjs"
Cohesion: 0.10
Nodes (15): devDependencies, playwright-core, name, private, scripts, capture, setup, test (+7 more)

### Community 9 - "env_server.mjs"
Cohesion: 0.21
Nodes (10): actionRng, b64(), handle(), layerTanh(), loadActor(), options, rollout(), sampleAction() (+2 more)

### Community 11 - "train_ppo.py"
Cohesion: 0.14
Nodes (7): compute_advantages(), imitation_loss(), main(), save_checkpoint(), write_actor_weights(), parse_args(), replace_with_retry()

### Community 12 - "Agent"
Cohesion: 0.23
Nodes (4): main(), Agent, main(), widen_net()

### Community 13 - "losses"
Cohesion: 0.25
Nodes (4): collect(), losses(), main(), block_imitation_loss()

### Community 15 - "worker_entry.mjs"
Cohesion: 0.29
Nodes (6): handleControl(), memories, physicsBytes(), restoreSnapshot(), snapshots, takeSnapshot()

### Community 18 - "sectional.mjs"
Cohesion: 0.38
Nodes (6): angleBetween(), controlsAt(), heldAt(), rejoin(), REJOIN_DEFAULTS, splice()

### Community 20 - "track.mjs"
Cohesion: 0.17
Nodes (16): buildPath(), decodeSaveString(), DETECTOR_CHECKPOINT, DETECTOR_FINISH, parseTrack(), PART_SIZE, pathFromSaveString(), quatMultiply() (+8 more)

### Community 21 - "check_track.mjs"
Cohesion: 0.25
Nodes (4): args, checkpoint, driven, positional

### Community 23 - "rl/requirements.txt (Python 3.10+)"
Cohesion: 0.50
Nodes (4): rl/requirements.txt (Python 3.10+), gymnasium>=0.29 (optional), numpy>=1.26, torch>=2.2

### Community 27 - "export_recording.mjs"
Cohesion: 0.22
Nodes (9): decoded, firstMismatch, key(), [name = 'summer1', run = 'baseline'], recording, recordingString, runsDir, track (+1 more)

### Community 28 - "search_rollout.mjs"
Cohesion: 0.11
Nodes (16): alter(), args, exported, name, opt, passes, randInt(), rng (+8 more)

### Community 30 - "encodeRecording"
Cohesion: 0.67
Nodes (3): save(), save(), encodeRecording()

## Knowledge Gaps
- **168 isolated node(s):** `name`, `private`, `type`, `setup`, `test:verify` (+163 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 286 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **11 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Polytrack-ML` connect `env.mjs` to `Env`, `search_settings.mjs`, `search_timeline.mjs`, `key_usage.mjs`, `capture_init.mjs`, `worker_entry.mjs`, `export_recording.mjs`, `search_rollout.mjs`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Why does `loadTrack()` connect `env.mjs` to `search_sections.mjs`, `racing_env.mjs`, `Env`, `search_settings.mjs`, `search_timeline.mjs`, `key_usage.mjs`, `track.mjs`, `export_recording.mjs`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **Why does `Env` connect `Env` to `racing_env.mjs`, `search_settings.mjs`, `env.mjs`, `key_usage.mjs`, `track.mjs`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **What connects `name`, `private`, `type` to the rest of the system?**
  _168 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `search_sections.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `racing_env.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.07017543859649122 - nodes in this community are weakly interconnected._
- **Should `Env` be split into smaller, more focused modules?**
  _Cohesion score 0.06259426847662142 - nodes in this community are weakly interconnected._