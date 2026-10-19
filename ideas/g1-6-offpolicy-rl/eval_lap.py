"""Drive one start-line lap with a saved IQN checkpoint, and optionally save it.

    .venv/Scripts/python ideas/g1-6-offpolicy-rl/eval_lap.py rl/checkpoints/g1-6-iqn_desert4.best.pt
    .venv/Scripts/python ideas/g1-6-offpolicy-rl/eval_lap.py rl/checkpoints/g1-6-iqn_desert4.best.pt --save g1-6-iqn-best
    node scripts/export_recording.mjs desert4 g1-6-iqn-best      # encode + the game's own Verify

Why this exists: train_iqn.py reports an "eval lap" time during training, but
that number is the environment's own finish tick. A lap time only counts in
this project once the lap has been saved and the game's Verify has passed on
it. The first real run (desert4, 9.2 million decisions) was started without
--save-laps, so its best lap, 21.957 s, was never checked. This script drives
that lap again from the kept checkpoint.

The lap is deterministic: from the start line, the best-valued action at
every decision, no exploring. So a given set of weights always gives the same
lap. `.best.pt` does NOT reproduce the `best_finish` tick stored inside it,
though: training evaluates with the weights file written before a round's
gradient steps and then saves the network after them. Measured on that first
run: stored best 21.957 s, `.best.pt` drives 22.023 s. The script says whether
the tick matches. Runs made after this was found also keep
`<checkpoint>.best.actor.bin`, the file that did drive the lap; pass it with
--actor to replay exactly that lap.

Local use only: nothing here contacts any server, and the saved lap must not
be submitted to the game's leaderboards.
"""
from __future__ import annotations

import argparse
import sys
import tempfile
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from iqn import IQN, export_actor  # noqa: E402
from servers import IqnServers  # noqa: E402


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("checkpoint", help="a checkpoint written by train_iqn.py (.pt or .best.pt)")
    p.add_argument("--save", default=None,
                   help="save the lap as runs/<name>_<track>.json; the name must start with g1-6-")
    p.add_argument("--actor", default=None,
                   help="drive with this weights file (e.g. <checkpoint>.best.actor.bin) instead of the "
                        "checkpoint's own network; the checkpoint still supplies the track and settings")
    p.add_argument("--max-off-line", type=float, default=60.0,
                   help="the environment's cut-off distance from the reference line; "
                        "60 is what train_iqn.py uses by default")
    args = p.parse_args()

    saved = torch.load(args.checkpoint, map_location="cpu", weights_only=True)
    net = IQN(saved["obs_size"], saved["num_actions"], saved["hidden"], saved["head"])
    net.load_state_dict(saved["model"])

    # The Node side reads the network from a raw weights file (iqn.export_actor).
    # Written to a temporary file so the training run's own .actor.bin, which
    # belongs to the LATEST weights and not to this checkpoint, is left alone.
    with tempfile.TemporaryDirectory() as folder:
        if args.actor:
            weights = Path(args.actor).resolve()
        else:
            weights = Path(folder) / "eval.actor.bin"
            export_actor(net, weights)
        # One simulator, with the environment options the checkpoint was
        # trained under. The start options do not matter: an evaluation lap
        # always begins on the start line.
        route = saved.get("reference", "human") == "route"
        extra = {"reference": "route"} if route else {"maxOffLine": args.max_off_line}
        servers = IqnServers(1, saved["track"], slices=saved["slices"], humanInputs=saved["human_inputs"], **extra)
        try:
            lap = servers.evaluate(str(weights), save=args.save)
        finally:
            servers.close()

    info = lap["info"]
    print(f"{args.checkpoint}: {saved['decisions']} training decisions, stored best_finish {saved['best_finish']}")
    if info["reason"] != "finished":
        print(f"DID NOT FINISH ({info['reason']}) at {100 * info['fraction']:.1f}% of the lap")
        raise SystemExit(1)
    frames = info["finishFrames"]
    human = servers.spec["humanFrames"]
    print(f"FINISHED in {frames / 1000:.3f} s (human {human / 1000:.3f} s), {lap['decisions']} decisions")
    if frames == saved["best_finish"]:
        print("same tick as the checkpoint's stored best_finish")
    else:
        print(f"differs from the stored best_finish ({saved['best_finish']}): this checkpoint was saved "
              f"after its weights had moved on from the lap that set it")
    if lap.get("saved"):
        print(f"saved {lap['saved']}")
        print(f"next: node scripts/export_recording.mjs {saved['track']} {args.save}")


if __name__ == "__main__":
    main()
