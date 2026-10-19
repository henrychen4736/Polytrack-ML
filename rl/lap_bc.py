"""Turn one saved lap into imitation examples for train_ppo.py --bc-data.

    python rl/lap_bc.py desert4 runs/rollout_desert4.recording.json rl/checkpoints/bc_search_desert4.npz
    python rl/lap_bc.py desert4 <lap file> <out.npz> --reference route     # for a route-reference model

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

With --reference route the observation is the 334-number route observation
(ROUTE MODE in rl/racing_env.mjs), for a model trained with
train_ppo.py --reference route; the labels are the same. The lap stops being
recorded where it is more than maxOffRoute (110 units) from the route.
"""
import argparse
import base64

import numpy as np

from polytrack_env import EnvServer
from pretrain_bc import PREVIOUS_KEYS

p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
p.add_argument("track", help="the track the lap is on")
p.add_argument("lap_file", help="a JSON file holding { frames, recording }, path from the project root")
p.add_argument("out", help="the .npz file to write")
p.add_argument("--reference", choices=["human", "route"], default="human",
               help="'route': examples for a route-reference model (334 inputs) instead of the human-reference one")
args = p.parse_args()
# The environment as the block specialists train in it. maxOffLine 40: the
# search drives with that limit, and demo() stops recording a lap that goes
# further from the reference line than the limit. (Route mode uses its own
# limit, maxOffRoute, and ignores maxOffLine.)
server = EnvServer(track=args.track, lapFraction=0, pedalEvery=5, block=5, maxOffLine=40,
                   **({"reference": "route"} if args.reference == "route" else {}))
try:
    reply = server.request(cmd="demo", file=args.lap_file)
    obs = np.frombuffer(base64.b64decode(reply["obs"]), dtype=np.float32).reshape(-1, server.spec["obsSize"]).copy()
    actions = np.frombuffer(base64.b64decode(reply["actions"]), dtype=np.uint8).reshape(-1, 6)
finally:
    server.close()
obs[:, PREVIOUS_KEYS] = 0  # hidden in imitation examples, as in pretrain_bc.py
np.savez(args.out, obs=obs.astype(np.float16), actions=actions)
print(f"{args.out}: {len(actions)} decisions ({len(actions) * 0.05:.2f} s of the lap), {obs.shape[1]} inputs each")
