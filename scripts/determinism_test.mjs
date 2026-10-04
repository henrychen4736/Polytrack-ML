// Acceptance test 2: the same inputs must give byte-identical state streams
//   (a) across separate OS processes, and
//   (b) whether fed as a recording or live through Env.step in uneven chunks.
// Usage: node scripts/determinism_test.mjs
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Env, loadTrack } from '../sim/env.mjs';
import { decodeRecording, toDense, encodeRecording } from '../sim/recording.mjs';
import { decodeState, stateLength } from '../sim/state.mjs';

const sha = (states) => { const h = createHash('sha256'); for (const s of states) h.update(s.subarray(4, stateLength(s))); /* skip the carId header and the stale tail */ return h.digest('hex'); };

if (process.argv[2] === '--child') {
  const fx = JSON.parse(readFileSync(new URL('../vendor/polyrl/fixtures/leaderboard_summer1.json', import.meta.url), 'utf8'))[0];
  const track = loadTrack('summer1');
  const env = await Env.create();

  const run = await env.replay(track, fx.recording, fx.frames + 500);

  // same inputs, live, in uneven chunk sizes so chunk boundaries get exercised
  const dense = toDense(decodeRecording(fx.recording), run.states.length);
  const key = (c) => `${+c.up}${+c.right}${+c.down}${+c.left}${+c.reset}`;
  env.reset(track);
  const live = [];
  for (let f = 0, k = 0; f < dense.length; k++) {
    const cap = 1 + ((k * 7) % 37);
    let n = 1;
    while (n < cap && f + n < dense.length && key(dense[f + n]) === key(dense[f])) n++;
    live.push(...(await env.step(dense[f], n)));
    f += n;
  }
  const last = decodeState(run.states.at(-1));
  console.log(JSON.stringify({
    replaySha: sha(run.states), liveSha: sha(live), states: run.states.length,
    finishFrames: run.finishFrames, claimed: fx.frames, lastFrame: last.frames, speedKmh: last.speedKmh,
    codecRoundTrip: JSON.stringify(decodeRecording(encodeRecording(decodeRecording(fx.recording)))) === JSON.stringify(decodeRecording(fx.recording)),
  }));
  await env.close();
  process.exit(0);
}

const child = () => JSON.parse(execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--child'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n').at(-1));
const a = child(), b = child();
console.log(a);
const checks = {
  'two processes, recording replay: identical': a.replaySha === b.replaySha,
  'two processes, live stepping: identical': a.liveSha === b.liveSha,
  'live stepping == recording replay': a.liveSha === a.replaySha,
  'recording codec round-trips': a.codecRoundTrip,
};
for (const [k, v] of Object.entries(checks)) console.log(`${v ? 'PASS' : 'FAIL'} ${k}`);
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
