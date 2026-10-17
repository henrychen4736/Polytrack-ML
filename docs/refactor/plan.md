# Polytrack-ML refactor plan

## Context

Henry asked for an analysis of how the codebase could be refactored. Three lenses were applied:

- **Architecture:** deep modules and seams. The `improve-codebase-architecture` skill is not installed, so an Explore agent applied the same method.
- **Code quality:** a harsh review. The `thermo-nuclear-code-quality-review` skill is not installed either, so an Explore agent did this too.
- **Simplicity:** Karpathy's guidelines, which were loaded.

All three agree on the main points:

- **The code is mostly sound.** Its weak spots are a few copy-pasted infrastructure pieces that have drifted apart, plus two plumbing bugs that fail silently.
- **Most "dead" code is still in use and should stay.** The old 10 ms `step()` is what `stepBlock` and the IQN server run on. The rays fill inputs 335–351 of every live checkpoint. The legacy loaders let published numbers be re-measured.

The hard constraint is that **results must stay bit-identical**. Training and search outputs must not change, and old checkpoints must still load. Every step below either cannot change numbers by construction, or is gated by a golden test.

I spot-checked these findings myself:

- `sim/pool.mjs:30,59-65`: stderr is discarded, there is no exit handler, and a request to a dead child never resolves.
- `scripts/train_block_specialist.sh:14`: an unconditional `cp` over the checkpoint that is about to be resumed.
- `rl/train_ppo.py:614`: `finally: save_checkpoint()` also runs after a crash.
- `CAR_TICK_BUDGET` is defined 6 times: 5,000,000 in `racing_env`, 4,500,000 in the other five.

## Phase 1: Bug fixes (small, no effect on results)

1. **Pool.** Replace the body of `sim/pool.mjs` with the `ideas/shared/pool.mjs` implementation, which rejects on child exit, keeps the last stderr lines, and kills already-started children if startup fails. Keep `childFile` resolving against `./`, and make `ideas/shared/pool.mjs` a one-line re-export. Wrap the message handlers in `rl/rollout_child.mjs` and `sim/section_child.mjs` in try/catch that replies `{id, error}`.
2. **Training wrappers.** In `scripts/train_block_specialist.sh` and `train_block_specialist_from.sh`, copy the base checkpoint only if the target does not already exist.
3. **`train_ppo.py` checkpoint saving.** Save in `finally` only on a clean exit or `KeyboardInterrupt`. On any other exception, save to `<ckpt>.crash.pt` instead of overwriting the good one.
4. **Shell interpreter.** Add `PY=${PY:-.venv/Scripts/python}` to the eval and search shell scripts, which currently call bare `python`.
5. **Eval scripts' copy names.** `eval_block_specialist.sh` and `search_round.sh` hard-code `u1600/u2000/u2400` and `u800/...`. Change them to glob the kept copies and take the last three.

## Phase 2: One source for each shared constant (about 30 lines, no effect on results)

6. **Tick budget.** Export `CAR_TICK_BUDGET` from `sim/env.mjs` and import it everywhere it is defined now. **Keep racing_env at 5,000,000** through a local override with a comment, because changing when the ladder is rebuilt could change training.
7. **Random generator.** Replace the three mulberry32 copies (`rl/racing_env.mjs:478`, `rl/env_server.mjs:123`, `rl/rollout_child.mjs:97`) with `createRng` from `sim/search.mjs`. First check that each copy is the same algorithm with the same seeding.
8. **Track list.** Add a `tracks.json` file holding `{train: [14], heldOut: [3]}`. `ideas/shared/laps.mjs` and `scripts/eval_generalist.sh` (via `node -e`) both read it.
9. **Block layout and observation indices.**
   - Export the block `GROUPS` from one JS module.
   - Have `env_server`'s `ready` message carry `groups` and the named observation indices (`sHeld`, `pedalOpen`, `pedal`, `steer`, `contact`).
   - Change `train_ppo.py`, `evaluate.py` and `pretrain_bc.py` to read those values instead of the literals `144/145/15/16/103` and `[0,3,8,10,15,17,22]`.
   - Keep the literals as asserted fallbacks for old checkpoints.

## Phase 3: Deduplication (medium; each step gated by a fixed-seed comparison)

