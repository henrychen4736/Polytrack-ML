"""The whole loop on the real simulator, small: 2 simulators, a few hundred
decisions, a few gradient steps on the CPU. Under a minute.

    .venv/Scripts/python ideas/g1-6-offpolicy-rl/smoke_test.py [track]

Checks, in order:
  1. the servers start and report 352 inputs and 12 actions
  2. with no exploring, every action a server picked is the one the Python
     network rates best for the observation it was picked from (the Node and
     PyTorch forward passes agree)
  3. the reward is progress and nothing else: each episode's return equals
     rewardScale x (line distance at its end - at its start)
  4. random exploring drives with W mostly down
  5. gradient steps on what was collected give a finite loss
  6. an evaluation lap from the start line runs to an ending
and prints how fast one simulator process drives.
"""
from __future__ import annotations

import sys
import tempfile
import time
from pathlib import Path

import numpy as np
import torch

from iqn import export_actor
from replay import ReplayBuffer
from servers import IqnServers
from train_iqn import Learner, parse_args


def check(condition: bool, what: str) -> None:
    print(("ok    " if condition else "FAIL  ") + what, flush=True)
    if not condition:
        raise SystemExit(1)


def main() -> None:
    track = sys.argv[1] if len(sys.argv) > 1 else "desert4"
    torch.manual_seed(0)
    rng = np.random.default_rng(0)
    args = parse_args(["--track", track, "--batch", "64"])
    T, N = 100, 2
    servers = IqnServers(N, track, seed=0, randomStart=0.8)
    try:
        check(servers.obs_size == 352 and servers.num_actions == 12, f"2 servers up on {track}: {servers.obs_size} inputs, {servers.num_actions} actions")
        learner = Learner(servers.obs_size, servers.num_actions, args, torch.device("cpu"))
        # A new network's outputs hardly depend on its input; scale the last
        # layer up so that "the best action" varies and check 2 means something.
        with torch.no_grad():
            learner.net.advantage[2].weight.mul_(20.0)
        buffer = ReplayBuffer(1000, N, servers.obs_size)

        with tempfile.TemporaryDirectory() as folder:
            weights = Path(folder) / "smoke.actor.bin"
            export_actor(learner.net, weights)

            # --- no exploring: the servers act on the network alone ---
            started = time.perf_counter()
            servers.start_rollout(T, weights, [0.0] * N)
            greedy = servers.finish_rollout()
            seconds = time.perf_counter() - started
            check(np.isfinite(greedy["obs"]).all() and np.isfinite(greedy["rewards"]).all(), "observations and rewards are finite")
            with torch.no_grad():
                best = learner.net.q_values(torch.as_tensor(greedy["obs"].reshape(T * N, -1))).argmax(dim=1).numpy()
            same = (best == greedy["actions"].reshape(-1)).mean()
            kinds = len(set(greedy["actions"].reshape(-1).tolist()))
            check(same >= 0.99 and kinds >= 3, f"Node and PyTorch pick the same action on {100 * same:.1f}% of {T * N} decisions ({kinds} different actions)")
            buffer.add(greedy["obs"], greedy["actions"], greedy["rewards"], greedy["stops"])

            # --- all exploring ---
            servers.start_rollout(T, weights, [1.0] * N)
            random = servers.finish_rollout()
            buffer.add(random["obs"], random["actions"], random["rewards"], random["stops"])
            w_share = ((random["actions"] // 3) % 2).mean()
            check(0.8 < w_share < 0.98, f"random actions hold W {100 * w_share:.0f}% of the time")

            episodes = greedy["episodes"] + random["episodes"]
            gaps = [abs(e["ret"] - 0.1 * (e["endProgress"] - e["startProgress"])) for _, e in episodes if e["info"]["reason"] != "finished"]
            reasons = sorted({e["info"]["reason"] for _, e in episodes})
            check(len(gaps) > 0 and max(gaps) < 1e-3, f"{len(gaps)} episodes ended ({reasons}); each return is 0.1 x the line distance covered (worst gap {max(gaps, default=0):.1e})")
            both = np.concatenate([greedy["rewards"], random["rewards"]])
            stops = np.concatenate([greedy["stops"], random["stops"]])
            check(int((stops > 0).sum()) == len(episodes), "one stop flag per ended episode")
            print(f"      reward per decision: mean {both.mean():.3f}, max {both.max():.3f} (0.28 is 200 km/h)")

            # --- learning on it ---
            losses = [learner.update(buffer.sample(args.batch, args.n_step, args.gamma, rng))["loss"] for _ in range(10)]
            check(all(np.isfinite(losses)), f"10 gradient steps: loss {losses[0]:.4f} -> {losses[-1]:.4f}, all finite")
            export_actor(learner.net, weights)

            # --- a start-line lap with the updated network ---
            lap = servers.evaluate(weights)
            check(lap["info"]["reason"] is not None and lap["decisions"] == len(lap["actions"]),
                  f"evaluation lap from the start line: {lap['info']['reason']} after {lap['decisions']} decisions at {100 * lap['info']['fraction']:.1f}% (an untrained network is expected to stall)")

        per_process = T * N / seconds / N
        print(f"      speed: {per_process:.0f} decisions/s per simulator process ({greedy['step_ms'] / (T * N):.2f} ms simulating "
              f"+ {greedy['act_ms'] / (T * N):.3f} ms choosing per decision; includes the first reset's ladder build)")
    finally:
        servers.close()
    print("smoke test passed")


if __name__ == "__main__":
    main()
