"""Give a new policy network a head start by imitating human laps.

    python rl/pretrain_bc.py --track desert1,desert2,... --checkpoint rl/checkpoints/ppo_general3.pt
    python rl/train_ppo.py --resume --checkpoint rl/checkpoints/ppo_general3.pt ...

Why: a network that starts from nothing learns its key habits from random
trial and error, and the habits it found were bad ones: tapping W on and off
30 times a second instead of holding it, never holding W and S together in the
air. The top human laps we already have (data/laps/, 10 per track) show the
good habits directly, so the new network is first trained to press what the
human pressed in the same situation. This is called behaviour cloning (BC).
PPO (rl/train_ppo.py) then takes over from that starting point and learns by
driving, as before.

What it does:
  1. For every track, starts an environment and has it drive each of that
     track's human laps (the "demo" command, see demo() in rl/racing_env.mjs).
     That gives pairs of (what the agent would have seen, what the human did).
     Laps other than the fastest are seen relative to the fastest lap's line,
     so the examples include being a little off the line.
  2. Trains the actor to give the human's choice a high probability
     (cross-entropy), separately for W, S and steering.
  3. Saves a checkpoint in train_ppo.py's format. The critic is untouched and
     knows nothing yet: resume with --critic-warmup so it can catch up before
     the policy is allowed to change.

One input is hidden during imitation: the keys held at the previous decision
(observation entries 15, 16 and 144). A human holds a key for seconds, so "do
whatever was done last time" is right 99% of the time, and a network allowed
to see the previous keys learns exactly that and nothing about the road. It
then never presses anything by itself. With those inputs blanked it has to
work out the keys from the situation. Their connections are left at zero, so
PPO can start using them later.
"""
from __future__ import annotations

import argparse
import base64
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

from polytrack_env import EnvServer
from train_ppo import Agent, PEDAL_OPEN

# Observation entries holding the previous decision's keys (see the table at
# the top of rl/racing_env.mjs).
PREVIOUS_KEYS = [15, 16, 144]


def collect(track: str, laps: int, lap_fraction: int, pedal_every: int, seed: int):
    """Drive human laps of one track; returns (observations, actions).

    Each of the `laps` laps takes a turn as the REFERENCE (the lap the agent
    is shown: line, speeds, orientation, keys). Against each reference two
    laps are driven:
      - the reference lap itself: the car is exactly on the reference, and
        the right thing to press is what the reference shows;
      - one other player's lap: the car is a little off the reference, at a
        slightly different speed, and the right keys are that player's own.
        These are the examples of following a reference one is not exactly on.
    """
    server = EnvServer(track=track, lapFraction=lap_fraction, pedalEvery=pedal_every)
    obs_size = server.spec["obsSize"]
    rng = np.random.default_rng(seed)
    obs, actions = [], []
    try:
        for ref in range(laps):
            other = (ref + 1 + int(rng.integers(laps - 1))) % laps if laps > 1 else ref
            for lap in dict.fromkeys((ref, other)):
                reply = server.request(cmd="demo", lap=lap, ref=ref)
                obs.append(np.frombuffer(base64.b64decode(reply["obs"]), dtype=np.float32).reshape(-1, obs_size))
                actions.append(np.frombuffer(base64.b64decode(reply["actions"]), dtype=np.uint8))
    finally:
        server.close()
    return track, np.concatenate(obs), np.concatenate(actions), server.spec


