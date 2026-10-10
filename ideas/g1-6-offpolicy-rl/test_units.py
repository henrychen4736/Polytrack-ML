"""Checks of the pieces that are easy to get wrong. No simulator, CPU, a few seconds.

    .venv/Scripts/python ideas/g1-6-offpolicy-rl/test_units.py

1. quantile loss    against a version written out with plain loops; and that
                    minimising it puts each prediction at its quantile
2. n-step returns   hand-worked cases across an ending, a cut-off, the newest
                    row and the ring's wrap; then 20 000 random samples
                    against a one-sample-at-a-time reference
3. replay sampling  never starts where nothing is known after; covers
                    everything else evenly; float16 storage is close enough
4. network          shapes, dueling identity, and that the exported actor file
                    gives the same best action as the network (read back with
                    numpy the way iqn_server.mjs reads it)
5. learning         a two-state problem with a known answer is solved by
                    Learner.update (values and spread)
"""
from __future__ import annotations

import argparse
import tempfile
from pathlib import Path

import numpy as np
import torch

from iqn import ACT_FRACTIONS, IQN, MAGIC, export_actor, quantile_huber_loss
from replay import CUT, END, GO, ReplayBuffer
from train_iqn import Learner, epsilons, parse_args


def check(condition: bool, what: str) -> None:
    print(("ok    " if condition else "FAIL  ") + what)
    if not condition:
        raise SystemExit(1)


# ---- 1. quantile loss -------------------------------------------------------

def loss_by_loops(predicted, taus, target, kappa):
    """The definition, one pair at a time."""
    B, N = predicted.shape
    M = target.shape[1]
    out = np.zeros(B)
    for b in range(B):
        for i in range(N):
            total = 0.0
            for j in range(M):
                d = target[b, j] - predicted[b, i]
                huber = 0.5 * d * d if abs(d) <= kappa else kappa * (abs(d) - 0.5 * kappa)
                total += abs(taus[b, i] - (1.0 if d < 0 else 0.0)) * huber / kappa
            out[b] += total / M
    return out


def test_quantile_loss() -> None:
    g = torch.Generator().manual_seed(1)
    predicted, taus, target = torch.randn(5, 4, generator=g) * 3, torch.rand(5, 4, generator=g), torch.randn(5, 7, generator=g) * 3
    for kappa in (1.0, 0.3):
        ours = quantile_huber_loss(predicted, taus, target, kappa).numpy()
        theirs = loss_by_loops(predicted.numpy(), taus.numpy(), target.numpy(), kappa)
        check(np.allclose(ours, theirs, atol=1e-5), f"quantile loss equals the written-out definition (kappa {kappa})")

    # One prediction, tau 0.5, targets 0 and 4, prediction 1: errors -1 and +3.
    # huber(-1) = 0.5, huber(3) = 2.5, both weighted 0.5 -> mean of 0.25 and 1.25.
    one = quantile_huber_loss(torch.tensor([[1.0]]), torch.tensor([[0.5]]), torch.tensor([[0.0, 4.0]])).item()
    check(abs(one - 0.75) < 1e-6, f"hand-worked case gives 0.75 (got {one:.4f})")

    # Minimising it finds the quantiles: targets uniform on 0..100, so the
    # prediction for tau should settle at 100 tau (within the Huber rounding).
    theta = torch.zeros(1, 3, requires_grad=True)
    fractions = torch.tensor([[0.1, 0.5, 0.9]])
    optimizer = torch.optim.Adam([theta], lr=0.5)
    for _ in range(3000):
        loss = quantile_huber_loss(theta, fractions, torch.rand(1, 256, generator=g) * 100).sum()
        optimizer.zero_grad(); loss.backward(); optimizer.step()
    found = theta.detach().numpy().ravel()
    check(np.abs(found - [10, 50, 90]).max() < 2.0, f"minimising it finds the 10/50/90% points of 0..100 (got {np.round(found, 1)})")


# ---- 2. n-step returns ------------------------------------------------------

