"""Write a checkpoint's value network ("critic") as a raw weights file for Node.

    .venv/Scripts/python ideas/shared/export_critic.py rl/checkpoints/ppo_sr1_desert4.u800.pt
    -> rl/checkpoints/ppo_sr1_desert4.u800.critic.bin

The companion of rl/export_actor.py, which writes only the policy. A search
that wants to rank partial laps by the policy's own value estimate (beam
search, lookahead driving) needs the critic too; ideas/shared/policy.mjs
loadValue() reads the file.

Layout, the same as the actor file: the three layers in order, each as its
weights (one row per unit) and then its biases, as float32. The critic is
Sequential(Linear, Tanh, Linear, Tanh, Linear) with one output.

Runs on the CPU and takes a second; it does not touch the GPU.
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
    raise SystemExit("only block-decision checkpoints are supported")
model = saved["model"]
parts = []
for k in (0, 2, 4):
    parts += [model[f"critic.{k}.weight"].numpy().ravel(), model[f"critic.{k}.bias"].numpy().ravel()]
out = path.with_suffix(".critic.bin")
np.concatenate(parts).astype(np.float32).tofile(out)
print(f"{out} hidden={saved['hidden']} obs={saved['obs_size']} track={saved.get('track')}")
