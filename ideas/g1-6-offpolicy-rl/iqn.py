"""The value network of the off-policy learner, and its loss.

IQN (implicit quantile network, Dabney et al. 2018), the method the Linesight
project used to beat human records in Trackmania.

A plain Q-network answers "how much reward is still to come if I press this
now?" with one number per action: the average over everything that might
happen. IQN answers with the whole spread. It is handed a fraction tau between
0 and 1 as an extra input and returns, per action, the value that the outcome
falls below with probability tau (tau = 0.1: a bad outcome; 0.9: a good one).
Asked at several fractions and averaged, it gives the same average a
Q-network would; that average is what the car drives by.

Why bother with the spread here: the same keys at the same place can end in
a clean exit or in a wall, depending on what the next (partly random, while
exploring) decisions are. A network trained on the average alone has to fit a
target that jumps between "30 more reward" and "0, crashed"; one trained on
quantiles fits each part of the spread separately, which measurably steadies
learning (the IQN and Rainbow papers; Linesight's own ablations).

Shapes below: B = batch, N = fractions per example, A = actions.
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

# Fractions the ACTING network is asked at: the midpoints of K equal slices of
# 0..1. Fixed, so that the Node servers need no cosines: export_actor writes
# the network's embedding of these K fractions as plain numbers. K = 8: the
# acting cost per decision grows with K, and Linesight acts with 8 as well.
ACT_FRACTIONS = 8
# First int32 of an actor file, 'IQN1' (see loadNet in iqn_server.mjs).
MAGIC = 0x49514E31


class IQN(nn.Module):
    """observation -> trunk (2 layers) -> x fraction embedding -> two heads.

        trunk      obs -> hidden -> hidden                       what the car sees
        embedding  cos(pi * i * tau), i = 1..64 -> hidden, ReLU  which part of the spread
        product    trunk * embedding, element by element
        advantage  -> head -> A      how much better each action is than the others
        value      -> head -> 1      how good the situation is whatever is pressed
        output     value + advantage - mean(advantage)           ("dueling")

    The dueling split matters at 50 ms per decision: the difference between
    two actions' values is small next to the value itself (one decision moves
    the car 3 units out of the 300 the value counts), and with a separate
    branch for the common part the action branch only has to learn the small
    differences.
    """

    def __init__(self, obs_size: int, num_actions: int, hidden: int = 256, head: int = 128, embed: int = 64):
        super().__init__()
        self.obs_size, self.num_actions, self.hidden, self.head = obs_size, num_actions, hidden, head
        self.trunk = nn.Sequential(
            nn.Linear(obs_size, hidden), nn.LeakyReLU(0.01),
            nn.Linear(hidden, hidden), nn.LeakyReLU(0.01),
        )
        self.fraction = nn.Linear(embed, hidden)
        self.advantage = nn.Sequential(nn.Linear(hidden, head), nn.LeakyReLU(0.01), nn.Linear(head, num_actions))
        self.value = nn.Sequential(nn.Linear(hidden, head), nn.LeakyReLU(0.01), nn.Linear(head, 1))
        self.register_buffer("frequencies", math.pi * torch.arange(1, embed + 1, dtype=torch.float32))
        self.register_buffer("act_taus", (torch.arange(ACT_FRACTIONS, dtype=torch.float32) + 0.5) / ACT_FRACTIONS)

    def embed(self, taus: torch.Tensor) -> torch.Tensor:
        """Fractions (...,) -> their embedding (..., hidden)."""
        return torch.relu(self.fraction(torch.cos(taus.unsqueeze(-1) * self.frequencies)))

    def forward(self, obs: torch.Tensor, taus: torch.Tensor) -> torch.Tensor:
        """obs (B, obs_size), taus (B, N) -> quantile values (B, N, A)."""
        x = self.trunk(obs).unsqueeze(1) * self.embed(taus)
        advantage = self.advantage(x)
        return self.value(x) + advantage - advantage.mean(dim=-1, keepdim=True)

    def q_values(self, obs: torch.Tensor, taus: torch.Tensor | None = None) -> torch.Tensor:
        """Average value per action, (B, A). With no `taus`, at the fixed
        acting fractions, which is exactly what the Node servers compute."""
        if taus is None:
            taus = self.act_taus.expand(obs.shape[0], -1)
        return self.forward(obs, taus).mean(dim=1)


def quantile_huber_loss(predicted: torch.Tensor, taus: torch.Tensor, target: torch.Tensor, kappa: float = 1.0) -> torch.Tensor:
    """The quantile-regression loss with a Huber centre. One number per example.

        predicted  (B, N)   the network's value at each of its N fractions
        taus       (B, N)   those fractions
        target     (B, M)   M samples of what the value should have been
                            (reward so far + the target network's values)

    For every pair (fraction i, target sample j) take the error
        d = target_j - predicted_i
    and charge  |tau_i - [d < 0]| x huber(d) / kappa.
    The weight is what makes it a QUANTILE: a prediction for tau = 0.9 is
    charged 0.9 for each sample above it and only 0.1 for each below, so it
    settles where 90% of the samples are below it. huber(d) is d^2 / 2 within
    +-kappa and straight-line beyond, so one wild target cannot dominate.
    Averaged over the M samples, summed over the N fractions (as in the paper).
    """
    error = target.unsqueeze(1) - predicted.unsqueeze(2)                       # (B, N, M)
    size = error.abs()
    huber = torch.where(size <= kappa, 0.5 * error.pow(2), kappa * (size - 0.5 * kappa))
    weight = (taus.unsqueeze(2) - (error.detach() < 0).float()).abs()
    return (weight * huber / kappa).mean(dim=2).sum(dim=1)


def export_actor(net: IQN, path: str | Path) -> None:
    """Write what a Node server needs to pick the best action (layout at
    loadNet in iqn_server.mjs). The value branch is left out: it adds the same
    number to every action. Written under a temporary name and renamed, so a
    server never reads half a file; the rename is retried because Windows
    refuses it while another program has the file open (see replace_with_retry
    in rl/train_ppo.py, which lost a run to that)."""
    import time

    path = Path(path)
    with torch.no_grad():
        phi = net.embed(net.act_taus)                                          # (K, hidden)
        floats = [net.trunk[0].weight, net.trunk[0].bias, net.trunk[2].weight, net.trunk[2].bias, phi,
                  net.advantage[0].weight, net.advantage[0].bias, net.advantage[2].weight, net.advantage[2].bias]
        body = np.concatenate([f.detach().cpu().numpy().astype(np.float32).ravel() for f in floats])
    header = np.array([MAGIC, net.obs_size, net.hidden, net.head, ACT_FRACTIONS, net.num_actions], dtype=np.int32)
    temporary = path.with_suffix(".tmp")
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(temporary, "wb") as out:
        out.write(header.tobytes())
        out.write(body.tobytes())
    for attempt in range(50):
        try:
            temporary.replace(path)
            return
        except PermissionError:
            if attempt == 49:
                raise
            time.sleep(0.1)
