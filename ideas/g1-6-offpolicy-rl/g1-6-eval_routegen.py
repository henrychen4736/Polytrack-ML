"""Ten-attempt test of IQN generalist checkpoints on official, held-out and
unseen generated tracks.

    .venv/Scripts/python ideas/g1-6-offpolicy-rl/g1-6-eval_routegen.py \
        --copies "rl/checkpoints/g1-6-iqn-routegen.s*.pt" --out runs/g1-6-routegen/eval.txt

What it does: for every checkpoint and every track, one greedy lap from the
start line (best-valued action throughout, which is how IQN drives) and
--attempts laps with a little randomness (--epsilon, a random action that
often), all from the start line. Laps run in parallel on --envs simulators.

The tracks, in three groups, so the numbers line up with the project's
ten-attempt test (CLAUDE.md):
  - the 14 official training tracks (summer4 included, though its route is
    wrong and it was left out of practice), 140 attempts
  - the 3 held-out official tracks (desert3, summer3, winter4), 30 attempts
  - the 10 unseen generated tracks of g2-2-set1/test.txt, 100 attempts
    (ppo_g2-2-route-gen: 71 of 100 sampled, 8 of 10 greedy; 0 of 30 held out)

Not the same randomness as the PPO test: PPO samples from its policy with
seeds 10 to 19; IQN has no sampling, so its attempts use epsilon-random
actions from each simulator's own seeded stream (not reproducible lap for
lap, because the order laps land on simulators varies). Lap times are the
environment's finish ticks, not yet checked with the game's Verify.

Local use only: nothing here contacts any server; no lap is saved.
"""
from __future__ import annotations

import argparse
import glob
import queue
import sys
import tempfile
import threading
import time
from collections import defaultdict
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from iqn import IQN, export_actor  # noqa: E402
from servers import IqnServers, PROJECT_ROOT  # noqa: E402

sys.path.insert(0, str(PROJECT_ROOT / "rl"))
from polytrack_env import expand_tracks, track_label  # noqa: E402

TRAINING = "desert1,desert2,desert4,desert5,summer1,summer2,summer4,summer5,summer6,summer7,winter1,winter2,winter3,winter5"
HELD_OUT = "desert3,summer3,winter4"
GENERATED = "ideas/g2-2-track-generator/sets/g2-2-set1/test.txt"


def test_copy(path: str, groups: dict, args) -> dict:
    """{group: {track: [(reason, ticks or None, greedy?), ...]}} for one checkpoint."""
    saved = torch.load(path, map_location="cpu", weights_only=True)
    net = IQN(saved["obs_size"], saved["num_actions"], saved["hidden"], saved["head"])
    net.load_state_dict(saved["model"])
    tracks = [t for ts in groups.values() for t in ts]
    options = dict(slices=saved["slices"], humanInputs=saved["human_inputs"],
                   lapFraction=saved.get("lap_fraction", 1))
    if saved.get("reference", "human") == "route":
        options["reference"] = "route"
    results = {g: defaultdict(list) for g in groups}
    group_of = {t: g for g, ts in groups.items() for t in ts}
    with tempfile.TemporaryDirectory() as folder:
        weights = Path(folder) / "eval.actor.bin"
        export_actor(net, weights)
        servers = IqnServers(args.envs, tracks[0], seed=args.seed,
                             track_sets=[tracks[k::args.envs] for k in range(args.envs)], **options)
        jobs: queue.SimpleQueue = queue.SimpleQueue()
        for t in tracks:
            jobs.put((t, 0.0))
            for _ in range(args.attempts):
                jobs.put((t, args.epsilon))
        lock = threading.Lock()
        errors = []

        def worker(k: int) -> None:
            while True:
                try:
                    track, eps = jobs.get_nowait()
                except queue.Empty:
                    return
                try:
                    lap = servers.evaluate(str(weights), server=k, track=track, epsilon=eps)
                except Exception as err:  # a dead simulator: record and stop this worker
                    errors.append(f"{track}: {err}")
                    return
                info = lap["info"]
                ticks = info["finishFrames"] if info["reason"] == "finished" else None
                with lock:
                    results[group_of[track]][track].append((info["reason"], ticks, eps == 0))

        threads = [threading.Thread(target=worker, args=(k,)) for k in range(args.envs)]
        try:
            for th in threads:
                th.start()
            for th in threads:
                th.join()
        finally:
            servers.close()
        if errors:
            print(f"  {len(errors)} errors, first: {errors[0]}", flush=True)
    return {"decisions": saved["decisions"], "results": results}


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--copies", required=True, help="checkpoint paths or a glob, comma-separated")
    p.add_argument("--baseline", default="rl/checkpoints/g1-6-iqn-route2_desert4.pt",
                   help="also test this checkpoint, for a before/after ('' for none)")
    p.add_argument("--attempts", type=int, default=10, help="laps with randomness per track, besides the greedy one")
    p.add_argument("--epsilon", type=float, default=0.01, help="chance of a random action in those laps")
    p.add_argument("--envs", type=int, default=12, help="simulators")
    p.add_argument("--seed", type=int, default=10)
    p.add_argument("--out", required=True, help="text file for the results")
    args = p.parse_args()

    copies = sorted({f for part in args.copies.split(",") for f in glob.glob(part.strip())},
                    key=lambda f: (len(f), f))
    if args.baseline:
        copies = [args.baseline] + copies
    groups = {"training": expand_tracks(TRAINING), "held out": expand_tracks(HELD_OUT),
              "generated unseen": expand_tracks(GENERATED)}
    lines = [f"IQN generalist test, {time.strftime('%Y-%m-%d %H:%M')}: per track 1 greedy lap + "
             f"{args.attempts} laps with epsilon {args.epsilon}, all from the start line. "
             "Lap times are environment finish ticks, not yet Verified.", ""]
    for path in copies:
        started = time.perf_counter()
        print(f"testing {path}", flush=True)
        out = test_copy(path, groups, args)
        lines.append(f"## {path} ({out['decisions']} training decisions, tested in {time.perf_counter() - started:.0f} s)")
        for group, per_track in out["results"].items():
            laps = [lap for track_laps in per_track.values() for lap in track_laps]
            random_laps = [lap for lap in laps if not lap[2]]
            greedy = [lap for lap in laps if lap[2]]
            lines.append(f"{group}: {sum(1 for r, _, _ in random_laps if r == 'finished')} of {len(random_laps)} "
                         f"with randomness, greedy {sum(1 for r, _, _ in greedy if r == 'finished')} of {len(greedy)}")
            for track in groups[group]:
                tl = per_track.get(track, [])
                times = sorted(t for _, t, _ in tl if t is not None)
                g = next((lap for lap in tl if lap[2]), None)
                gtext = f"{g[1] / 1000:.3f} s" if g and g[1] else (g[0] if g else "-")
                best = f", best {times[0] / 1000:.3f} s" if times else ""
                lines.append(f"  {track_label(track)}: {len(times)} of {len(tl)} finished{best}; greedy {gtext}")
        lines.append("")
        Path(args.out).write_text("\n".join(lines) + "\n")
        print("\n".join(lines[-30:]), flush=True)
    print(f"written {args.out}")


if __name__ == "__main__":
    main()
