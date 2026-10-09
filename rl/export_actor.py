"""Write a checkpoint's policy network as the raw weights file the Node side reads.

    python rl/export_actor.py rl/checkpoints/ppo_gblk_desert4.u2400.pt
    -> rl/checkpoints/ppo_gblk_desert4.u2400.actor.bin   (and prints the hidden width)

Training writes such a file itself (rl/train_ppo.py, write_actor_weights), but
only for the weights it is currently training with. A search that uses the
policy (scripts/search_rollout.mjs) needs the file for whichever kept
checkpoint tested best, which is often not the last one.

Layout, the same as train_ppo.py writes and rl/env_server.mjs documents: the
three actor layers in order, each as its weights (one row per unit) and then
its biases, as float32.
"""
import sys
from pathlib import Path

import numpy as np
import torch

if len(sys.argv) != 2:
    raise SystemExit(__doc__)
path = Path(sys.argv[1])
saved = torch.load(path, map_location="cpu", weights_only=False)
if not saved.get("block"):
    raise SystemExit("only block-decision checkpoints are supported (the search drives block decisions)")
model = saved["model"]
parts = []
# The actor is Sequential(Linear, Tanh, Linear, Tanh, Linear): layers 0, 2, 4.
for k in (0, 2, 4):
    parts += [model[f"actor.{k}.weight"].numpy().ravel(), model[f"actor.{k}.bias"].numpy().ravel()]
out = path.with_suffix(".actor.bin")
np.concatenate(parts).astype(np.float32).tofile(out)
# The Node side needs the hidden width to split the file into layers, and the
# environment settings the policy was trained with.
print(f"{out} hidden={saved['hidden']} ticks={saved['ticks']} block={saved['block']} "
      f"pedalEvery={saved.get('pedal_every', 1)} lapFraction={saved.get('lap_fraction', 1)}")
