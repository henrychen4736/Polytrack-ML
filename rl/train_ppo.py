"""Train a driving policy with PPO (Proximal Policy Optimization).

Usage (from the project root):
    python rl/train_ppo.py                       # summer1, 8 environments
    python rl/train_ppo.py --total-steps 20000   # a short trial run
    python rl/train_ppo.py --resume              # continue from the checkpoint
    python rl/train_ppo.py --help                # every setting

What it does, in a loop ("update"):

  1. COLLECT. Run the current policy in N simulators at once for `--rollout`
     decisions each. The policy is a small neural network that looks at the
     observation (146 numbers, see rl/racing_env.mjs) and gives probabilities
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

This is a compact single-file PPO written directly in PyTorch (numpy and
torch are the only dependencies) rather than a library call, so that every
step is visible and commented here.
"""
from __future__ import annotations

import argparse
import time
from collections import deque
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

from polytrack_env import PolytrackVecEnv

CHECKPOINT_DIR = Path(__file__).resolve().parent / "checkpoints"


def _layer(inputs: int, outputs: int, gain: float) -> nn.Linear:
    """A linear layer with orthogonal starting weights and zero bias, the
    usual choice for PPO. `gain` sets how large the layer's outputs start."""
    layer = nn.Linear(inputs, outputs)
    nn.init.orthogonal_(layer.weight, gain)
    nn.init.zeros_(layer.bias)
    return layer


# Observation entry that says whether W and S are read at this decision
# (OBS_PEDAL_OPEN in rl/racing_env.mjs).
PEDAL_OPEN = 145


