"""Train a driver off-policy with IQN, rewarded for progress only.

Usage (from the project root):
    .venv/Scripts/python ideas/g1-6-offpolicy-rl/train_iqn.py --track desert4
    .venv/Scripts/python ideas/g1-6-offpolicy-rl/train_iqn.py --help

What it does, in a loop ("round"):

  1. Write the current network for the simulators and set all of them driving
     `--rollout` decisions each (50 ms per decision). They pick the action the
     network values most, or now and then a random one (EXPLORATION below).
  2. WHILE THEY DRIVE, learn: draw random batches of old decisions from the
     replay buffer (replay.py) and take gradient steps on them (Learner).
     This is the difference from rl/train_ppo.py that matters on this
     machine: there the GPU sits idle while the simulators run and each
     decision is used for 4 passes; here each decision is drawn about
     `--reuse` (32) times, and the two halves overlap in time.
  3. Collect what the simulators drove into the buffer.
  Every `--eval-every` rounds one simulator drives a lap from the start line
  with no exploring; that lap time is the one that counts.

REWARD: progress along the reference line per decision and nothing else (see
iqn_server.mjs). No pace against the human, no imitation, no key costs.

EXPLORATION: epsilon-greedy with a different epsilon per simulator (as in
Ape-X): simulator k of N explores with probability eps^(1 + 2k/(N-1)), so
with eps = 0.1 and 8 simulators they run from 0.1 down to 0.001. The noisy
ones find new things; the quiet ones show what the current driving is worth
all the way round, which a driver that is knocked off course once a second
never gets to see. eps itself falls from 1 (all random, with W mostly down)
to --eps-end over the first --eps-decisions decisions.

STARTS: `--random-start` of the episodes begin part-way round, from a save
state on the human's lap (the ladder in rl/racing_env.mjs). That only decides
WHERE practice begins: the car then has the human's position and speed at
that point, and nothing after it refers to the human. It fills the buffer
with every part of the track from the first minute, which a start-line-only
learner would need a finished lap to see. Honest lap times come from the
start-line evaluation only.

Checkpoint: rl/checkpoints/g1-6-iqn_<track>.pt (network, target network,
optimizer, counters). The replay buffer is not saved (over a gigabyte); a
resumed run refills it before learning again.
"""
from __future__ import annotations

import argparse
import copy
import shutil
import time
from collections import deque
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

from iqn import IQN, export_actor, quantile_huber_loss
from replay import ReplayBuffer
from servers import IqnServers, PROJECT_ROOT


class Learner:
    """The network, its slowly-following copy, and one gradient step.

    A gradient step on a batch of stored decisions (obs, action, n-step
    return R, the observation n decisions later obs', discount d; replay.py):

        target  = R + d x Z_target(obs', a*)      a spread of values, M samples
        a*      = the action the ONLINE network rates best at obs'
        loss    = quantile_huber(Z_online(obs, action), target)

    Two networks because a network chasing its own estimates runs away: the
    target is computed by a copy that follows the online one slowly (1/200 of
    the way per step, --target-rate). The action a* is chosen by the online
    network and valued by the copy ("double Q-learning"), which stops the
    maximum over 12 noisy estimates from being systematically too high.
    """

    def __init__(self, obs_size: int, num_actions: int, args: argparse.Namespace, device: torch.device):
        self.args, self.device = args, device
        self.net = IQN(obs_size, num_actions, args.hidden, args.head).to(device)
        self.target = copy.deepcopy(self.net).requires_grad_(False)
        self.optimizer = torch.optim.Adam(self.net.parameters(), lr=args.lr, eps=1e-5)

    def update(self, batch: dict) -> dict:
        args, device = self.args, self.device
        obs = torch.as_tensor(batch["obs"], device=device)
        action = torch.as_tensor(batch["action"], device=device)
        ret = torch.as_tensor(batch["ret"], device=device)
        next_obs = torch.as_tensor(batch["next_obs"], device=device)
        boot = torch.as_tensor(batch["boot_discount"], device=device)
        B = obs.shape[0]

        with torch.no_grad():
            best = self.net.q_values(next_obs).argmax(dim=1)                       # (B,)
            target_taus = torch.rand(B, args.target_quantiles, device=device)
            next_values = self.target(next_obs, target_taus)                       # (B, M, A)
            next_values = next_values.gather(2, best.view(B, 1, 1).expand(B, args.target_quantiles, 1)).squeeze(2)
            # boot is 0 where the episode ended for good inside the n decisions.
            target = ret.unsqueeze(1) + boot.unsqueeze(1) * next_values            # (B, M)

        taus = torch.rand(B, args.quantiles, device=device)
        predicted = self.net(obs, taus).gather(2, action.view(B, 1, 1).expand(B, args.quantiles, 1)).squeeze(2)
        loss = quantile_huber_loss(predicted, taus, target).mean()

        self.optimizer.zero_grad()
        loss.backward()
        grad_norm = nn.utils.clip_grad_norm_(self.net.parameters(), args.max_grad_norm)
        self.optimizer.step()
        with torch.no_grad():
            for slow, fast in zip(self.target.parameters(), self.net.parameters()):
                slow.lerp_(fast, args.target_rate)
        return {"loss": loss.item(), "q": predicted.mean().item(), "grad": float(grad_norm)}


