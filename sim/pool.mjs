// A pool of simulator PROCESSES for scoring many laps at once.
//
// Why processes and not threads: several simulator worker threads inside one
// Node process do not run in parallel in practice. Measured on this machine,
// scoring one lap takes about 0.28 s, and scoring 8 at once on 8 threads takes
// about 1.65 s, barely better than one after another. Eight separate processes
// do the same 8 laps in about 0.47 s. (The cause inside Node was not pinned
// down; batching or dropping the per-tick state messages made no difference.)
//
//   const pool = await createPool('summer1', 8);
//   const results = await pool.evaluateAll(recordingStrings, maxFrames);
//   pool.close();
//
// A child that dies is an error, not a hang. This pool used to resolve a
// request only when its numbered reply arrived, and sent the children's
// standard error to nowhere. A child whose message handler throws exits (Node
// ends a process on an unhandled rejection), so no reply ever came and the
// parent waited forever with nothing on the screen. That happened in g1-1 and
// g1-5 (a bad lap file, a wrong option) and looks exactly like a long search.
// ideas/shared/pool.mjs was written to fix it and is now this file: a request
// whose child exits rejects with the child's last error lines, and a child
// that fails to start takes the others down with it instead of leaving them
// running.
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** The harmless line every simulator prints while loading; not worth showing. */
const NOISE = /wasm streaming compile failed|falling back/;

/**
 * `childFile` (relative to this folder) picks what the children do with a request:
 *   eval_child.mjs   (default) replay a recording and score it
 *   drive_child.mjs  drive a lap with the controller under given settings
 *   section_child.mjs, ../rl/rollout_child.mjs   the two sectional searches
 * All follow the same protocol: a { track, ...setup } message to set up,
 * answered by { ready: true }, then numbered requests answered by numbered
 * replies.
 */
export async function createPool(trackName, size, childFile = 'eval_child.mjs', setup = {}) {
  const CHILD = fileURLToPath(new URL(`./${childFile}`, import.meta.url));
  let nextId = 0, closed = false;
  const waiting = new Map();   // request id -> { resolve, reject, child: index }
  const children = new Array(size).fill(null);

  const started = Array.from({ length: size }, (_, k) => new Promise((resolve, reject) => {
    // Standard error is piped, not ignored: its last lines are what explains a death.
    const child = fork(CHILD, { stdio: ['ignore', 'inherit', 'pipe', 'ipc'] });
    children[k] = child;
    let ready = false, lastErrors = '';
    child.stderr.on('data', (chunk) => {
      const text = String(chunk).split('\n').filter((line) => line.trim() && !NOISE.test(line)).join('\n');
      if (text) lastErrors = (lastErrors + '\n' + text).slice(-2000);
    });
    child.once('error', reject);
    child.on('exit', (code, signal) => {
      children[k] = null;
      if (closed) return;   // our own close()
      const why = new Error(`pool child ${k} (${childFile}) exited (${signal ?? `code ${code}`})${lastErrors ? `:\n${lastErrors.trim()}` : ''}`);
      if (!ready) { reject(why); return; }
      // Every request this child still owes an answer to fails now.
      for (const [id, w] of waiting) if (w.child === k) { waiting.delete(id); w.reject(why); }
    });
    child.on('message', (msg) => {
      if (!ready) {
        if (msg.ready) { ready = true; resolve(); } else reject(new Error('child did not start'));
        return;
      }
      const { id, ...result } = msg;
      const w = waiting.get(id);
      if (w) { waiting.delete(id); w.resolve(result); }
    });
    child.send({ track: trackName, ...setup });
  }));
  try {
    await Promise.all(started);
  } catch (err) {
    // One child failed to start: do not leave the others running.
    closed = true;
    for (const child of children) child?.kill();
    throw err;
  }

  return {
    size,
    /**
     * Score one recording per child, all at the same time. `recordings` may be
     * shorter than the pool. Resolves with results in the same order, each
     * { finished, finishFrames, checkpoints } (see Env.evaluate).
     */
    evaluateAll(recordings, maxFrames) {
      return this.runAll(recordings.map((recording) => ({ recording, maxFrames })));
    },
    /**
     * General form: send request k to child k, all at once, and resolve with
     * the replies in the same order. `requests` may be shorter than the pool.
     * Rejects with the child's last error lines if a child exits before
     * answering.
     */
    runAll(requests) {
      return Promise.all(requests.map((request, k) => new Promise((resolve, reject) => {
        if (!children[k]) { reject(new Error(`pool child ${k} is no longer running`)); return; }
        const id = nextId++;
        waiting.set(id, { resolve, reject, child: k });
        children[k].send({ id, ...request });
      })));
    },
    close() { closed = true; for (const child of children) child?.kill(); },
  };
}