def n_step_one(buffer: ReplayBuffer, row: int, env: int, n: int, gamma: float):
    """One sample, written as a story: walk forward collecting rewards."""
    ret, k = 0.0, 0
    while True:
        at = (row + k) % buffer.rows
        if k == n:
            return ret, at, gamma ** n                 # n rewards collected: estimate from here
        if buffer.stop[at, env] == CUT or at == buffer.newest:
            return ret, at, gamma ** k                 # nothing known beyond this observation
        ret += gamma ** k * float(buffer.reward[at, env])
        if buffer.stop[at, env] == END:
            return ret, at, 0.0                        # ended for good: no estimate
        k += 1


def test_n_step() -> None:
    gamma = 0.9
    buffer = ReplayBuffer(rows=12, envs=1, obs_size=1)
    rewards = np.arange(1, 11, dtype=np.float32)       # rows 0..9 earn 1..10
    stops = np.zeros(10, dtype=np.uint8)
    stops[4], stops[7] = END, CUT                      # row 4 ends an episode, row 7 is cut off
    buffer.add(np.arange(10, dtype=np.float32).reshape(10, 1, 1), np.zeros((10, 1), dtype=np.int64),
               rewards.reshape(10, 1), stops.reshape(10, 1))
    env = np.zeros(1, dtype=np.int64)

    def at(row, n=3):
        ret, boot_row, boot = buffer.n_step(np.array([row]), env, n, gamma)
        return round(float(ret[0]), 4), int(boot_row[0]), round(float(boot[0]), 4)

    check(at(0) == (round(1 + 0.9 * 2 + 0.81 * 3, 4), 3, 0.729), "plain 3-step: rewards of rows 0,1,2, estimate from row 3 at gamma^3")
    check(at(2)[0] == round(3 + 0.9 * 4 + 0.81 * 5, 4) and at(2)[2] == 0.0, "an ending on the 3rd decision: all three rewards, no estimate")
    check(at(3)[0] == round(4 + 0.9 * 5, 4) and at(3)[2] == 0.0, "an ending on the 2nd decision: nothing collected from the next episode")
    check(at(4) == (5.0, at(4)[1], 0.0), "starting on the ending decision: its reward only")
    check(at(5) == (round(6 + 0.9 * 7, 4), 7, 0.81), "a cut-off 2 rows on: 2 rewards, estimate from the cut-off row's own observation at gamma^2")
    check(at(6) == (7.0, 7, 0.9), "a cut-off 1 row on: 1 reward, estimate at gamma")
    check(at(8) == (9.0, 9, 0.9), "the newest row is treated like a cut-off (its successor is not written yet)")
    check(at(0, n=1) == (1.0, 1, 0.9), "1-step")

    # The ring: write 6 more rows; rows 10, 11, then 0..3 are overwritten.
    buffer.add(np.arange(10, 16, dtype=np.float32).reshape(6, 1, 1), np.zeros((6, 1), dtype=np.int64),
               np.full((6, 1), 100, dtype=np.float32), np.zeros((6, 1), dtype=np.uint8))
    check(buffer.newest == 3 and buffer.filled == 12, "ring wrapped: newest row is 3")
    check(at(10) == (round(100 * (1 + 0.9 + 0.81), 4), 1, 0.729), "a return across the wrap (rows 10, 11, 0; estimate from row 1)")
    check(at(2) == (100.0, 3, 0.9), "a return never runs from the newest row into the oldest")

    # Random streams against the one-at-a-time reference.
    rng = np.random.default_rng(0)
    worst = 0.0
    for trial in range(20):
        rows, envs, n = int(rng.integers(8, 60)), int(rng.integers(1, 5)), int(rng.integers(1, 7))
        buffer = ReplayBuffer(rows, envs, 1)
        for _ in range(int(rng.integers(1, 6))):
            count = int(rng.integers(1, rows + 1))
            buffer.add(rng.normal(size=(count, envs, 1)).astype(np.float32), rng.integers(12, size=(count, envs)),
                       rng.normal(size=(count, envs)).astype(np.float32),
                       rng.choice([GO, GO, GO, GO, END, CUT], size=(count, envs)).astype(np.uint8))
        row, env = rng.integers(buffer.filled, size=1000), rng.integers(envs, size=1000)
        ret, boot_row, boot = buffer.n_step(row, env, n, 0.97)
        for k in range(1000):
            want = n_step_one(buffer, int(row[k]), int(env[k]), n, 0.97)
            worst = max(worst, abs(ret[k] - want[0]), abs(boot[k] - want[2]))
            if want[2] > 0 and boot_row[k] != want[1]:
                worst = np.inf
    check(worst < 1e-4, f"20 000 random samples (ring sizes 8..60, n 1..6, endings and cut-offs) match the reference (worst gap {worst:.1e})")


