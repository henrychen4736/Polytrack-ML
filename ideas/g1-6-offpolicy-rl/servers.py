"""Python side of iqn_server.mjs: N Node processes, one simulator each.

The same arrangement as PolytrackVecEnv in rl/polytrack_env.py (one process
per environment because simulator threads inside one Node process do not run
in parallel, one reader thread per process so the waits overlap), for this
folder's server and its protocol. Not built on EnvServer because that class
has the path of rl/env_server.mjs fixed in it.

The one thing that differs in use: a rollout is split into start_rollout()
and finish_rollout(), so the learner can do its gradient steps on the GPU
WHILE the simulators drive on the CPU. With PPO the GPU waits for the
simulators and the simulators wait for the GPU; here neither waits.

No network connections: pipes to local processes only.
"""
from __future__ import annotations

import base64
import json
import queue
import shutil
import subprocess
import threading
from pathlib import Path

import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SERVER_SCRIPT = "ideas/g1-6-offpolicy-rl/iqn_server.mjs"


def _decode(text: str, dtype) -> np.ndarray:
    return np.frombuffer(base64.b64decode(text), dtype=dtype)


class IqnServers:
    def __init__(self, num_envs: int, track: str, seed: int = 0, show_stderr: bool = False, **options):
        """Start `num_envs` servers on `track` and wait for their simulators
        (1 to 2 s each). Environment k gets seed + k so they do not all pick
        the same start positions. `options`: any key=value iqn_server.mjs takes."""
        node = shutil.which("node")
        if node is None:
            raise RuntimeError("Node.js was not found on PATH; the simulator needs Node 20+")
        self.procs, self._replies = [], []
        try:
            for k in range(num_envs):
                args = [node, SERVER_SCRIPT, f"track={track}", f"seed={seed + k}"] + [f"{key}={value}" for key, value in options.items()]
                # stderr to DEVNULL, not a pipe: a pipe nobody reads fills up and freezes the server.
                proc = subprocess.Popen(args, cwd=PROJECT_ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=None if show_stderr else subprocess.DEVNULL)
                self.procs.append(proc)
                replies: queue.SimpleQueue = queue.SimpleQueue()
                self._replies.append(replies)
                threading.Thread(target=self._reader, args=(proc, replies), daemon=True).start()
            # First line of each: the "ready" message with the sizes.
            self.spec = [self._read(k) for k in range(num_envs)][0]
        except Exception:
            self.close()
            raise
        self.num_envs = num_envs
        self.obs_size, self.num_actions = self.spec["obsSize"], self.spec["numActions"]

    @staticmethod
    def _reader(proc: subprocess.Popen, out: queue.SimpleQueue) -> None:
        """Thread body: pass every reply line of one server to its queue. A
        dead server is passed on as an exception, raised by _read."""
        while True:
            line = proc.stdout.readline()
            if not line:
                out.put(RuntimeError("an environment server exited; start with show_stderr=True to see why"))
                return
            out.put(json.loads(line))

    def _read(self, k: int) -> dict:
        reply = self._replies[k].get()
        if isinstance(reply, Exception):
            raise reply
        if "error" in reply:
            raise RuntimeError(f"environment server {k}: {reply['error']}")
        return reply

    def _send(self, k: int, **request) -> None:
        self.procs[k].stdin.write(json.dumps(request).encode() + b"\n")
        self.procs[k].stdin.flush()

    def start_rollout(self, steps: int, weights_file: str, epsilons) -> None:
        """Set every server driving `steps` decisions with the network in
        `weights_file`; server k explores with probability epsilons[k].
        Returns at once. The file must not be rewritten before finish_rollout()."""
        self._steps = steps
        for k in range(self.num_envs):
            self._send(k, cmd="rollout", steps=steps, weights=str(weights_file), epsilon=float(epsilons[k]))

    def finish_rollout(self) -> dict:
        """Wait for the rollouts and return arrays indexed [step, environment]:
        obs float32 (T, N, obs_size), actions int64, rewards float32, stops
        uint8 (0 on / 1 ended / 2 cut off), plus `episodes`, a list of
        (environment, dict) for episodes that ended, and the servers' own
        timings summed (`act_ms`, `step_ms`)."""
        replies = [self._read(k) for k in range(self.num_envs)]
        T = self._steps
        return {
            "obs": np.stack([_decode(r["obs"], np.float32).reshape(T, self.obs_size) for r in replies], axis=1),
            "actions": np.stack([_decode(r["actions"], np.uint8) for r in replies], axis=1).astype(np.int64),
            "rewards": np.stack([_decode(r["rewards"], np.float32) for r in replies], axis=1),
            "stops": np.stack([_decode(r["stops"], np.uint8) for r in replies], axis=1),
            "episodes": [(k, episode) for k, r in enumerate(replies) for episode in r["episodes"]],
            "act_ms": sum(r["actMs"] for r in replies),
            "step_ms": sum(r["stepMs"] for r in replies),
        }

    def evaluate(self, weights_file: str, save: str | None = None, server: int = 0) -> dict:
        """One lap from the start line on one server, best-valued action
        throughout. Returns the server's reply: info (reason, finishFrames,
        fraction, ...), ret, decisions, saved, and `actions` as an array."""
        request = {"cmd": "eval", "weights": str(weights_file)}
        if save:
            request["save"] = save
        self._send(server, **request)
        reply = self._read(server)
        reply["actions"] = _decode(reply["actions"], np.uint8)
        return reply

    def close(self) -> None:
        """Ask every server to exit; kill any that has not within 5 seconds."""
        for proc in self.procs:
            if proc.poll() is None:
                try:
                    proc.stdin.write(b'{"cmd":"close"}\n')
                    proc.stdin.flush()
                    proc.wait(timeout=5)
                except (OSError, subprocess.TimeoutExpired):
                    proc.kill()
