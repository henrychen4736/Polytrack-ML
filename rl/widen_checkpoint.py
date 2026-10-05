"""Make a trained network wider without changing what it does.

    python rl/widen_checkpoint.py rl/checkpoints/ppo_general.pt rl/checkpoints/ppo_general_512.pt --hidden 512

Why: a wider network can hold more (useful when one agent has to drive many
tracks), but starting a wide network from scratch would throw away everything
the narrow one has learned. This script builds the wide network so that, at
the moment it is created, it gives exactly the same outputs as the narrow one.
Training then continues from there with the extra units available.

How. Both the actor and the critic are
    input -> layer A -> tanh -> layer B -> tanh -> layer C -> output
with `hidden` units after A and after B. Going from 256 to 512:

  layer A  gains 256 new units. Their incoming weights are set at random, so
           each new unit computes something, but ...
  layer B  ... the weights leading FROM the new A units INTO the old B units
           are zero, so the old B units compute exactly what they did before.
           B's own 256 new units get random incoming weights.
  layer C  the weights from the new B units to the outputs are zero, so the
           outputs are unchanged.

The new units therefore have no effect yet, but they are not dead: the zero
weights receive a training signal straight away (a weight's gradient depends
on the unit feeding it, which is active), and once they move off zero the
units behind them start to learn too.

The optimizer's state (Adam's running averages) is dropped, because it is
shaped like the old network; train_ppo.py starts a fresh one on resume.
"""
from __future__ import annotations

import argparse

import torch

from train_ppo import Agent


def widen_net(old: torch.nn.Sequential, new: torch.nn.Sequential, old_hidden: int) -> None:
    """Copy `old` into the top-left corner of `new` and zero the weights that
    would let the new units affect the old ones. Layers sit at positions 0, 2
    and 4 of the Sequential (tanh at 1 and 3)."""
    h = old_hidden
    with torch.no_grad():
        a_old, b_old, c_old = old[0], old[2], old[4]
        a_new, b_new, c_new = new[0], new[2], new[4]
        # Layer A: old units keep their weights; new units keep the random
        # initial weights the new network was created with.
        a_new.weight[:h] = a_old.weight
        a_new.bias[:h] = a_old.bias
        # Layer B: old units read the old A units as before and ignore the new ones.
        b_new.weight[:h, :h] = b_old.weight
        b_new.weight[:h, h:] = 0
        b_new.bias[:h] = b_old.bias
        # Layer C: outputs read the old B units as before and ignore the new ones.
        c_new.weight[:, :h] = c_old.weight
        c_new.weight[:, h:] = 0
        c_new.bias[:] = c_old.bias


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("source", help="checkpoint to widen")
    p.add_argument("target", help="where to write the widened checkpoint")
    p.add_argument("--hidden", type=int, default=512, help="new width of the two hidden layers")
    args = p.parse_args()

    saved = torch.load(args.source, map_location="cpu", weights_only=True)
    old_hidden = saved["hidden"]
    if args.hidden <= old_hidden:
        raise SystemExit(f"--hidden {args.hidden} is not wider than the checkpoint's {old_hidden}")

    old = Agent(saved["obs_size"], saved["num_actions"], old_hidden)
    old.load_state_dict(saved["model"])
    torch.manual_seed(0)  # the new units' random weights; fixed so the result is repeatable
    new = Agent(saved["obs_size"], saved["num_actions"], args.hidden)
    widen_net(old.actor, new.actor, old_hidden)
    widen_net(old.critic, new.critic, old_hidden)

    # Check the claim: same action scores and same values on random inputs.
    # (Observations are clipped to +-3, so this covers their range.)
    obs = torch.empty(4096, saved["obs_size"]).uniform_(-3, 3)
    with torch.no_grad():
        actor_gap = (old.actor(obs) - new.actor(obs)).abs().max().item()
        critic_gap = (old.critic(obs) - new.critic(obs)).abs().max().item()
    print(f"widened {old_hidden} -> {args.hidden}; largest output difference on 4096 random inputs: "
          f"actor {actor_gap:.2e}, critic {critic_gap:.2e}")
    if max(actor_gap, critic_gap) > 1e-4:
        raise SystemExit("the widened network does not match the original; nothing written")

    torch.save({**saved, "model": new.state_dict(), "optimizer": None, "hidden": args.hidden}, args.target)
    print(f"saved {args.target}")


if __name__ == "__main__":
    main()
