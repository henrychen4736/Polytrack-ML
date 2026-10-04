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

import json
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

    def __init__(self, num_envs: int, track: str = "summer1", ticks: int = 10, seed: int = 0, **options):
        """Each environment gets its own seed (seed, seed+1, ...) so they do
        not all pick the same random start positions."""
        self.servers = []
        try:
            for k in range(num_envs):
                self.servers.append(EnvServer(track=track, ticks=ticks, seed=seed + k, **options))
        except Exception:
            self.close()
            raise
        self.num_envs = num_envs
        self.spec_info = self.servers[0].spec
        self.obs_size = self.spec_info["obsSize"]
        self.num_actions = self.spec_info["numActions"]

    def reset(self) -> np.ndarray:
        """Reset every environment. Returns observations, shape (N, obs_size)."""
        for server in self.servers:
            server.send(cmd="reset")
        return np.stack([_obs(server._read()) for server in self.servers])

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
        replies = [server._read() for server in self.servers]

        # Reset the ones that ended, again all at once.
        ended = [k for k, reply in enumerate(replies) if reply["terminated"] or reply["truncated"]]
        for k in ended:
            self.servers[k].send(cmd="reset")
        obs = [_obs(reply) for reply in replies]
        infos = [reply["info"] for reply in replies]
        for k in ended:
            infos[k]["final_obs"] = obs[k]
            obs[k] = _obs(self.servers[k]._read())

        return (
            np.stack(obs),
            np.array([reply["reward"] for reply in replies], dtype=np.float32),
            np.array([reply["terminated"] for reply in replies], dtype=bool),
            np.array([reply["truncated"] for reply in replies], dtype=bool),
            infos,
        )

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