def epsilons(base: float, count: int, spread: float = 2.0) -> list[float]:
    """Exploration probability per simulator: base^(1 + spread x k/(count-1))."""
    if count == 1:
        return [base]
    return [base ** (1 + spread * k / (count - 1)) for k in range(count)]


def parse_args(argv=None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    # --- environment ---
    p.add_argument("--track", default="desert4")
    p.add_argument("--envs", type=int, default=8, help="simulator processes")
    p.add_argument("--slices", type=int, default=1, choices=(1, 5),
                   help="1: 12 actions (a key combination per 50 ms). 5: 60 actions (the combination and "
                        "the 10 ms slice in which the keys switch to it)")
    p.add_argument("--human-inputs", type=int, default=1, choices=(0, 1),
                   help="0 zeroes the inputs that say what the human did (speed, orientation, keys); the "
                        "line's shape stays. The reward has no human in it either way")
    p.add_argument("--random-start", type=float, default=0.8, help="share of episodes that begin part-way round")
    p.add_argument("--failure-start", type=float, default=0.0, help="see failureStart in rl/racing_env.mjs")
    p.add_argument("--own-start", type=float, default=0.0, help="see ownStart in rl/racing_env.mjs")
    p.add_argument("--kick", type=float, default=0.0, help="see kick in rl/racing_env.mjs")
    p.add_argument("--max-off-line", type=float, default=60.0,
                   help="distance from the reference line at which an attempt on the ground is cut off")
    p.add_argument("--reference", default="human", choices=("human", "route"),
                   help="route: the g2-1 inputs with no human lap in them (334), progress and the reward "
                        "measured along the route built from the track geometry")
    p.add_argument("--ref-file", default="", help="another lap as the ruler for progress (refFile in racing_env.mjs)")
    p.add_argument("--reward-scale", type=float, default=0.1, help="reward per unit of road")
    # --- amount of training ---
    p.add_argument("--total-decisions", type=int, default=20_000_000, help="decisions to drive in this run")
    p.add_argument("--rollout", type=int, default=128, help="decisions per simulator per round (6.4 s of driving)")
    p.add_argument("--buffer", type=int, default=2_000_000, help="decisions kept for replay (0.7 GB per million)")
    p.add_argument("--learn-start", type=int, default=50_000, help="decisions in the buffer before learning begins")
    p.add_argument("--reuse", type=float, default=32.0,
                   help="how many times each decision is drawn over its life, on average: gradient steps per "
                        "round = decisions driven x reuse / batch (Linesight uses 32; PPO here uses 4)")
    p.add_argument("--batch", type=int, default=512)
    # --- learning ---
    p.add_argument("--gamma", type=float, default=0.99,
                   help="discount per 50 ms decision. 0.99: reward 3.5 s ahead counts half; enough to brake "
                        "for a corner or set up a jump. Larger sees further but shrinks the difference "
                        "between two actions relative to the size of the values")
    p.add_argument("--n-step", type=int, default=3, help="real rewards used before the estimate takes over")
    p.add_argument("--quantiles", type=int, default=8, help="fractions per example for the online network")
    p.add_argument("--target-quantiles", type=int, default=8, help="... and for the target")
    p.add_argument("--lr", type=float, default=2.5e-4)
    p.add_argument("--lr-end", type=float, default=5e-5, help="learning rate at the end of this run (linear)")
    p.add_argument("--target-rate", type=float, default=0.005, help="how far the target network moves per step")
    p.add_argument("--max-grad-norm", type=float, default=10.0)
    p.add_argument("--hidden", type=int, default=256, help="width of the two trunk layers")
    p.add_argument("--head", type=int, default=128, help="width of the two heads")
    # --- exploration ---
    p.add_argument("--eps-start", type=float, default=1.0)
    p.add_argument("--eps-end", type=float, default=0.1, help="the noisiest simulator's epsilon after the decay")
    p.add_argument("--eps-decisions", type=int, default=1_000_000, help="decisions over which epsilon falls")
    # --- housekeeping ---
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    p.add_argument("--checkpoint", default=None, help="default rl/checkpoints/g1-6-iqn_<track>.pt")
    p.add_argument("--save-every", type=int, default=50, help="rounds between checkpoint writes")
    p.add_argument("--eval-every", type=int, default=50, help="rounds between start-line laps without exploring; 0 = never")
    p.add_argument("--save-laps", action="store_true",
                   help="write each new best evaluation lap to runs/g1-6-iqn_<track>.json (for scripts/export_recording.mjs)")
    p.add_argument("--resume", action="store_true")
    return p.parse_args(argv)


def main(argv=None) -> None:
    args = parse_args(argv)
    torch.manual_seed(args.seed)
    rng = np.random.default_rng(args.seed)
    device = torch.device(args.device)
    checkpoint_path = Path(args.checkpoint) if args.checkpoint else PROJECT_ROOT / "rl" / "checkpoints" / f"g1-6-iqn_{args.track}.pt"
    weights_file = checkpoint_path.with_suffix(".actor.bin")

    options = dict(slices=args.slices, humanInputs=args.human_inputs, rewardScale=args.reward_scale,
                   randomStart=args.random_start, failureStart=args.failure_start, ownStart=args.own_start,
                   kick=args.kick, maxOffLine=args.max_off_line)
    if args.ref_file:
        options["refFile"] = args.ref_file
    if args.reference == "route":
        # maxOffLine is the human line's cut-off; route mode uses its own
        # (maxOffRoute, 110 units by default in racing_env.mjs)
        options["reference"] = "route"
        del options["maxOffLine"]
    servers = IqnServers(args.envs, args.track, seed=args.seed, **options)
    N, T = args.envs, args.rollout
    learner = Learner(servers.obs_size, servers.num_actions, args, device)
    buffer = ReplayBuffer(max(2 * T, args.buffer // N), N, servers.obs_size)
    print(f"{args.track}: {N} simulators x {T} decisions per round, {servers.num_actions} actions, "
          f"human lap {servers.spec['humanFrames']} ticks, device {device}", flush=True)

    decisions = 0       # driven so far, including earlier runs when resuming
    best_finish = None  # fastest start-line evaluation lap, ticks
    if args.resume:
        saved = torch.load(checkpoint_path, map_location=device, weights_only=True)
        learner.net.load_state_dict(saved["model"])
        learner.target.load_state_dict(saved["target"])
        learner.optimizer.load_state_dict(saved["optimizer"])
        decisions, best_finish = saved["decisions"], saved["best_finish"]
        print(f"resumed {checkpoint_path} at {decisions} decisions (the replay buffer starts empty)", flush=True)
    first_decision = decisions

    def save_checkpoint() -> None:
        checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = checkpoint_path.with_suffix(".pt.tmp")
        torch.save({
            "model": learner.net.state_dict(), "target": learner.target.state_dict(),
            "optimizer": learner.optimizer.state_dict(), "decisions": decisions, "best_finish": best_finish,
            # What is needed to rebuild the network and the environment.
            "obs_size": servers.obs_size, "num_actions": servers.num_actions, "hidden": args.hidden,
            "head": args.head, "track": args.track, "slices": args.slices, "human_inputs": args.human_inputs,
            "reference": args.reference,
        }, temporary)
        temporary.replace(checkpoint_path)

    recent = deque(maxlen=100)   # (return, lap fraction reached, reason) of the last episodes
    owed = 0.0                   # gradient steps earned by driving and not yet taken
    stats = {"loss": float("nan"), "q": float("nan"), "grad": float("nan")}
    updates = 0
    started = time.perf_counter()
    learn_seconds = wait_seconds = 0.0
    round_number = 0
    try:
        while decisions - first_decision < args.total_decisions:
            round_number += 1
            done_share = (decisions - first_decision) / args.total_decisions
            learner.optimizer.param_groups[0]["lr"] = args.lr + (args.lr_end - args.lr) * done_share
            eps = args.eps_start + (args.eps_end - args.eps_start) * min(1.0, decisions / max(1, args.eps_decisions))

            # 1. The simulators drive with the current network ...
            export_actor(learner.net, weights_file)
            servers.start_rollout(T, weights_file, epsilons(eps, N))

            # 2. ... and meanwhile the learner takes the steps earned so far.
            t0 = time.perf_counter()
            if len(buffer) >= args.learn_start:
                owed += N * T * args.reuse / args.batch
                while owed >= 1:
                    stats = learner.update(buffer.sample(args.batch, args.n_step, args.gamma, rng))
                    owed -= 1
                    updates += 1
            t1 = time.perf_counter()

            # 3. Into the buffer.
            data = servers.finish_rollout()
            wait_seconds += time.perf_counter() - t1
            learn_seconds += t1 - t0
            buffer.add(data["obs"], data["actions"], data["rewards"], data["stops"])
            decisions += N * T
            for _, episode in data["episodes"]:
                recent.append((episode["ret"], episode["info"]["fraction"], episode["info"]["reason"]))

            # A lap from the start line with no exploring: the only lap time that counts.
            evaluation = ""
            if args.eval_every and round_number % args.eval_every == 0:
                lap = servers.evaluate(weights_file)
                # The evaluation used simulator 0, which starts a NEW episode in
                # the next round: its last stored row must not be read as
                # "followed by the next row" (ReplayBuffer.cut).
                buffer.cut(0)
                info = lap["info"]
                if info["reason"] == "finished":
                    evaluation = f"  eval lap {info['finishFrames'] / 1000:.3f} s"
                    if best_finish is None or info["finishFrames"] < best_finish:
                        best_finish = info["finishFrames"]
                        # Keep the network that drove it; and, if asked, the lap
                        # itself (driven again: it is deterministic, 1 to 2 s).
                        save_checkpoint()
                        shutil.copyfile(checkpoint_path, checkpoint_path.with_suffix(".best.pt"))
                        # The lap was driven by the weights FILE, which was
                        # written before this round's gradient steps; the
                        # checkpoint just saved holds the network after them.
                        # So .best.pt does not reproduce the lap exactly (the
                        # first real run: stored best 21.957 s, .best.pt drives
                        # 22.023 s). Keep the file that did drive it as well;
                        # eval_lap.py --actor replays it.
                        shutil.copyfile(weights_file, checkpoint_path.with_suffix(".best.actor.bin"))
                        if args.save_laps:
                            servers.evaluate(weights_file, save="g1-6-iqn")
                else:
                    evaluation = f"  eval {info['reason']} at {100 * info['fraction']:.0f}%"

            elapsed = time.perf_counter() - started
            line = (f"round {round_number}  decisions {decisions}  {(decisions - first_decision) / elapsed:.0f}/s  "
                    f"updates {updates}  eps {eps:.3f}  loss {stats['loss']:.4f}  q {stats['q']:.2f}")
            if recent:
                returns, fractions, reasons = zip(*recent)
                counts = {r: reasons.count(r) for r in sorted(set(reasons))}
                line += f"  last {len(recent)} episodes: return {np.mean(returns):.1f}, lap {100 * np.mean(fractions):.0f}%, ended {counts}"
            if best_finish is not None:
                line += f"  best lap {best_finish / 1000:.3f} s"
            # Where the time goes: learning, and waiting for the simulators after learning.
            # Per decision inside a server: simulating (with the observation) and choosing.
            line += (evaluation + f"  learning {100 * learn_seconds / elapsed:.0f}% waiting {100 * wait_seconds / elapsed:.0f}%"
                     f"  server {data['step_ms'] / (N * T):.2f}+{data['act_ms'] / (N * T):.2f} ms/decision")
            print(line, flush=True)
            if round_number % args.save_every == 0:
                save_checkpoint()
    except KeyboardInterrupt:
        print("interrupted; saving the checkpoint", flush=True)
    finally:
        save_checkpoint()
        servers.close()
    print(f"saved {checkpoint_path}")


if __name__ == "__main__":
    main()
