"""Facts about the example files written by laps_bc.py, as JSON, for test_python.mjs.

    .venv/Scripts/python ideas/g1-3-search-train-rounds/tests/npz_check.py <one.npz> <three.npz> <reference.npz>

<one.npz> was made from one lap, <three.npz> from that lap and two others,
<reference.npz> is what rl/lap_bc.py wrote for the same first lap. CPU only.
"""
import json
import sys

import numpy as np

one, three, ref = (np.load(f) for f in sys.argv[1:4])
n = len(one["actions"])
print(json.dumps({
    "n": n,
    "obs_shape": list(one["obs"].shape),
    "dtypes": [str(one["obs"].dtype), str(one["actions"].dtype)],
    "same_as_reference": bool(one["obs"].shape == ref["obs"].shape and np.array_equal(one["obs"], ref["obs"]) and np.array_equal(one["actions"], ref["actions"])),
    "previous_keys_hidden": bool(np.all(one["obs"][:, [15, 16, 144]] == 0)),
    "actions": one["actions"].tolist(),
    "three_n": len(three["actions"]),
    "three_obs_rows": len(three["obs"]),
    # With three laps the first is repeated twice: rows [0, n) and [n, 2n) are both lap 1.
    "three_first_twice": bool(len(three["actions"]) >= 2 * n
                              and np.array_equal(three["actions"][:n], one["actions"]) and np.array_equal(three["actions"][n:2 * n], one["actions"])
                              and np.array_equal(three["obs"][:n], one["obs"]) and np.array_equal(three["obs"][n:2 * n], one["obs"])),
    # ... and what follows is the other two laps (the same lap given twice here), so the two halves of the rest are equal.
    "three_rest_is_two_equal_laps": bool((len(three["actions"]) - 2 * n) % 2 == 0 and np.array_equal(
        three["actions"][2 * n:2 * n + (len(three["actions"]) - 2 * n) // 2], three["actions"][2 * n + (len(three["actions"]) - 2 * n) // 2:])),
    "three_rest_differs_from_first": bool(not np.array_equal(three["actions"][2 * n:3 * n], one["actions"])),
}))
