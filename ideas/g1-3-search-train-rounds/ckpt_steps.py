"""Print the training step counter of each checkpoint given, as JSON.

    .venv/Scripts/python ideas/g1-3-search-train-rounds/ckpt_steps.py a.pt b.pt
    -> {"a.pt": 107726848, "b.pt": 108136448}

rounds.mjs uses this to find out how far an interrupted round of practice
got: the counter inside the checkpoint is the only record that is certainly
in step with the weights (the training log can be a few updates ahead of the
last save). CPU only; nothing is written.
"""
import json
import sys

import torch

print(json.dumps({f: int(torch.load(f, map_location="cpu", weights_only=True)["steps"]) for f in sys.argv[1:]}))