10. **One policy module.**
    - Move `ideas/shared/policy.mjs` to `rl/policy.mjs`; it is already checked against PyTorch to 1e-6.
    - Keep `env_server`'s unrolled four-sum `layerTanh` as the shared implementation, because floating-point summation order decides bit-identity.
    - `env_server.mjs`, `rollout_child.mjs` and the old shared path import it. `iqn_server` reuses only the weight loader.
    - **Gate:** with fixed seeds, the `rollout` and `roll` replies must match byte-for-byte before and after.
11. **Stdio server helper.**
    - Node: `rl/stdio_server.mjs` takes over the parts `env_server` and `iqn_server` both repeat: the key=value parser (reject `NaN`, split on the first `=`), the read loop, `send`/`b64`, and the ready/error handshake.
    - Python: `rl/node_proc.py` (`NodeProcess`, `decode_b64`) replaces the five copies of base64 decoding.
    - The wire format does not change.
12. **Promote the ideas' shared layer into `sim/`.** Move these pieces:
    - `ideas/shared/laps.mjs` → `sim/laps.mjs`, replacing the three lap loaders.
    - `ideas/shared/verify.mjs` → `sim/verify.mjs`, so that the scripts gain the "fails one tick earlier" check.
    - `sim_session.mjs` → `sim/session.mjs`.

    Leave re-exports in `ideas/shared/`, following the existing promotion pattern (`CONTRACT.md:291`). Also add `.track.json` support to `loadTrack`.
13. **RacingEnv public interface.** Add a public `info()` and `freshCar()` to `RacingEnv`, and stop `rollout_child.mjs` and `block_rollout.mjs` reaching into `_info` and `ladder`. Then make `rollout_child` a thin pool child over `block_rollout.roll`.

## Phase 4 (optional, only with Phase 5 of "What is next"): split `racing_env.mjs`

14. Start with a golden test: fixed seed, N steps on 2 tracks under both schemes, with a hash of obs, reward and done. Then pull out pure modules:
    - `reference.mjs` (`buildReference`, `locate`)
    - `observe.mjs` (with a named `OBS_LAYOUT`)
    - `reward.mjs`
    - `starts.mjs`

    Keep `RacingEnv` as the coordinator, with the same DEFAULTS keys, because checkpoints record them.

    Do this only when starting the reference-free generalist (g2-1) or the single-message `stepBlock`, since both need these seams. Don't do it as a standalone refactor.

## Deliberately not changing

- The old 10 ms scheme, the rays, and the legacy loaders for 9-action and 101-input checkpoints. They protect the published 114/170 and 139/170 results. Removing them would save about 150 lines.
- `racing_env`'s DEFAULTS keys and its long comments, which are the project's convention.
- The search scripts and the g1-1, g1-2 and g1-5 workers that produced the verified sub-human laps.
- The one-line re-exports in `ideas/shared/`.

## Housekeeping (needs Henry's yes)

- **`.gitignore` for committed outputs.** Add `ideas/*/out/`, `ideas/*/scratch/` and `ideas/test_logs/`, then run `git rm --cached` on what is already committed. That covers the g2-5 `.bin` weights, the 65 g2-3 outputs, and the g1-5 json files at the folder root. The dated `graphify-out/` snapshots may be wanted, so ask first.
- **Delete `rl/evaluate.py --sticky`**, a dropped experiment.
- **Archive `scripts/set3_round2.sh`.**
- **List or delete the unreferenced diagnostic scripts:** `bench_step`, `diff_capture`, `key_usage`, and the others the review found.

## Verification

- Before and after each phase, run `npm test` and `node ideas/run_all_tests.mjs`. The latter has 1884 checks with 5 known failures, which must stay the same 5.
- Run `rl/smoke_test.mjs`, `rl/block_test.mjs`, `rl/ladder_test.mjs` and `ideas/g1-6-offpolicy-rl/smoke_test.py`.
- **Phase 1 pool:** kill a child process in the middle of a search and check that the search stops with an error naming the child instead of hanging.
- **Phases 2 and 3:** run a fixed-seed fingerprint before and after: 200 `stepBlock` decisions with `ppo_blkgen.best2.pt` on desert4 and winter4, hashing obs, reward and keys. Also re-drive `runs/g1-6-iqn-latest_desert4.recording.json` and confirm it is still 21.977 s and passes Verify.
- Confirm no training job is running before touching `sim/`, `rl/` or `scripts/`.
- Run `graphify update .` after each phase.
- Commit only when Henry asks, with no co-author line.

## Progress (16 October 2026): phases 1 to 3 done, not committed

Measured, not assumed:

