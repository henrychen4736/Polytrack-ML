"""iqn.py, replay.py and the Learner without a simulator. CPU, toy sizes.

Everything is compared with something written here from the README's and the
docstrings' description, not with the code under test:

  quantile Huber loss   a scalar loop over every (fraction, sample) pair, and
                        cases worked by hand
  n-step returns        (a) a one-sample-at-a-time walk over the buffer's
                        arrays, and (b) a "ground truth" that never looks at
                        the buffer at all: episodes are generated as plain
                        Python lists, written into the buffer in chunks of
                        random size until the ring has wrapped several times,
                        and what a sample SHOULD be is worked out from the
                        lists (each observation carries its own serial number,
                        so the "next observation" can be identified)
  sampling              every sampled start is one the lists say is allowed
  the actor file        parsed and evaluated here with numpy from the layout
                        in iqn_server.mjs's comment, against PyTorch
  Learner.update        two problems with known answers
"""
from __future__ import annotations

import math
import struct
import tempfile
from pathlib import Path

import numpy as np

from common import check, finish

import torch

from iqn import IQN, ACT_FRACTIONS, MAGIC, export_actor, quantile_huber_loss
from replay import ReplayBuffer, GO, END, CUT
from train_iqn import Learner, epsilons, parse_args

torch.manual_seed(0)
torch.set_num_threads(2)


# ---- quantile Huber loss ---------------------------------------------------------------
def loss_by_hand(predicted, taus, target, kappa=1.0):
    """One example. For every fraction i and target sample j:
    d = target_j - predicted_i;  |tau_i - [d < 0]| x huber(d) / kappa;
    mean over the samples, sum over the fractions (README / the IQN paper)."""
    total = 0.0
    for p, tau in zip(predicted, taus):
        row = 0.0
        for t in target:
            d = t - p
            huber = 0.5 * d * d if abs(d) <= kappa else kappa * (abs(d) - 0.5 * kappa)
            row += abs(tau - (1.0 if d < 0 else 0.0)) * huber / kappa
        total += row / len(target)
    return total


def loss_of(predicted, taus, target, kappa=1.0):
    return quantile_huber_loss(torch.tensor([predicted], dtype=torch.float64), torch.tensor([taus], dtype=torch.float64),
                               torch.tensor([target], dtype=torch.float64), kappa).item()


# One fraction 0.9 predicting 0, one sample at +0.5: inside the Huber centre, 0.9 x 0.5 x 0.25 = 0.1125.
check("loss: tau 0.9, sample 0.5 above the prediction -> 0.9 x 0.125 = 0.1125", abs(loss_of([0.0], [0.9], [0.5]) - 0.1125) < 1e-12)
# The same sample BELOW the prediction is charged 1 - 0.9.
check("loss: tau 0.9, sample 0.5 below -> 0.1 x 0.125 = 0.0125", abs(loss_of([0.0], [0.9], [-0.5]) - 0.0125) < 1e-12)
# Beyond kappa it is a straight line: |d| = 3 -> 1 x (3 - 0.5) = 2.5.
check("loss: beyond the Huber threshold it is linear (d = 3 -> 0.9 x 2.5 = 2.25; d = -3 -> 0.25)",
      abs(loss_of([0.0], [0.9], [3.0]) - 2.25) < 1e-12 and abs(loss_of([0.0], [0.9], [-3.0]) - 0.25) < 1e-12)
check("loss: exactly at the threshold both branches agree (d = 1 -> 0.5 x tau)", abs(loss_of([0.0], [0.3], [1.0]) - 0.15) < 1e-12)
check("loss: zero when prediction and sample coincide", loss_of([2.0, 2.0], [0.2, 0.7], [2.0]) == 0.0)
# Mean over samples, sum over fractions: two fractions (0.25, 0.75) at 0, samples -2 and +2.
#   tau 0.25: (0.75 x 1.5 + 0.25 x 1.5) / 2 = 0.75;  tau 0.75: the same = 0.75;  sum 1.5
check("loss: mean over the samples, SUM over the fractions (two fractions, samples -2 and +2 -> 1.5)", abs(loss_of([0.0, 0.0], [0.25, 0.75], [-2.0, 2.0]) - 1.5) < 1e-12)
# kappa: d = 3, kappa = 2 -> 2 x (3 - 1) = 4, / kappa = 2, x 0.5 = 1.0
check("loss: kappa = 2 (d = 3, tau 0.5 -> 0.5 x 4 / 2 = 1.0)", abs(loss_of([0.0], [0.5], [3.0], kappa=2.0) - 1.0) < 1e-12)
rng = np.random.default_rng(1)
worst = 0.0
for trial in range(300):
    n, m = int(rng.integers(1, 9)), int(rng.integers(1, 9))
    kappa = float(rng.choice([0.5, 1.0, 2.5]))
    predicted, taus, target = rng.normal(0, 2, n), rng.random(n), rng.normal(0, 2, m)
    if trial % 10 == 0:
        target[0] = predicted[0]                 # d exactly 0
    worst = max(worst, abs(loss_of(predicted.tolist(), taus.tolist(), target.tolist(), kappa) - loss_by_hand(predicted, taus, target, kappa)))
