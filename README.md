# Polytrack-ML

Local ML and search for fast PolyTrack 0.6.3 laps, run against the game's own
physics headlessly in Node. Nothing here talks to Kodub's leaderboard server:
bot runs are for local ghosts only and must not be submitted.

## Setup

```bash
npm install
npm run setup     # clones polyrl at a pinned commit into vendor/, checks game file hashes
npm test          # both acceptance tests below
```

Needs Node 20+. `npm run capture` additionally needs Microsoft Edge.

## Layout

- `sim/host.mjs`: boots the unmodified simulation worker (via polyrl's
  `worker_threads` host) with the `Init` payload captured from the real client.
- `sim/worker_entry.mjs`: worker thread entry; polyrl's entry plus an eager pump.
- `sim/env.mjs`: `Env` with `reset`, `step(controls, nFrames)` and
  `replay(track, recording, maxFrames)`; one 227-byte state per 1 ms tick.
- `sim/state.mjs`: decoder for the car state.
- `sim/recording.mjs`: recording string codec (toggle frames per channel).
- `data/init_0.6.3.json`, `data/createcar_summer1.json`: messages the real
  client posted to its worker. Kodub's geometry; do not redistribute.
- `scripts/capture_init.mjs`: regenerates those captures in headless Edge with
  `vps.kodub.com` blocked.
- `scripts/diff_capture.mjs`: diffs the capture against polyrl's rebuilt assets.

## Acceptance tests

1. `npm run test:verify`: 27 real leaderboard recordings (5 on summer1, 22 on
   winter1) pass the worker's own `Verify` on their exact claimed frame.
2. `npm run test:determinism`: one summer1 run gives the same state stream in
   two separate processes, and the same stream whether fed as a recording or
   stepped live through `Env.step`.

## Driving and watching a lap

```bash
node scripts/drive_baseline.mjs summer1     # pure-pursuit lap, saves runs/baseline_summer1.json
node scripts/export_recording.mjs summer1   # encodes it as a recording and runs the game's Verify
node scripts/watch_ghost.mjs summer1        # opens the real client with the lap loaded; click Watch
node scripts/search_timeline.mjs summer1 seconds=120   # mutate key timings, saves runs/search_summer1.recording.json
node scripts/watch_ghost.mjs summer1 search # watch the searched lap
node scripts/search_settings.mjs summer1 seconds=120   # tune the controller's settings, saves runs/tuned_summer1.json
node scripts/export_recording.mjs summer1 tuned        # encode + Verify the tuned lap
node scripts/watch_ghost.mjs summer1 tuned             # watch it
```

summer1: human 22.279 s, baseline 23.835 s, tuned controller 22.403 s (holding brake in the air).
winter1: human 17.011 s, tuned controller 17.048 s (started from `crossTrackGain=2 airBrake=1`; the defaults do not finish).

The search scores laps in separate processes (`sim/pool.mjs`): simulator
threads inside one Node process do not scale past about two.

`watch_ghost.mjs` uses a temporary Edge profile with `vps.kodub.com` blocked.
Never put a bot recording into localStorage in a normal browser: the client
uploads any stored lap that beats the server's copy.

## Things that were not obvious

- polyrl's `physics_assets.json` is off by one float32 ULP on 164 of 186 parts
  and on the car hull. With it, only 2 of the 27 recordings verify. Always boot
  from the captured `Init`.
- On Windows, git's `autocrlf` rewrites the vendored worker bundle. `npm run
  setup` clones with it off.
- The state buffer is variable-length and reused, so bytes past
  `stateLength()` are stale. Compare or hash only the written prefix.
- The stock non-realtime loop polls on a timer, which cost about 9 ms per
  `step` call on Windows. `sim/worker_entry.mjs` runs the same loop eagerly:
  about 52,000 frames/s at 10 frames per call (`node scripts/bench_step.mjs`).
- Mountains made no difference on summer1 or winter1. Tracks without a capture
  in `data/` run with none, which is only safe if the car cannot reach the
  backdrop terrain.
