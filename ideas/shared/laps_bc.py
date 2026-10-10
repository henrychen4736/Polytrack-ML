"""Imitation examples from one or several saved laps, for train_ppo.py --bc-data.

    .venv/Scripts/python ideas/shared/laps_bc.py <track> <out.npz> <lap> [<lap> ...]
    .venv/Scripts/python ideas/shared/laps_bc.py desert4 rl/checkpoints/g1-1-bc_desert4.npz runs/g1-1-human_desert4.recording.json

PROMOTED in phase 2 from ideas/g1-3-search-train-rounds/laps_bc.py, where the
code still lives; this is the supported way to call it from other folders, so
that folder can keep changing. Arguments and output are exactly that script's:

    track   a track name
    out     the .npz to write: obs (float16, one row per block decision) and
            actions (uint8, six per decision), the layout of rl/lap_bc.py and
            of rl/pretrain_bc.py --save-data
    lap     lap files from the project root, each { frames, recording } (what
            verify.mjs verifyAndSave writes as *.recording.json). The FIRST is
            the lap being trained towards; its examples are repeated so they
            are at least half of the file.

With one lap the output is identical to rl/lap_bc.py (checked by g1-3 and its
tester). It starts one simulator for a few seconds and runs on the CPU.

Who needs it: anything that trains a block policy towards a lap it found or
computed (g1-1 human-seeded laps, g1-2 stitched laps, g1-7 computed lines,
g2-3 explored laps), usually together with a few nearby finishing laps.

Remember what such a file teaches: the keys of those laps as seen from the
HUMAN reference line (the environment's default), with each decision rounded
to a block decision (laps.mjs keysToDecisions is lossy for laps that were not
driven in block decisions).
"""
import runpy
from pathlib import Path

runpy.run_path(str(Path(__file__).resolve().parents[1] / "g1-3-search-train-rounds" / "laps_bc.py"), run_name="__main__")