check("loss: 300 random cases (1 to 8 fractions and samples, three kappas, exact ties) equal the pair-by-pair loop", worst < 1e-12, f"worst gap {worst}")
batch_p, batch_tau, batch_t = rng.normal(0, 2, (5, 4)), rng.random((5, 4)), rng.normal(0, 2, (5, 7))
got = quantile_huber_loss(torch.tensor(batch_p), torch.tensor(batch_tau), torch.tensor(batch_t)).numpy()
want = [loss_by_hand(batch_p[b], batch_tau[b], batch_t[b]) for b in range(5)]
check("loss: a batch gives one number per example, each its own example's loss", got.shape == (5,) and np.allclose(got, want, atol=1e-12))
# The gradient must not flow through the weight's indicator, and must pull each fraction towards its quantile.
p = torch.zeros(1, 3, requires_grad=True)
quantile_huber_loss(p, torch.tensor([[0.1, 0.5, 0.9]]), torch.tensor([[10.0]])).sum().backward()
check("loss: with the sample far above, the pull upwards is proportional to tau (gradients -0.1, -0.5, -0.9)", np.allclose(p.grad.numpy(), [[-0.1, -0.5, -0.9]], atol=1e-7), str(p.grad))
# Minimising it finds quantiles: samples 0..100, fractions 0.1 / 0.5 / 0.9.
values = torch.zeros(1, 3, requires_grad=True)
optimizer = torch.optim.Adam([values], lr=0.5)
samples = torch.arange(0, 101, dtype=torch.float32).unsqueeze(0)
for _ in range(1500):
    optimizer.zero_grad()
    quantile_huber_loss(values, torch.tensor([[0.1, 0.5, 0.9]]), samples).sum().backward()
    optimizer.step()
check("loss: minimised on the numbers 0..100 it settles near the 10 / 50 / 90% points", np.allclose(values.detach().numpy(), [[10, 50, 90]], atol=1.5), str(values.detach().numpy()))


# ---- n-step returns: hand-worked ---------------------------------------------------------
def buffer_from(rewards, stops, rows=None, envs=1, obs=None):
    """A one-environment buffer holding these rows; observation of row r is [r] unless given."""
    rows = rows or len(rewards)
    b = ReplayBuffer(rows, envs, 1, obs_dtype=np.float32)
    count = len(rewards)
    o = np.arange(count, dtype=np.float32).reshape(count, 1, 1) if obs is None else np.asarray(obs, dtype=np.float32).reshape(count, 1, 1)
    b.add(o, np.zeros((count, 1), dtype=np.int64), np.asarray(rewards, dtype=np.float32).reshape(count, 1), np.asarray(stops, dtype=np.uint8).reshape(count, 1))
    return b


def one(b, row, n=3, gamma=0.5):
    ret, boot_row, boot = b.n_step(np.array([row]), np.array([0]), n, gamma)
    return float(ret[0]), int(boot_row[0]), float(boot[0])


