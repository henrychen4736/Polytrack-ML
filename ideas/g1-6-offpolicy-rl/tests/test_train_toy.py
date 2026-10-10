"""train_iqn.py's loop at toy size on the real simulator: 2 simulators, CPU,
5 rounds of 24 decisions each, a network of 32 units. Not a training run: it
is there to look at what the loop puts into the replay buffer and what files
it writes. About 40 s.

The buffer is captured by handing the trainer a ReplayBuffer subclass that
remembers itself. What is checked on it uses the OBSERVATIONS themselves:
input 20 is the fraction of the lap completed (rl/racing_env.mjs), which
moves by at most a fraction of a percent in one 50 ms decision. So a row
marked "the episode goes on" must be followed, in the same simulator, by a
row at nearly the same lap fraction; if it is not, n-step returns starting
just before it mix two unrelated episodes.

The checkpoint goes to tests/scratch/ (removed at the end); nothing may
appear under rl/checkpoints/ or runs/.
"""
from __future__ import annotations

import contextlib
import io
import shutil

import numpy as np

from common import check, finish, IDEA, PROJECT

import torch

import replay
import train_iqn
from replay import GO, END, CUT

SCRATCH = IDEA / "tests" / "scratch" / "toy"
shutil.rmtree(SCRATCH, ignore_errors=True)
SCRATCH.mkdir(parents=True)
checkpoint = SCRATCH / "toy.pt"


def real_names():
    return sorted(p.name for d in ("rl/checkpoints", "runs") for p in (PROJECT / d).glob("g1-6*"))


before = real_names()
buffers = []


class Spy(replay.ReplayBuffer):
    """The trainer's buffer, remembered, with the row count before each write."""

    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        self.writes = []
        buffers.append(self)

    def add(self, obs, action, reward, stop):
        self.writes.append((self.filled, obs.shape[0]))
        super().add(obs, action, reward, stop)


train_iqn.ReplayBuffer = Spy
N, T, ROUNDS = 2, 24, 5
common_args = ["--track", "desert4", "--envs", str(N), "--rollout", str(T), "--device", "cpu", "--hidden", "32", "--head", "16",
               "--batch", "16", "--reuse", "1", "--learn-start", str(2 * N * T), "--buffer", "100000", "--checkpoint", str(checkpoint),
               "--eval-every", "1", "--save-every", "2", "--seed", "3"]
log = io.StringIO()
with contextlib.redirect_stdout(log):
    train_iqn.main(common_args + ["--total-decisions", str(N * T * ROUNDS)])
text = log.getvalue()
buf = buffers[0]

check("toy run: 5 rounds ran, each with a start-line evaluation, and the loop reported a loss once learning began",
      text.count("\nround ") + text.startswith("round ") >= ROUNDS - 1 and text.count("  eval ") == ROUNDS and "loss nan" not in text.strip().split("\n")[-2], text)
check("toy run: the buffer holds rounds x 24 rows for each of the 2 simulators, written one round at a time", buf.filled == ROUNDS * T and buf.envs == N and buf.writes == [(k * T, T) for k in range(ROUNDS)], str(buf.writes))
check("toy run: stop flags are 0, 1 or 2 and actions are among the 12", set(np.unique(buf.stop[:buf.filled]).tolist()) <= {GO, END, CUT} and buf.action[:buf.filled].max() < 12 and buf.action[:buf.filled].min() >= 0)

fraction = buf.obs[:buf.filled, :, 20].astype(np.float64)        # lap fraction seen at each decision
JUMP = 0.01                                                       # 1% of the lap: about 18 units; 50 ms at 300 km/h is 4
moving = np.abs(np.diff(fraction, axis=0))
goes_on = buf.stop[:buf.filled - 1] == GO


def breaks(env):
    return [int(r) for r in np.nonzero(goes_on[:, env] & (moving[:, env] > JUMP))[0]]


check("the lap-fraction input does move a little on ordinary decisions (so the check below can see a break)", 0 < np.median(moving[goes_on]) < JUMP / 4, str(np.median(moving[goes_on])))
check("after an episode ends (stop 1 or 2) the next row is a new episode somewhere else, at least once in this run (so breaks do exist in the data)",
      (moving[~goes_on] > JUMP).any(), f"{(~goes_on).sum()} endings")
# Simulator 1 is never taken for an evaluation: its episodes carry on from one round into the next.
check("simulator 1 (never evaluated): every row marked 'goes on' is followed by the same episode's next decision, across round boundaries too", breaks(1) == [], f"breaks after rows {breaks(1)}")
# Simulator 0 drives the evaluation lap after every round, and starts a NEW episode in the next round.
boundary = [k * T - 1 for k in range(1, ROUNDS)]
flags = [int(buf.stop[r, 0]) for r in boundary]
check("simulator 0 (taken for an evaluation lap after every round): the last row before each evaluation is not left marked 'the episode goes on'",
      all(f != GO for f in flags), f"stop flags of rows {boundary}: {flags} (0 = goes on)")
check("simulator 0: no row marked 'goes on' is followed by a row from a different episode", breaks(0) == [], f"lap fraction jumps after rows {breaks(0)}: "
      + ", ".join(f"{fraction[r, 0]:.3f} -> {fraction[r + 1, 0]:.3f}" for r in breaks(0)))
if buf.filled > 4:
    # What that does to a sample: the 3-step return from the row before a boundary.
    rng = np.random.default_rng(0)
    rows = np.array([b - 1 for b in boundary])
    ret, boot_row, boot = buf.n_step(rows, np.zeros(len(rows), dtype=int), 3, 0.99)
    crosses = [(int(r), int(br)) for r, br, bd in zip(rows, boot_row, boot) if bd > 0 and br > r + 1 and buf.stop[r + 1, 0] != END]
    check("simulator 0: a 3-step return starting just before an evaluation does not reach into the episode started after it", crosses == [], f"(start row, row estimated from): {crosses}")

# ---- files --------------------------------------------------------------------------------------
saved = torch.load(checkpoint, map_location="cpu", weights_only=True)
check("checkpoint: written where --checkpoint says, with the decision count and what is needed to rebuild the network",
      saved["decisions"] == N * T * ROUNDS and saved["obs_size"] == 352 and saved["num_actions"] == 12 and saved["hidden"] == 32 and saved["track"] == "desert4" and saved["best_finish"] is None,
      str({k: v for k, v in saved.items() if not isinstance(v, dict)}))
check("the actor file is written beside the checkpoint, and no temporary files are left", sorted(p.name for p in SCRATCH.iterdir()) == ["toy.actor.bin", "toy.pt"], str(sorted(p.name for p in SCRATCH.iterdir())))

# ---- resume (the README: "written but not exercised") ---------------------------------------------
buffers.clear()
log = io.StringIO()
with contextlib.redirect_stdout(log):
    train_iqn.main(common_args + ["--total-decisions", str(N * T), "--resume"])
again = torch.load(checkpoint, map_location="cpu", weights_only=True)
check("--resume: carries on from the saved decision count (240 + 48 = 288) with an empty buffer", again["decisions"] == N * T * (ROUNDS + 1) and "resumed" in log.getvalue() and buffers[0].filled == T, log.getvalue())
same_start = all(torch.equal(saved["model"][k], v) for k, v in again["model"].items())
check("--resume: with too few decisions to start learning the network is unchanged, i.e. it really was loaded from the checkpoint", same_start)

check("nothing was written under the real rl/checkpoints/ or runs/", real_names() == before, str(set(real_names()) ^ set(before)))
shutil.rmtree(IDEA / "tests" / "scratch", ignore_errors=True)
finish()
