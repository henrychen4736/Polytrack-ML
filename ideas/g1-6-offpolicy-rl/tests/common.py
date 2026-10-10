"""Shared by the Python test files of this folder: one line per check, PASS or
FAIL, which run_tests.mjs counts. CPU only (CUDA is hidden before torch loads).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

os.environ["CUDA_VISIBLE_DEVICES"] = ""          # the GPU is training; nothing here may touch it
IDEA = Path(__file__).resolve().parents[1]
PROJECT = IDEA.parents[1]
sys.path.insert(0, str(IDEA))                    # iqn, replay, servers, train_iqn

failed = 0


def check(name: str, ok, detail: str = "") -> bool:
    """One check: prints PASS or FAIL and the name; `detail` only on failure."""
    global failed
    ok = bool(ok)
    if not ok:
        failed += 1
    print(("PASS " if ok else "FAIL ") + name, flush=True)
    if not ok and detail:
        for line in str(detail).split("\n"):
            print("       " + line, flush=True)
    return ok


def finish() -> None:
    sys.stdout.flush()
    os._exit(1 if failed else 0)                 # no waiting on reader threads of closed servers
