# Graph Report - Polytrack-ML  (2026-10-08)

## Corpus Check
- 69 files · ~50,833 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 2 file(s) not represented in the graph (top: (none) 2)

## Summary
- 480 nodes · 910 edges · 30 communities (20 shown, 10 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.92)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `309d7d4e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- diff_capture.mjs
- racing_env.mjs
- Env
- PolytrackVecEnv
- key_usage.mjs
- search_timeline.mjs
- track.mjs
- search_settings.mjs
- capture_init.mjs
- env_server.mjs
- polytrack_env.py
- train_ppo.py
- Agent
- pretrain_bc.py
- Tensor
- worker_entry.mjs
- EnvServer
- env.mjs
- _layer
- train_block_specialist.sh
- fetch_laps.mjs
- host.mjs
- Polytrack-ML
- watch_ghost.mjs
- eval_block_specialist.sh
- eval_generalist.sh
- train_block_specialist_from.sh
- export_recording.mjs
- check_track.mjs
- set3_round2.sh

## God Nodes (most connected - your core abstractions)
1. `Env` - 26 edges
2. `RacingEnv` - 25 edges
3. `loadTrack()` - 20 edges
4. `decodeState()` - 20 edges
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
- `What was tested` --references--> `PolytrackVecEnv`  [INFERRED]
  rl/README.md → rl/polytrack_env.py
- `finishOf()` --calls--> `decodeState()`  [EXTRACTED]
  scripts/savestate_test.mjs → sim/state.mjs
- `PolytrackEnv` --references--> `gymnasium>=0.29 (optional)`  [EXTRACTED]
  rl/polytrack_env.py → rl/requirements.txt

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Node environment to Python PPO training pipeline** — sim_env, rl_racing_env, rl_env_server, rl_polytrack_env, rl_train_ppo, rl_evaluate [INFERRED 0.85]

## Communities (30 total, 10 thin omitted)

### Community 0 - "diff_capture.mjs"
Cohesion: 0.18
Nodes (3): byId, cap, ours

### Community 1 - "racing_env.mjs"
Cohesion: 0.11
Nodes (18): tracks, actionToControls(), clip(), controlsKey(), dot(), LOOKAHEAD_POINTS, makeRng(), OBS_PEDAL_OPEN (+10 more)

### Community 2 - "Env"
Cohesion: 0.06
Nodes (25): Acceptance tests, Things that were not obvious, body(), fractions, human, keys, resetTimes, same() (+17 more)

### Community 3 - "PolytrackVecEnv"
Cohesion: 0.06
Nodes (17): _obs(), PolytrackEnv, PolytrackVecEnv, _random_policy_check(), Design in brief, Files, Install, Known limits (+9 more)

### Community 4 - "key_usage.mjs"
Cohesion: 0.07
Nodes (38): h, human, line, [name = 'summer1', run = 'tuned', sectionsArg = '24'], o, profile(), rows, SECTIONS (+30 more)

### Community 5 - "search_timeline.mjs"
Cohesion: 0.09
Nodes (23): args, best, finalString, mutateOptions, opt, outFile, rng, runsDir (+15 more)

### Community 6 - "track.mjs"
Cohesion: 0.17
Nodes (16): buildPath(), decodeSaveString(), DETECTOR_CHECKPOINT, DETECTOR_FINISH, loadPartConfigs(), parseTrack(), PART_SIZE, pathFromSaveString() (+8 more)

### Community 7 - "search_settings.mjs"
Cohesion: 0.10
Nodes (20): args, bigMoveChance, clamp(), current, extraChance, gaussian(), GLOBALS, mutateSettings() (+12 more)

### Community 8 - "capture_init.mjs"
Cohesion: 0.10
Nodes (15): devDependencies, playwright-core, name, private, scripts, capture, setup, test (+7 more)

### Community 9 - "env_server.mjs"
Cohesion: 0.11
Nodes (20): actionRng, b64(), handle(), layerTanh(), loadActor(), options, rollout(), sampleAction() (+12 more)

### Community 11 - "train_ppo.py"
Cohesion: 0.14
Nodes (7): compute_advantages(), imitation_loss(), main(), save_checkpoint(), write_actor_weights(), parse_args(), replace_with_retry()

### Community 12 - "Agent"
Cohesion: 0.22
Nodes (4): main(), Agent, main(), widen_net()

### Community 13 - "pretrain_bc.py"
Cohesion: 0.21
Nodes (4): collect(), losses(), main(), block_imitation_loss()

### Community 15 - "worker_entry.mjs"
Cohesion: 0.29
Nodes (6): handleControl(), memories, physicsBytes(), restoreSnapshot(), snapshots, takeSnapshot()

### Community 17 - "env.mjs"
Cohesion: 0.24
Nodes (5): track, FIX, loadTrack(), bootWorker(), loadCaptured()

### Community 20 - "fetch_laps.mjs"
Cohesion: 0.22
Nodes (9): allOfficial, amount, args, get(), officialDir, opt, outDir, sleep() (+1 more)

### Community 22 - "Polytrack-ML"
Cohesion: 0.40
Nodes (4): Driving and watching a lap, Layout, Polytrack-ML, Setup

### Community 23 - "watch_ghost.mjs"
Cohesion: 0.29
Nodes (5): args, checkOnly, [name = 'summer1', run = 'baseline'], recordValue, trackId

### Community 27 - "export_recording.mjs"
Cohesion: 0.22
Nodes (9): decoded, firstMismatch, key(), [name = 'summer1', run = 'baseline'], recording, recordingString, runsDir, track (+1 more)

### Community 28 - "check_track.mjs"
Cohesion: 0.25
Nodes (4): args, checkpoint, driven, positional

## Knowledge Gaps
- **135 isolated node(s):** `name`, `private`, `type`, `setup`, `test:verify` (+130 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 241 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Polytrack-ML` connect `Polytrack-ML` to `diff_capture.mjs`, `Env`, `key_usage.mjs`, `search_timeline.mjs`, `search_settings.mjs`, `capture_init.mjs`, `worker_entry.mjs`, `env.mjs`, `host.mjs`, `watch_ghost.mjs`, `export_recording.mjs`?**
  _High betweenness centrality (0.059) - this node is a cross-community bridge._
- **Why does `Env` connect `Env` to `racing_env.mjs`, `key_usage.mjs`, `search_settings.mjs`, `env.mjs`, `Polytrack-ML`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Why does `loadTrack()` connect `env.mjs` to `racing_env.mjs`, `Env`, `key_usage.mjs`, `search_timeline.mjs`, `search_settings.mjs`, `fetch_laps.mjs`, `watch_ghost.mjs`, `export_recording.mjs`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **What connects `name`, `private`, `type` to the rest of the system?**
  _135 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `racing_env.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.11219512195121951 - nodes in this community are weakly interconnected._
- **Should `Env` be split into smaller, more focused modules?**
  _Cohesion score 0.058693244739756366 - nodes in this community are weakly interconnected._
- **Should `PolytrackVecEnv` be split into smaller, more focused modules?**
  _Cohesion score 0.056025369978858354 - nodes in this community are weakly interconnected._