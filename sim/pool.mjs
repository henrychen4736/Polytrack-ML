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
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * `childFile` picks what the children do with a request:
 *   eval_child.mjs   (default) replay a recording and score it
 *   drive_child.mjs  drive a lap with the controller under given settings
 *   section_child.mjs, ../rl/rollout_child.mjs   the two sectional searches
 * All follow the same protocol: a { track } message to set up, then numbered
 * requests answered by numbered replies.
 */
export async function createPool(trackName, size, childFile = 'eval_child.mjs', setup = {}) {
  const CHILD = fileURLToPath(new URL(`./${childFile}`, import.meta.url));
  // Start the children and wait until each has booted its simulator.
  const children = await Promise.all(Array.from({ length: size }, () => new Promise((resolve, reject) => {
    // stdio 'ignore' for stderr hides the harmless "wasm streaming compile
    // failed" line each simulator prints while loading.
    const child = fork(CHILD, { stdio: ['ignore', 'inherit', 'ignore', 'ipc'] });
    child.once('error', reject);
    child.once('message', (msg) => (msg.ready ? resolve(child) : reject(new Error('child did not start'))));
    // `setup`: anything else a child needs to know before it reports ready.
    child.send({ track: trackName, ...setup });
  })));

  // Each request gets a number; the reply carries it back so we can match
  // replies to the promises waiting on them.
  let nextId = 0;
  const waiting = new Map();
  for (const child of children) {
    child.on('message', ({ id, ...result }) => { waiting.get(id)?.(result); waiting.delete(id); });
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
     */
    runAll(requests) {
      return Promise.all(requests.map((request, k) => new Promise((resolve) => {
        const id = nextId++;
        waiting.set(id, resolve);
        children[k].send({ id, ...request });
      })));
    },
    close() { for (const child of children) child.kill(); },
  };
}
