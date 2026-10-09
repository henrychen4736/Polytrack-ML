# Graph Report - Polytrack-ML  (2026-10-08)

## Corpus Check
- 75 files · ~57,941 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 2 file(s) not represented in the graph (top: (none) 2)

## Summary
- 549 nodes · 1034 edges · 27 communities (19 shown, 8 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e61cb736`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- search_sections.mjs
- racing_env.mjs
- Env
- PolytrackVecEnv
- key_usage.mjs
- search_timeline.mjs
- env.mjs
- search_settings.mjs
- capture_init.mjs
- env_server.mjs
- train_ppo.py
- Agent
- pretrain_bc.py
- Tensor
- worker_entry.mjs
- EnvServer
- evaluate.py
- sectional.mjs
- train_block_specialist.sh
- search.mjs
- eval_block_specialist.sh
- eval_generalist.sh
- train_block_specialist_from.sh
- export_recording.mjs
- search_rollout.mjs
- set3_round2.sh

## God Nodes (most connected - your core abstractions)
1. `RacingEnv` - 29 edges
2. `Env` - 27 edges
3. `loadTrack()` - 22 edges
4. `decodeState()` - 21 edges
5. `Polytrack-ML` - 20 edges
6. `Agent` - 16 edges
7. `PolytrackVecEnv` - 14 edges
8. `PolytrackEnv` - 12 edges
9. `rotate()` - 12 edges
10. `EnvServer` - 11 edges

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

## Communities (27 total, 8 thin omitted)

### Community 0 - "search_sections.mjs"
Cohesion: 0.09
Nodes (19): args, best, finalString, minScore, mutateOptions, opt, outFile, passes (+11 more)

### Community 1 - "racing_env.mjs"
Cohesion: 0.07
Nodes (29): tracks, actionToControls(), clip(), controlsKey(), controlsToAction(), dot(), LOOKAHEAD_POINTS, makeRng() (+21 more)

### Community 2 - "Env"
Cohesion: 0.06
Nodes (36): Acceptance tests, Driving and watching a lap, Layout, Polytrack-ML, Setup, Things that were not obvious, body(), fractions (+28 more)

### Community 3 - "PolytrackVecEnv"
Cohesion: 0.06
Nodes (13): _obs(), PolytrackEnv, PolytrackVecEnv, _random_policy_check(), Design in brief, Files, Install, Known limits (+5 more)

### Community 4 - "key_usage.mjs"
Cohesion: 0.07
Nodes (39): h, human, line, [name = 'summer1', run = 'tuned', sectionsArg = '24'], o, profile(), rows, SECTIONS (+31 more)

### Community 5 - "search_timeline.mjs"
Cohesion: 0.12
Nodes (15): save(), args, best, finalString, mutateOptions, opt, outFile, rng (+7 more)

### Community 6 - "env.mjs"
Cohesion: 0.06
Nodes (34): byId, cap, ours, allOfficial, amount, args, get(), officialDir (+26 more)

### Community 7 - "search_settings.mjs"
Cohesion: 0.11
Nodes (19): args, bigMoveChance, clamp(), current, extraChance, gaussian(), GLOBALS, mutateSettings() (+11 more)

### Community 8 - "capture_init.mjs"
Cohesion: 0.10
Nodes (15): devDependencies, playwright-core, name, private, scripts, capture, setup, test (+7 more)

### Community 9 - "env_server.mjs"
Cohesion: 0.21
Nodes (10): actionRng, b64(), handle(), layerTanh(), loadActor(), options, rollout(), sampleAction() (+2 more)

### Community 11 - "train_ppo.py"
Cohesion: 0.17
Nodes (7): compute_advantages(), imitation_loss(), main(), save_checkpoint(), write_actor_weights(), parse_args(), replace_with_retry()

### Community 12 - "Agent"
Cohesion: 0.16
Nodes (5): main(), Agent, _layer(), main(), widen_net()

### Community 13 - "pretrain_bc.py"
Cohesion: 0.19
Nodes (4): collect(), losses(), main(), block_imitation_loss()

### Community 15 - "worker_entry.mjs"
Cohesion: 0.29
Nodes (6): handleControl(), memories, physicsBytes(), restoreSnapshot(), snapshots, takeSnapshot()

### Community 17 - "evaluate.py"
Cohesion: 0.18
Nodes (6): main(), parse_args(), rl/requirements.txt (Python 3.10+), gymnasium>=0.29 (optional), numpy>=1.26, torch>=2.2

### Community 18 - "sectional.mjs"
Cohesion: 0.32
Nodes (7): CHANNELS, angleBetween(), controlsAt(), heldAt(), rejoin(), REJOIN_DEFAULTS, splice()

### Community 20 - "search.mjs"
Cohesion: 0.33
Nodes (6): countFlips(), createRng(), MUTABLE, mutate(), MUTATE_DEFAULTS, randInt()

### Community 27 - "export_recording.mjs"
Cohesion: 0.19
Nodes (11): decoded, firstMismatch, key(), [name = 'summer1', run = 'baseline'], recording, recordingString, runsDir, track (+3 more)

### Community 28 - "search_rollout.mjs"
Cohesion: 0.06
Nodes (26): args, checkpoint, driven, positional, alter(), args, exported, name (+18 more)

## Knowledge Gaps
- **167 isolated node(s):** `name`, `private`, `type`, `setup`, `test:verify` (+162 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 283 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Polytrack-ML` connect `Env` to `key_usage.mjs`, `search_timeline.mjs`, `env.mjs`, `search_settings.mjs`, `capture_init.mjs`, `worker_entry.mjs`, `export_recording.mjs`, `search_rollout.mjs`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `loadTrack()` connect `key_usage.mjs` to `search_sections.mjs`, `racing_env.mjs`, `Env`, `search_timeline.mjs`, `env.mjs`, `search_settings.mjs`, `export_recording.mjs`, `search_rollout.mjs`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **Why does `Env` connect `Env` to `racing_env.mjs`, `key_usage.mjs`, `env.mjs`, `search_settings.mjs`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **What connects `name`, `private`, `type` to the rest of the system?**
  _167 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `search_sections.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `racing_env.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.06949152542372881 - nodes in this community are weakly interconnected._
- **Should `Env` be split into smaller, more focused modules?**
  _Cohesion score 0.05639097744360902 - nodes in this community are weakly interconnected._