G = 0.5
b = buffer_from([1, 2, 4, 8, 16, 32, 64, 128], [GO] * 8)
check("n-step: the plain case, 3 rewards then the estimate from 3 rows on (1 + 2/2 + 4/4 = 3, row 3, x 1/8)", one(b, 0) == (3.0, 3, 0.125), str(one(b, 0)))
check("n-step: n = 1 (the reward, the next row, x gamma)", one(b, 2, n=1) == (4.0, 3, 0.5))
# Rows 0..7 written, row 7 is the newest: nothing is known after its observation.
check("n-step: reaching the newest row after 2 rewards -> estimate from ITS observation, x gamma^2, its reward not collected (16 + 32/2 = 32, row 7... from row 5: 32 + 64/2 = 64, row 7, x 1/4)", one(b, 5) == (64.0, 7, 0.25), str(one(b, 5)))
check("n-step: one row before the newest -> one reward, estimate from the newest, x gamma", one(b, 6) == (64.0, 7, 0.5), str(one(b, 6)))
check("n-step: four rows before the newest is still the plain case (boot row = the newest)", one(b, 4) == (16 + 16 + 16, 7, 0.125), str(one(b, 4)))
b = buffer_from([1, 2, 4, 8, 16, 32, 64, 128], [GO, END, GO, GO, GO, GO, GO, GO])
check("n-step: the episode ends for good on the 2nd decision -> its reward counts, nothing is estimated (1 + 2/2 = 2, x 0)", one(b, 0)[0] == 2.0 and one(b, 0)[2] == 0.0, str(one(b, 0)))
check("n-step: starting ON the ending decision -> its reward alone, x 0", one(b, 1)[0] == 2.0 and one(b, 1)[2] == 0.0)
check("n-step: the row after an ending starts a new episode normally", one(b, 2) == (4 + 4 + 4, 5, 0.125))
b = buffer_from([1, 2, 4, 8, 16, 32, 64, 128], [GO, GO, END, GO, GO, GO, GO, GO])
check("n-step: ending on the 3rd decision (1 + 1 + 1 = 3, x 0): rewards of the next episode are not added", one(b, 0)[0] == 3.0 and one(b, 0)[2] == 0.0, str(one(b, 0)))
b = buffer_from([1, 2, 4, 8, 16, 32, 64, 128], [GO, CUT, GO, GO, GO, GO, GO, GO])
check("n-step: a time-limit cut-off one row on -> one reward, estimate from the cut-off row's own observation x gamma; the cut-off row's reward is NOT collected", one(b, 0) == (1.0, 1, 0.5), str(one(b, 0)))
b = buffer_from([1, 2, 4, 8, 16, 32, 64, 128], [GO, GO, CUT, GO, GO, GO, GO, GO])
check("n-step: a cut-off two rows on -> two rewards (1 + 1), estimate from that row x gamma^2", one(b, 0) == (2.0, 2, 0.25), str(one(b, 0)))
check("n-step: a cut-off never lets a return run into the next episode", one(b, 1) == (2.0, 2, 0.5), str(one(b, 1)))
# The ring. 5 rows; write 8: rows hold decisions [5, 6, 7, 3, 4]; the newest is row 2 (decision 7), the oldest row 3.
b = ReplayBuffer(5, 1, 1, obs_dtype=np.float32)
for start in (0, 3, 6):
    count = 3 if start < 6 else 2
    b.add(np.arange(start, start + count, dtype=np.float32).reshape(count, 1, 1), np.zeros((count, 1), dtype=np.int64),
          (2.0 ** np.arange(start, start + count)).astype(np.float32).reshape(count, 1), np.zeros((count, 1), dtype=np.uint8))
check("ring: after 8 writes into 5 rows the newest is row 2 and the rows hold decisions 5 6 7 3 4", b.newest == 2 and b.obs[:, 0, 0].tolist() == [5, 6, 7, 3, 4] and len(b) == 5)
check("ring: a return from the last array row carries on at row 0 (decisions 4, 5, 6: 16 + 16 + 16, estimate from decision 7 in row 2)", one(b, 4) == (48.0, 2, 0.125), str(one(b, 4)))
check("ring: a return from decision 6 stops at the newest (decision 7) and does not run on into the OLDEST row (decision 3)", one(b, 1) == (64.0, 2, 0.5), str(one(b, 1)))
check("ring: from the oldest row (decision 3: 8 + 8 + 8, estimate from decision 6 in row 1)", one(b, 3) == (24.0, 1, 0.125), str(one(b, 3)))
try:
    ReplayBuffer(4, 1, 1).add(np.zeros((5, 1, 1)), np.zeros((5, 1)), np.zeros((5, 1)), np.zeros((5, 1)))
    check("add: more rows in one write than the buffer holds is refused", False)
except ValueError:
    check("add: more rows in one write than the buffer holds is refused", True)