# ---- 3. replay sampling -----------------------------------------------------

def test_sampling() -> None:
    rng = np.random.default_rng(3)
    buffer = ReplayBuffer(rows=50, envs=4, obs_size=3)
    # Each observation carries its own (write number, env) so samples can be traced.
    stops = rng.choice([GO, GO, GO, END, CUT], size=(70, 4)).astype(np.uint8)
    obs = np.zeros((70, 4, 3), dtype=np.float32)
    obs[:, :, 0], obs[:, :, 1] = np.arange(70)[:, None], np.arange(4)[None, :]
    reward = rng.normal(size=(70, 4)).astype(np.float32)
    buffer.add(obs[:40], np.zeros((40, 4), dtype=np.int64), reward[:40], stops[:40])
    buffer.add(obs[40:], np.zeros((30, 4), dtype=np.int64), reward[40:], stops[40:])   # wraps: writes 20..69 are held

    batch = buffer.sample(40_000, 3, 0.99, rng)
    written, env = batch["obs"][:, 0].astype(int), batch["obs"][:, 1].astype(int)
    check(written.min() >= 20, "only rows still in the ring are drawn (the 20 oldest were overwritten)")
    check((written != 69).all(), "the newest row is never the start of a sample")
    check((stops[written, env] != CUT).all(), "a cut-off decision is never the start of a sample")
    allowed = (stops[20:69] != CUT).sum()
    counts = np.zeros((70, 4)); np.add.at(counts, (written, env), 1)
    seen = (counts > 0).sum()
    expected = 40_000 / allowed
    spread = counts[counts > 0]
    check(seen == allowed, f"every allowed decision is drawn ({seen} of {allowed})")
    check(spread.min() > 0.6 * expected and spread.max() < 1.4 * expected, f"evenly: {spread.min():.0f}..{spread.max():.0f} draws each, {expected:.0f} expected")
    # The estimate's observation is n rows on in the SAME environment (or earlier at an edge).
    boot_written, boot_env = batch["next_obs"][:, 0].astype(int), batch["next_obs"][:, 1].astype(int)
    live = batch["boot_discount"] > 0
    check((boot_env[live] == env[live]).all() and ((boot_written - written)[live] >= 1).all() and ((boot_written - written)[live] <= 3).all(),
          "the next observation is 1..3 decisions later in the same environment")
    full = np.isclose(batch["boot_discount"], 0.99 ** 3)
    check(((boot_written - written)[full] == 3).all(), "and exactly 3 later where the discount is gamma^3")

    exact = rng.uniform(-3, 3, size=100_000).astype(np.float32)
    check(np.abs(exact.astype(np.float16).astype(np.float32) - exact).max() < 1e-3, "float16 storage changes an observation value by under 0.001")
    check(np.allclose(epsilons(0.1, 8), [0.1 ** (1 + 2 * k / 7) for k in range(8)]) and epsilons(1.0, 8) == [1.0] * 8,
          "per-simulator epsilons: 0.1 .. 0.001 at eps 0.1, all 1 at eps 1")


# ---- 4. network and actor file ----------------------------------------------

def actor_file_best_action(path: Path, obs: np.ndarray) -> np.ndarray:
    """Read an actor file and pick actions exactly as iqn_server.mjs does."""
    raw = path.read_bytes()
    magic, obs_size, hidden, head, K, actions = np.frombuffer(raw[:24], dtype=np.int32)
    assert magic == MAGIC
    values = np.frombuffer(raw[24:], dtype=np.float32)
    o = 0
    def take(*shape):
        nonlocal o
        part = values[o:o + int(np.prod(shape))].reshape(shape); o += part.size
        return part
    w1, b1, w2, b2 = take(hidden, obs_size), take(hidden), take(hidden, hidden), take(hidden)
    phi = take(K, hidden)
    wa1, ba1, wa2, ba2 = take(head, hidden), take(head), take(actions, head), take(actions)
    assert o == values.size
    leaky = lambda v: np.where(v > 0, v, 0.01 * v)
    h = leaky(leaky(obs @ w1.T + b1) @ w2.T + b2)                       # (B, hidden)
    scores = sum(leaky((h * phi[k]) @ wa1.T + ba1) @ wa2.T + ba2 for k in range(K))
    return scores.argmax(axis=1)


