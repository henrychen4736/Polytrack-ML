"""Turn one OR SEVERAL saved laps into imitation examples for train_ppo.py --bc-data.

    .venv/Scripts/python ideas/g1-3-search-train-rounds/laps_bc.py desert4 out.npz runs/best.recording.json [runs/other.recording.json ...]

rl/lap_bc.py does this for one lap; with one lap this script writes the same
arrays (checked, see the README). With more, the first lap is the one the
round is really training towards (the fastest verified lap) and the others
are further finished laps close to it, which show the policy the same kind of
driving from slightly different positions and speeds.

The first lap's examples are repeated so that they are at least half of the
file: train_ppo.py draws imitation examples uniformly, and where two laps
disagree about what to press at nearly the same place, the fastest lap should
have the larger say.

Lap paths are from the project root (rl/env_server.mjs reads them that way).
One simulator, a few seconds. The reference lap stays the human's, as in
training.
"""
import base64
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "rl"))
from polytrack_env import EnvServer  # noqa: E402
from pretrain_bc import PREVIOUS_KEYS  # noqa: E402

if len(sys.argv) < 4:
    raise SystemExit(__doc__)
track, out, *lap_files = sys.argv[1:]
# The environment as the block specialists train in it; maxOffLine 40 as in
# rl/lap_bc.py (demo() stops recording a lap that goes further from the line).
server = EnvServer(track=track, lapFraction=0, pedalEvery=5, block=5, maxOffLine=40)
laps = []
try:
    for lap_file in lap_files:
        reply = server.request(cmd="demo", file=lap_file)
        obs = np.frombuffer(base64.b64decode(reply["obs"]), dtype=np.float32).reshape(-1, server.spec["obsSize"]).copy()
        actions = np.frombuffer(base64.b64decode(reply["actions"]), dtype=np.uint8).reshape(-1, 6)
        obs[:, PREVIOUS_KEYS] = 0  # hidden in imitation examples, as in pretrain_bc.py
        laps.append((obs, actions))
        print(f"  {lap_file}: {len(actions)} decisions ({len(actions) * 0.05:.2f} s of the lap)")
finally:
    server.close()
# The first lap once per extra lap (and at least once).
repeats = max(1, len(laps) - 1)
parts = [laps[0]] * repeats + laps[1:]
np.savez(out, obs=np.concatenate([p[0] for p in parts]).astype(np.float16), actions=np.concatenate([p[1] for p in parts]))
print(f"{out}: {sum(len(p[1]) for p in parts)} examples from {len(laps)} lap(s)")
