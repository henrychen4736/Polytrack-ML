"""Train a driving policy with PPO (Proximal Policy Optimization).

Usage (from the project root):
    python rl/train_ppo.py                       # summer1, 8 environments
    python rl/train_ppo.py --total-steps 20000   # a short trial run
    python rl/train_ppo.py --resume              # continue from the checkpoint
    python rl/train_ppo.py --resume --target-steps 7500000   # a run that can be interrupted and resumed exactly
    python rl/train_ppo.py --help                # every setting

What it does, in a loop ("update"):

  1. COLLECT. Run the current policy in N simulators at once for `--rollout`
     decisions each. The policy is a small neural network that looks at the
     observation (352 numbers, see rl/racing_env.mjs; 334 with --reference route,
     see ROUTE MODE there) and gives probabilities
     for three separate choices: W down or up, S down or up, and steering
     straight, left or right. Each is drawn from its probabilities, so the
     car tries slightly different things every time.
     A second network, the "critic", guesses how much reward is still to
     come from each situation.

  2. SCORE. For every decision, work out its "advantage": did things go
     better or worse afterwards than the critic expected? (GAE, below.)

  3. LEARN. Nudge the policy to make better-than-expected actions more
     likely and worse ones less likely, and the critic to guess better. PPO's
     particular trick is to limit how far the policy may move in one update,
     which keeps training stable.

The checkpoint (the network weights) is written to
rl/checkpoints/ppo_<track>.pt every few updates; rl/evaluate.py loads it.

GENERATED TRACKS AND ROTATION (opt-in; ideas/g2-2-track-generator). An item
of --track may be a generated .track.json file, a folder of them or a .txt
list (expand_tracks in rl/polytrack_env.py). With more tracks than
environments, --rotate-every N gives environment k every track j with
j % envs == k and has it switch to its next one every N episodes (TRACK
ROTATION in rl/env_server.mjs); without it the extra tracks would never be
driven (a warning is printed). Per-track counts and checkpoint names use the
short name (track_label). Generated tracks have no human lap: use them with
--reference route.

MEMORY (--memory, opt-in; ideas/g2-5-memory-policy). The environment keeps a
map of what earlier attempts on the same track did and shows it to the policy
as 130 more inputs (482 with the human reference, 464 with --reference
route). Attempts are grouped into sessions of 1..--session-max attempts that
share one memory. The network is the same; only its first layer is wider. To
start from a trained policy, widen it first with zero weights for the new
inputs (rl/extend_checkpoint_inputs.py; ideas/g2-5-memory-policy/
train_memory.sh does it). The progress line then also gives the finish rate
by attempt number, and --carry lets value pass from one attempt of a session
to the next (session_advantages below). Without --memory nothing here
changes.

This is a compact single-file PPO written directly in PyTorch (numpy and
torch are the only dependencies) rather than a library call, so that every
step is visible and commented here.
"""
from __future__ import annotations

import argparse
import shutil
import time
from collections import deque
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

from polytrack_env import PolytrackVecEnv, OBS_PEDAL, OBS_STEER, OBS_S, PEDAL_OPEN, expand_tracks, track_label

CHECKPOINT_DIR = Path(__file__).resolve().parent / "checkpoints"


def _layer(inputs: int, outputs: int, gain: float) -> nn.Linear:
    """A linear layer with orthogonal starting weights and zero bias, the
    usual choice for PPO. `gain` sets how large the layer's outputs start."""
    layer = nn.Linear(inputs, outputs)
    nn.init.orthogonal_(layer.weight, gain)
    nn.init.zeros_(layer.bias)
    return layer


# Observation entries read here (PEDAL_OPEN: whether W and S are read at this
# decision; OBS_PEDAL, OBS_STEER, OBS_S: the keys held at the previous one)
# are defined and checked against the server in rl/polytrack_env.py.

# The number of actions a block-decision environment reports (see BLOCK
# DECISIONS in rl/racing_env.mjs); the Agent uses it to know which kind it is.
BLOCK_ACTIONS = 1500
# Where each of a block decision's six choices sits among the network's 22
# scores: steering target (3 options), steering "at" (5), W target (2),
# W "at" (5), S target (2), S "at" (5). Same layout as GROUPS in
# rl/rollout_child.mjs and sampleAction in rl/env_server.mjs.
BLOCK_EDGES = [0, 3, 8, 10, 15, 17, 22]


def block_parts(logits: torch.Tensor):
    """Split a block-decision network's 22 scores into its six choices, in the
    order of a block decision (BLOCK_EDGES)."""
    Categorical = torch.distributions.Categorical
    return [Categorical(logits=logits[:, a:b]) for a, b in zip(BLOCK_EDGES, BLOCK_EDGES[1:])]


def held_keys(obs: torch.Tensor):
    """What each control was doing as the decision was made, read back from
    the observation: (steering 0 none / 1 left / 2 right, W 0/1, S 0/1)."""
    s = (obs[:, OBS_S] > 0.5).long()
    w = (obs[:, OBS_PEDAL] + s > 0.5).long()
    steer = torch.where(obs[:, OBS_STEER] > 0.5, 1, torch.where(obs[:, OBS_STEER] < -0.5, 2, 0))
    return steer, w, s


