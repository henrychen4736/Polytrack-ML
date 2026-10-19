"""Turn one OR SEVERAL saved laps into imitation examples for train_ppo.py --bc-data.

    .venv/Scripts/python ideas/g1-3-search-train-rounds/laps_bc.py desert4 out.npz runs/best.recording.json [runs/other.recording.json ...]
    .venv/Scripts/python ideas/g1-3-search-train-rounds/laps_bc.py desert4 out.npz runs/best.recording.json runs/x_desert4.candidates.json --max-candidates 50

rl/lap_bc.py does this for one lap; with one lap this script writes the same
arrays (checked, see the README). With more, the first lap is the one the
round is really training towards (the fastest verified lap) and the others
are further finished laps close to it, which show the policy the same kind of
driving from slightly different positions and speeds.

A lap argument is either a lap file { frames, recording } (what verify.mjs
verifyAndSave and export_recording.mjs write as *.recording.json) or a
CANDIDATES file { laps: [{ frames, recording, ... }, ...] }, fastest first:
what scripts/search_rollout.mjs keep=<ms> writes as
runs/<out>_<track>.candidates.json, and ideas/g2-4-lookahead-driving/drive.mjs
keep=<ms> as runs/g2-4-<out>_<track>.candidates.json. Every lap of a
candidates file counts as one lap here, except that a lap whose keys are the
same as a lap already taken is skipped (a candidates file holds the search's
best lap too, which is usually also given first). Laps from plain lap files
are never skipped, as before.

The first lap's examples are repeated so that they are at least half of the
file: train_ppo.py draws imitation examples uniformly, and where two laps
disagree about what to press at nearly the same place, the fastest lap should
have the larger say.

Lap paths are from the project root (rl/env_server.mjs reads them that way).
One simulator, a few seconds per lap (about 1.5 s for a 22 s lap). The
reference lap stays the human's, as in training.
"""
import argparse
import base64
import json
import os
import shutil
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "rl"))
from polytrack_env import EnvServer  # noqa: E402
from pretrain_bc import PREVIOUS_KEYS  # noqa: E402

p = argparse.ArgumentParser(description=__doc__.split("\n")[0], usage=__doc__)
p.add_argument("track", help="the track the laps are on")
p.add_argument("out", help="the .npz file to write")
p.add_argument("laps", nargs="+",
               help="lap files ({ frames, recording }) or candidates files ({ laps: [...] }), paths from the "
                    "project root; the first lap is the one trained towards")
p.add_argument("--max-candidates", type=int, default=0,
               help="take at most this many laps (the fastest) from each candidates file; 0 = all of them")
args = p.parse_args()

# The laps to label, in order: (label for the log, path the environment reads).
# Laps out of a candidates file are written one per file to a temporary folder
# under runs/, because the environment's demo() takes a file name (rl/env_server.mjs).
tmp = ROOT / "runs" / f"g1-3-tmp-laps_bc-{os.getpid()}"
order, seen = [], set()
for lap_file in args.laps:
    saved = json.loads((ROOT / lap_file).read_text())
    if "laps" not in saved:
        order.append((lap_file, lap_file))
        if saved.get("recording"):
            seen.add(saved["recording"])
        continue
    taken = 0
    for k, lap in enumerate(saved["laps"]):
        if args.max_candidates and taken >= args.max_candidates:
            break
        if lap["recording"] in seen:
            continue
        seen.add(lap["recording"])
        tmp.mkdir(parents=True, exist_ok=True)
        path = tmp / f"c{len(order)}.recording.json"
        path.write_text(json.dumps({"frames": lap["frames"], "recording": lap["recording"]}))
        order.append((f"{lap_file} #{k} ({lap['frames'] / 1000:.3f} s)", path.relative_to(ROOT).as_posix()))
        taken += 1

# The environment as the block specialists train in it; maxOffLine 40 as in
# rl/lap_bc.py (demo() stops recording a lap that goes further from the line).
server = EnvServer(track=args.track, lapFraction=0, pedalEvery=5, block=5, maxOffLine=40)
laps = []
try:
    for label, lap_file in order:
        reply = server.request(cmd="demo", file=lap_file)
        obs = np.frombuffer(base64.b64decode(reply["obs"]), dtype=np.float32).reshape(-1, server.spec["obsSize"]).copy()
        actions = np.frombuffer(base64.b64decode(reply["actions"]), dtype=np.uint8).reshape(-1, 6)
        obs[:, PREVIOUS_KEYS] = 0  # hidden in imitation examples, as in pretrain_bc.py
        laps.append((obs, actions))
        print(f"  {label}: {len(actions)} decisions ({len(actions) * 0.05:.2f} s of the lap)")
finally:
    server.close()
    shutil.rmtree(tmp, ignore_errors=True)
# The first lap once per extra lap (and at least once).
repeats = max(1, len(laps) - 1)
parts = [laps[0]] * repeats + laps[1:]
np.savez(args.out, obs=np.concatenate([p[0] for p in parts]).astype(np.float16), actions=np.concatenate([p[1] for p in parts]))
print(f"{args.out}: {sum(len(p[1]) for p in parts)} examples from {len(laps)} lap(s)")
