# Brief for the idea agents

Thirteen agents are working in this repository at once: one orchestrator and
twelve idea agents, each writing the code for one idea. Training is running in
the background the whole time. Read this file first, then
`ideas/shared/CONTRACT.md` (written by the orchestrator).

## The project

PolyTrack 0.6.3 racing, run headless: a deterministic Bullet physics simulator
(WebAssembly, 1000 ticks per second) driven from Node. The owner, Henry, has
two goals:

1. A lap **faster than the best human lap** on at least one track, by any means
   (search, maths, or learning).
2. A **generalist** that can drive any track, including community tracks,
   reasonably well after a few attempts.

Where things stand:

- Specialists (PPO, "block decisions": one decision per 50 ms, each of steer /
  W / S gets a target and a 10 ms switch slice) finish laps 0.2 to 0.9 s behind
  the human.
- `scripts/search_rollout.mjs` (change a decision in a 1.5 s section, let the
  policy drive the rest, keep it only if the lap finishes sooner) gains 100 to
  370 ms in ten minutes. Best laps so far against the human: desert4 21.907 /
  21.750 s, summer4 34.500 / 34.105 s, summer1 22.334 / 22.279 s, winter2
  27.082 / 26.830 s.
- The block-decision generalist finishes 139 of 170 attempts on its 17 training
  tracks and 7 of 30 on tracks it has not seen. Its inputs include the human
  lap's line, speeds and keys, which a community track does not have.

## Find your way around

- `graphify-out/graph.json` is a knowledge graph of the code. Ask it before
  reading files: `graphify query "<question>"`. Do NOT run `graphify update`;
  the orchestrator does that once at the end.
- Key files: `sim/env.mjs` (simulator wrapper, save states), `sim/pool.mjs`
  (parallel simulator processes), `sim/recording.mjs` (lap encoding),
  `sim/state.mjs` (car state), `sim/line.mjs`, `sim/track.mjs`,
  `sim/trackmesh.mjs` (track geometry, ray casts), `rl/racing_env.mjs` (the
  training environment: observation, reward, block decisions, mark/rewind),
  `rl/env_server.mjs`, `rl/train_ppo.py`, `rl/evaluate.py`,
  `rl/rollout_child.mjs`, `scripts/search_rollout.mjs`,
  `scripts/search_sections.mjs`, `sim/sectional.mjs`,
  `scripts/export_recording.mjs` (encode a lap and run the game's own Verify).
- Human laps: `data/laps/<track>.json` (ten per track) and
  `vendor/polyrl/fixtures/leaderboard_<track>.json`. Tracks: `data/`.
- Checkpoints: `rl/checkpoints/` (git-ignored). Block specialists:
  `ppo_gblk_<track>.*.pt`, `ppo_sr1_<track>.*.pt`; generalist:
  `ppo_blkgen.best2.pt`. `rl/export_actor.py` writes a checkpoint's policy for
  the Node side.
- Python: use `.venv/Scripts/python` (it has CUDA PyTorch).

## Rules

1. **Stay in your own folder.** Write only inside `ideas/<your folder>/`. Do
   not edit, move or delete any existing file outside `ideas/`: training and
   searches are running from `sim/`, `rl/` and `scripts/` right now, and an
   edit there can break them mid-run. Import from those files freely. If you
   need a change to one of them, write it up in your README under "Changes
   needed elsewhere" instead of making it.
2. **Shared code lives in `ideas/shared/`, owned by the orchestrator.** Use
   what `ideas/shared/CONTRACT.md` offers before writing your own. Do not edit
   files there. If you need something shared that is missing, or you wrote a
   helper others could use, append a short entry to `ideas/shared/REQUESTS.md`
   (your folder, what, why) and carry on with a local version.
3. **Light on the machine.** Training is using the CPU and the GPU. Smoke tests
   only: at most 2 simulator processes, at most about 2 minutes per run, no GPU
   training runs, nothing left running in the background when you finish. Do
   not kill any process you did not start.
4. **Local use only.** Nothing may contact `vps.kodub.com` or any other server,
   and nothing may submit, upload or store a lap anywhere the game client could
   upload it from. Do not redistribute Kodub's geometry in `data/` or
   `vendor/polyrl`.
5. **No git commands that change anything** (no add, commit, checkout, stash,
   reset). The main session commits.
6. **Comment the code thoroughly**: say why, in plain language, with measured
   numbers where they drove a choice. Match the style of the existing files.
7. **Design skills.** If the Skill tool is available to you, load
   `andrej-karpathy-skills:karpathy-guidelines` before writing code and
   `mattpocock-skills:codebase-design` when deciding a module's interface. In
   short: the simplest thing that works, small surgical modules, stated
   assumptions, and a check that proves the code does what it claims.
8. **Report honestly.** A lap time counts only if the lap finishes and
   `scripts/export_recording.mjs` (or the game's Verify) passes. Say what you
   ran and what you did not.

## What to deliver

In `ideas/<your folder>/`:

- The code, runnable from the project root.
- `README.md` with: what the idea is in two or three sentences; how to run it
  (exact commands); what you tested and the numbers you got; what is not done
  or not tested; changes needed elsewhere; and what a full run would cost in
  time.

Your final message should be a short summary of the same: what exists, what
was verified, what is left.
