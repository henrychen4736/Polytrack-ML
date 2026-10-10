"""memory_agent.py, attempts.mjs and toy_probe.py. CPU only, no training.

    .venv/Scripts/python ideas/g2-5-memory-policy/tests/test_agent.py     (from the project root)

One line per check, PASS or FAIL; exit code 1 on any FAIL. One simulator (the
attempts.mjs run in part 3, about 15 s).

  1. session_advantages: a case worked by hand, a slow reference written here
     from the definition (with and without carry), train_ppo.py's own function.
  2. The warm start: weights, and outputs against the 352-input checkpoint.
  3. attempts.mjs: two attempts on desert3 with the warm-started actor; the
     recorded rows; Node against PyTorch on the actor's 22 scores.
  4. Node against PyTorch again with NON-zero memory weights (with zero
     weights a Node actor that ignored inputs 352..481 would pass part 3).
  5. ppo_loss against the same loss written out here.
  6. toy_probe.py: the README's table, and its first two rows by brute force.
"""
from __future__ import annotations

import copy
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
import torch

HERE = Path(__file__).resolve().parent
IDEA = HERE.parent
ROOT = IDEA.parents[1]
sys.path.insert(0, str(IDEA))
sys.path.insert(0, str(ROOT / "rl"))
from memory_agent import BASE_OBS, MEM_SIZE, MemoryAgent, ppo_loss, session_advantages, write_actor  # noqa: E402
from train_ppo import Agent, compute_advantages  # noqa: E402

GENERALIST = ROOT / "rl" / "checkpoints" / "ppo_blkgen.best2.pt"
TMP = HERE / "tmp"
TMP.mkdir(exist_ok=True)
torch.manual_seed(0)
passed = failed = 0


def check(ok, what: str, detail: str = "") -> bool:
    global passed, failed
    ok = bool(ok)
    passed, failed = passed + ok, failed + (not ok)
    print(("PASS " if ok else "FAIL ") + what + (f"\n       {detail}" if detail and not ok else ""), flush=True)
    return ok


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


