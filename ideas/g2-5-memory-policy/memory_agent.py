"""The policy that reads the memory of earlier attempts, and its PPO pieces.

The memory is 130 extra observation numbers (track_memory.mjs), so the network
is the existing one with a wider first layer: rl/train_ppo.py's `Agent` is
subclassed here, not changed. Everything the Agent reads back from the
observation by position (the keys held, [15], [16], [144]) is in the first 352
numbers, which are untouched; the memory comes after them.

What is in this file:

    MemoryAgent                 Agent over 352 + 130 inputs
    MemoryAgent.from_checkpoint start from a trained 352-input policy: same
                                driving, memory weights zero
    write_actor                 the raw weights file the Node side reads
    session_advantages          GAE that can pass value across the attempts of
                                one session (the `carry` setting, below).
                                It lives in rl/train_ppo.py, which uses it for
                                --carry, and is re-exported here
    ppo_loss                    the loss of train_ppo.py's inner loop, as a
                                function (there it is written inline in main())

CARRY: who pays for exploring? With carry = 0 every attempt is an ordinary
episode: the policy learns to USE what the memory shows (slow down where it
crashed, repeat what worked), because that pays within the attempt. It has no
reason to try something risky for the sake of what the NEXT attempt would then
know. With carry > 0 the end of an attempt inside a session is credited with
carry x the critic's value of the next attempt's first observation, which
includes the updated memory; a crash that makes the next attempt better is
then worth something. This is the part of RL-squared's objective that an
attempt-conditioned feed-forward policy can have, and it needs no recurrence:
the memory is the state that carries over. toy_probe.py puts numbers on what
it can buy. Start with 0.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "rl"))
# session_advantages moved to rl/train_ppo.py when the trainer got --carry
# (one copy, so the trainer and these tests cannot drift apart).
from train_ppo import Agent, BLOCK_ACTIONS, session_advantages  # noqa: E402,F401

# Must match rl/racing_env.mjs (OBS_SIZE) and track_memory.mjs (MEM_SIZE);
# smoke_test.py checks both against what the Node side reports. In route mode
# the plain observation is 334 (OBS_SIZE_ROUTE): pass base_obs=334, or use
# from_checkpoint, which takes it from the checkpoint.
BASE_OBS = 352
MEM_SIZE = 21 * 6 + 4


class MemoryAgent(Agent):
    """Block-decision Agent whose observation ends with the memory inputs.

    act(), value() and greedy() are inherited: 22 scores for six choices,
    scored exactly as in rl/train_ppo.py.
    """

    def __init__(self, hidden: int = 256, base_obs: int = BASE_OBS, mem_size: int = MEM_SIZE):
        super().__init__(base_obs + mem_size, BLOCK_ACTIONS, hidden)
        self.base_obs, self.mem_size = base_obs, mem_size

    @classmethod
    def from_checkpoint(cls, path: str | Path) -> "MemoryAgent":
        """A trained 352-input block policy, given memory inputs with weight
        zero (the method of rl/extend_checkpoint_inputs.py): it drives exactly
        as before whatever the memory says, and training is free to start
        using the new inputs. A zero weight is not stuck: its gradient is the
        input times the unit's own gradient, and both are non-zero as soon as
        the memory holds anything (smoke_test.py checks this)."""
        saved = torch.load(path, map_location="cpu", weights_only=False)
        if saved["num_actions"] != BLOCK_ACTIONS:
            raise ValueError(f"{path} is not a block-decision checkpoint")
        agent = cls(saved["hidden"], saved["obs_size"])
        state = {k: v for k, v in saved["model"].items() if k not in ("actor.0.weight", "critic.0.weight")}
        agent.load_state_dict(state, strict=False)
        with torch.no_grad():
            for net, name in ((agent.actor, "actor.0.weight"), (agent.critic, "critic.0.weight")):
                net[0].weight.zero_()
                net[0].weight[:, :saved["obs_size"]] = saved["model"][name]
        return agent


def write_actor(agent: Agent, path: str | Path) -> None:
    """Actor layers as raw float32, each as weights (one row per unit) then
    biases: the layout rl/env_server.mjs and ideas/shared/policy.mjs read.
    The only difference from a 352-input file is the width of the first layer."""
    parts = []
    for layer in (agent.actor[0], agent.actor[2], agent.actor[4]):
        parts += [layer.weight.detach().cpu().numpy().ravel(), layer.bias.detach().cpu().numpy().ravel()]
    np.concatenate(parts).astype(np.float32).tofile(path)


def ppo_loss(agent: Agent, obs, actions, old_logprob, advantages, returns,
             clip: float = 0.2, value_weight: float = 0.5, entropy_coef: float = 0.01):
    """One minibatch's loss, as in the LEARN step of rl/train_ppo.py: PPO's
    clipped objective, squared error for the critic, entropy bonus.
    Returns (loss, {policy, value, entropy}) with the parts as floats."""
    _, new_logprob, entropy, new_value = agent.act(obs, actions)
    ratio = (new_logprob - old_logprob).exp()
    adv = (advantages - advantages.mean()) / (advantages.std() + 1e-8)
    policy_loss = -torch.min(ratio * adv, ratio.clamp(1 - clip, 1 + clip) * adv).mean()
    value_loss = 0.5 * (new_value - returns).pow(2).mean()
    loss = policy_loss + value_weight * value_loss - entropy_coef * entropy.mean()
    return loss, {"policy": policy_loss.item(), "value": value_loss.item(), "entropy": entropy.mean().item()}
