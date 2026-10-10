"""Replay buffer: every decision the simulators have driven, kept and reused.

PPO (rl/train_ppo.py) learns from each decision for four passes and throws it
away. The simulators are the slow part of this project, so that is the
expensive thing to waste. Here every decision goes into a large ring of
memory and is drawn again and again at random (about 32 times each over its
life with the default settings), which is the point of learning "off-policy".

LAYOUT. The servers each drive the same number of decisions per round, so the
memory is a table indexed [row, environment], like the trainer's buffers:
row r of environment e is followed in time by row r + 1 of environment e. A
write pointer goes round; when the table is full the oldest rows are
overwritten. Per decision it holds

    obs     what the decision was made from (float16: the observation is
            within +-3 and already rounded; half the memory of float32,
            0.7 GB per million decisions instead of 1.4)
    action  the action number
    reward  what it earned
    stop    0 the episode went on
            1 the episode ended for good with this decision (finished, or
              crashed / stalled / left the track): nothing more to come
            2 the episode was cut off by the tick limit: more WAS to come,
              but the observation after it was not kept

NO "NEXT OBSERVATION" IS STORED. The observation after row r is row r + 1's.
The two places where that is not true are handled in n_step():
  - after a stop of kind 1 no next observation is needed (nothing follows);
  - a stop of kind 2, and the newest row (whose successor is not written
    yet), are treated as the END OF WHAT IS KNOWN: a return that reaches such
    a row stops just before it and estimates the rest from that row's own
    observation. The row itself is never the start of a sample. This costs
    one unusable decision per cut-off episode and stores nothing extra.

N-STEP RETURNS. A sample starting at row t is
    R = r[t] + g r[t+1] + ... + g^(n-1) r[t+n-1],   then  + g^n x (value of obs[t+n])
The value part is the learner's own estimate; real rewards for the first n
decisions make the target less dependent on it and carry news of a crash back
n decisions per update instead of one.
"""
from __future__ import annotations

import numpy as np

GO, END, CUT = 0, 1, 2


class ReplayBuffer:
    def __init__(self, rows: int, envs: int, obs_size: int, obs_dtype=np.float16):
        self.rows, self.envs = rows, envs
        self.obs = np.zeros((rows, envs, obs_size), dtype=obs_dtype)
        self.action = np.zeros((rows, envs), dtype=np.int64)
        self.reward = np.zeros((rows, envs), dtype=np.float32)
        self.stop = np.zeros((rows, envs), dtype=np.uint8)
        self.next_row = 0   # where the next write goes
        self.filled = 0     # rows holding data (grows to `rows` and stays)

    def __len__(self) -> int:
        """Decisions held."""
        return self.filled * self.envs

    @property
    def newest(self) -> int:
        """The row written last."""
        return (self.next_row - 1) % self.rows

    def add(self, obs: np.ndarray, action: np.ndarray, reward: np.ndarray, stop: np.ndarray) -> None:
        """Append T rows: obs (T, envs, obs_size), the rest (T, envs)."""
        count = obs.shape[0]
        if count > self.rows:
            raise ValueError("more rows in one write than the buffer holds")
        at = (self.next_row + np.arange(count)) % self.rows
        self.obs[at], self.action[at], self.reward[at], self.stop[at] = obs, action, reward, stop
        self.next_row = (self.next_row + count) % self.rows
        self.filled = min(self.rows, self.filled + count)

    def cut(self, env: int) -> None:
        """Mark the newest row of one environment as a cut-off (stop 2).

        For when the caller knows that environment's NEXT row will not follow
        from this one: train_iqn.py takes a simulator away for an evaluation
        lap, and the server then starts a new episode in the next round
        (`currentObs = null` at the end of evaluate in iqn_server.mjs). Left
        marked "the episode goes on", the last row before the evaluation
        would chain into that unrelated episode: its rewards would be added
        to returns that start up to n - 1 rows earlier, and the estimate
        taken from one of its observations. Found by tests/test_train_toy.py:
        lap fraction 0.017 followed by 0.264 under a "goes on" flag.
        A row on which the episode really ended (stop 1) is left alone."""
        if self.filled and self.stop[self.newest, env] == GO:
            self.stop[self.newest, env] = CUT

    def _unknown_after(self, row: np.ndarray, env: np.ndarray) -> np.ndarray:
        """True where nothing is known beyond this row's observation."""
        return (self.stop[row, env] == CUT) | (row == self.newest)

    def n_step(self, row: np.ndarray, env: np.ndarray, n: int, gamma: float):
        """n-step returns for samples starting at (row, env).

        Returns (ret, boot_row, boot_discount):
            ret            the discounted rewards actually collected
            boot_row       row whose observation the rest is estimated from
            boot_discount  what that estimate is multiplied by: gamma^k after k
                           collected rewards, or 0 if the episode ended for good
                           inside the n decisions (then boot_row is not used)
        The target for the sample is  ret + boot_discount x value(obs[boot_row, env]).
        """
        count = len(row)
        ret = np.zeros(count, dtype=np.float32)
        discount = np.ones(count, dtype=np.float32)     # gamma^k while walking
        boot_row = (row + n) % self.rows                # the usual case: n rows on
        boot_discount = np.full(count, gamma ** n, dtype=np.float32)
        walking = np.ones(count, dtype=bool)            # samples still collecting rewards
        for k in range(n):
            at = (row + k) % self.rows
            # The end of what is known: estimate the rest from here, collect nothing more.
            edge = walking & self._unknown_after(at, env)
            boot_row[edge], boot_discount[edge] = at[edge], discount[edge]
            walking &= ~edge
            ret += walking * discount * self.reward[at, env]
            # A real ending: its reward was collected, and nothing follows.
            ended = walking & (self.stop[at, env] == END)
            boot_discount[ended] = 0.0
            walking &= ~ended
            discount *= gamma
        return ret, boot_row, boot_discount

    def sample(self, batch: int, n: int, gamma: float, rng: np.random.Generator) -> dict:
        """`batch` decisions drawn uniformly from everything held, as arrays:
        obs, action, ret, next_obs, boot_discount (see n_step)."""
        if self.filled < 2:
            raise ValueError("nothing to sample yet")
        row = rng.integers(self.filled, size=batch)
        env = rng.integers(self.envs, size=batch)
        # A row with nothing known after it cannot start a sample; draw those again.
        bad = self._unknown_after(row, env)
        while bad.any():
            row[bad] = rng.integers(self.filled, size=int(bad.sum()))
            env[bad] = rng.integers(self.envs, size=int(bad.sum()))
            bad = self._unknown_after(row, env)
        ret, boot_row, boot_discount = self.n_step(row, env, n, gamma)
        return {
            "obs": self.obs[row, env].astype(np.float32),
            "action": self.action[row, env],
            "ret": ret,
            "next_obs": self.obs[boot_row, env].astype(np.float32),
            "boot_discount": boot_discount,
        }
