// sim/pool.mjs with one difference: a child that dies is an error, not a hang.
//
// sim/pool.mjs resolves a request when its numbered reply arrives and has no
// other way out. A child whose message handler throws exits (Node ends a
// process on an unhandled rejection), no reply ever comes, and the parent
// waits forever with nothing on the screen: sim/pool.mjs also sends the
// children's standard error to nowhere. That happened in g1-1 and g1-5 (a bad
// lap file, a wrong option) and looks exactly like a long search.
//
// Same call, same protocol, same result object, so it is a drop-in:
//
//   import { createPool } from '../shared/pool.mjs';
//   const pool = await createPool('desert4', 2, '../ideas/g1-4-beam-search/child.mjs', setup);
//   const replies = await pool.runAll(requests);   // rejects if a child dies
//   pool.close();
//
// `childFile` is resolved relative to sim/, as in sim/pool.mjs, so existing
// callers change only their import line. The children themselves need no
// change: { track, ...setup } in, { ready: true } out, then { id, ... }
// requests answered with the same id.
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** The harmless line every simulator prints while loading; not worth showing. */
const NOISE = /wasm streaming compile failed|falling back/;

export async function createPool(trackName, size, childFile = 'eval_child.mjs', setup = {}) {
  const CHILD = fileURLToPath(new URL(`../../sim/${childFile}`, import.meta.url));
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
    /** Score one recording per child (for eval_child.mjs), as sim/pool.mjs. */
    evaluateAll(recordings, maxFrames) {
      return this.runAll(recordings.map((recording) => ({ recording, maxFrames })));
    },
    /** Request k to child k, all at once; replies in the same order. Rejects
     *  with the child's last error lines if a child exits before answering. */
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
