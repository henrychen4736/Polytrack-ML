"""iqn_server.mjs and servers.py on the real simulator. One simulator at a
time, CPU, a few hundred decisions. About a minute.

  1. Node against PyTorch: with no exploring, every action the server picked
     must be the action the PyTorch network rates best for the observation in
     that row; and the same from the file alone (numpy, test_pure.read_actor
     logic repeated here by loading the file through PyTorch's sizes).
  2. Exploring: what a random action looks like, and how often one is taken.
  3. The reward: what the server sent is written to a file and
     replica_check.mjs drives the same actions on its own environment
     (rl/racing_env.mjs, none of the server's code) and compares.
  4. The 60-action server (slices=5) the same way.
  5. Requests that must be refused.
"""
from __future__ import annotations

import base64
import json
import shutil
import subprocess

import numpy as np

from common import check, finish, IDEA, PROJECT

import torch

from iqn import IQN, export_actor
from servers import IqnServers

torch.manual_seed(1)
torch.set_num_threads(2)
SCRATCH = IDEA / "tests" / "scratch" / "server"
shutil.rmtree(SCRATCH, ignore_errors=True)
SCRATCH.mkdir(parents=True)
TRACK, SEED = "desert4", 5
NODE = shutil.which("node")


def network(actions: int, hidden: int, head: int, drives: bool = False) -> IQN:
    """A network whose best action depends on what it sees (a new one hardly prefers anything)."""
    net = IQN(352, actions, hidden, head)
    with torch.no_grad():
        for layer in (net.advantage[0], net.advantage[2]):
            layer.weight.normal_(0, 1.0)
            layer.bias.normal_(0, 0.1)
        if drives:
            # Rule out every action without W, so the car moves and the
            # observations (and with them the best action) keep changing.
            coasting = [a for a in range(actions) if (a % 12 // 3) % 2 == 0]
            net.advantage[2].weight[coasting] = 0.0
            net.advantage[2].bias[coasting] = -1e6
    return net


def b64(array: np.ndarray) -> str:
    return base64.b64encode(np.ascontiguousarray(array).tobytes()).decode()


def rollout(servers, steps, weights, eps):
    servers.start_rollout(steps, weights, [eps])
    return servers.finish_rollout()


def part(data, steps):
    return {"steps": steps, "obs": b64(data["obs"][:, 0].astype(np.float32)), "actions": b64(data["actions"][:, 0].astype(np.uint8)),
            "rewards": b64(data["rewards"][:, 0].astype(np.float32)), "stops": b64(data["stops"][:, 0].astype(np.uint8))}


def replica(label, dump):
    """Hand the dump to replica_check.mjs and pass its PASS / FAIL lines on."""
    global_failed = 0
    path = SCRATCH / f"{label.replace(' ', '_')}.json"
    path.write_text(json.dumps(dump))
    done = subprocess.run([NODE, str(IDEA / "tests" / "replica_check.mjs"), str(path)], cwd=PROJECT, capture_output=True, text=True)
    lines = [l for l in done.stdout.splitlines() if l.startswith(("PASS ", "FAIL ", "       "))]
    for line in lines:
        if line.startswith("PASS "):
            check(line[5:], True)
        elif line.startswith("FAIL "):
            detail = "\n".join(l.strip() for l in lines[lines.index(line) + 1:lines.index(line) + 4] if l.startswith("       "))
            check(line[5:], False, detail)
    if not any(l.startswith(("PASS ", "FAIL ")) for l in lines):
        check(f"{label}: replica_check.mjs ran", False, done.stderr[-800:])


def greedy_agreement(net, data):
    obs = torch.as_tensor(data["obs"][:, 0])
    with torch.no_grad():
        q = net.q_values(obs).numpy()
    best = q.argmax(1)
    top2 = np.sort(q, axis=1)[:, -2:]
    clear = (top2[:, 1] - top2[:, 0]) > 1e-3 * np.abs(q).max()      # rows where float32 against float64 rounding cannot flip the answer
    return best, data["actions"][:, 0], clear


# ---- requests that must be refused before a simulator starts ------------------------------------
for args, why in ((["bogus=1"], "an unknown argument"), (["track=desert4", "ticks=10"], "ticks= (a decision is always 50 ms)"), (["track=desert4", "slices=3"], "slices other than 1 or 5")):
    done = subprocess.run([NODE, "ideas/g1-6-offpolicy-rl/iqn_server.mjs", *args], cwd=PROJECT, capture_output=True, text=True, timeout=60)
    check(f"server: {why} is refused with an error line and exit code 2", done.returncode == 2 and '"error"' in done.stdout, f"{done.returncode} {done.stdout[:200]}")

# ---- 12 actions ---------------------------------------------------------------------------------------
# hidden 30 and head 14 are not multiples of 4: the server's matrix product
# sums in four strands and has a remainder loop, which sizes 256/128 never enter.
net12 = network(12, 30, 14)
weights12 = SCRATCH / "n12.actor.bin"
export_actor(net12, weights12)
net60 = network(60, 64, 32, drives=True)
weights60 = SCRATCH / "n60.actor.bin"
export_actor(net60, weights60)

servers = IqnServers(1, TRACK, seed=SEED, randomStart=0)
try:
    spec = servers.spec
    check("server (12 actions): reports 352 inputs, 12 actions, the track, and the human lap it rules by (21750 ticks)",
          servers.obs_size == 352 and servers.num_actions == 12 and spec["track"] == TRACK and spec["humanFrames"] == 21750 and spec["lineLength"] > 1000, str(spec))
    A = rollout(servers, 150, weights12, 0.0)
    check("rollout: arrays are [decision, simulator]: 150 x 1 observations of 352, actions, rewards, stop flags; all finite",
          A["obs"].shape == (150, 1, 352) and A["actions"].shape == (150, 1) and A["rewards"].shape == (150, 1) and A["stops"].shape == (150, 1)
          and np.isfinite(A["obs"]).all() and np.isfinite(A["rewards"]).all())
    best, taken, clear = greedy_agreement(net12, A)
    check(f"Node against PyTorch: with no exploring the server picked PyTorch's best action on all 150 decisions ({len(set(taken.tolist()))} different actions among them)",
          (best == taken).all() and len(set(taken.tolist())) >= 3, f"agree on {(best == taken).sum()} of 150; {int(clear.sum())} of them clear-cut; actions {sorted(set(taken.tolist()))}")
    B = rollout(servers, 400, weights12, 1.0)
    acts = B["actions"][:, 0]
    w, s, steer = ((acts // 3) % 2).mean(), (acts >= 6).mean(), np.bincount(acts % 3, minlength=3) / len(acts)
    check(f"exploring (epsilon 1): W is down on about 90% of random actions ({100 * w:.0f}%), S on about 10% ({100 * s:.0f}%), steering spread over none / left / right ({steer.round(2).tolist()})",
          0.85 < w < 0.95 and 0.05 < s < 0.15 and steer.min() > 0.25 and acts.max() < 12, f"{w} {s} {steer}")
    C = rollout(servers, 300, weights12, 0.3)
    best, taken, clear = greedy_agreement(net12, C)
    differ = (best != taken)[clear].mean()
    # A random action differs from the best one unless it happens to be it: a little under 0.3.
    check(f"exploring (epsilon 0.3): the action is not the network's best on {100 * differ:.0f}% of decisions (expected a little under 30%)", 0.17 < differ < 0.36, str(differ))
    stops = np.concatenate([A["stops"], B["stops"], C["stops"]])[:, 0]
    episodes = A["episodes"] + B["episodes"] + C["episodes"]
    check("one stop flag per episode the server lists as ended, at the decision it names", int((stops > 0).sum()) == len(episodes)
          and all(d["stops"][e["t"], 0] > 0 for d in (A, B, C) for _, e in d["episodes"]), f"{int((stops > 0).sum())} flags, {len(episodes)} episodes")
    check("the server's own account of each episode: return = 0.1 x (line distance at its end - at its start)",
          len(episodes) >= 2 and max(abs(e["ret"] - 0.1 * (e["endProgress"] - e["startProgress"])) for _, e in episodes if e["info"]["reason"] != "finished") < 1e-6)
    lap = servers.evaluate(weights12)
    check("evaluate: one lap, returning how it ended, its return, and the actions taken", lap["info"]["reason"] in ("finished", "stalled", "off line", "off track", "time limit")
          and lap["decisions"] == len(lap["actions"]) > 0 and lap["saved"] is None and np.isfinite(lap["ret"]), str({k: v for k, v in lap.items() if k != "actions"}))
    D = rollout(servers, 20, weights12, 0.0)
    check("after an evaluation the next rollout begins a NEW episode on the start line (its first observation is the first rollout's first)", np.array_equal(D["obs"][0, 0], A["obs"][0, 0]))
    check("... and an evaluation lap begins with the same action as a fresh start-line episode (it is the same network, not exploring)", int(lap["actions"][0]) == int(A["actions"][0, 0]) == int(D["actions"][0, 0]))
    # A file for another action count must be refused, and the server must go on working.
    try:
        rollout(servers, 5, weights60, 0.0)
        check("a weights file for 60 actions is refused by the 12-action server", False)
    except RuntimeError as error:
        check("a weights file for 60 actions is refused by the 12-action server", "60 actions" in str(error), str(error))
    E = rollout(servers, 5, weights12, 0.0)
    check("... and the server carries on afterwards, with the episode it was driving", E["obs"].shape == (5, 1, 352) and not np.array_equal(E["obs"][0, 0], A["obs"][0, 0]))
    try:
        servers.evaluate(weights12, save="rollout_r2")
        check("evaluate refuses to save a lap under a name that does not start with g1-6-", False)
    except RuntimeError as error:
        check("evaluate refuses to save a lap under a name that does not start with g1-6-", "g1-6-" in str(error), str(error))
finally:
    servers.close()
check("close: the server process has exited", all(p.wait(timeout=10) is not None for p in servers.procs))
replica("12 actions", {"label": "12 actions", "track": TRACK, "seed": SEED, "slices": 1, "rollouts": [part(A, 150), part(B, 400), part(C, 300)],
                       "eval": {"actions": b64(lap["actions"].astype(np.uint8)), "ret": lap["ret"], "info": lap["info"], "decisions": lap["decisions"]}})

# ---- 60 actions (slices=5) -------------------------------------------------------------------------------
servers = IqnServers(1, TRACK, seed=SEED, randomStart=0, slices=5)
try:
    check("server (slices=5): 60 actions", servers.num_actions == 60 and servers.obs_size == 352)
    # One network tends to hold one action for seconds at a time, so six
    # different networks drive 15 decisions each (the episode carries on from
    # one to the next): between them the best action does vary.
    A5, agree, kinds = [], 0, set()
    for k in range(6):
        other = network(60, 64, 32, drives=True)
        file = SCRATCH / f"n60_{k}.actor.bin"
        export_actor(other, file)
        A5.append(rollout(servers, 15, file, 0.0))
        best, taken, clear = greedy_agreement(other, A5[-1])
        agree += int((best == taken).sum())
        kinds |= set(taken.tolist())
    check(f"Node against PyTorch, 60 actions: the same best action on all 90 decisions of six networks ({len(kinds)} different actions among them)", agree == 90 and len(kinds) >= 3, f"agree on {agree} of 90, actions {sorted(kinds)}")
    B5 = rollout(servers, 250, weights60, 1.0)
    acts = B5["actions"][:, 0]
    slices = np.bincount(acts // 12, minlength=5) / len(acts)
    check(f"exploring with 60 actions: the switch slice is spread over all five ({slices.round(2).tolist()}), W still about 90% ({100 * ((acts % 12 // 3) % 2).mean():.0f}%)",
          acts.max() < 60 and slices.min() > 0.1 and 0.84 < ((acts % 12 // 3) % 2).mean() < 0.96)
    lap5 = servers.evaluate(weights60)
finally:
    servers.close()
replica("60 actions", {"label": "60 actions", "track": TRACK, "seed": SEED, "slices": 5, "rollouts": [*(part(a, 15) for a in A5), part(B5, 250)],
                       "eval": {"actions": b64(lap5["actions"].astype(np.uint8)), "ret": lap5["ret"], "info": lap5["info"], "decisions": lap5["decisions"]}})

# ---- the finish ------------------------------------------------------------------------------------------
# No network here can drive a lap, but one that only ever holds W (action 3:
# no steering, W down) does cross the line on winter2 when an episode happens
# to start late in the lap. Episodes start at random places (randomStart=1);
# the replica uses the same seed and must see the same starts.
throttle = IQN(352, 12, 16, 8)
with torch.no_grad():
    for parameter in throttle.parameters():
        parameter.zero_()
    throttle.advantage[2].bias[3] = 5.0
weightsW = SCRATCH / "w.actor.bin"
export_actor(throttle, weightsW)
servers = IqnServers(1, "winter2", seed=1, randomStart=1)
try:
    F = rollout(servers, 900, weightsW, 0.0)
    line = servers.spec["lineLength"]
finally:
    servers.close()
done = [e for _, e in F["episodes"] if e["info"]["reason"] == "finished"]
check(f"finish (winter2, a network that only holds W, random starts): {len(done)} episodes cross the line, every action is 'W, no steering'", len(done) >= 1 and (F["actions"] == 3).all())
check("finish: a finished episode's stop flag is 1 (ended for good) and its return is 0.1 x (line length - where it started), so every finished lap from one place earns the same",
      len(done) >= 1 and all(F["stops"][e["t"], 0] == 1 and abs(e["ret"] - 0.1 * (line - e["startProgress"])) < 1e-3 for e in done),
      str([(e["ret"], 0.1 * (line - e["startProgress"])) for e in done]))
replica("finish", {"label": "finish (winter2)", "track": "winter2", "seed": 1, "slices": 1, "randomStart": 1, "expectFinish": True, "rollouts": [part(F, 900)]})

shutil.rmtree(IDEA / "tests" / "scratch", ignore_errors=True)
finish()
