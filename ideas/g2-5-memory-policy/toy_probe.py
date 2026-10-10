"""A toy that puts numbers on the design comparison. No simulator, no training:
exact expectations by dynamic programming, a second on one CPU core.

    .venv/Scripts/python ideas/g2-5-memory-policy/toy_probe.py

THE TOY. One corner with a speed limit L the driver cannot see, different on
every track (uniform on 0.30, 0.31, ... 1.00). An attempt picks a speed v. If
v <= L it gets through and scores v (faster is better); otherwise it crashes
and scores 0. Five attempts on the same track.

What the driver can know after some attempts is exactly the memory of
track_memory.mjs for this corner: the highest speed that got through
(passSpeed) and the lowest that crashed (failSpeed). So three drivers can be
compared exactly:

  no memory     one fixed speed, the best single choice. Today's policy.
  myopic        reads the memory and picks the speed that is best for THIS
                attempt. What design B learns when every attempt is its own
                episode (carry = 0 in memory_agent.py).
  session       reads the same memory and picks the speed that is best for the
                sum over all five attempts, so it will risk a crash early to
                learn the limit. The best ANY design can do, including a
                recurrent RL-squared policy (design A): the memory is a
                sufficient statistic here, so recurrence cannot beat it. It is
                also what design B is trained towards with carry = 1.

The question the toy answers: how much of the gain from memory comes from
merely USING it (B, simple), and how much needs exploring on purpose (the part
that makes A hard)?
"""
import numpy as np

speeds = np.round(np.arange(0.30, 1.0001, 0.01), 2)   # index a -> speed
K, ATTEMPTS = len(speeds), 5

# What is known: L's index lies in lo .. hi-1 (lo = highest index that got
# through, or 0; hi = lowest that crashed, or K). L is uniform on that range.


def p_through(a: int, lo: int, hi: int) -> float:
    """Chance that speed index a gets through, given what is known."""
    if a <= lo:
        return 1.0
    if a >= hi:
        return 0.0
    return (hi - a) / (hi - lo)


# ---- the three drivers -------------------------------------------------------
fixed = max(range(K), key=lambda a: speeds[a] * p_through(a, 0, K))


def myopic(lo: int, hi: int, left: int) -> int:
    return max(range(lo, hi), key=lambda a: speeds[a] * p_through(a, lo, hi))


# Session-optimal by backward induction: best[left][lo][hi] = expected score
# over the `left` attempts still to come.
best = np.zeros((ATTEMPTS + 1, K + 1, K + 1))
choice = np.zeros((ATTEMPTS + 1, K + 1, K + 1), dtype=int)
for left in range(1, ATTEMPTS + 1):
    for lo in range(K):
        for hi in range(lo + 1, K + 1):
            values = []
            for a in range(lo, hi):
                p = p_through(a, lo, hi)
                values.append(p * (speeds[a] + best[left - 1][a][hi]) + (1 - p) * best[left - 1][lo][a])
            choice[left][lo][hi] = lo + int(np.argmax(values))
            best[left][lo][hi] = max(values)


def session(lo: int, hi: int, left: int) -> int:
    return int(choice[left][lo][hi])


def play(driver):
    """Exact expected score and chance of getting through on each attempt."""
    states = {(0, K): 1.0}          # (lo, hi) -> probability
    score, through = [], []
    for attempt in range(ATTEMPTS):
        s = t = 0.0
        following = {}
        for (lo, hi), weight in states.items():
            a = driver(lo, hi, ATTEMPTS - attempt)
            p = p_through(a, lo, hi)
            s += weight * p * speeds[a]
            t += weight * p
            for state, w in (((max(lo, a), hi), weight * p), ((lo, min(hi, a)), weight * (1 - p))):
                if w > 0:
                    following[state] = following.get(state, 0.0) + w
        states = following
        score.append(s)
        through.append(t)
    return score, through


print(f"hidden limit uniform on {speeds[0]:.2f}..{speeds[-1]:.2f}; score = speed if through, 0 if crashed; {ATTEMPTS} attempts")
print(f"{'driver':<12}" + "".join(f"  try {k + 1}: score / through" for k in (0, 1, 2, 4)) + "   sum of 5")
rows = {}
for name, driver in (("no memory", lambda lo, hi, left: fixed), ("myopic", myopic), ("session", session)):
    score, through = play(driver)
    rows[name] = score
    print(f"{name:<12}" + "".join(f"       {score[k]:.3f} / {100 * through[k]:3.0f}%      " for k in (0, 1, 2, 4)) + f"   {sum(score):.3f}")
print(f"(mean limit, the score of a driver who is told L: {speeds.mean():.3f} per attempt)")
gain_use = sum(rows["myopic"]) - sum(rows["no memory"])
gain_all = sum(rows["session"]) - sum(rows["no memory"])
print(f"gain over no memory, summed over 5 attempts: myopic {gain_use:.3f}, session-optimal {gain_all:.3f} "
      f"-> using the memory without exploring on purpose gets {100 * gain_use / gain_all:.0f}% of what is there")