# ---- n-step returns and sampling against ground truth kept outside the buffer -----------------
def stream(rng, length):
    """One simulator's history: [(serial, reward, stop)] with episodes of random length ending END or CUT."""
    out, left = [], int(rng.integers(1, 9))
    for i in range(length):
        left -= 1
        stop = GO
        if left == 0:
            stop = END if rng.random() < 0.6 else CUT
            left = int(rng.integers(1, 9))
        out.append((i, float(rng.integers(1, 100)), stop))
    return out


def truth(history, t, newest_t, n, gamma):
    """What a sample starting at time t of this simulator should be, from the lists alone:
    (return, serial of the observation to estimate from or None, discount on the estimate)."""
    ret, discount = 0.0, 1.0
    for k in range(n):
        u = t + k
        if history[u][2] == CUT or u == newest_t:      # nothing known past this observation
            return ret, u, discount
        ret += discount * history[u][1]
        if history[u][2] == END:
            return ret, None, 0.0
        discount *= gamma
    return ret, t + n, discount


def ground_truth_trial(seed, rows, envs, total, n, gamma):
    """Returns (problems, draws, starts seen, starts allowed)."""
    rng = np.random.default_rng(seed)
    histories = [stream(rng, total) for _ in range(envs)]
    buf = ReplayBuffer(rows, envs, 2, obs_dtype=np.float32)
    written, problems, seen = 0, [], set()
    while written < total:
        count = min(int(rng.integers(1, rows + 1)), total - written)
        chunk = range(written, written + count)
        # observation = [serial, simulator]: enough to say exactly which decision a row is
        obs = np.array([[[histories[e][t][0], e] for e in range(envs)] for t in chunk], dtype=np.float32)
        buf.add(obs, np.array([[histories[e][t][0] % 7 for e in range(envs)] for t in chunk]),
                np.array([[histories[e][t][1] for e in range(envs)] for t in chunk], dtype=np.float32),
                np.array([[histories[e][t][2] for e in range(envs)] for t in chunk], dtype=np.uint8))
        written += count
        if written < 2:
            continue
        newest_t, oldest_t = written - 1, max(0, written - rows)
        batch = buf.sample(400, n, gamma, rng)
        for i in range(400):
            t, e = int(batch["obs"][i, 0]), int(batch["obs"][i, 1])
            seen.add((written, t, e))
            if not (oldest_t <= t <= newest_t):
                problems.append(f"sampled decision {t} which the ring no longer holds ({oldest_t}..{newest_t})")
                continue
            if t == newest_t or histories[e][t][2] == CUT:
                problems.append(f"sampled an invalid start: decision {t} of simulator {e} ({'newest row' if t == newest_t else 'cut-off row'})")
                continue
            ret, boot_t, boot = truth(histories[e], t, newest_t, n, gamma)
            if int(batch["action"][i]) != t % 7:
                problems.append(f"decision {t}: action {batch['action'][i]} is not its own")
            if abs(float(batch["ret"][i]) - ret) > 1e-3 * max(1.0, abs(ret)):
                problems.append(f"decision {t} sim {e} (stops {[h[2] for h in histories[e][t:t + n]]}, newest {newest_t}): return {batch['ret'][i]}, should be {ret}")
            if abs(float(batch["boot_discount"][i]) - boot) > 1e-6:
                problems.append(f"decision {t} sim {e}: estimate weight {batch['boot_discount'][i]}, should be {boot}")
            if boot_t is not None and (int(batch["next_obs"][i, 0]) != boot_t or int(batch["next_obs"][i, 1]) != e):
                problems.append(f"decision {t} sim {e}: estimates from decision {int(batch['next_obs'][i, 0])} of sim {int(batch['next_obs'][i, 1])}, should be decision {boot_t} of sim {e}")
    newest_t, oldest_t = total - 1, max(0, total - rows)
    allowed = {(total, t, e) for e in range(envs) for t in range(oldest_t, newest_t) if histories[e][t][2] != CUT}
    last = {s for s in seen if s[0] == total}
    return problems, len(seen), last, allowed


all_problems, draws = [], 0
for seed, (rows, envs, total, n, gamma) in enumerate([(16, 3, 200, 3, 0.9), (7, 2, 150, 3, 0.5), (32, 4, 400, 5, 0.99), (5, 1, 120, 1, 0.9), (64, 2, 60, 3, 0.9), (9, 3, 180, 4, 0.8)]):
    problems, count, last, allowed = ground_truth_trial(seed, rows, envs, total, n, gamma)
    all_problems += problems
    draws += count
