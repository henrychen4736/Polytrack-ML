// Stage 2, step 1 check: is the path we decode from a track the path the game
// actually uses?
//
// We can't ask the game for its gate positions, but we can watch a real lap.
// The car state carries `nextCheckpointIndex`, which goes up by one on the
// exact frame the physics registers a checkpoint. So we replay a human
// leaderboard run and, at each of those frames, compare where the car is with
// where we think that gate is. If our decoding is right, the car is inside (or
// within a car length of) our gate's box every time, and the spawn position we
// compute equals the car's position on the first frame.
//
// Usage: node scripts/check_path.mjs [track ...]     (default: summer1 winter1)
import { readFileSync } from 'node:fs';
import { Env, loadTrack } from '../sim/env.mjs';
import { decodeState } from '../sim/state.mjs';
import { decodeSaveString, parseTrack, buildPath } from '../sim/track.mjs';

const tracks = process.argv.length > 2 ? process.argv.slice(2) : ['summer1', 'winter1'];
const fmt = (v) => `(${v.map((x) => x.toFixed(1)).join(', ')})`;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// A gate "contains" the car if the car's centre is within the box, allowing
// this much slack per axis: the detector fires when any part of the car
// touches it, and the car is roughly 4 units long.
const SLACK = 3;

const env = await Env.create();
let allOk = true;

for (const name of tracks) {
  const track = loadTrack(name);
  const parsed = parseTrack(decodeSaveString(track.trackData));
  const path = buildPath(parsed);

  console.log(`\n=== ${name}: ${parsed.parts.length} parts, ${path.gates.length} gates, path length ${path.length.toFixed(0)} ===`);
  console.log(`start ${fmt(path.start.position)}`);
  path.gates.forEach((g, k) => {
    const label = g.isFinish ? 'finish' : `checkpoint ${g.order}`;
    const alt = g.alternatives > 1 ? `  [1 of ${g.alternatives} alternatives]` : '';
    console.log(`  gate ${k}: ${label.padEnd(13)} centre ${fmt(g.center)}  box ${fmt(g.size)}  at ${path.cumulative[k + 1].toFixed(0)} along path${alt}`);
  });

  // Replay the first leaderboard run we have for this track.
  const fx = JSON.parse(readFileSync(new URL(`../vendor/polyrl/fixtures/leaderboard_${name}.json`, import.meta.url), 'utf8'))[0];
  const run = await env.replay(track, fx.recording, fx.frames + 100);

  // Spawn check. The first state is after one physics tick, so the car has
  // already settled a hair; allow a few centimetres.
  const first = decodeState(run.states[0]);
  const spawnErr = dist(first.position, path.start.position);
  const spawnOk = spawnErr < 0.05;
  console.log(`${spawnOk ? 'PASS' : 'FAIL'} spawn: car starts at ${fmt(first.position)}, ${spawnErr.toFixed(4)} from our start`);
  allOk &&= spawnOk;

  // Gate checks: find each frame where the checkpoint counter ticks up, and
  // the frame where the run finishes.
  let prevIndex = 0;
  let gate = 0;
  for (const u8 of run.states) {
    const s = decodeState(u8);
    const crossed = s.nextCheckpointIndex > prevIndex || (s.finishFrames != null && gate === path.gates.length - 1);
    if (!crossed) continue;
    prevIndex = s.nextCheckpointIndex;
    const g = path.gates[gate];
    if (!g) { console.log(`FAIL the game registered more gates than we decoded`); allOk = false; break; }
    // Per-axis distance outside the box (0 if inside), compared with the slack.
    const outside = [0, 1, 2].map((k) => Math.max(0, Math.abs(s.position[k] - g.center[k]) - g.size[k] / 2));
    const ok = outside.every((d) => d <= SLACK);
    console.log(`${ok ? 'PASS' : 'FAIL'} gate ${gate} (${g.isFinish ? 'finish' : 'checkpoint'}) registered at frame ${s.frames}: car ${fmt(s.position)} is ${dist(s.position, g.center).toFixed(1)} from our centre`);
    allOk &&= ok;
    gate++;
    if (s.finishFrames != null) break;
  }
  if (gate !== path.gates.length) { console.log(`FAIL the lap registered ${gate} gates, we decoded ${path.gates.length}`); allOk = false; }
}

await env.close();
console.log(allOk ? '\nAll path checks passed.' : '\nSome path checks FAILED.');
process.exit(allOk ? 0 : 1);
