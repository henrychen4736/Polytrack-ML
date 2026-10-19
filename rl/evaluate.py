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

A checkpoint trained with --reference route (334 inputs, see ROUTE MODE in
rl/racing_env.mjs) is driven in a route-mode environment: the checkpoint
records which kind it is, and the environment is built to match. The human
lap time printed alongside is only for comparison; such a policy never sees it.

--track may be a generated track file (ideas/g2-2-track-generator, a path
ending in .track.json, from the project root). It has no human lap, so a
route checkpoint is the one to use; the lap is saved as
runs/<run>_<file's base name>.json.

A checkpoint with the memory of earlier attempts (ideas/g2-5-memory-policy,
train_ppo.py --memory; 482 or 464 inputs) is driven in a memory environment.
One run of this script is one attempt from the start line, so it is attempt 1
of a session and every memory input is zero: the ten-attempt test of such a
checkpoint measures how it drives a track cold. Whether it gets better over
the attempts of a session is measured by ideas/g2-5-memory-policy/attempts.mjs
(eval_memory.sh there runs it on the held-out tracks).

Bot laps are for local viewing only. Do not submit them to the leaderboards.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

from polytrack_env import PolytrackEnv, OBS_PEDAL, OBS_STEER, OBS_CONTACT, OBS_S, track_label

