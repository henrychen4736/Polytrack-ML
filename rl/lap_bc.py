"""Turn one saved lap into imitation examples for train_ppo.py --bc-data.

    python rl/lap_bc.py desert4 runs/rollout_desert4.recording.json rl/checkpoints/bc_search_desert4.npz

Why: scripts/search_rollout.mjs finds a lap faster than the specialist drives
on its own, but the search can only go as far as the specialist's driving of
the rest of the lap allows. Training the specialist towards the searched lap
(as an imitation term next to its ordinary practice) moves the policy to where
the search got to, so that the next search starts from a better driver.

The lap is driven through the environment exactly as human laps are for
rl/pretrain_bc.py: at every block decision, what the agent would have seen and
which decision those keys amount to. The file has the same layout as that
script's --save-data: obs (float16) and actions (uint8, six per decision).
The reference lap stays the human's, as in training.
"""
import base64
import sys

import numpy as np

from polytrack_env import EnvServer
from pretrain_bc import PREVIOUS_KEYS

if len(sys.argv) != 4:
    raise SystemExit(__doc__)
track, lap_file, out = sys.argv[1:]
# The environment as the block specialists train in it. maxOffLine 40: the
# search drives with that limit, and demo() stops recording a lap that goes
# further from the reference line than the limit.
server = EnvServer(track=track, lapFraction=0, pedalEvery=5, block=5, maxOffLine=40)
try:
    reply = server.request(cmd="demo", file=lap_file)
    obs = np.frombuffer(base64.b64decode(reply["obs"]), dtype=np.float32).reshape(-1, server.spec["obsSize"]).copy()
    actions = np.frombuffer(base64.b64decode(reply["actions"]), dtype=np.uint8).reshape(-1, 6)
finally:
    server.close()
obs[:, PREVIOUS_KEYS] = 0  # hidden in imitation examples, as in pretrain_bc.py
np.savez(out, obs=obs.astype(np.float16), actions=actions)
print(f"{out}: {len(actions)} decisions ({len(actions) * 0.05:.2f} s of the lap)")