check("ground truth: six rings (5 to 64 rows, 1 to 4 simulators, n = 1 to 5) filled in random chunks until they wrap many times; every sampled "
      "return, estimate weight and next observation equals what the episode lists say", not all_problems, f"{len(all_problems)} problems, first:\n" + "\n".join(all_problems[:6]))
check("ground truth: no sample ever starts on a cut-off row, on the newest row, or on a decision the ring has overwritten", not [p for p in all_problems if "invalid start" in p or "no longer holds" in p])
# Coverage and evenness on one full ring.
rng = np.random.default_rng(7)
history = [stream(rng, 40) for _ in range(3)]
buf = ReplayBuffer(40, 3, 2, obs_dtype=np.float32)
buf.add(np.array([[[history[e][t][0], e] for e in range(3)] for t in range(40)], dtype=np.float32), np.zeros((40, 3), dtype=np.int64),
        np.array([[history[e][t][1] for e in range(3)] for t in range(40)], dtype=np.float32), np.array([[history[e][t][2] for e in range(3)] for t in range(40)], dtype=np.uint8))
allowed = {(t, e) for e in range(3) for t in range(39) if history[e][t][2] != CUT}
drawn = buf.sample(40_000, 3, 0.9, rng)["obs"].astype(int)
counts = {}
for t, e in drawn:
    counts[(int(t), int(e))] = counts.get((int(t), int(e)), 0) + 1
expected = 40_000 / len(allowed)
check(f"sampling: 40000 draws hit exactly the {len(allowed)} allowed starts, each about equally often (within 25% of {expected:.0f})",
      set(counts) == allowed and all(abs(c - expected) < 0.25 * expected for c in counts.values()),
      f"not allowed but drawn: {sorted(set(counts) - allowed)[:5]}; never drawn: {sorted(allowed - set(counts))[:5]}; range {min(counts.values())}..{max(counts.values())}")
check("replay: observations are stored as float16 by default (the README's 0.7 GB per million decisions) and handed out as float32",
      ReplayBuffer(4, 2, 352).obs.dtype == np.float16 and ReplayBuffer(4, 2, 352).obs.nbytes == 4 * 2 * 352 * 2 and drawn.dtype != np.float16)
try:
    ReplayBuffer(8, 1, 1).sample(4, 3, 0.9, rng)
    check("sampling: an empty buffer refuses to sample", False)
except ValueError:
    check("sampling: an empty buffer refuses to sample", True)


# ---- cut(): the mark the trainer sets when it takes a simulator away for an evaluation lap -----
b = buffer_from([1, 2, 4, 8], [GO, GO, GO, GO], rows=8)
b.cut(0)
check("cut: marks the newest row of that simulator as a cut-off", b.stop[3, 0] == CUT and b.stop[:3, 0].tolist() == [GO, GO, GO])
b.add(np.full((2, 1, 1), 99, dtype=np.float32), np.zeros((2, 1), dtype=np.int64), np.full((2, 1), 1000, dtype=np.float32), np.zeros((2, 1), dtype=np.uint8))
check("cut: a return that reaches the marked row stops there and collects nothing of what was written after it (from row 1: 2 + 4/2 = 4, estimate from row 3 x 1/4; the 1000s after it are not touched)", one(b, 1) == (4.0, 3, 0.25), str(one(b, 1)))
b = buffer_from([1, 2, 4, 8], [GO, GO, GO, END], rows=8)
b.cut(0)
check("cut: a row on which the episode really ended stays an ending", b.stop[3, 0] == END)
b = ReplayBuffer(4, 2, 1)
b.cut(0)
check("cut: on an empty buffer it does nothing", b.stop.sum() == 0)


