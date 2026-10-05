"""Python side of the PolyTrack RL environment.

The simulator is JavaScript (sim/), so each environment is a separate Node
process running rl/env_server.mjs. This module starts those processes and
talks to them over their standard input/output, one line of JSON per request
and per reply (the protocol is described at the top of env_server.mjs).

Three classes, from low level to high level:

    EnvServer         one Node process; send a request, get the reply
    PolytrackEnv      one environment with the usual Gymnasium interface:
                          obs, info = env.reset()
                          obs, reward, terminated, truncated, info = env.step(action)
    PolytrackVecEnv   N environments stepped together, each in its own
                      process, with automatic reset when an episode ends

Observation: 101 float32 numbers, roughly within -1..1 (layout in
rl/racing_env.mjs). Action: an integer 0..8 (pedal x steer key combinations).

Only numpy is required. If the `gymnasium` package is installed, PolytrackEnv
is a real `gymnasium.Env` with `observation_space` and `action_space`, so
libraries such as Stable-Baselines3 accept it. If it is not installed the
class works the same way without those two attributes.

Nothing here opens a network connection: the only communication is the pipe
to the local Node process.

Run this file directly for a quick check with random actions:
    python rl/polytrack_env.py            (from the project root or anywhere)
"""
from __future__ import annotations

import base64
import json
import queue
import threading
import shutil
import subprocess
import sys
import time
from pathlib import Path

import numpy as np

try:  # optional dependency, see the module docstring
    import gymnasium as gym
except ImportError:
    gym = None

# The project root is the folder above rl/. The server must be started from
# there because the simulator finds its files relative to it.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
SERVER_SCRIPT = "rl/env_server.mjs"


class EnvServer:
    """One Node environment process and the request/reply pipe to it."""

    def __init__(self, show_stderr: bool = False, **options):
        """Start the server and wait until its simulator has booted (about 1 s).

        options      passed to the server as key=value arguments; any key from
                     DEFAULTS in rl/racing_env.mjs, e.g. track="summer1",
                     ticks=10, randomStart=0.5, seed=3
        show_stderr  let the server's error output through to this terminal.
                     Off by default because every simulator prints a harmless
                     "wasm streaming compile failed" line when it starts.
        """
        node = shutil.which("node")
        if node is None:
            raise RuntimeError("Node.js was not found on PATH; the simulator needs Node 20+")
        args = [node, SERVER_SCRIPT] + [f"{key}={value}" for key, value in options.items()]
        self.proc = subprocess.Popen(
            args,
            cwd=PROJECT_ROOT,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            # DEVNULL rather than PIPE: a pipe nobody reads fills up and
            # would eventually freeze the server.
            stderr=None if show_stderr else subprocess.DEVNULL,
        )
        # The first line is the server's "ready" message with the sizes the
        # caller needs: obsSize, numActions, ticks, maxTicks, lineLength, ...
        self.spec = self._read()

    def _read(self) -> dict:
        """Read one reply line. Raises if the server died or reported an error."""
        line = self.proc.stdout.readline()
        if not line:
            raise RuntimeError(
                "the environment server exited unexpectedly; "
                "create it with show_stderr=True to see why"
            )
        reply = json.loads(line)
        if "error" in reply:
            raise RuntimeError(f"environment server: {reply['error']}")
        return reply

    def send(self, **request) -> None:
        """Write one request without waiting for the reply. PolytrackVecEnv
        uses this to set all its servers working before collecting answers."""
        self.proc.stdin.write(json.dumps(request).encode() + b"\n")
        self.proc.stdin.flush()

    def request(self, **request) -> dict:
        """Send one request and return its reply."""
        self.send(**request)
        return self._read()

    def close(self) -> None:
        """Ask the server to exit; kill it if it does not within 5 seconds."""
        if self.proc.poll() is None:
            try:
                self.send(cmd="close")
                self.proc.wait(timeout=5)
            except (OSError, subprocess.TimeoutExpired):
                self.proc.kill()
        for pipe in (self.proc.stdin, self.proc.stdout):
            try:
                pipe.close()
            except OSError:
                pass


def _obs(reply: dict) -> np.ndarray:
    """The observation from a reply, as the float32 array a network expects."""
    return np.asarray(reply["obs"], dtype=np.float32)