def test_network() -> None:
    torch.manual_seed(0)
    net = IQN(352, 12)
    # Give every layer sizeable weights so the best action really depends on the input.
    with torch.no_grad():
        for p in net.parameters():
            p.mul_(3.0)
    obs = torch.randn(200, 352)
    values = net(obs, torch.rand(200, 5))
    check(values.shape == (200, 5, 12), "forward: (batch, fractions, actions)")
    x = net.trunk(obs).unsqueeze(1) * net.embed(net.act_taus.expand(200, -1))
    check(torch.allclose(net(obs, net.act_taus.expand(200, -1)).mean(-1, keepdim=True), net.value(x), atol=1e-4),
          "dueling: the mean over actions is the value branch")
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / "actor.bin"
        export_actor(net, path)
        from_file = actor_file_best_action(path, obs.numpy())
    from_net = net.q_values(obs).argmax(dim=1).numpy()
    check((from_file == from_net).all() and len(set(from_net)) >= 6,
          f"actor file gives the network's best action on 200 inputs ({len(set(from_net))} different actions among them)")
    check(ACT_FRACTIONS == 8, "8 acting fractions")


# ---- 5. learning ------------------------------------------------------------

def test_learning() -> None:
    """Two observations, two actions, gamma 0.9, 1-step.
         state A: action 0 earns 1 and ends. Action 1 earns 0 and leads to B.
         state B: either action ends; it earns 0 or 4 with equal chance.
       So Q(B) = 2 on average with a spread of 0 / 4, Q(A, 0) = 1,
       Q(A, 1) = 0.9 x 2 = 1.8, and the best action at A is 1."""
    torch.manual_seed(0)
    rng = np.random.default_rng(0)
    args = parse_args(["--hidden", "32", "--head", "32", "--lr", "3e-3", "--target-rate", "0.02", "--quantiles", "16", "--target-quantiles", "16"])
    learner = Learner(2, 2, args, torch.device("cpu"))
    A, B = np.array([1, 0], dtype=np.float32), np.array([0, 1], dtype=np.float32)
    for _ in range(1500):
        from_a = rng.random(64) < 0.5
        action = rng.integers(2, size=64)
        ret = np.where(from_a, (action == 0).astype(np.float32), 4.0 * rng.integers(2, size=64)).astype(np.float32)
        boot = np.where(from_a & (action == 1), 0.9, 0.0).astype(np.float32)
        stats = learner.update({"obs": np.where(from_a[:, None], A, B), "action": action, "ret": ret,
                                "next_obs": np.tile(B, (64, 1)), "boot_discount": boot})
    with torch.no_grad():
        q = learner.net.q_values(torch.tensor(np.stack([A, B]))).numpy()
        low, high = learner.net(torch.tensor(B[None]), torch.tensor([[0.2, 0.8]]))[0, :, 0].numpy()
    check(np.isfinite(stats["loss"]), "loss finite after 1500 steps")
    check(abs(q[0, 0] - 1) < 0.25 and abs(q[0, 1] - 1.8) < 0.35 and abs(q[1].mean() - 2) < 0.35,
          f"values learned: Q(A,0) {q[0, 0]:.2f} (1), Q(A,1) {q[0, 1]:.2f} (1.8), Q(B) {q[1].mean():.2f} (2)")
    check(low < 0.8 and high > 3.2, f"and the spread at B: 20% point {low:.2f} (0), 80% point {high:.2f} (4)")


if __name__ == "__main__":
    test_quantile_loss()
    test_n_step()
    test_sampling()
    test_network()
    test_learning()
    print("all unit checks passed")