try:
    # ---- 1. session_advantages ---------------------------------------------
    # By hand. T = 3, one environment, gamma = lam = 0.5, last value 40.
    #   rewards 1 2 3, values 10 20 30, the attempt ends at t = 1.
    # t = 2 (alive):  delta = 3 + 0.5 * 40 - 30 = -7            A = -7
    # t = 1 (ended):  session goes on, carry 0.25:
    #                 delta = 2 + 0.25 * 30 - 20 = -10.5         A = -10.5 (nothing from t = 2)
    #                 session ended, or carry 0: delta = 2 - 20  A = -18
    # t = 0 (alive):  delta = 1 + 0.5 * 20 - 10 = 1
    #                 A = 1 + 0.25 * (-10.5) = -1.625            or 1 + 0.25 * (-18) = -3.5
    col = lambda *v: torch.tensor(v, dtype=torch.float64).reshape(-1, 1)
    r, v, last = col(1, 2, 3), col(10, 20, 30), torch.tensor([40.0], dtype=torch.float64)
    adv, ret = session_advantages(r, v, col(0, 1, 0), col(0, 0, 0), last, 0.5, 0.5, carry=0.25)
    check(adv.flatten().tolist() == [-1.625, -10.5, -7.0] and ret.flatten().tolist() == [8.375, 9.5, 23.0],
          "session_advantages by hand, carry 0.25, session goes on: advantages -1.625, -10.5, -7 and returns 8.375, 9.5, 23", str(adv.flatten().tolist()))
    adv, _ = session_advantages(r, v, col(0, 1, 0), col(0, 1, 0), last, 0.5, 0.5, carry=0.25)
    check(adv.flatten().tolist() == [-3.5, -18.0, -7.0], "by hand, carry 0.25, the attempt was the session's last: nothing is carried (-3.5, -18, -7)", str(adv.flatten().tolist()))
    adv, _ = session_advantages(r, v, col(0, 1, 0), col(0, 0, 0), last, 0.5, 0.5, carry=0.0)
    check(adv.flatten().tolist() == [-3.5, -18.0, -7.0], "by hand, carry 0: the same as a session end")
    # The attempt ends on the rollout's last step: the next attempt's first
    # value is `last_value`. delta = 3 + 0.25 * 40 - 30 = -17.
    adv, _ = session_advantages(r, v, col(0, 0, 1), col(0, 0, 0), last, 0.5, 0.5, carry=0.25)
    check(adv[2, 0].item() == -17.0, "by hand: an attempt ending on the rollout's last step is carried the value after the rollout (-17)", str(adv.flatten().tolist()))
    # carry = 1 passes the whole (undiscounted) value: 2 + 30 - 20 = 12.
    adv, _ = session_advantages(r, v, col(0, 1, 0), col(0, 0, 0), last, 0.5, 0.5, carry=1.0)
    check(adv[1, 0].item() == 12.0, "by hand, carry 1: the ending step gets the next attempt's first value in full (12)")

    def slow_reference(rewards, values, dones, session_ends, last_value, gamma, lam, carry):
        """From the definition, one environment and one step at a time:
        A[t] = sum over l >= 0 of (gamma lam)^l delta[t + l], stopping after
        the first step that ends an attempt."""
        T, N = rewards.shape
        out = [[0.0] * N for _ in range(T)]
        for n in range(N):
            for t in range(T):
                total, weight = 0.0, 1.0
                for u in range(t, T):
                    nxt = float(last_value[n]) if u == T - 1 else float(values[u + 1][n])
                    ended = float(dones[u][n]) == 1.0
                    delta = float(rewards[u][n]) - float(values[u][n])
                    if not ended:
                        delta += gamma * nxt
                    elif float(session_ends[u][n]) != 1.0:
                        delta += carry * nxt
                    total += weight * delta
                    if ended:
                        break
                    weight *= gamma * lam
                out[t][n] = total
        return torch.tensor(out, dtype=torch.float64)

    gen = torch.Generator().manual_seed(3)
    T, N = 60, 5
    rewards = torch.randn(T, N, generator=gen, dtype=torch.float64)
    values = torch.randn(T, N, generator=gen, dtype=torch.float64) * 5
    dones = (torch.rand(T, N, generator=gen) < 0.15).double()
    dones[-1, 0] = 1.0                                        # one attempt ends on the last step
    session_ends = dones * (torch.rand(T, N, generator=gen) < 0.4).double()
    last = torch.randn(N, generator=gen, dtype=torch.float64) * 5
    for carry in (0.0, 0.3, 1.0):
        ours, returns = session_advantages(rewards, values, dones, session_ends, last, 0.995, 0.9, carry=carry)
        gap = (ours - slow_reference(rewards, values, dones, session_ends, last, 0.995, 0.9, carry)).abs().max().item()
        check(gap < 1e-9 and torch.equal(returns, ours + values),
              f"session_advantages equals the slow reference on {T} x {N} random steps, carry {carry} (largest difference {gap:.1e}; {int(dones.sum())} attempt ends, {int(session_ends.sum())} session ends)")
    theirs, their_returns = compute_advantages(rewards, values, dones, last, 0.995, 0.9)
    ours, our_returns = session_advantages(rewards, values, dones, session_ends, last, 0.995, 0.9, carry=0.0)
    check(torch.equal(ours, theirs) and torch.equal(our_returns, their_returns), "carry 0: identical to train_ppo.py's compute_advantages, whatever the session flags")
    carried, _ = session_advantages(rewards, values, dones, session_ends, last, 0.995, 0.9, carry=0.3)
    goes_on = (dones * (1 - session_ends)) == 1
    nxt = torch.cat([values[1:], last.reshape(1, N)])
    check(torch.allclose((carried - ours)[goes_on], 0.3 * nxt[goes_on], atol=1e-12) and ((carried - ours)[dones == 1][session_ends[dones == 1] == 1].abs().max().item() == 0),
          "carry 0.3: each attempt end inside a session gains exactly 0.3 x the next attempt's first value; session ends gain nothing")
    stray = session_ends.clone()
    stray[dones == 0] = 1.0                                   # a session flag where no attempt ended
    again, _ = session_advantages(rewards, values, dones, stray, last, 0.995, 0.9, carry=0.3)
    check(torch.equal(again, carried), "a session flag on a step that did not end an attempt changes nothing")

    # ---- 2. the warm start ---------------------------------------------------
    saved = torch.load(GENERALIST, map_location="cpu", weights_only=False)
    tracks = sorted(set(saved["track"].split(",")))
    check(saved["obs_size"] == BASE_OBS == 352 and MEM_SIZE == 130 and saved["hidden"] == 256,
          "the generalist checkpoint has 352 inputs and 256 hidden units; the memory adds 130")
    check(len(tracks) == 14 and not {"desert3", "summer3", "winter4"} & set(tracks),
          f"the checkpoint's own track list has 14 tracks and not desert3, summer3 or winter4 ({', '.join(tracks)})")
    old = Agent(saved["obs_size"], saved["num_actions"], saved["hidden"])
    old.load_state_dict(saved["model"])
    agent = MemoryAgent.from_checkpoint(GENERALIST)
    state, model = agent.state_dict(), saved["model"]
    first = ("actor.0.weight", "critic.0.weight")
    check(all(state[k].shape == (256, 482) and torch.equal(state[k][:, :352], model[k]) and state[k][:, 352:].abs().max().item() == 0 for k in first),
          "warm start: the first layers are the checkpoint's 352 columns, bit for bit, followed by 130 columns of zeros")
    check(all(torch.equal(state[k], model[k]) for k in model if k not in first) and set(state) == set(model),
          "warm start: every other weight and bias is the checkpoint's, bit for bit")
    probe = torch.empty(4096, BASE_OBS + MEM_SIZE).uniform_(-3, 3)
    with torch.no_grad():
        actor_gap = (old.actor(probe[:, :BASE_OBS]) - agent.actor(probe)).abs().max().item()
        critic_gap = (old.critic(probe[:, :BASE_OBS]) - agent.critic(probe)).abs().max().item()
        same_choice = torch.equal(old.greedy(probe[:, :BASE_OBS]), agent.greedy(probe))
    check(actor_gap < 1e-4 and critic_gap < 1e-3,
          f"warm start: same 22 scores and same value as the checkpoint on 4096 random inputs, memory part random too (largest differences {actor_gap:.1e}, {critic_gap:.1e})")
    check(same_choice, "warm start: the top-choice decision is the same on all 4096")
    try:
        MemoryAgent.from_checkpoint(ROOT / "rl" / "checkpoints" / "does-not-exist.pt")
        missing_refused = False
    except Exception:
        missing_refused = True
    check(missing_refused, "from_checkpoint on a missing file raises")

    # ---- 3. attempts.mjs with the warm-started actor --------------------------
    warm_file = TMP / "g2-5-test-warm.actor.bin"
    write_actor(agent, warm_file)
    expected_bytes = 4 * (482 * 256 + 256 + 256 * 256 + 256 + 22 * 256 + 22)
    check(warm_file.stat().st_size == expected_bytes, f"write_actor: three layers of float32, {expected_bytes} bytes for 482 inputs")
    plain_file = TMP / "g2-5-test-plain.actor.bin"
    write_actor(old, plain_file)
    check(plain_file.read_bytes() == (ROOT / "rl" / "checkpoints" / "ppo_blkgen.best2.actor.bin").read_bytes(),
          "write_actor on the 352-input agent gives the same file as rl/export_actor.py did")

    run = subprocess.run(["node", "ideas/g2-5-memory-policy/attempts.mjs", "track=desert3", f"policy={rel(warm_file)}",
                          "attempts=2", "sessions=1", "sabotage=60", f"out={rel(TMP / 'rec')}"],
                         cwd=ROOT, capture_output=True, text=True, timeout=110)
    if not check(run.returncode == 0, "attempts.mjs: two attempts on desert3 with the warm-started 482-input actor ran", run.stderr[-500:]):
        raise SystemExit
    meta = json.loads((TMP / "rec.json").read_text())
    data = np.fromfile(TMP / "rec.bin", dtype=np.float32).reshape(meta["rows"], meta["row"])
    n = meta["obsSize"]
    check(n == 482 and meta["baseObsSize"] == 352 and meta["memSize"] == 130 and meta["row"] == 482 + 6 + 3 + 22, "attempts.mjs rows: 482 inputs, 6 decision numbers, reward, two flags, 22 scores")
    obs = torch.as_tensor(data[:, :n])
    actions = torch.as_tensor(data[:, n:n + 6]).long()
    rewards, dones, session_ends = (torch.as_tensor(data[:, n + 6 + k]) for k in range(3))
    node_scores = torch.as_tensor(data[:, n + 9:])
    ends = dones.nonzero().flatten().tolist()
    report = meta["report"]
    check(len(ends) == 2 and ends[-1] == len(obs) - 1 and len(report) == 2, f"two attempts recorded, {ends[0] + 1} and {len(obs) - ends[0] - 1} decisions, the last row ends the second")
    check(session_ends.nonzero().flatten().tolist() == [len(obs) - 1], "the session-end flag is on the last decision of the last attempt only")
    one, two = obs[:ends[0] + 1], obs[ends[0] + 1:]
    check(report[0]["reason"] in ("off track", "off line", "stalled") and report[0]["memoryPeak"] == 0 and one[:, BASE_OBS:].abs().max().item() == 0,
          f"attempt 1 ({report[0]['reason']} at {report[0]['crashAt']} units): every memory input of every recorded observation is exactly 0")
    check(two[0, BASE_OBS + 126].item() == 0.125 and two[:, BASE_OBS:].abs().max().item() > 0 and report[1]["crashAheadPeak"] > 0,
          "attempt 2: 'attempts so far' reads 1/8 and the crash of attempt 1 shows ahead")
    check(bool((actions[:60, :] != torch.tensor([1, 0, 1, 0, 0, 0])).any()) and bool((actions[60:ends[0] + 1] == torch.tensor([1, 0, 1, 0, 0, 0])).all()),
          "sabotage=60: W + left from decision 60 of attempt 1 to its end, and not before")
    with torch.no_grad():
        torch_scores = agent.actor(obs)
        gap = (torch_scores - node_scores).abs().max().item()
        old_scores = old.actor(obs[:, :BASE_OBS])
    check(gap < 1e-4, f"Node and PyTorch agree on the 22 scores for all {len(obs)} recorded 482-number observations (largest difference {gap:.1e})")
    check((old_scores - node_scores).abs().max().item() < 1e-4, "and both agree with the 352-input checkpoint on the first 352 numbers: the warm start drives as the generalist does")
    free = torch.ones(len(obs), dtype=torch.bool)
    free[60:ends[0] + 1] = False                              # the sabotaged decisions were not the policy's
    with torch.no_grad():
        check(torch.equal(agent.greedy(obs)[free], actions[free]), "the decisions attempts.mjs drove are PyTorch's top choices for the same observations")
        _, lp_new, ent_new, val_new = agent.act(obs, actions)
        _, lp_old, ent_old, val_old = old.act(obs[:, :BASE_OBS], actions)
    check(torch.allclose(lp_new, lp_old, atol=1e-4) and torch.allclose(val_new, val_old, atol=1e-3) and torch.allclose(ent_new, ent_old, atol=1e-4),
          "act() on 482 inputs gives the checkpoint's log-probabilities, entropies and values (the keys-held inputs it reads are in the first 352)")

    # ---- 4. Node against PyTorch with memory weights that are not zero ---------
    busy = copy.deepcopy(agent)
    with torch.no_grad():
        busy.actor[0].weight[:, BASE_OBS:] = 0.05 * torch.randn(256, MEM_SIZE)
    busy_file = TMP / "g2-5-test-busy.actor.bin"
    write_actor(busy, busy_file)
    obs.numpy().astype(np.float32).tofile(TMP / "obs.bin")
    run = subprocess.run(["node", "ideas/g2-5-memory-policy/tests/node_scores.mjs", rel(busy_file), rel(TMP / "obs.bin"), rel(TMP / "scores.bin"), "482"],
                         cwd=ROOT, capture_output=True, text=True, timeout=60)
    if check(run.returncode == 0, "node_scores.mjs ran", run.stderr[-500:]):
        busy_node = torch.as_tensor(np.fromfile(TMP / "scores.bin", dtype=np.float64).reshape(len(obs), 22)).float()
        with torch.no_grad():
            busy_torch = busy.actor(obs)
        gap = (busy_torch - busy_node).abs().max().item()
        moved_two = (busy_torch - torch_scores)[ends[0] + 1:].abs().max().item()
        moved_one = (busy_torch - torch_scores)[:ends[0] + 1].abs().max().item()
        check(gap < 1e-4, f"with random memory weights Node and PyTorch still agree on every score (largest difference {gap:.1e})")
        check(moved_two > 1e-2 and moved_one == 0,
              f"those weights change the scores on attempt 2 (by up to {moved_two:.2f}) and not at all on attempt 1, where the memory inputs are zero")

    # ---- 5. ppo_loss -------------------------------------------------------------
    T = len(obs)
    with torch.no_grad():
        _, logprob, _, value = busy.act(obs, actions)
    shape = lambda x: x.reshape(T, 1)
    adv, ret = session_advantages(shape(rewards), shape(value), shape(dones), shape(session_ends), torch.zeros(1), 0.995, 0.95, carry=0.5)
    adv, ret = adv.reshape(-1), ret.reshape(-1)
    old_lp = logprob + 0.3 * torch.randn(T)                    # so that the clipping matters
    loss, parts = ppo_loss(busy, obs, actions, old_lp, adv, ret, clip=0.2, value_weight=0.5, entropy_coef=0.01)
    with torch.no_grad():
        _, new_lp, entropy, new_value = busy.act(obs, actions)
        ratio = torch.exp(new_lp - old_lp)
        norm = (adv - adv.mean()) / (adv.std() + 1e-8)
        policy = -torch.minimum(ratio * norm, torch.clamp(ratio, 0.8, 1.2) * norm).mean()
        value_loss = 0.5 * ((new_value - ret) ** 2).mean()
        expected = policy + 0.5 * value_loss - 0.01 * entropy.mean()
    check(abs(loss.item() - expected.item()) < 1e-5 and abs(parts["policy"] - policy.item()) < 1e-5 and abs(parts["value"] - value_loss.item()) < 1e-4 and abs(parts["entropy"] - entropy.mean().item()) < 1e-5,
          f"ppo_loss equals the clipped objective + 0.5 x value error - 0.01 x entropy written out here ({loss.item():.4f})")
    check(int(((ratio < 0.8) | (ratio > 1.2)).sum()) > 0, "(the test case has ratios outside the clip range, so the clipping is exercised)")
    warm_loss, _ = ppo_loss(agent, obs, actions, old_lp, adv, ret)
    agent.zero_grad()
    warm_loss.backward()
    g_actor = agent.actor[0].weight.grad[:, BASE_OBS:].abs().max().item()
    g_critic = agent.critic[0].weight.grad[:, BASE_OBS:].abs().max().item()
    check(g_actor > 0 and g_critic > 0, f"the zero memory weights of the warm start receive gradient (actor {g_actor:.1e}, critic {g_critic:.1e})")

    # ---- 6. toy_probe.py ------------------------------------------------------------
    run = subprocess.run([sys.executable, str(IDEA / "toy_probe.py")], cwd=ROOT, capture_output=True, text=True, timeout=100)
    rows = {}
    for line in run.stdout.splitlines():
        m = re.match(r"(no memory|myopic|session)\s", line)
        if m:
            rows[m.group(1)] = [float(x) for x in re.findall(r"\d+\.\d+|\d+(?=%)", line)]
    readme = {"no memory": [0.359, 72, 0.359, 72, 0.359, 72, 0.359, 72, 1.796],
              "myopic": [0.359, 72, 0.444, 100, 0.444, 100, 0.444, 100, 2.134],
              "session": [0.344, 56, 0.412, 70, 0.524, 92, 0.566, 100, 2.412]}
    check(run.returncode == 0 and rows == readme, "toy_probe.py prints the README's table (tries 1, 2, 3, 5 and the sum, three drivers)", json.dumps(rows))
    # The first two rows by brute force over the 71 possible limits.
    speeds = [round(0.30 + 0.01 * k, 2) for k in range(71)]

    def best_now(lo, hi):          # the speed that is best for this attempt alone, L uniform on lo..hi-1
        return max(range(lo, hi), key=lambda a: speeds[a] * ((hi - a) / (hi - lo)))

    fixed = best_now(0, 71)
    score_fixed = sum(speeds[fixed] for L in range(71) if fixed <= L) / 71
    myopic = [0.0] * 5
    for L in range(71):
        lo, hi = 0, 71
        for k in range(5):
            a = best_now(lo, hi)
            if a <= L:
                myopic[k] += speeds[a] / 71
                lo = max(lo, a)
            else:
                hi = min(hi, a)
    check(abs(score_fixed - 0.359) < 5e-4 and abs(5 * score_fixed - 1.796) < 1e-3 and round(100 * sum(fixed <= L for L in range(71)) / 71) == 72,
          f"toy, no memory, by brute force: best fixed speed {speeds[fixed]:.2f}, score {score_fixed:.3f} per try, through 72%")
    check(abs(myopic[0] - 0.359) < 5e-4 and all(abs(x - 0.444) < 5e-4 for x in myopic[1:]) and abs(sum(myopic) - 2.134) < 1e-3,
          f"toy, memory used for each attempt alone, by brute force: {', '.join(f'{x:.3f}' for x in myopic)}, sum {sum(myopic):.3f}")
    # The session-optimal driver by a memoised search written here.
    from functools import lru_cache

    @lru_cache(maxsize=None)
    def best(lo, hi, left):
        if left == 0:
            return 0.0
        top = 0.0
        for a in range(lo, hi):
            p = (hi - a) / (hi - lo)
            top = max(top, p * (speeds[a] + best(a, hi, left - 1)) + (1 - p) * best(lo, a, left - 1))
        return top

    total = best(0, 71, 5)
    check(abs(total - 2.412) < 1e-3, f"toy, best over the session, by an independent search: {total:.3f} over 5 attempts (README 2.412)")
    share = (sum(myopic) - 5 * score_fixed) / (total - 5 * score_fixed)
    check(round(100 * share) == 55, f"README: using the memory without exploring gets 55% of the possible gain (here {100 * share:.1f}%)")
finally:
    shutil.rmtree(TMP, ignore_errors=True)

print(f"# {passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
