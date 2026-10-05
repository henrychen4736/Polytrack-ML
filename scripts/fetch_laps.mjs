// Fetch human laps for the official tracks, to use as reference lines.
//
// The controller and the RL agent both follow the line of a human lap, and the
// project only came with laps for summer1 and winter1. This script reads the
// public leaderboards for the other official tracks and saves a few top laps
// for each.
//
// THIS IS THE ONE SCRIPT THAT TALKS TO KODUB'S SERVER. It only reads:
//   GET /leaderboard   the top entries for a track
//   GET /recordings    the recordings for those entries
// It never posts anything, and nothing else in the project contacts the server.
// To stay well clear of the terms' rule against automated use that affects
// server performance it makes two requests per track, waits between requests,
// and skips tracks it already has. Bot laps must never be submitted.
//
// Every downloaded lap is checked with the game's own Verify in our simulator
// before it is kept: a lap that does not finish on its claimed tick here would
// be useless as a reference (and would mean our setup for that track is off).
//
// Usage: node scripts/fetch_laps.mjs [track ...] [amount=10] [force=1]
//   track    official track names (default: every official track)
//   amount   how many top entries to download per track
//   force    re-download tracks that already have a file
// Writes data/laps/<track>.json: [{ rank, frames, recording }], fastest first.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { bootWorker } from '../sim/host.mjs';
import { loadTrack } from '../sim/env.mjs';
import { decodeSaveString } from '../sim/track.mjs';

const API = 'https://vps.kodub.com/v6';
const VERSION = '0.6.3';
/** Pause between requests, in ms. */
const PAUSE_MS = 1500;

const args = process.argv.slice(2);
const opt = Object.fromEntries(args.filter((a) => a.includes('=')).map((a) => a.split('=')));
const amount = Number(opt.amount ?? 10);
const officialDir = new URL('../vendor/polyrl/node/vendor/tracks/official/', import.meta.url);
// "totw" is the rotating Track of the Week, not a fixed official track.
const allOfficial = readdirSync(officialDir).filter((f) => f.endsWith('.track') && f !== 'totw.track').map((f) => f.replace('.track', '')).sort();
const names = args.filter((a) => !a.includes('=')).length ? args.filter((a) => !a.includes('=')) : allOfficial;

const outDir = new URL('../data/laps/', import.meta.url);
mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let requests = 0;
async function get(path) {
  if (requests++) await sleep(PAUSE_MS);
  // The server only answers requests that name the game client as their origin.
  const res = await fetch(`${API}${path}`, { headers: { Origin: 'https://app-polytrack.kodub.com' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path.split('?')[0]}`);
  return res.json();
}

const worker = await bootWorker();
const summary = [];
for (const name of names) {
  const outFile = new URL(`${name}.json`, outDir);
  if (existsSync(outFile) && !opt.force) {
    const have = JSON.parse(readFileSync(outFile, 'utf8'));
    summary.push(`${name}: already have ${have.length} laps (best ${(have[0].frames / 1000).toFixed(3)} s)`);
    continue;
  }
  try {
    const track = loadTrack(name);
    // The leaderboard is keyed by the SHA-256 of the track's raw bytes.
    const trackId = createHash('sha256').update(decodeSaveString(track.trackData)).digest('hex');
    const board = await get(`/leaderboard?version=${VERSION}&trackId=${trackId}&skip=0&amount=${amount}&onlyVerified=true`);
    if (!board.entries?.length) { summary.push(`${name}: leaderboard is empty`); continue; }
    const recs = await get(`/recordings?version=${VERSION}&ids=${board.entries.map((e) => e.id).join(',')}`);

    // Keep only laps the game's Verify accepts in our simulator. Nicknames and
    // user ids are not stored: we only need the driving.
    const kept = [];
    for (let i = 0; i < recs.length; i++) {
      const rec = recs[i];
      if (!rec?.recording) continue;
      const frames = rec.frames ?? board.entries[i].frames;
      const ok = await worker.verify({ ...track, carRecording: rec.recording, targetFrames: frames });
      if (ok) kept.push({ rank: i + 1, frames, recording: rec.recording });
    }
    kept.sort((a, b) => a.frames - b.frames);
    if (kept.length) {
      writeFileSync(outFile, JSON.stringify(kept, null, 2));
      summary.push(`${name}: kept ${kept.length} of ${recs.length} laps (best ${(kept[0].frames / 1000).toFixed(3)} s)`);
    } else {
      summary.push(`${name}: 0 of ${recs.length} laps verify here, nothing saved`);
    }
  } catch (err) {
    summary.push(`${name}: FAILED (${err.message})`);
  }
  console.log(summary.at(-1));
}
await worker.terminate();
console.log(`\n${requests} requests made.`);
for (const line of summary) console.log(line);
process.exit(0);
