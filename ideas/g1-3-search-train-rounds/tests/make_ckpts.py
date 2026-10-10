"""Write stand-in checkpoints for the driver tests: files that hold only a
step counter, which is all ckpt_steps.py (and so rounds.mjs in a dry run)
reads from a checkpoint.

    .venv/Scripts/python ideas/g1-3-search-train-rounds/tests/make_ckpts.py <list.json>

<list.json> is {"<absolute path>": <steps>, ...}. CPU only, a few kilobytes.
"""
import json
import sys
from pathlib import Path

import torch

for path, steps in json.load(open(sys.argv[1])).items():
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    torch.save({"steps": steps}, path)
