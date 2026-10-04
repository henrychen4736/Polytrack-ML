// Acceptance test 1: replay real leaderboard recordings through the game's own
// Verify and require a finish on the exact claimed frame.
// Usage: node scripts/verify_fixtures.mjs [track ...]   (default: summer1 winter1)
import { readFileSync } from 'node:fs';
import { bootWorker } from '../sim/host.mjs';
import { loadTrack } from '../sim/env.mjs';

const FIX = new URL('../vendor/polyrl/fixtures/', import.meta.url);
const tracks = process.argv.length > 2 ? process.argv.slice(2) : ['summer1', 'winter1'];

const w = await bootWorker();
let pass = 0, total = 0;
for (const name of tracks) {
  const track = loadTrack(name);
  const entries = JSON.parse(readFileSync(new URL(`leaderboard_${name}.json`, FIX), 'utf8'));
  for (const e of entries) {
    const ok = await w.verify({ ...track, carRecording: e.recording, targetFrames: e.frames });
    total++; if (ok) pass++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name} rank ${e.rank} claimed=${e.frames}`);
  }
}
console.log(`\n${pass}/${total} recordings verify on their claimed frame`);
await w.terminate();
process.exit(pass === total ? 0 : 1);
