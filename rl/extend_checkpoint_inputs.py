"""Let a trained network accept a longer observation without changing what it does.

    python rl/extend_checkpoint_inputs.py rl/checkpoints/old.pt rl/checkpoints/new.pt --obs-size 144

Why: the observation grew from 101 numbers to 144 when the road-edge inputs
were added (see the table at the top of rl/racing_env.mjs). The first 101 are
unchanged. Rather than throw away a policy that already drives, this script
gives its first layer extra input connections with weight zero. The network
then produces exactly the same outputs as before, and training is free to
start using the new inputs.

Zero weights are not stuck at zero: how much a weight should change depends on
the input it carries and on how the unit it feeds should change, and both of
those are non-zero from the first update.

The optimizer's state is dropped (it is shaped like the old first layer);
train_ppo.py starts a fresh one on resume.

The memory of earlier attempts (ideas/g2-5-memory-policy) is used the same
way: its 130 inputs come after the plain observation, so

    python rl/extend_checkpoint_inputs.py rl/checkpoints/ppo_blkgen.best2.pt rl/checkpoints/g2-5-mem.pt --obs-size 482
    python rl/extend_checkpoint_inputs.py rl/checkpoints/ppo_g2-1-route.pt rl/checkpoints/g2-5-mem_route.pt --obs-size 464

(352 -> 482 with the human reference, 334 -> 464 with the route). Everything
else in the checkpoint, the reference it was made for included, is kept.
"""
from __future__ import annotations

import argparse

import torch

from train_ppo import Agent


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("source", help="checkpoint to extend")
    p.add_argument("target", help="where to write the extended checkpoint")
    p.add_argument("--obs-size", type=int, required=True, help="new observation length")
    args = p.parse_args()

    saved = torch.load(args.source, map_location="cpu", weights_only=True)
    old_size = saved["obs_size"]
    if args.obs_size <= old_size:
        raise SystemExit(f"--obs-size {args.obs_size} is not longer than the checkpoint's {old_size}")

    old = Agent(old_size, saved["num_actions"], saved["hidden"])
    old.load_state_dict(saved["model"])
    new = Agent(args.obs_size, saved["num_actions"], saved["hidden"])
    new.load_state_dict({
        # Everything except the two first layers has the same shape: copy it.
        name: value for name, value in saved["model"].items()
        if name not in ("actor.0.weight", "critic.0.weight")
    }, strict=False)
    with torch.no_grad():
        for net_old, net_new in ((old.actor, new.actor), (old.critic, new.critic)):
            # First layer: one row of weights per hidden unit, one column per
            # input. Old columns copied, new columns zero.
            net_new[0].weight.zero_()
            net_new[0].weight[:, :old_size] = net_old[0].weight

    # Check the claim: identical outputs when the extra inputs are present.
    obs = torch.empty(4096, args.obs_size).uniform_(-3, 3)
    with torch.no_grad():
        actor_gap = (old.actor(obs[:, :old_size]) - new.actor(obs)).abs().max().item()
        critic_gap = (old.critic(obs[:, :old_size]) - new.critic(obs)).abs().max().item()
    print(f"inputs {old_size} -> {args.obs_size}; largest output difference on 4096 random inputs: "
          f"actor {actor_gap:.2e}, critic {critic_gap:.2e}")
    if max(actor_gap, critic_gap) > 1e-4:
        raise SystemExit("the extended network does not match the original; nothing written")

    torch.save({**saved, "model": new.state_dict(), "optimizer": None, "obs_size": args.obs_size}, args.target)
    print(f"saved {args.target}")


if __name__ == "__main__":
    main()
