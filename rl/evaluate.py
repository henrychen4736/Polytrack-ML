"""Drive one lap with a trained policy and save it.

Usage (from the project root):
    python rl/evaluate.py                    # summer1, rl/checkpoints/ppo_summer1.pt
    python rl/evaluate.py --track winter1
    python rl/evaluate.py --policy random    # no checkpoint needed; tests the plumbing

Training picks actions at random according to the policy's probabilities, to
explore. Here the policy is used "greedily": at every decision it takes the
single action it rates highest, from the start line, once. The simulator is
deterministic, so the same checkpoint always gives the same lap.

If the car finishes, the keys it held on every tick are written to
    runs/<run>_<track>.json        ({ track, finishFrames, controlsPerTick })
which is the format the existing tools read:
    node scripts/export_recording.mjs <track> <run>    # encode + the game's Verify
    node scripts/watch_ghost.mjs <track> <run>         # watch it in the real client

Bot laps are for local viewing only. Do not submit them to the leaderboards.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

from polytrack_env import PolytrackEnv

CHECKPOINT_DIR = Path(__file__).resolve().parent / "checkpoints"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--track", default="summer1")
    p.add_argument("--checkpoint", default=None, help="default rl/checkpoints/ppo_<track>.pt")
    p.add_argument("--run", default="rl", help="name used for the saved file: runs/<run>_<track>.json")
    p.add_argument("--policy", choices=["greedy", "sample", "random"], default="greedy",
                   help="greedy: most likely action (default). sample: draw from the policy's "
                        "probabilities, as in training. random: uniform random keys, no checkpoint")
    p.add_argument("--seed", type=int, default=0, help="for --policy sample and random")
    return p.parse_args()


def main() -> None:
    args = parse_args()
    rng = np.random.default_rng(args.seed)

    if args.policy == "random":
        env = PolytrackEnv(track=args.track)
        choose = lambda obs: int(rng.integers(env.num_actions))
    else:
        # torch is only needed when there is a network to run.
        import torch
        from train_ppo import Agent

        path = Path(args.checkpoint) if args.checkpoint else CHECKPOINT_DIR / f"ppo_{args.track}.pt"
        saved = torch.load(path, map_location="cpu", weights_only=True)
        if args.track not in saved["track"].split(","):
            print(f"note: this checkpoint was trained on {saved['track']}, evaluating on {args.track}")
        agent = Agent(saved["obs_size"], saved["num_actions"], saved["hidden"])
        agent.load_state_dict(saved["model"])
        agent.eval()
        print(f"loaded {path} ({saved['steps']} training steps)")
        # Same decision interval as in training: the policy learned what its
        # keys do over that many ticks.
        # .get: checkpoints saved before the lap-fraction switch existed had it on.
        env = PolytrackEnv(track=args.track, ticks=saved["ticks"], lapFraction=saved.get("lap_fraction", 1))
        torch.manual_seed(args.seed)

        def choose(obs: np.ndarray) -> int:
            with torch.no_grad():
                batch = torch.as_tensor(obs).unsqueeze(0)  # the network expects a batch; make one of size 1
                action = agent.greedy(batch) if args.policy == "greedy" else agent.act(batch)[0]
            return int(action)

    # One episode from the start line (start_fraction 0 = never part-way round).
    obs, info = env.reset(options={"start_fraction": 0})
    total, steps, done = 0.0, 0, False
    next_report = 0.1
    while not done:
        obs, reward, terminated, truncated, info = env.step(choose(obs))
        total += reward
        steps += 1
        done = terminated or truncated
        if info["fraction"] >= next_report:  # one line per 10% of the lap
            print(f"  {round(100 * next_report)}% at {info['frames'] / 1000:.2f} s, "
                  f"{info['speedKmh']:.0f} km/h, {info['offLine']:.1f} off the line")
            next_report += 0.1

    human = env.spec_info["humanFrames"]
    if info["reason"] == "finished":
        frames = info["finishFrames"]
        print(f"FINISHED in {frames / 1000:.3f} s (human {human / 1000:.3f} s, {frames / human:.2f}x), "
              f"{steps} decisions, total reward {total:.2f}")
        saved_lap = env.save_lap(args.run)
        print(f"saved {saved_lap['saved']}")
        print(f"next: node scripts/export_recording.mjs {args.track} {args.run}")
    else:
        print(f"DID NOT FINISH ({info['reason']}) at {info['frames'] / 1000:.2f} s: reached "
              f"{100 * info['fraction']:.1f}% of the line, {info['speedKmh']:.0f} km/h, "
              f"{info['offLine']:.1f} off the line, total reward {total:.2f}")
        # Save the failed attempt too: watching it is the quickest way to see
        # what went wrong. It is marked as unfinished in the file.
        saved_lap = env.save_lap(args.run, unfinished=True)
        print(f"saved {saved_lap['saved']} (unfinished attempt, for watching)")
        print(f"next: node scripts/export_recording.mjs {args.track} {args.run}")
    env.close()
    raise SystemExit(0 if info["reason"] == "finished" else 1)


if __name__ == "__main__":
    main()