CHECKPOINT_DIR = Path(__file__).resolve().parent / "checkpoints"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--track", default="summer1",
                   help="an official track name, or a generated .track.json file (path from the project root)")
    p.add_argument("--checkpoint", default=None, help="default rl/checkpoints/ppo_<track>.pt")
    p.add_argument("--run", default="rl", help="name used for the saved file: runs/<run>_<track>.json")
    p.add_argument("--policy", choices=["greedy", "sample", "random"], default="greedy",
                   help="greedy: most likely action (default). sample: draw from the policy's "
                        "probabilities, as in training. random: uniform random keys, no checkpoint")
    p.add_argument("--seed", type=int, default=0, help="for --policy sample and random")
    p.add_argument("--ref-lap", type=int, default=-1,
                   help="which human lap is the reference: -1 the track's standard lap (default), "
                        "0..9 that lap of data/laps/<track>.json")
    p.add_argument("--ref-file", default="",
                   help="use this lap file as the reference instead of a human lap (see refFile in rl/racing_env.mjs)")
    p.add_argument("--sticky", type=float, default=0.0,
                   help="experiment: add this much to the score of whatever each key is ALREADY doing "
                        "before choosing, so that keeping the current keys is favoured and a change "
                        "needs a clear reason. 0 = off. 3 makes a stray change about 20 times rarer")
    p.add_argument("--max-off-line", type=float, default=None,
                   help="override the distance from the line at which an attempt is cut off (default 20 units; "
                        "human-reference checkpoints)")
    p.add_argument("--max-off-route", type=float, default=None,
                   help="route-reference checkpoints: override the distance from the route at which an attempt "
                        "is cut off (default: what the checkpoint was trained with, else 110 units)")
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

        path = Path(args.checkpoint) if args.checkpoint else CHECKPOINT_DIR / f"ppo_{track_label(args.track)}.pt"
        saved = torch.load(path, map_location="cpu", weights_only=True)
        if args.track not in saved["track"].split(","):
            print(f"note: this checkpoint was trained on {saved['track']}, evaluating on {args.track}")
        agent = Agent(saved["obs_size"], saved["num_actions"], saved["hidden"])
        agent.load_state_dict(saved["model"])
        agent.eval()
        reference = saved.get("reference", "human")  # checkpoints from before route mode are human
        print(f"loaded {path} ({saved['steps']} training steps, reference {reference}, {saved['obs_size']} inputs)")
        # Route mode: the same environment the policy was trained in. Nothing
        # is passed for a human-reference checkpoint, so those run as before.
        route_options = {}
        if reference == "route":
            off = args.max_off_route if args.max_off_route is not None else saved.get("max_off_route")
            route_options = {"reference": "route", **({} if off is None else {"maxOffRoute": off})}
        # Memory checkpoints: recorded by train_ppo.py --memory, or recognised
        # by their size (130 inputs more than the plain observation: a file
        # widened by rl/extend_checkpoint_inputs.py before any training).
        # sessionMax 0: the memory is never cleared by the environment; with
        # one attempt per run that does not matter. Nothing is passed for any
        # other checkpoint.
        plain_size = 334 if reference == "route" else 352
        memory = saved.get("memory", 1 if saved["obs_size"] == plain_size + 130 else None)
        memory_options = {} if memory is None else {"memory": memory, "sessionMax": 0}
        if memory is not None:
            print(f"memory policy (memory {memory}): this attempt is attempt 1 of a session, its memory inputs are zero")
        # Same decision interval as in training: the policy learned what its
        # keys do over that many ticks.
        # .get: checkpoints saved before the lap-fraction switch existed had it on.
        # pedalEvery: agents from before keys were held chose all keys afresh
        # at every decision, which is pedalEvery 1.
        env = PolytrackEnv(track=args.track, ticks=saved["ticks"], lapFraction=saved.get("lap_fraction", 1),
                           pedalEvery=saved.get("pedal_every", 1), refLap=args.ref_lap,
                           block=saved.get("block", 0),
                           **({"refFile": args.ref_file} if args.ref_file else {}),
                           **({} if args.max_off_line is None else {"maxOffLine": args.max_off_line}),
                           **route_options, **memory_options)
        # Those older agents also pick one of 9 actions, 3 * pedal + steer with
        # pedal 0 = throttle, 1 = coast, 2 = brake. Translate to today's
        # numbering, steer + 3 * W + 6 * S.
        old_layout = saved["num_actions"] == 9
        from_old = lambda a: a % 3 + (3 if a // 3 == 0 else 6 if a // 3 == 2 else 0)
        torch.manual_seed(args.seed)

        def choose(obs: np.ndarray):
            with torch.no_grad():
                # A checkpoint from before the road-edge inputs were added
                # expects only the first 101 numbers; those are unchanged, so
                # cut the observation to the size the network was built for.
                # A newer network needs the whole observation (it reads the
                # last entry to know whether W and S are open).
                batch = torch.as_tensor(obs[:saved["obs_size"]]).unsqueeze(0)  # a batch of size 1
                if agent.block:
                    # Block decisions: six numbers (see BLOCK DECISIONS in racing_env.mjs).
                    decision = agent.greedy(batch) if args.policy == "greedy" else agent.act(batch)[0]
                    return [int(v) for v in decision[0]]
                if args.sticky and agent.factored:
                    # --sticky: read which keys are down from the observation
                    # ([15] W minus S, [144] S, [16] steer: +1 left, -1 right)
                    # and raise the score of "the same again" for each choice.
                    logits = agent.actor(batch)[0].clone()
                    s_down = int(obs[OBS_S] > 0.5)
                    w_down = int(obs[OBS_PEDAL] + s_down > 0.5)
                    steer = 1 if obs[OBS_STEER] > 0.5 else 2 if obs[OBS_STEER] < -0.5 else 0
                    logits[0 + w_down] += args.sticky
                    logits[2 + s_down] += args.sticky
                    logits[4 + steer] += args.sticky
                    pick = (lambda l: int(l.argmax())) if args.policy == "greedy" else                            (lambda l: int(torch.distributions.Categorical(logits=l).sample()))
                    return pick(logits[4:7]) + 3 * pick(logits[0:2]) + 6 * pick(logits[2:4])
                action = int(agent.greedy(batch) if args.policy == "greedy" else agent.act(batch)[0])
            return from_old(action) if old_layout else action

    # One episode from the start line (start_fraction 0 = never part-way round).
    obs, info = env.reset(options={"start_fraction": 0})
    total, steps, done = 0.0, 0, False
    # Decisions during which the car's body touched something. Observation
    # entry 103 is the environment's "contact during the last step" flag.
    contact_steps = 0
    next_report = 0.1
    while not done:
        obs, reward, terminated, truncated, info = env.step(choose(obs))
        total += reward
        steps += 1
        contact_steps += int(len(obs) > OBS_CONTACT and obs[OBS_CONTACT] > 0)
        done = terminated or truncated
        if info["fraction"] >= next_report:  # one line per 10% of the lap
            print(f"  {round(100 * next_report)}% at {info['frames'] / 1000:.2f} s, "
                  f"{info['speedKmh']:.0f} km/h, {info['offLine']:.1f} off the line")
            next_report += 0.1

    human = env.spec_info["humanFrames"]  # None on a track with no human lap (route mode)
    print(f"body contact on {contact_steps} of {steps} decisions")
    if info["reason"] == "finished":
        frames = info["finishFrames"]
        against = f"human {human / 1000:.3f} s, {frames / human:.2f}x" if human else "no human lap"
        print(f"FINISHED in {frames / 1000:.3f} s ({against}), "
              f"{steps} decisions, total reward {total:.2f}")
        saved_lap = env.save_lap(args.run)
        print(f"saved {saved_lap['saved']}")
        if args.track == track_label(args.track):  # the exporter knows official tracks only
            print(f"next: node scripts/export_recording.mjs {args.track} {args.run}")
    else:
        print(f"DID NOT FINISH ({info['reason']}) at {info['frames'] / 1000:.2f} s: reached "
              f"{100 * info['fraction']:.1f}% of the line, {info['speedKmh']:.0f} km/h, "
              f"{info['offLine']:.1f} off the line, total reward {total:.2f}")
        # Save the failed attempt too: watching it is the quickest way to see
        # what went wrong. It is marked as unfinished in the file.
        saved_lap = env.save_lap(args.run, unfinished=True)
        print(f"saved {saved_lap['saved']} (unfinished attempt, for watching)")
        if args.track == track_label(args.track):
            print(f"next: node scripts/export_recording.mjs {args.track} {args.run}")
    env.close()
    raise SystemExit(0 if info["reason"] == "finished" else 1)


if __name__ == "__main__":
    main()