class Agent(nn.Module):
    """The policy ("actor") and the value estimate ("critic").

    Two separate networks of the same shape:
        observation (335) -> 256 -> 256 -> 7 action scores   (actor)
        observation (335) -> 256 -> 256 -> 1 value           (critic)

    The 7 scores ("logits") are three independent choices, each turned into
    probabilities by its own softmax:
        scores 0-1   W: up, down
        scores 2-3   S: up, down
        scores 4-6   steering: straight, left, right
    and the environment's action number is steer + 3 * W + 6 * S.

    Why three choices instead of one choice among 12 combinations: W and S are
    only read on every 5th decision (see HOLDING KEYS in rl/racing_env.mjs).
    On the other decisions the W and S choices have no effect, and with
    separate choices they can simply be left out of the learning signal there
    (`pedal_open` below). With one 12-way choice that is not possible.

    Checkpoints from before this change have num_actions = 9: one choice
    among nine pedal/steer combinations. They are still loadable (`factored`
    is False for them) so that the old agents can be evaluated.
    """

    def __init__(self, obs_size: int, num_actions: int, hidden: int = 256):
        super().__init__()
        self.factored = num_actions == 12
        # Block decisions: six choices and 22 scores (see block_parts above).
        self.block = num_actions == BLOCK_ACTIONS
        # How much of the steering choice's entropy counts towards the entropy
        # bonus (1 = all of it, as for W and S). The bonus pays the policy for
        # staying random; for steering that showed up as weaving on straights,
        # so the trainer turns it down (--steer-entropy).
        self.steer_entropy_scale = 1.0
        self.actor = nn.Sequential(
            _layer(obs_size, hidden, 2 ** 0.5), nn.Tanh(),
            _layer(hidden, hidden, 2 ** 0.5), nn.Tanh(),
            # Tiny final weights: the starting policy barely depends on the
            # observation, so its starting behaviour is set by the bias below.
            _layer(hidden, 22 if self.block else 7 if self.factored else num_actions, 0.01),
        )
        self.critic = nn.Sequential(
            _layer(obs_size, hidden, 2 ** 0.5), nn.Tanh(),
            _layer(hidden, hidden, 2 ** 0.5), nn.Tanh(),
            _layer(hidden, 1, 1.0),
        )
        # Start with a preference for W down and S up. With everything
        # equally likely, throttle and brake cancel out, the car hardly leaves
        # the start line and every early episode ends as "stalled" having
        # seen nothing. +2 makes W down (and S up) about 7 times as likely as
        # the opposite at the start; training is free to change it.
        with torch.no_grad():
            if self.block:
                self.actor[-1].bias[9] = 2.0   # W target: down
                self.actor[-1].bias[15] = 2.0  # S target: up
            elif self.factored:
                self.actor[-1].bias[1] = 2.0  # W down
                self.actor[-1].bias[2] = 2.0  # S up
            else:
                self.actor[-1].bias[:3] = 1.5  # old layout: the three throttle actions

    def value(self, obs: torch.Tensor) -> torch.Tensor:
        """Critic only: expected future reward for each observation, shape (batch,)."""
        return self.critic(obs).squeeze(-1)

    def act(self, obs: torch.Tensor, action: torch.Tensor | None = None):
        """Choose actions (or, if `action` is given, re-score those actions).

        Returns (action, log-probability of that action, entropy, value).
        Entropy measures how spread out the probabilities are; rewarding it a
        little during training stops the policy becoming certain too early.
        """
        logits = self.actor(obs)
        if self.block:
            parts = block_parts(logits)
            if action is None:
                action = torch.stack([part.sample() for part in parts], dim=1)
            # The three "at" choices only do something when their control's
            # target differs from what it is doing now. Where the target is
            # "the same again" the timing had no effect, so it is left out of
            # the action's probability (as W and S are on closed decisions in
            # the older scheme below).
            steer_now, w_now, s_now = held_keys(obs)
            changed = [(action[:, 0] != steer_now).float(), (action[:, 2] != w_now).float(), (action[:, 4] != s_now).float()]
            logprob = sum(parts[2 * k].log_prob(action[:, 2 * k]) + changed[k] * parts[2 * k + 1].log_prob(action[:, 2 * k + 1])
                          for k in range(3))
            # Entropy bonus: the three targets in full (steering scaled as
            # elsewhere), the timings at half weight.
            entropy = (self.steer_entropy_scale * parts[0].entropy() + parts[2].entropy() + parts[4].entropy()
                       + 0.5 * (parts[1].entropy() + parts[3].entropy() + parts[5].entropy()))
            return action, logprob, entropy, self.value(obs)
        if not self.factored:  # old checkpoints: one choice among 9
            distribution = torch.distributions.Categorical(logits=logits)
            if action is None:
                action = distribution.sample()
            return action, distribution.log_prob(action), distribution.entropy(), self.value(obs)

        Categorical = torch.distributions.Categorical
        w, s, steer = Categorical(logits=logits[:, 0:2]), Categorical(logits=logits[:, 2:4]), Categorical(logits=logits[:, 4:7])
        if action is None:
            w_pick, s_pick, steer_pick = w.sample(), s.sample(), steer.sample()
            action = steer_pick + 3 * w_pick + 6 * s_pick
        else:
            steer_pick, w_pick, s_pick = action % 3, (action // 3) % 2, action // 6
        # 1 where W and S are read at this decision, 0 where the environment
        # keeps them as they are. In the second case the W and S choices did
        # nothing, so they must not count towards how likely the action was
        # (or the policy would be pushed around for choices with no effect),
        # nor towards the entropy bonus.
        pedal_open = (obs[:, PEDAL_OPEN] > 0.5).float()
        logprob = steer.log_prob(steer_pick) + pedal_open * (w.log_prob(w_pick) + s.log_prob(s_pick))
        entropy = self.steer_entropy_scale * steer.entropy() + pedal_open * (w.entropy() + s.entropy())
        return action, logprob, entropy, self.value(obs)

    def greedy(self, obs: torch.Tensor) -> torch.Tensor:
        """The single most likely action for each observation (used when evaluating)."""
        logits = self.actor(obs)
        if self.block:
            return torch.stack([part.logits.argmax(dim=-1) for part in block_parts(logits)], dim=1)
        if not self.factored:
            return logits.argmax(dim=-1)
        return logits[:, 4:7].argmax(dim=-1) + 3 * logits[:, 0:2].argmax(dim=-1) + 6 * logits[:, 2:4].argmax(dim=-1)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    # --- environment ---
    p.add_argument("--track", default="summer1",
                   help="one track, or several separated by commas for a multi-track (generalist) agent; "
                        "use as many --envs as tracks so each track has its own environment, or --rotate-every. "
                        "An item may also be a generated .track.json file, a folder of them or a .txt list of tracks "
                        "(paths from the project root)")
    p.add_argument("--rotate-every", type=int, default=0,
                   help="with more tracks than --envs: each environment drives its share of the tracks "
                        "(track j goes to environment j %% envs) in turn, switching after this many episodes "
                        "(about 0.5 s per switch onto a generated track, 2 s onto an official one). "
                        "0 = off: one track per environment for its whole life, as before")
    p.add_argument("--own-start", type=float, default=0.0,
                   help="after a crash, probability that the next episode restarts from the agent's own "
                        "state a few seconds earlier (see ownStart in rl/racing_env.mjs)")
    p.add_argument("--critic-warmup", type=int, default=0,
                   help="for this many updates at the start, train only the critic and leave the policy "
                        "alone. Use it when resuming under a changed reward or discount: the critic's "
                        "estimates are then wrong at first, and a policy pushed around by wrong "
                        "estimates can unlearn what it knew")
    p.add_argument("--failure-start", type=float, default=0.0,
                   help="share of the part-way starts that begin shortly before a recent crash site "
                        "(see failureStart in rl/racing_env.mjs)")
    p.add_argument("--no-lap-fraction", action="store_true",
                   help="hide the 'how far round the lap am I' input, so the agent cannot memorise a track by position")
    p.add_argument("--pedal-every", type=int, default=5,
                   help="W and S are read on every this-many-th decision and held in between "
                        "(see HOLDING KEYS in rl/racing_env.mjs)")
    p.add_argument("--ref-laps", type=int, default=0,
                   help="if > 0, each environment keeps switching its reference among the first this-many "
                        "human laps of its track (see refLaps in rl/racing_env.mjs)")
    p.add_argument("--ref-every", type=int, default=25, help="episodes between reference switches")
    p.add_argument("--bc-data", default=None,
                   help="examples of human driving written by rl/pretrain_bc.py (--save-data). If given, "
                        "every learning step also asks the policy to press what the human pressed in "
                        "those examples, so that practice does not erode the habits it started with")
    p.add_argument("--bc-coef", type=float, default=0.5, help="weight of that imitation term at the start of this run")
    p.add_argument("--bc-coef-end", type=float, default=0.1, help="... and at the end (it changes linearly)")
    p.add_argument("--steer-entropy", type=float, default=1.0,
                   help="share of the steering choice's entropy that counts towards the entropy bonus")
    p.add_argument("--lr-end", type=float, default=0.0,
                   help="learning rate at the end of this run (default 0). A run that is continued in "
                        "several stretches should not drop to 0 and jump back up each time")
    p.add_argument("--pace-cap", type=float, default=1.0,
                   help="upper limit of the pace scale on the progress reward (speed / the reference's "
                        "speed). 1 = going faster than the reference earns nothing extra per unit of "
                        "road; above 1 pays for it, up to this limit")
    p.add_argument("--max-off-line", type=float, default=20.0,
                   help="distance from the reference line at which an attempt on the ground is cut off; "
                        "larger leaves room for a different line from the reference's (human reference only)")
    p.add_argument("--reference", choices=["human", "route"], default="human",
                   help="what the agent is shown and measured against: 'human' (a human lap, the 352 inputs "
                        "every model so far was trained on) or 'route' (the track's own route from "
                        "ideas/g2-1-reference-free-inputs, 334 inputs, no human lap in the observation or the "
                        "reward; see ROUTE MODE in rl/racing_env.mjs). The checkpoint records it")
    p.add_argument("--memory", type=int, choices=[0, 1], default=None,
                   help="memory of earlier attempts (ideas/g2-5-memory-policy): 1 = 130 more inputs showing what "
                        "earlier attempts of the same session did on this track; 0 = the same wider observation "
                        "with those inputs held at zero (a baseline). Absent (default) = no memory, the "
                        "observation every model so far was trained on. The checkpoint must have the matching "
                        "input count (rl/extend_checkpoint_inputs.py)")
    p.add_argument("--session-max", type=int, default=6,
                   help="with --memory: a session (attempts sharing one memory) lasts a random 1 to this many "
                        "attempts; at 6, two attempts in seven are a first try (MemoryEnv in "
                        "ideas/g2-5-memory-policy/memory_env.mjs)")
    p.add_argument("--carry", type=float, default=0.0,
                   help="with --memory: at the end of an attempt that is not its session's last, add this times "
                        "the critic's value of the next attempt's first observation (which shows the updated "
                        "memory), so a crash that teaches the next attempt something is worth something. "
                        "0 (default) = every attempt is an ordinary episode (session_advantages)")
    p.add_argument("--max-off-route", type=float, default=110.0,
                   help="route reference only: distance from the route, in units, at which an attempt is cut "
                        "off (maxOffRoute in rl/racing_env.mjs; the human laps come up to 104 units from it)")
    p.add_argument("--ref-file", default="",
                   help="use this lap file ({frames, recording}, path from the project root) as the "
                        "reference instead of a human lap (see refFile in rl/racing_env.mjs)")
    p.add_argument("--kick", type=float, default=0.0,
                   help="probability that an episode starting part-way round begins with a short burst of "
                        "random steering, so the agent practises recovering from off the line everywhere "
                        "(see kick in rl/racing_env.mjs)")
    p.add_argument("--lane-penalty", type=float, default=0.05,
                   help="most the blocked-lane cost can be per step (see REWARD in rl/racing_env.mjs); 0 = off. "
                        "Always off with --reference route")
    p.add_argument("--block", type=int, default=0,
                   help="if > 0, drive with block decisions of this many 10 ms slices (5 = one decision "
                        "per 50 ms; see BLOCK DECISIONS in rl/racing_env.mjs). Needs a network made for it")
    p.add_argument("--envs", type=int, default=8, help="simulator processes to run in parallel")
    p.add_argument("--ticks", type=int, default=10, help="physics ticks (ms) per decision")
    p.add_argument("--random-start", type=float, default=0.5,
                   help="probability that an episode starts part-way round the lap "
                        "(the human's keys are replayed up to a random point) instead of on the start line")
    # --- amount of training ---
    p.add_argument("--total-steps", type=int, default=5_000_000,
                   help="decisions to collect in total, summed over all environments")
    p.add_argument("--target-steps", type=int, default=None,
                   help="stop when the checkpoint's step counter reaches this many decisions (it counts earlier "
                        "runs too), and lay the learning-rate line (--lr to --lr-end), the imitation weight "
                        "(--bc-coef to --bc-coef-end), --critic-warmup and the .u<update> copy names over the "
                        "WHOLE run from where it began, not over this process. Relaunching an interrupted run "
                        "with --resume and the same options then continues it exactly where the last save left "
                        "it. Replaces --total-steps. Absent (default): every process is a run of its own, as before")
    p.add_argument("--rollout", type=int, default=256, help="decisions per environment per update")
    # --- PPO settings (standard values unless noted) ---
    p.add_argument("--lr", type=float, default=3e-4, help="learning rate; shrinks linearly to 0 over the run")
    p.add_argument("--gamma", type=float, default=0.995,
                   help="discount per decision. 0.995 at 10 ms per decision means reward about "
                        "2 seconds ahead still counts for a third; enough to brake for a corner. "
                        "0.999 stretches that to about 10 seconds, so that losing speed well before "
                        "a jump is still felt when the jump is missed")
    p.add_argument("--gae-lambda", type=float, default=0.95, help="GAE smoothing, see compute_advantages")
    p.add_argument("--epochs", type=int, default=4, help="passes over each batch of collected data")
    p.add_argument("--minibatches", type=int, default=4, help="pieces each pass is split into")
    p.add_argument("--clip", type=float, default=0.2, help="PPO limit on the change in action probability")
    p.add_argument("--entropy", type=float, default=0.01, help="weight of the entropy bonus (exploration)")
    p.add_argument("--value-weight", type=float, default=0.5, help="weight of the critic's loss")
    p.add_argument("--max-grad-norm", type=float, default=0.5, help="gradient clipping")
    p.add_argument("--hidden", type=int, default=256, help="width of the two hidden layers")
    # --- housekeeping ---
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--device", default="cpu", help="cpu or cuda. The networks are small; cpu is fine")
    p.add_argument("--checkpoint", default=None, help="checkpoint file (default rl/checkpoints/ppo_<track>.pt)")
    p.add_argument("--save-every", type=int, default=10, help="write the checkpoint every this many updates")
    p.add_argument("--keep-every", type=int, default=0,
                   help="if > 0, every this many updates also keep a copy of the checkpoint as "
                        "<checkpoint>.u<update>.pt. A policy can get worse as well as better during a "
                        "run (one specialist went from finishing 67 in 100 to 1 in 100 in its last "
                        "quarter), and with only the latest checkpoint the good one is gone")
    p.add_argument("--resume", action="store_true", help="load the checkpoint and continue training")
    return p.parse_args()


def block_imitation_loss(logits: torch.Tensor, label: torch.Tensor):
    """Imitation for block decisions. `label` has six columns per example
    (steer, steerAt, w, wAt, s, sAt) as written by demo() in racing_env.mjs,
    where an "at" of 5 means the control did not change in that block.

    Targets: cross-entropy on every example. Timings: only on the examples
    where that control changed (a small minority, so each of those three terms
    is an average over its own examples).

    Returns (loss, accuracy dict): how often the network's top choice matches
    the human's, for each of the six choices.
    """
    names = ["steer", "steer_at", "W", "W_at", "S", "S_at"]
    loss, accuracy = 0.0, {}
    for k, name in enumerate(names):
        scores, wanted = logits[:, BLOCK_EDGES[k]:BLOCK_EDGES[k + 1]], label[:, k]
        if k % 2 == 1:  # a timing: keep only the examples with a change
            keep = wanted < 5
            if not keep.any():
                continue
            scores, wanted = scores[keep], wanted[keep]
        loss = loss + nn.functional.cross_entropy(scores, wanted)
        accuracy[name] = (scores.argmax(1) == wanted).float().mean().item()
    return loss, accuracy


def replace_with_retry(source: Path, target: Path, attempts: int = 50) -> None:
    """Rename `source` over `target`, trying again for a few seconds if
    Windows refuses. Windows will not replace a file that another program has
    open at that instant (a virus scanner looking at it, a simulator still
    reading the weights), and reports "Access is denied". That once ended a
    training run an hour in; a moment later the same rename succeeds."""
    for attempt in range(attempts):
        try:
            source.replace(target)
            return
        except PermissionError:
            if attempt == attempts - 1:
                raise
            time.sleep(0.1)


def imitation_loss(agent: "Agent", obs: torch.Tensor, action: torch.Tensor) -> torch.Tensor:
    """How far the policy is from the human's choices on these examples:
    cross-entropy for steering, plus W and S on the decisions where they are
    read. Lower = the human's keys are more likely under the policy."""
    logits = agent.actor(obs)
    if agent.block:
        return block_imitation_loss(logits, action)[0]
    action = action.reshape(-1)
    is_open = obs[:, PEDAL_OPEN] > 0.5
    return (nn.functional.cross_entropy(logits[:, 4:7], action % 3)
            + nn.functional.cross_entropy(logits[is_open, 0:2], (action[is_open] // 3) % 2)
            + nn.functional.cross_entropy(logits[is_open, 2:4], action[is_open] // 6))


def compute_advantages(rewards, values, dones, last_value, gamma, lam):
    """Generalised Advantage Estimation (GAE).

    All inputs have shape (T, N): T decisions for each of N environments.
      rewards[t]   reward received for the action at step t
      values[t]    the critic's guess at step t, before acting
      dones[t]     1 if the episode ended with the action at step t
      last_value   the critic's guess for the observation after the last step, shape (N,)

    One step's surprise is
        delta[t] = rewards[t] + gamma * values[t+1] - values[t]
    i.e. what we got plus what the critic expects next, minus what it expected
    before. The advantage is a decaying sum of the surprises that follow,
        advantage[t] = delta[t] + (gamma * lam) * advantage[t+1]
    where lam trades noise (lam = 1: trust actual rewards all the way) against
    bias (lam = 0: trust the critic after one step). Nothing carries over an
    episode end: what happens in the next episode is not this action's doing.

    Returns (advantages, returns). `returns` = advantages + values is what the
    critic is trained to predict.
    """
    advantages = torch.zeros_like(rewards)
    running = torch.zeros_like(last_value)
    for t in reversed(range(rewards.shape[0])):
        next_value = last_value if t == rewards.shape[0] - 1 else values[t + 1]
        alive = 1.0 - dones[t]
        delta = rewards[t] + gamma * next_value * alive - values[t]
        running = delta + gamma * lam * alive * running
        advantages[t] = running
    return advantages, advantages + values


def session_advantages(rewards, values, dones, session_ends, last_value, gamma, lam, carry=0.0):
    """compute_advantages above, with one addition, for --memory --carry.

    All of shape (T, N) except last_value (N,). dones[t] = 1: the attempt
    ended with the action at t. session_ends[t] = 1: it was also the last
    attempt of its session (the memory is cleared before the next one).

    The environment starts the next attempt at once, so values[t + 1] after a
    done is the critic's value of the NEXT attempt's first observation, which
    shows the memory with this attempt added. Where an attempt ended but its
    session goes on, carry x that value is added to the reward of the ending
    step: an attempt is then also credited with what it taught the next one
    (CARRY in ideas/g2-5-memory-policy/memory_agent.py). Nothing else crosses
    an attempt's end, and nothing at all crosses a session's end. With
    carry = 0 this is compute_advantages exactly (checked in
    ideas/g2-5-memory-policy/tests/test_agent.py).

    At the last step of a rollout (t = T - 1) the next value is last_value,
    the critic's value of the observation the next rollout starts from, which
    is the next attempt's first one when the attempt ended there.
    """
    advantages = torch.zeros_like(rewards)
    running = torch.zeros_like(last_value)
    for t in reversed(range(rewards.shape[0])):
        next_value = last_value if t == rewards.shape[0] - 1 else values[t + 1]
        alive = 1.0 - dones[t]
        goes_on = dones[t] * (1.0 - session_ends[t])
        delta = rewards[t] + gamma * next_value * alive + carry * next_value * goes_on - values[t]
        running = delta + gamma * lam * alive * running
        advantages[t] = running
    return advantages, advantages + values


def main() -> None:
    args = parse_args()
    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    device = torch.device(args.device)
    # Names, generated track files, folders and .txt lists (expand_tracks);
    # a plain comma list expands to itself.
    tracks = expand_tracks(args.track)
    multi = len(tracks) > 1
    # A multi-track checkpoint is named "general", not after one of its tracks.
    default_name = "ppo_general.pt" if multi else f"ppo_{track_label(tracks[0])}.pt"
    # Opt-in rotation (GENERATED TRACKS AND ROTATION above). Without it every
    # environment keeps one track, as it always did.
    track_sets = None
    if args.rotate_every > 0 and len(tracks) > args.envs:
        track_sets = [tracks[k::args.envs] for k in range(args.envs)]
    elif len(tracks) > args.envs:
        # Kept as it always was (a warning, not a refusal), so existing commands still run.
        print(f"warning: {len(tracks)} tracks but {args.envs} environments: tracks after the first "
              f"{args.envs} are never driven; add --rotate-every N or more --envs", flush=True)
    checkpoint_path = Path(args.checkpoint) if args.checkpoint else CHECKPOINT_DIR / default_name
    lap_fraction = 0 if args.no_lap_fraction else 1
    if args.carry and args.memory is None:
        raise SystemExit("--carry needs --memory: without a memory there is nothing to carry from one attempt to the next")

    envs = PolytrackVecEnv(args.envs, track=tracks, ticks=args.ticks, seed=args.seed,
                           **({"track_sets": track_sets, "switch_every": args.rotate_every} if track_sets else {}),
                           randomStart=args.random_start, lapFraction=lap_fraction,
                           failureStart=args.failure_start, ownStart=args.own_start,
                           pedalEvery=args.pedal_every, refLaps=args.ref_laps, refEvery=args.ref_every,
                           block=args.block, kick=args.kick, lanePenalty=args.lane_penalty,
                           paceCap=args.pace_cap, maxOffLine=args.max_off_line,
                           **({"refFile": args.ref_file} if args.ref_file else {}),
                           # Route mode only; with the default reference the servers get exactly
                           # the arguments they always had.
                           **({"reference": "route", "maxOffRoute": args.max_off_route}
                              if args.reference == "route" else {}),
                           # Memory only (--memory); without it the servers get exactly the
                           # arguments they always had. Each server seeds its own session
                           # lengths from its seed (rl/env_server.mjs).
                           **({"memory": args.memory, "sessionMax": args.session_max}
                              if args.memory is not None else {}))
    N, T = args.envs, args.rollout
    batch_size = N * T                                  # decisions collected per update
    num_updates = max(1, args.total_steps // batch_size)
    print(f"{args.track}: {N} environments x {T} decisions = {batch_size} per update"
          + (f", {num_updates} updates" if args.target_steps is None else "")
          + ("" if multi else f"; human lap {envs.spec_info['humanFrames']} ticks, tick limit {envs.spec_info['maxTicks']}"))
    # Multi-track only: the last episodes of each track, to report how each is
    # going. Entries are (finished?, fraction of the lap reached).
    per_track = {track_label(name): deque(maxlen=30) for name in tracks}
    # Memory only: the last 100 episodes of each attempt number (1, 2, 3, 4
    # or later in its session), finished or not. The memory can only show its
    # effect as a finish rate that rises with the attempt number.
    memory_spec = envs.spec_info.get("memory")
    per_attempt = {key: deque(maxlen=100) for key in ("1", "2", "3", "4+")}

    agent = Agent(envs.obs_size, envs.num_actions, args.hidden).to(device)
    agent.steer_entropy_scale = args.steer_entropy
    # Human examples for the imitation term (see --bc-data).
    bc_obs = bc_actions = None
    if args.bc_data:
        loaded = np.load(args.bc_data)
        bc_obs = torch.as_tensor(loaded["obs"].astype(np.float32), device=device)
        bc_actions = torch.as_tensor(loaded["actions"].astype(np.int64), device=device)
        # With --memory the examples (made by rl/pretrain_bc.py without one)
        # are 130 numbers short. A human lap driven once is a first attempt
        # as far as the memory is concerned, and on a first attempt every
        # memory input is zero, so the examples are padded with zeros.
        if memory_spec and bc_obs.shape[1] == memory_spec["baseObsSize"]:
            bc_obs = torch.cat([bc_obs, bc_obs.new_zeros(len(bc_obs), envs.obs_size - bc_obs.shape[1])], dim=1)
            print(f"imitation examples padded with {memory_spec['size']} zero memory inputs (a first attempt)")
        # Examples made for the other kind of observation (352 against 334
        # numbers) cannot be fed to this network.
        if bc_obs.shape[1] != envs.obs_size:
            envs.close()
            raise SystemExit(f"--bc-data {args.bc_data} has {bc_obs.shape[1]} inputs per example, the environment "
                             f"{envs.obs_size}; make the examples with the same --reference")
        print(f"imitation term: {len(bc_actions)} human decisions from {args.bc_data}")
    optimizer = torch.optim.Adam(agent.parameters(), lr=args.lr, eps=1e-5)
    steps_done = 0        # decisions collected so far, including earlier runs when resuming
    best_finish = None    # fastest finished lap seen in training, in ticks
    if args.resume:
        saved = torch.load(checkpoint_path, map_location=device, weights_only=True)
        # Checkpoints from before route mode have no "reference": they are human.
        if saved.get("reference", "human") != args.reference or saved["obs_size"] != envs.obs_size:
            envs.close()
            hint = ""
            if memory_spec and saved["obs_size"] == memory_spec["baseObsSize"]:
                hint = (f"; to give it the memory inputs: python rl/extend_checkpoint_inputs.py {checkpoint_path} "
                        f"<new.pt> --obs-size {envs.obs_size}")
            raise SystemExit(f"{checkpoint_path} was made for reference '{saved.get('reference', 'human')}' with "
                             f"{saved['obs_size']} inputs; this run is --reference {args.reference} with "
                             f"{envs.obs_size} inputs{hint}")
        agent.load_state_dict(saved["model"])
        # A checkpoint made by rl/widen_checkpoint.py has no optimizer state
        # (the old one does not fit the larger network); start it fresh.
        if saved["optimizer"] is not None:
            optimizer.load_state_dict(saved["optimizer"])
        steps_done, best_finish = saved["steps"], saved["best_finish"]
        print(f"resumed {checkpoint_path} at {steps_done} steps")

    # --- which updates this process runs ---------------------------------------
    # Without --target-steps (as before): updates 1..num_updates of a run that
    # begins now; the learning-rate line, the critic warm-up and the copy names
    # all count from the start of this process.
    #
    # With --target-steps: the run began when the checkpoint's step counter
    # was run_start (recorded in the checkpoint as "target_run" on the first
    # save), and it is num_updates long in all. A process resumed after an
    # interruption starts at the run's next update, so the learning rate,
    # imitation weight and warm-up have the values they would have had, and
    # its kept copies are named by the run's update number. Why: Henry's
    # machine shuts down without warning, and a relaunch used to practise the
    # whole --total-steps again from the full learning rate (ideas/g1-3-search-
    # train-rounds worked around this with trainPlan in lib.mjs).
    # A checkpoint whose record names another target (or none) starts a new
    # run at its current step counter.
    first_update = 1
    run_start = steps_done
    if args.target_steps is not None:
        recorded = saved.get("target_run") if args.resume else None
        if recorded and recorded["target_steps"] == args.target_steps:
            if recorded["batch"] != batch_size:
                envs.close()
                raise SystemExit(f"{checkpoint_path} is part of a run of {recorded['batch']} decisions per update "
                                 f"(--envs x --rollout); this launch has {batch_size}. Use the same --envs and --rollout")
            run_start = recorded["run_start"]
        num_updates = max(1, (args.target_steps - run_start) // batch_size)
        first_update = (steps_done - run_start) // batch_size + 1
        print(f"run to {args.target_steps} steps: began at {run_start}, {num_updates} updates in all, "
              f"{first_update - 1} done" + (", nothing left to do" if first_update > num_updates else
                                             f", continuing at update {first_update}"))

    def save_checkpoint() -> None:
        checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = checkpoint_path.with_suffix(".pt.tmp")
        torch.save({
            "model": agent.state_dict(),
            "optimizer": optimizer.state_dict(),
            "steps": steps_done,
            "best_finish": best_finish,
            # What evaluate.py needs to rebuild the same network and environment.
            "obs_size": envs.obs_size, "num_actions": envs.num_actions, "hidden": args.hidden,
            "track": ",".join(tracks), "ticks": args.ticks, "lap_fraction": lap_fraction,
            "pedal_every": args.pedal_every, "block": args.block,
            # What the observation is measured against ('human' or 'route'),
            # so that evaluate.py, export_actor.py and the searches rebuild
            # the same environment.
            "reference": args.reference,
            **({"max_off_route": args.max_off_route} if args.reference == "route" else {}),
            # With --memory: the observation ends with the 130 memory inputs,
            # so evaluate.py and the searches must build a memory environment.
            **({"memory": args.memory, "session_max": args.session_max, "carry": args.carry}
               if args.memory is not None else {}),
            # With --target-steps: which run this checkpoint is part of, so a
            # resumed process can continue it (see "which updates" above).
            **({"target_run": {"target_steps": args.target_steps, "run_start": run_start, "batch": batch_size}}
               if args.target_steps is not None else {}),
        }, temporary)
        # Written under a temporary name and then renamed: if the run is killed
        # in the middle of a save, the previous checkpoint is still intact.
        # (A kill during a direct save once left a truncated, unreadable file.)
        replace_with_retry(temporary, checkpoint_path)

    # Results of the last 100 episodes that ended, for the progress line.
    recent = deque(maxlen=100)  # (total reward, lap fraction reached, reason)

    # The servers read the policy's weights from this file at the start of
    # every rollout (see "rollout" in rl/env_server.mjs for the layout).
    weights_file = checkpoint_path.with_suffix(".actor.bin")
    weights_file.parent.mkdir(parents=True, exist_ok=True)

    def write_actor_weights() -> None:
        """Actor layers in order, each as weights (one row per unit) then
        biases, as raw float32. Written to a temporary name first and then
        renamed, so a server can never read a half-written file."""
        parts = []
        for layer in (agent.actor[0], agent.actor[2], agent.actor[4]):
            parts += [layer.weight.detach().cpu().numpy().ravel(), layer.bias.detach().cpu().numpy().ravel()]
        temporary = weights_file.with_suffix(".tmp")
        np.concatenate(parts).astype(np.float32).tofile(temporary)
        replace_with_retry(temporary, weights_file)

    # Actions arrive as [step, environment] (one number each) or, for block
    # decisions, [step, environment, 6]. Either way, one row per decision.
    flat = (lambda a: a.reshape(batch_size, 6)) if args.block else (lambda a: a.reshape(-1))

    start_time = time.perf_counter()
    collect_seconds = 0.0  # time spent waiting for the simulators, to report where the time goes
    try:
        for update in range(first_update, num_updates + 1):
            # Learning rate falls in a straight line from --lr to --lr-end over
            # the run (this process, or with --target-steps the whole run).
            done_share = (update - 1) / num_updates
            optimizer.param_groups[0]["lr"] = args.lr + (args.lr_end - args.lr) * done_share
            bc_coef = args.bc_coef + (args.bc_coef_end - args.bc_coef) * done_share

            # ---- 1. COLLECT ------------------------------------------------
            # Every server plays T decisions on its own with the current
            # policy and reports back once. Buffers are indexed [step, environment].
            write_actor_weights()
            collect_started = time.perf_counter()
            data = envs.rollout(T, str(weights_file), args.hidden)
            collect_seconds += time.perf_counter() - collect_started
            obs_buf = torch.as_tensor(data["obs"], device=device)
            action_buf = torch.as_tensor(data["actions"], device=device)
            reward_buf = torch.as_tensor(data["rewards"], device=device).clone()
            done_buf = torch.as_tensor(data["dones"], device=device)
            last_obs = torch.as_tensor(data["last_obs"], device=device)

            for k, info in data["episodes"]:
                recent.append((info["episodeReward"], info["fraction"], info["reason"]))
                # With rotation the server says which track the episode was on.
                per_track[info.get("track", track_label(envs.tracks[k]))].append((info["reason"] == "finished", info["fraction"]))
                if memory_spec:
                    attempt = info["attempt"]
                    per_attempt["4+" if attempt >= 4 else str(attempt)].append(info["reason"] == "finished")
                if info["reason"] == "finished" and info["startTick"] <= 1:
                    # Only laps driven from the start line count as lap times.
                    if best_finish is None or info["finishFrames"] < best_finish:
                        best_finish = info["finishFrames"]
            for t, k, final_obs in data["time_limits"]:
                # Running out of time is not the car's fault and the road
                # ahead was still worth something, so stand in the critic's
                # estimate of that for the reward the episode would have gone
                # on to collect. The other endings are real: after a finish
                # there is nothing more to earn, and a crashed, stuck or lost
                # car was not going to earn anything either.
                with torch.no_grad():
                    reward_buf[t, k] += args.gamma * agent.value(torch.as_tensor(final_obs.copy(), device=device).unsqueeze(0))[0]
            steps_done += batch_size

            # ---- 2. SCORE --------------------------------------------------
            # The servers only picked actions. Work out here, in one batch,
            # how likely each picked action was and what the critic thought
            # each situation was worth, with the same weights the servers used.
            with torch.no_grad():
                _, flat_logprob, _, flat_value = agent.act(obs_buf.reshape(batch_size, -1), flat(action_buf))
                logprob_buf, value_buf = flat_logprob.reshape(T, N), flat_value.reshape(T, N)
                last_value = agent.value(last_obs)
            if args.carry:
                # --carry: value may pass from one attempt to the next one of
                # the same session (session_advantages above).
                session_end_buf = torch.as_tensor(data["session_ends"], device=device)
                advantages, returns = session_advantages(reward_buf, value_buf, done_buf, session_end_buf, last_value,
                                                         args.gamma, args.gae_lambda, args.carry)
            else:
                advantages, returns = compute_advantages(reward_buf, value_buf, done_buf, last_value, args.gamma, args.gae_lambda)

            # ---- 3. LEARN --------------------------------------------------
            # Flatten [step, environment] into one long batch.
            b_obs = obs_buf.reshape(batch_size, -1)
            b_actions, b_logprobs = flat(action_buf), logprob_buf.reshape(-1)
            b_advantages, b_returns = advantages.reshape(-1), returns.reshape(-1)
            minibatch = batch_size // args.minibatches
            for _ in range(args.epochs):
                order = torch.randperm(batch_size, device=device)
                for begin in range(0, batch_size, minibatch):
                    pick = order[begin:begin + minibatch]
                    _, new_logprob, entropy, new_value = agent.act(b_obs[pick], b_actions[pick])

                    # How much more (or less) likely the action is now than
                    # when it was taken.
                    ratio = (new_logprob - b_logprobs[pick]).exp()
                    # Advantages rescaled to mean 0, spread 1 within the
                    # minibatch so the step size does not depend on reward scale.
                    adv = b_advantages[pick]
                    adv = (adv - adv.mean()) / (adv.std() + 1e-8)
                    # PPO's clipped objective: raise the probability of good
                    # actions, but give no extra credit for moving the ratio
                    # outside 1 +- clip, so one update cannot change the
                    # policy drastically.
                    policy_loss = -torch.min(ratio * adv, ratio.clamp(1 - args.clip, 1 + args.clip) * adv).mean()
                    # Critic: squared error against the returns actually seen.
                    value_loss = 0.5 * (new_value - b_returns[pick]).pow(2).mean()
                    if update <= args.critic_warmup:
                        # Critic only (see --critic-warmup).
                        loss = args.value_weight * value_loss
                    else:
                        loss = policy_loss + args.value_weight * value_loss - args.entropy * entropy.mean()
                        if bc_obs is not None:
                            # Imitation term: on a random handful of human
                            # decisions, how unlikely does the policy make
                            # what the human pressed? (Cross-entropy, as in
                            # rl/pretrain_bc.py.)
                            sample = torch.randint(len(bc_actions), (minibatch,), device=device)
                            loss = loss + bc_coef * imitation_loss(agent, bc_obs[sample], bc_actions[sample])

                    optimizer.zero_grad()
                    loss.backward()
                    nn.utils.clip_grad_norm_(agent.parameters(), args.max_grad_norm)
                    optimizer.step()

            # ---- progress line ---------------------------------------------
            elapsed = time.perf_counter() - start_time
            line = f"update {update}/{num_updates}  steps {steps_done}  {(update - first_update + 1) * batch_size / elapsed:.0f} steps/s"
            if args.target_steps is not None:
                # The schedule's values, so a resumed run can be checked against an uninterrupted one.
                line += (f"  lr {optimizer.param_groups[0]['lr']:.6g}  bc {bc_coef:.6g}"
                         + ("  critic only" if update <= args.critic_warmup else ""))
            if recent:
                rewards_, fractions, reasons = zip(*recent)
                counts = {r: reasons.count(r) for r in sorted(set(reasons))}
                line += (f"  last {len(recent)} episodes: reward {np.mean(rewards_):.1f}, "
                         f"lap {100 * np.mean(fractions):.1f}%, ended {counts}")
            if memory_spec and any(per_attempt.values()):
                # Finished / episodes over the last 100 of each attempt
                # number. Part-way starts are included (they are easier), so
                # compare the attempt numbers with each other, not with the
                # ten-attempt test.
                line += "  finished by attempt " + " ".join(
                    f"{key}:{sum(eps)}/{len(eps)}" for key, eps in per_attempt.items() if eps)
            # A single best lap time only means something on a single track.
            if best_finish is not None and not multi:
                line += f"  best lap {best_finish / 1000:.3f} s"
            line += f"  value loss {value_loss.item():.3f}  entropy {entropy.mean().item():.2f}"
            # Share of the run spent driving in the simulators; the rest is
            # the learning step (scoring the decisions and updating the networks).
            line += f"  simulators {100 * collect_seconds / elapsed:.0f}% of time"
            print(line, flush=True)
            # Every 50 updates, one extra line per run with each track's recent
            # record: finished/episodes and the average share of the lap reached.
            if multi and update % 50 == 0:
                parts = [f"{name} {sum(f for f, _ in eps)}/{len(eps)} {100 * np.mean([fr for _, fr in eps]):.0f}%"
                         for name, eps in per_track.items() if eps]
                print("  per track (finished/episodes, lap reached): " + ", ".join(parts), flush=True)

            if update % args.save_every == 0:
                save_checkpoint()
            if args.keep_every and update % args.keep_every == 0:
                save_checkpoint()
                shutil.copyfile(checkpoint_path, checkpoint_path.with_suffix(f".u{update}.pt"))
    except KeyboardInterrupt:
        print("interrupted; saving the checkpoint")
        save_checkpoint()
    else:
        save_checkpoint()
    finally:
        # Any other error (a simulator that died, a loss that went NaN) is
        # NOT saved: the network may be what broke, and saving here used to
        # overwrite the last good checkpoint with it. The last periodic save
        # (--save-every) stays as it was.
        envs.close()
    print(f"saved {checkpoint_path}")


if __name__ == "__main__":
    main()