class Agent(nn.Module):
    """The policy ("actor") and the value estimate ("critic").

    Two separate networks of the same shape:
        observation (146) -> 256 -> 256 -> 7 action scores   (actor)
        observation (146) -> 256 -> 256 -> 1 value           (critic)

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
        self.actor = nn.Sequential(
            _layer(obs_size, hidden, 2 ** 0.5), nn.Tanh(),
            _layer(hidden, hidden, 2 ** 0.5), nn.Tanh(),
            # Tiny final weights: the starting policy barely depends on the
            # observation, so its starting behaviour is set by the bias below.
            _layer(hidden, 7 if self.factored else num_actions, 0.01),
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
            if self.factored:
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
        entropy = steer.entropy() + pedal_open * (w.entropy() + s.entropy())
        return action, logprob, entropy, self.value(obs)

    def greedy(self, obs: torch.Tensor) -> torch.Tensor:
        """The single most likely action for each observation (used when evaluating)."""
        logits = self.actor(obs)
        if not self.factored:
            return logits.argmax(dim=-1)
        return logits[:, 4:7].argmax(dim=-1) + 3 * logits[:, 0:2].argmax(dim=-1) + 6 * logits[:, 2:4].argmax(dim=-1)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    # --- environment ---
    p.add_argument("--track", default="summer1",
                   help="one track, or several separated by commas for a multi-track (generalist) agent; "
                        "use as many --envs as tracks so each track has its own environment")
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
    p.add_argument("--envs", type=int, default=8, help="simulator processes to run in parallel")
    p.add_argument("--ticks", type=int, default=10, help="physics ticks (ms) per decision")
    p.add_argument("--random-start", type=float, default=0.5,
                   help="probability that an episode starts part-way round the lap "
                        "(the human's keys are replayed up to a random point) instead of on the start line")
    # --- amount of training ---
    p.add_argument("--total-steps", type=int, default=5_000_000,
                   help="decisions to collect in total, summed over all environments")
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
    p.add_argument("--resume", action="store_true", help="load the checkpoint and continue training")
    return p.parse_args()


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


def main() -> None:
    args = parse_args()
    torch.manual_seed(args.seed)
    np.random.seed(args.seed)
    device = torch.device(args.device)
    tracks = args.track.split(",")
    multi = len(tracks) > 1
    # A multi-track checkpoint is named "general", not after one of its tracks.
    default_name = "ppo_general.pt" if multi else f"ppo_{args.track}.pt"
    checkpoint_path = Path(args.checkpoint) if args.checkpoint else CHECKPOINT_DIR / default_name
    lap_fraction = 0 if args.no_lap_fraction else 1

    envs = PolytrackVecEnv(args.envs, track=tracks, ticks=args.ticks, seed=args.seed,
                           randomStart=args.random_start, lapFraction=lap_fraction,
                           failureStart=args.failure_start, ownStart=args.own_start,
                           pedalEvery=args.pedal_every)
    N, T = args.envs, args.rollout
    batch_size = N * T                                  # decisions collected per update
    num_updates = max(1, args.total_steps // batch_size)
    print(f"{args.track}: {N} environments x {T} decisions = {batch_size} per update, {num_updates} updates"
          + ("" if multi else f"; human lap {envs.spec_info['humanFrames']} ticks, tick limit {envs.spec_info['maxTicks']}"))
    # Multi-track only: the last episodes of each track, to report how each is
    # going. Entries are (finished?, fraction of the lap reached).
    per_track = {name: deque(maxlen=30) for name in tracks}

    agent = Agent(envs.obs_size, envs.num_actions, args.hidden).to(device)
    optimizer = torch.optim.Adam(agent.parameters(), lr=args.lr, eps=1e-5)
    steps_done = 0        # decisions collected so far, including earlier runs when resuming
    best_finish = None    # fastest finished lap seen in training, in ticks
    if args.resume:
        saved = torch.load(checkpoint_path, map_location=device, weights_only=True)
        agent.load_state_dict(saved["model"])
        # A checkpoint made by rl/widen_checkpoint.py has no optimizer state
        # (the old one does not fit the larger network); start it fresh.
        if saved["optimizer"] is not None:
            optimizer.load_state_dict(saved["optimizer"])
        steps_done, best_finish = saved["steps"], saved["best_finish"]
        print(f"resumed {checkpoint_path} at {steps_done} steps")

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
            "track": args.track, "ticks": args.ticks, "lap_fraction": lap_fraction,
            "pedal_every": args.pedal_every,
        }, temporary)
        # Written under a temporary name and then renamed: if the run is killed
        # in the middle of a save, the previous checkpoint is still intact.
        # (A kill during a direct save once left a truncated, unreadable file.)
        temporary.replace(checkpoint_path)

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
        temporary.replace(weights_file)

    start_time = time.perf_counter()
    try:
        for update in range(1, num_updates + 1):
            # Learning rate falls in a straight line from --lr to 0 over this run.
            optimizer.param_groups[0]["lr"] = args.lr * (1.0 - (update - 1) / num_updates)

            # ---- 1. COLLECT ------------------------------------------------
            # Every server plays T decisions on its own with the current
            # policy and reports back once. Buffers are indexed [step, environment].
            write_actor_weights()
            data = envs.rollout(T, str(weights_file), args.hidden)
            obs_buf = torch.as_tensor(data["obs"], device=device)
            action_buf = torch.as_tensor(data["actions"], device=device)
            reward_buf = torch.as_tensor(data["rewards"], device=device).clone()
            done_buf = torch.as_tensor(data["dones"], device=device)
            last_obs = torch.as_tensor(data["last_obs"], device=device)

            for k, info in data["episodes"]:
                recent.append((info["episodeReward"], info["fraction"], info["reason"]))
                per_track[envs.tracks[k]].append((info["reason"] == "finished", info["fraction"]))
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
                _, flat_logprob, _, flat_value = agent.act(obs_buf.reshape(batch_size, -1), action_buf.reshape(-1))
                logprob_buf, value_buf = flat_logprob.reshape(T, N), flat_value.reshape(T, N)
                last_value = agent.value(last_obs)
            advantages, returns = compute_advantages(reward_buf, value_buf, done_buf, last_value, args.gamma, args.gae_lambda)

            # ---- 3. LEARN --------------------------------------------------
            # Flatten [step, environment] into one long batch.
            b_obs = obs_buf.reshape(batch_size, -1)
            b_actions, b_logprobs = action_buf.reshape(-1), logprob_buf.reshape(-1)
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

                    optimizer.zero_grad()
                    loss.backward()
                    nn.utils.clip_grad_norm_(agent.parameters(), args.max_grad_norm)
                    optimizer.step()

            # ---- progress line ---------------------------------------------
            elapsed = time.perf_counter() - start_time
            line = f"update {update}/{num_updates}  steps {steps_done}  {update * batch_size / elapsed:.0f} steps/s"
            if recent:
                rewards_, fractions, reasons = zip(*recent)
                counts = {r: reasons.count(r) for r in sorted(set(reasons))}
                line += (f"  last {len(recent)} episodes: reward {np.mean(rewards_):.1f}, "
                         f"lap {100 * np.mean(fractions):.1f}%, ended {counts}")
            # A single best lap time only means something on a single track.
            if best_finish is not None and not multi:
                line += f"  best lap {best_finish / 1000:.3f} s"
            line += f"  value loss {value_loss.item():.3f}  entropy {entropy.mean().item():.2f}"
            print(line, flush=True)
            # Every 50 updates, one extra line per run with each track's recent
            # record: finished/episodes and the average share of the lap reached.
            if multi and update % 50 == 0:
                parts = [f"{name} {sum(f for f, _ in eps)}/{len(eps)} {100 * np.mean([fr for _, fr in eps]):.0f}%"
                         for name, eps in per_track.items() if eps]
                print("  per track (finished/episodes, lap reached): " + ", ".join(parts), flush=True)

            if update % args.save_every == 0:
                save_checkpoint()
    except KeyboardInterrupt:
        print("interrupted; saving the checkpoint")
    finally:
        save_checkpoint()
        envs.close()
    print(f"saved {checkpoint_path}")


if __name__ == "__main__":
    main()