# ---- the network and the actor file -----------------------------------------------------------
def read_actor(path):
    """Parse an actor file by the layout given in iqn_server.mjs and return a
    function obs -> the 12 (or 60) scores, in float64 numpy. Written from the
    comment there: six int32, then w1, b1, w2, b2, phi [K x hidden], wa1, ba1, wa2, ba2."""
    raw = Path(path).read_bytes()
    magic, obs_size, hidden, head, K, actions = struct.unpack("<6i", raw[:24])
    f = np.frombuffer(raw[24:], dtype="<f4").astype(np.float64)
    sizes = [hidden * obs_size, hidden, hidden * hidden, hidden, K * hidden, head * hidden, head, actions * head, actions]
    assert sum(sizes) == len(f), (sum(sizes), len(f))
    parts, o = [], 0
    for s in sizes:
        parts.append(f[o:o + s]); o += s
    w1, b1, w2, b2, phi, wa1, ba1, wa2, ba2 = parts
    w1, w2, phi, wa1, wa2 = w1.reshape(hidden, obs_size), w2.reshape(hidden, hidden), phi.reshape(K, hidden), wa1.reshape(head, hidden), wa2.reshape(actions, head)
    leaky = lambda x: np.where(x > 0, x, 0.01 * x)

    def scores(obs):
        h = leaky(w2 @ leaky(w1 @ obs + b1) + b2)
        return np.mean([wa2 @ leaky(wa1 @ (h * phi[k]) + ba1) + ba2 for k in range(K)], axis=0)
    return {"magic": magic, "obs_size": obs_size, "hidden": hidden, "head": head, "K": K, "actions": actions}, scores


with tempfile.TemporaryDirectory() as folder:
    for obs_size, actions, hidden, head in [(352, 12, 30, 14), (352, 60, 256, 128), (21, 12, 18, 11)]:
        net = IQN(obs_size, actions, hidden, head)
        with torch.no_grad():
            # A new network barely prefers anything: give the action branch
            # weights large enough that the best action depends on the input.
            for layer in (net.advantage[0], net.advantage[2]):
                layer.weight.normal_(0, 1.0)
                layer.bias.normal_(0, 0.1)
        path = Path(folder) / f"a{actions}_{hidden}.actor.bin"
        export_actor(net, path)
        header, scores = read_actor(path)
        obs = torch.randn(300, obs_size)
        with torch.no_grad():
            q = net.q_values(obs).double().numpy()
        mine = np.array([scores(o) for o in obs.double().numpy()])
        # The file leaves out the value branch, which adds the same number to every action:
        # compare after removing each row's mean.
        gap = np.abs((q - q.mean(1, keepdims=True)) - (mine - mine.mean(1, keepdims=True))).max()
        label = f"actor file ({obs_size} inputs, {actions} actions, hidden {hidden}, head {head})"
        check(f"{label}: header is magic 'IQN1', the sizes, and 8 fractions", header == {"magic": MAGIC, "obs_size": obs_size, "hidden": hidden, "head": head, "K": ACT_FRACTIONS, "actions": actions} and MAGIC == 0x49514E31, str(header))
        check(f"{label}: scores computed from the file alone equal PyTorch's action values up to the common value term (300 inputs)", gap < 1e-3 * max(1.0, np.abs(q - q.mean(1, keepdims=True)).max()), f"worst gap {gap}")
        check(f"{label}: ... and pick the same best action on all 300, of several different actions", (mine.argmax(1) == q.argmax(1)).all() and len(set(q.argmax(1).tolist())) >= 3, f"agree on {(mine.argmax(1) == q.argmax(1)).mean():.3f}, {len(set(q.argmax(1).tolist()))} different best actions")
        check(f"{label}: no .tmp file is left beside it", not path.with_suffix(".tmp").exists())

net = IQN(6, 4, 16, 8)
obs, taus = torch.randn(5, 6), torch.rand(5, 3)
z = net(obs, taus)
check("network: forward gives (batch, fractions, actions)", tuple(z.shape) == (5, 3, 4))
check("network: the acting fractions are the 8 midpoints 1/16, 3/16, ... 15/16", np.allclose(net.act_taus.numpy(), (np.arange(8) + 0.5) / 8))
check("network: q_values without fractions is the mean over those 8", torch.allclose(net.q_values(obs), net(obs, net.act_taus.expand(5, -1)).mean(1), atol=1e-6))
# Dueling: value + advantage - mean(advantage), so the mean over actions is the value branch alone.
with torch.no_grad():
    x = net.trunk(obs).unsqueeze(1) * net.embed(taus)
    check("network: dueling head, the mean over actions equals the value branch", torch.allclose(z.mean(-1, keepdim=True), net.value(x), atol=1e-5))
    by_hand = torch.relu(net.fraction(torch.cos(math.pi * torch.arange(1, 65).float() * 0.3)))
    check("network: the fraction embedding is ReLU(linear(cos(pi i tau))), i = 1..64", torch.allclose(net.embed(torch.tensor(0.3)), by_hand, atol=1e-6))