class PolytrackEnv(gym.Env if gym else object):
    """A single PolyTrack environment with the Gymnasium interface."""

    metadata = {"render_modes": []}  # headless: there is nothing to render

    def __init__(self, track: str = "summer1", ticks: int = 10, show_stderr: bool = False, **options):
        """
        track    'summer1' or 'winter1'
        ticks    physics ticks (milliseconds) each action is held for
        options  any other setting from DEFAULTS in rl/racing_env.mjs
        """
        self.server = EnvServer(show_stderr=show_stderr, track=track, ticks=ticks, **options)
        self.spec_info = self.server.spec  # sizes and limits reported by the server
        self.obs_size = self.spec_info["obsSize"]
        self.num_actions = self.spec_info["numActions"]
        if gym:
            # The server clips every observation value to +-3.
            self.observation_space = gym.spaces.Box(-3.0, 3.0, shape=(self.obs_size,), dtype=np.float32)
            self.action_space = gym.spaces.Discrete(self.num_actions)

    def reset(self, *, seed: int | None = None, options: dict | None = None):
        """Start a new lap attempt. Returns (observation, info).

        seed     re-seeds the server's choice of random start positions
        options  {"start_fraction": 0..1} starts that far through the human's
                 lap instead of on the start line (see reset() in racing_env.mjs)
        """
        request = {"cmd": "reset"}
        if seed is not None:
            request["seed"] = int(seed)
        if options and options.get("start_fraction") is not None:
            request["startFraction"] = float(options["start_fraction"])
        reply = self.server.request(**request)
        return _obs(reply), reply["info"]

    def step(self, action):
        """Hold the keys for `action` (0..8) for `ticks` ticks.

        Returns (observation, reward, terminated, truncated, info):
          terminated  the car finished the lap
          truncated   the attempt was cut off; info["reason"] says why:
                      'stalled', 'off line' or 'time limit'
        """
        reply = self.server.request(cmd="step", action=int(action))
        return _obs(reply), float(reply["reward"]), reply["terminated"], reply["truncated"], reply["info"]

    def save_lap(self, run: str = "rl") -> dict:
        """After a finished lap: write runs/<run>_<track>.json for
        scripts/export_recording.mjs. Returns {"saved": path, "finishFrames": n}."""
        return self.server.request(cmd="save", run=run)

    def close(self):
        self.server.close()


class PolytrackVecEnv:
    """N environments stepped together, one Node process each.

    All N servers are sent their action first and only then are the replies
    read, so the N simulators compute at the same time on separate CPU cores.

    When an episode ends, that environment is reset straight away and the
    observation returned for it is the FIRST observation of the new episode.
    The last observation of the old episode, which is needed to treat a time
    limit correctly, is in infos[i]["final_obs"].

    This is the plain interface the training script uses, not a
    Stable-Baselines3 VecEnv subclass.
    """

    def __init__(self, num_envs: int, track="summer1", ticks: int = 10, seed: int = 0, **options):
        """Each environment gets its own seed (seed, seed+1, ...) so they do
        not all pick the same random start positions.

        `track` is one name, or a list of names for multi-track training. With
        a list, environment k drives tracks[k % len(tracks)] for its whole
        life, so with as many environments as tracks every update contains
        experience from every track. self.tracks[k] says which."""
        tracks = [track] if isinstance(track, str) else list(track)
        self.tracks = [tracks[k % len(tracks)] for k in range(num_envs)]
        self.servers = []
        try:
            for k in range(num_envs):
                self.servers.append(EnvServer(track=self.tracks[k], ticks=ticks, seed=seed + k, **options))
        except Exception:
            self.close()
            raise
        self.num_envs = num_envs
        self.spec_info = self.servers[0].spec
        self.obs_size = self.spec_info["obsSize"]
        self.num_actions = self.spec_info["numActions"]
        # One reader thread per server. Reading a reply means waiting on a
        # pipe, and doing that for one server after another made every step
        # cost a fixed amount per environment (about 0.14 ms each, measured),
        # however many CPU cores were idle. A thread blocked on a pipe does not
        # hold Python's lock, so with a thread per server the waits overlap.
        # Each thread puts the replies of its server, in order, on that
        # server's own queue; _read(k) takes the next one.
        self._replies = [queue.SimpleQueue() for _ in self.servers]
        for k, server in enumerate(self.servers):
            threading.Thread(target=self._reader, args=(server, self._replies[k]), daemon=True).start()

    @staticmethod
    def _reader(server: "EnvServer", out: "queue.SimpleQueue") -> None:
        """Thread body: forward every reply of one server to its queue. An
        error (the server died, or reported one) is forwarded as the exception
        itself, so it is raised in the main thread by _read."""
        while True:
            try:
                out.put(server._read())
            except Exception as error:  # noqa: BLE001 - passed on, not swallowed
                out.put(error)
                return

    def _read(self, k: int) -> dict:
        """Next reply from server k (waits for it)."""
        reply = self._replies[k].get()
        if isinstance(reply, Exception):
            raise reply
        return reply

    def reset(self) -> np.ndarray:
        """Reset every environment. Returns observations, shape (N, obs_size)."""
        for server in self.servers:
            server.send(cmd="reset")
        return np.stack([_obs(self._read(k)) for k in range(self.num_envs)])

    def step(self, actions):
        """Step every environment with its own action.

        Returns (obs, rewards, terminated, truncated, infos):
          obs         float32 (N, obs_size)
          rewards     float32 (N,)
          terminated  bool (N,)   finished the lap
          truncated   bool (N,)   cut off (stalled / off line / time limit)
          infos       list of N dicts; for an episode that just ended it also
                      has "final_obs", the old episode's last observation
        """
        for server, action in zip(self.servers, actions):
            server.send(cmd="step", action=int(action))
        replies = [self._read(k) for k in range(self.num_envs)]

        # Reset the ones that ended, again all at once.
        ended = [k for k, reply in enumerate(replies) if reply["terminated"] or reply["truncated"]]
        for k in ended:
            self.servers[k].send(cmd="reset")
        obs = [_obs(reply) for reply in replies]
        infos = [reply["info"] for reply in replies]
        for k in ended:
            infos[k]["final_obs"] = obs[k]
            obs[k] = _obs(self._read(k))

        return (
            np.stack(obs),
            np.array([reply["reward"] for reply in replies], dtype=np.float32),
            np.array([reply["terminated"] for reply in replies], dtype=bool),
            np.array([reply["truncated"] for reply in replies], dtype=bool),
            infos,
        )

    def rollout(self, steps: int, weights_file: str, hidden: int) -> dict:
        """Have every server play `steps` decisions on its own with the policy
        network stored in `weights_file` (see "rollout" in rl/env_server.mjs),
        all at the same time, and return the lot.

        This replaces `steps` calls of step(): one round trip per server
        instead of one per decision, which is where most of the time went.

        Returns a dict of arrays indexed [step, environment]:
          obs       float32 (steps, N, obs_size)  what each decision was made from
          actions   int64   (steps, N)            the action picked
          rewards   float32 (steps, N)
          dones     float32 (steps, N)            1 where that decision ended an episode
          last_obs  float32 (N, obs_size)         the observation after the last decision
          episodes  list of (environment index, info dict) for episodes that ended
          time_limits  list of (step, environment index, final observation) for
                       episodes cut off by the time limit
        """
        for server in self.servers:
            server.send(cmd="rollout", steps=steps, weights=weights_file, hidden=hidden)
        replies = [self._read(k) for k in range(self.num_envs)]

        def decode(text: str, dtype) -> np.ndarray:
            return np.frombuffer(base64.b64decode(text), dtype=dtype)

        episodes, time_limits = [], []
        for k, reply in enumerate(replies):
            for episode in reply["episodes"]:
                episodes.append((k, episode["info"]))
                if episode["finalObs"] is not None:
                    time_limits.append((episode["t"], k, decode(episode["finalObs"], np.float32)))
        # Each server's arrays are [step, ...]; stacking on axis 1 gives [step, environment, ...].
        return {
            "obs": np.stack([decode(r["obs"], np.float32).reshape(steps, self.obs_size) for r in replies], axis=1),
            "actions": np.stack([decode(r["actions"], np.uint8) for r in replies], axis=1).astype(np.int64),
            "rewards": np.stack([decode(r["rewards"], np.float32) for r in replies], axis=1),
            "dones": np.stack([decode(r["dones"], np.uint8) for r in replies], axis=1).astype(np.float32),
            "last_obs": np.stack([decode(r["lastObs"], np.float32) for r in replies]),
            "episodes": episodes,
            "time_limits": time_limits,
        }

    def close(self):
        for server in self.servers:
            server.close()


