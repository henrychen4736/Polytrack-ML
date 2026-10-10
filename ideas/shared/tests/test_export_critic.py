"""export_critic.py and policy.mjs against PyTorch. CPU only, no simulator.

A checkpoint is COPIED into tests/tmp/ and exported there, so nothing under
rl/checkpoints/ is written. Then the Node side (policy.mjs loadPolicy /
loadValue, through print_scores.mjs) and PyTorch are given the same three
observations and must agree on the 22 scores, the value, the top decision and
its log-probability.

Prints PASS / FAIL lines like the Node tests (see harness.mjs).
"""
import json
import math
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
import torch

ROOT = Path(__file__).resolve().parents[3]
TMP = Path(__file__).resolve().parent / "tmp"
SOURCE = ROOT / "rl/checkpoints/ppo_sr1_desert4.u1200.pt"
GROUPS = [(0, 3), (3, 5), (8, 2), (10, 5), (15, 2), (17, 5)]


def check(ok, text):
    print(f"{'PASS' if ok else 'FAIL'} {text}", flush=True)
    return bool(ok)


def run(args):
    return subprocess.run(args, cwd=ROOT, capture_output=True, text=True)


if not SOURCE.exists():
    print(f"     SKIP: no {SOURCE.relative_to(ROOT)}")
    sys.exit(0)

shutil.rmtree(TMP, ignore_errors=True)
TMP.mkdir(parents=True)
try:
    ckpt = TMP / "shared-test.pt"
    shutil.copyfile(SOURCE, ckpt)
    saved = torch.load(ckpt, map_location="cpu", weights_only=False)
    model, hidden, obs_size = saved["model"], saved["hidden"], saved["obs_size"]

    # ---- the script: exit codes and the file it writes ----
    r = run([sys.executable, "ideas/shared/export_critic.py", str(ckpt)])
    critic_file = ckpt.with_suffix(".critic.bin")
    check(r.returncode == 0 and critic_file.exists(), "export_critic.py on a block checkpoint: exit 0 and <checkpoint>.critic.bin written next to it")
    want = hidden * obs_size + hidden + hidden * hidden + hidden + hidden + 1
    data = np.fromfile(critic_file, dtype=np.float32)
    check(data.size == want, f"the critic file holds {data.size} float32 values = three layers of a {obs_size}-{hidden}-{hidden}-1 network ({want})")
    check(np.array_equal(data[: hidden * obs_size], model["critic.0.weight"].numpy().ravel())
          and np.array_equal(data[-1:], model["critic.4.bias"].numpy().ravel()),
          "layout: starts with the first layer's weights row by row, ends with the output bias")
    check(f"hidden={hidden}" in r.stdout and f"obs={obs_size}" in r.stdout, "it prints the hidden width and the observation size")
    r = run([sys.executable, "ideas/shared/export_critic.py"])
    check(r.returncode != 0, "export_critic.py with no argument exits non-zero")
    not_block = TMP / "shared-test-noblock.pt"
    torch.save({**saved, "block": 0}, not_block)
    r = run([sys.executable, "ideas/shared/export_critic.py", str(not_block)])
    check(r.returncode != 0 and not not_block.with_suffix(".critic.bin").exists(), "a checkpoint that is not a block-decision one: exit non-zero, nothing written")
    r = run([sys.executable, "ideas/shared/export_critic.py", str(TMP / "missing.pt")])
    check(r.returncode != 0, "a checkpoint file that does not exist: exit non-zero")

    # ---- policy.mjs against PyTorch ----
    r = run([sys.executable, "rl/export_actor.py", str(ckpt)])
    actor_file = ckpt.with_suffix(".actor.bin")
    if check(r.returncode == 0 and actor_file.exists(), "rl/export_actor.py on the same copy (for the comparison below)"):
        r = run(["node", "ideas/shared/tests/print_scores.mjs", str(actor_file), str(critic_file)])
        node = json.loads(r.stdout.strip().splitlines()[-1]) if r.returncode == 0 else None
        if check(node is not None, "policy.mjs loads both files (absolute paths)"):
            check(node["hidden"] == hidden and node["obsSize"] == obs_size, f"loadPolicy works out hidden = {hidden} from the file size; OBS_SIZE = {obs_size} as the checkpoint says")

            def net(prefix, x):
                for k in (0, 2):
                    x = torch.tanh(model[f"{prefix}.{k}.weight"].double() @ x + model[f"{prefix}.{k}.bias"].double())
                return model[f"{prefix}.4.weight"].double() @ x + model[f"{prefix}.4.bias"].double()

            worst_s = worst_v = worst_lp = 0.0
            same_decision = True
            for n, got in enumerate(node["out"]):
                # Float32 observation, as Node builds it.
                obs = torch.tensor(np.array([0.8 * math.sin(0.37 * i + n) for i in range(obs_size)], dtype=np.float32)).double()
                scores, value = net("actor", obs), net("critic", obs)[0].item()
                worst_s = max(worst_s, (scores - torch.tensor(got["scores"], dtype=torch.float64)).abs().max().item())
                worst_v = max(worst_v, abs(value - got["value"]))
                decision = [int(torch.argmax(scores[a:a + c])) for a, c in GROUPS]
                same_decision &= decision == got["decision"]
                lp = sum(torch.log_softmax(scores[a:a + c], 0)[d].item() for (a, c), d in zip(GROUPS, decision))
                worst_lp = max(worst_lp, abs(lp - got["logProb"]))
            # policy.mjs keeps its hidden layers in float32, so agreement is to about 1e-5.
            check(worst_s < 1e-3, f"policy.scores: the 22 scores agree with PyTorch on 3 observations (largest difference {worst_s:.1e})")
            check(worst_v < 1e-3, f"loadValue: the value agrees with PyTorch's critic (largest difference {worst_v:.1e})")
            check(same_decision, "policy.decide without an rng is PyTorch's argmax of each of the six groups")
            check(worst_lp < 1e-3, f"policy.logProb agrees with PyTorch's log-softmax summed over the six groups (largest difference {worst_lp:.1e})")
finally:
    shutil.rmtree(TMP, ignore_errors=True)