# ---- exploration schedule ------------------------------------------------------------------------
e = epsilons(0.1, 8)
check("epsilons: 8 simulators at 0.1 run from 0.1 down to 0.001 (0.1^(1 + 2k/7))", len(e) == 8 and abs(e[0] - 0.1) < 1e-12 and abs(e[-1] - 0.001) < 1e-12 and abs(e[3] - 0.1 ** (1 + 6 / 7)) < 1e-12 and all(a > b for a, b in zip(e, e[1:])), str(e))
check("epsilons: one simulator gets the base value; base 1 means all random everywhere", epsilons(0.3, 1) == [0.3] and epsilons(1.0, 4) == [1.0] * 4)


# ---- Learner.update on problems with known answers --------------------------------------------------
def learner_for(actions, **over):
    args = parse_args(["--hidden", "32", "--head", "16", "--lr", "0.003", "--target-rate", "0.05", "--batch", "64"] + [str(x) for kv in over.items() for x in ("--" + kv[0], kv[1])])
    return Learner(2, actions, args, torch.device("cpu")), args


# A. Episodes that end at once: action 0 pays 1, action 1 pays 3 (boot discount 0). The values must be the rewards.
learner, args = learner_for(2)
rng = np.random.default_rng(0)
state = np.tile(np.array([[1.0, 0.0]], dtype=np.float32), (64, 1))
for _ in range(600):
    action = rng.integers(2, size=64)
    learner.update({"obs": state, "action": action, "ret": np.where(action == 0, 1.0, 3.0).astype(np.float32), "next_obs": state, "boot_discount": np.zeros(64, dtype=np.float32)})
with torch.no_grad():
    q = learner.net.q_values(torch.tensor(state[:1])).numpy()[0]
check("Learner: when the episode ends with the decision (estimate weight 0), each action's value becomes its reward (1 and 3)", abs(q[0] - 1) < 0.1 and abs(q[1] - 3) < 0.1, str(q))

# B. A loop: one state, one action, reward 1, estimate weight 0.5 from the same state. Value = 1 / (1 - 0.5) = 2.
learner, args = learner_for(1)
for _ in range(1500):
    stats = learner.update({"obs": state, "action": np.zeros(64, dtype=np.int64), "ret": np.ones(64, dtype=np.float32), "next_obs": state, "boot_discount": np.full(64, 0.5, dtype=np.float32)})
with torch.no_grad():
    q = learner.net.q_values(torch.tensor(state[:1])).numpy()[0]
check("Learner: reward 1 for ever with estimate weight 0.5 -> value 1 / (1 - 0.5) = 2 (the target network follows, the estimate is used)", abs(q[0] - 2) < 0.1, str(q))
check("Learner: update reports a finite loss, mean value and gradient size", all(np.isfinite(stats[k]) for k in ("loss", "q", "grad")))

# C. Double Q: the action is chosen by the online network, valued by the target network.
learner, args = learner_for(2)
with torch.no_grad():
    for p_ in learner.net.parameters(): p_.zero_()
    for p_ in learner.target.parameters(): p_.zero_()
    learner.net.advantage[2].bias.copy_(torch.tensor([0.0, 1.0]))       # online prefers action 1
    learner.target.value[2].bias.fill_(10.0)                              # target: action 0 worth 15, action 1 worth 5
    learner.target.advantage[2].bias.copy_(torch.tensor([10.0, 0.0]))
    args.lr = 0.0
learner.optimizer.param_groups[0]["lr"] = 0.0
captured = {}
import train_iqn
original = train_iqn.quantile_huber_loss
train_iqn.quantile_huber_loss = lambda predicted, taus, target: (captured.setdefault("target", target.clone()), original(predicted, taus, target))[1]
learner.update({"obs": state[:4], "action": np.zeros(4, dtype=np.int64), "ret": np.full(4, 2.0, dtype=np.float32), "next_obs": state[:4], "boot_discount": np.array([0.5, 0.5, 0.0, 0.25], dtype=np.float32)})
train_iqn.quantile_huber_loss = original
want = np.array([2 + 0.5 * 5, 2 + 0.5 * 5, 2.0, 2 + 0.25 * 5])
check("Learner: the target is return + weight x the TARGET network's value of the action the ONLINE network prefers (2 + 0.5 x 5 = 4.5, not 2 + 0.5 x 15)",
      "target" in captured and tuple(captured["target"].shape) == (4, args.target_quantiles) and np.allclose(captured["target"].numpy(), want[:, None], atol=1e-5), str(captured.get("target")))
finish()