- **Fingerprint.** `node docs/refactor/fingerprint.mjs out.json` hashes the replies of `env_server`
  (block and old scheme, including an old-scheme rollout with a fixed pseudo-random 7-score
  network), `iqn_server`, and `rollout_child` through the pool. The refactored code gives exactly
  the hashes of the committed code (`fp_before.json`, recorded from a worktree of commit 07e830c).
  The only key ignored is `obsIndex`, which is new in env_server's ready message.
- **Python.** `rl/evaluate.py` gave the same result on the committed and the refactored code:
  `ppo_blkgen.best2` greedy on desert4 22.090 s, and sampled seed 12 on winter4 stalled at 66.8%
  with 43 contact decisions.
- **IQN lap.** `g1-6-iqn_desert4.pt` still drives 21.977 s.
- **Smoke tests.** `rl/block_test.mjs` printed identical output to the committed code.
  `rl/smoke_test.mjs` is identical except its random-policy line, which uses unseeded
  `Math.random()` (14 vs 13 episodes; it differs between runs of the same code). `rl/ladder_test.mjs`
  passes.
- **Bad pool child.** A pool child that crashes now rejects the request with its error text.
  Before the change it hung.

Done:

1. `sim/pool.mjs` is the version from `ideas/shared/pool.mjs` (a child's death is an error;
   stderr is kept). `ideas/shared/pool.mjs` re-exports it.
2. `train_block_specialist*.sh` copy the base model only if the target checkpoint is missing.
3. `train_ppo.py` saves on a clean finish or Ctrl-C, not after a crash.
4. The eval scripts say "no such checkpoint" instead of printing 0/10 for a missing kept copy.
5. `CAR_TICK_BUDGET` (4,500,000) lives in `sim/env.mjs`. `racing_env` keeps 5,000,000 on
   purpose, with a comment saying why.
6. One random generator: `createRng` in `sim/search.mjs` (three copies removed).
7. `OBS_INDEX` in `racing_env.mjs` goes out in env_server's ready message. `rl/polytrack_env.py`
   holds the Python copies (15, 16, 103, 144, 145) and refuses to start if they differ.
   `train_ppo.py` has one `BLOCK_EDGES`.
8. `rl/policy.mjs` is the one copy of the network code (loader, forward pass, sampling).
   `env_server` and `rollout_child` use it, and `ideas/shared/policy.mjs` re-exports it. It keeps
   both summation orders by name (`layerTanh` and `layerTanhFast`), so nothing changes by a bit.
9. `env_server` and `iqn_server` refuse an argument that is not a number (it used to become NaN
   or 0 silently).
10. `RacingEnv.replaceCar()` and `RacingEnv.info()` are public. `rollout_child`,
    `block_rollout` and g1-4's child no longer touch `ladder` or `_info`. g2-4's test stand-in
    (`tests/toy_env.mjs`) copies RacingEnv's interface, so it gained `replaceCar()` too. Without
    it, `test_logic.mjs` crashed in the first full test run after the change.

Tests: `npm test` passes; `node ideas/run_all_tests.mjs` gives 1884 passed, 0 failed, and the
same 5 known failures as before the refactor.

Skipped on purpose (Karpathy "simplicity first": each would add more than it removes):

- **Shell scripts on `.venv` Python.** Bare `python` is PyTorch 2.5.0 (CPU), `.venv` is 2.6.0
  (CUDA). Every published eval number came from bare `python`, so switching could shift
  re-measured results.
- **A `tracks.json` file.** The 17 official tracks are fixed by the game and listed in two places.
- **A shared stdio-server module (Node and Python).** About 15 duplicated lines. The real bug in
  them, the argument parsing, was fixed in place instead.
- **Promoting `laps.mjs`, `verify.mjs` and `sim_session.mjs` to `sim/`.** The "three lap loaders"
  are one-line reads. `export_recording.mjs` already does the one-tick-earlier check (the review
  that said otherwise was wrong).
- **`rollout_child` as a thin wrapper over `block_rollout.roll`.** `rl/` would then depend on
  `ideas/`, and it risks the order of random draws.
- **The `iqn_server` network.** It is a different network (leaky ReLU, its own file header).

Not done (needs Henry's decision, or belongs with other work):

- Phase 4 (splitting `racing_env.mjs`): only together with the reference-free generalist or the
  single-message `stepBlock`.
- The housekeeping list above (`.gitignore` for committed outputs, `--sticky`, `set3_round2.sh`,
  the unreferenced scripts).
- `loadTrack` for `.track.json`: a feature, not a refactor.