def losses(agent: Agent, obs: torch.Tensor, action: torch.Tensor):
    """Cross-entropy of the human's choice for each of the three parts, and
    how often the network's top choice matches. W and S only count on the
    decisions where they are read."""
    logits = agent.actor(obs)
    steer, w, s = action % 3, (action // 3) % 2, action // 6
    is_open = obs[:, PEDAL_OPEN] > 0.5
    loss = (F.cross_entropy(logits[:, 4:7], steer)
            + F.cross_entropy(logits[is_open, 0:2], w[is_open])
            + F.cross_entropy(logits[is_open, 2:4], s[is_open]))
    with torch.no_grad():
        accuracy = {
            "W": (logits[is_open, 0:2].argmax(1) == w[is_open]).float().mean().item(),
            "S": (logits[is_open, 2:4].argmax(1) == s[is_open]).float().mean().item(),
            "steer": (logits[:, 4:7].argmax(1) == steer).float().mean().item(),
        }
    return loss, accuracy


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--track", required=True, help="tracks to imitate, separated by commas")
    p.add_argument("--checkpoint", required=True, help="where to write the checkpoint")
    p.add_argument("--laps", type=int, default=10, help="human laps per track (data/laps has 10)")
    p.add_argument("--epochs", type=int, default=30, help="passes over the examples")
    p.add_argument("--batch", type=int, default=1024)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--hidden", type=int, default=256)
    p.add_argument("--pedal-every", type=int, default=5)
    p.add_argument("--lap-fraction", type=int, default=0, help="0 hides the lap-position input (multi-track)")
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--save-data", default=None,
                   help="also write the examples to this .npz file, for train_ppo.py --bc-data")
    args = p.parse_args()
    torch.manual_seed(args.seed)
    rng = np.random.default_rng(args.seed)
    tracks = args.track.split(",")

    # ---- 1. examples: all tracks at once, one process each -----------------
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda t: collect(t, args.laps, args.lap_fraction, args.pedal_every, args.seed + tracks.index(t)), tracks))
    spec = results[0][3]
    for track, obs, actions, _ in results:
        w = ((actions // 3) % 2).mean()
        print(f"  {track}: {len(actions)} decisions with {args.laps} laps as reference, W down on {100 * w:.0f}%")
    obs = np.concatenate([r[1] for r in results])
    actions = np.concatenate([r[2] for r in results]).astype(np.int64)
    obs[:, PREVIOUS_KEYS] = 0  # hidden during imitation, see the top of this file
    if args.save_data:
        # float16 halves the file; network inputs do not need more precision.
        np.savez(args.save_data, obs=obs.astype(np.float16), actions=actions.astype(np.uint8))
        print(f"saved the examples to {args.save_data}")

    # Hold back 5% of the examples to check the network is learning the
    # situation -> keys rule and not memorising the examples.
    order = rng.permutation(len(obs))
    held_back = order[: len(obs) // 20]
    train = order[len(obs) // 20:]
    obs_t, actions_t = torch.as_tensor(obs), torch.as_tensor(actions)
    print(f"{len(train)} examples to learn from, {len(held_back)} held back")

    # ---- 2. imitation ------------------------------------------------------
    agent = Agent(spec["obsSize"], spec["numActions"], args.hidden)
    optimizer = torch.optim.Adam(agent.actor.parameters(), lr=args.lr)
    for epoch in range(1, args.epochs + 1):
        optimizer.param_groups[0]["lr"] = args.lr * (1 - (epoch - 1) / args.epochs)
        shuffled = torch.as_tensor(rng.permutation(train))
        for begin in range(0, len(shuffled), args.batch):
            pick = shuffled[begin:begin + args.batch]
            loss, _ = losses(agent, obs_t[pick], actions_t[pick])
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
        if epoch % 5 == 0 or epoch == args.epochs:
            with torch.no_grad():
                check_loss, acc = losses(agent, obs_t[held_back], actions_t[held_back])
            print(f"epoch {epoch}: held-back loss {check_loss.item():.3f}; same choice as the human: "
                  f"W {100 * acc['W']:.1f}%, S {100 * acc['S']:.1f}%, steering {100 * acc['steer']:.1f}%", flush=True)

    # The previous-key inputs were always zero here, so their connections
    # still hold their random starting values. Zero them: otherwise the first
    # real observation, where those inputs are not zero, would disturb the
    # network. (The critic is not trained here, so its connections are left alone.)
    with torch.no_grad():
        agent.actor[0].weight[:, PREVIOUS_KEYS] = 0

    # ---- 3. checkpoint in train_ppo.py's format ----------------------------
    path = Path(args.checkpoint)
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save({
        "model": agent.state_dict(), "optimizer": None, "steps": 0, "best_finish": None,
        "obs_size": spec["obsSize"], "num_actions": spec["numActions"], "hidden": args.hidden,
        "track": args.track, "ticks": spec["ticks"], "lap_fraction": args.lap_fraction,
        "pedal_every": args.pedal_every,
    }, path)
    print(f"saved {path}")


if __name__ == "__main__":
    main()
