"""Smoke test of the memory policy, end to end. CPU, one simulator, under a minute.

    .venv/Scripts/python ideas/g2-5-memory-policy/smoke_test.py        (from the project root)

Steps, each printed with its numbers; any failed check raises.

  1. WARM START. Build a MemoryAgent from the trained generalist
     (rl/checkpoints/ppo_blkgen.best2.pt) and check it gives the generalist's
     outputs whatever the memory inputs hold. Write its actor for Node.
  2. TWO ATTEMPTS IN NODE. attempts.mjs drives two consecutive attempts on
     desert3 (a track the generalist was not trained on) with that actor,
     evaluated by the shared Node policy code on the 482-number observation.
     Attempt 1 is steered off the road on purpose from decision 60 (3 s in),
     so that attempt 2 has a crash to remember.
  3. THE OBSERVATIONS. Attempt 1's memory inputs are all zero; attempt 2's
     are not, and its "crash ahead" input lights up before the crash site.
  4. NODE AND TORCH AGREE on the 22 scores for every recorded observation.
  5. FORWARD AND LOSS. Log-probabilities and values for the recorded
     decisions, advantages over the two attempts (carry 0 and 0.5), the PPO
     loss, a backward pass and one optimizer step; the memory weights receive
     gradient.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import torch

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "rl"))
from memory_agent import BASE_OBS, MEM_SIZE, MemoryAgent, ppo_loss, session_advantages, write_actor  # noqa: E402
from train_ppo import Agent, compute_advantages  # noqa: E402

GENERALIST = ROOT / "rl" / "checkpoints" / "ppo_blkgen.best2.pt"
OUT = HERE / "out"
OUT.mkdir(exist_ok=True)
torch.manual_seed(0)


def check(ok: bool, what: str) -> None:
    print(("  ok    " if ok else "  FAIL  ") + what)
    if not ok:
        raise SystemExit(1)


# ---- 1. warm start ---------------------------------------------------------
print("1. warm start from", GENERALIST.name)
saved = torch.load(GENERALIST, map_location="cpu", weights_only=False)
old = Agent(saved["obs_size"], saved["num_actions"], saved["hidden"])
old.load_state_dict(saved["model"])
agent = MemoryAgent.from_checkpoint(GENERALIST)
probe = torch.empty(2048, BASE_OBS + MEM_SIZE).uniform_(-3, 3)
with torch.no_grad():
    gap = max((old.actor(probe[:, :BASE_OBS]) - agent.actor(probe)).abs().max().item(),
              (old.critic(probe[:, :BASE_OBS]) - agent.critic(probe)).abs().max().item())
check(saved["obs_size"] == BASE_OBS, f"the generalist has {BASE_OBS} inputs; the memory agent {BASE_OBS + MEM_SIZE}")
check(gap < 1e-4, f"same actor and critic outputs as the generalist on 2048 random inputs (largest difference {gap:.1e})")
actor_file = OUT / "g2-5-warm.actor.bin"
write_actor(agent, actor_file)

# ---- 2. two attempts in Node -----------------------------------------------
print("2. two attempts on desert3 in Node (attempt 1 steered off the road at decision 60)")
run = subprocess.run(
    ["node", "ideas/g2-5-memory-policy/attempts.mjs", "track=desert3", f"policy={actor_file.relative_to(ROOT).as_posix()}",
     "attempts=2", "sessions=1", "sabotage=60", f"out={(OUT / 'smoke').relative_to(ROOT).as_posix()}"],
    cwd=ROOT, capture_output=True, text=True, timeout=110)
print("\n".join("     " + line for line in run.stdout.strip().splitlines()))
check(run.returncode == 0, "attempts.mjs ran" + ("" if run.returncode == 0 else ": " + run.stderr[-400:]))

meta = json.loads((OUT / "smoke.json").read_text())
data = np.fromfile(OUT / "smoke.bin", dtype=np.float32).reshape(meta["rows"], meta["row"])
check(meta["obsSize"] == BASE_OBS + MEM_SIZE and meta["memSize"] == MEM_SIZE and meta["baseObsSize"] == BASE_OBS,
      f"Node and Python agree on the sizes ({BASE_OBS} + {MEM_SIZE})")
n = meta["obsSize"]
obs = torch.as_tensor(data[:, :n])
actions = torch.as_tensor(data[:, n:n + 6]).long()
rewards, dones, session_ends = (torch.as_tensor(data[:, n + 6 + k]) for k in range(3))
node_scores = torch.as_tensor(data[:, n + 9:])

# ---- 3. the observations ---------------------------------------------------
print("3. the memory inputs across the two attempts")
first_end = int(dones.nonzero()[0])                  # last decision of attempt 1
one, two = obs[:first_end + 1, BASE_OBS:], obs[first_end + 1:, BASE_OBS:]
crash_at = meta["report"][0]["crashAt"]
check(meta["report"][0]["reason"] in ("off track", "off line", "stalled"), f"attempt 1 crashed ({meta['report'][0]['reason']} at progress {crash_at} units)")
check(len(two) > 0 and one.abs().max().item() == 0, f"attempt 1 ({len(one)} decisions): every memory input is 0")
check(two[0, 126].item() == 0.125 and two[0, 127].item() == 0, "attempt 2, first observation: 'attempts so far' reads 1/8, 'has finished' 0")
crash_ahead = two[:, 1:126:6]                         # the crash input of each of the 21 stretches
lit = (crash_ahead > 0).any(dim=1)
check(bool(lit.any()), f"attempt 2: the crash-ahead input is lit on {int(lit.sum())} of {len(two)} decisions, "
      f"first at decision {int(lit.nonzero()[0])}, in stretch {int((crash_ahead[lit][0] > 0).nonzero()[0])} of 21 (furthest ahead first seen)")
check(bool((two[:, 4:126:6] > 0).any()) and bool((two[:, 2:126:6] > 0).any()),
      f"attempt 2 sees doomed speeds (largest {300 * two[:, 4:126:6].max().item():.0f} km/h) and surviving speeds "
      f"(largest {300 * two[:, 2:126:6].max().item():.0f} km/h) from attempt 1")

# ---- 4. Node and torch agree -----------------------------------------------
print("4. the Node actor against torch")
with torch.no_grad():
    scores_gap = (agent.actor(obs) - node_scores).abs().max().item()
check(scores_gap < 1e-3, f"22 scores on {len(obs)} recorded 482-number observations: largest difference {scores_gap:.1e}")

# ---- 5. forward and loss ---------------------------------------------------
print("5. forward, advantages, loss, one update")
T = len(obs)
with torch.no_grad():
    _, logprob, _, values = agent.act(obs, actions)
check(bool(torch.isfinite(logprob).all() and torch.isfinite(values).all()), f"log-probabilities and values for {T} decisions are finite")
shape = lambda x: x.reshape(T, 1)                     # [step, environment] with one environment
last_value = torch.zeros(1)                            # the recording ends with an attempt's end
ours, _ = session_advantages(shape(rewards), shape(values), shape(dones), shape(session_ends), last_value, 0.995, 0.95, carry=0.0)
theirs, _ = compute_advantages(shape(rewards), shape(values), shape(dones), last_value, 0.995, 0.95)
check(torch.allclose(ours, theirs), "carry 0: advantages equal train_ppo.py's compute_advantages")
carried, _ = session_advantages(shape(rewards), shape(values), shape(dones), shape(session_ends), last_value, 0.995, 0.95, carry=0.5)
moved = (carried - ours).abs().reshape(-1)
check(moved[first_end].item() > 0 and moved[first_end + 1:].max().item() == 0,
      f"carry 0.5: attempt 1's last step gains 0.5 x the value of attempt 2's start ({moved[first_end].item():.2f}); attempt 2 (the session's last) is unchanged")
advantages, returns = session_advantages(shape(rewards), shape(values), shape(dones), shape(session_ends), last_value, 0.995, 0.95)
optimizer = torch.optim.Adam(agent.parameters(), lr=3e-4, eps=1e-5)
loss, parts = ppo_loss(agent, obs, actions, logprob, advantages.reshape(-1), returns.reshape(-1))
optimizer.zero_grad()
loss.backward()
actor_grad = agent.actor[0].weight.grad[:, BASE_OBS:].abs().max().item()
critic_grad = agent.critic[0].weight.grad[:, BASE_OBS:].abs().max().item()
check(bool(torch.isfinite(loss)), f"PPO loss {loss.item():.3f} (policy {parts['policy']:.3f}, value {parts['value']:.3f}, entropy {parts['entropy']:.2f})")
check(actor_grad > 0 and critic_grad > 0, f"the zero-initialised memory weights receive gradient (actor {actor_grad:.1e}, critic {critic_grad:.1e})")
torch.nn.utils.clip_grad_norm_(agent.parameters(), 0.5)
optimizer.step()
with torch.no_grad():
    changed = agent.actor[0].weight[:, BASE_OBS:].abs().max().item()
    after, _ = ppo_loss(agent, obs, actions, logprob, advantages.reshape(-1), returns.reshape(-1))
check(changed > 0 and bool(torch.isfinite(after)), f"after one Adam step the memory weights are non-zero (largest {changed:.1e}) and the loss is finite ({after.item():.3f})")
print("all checks passed")