def _random_policy_check(steps: int = 2000, num_envs: int = 4) -> None:
    """Quick check that the round trip works, and how fast it is."""
    rng = np.random.default_rng(0)

    env = PolytrackEnv()
    print(f"server says: {env.spec_info}")
    obs, info = env.reset(seed=0)
    assert obs.shape == (env.obs_size,) and obs.dtype == np.float32 and np.isfinite(obs).all()
    episodes, total = 0, 0.0
    start = time.perf_counter()
    for _ in range(steps):
        obs, reward, terminated, truncated, info = env.step(rng.integers(env.num_actions))
        total += reward
        if terminated or truncated:
            episodes += 1
            obs, info = env.reset()
    seconds = time.perf_counter() - start
    print(f"1 env:  {steps} random steps in {seconds:.2f} s = {steps / seconds:.0f} steps/s, "
          f"{episodes} episodes, total reward {total:.2f}, last info {info}")
    env.close()

    vec = PolytrackVecEnv(num_envs, randomStart=0.5)
    obs = vec.reset()
    assert obs.shape == (num_envs, vec.obs_size)
    reasons: dict[str, int] = {}
    start = time.perf_counter()
    for _ in range(steps // num_envs):
        obs, rewards, terminated, truncated, infos = vec.step(rng.integers(vec.num_actions, size=num_envs))
        for k in np.flatnonzero(terminated | truncated):
            reasons[infos[k]["reason"]] = reasons.get(infos[k]["reason"], 0) + 1
            assert infos[k]["final_obs"].shape == (vec.obs_size,)
    seconds = time.perf_counter() - start
    count = (steps // num_envs) * num_envs
    print(f"{num_envs} envs: {count} random steps in {seconds:.2f} s = {count / seconds:.0f} steps/s "
          f"(includes resets that replay the human lap part-way), episodes ended: {reasons}")
    assert np.isfinite(obs).all()
    vec.close()
    print("OK")


if __name__ == "__main__":
    _random_policy_check(*(int(a) for a in sys.argv[1:3]))
