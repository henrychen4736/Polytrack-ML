// Stage 4: watch a bot lap in the real PolyTrack client.
//
// The client keeps your best lap on each track in the browser's localStorage,
// and offers a "Watch" button that replays it. This script opens the real
// 0.6.3 client in a throwaway Edge window, plants our recording as that stored
// best lap, and reloads, so the lap can be watched with the game's own replay
// viewer (and raced against as a ghost).
//
// SAFETY. Read this before changing anything here.
// When the client sees a stored lap that is faster than what the server has
// for you, it UPLOADS it to the leaderboard by itself (`syncRecord` in the
// main bundle). A bot lap must never get there. Two things prevent it:
//   1. Every request to Kodub's API server (vps.kodub.com) is blocked, so the
//      client can neither read nor write leaderboards from this window.
//   2. The browser profile is temporary. It is created for this run and
//      deleted when the window closes, so the planted lap never exists in a
//      browser that can reach the server.
// For the same reason, never paste a bot recording into localStorage in your
// normal browser: the game would submit it the next time it syncs.
//
// Usage: node scripts/watch_ghost.mjs [track] [--check]
//   track     summer1 (default); needs runs/baseline_<track>.recording.json
//   --check   run without a visible window, save screenshots to capture/, exit
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadTrack } from '../sim/env.mjs';
import { decodeSaveString } from '../sim/track.mjs';

const GAME_URL = 'https://app-polytrack.kodub.com/0.6.3/';
// localStorage key prefix used by 0.6.3 (`polytrack_v5_` + `prod_` in the bundle).
const KEY_PREFIX = 'polytrack_v5_prod_';

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const name = args.find((a) => !a.startsWith('--')) ?? 'summer1';
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

let lap;
try {
  lap = JSON.parse(readFileSync(new URL(`../runs/baseline_${name}.recording.json`, import.meta.url), 'utf8'));
} catch {
  console.error(`No recording for ${name}. Run drive_baseline.mjs and export_recording.mjs first.`);
  process.exit(1);
}

// The game identifies a track by the SHA-256 of its raw bytes; stored laps are
// filed under that id.
const trackId = sha256(decodeSaveString(loadTrack(name).trackData));

const browser = await chromium.launch({
  channel: 'msedge',
  headless: checkOnly,
  // Software rendering flags are only needed when there is no window/GPU.
  args: checkOnly ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] : ['--start-maximized'],
});
// newContext() is an incognito-style profile: nothing is shared with your real
// Edge profile and everything is discarded when the browser closes.
const context = await browser.newContext({ viewport: checkOnly ? { width: 1280, height: 800 } : null });
const page = await context.newPage();

// Safety 1: block the API server. Count what was blocked so we can report it.
let blocked = 0;
await context.route(/vps\.kodub\.com/, (route) => { blocked++; return route.abort(); });

console.log(`Opening the 0.6.3 client (API server blocked)...`);
await page.goto(GAME_URL, { waitUntil: 'load' });

// On first load the client creates a local profile with a random token. A
// stored lap is only accepted if it carries the hash of that token, so wait
// for the profile to appear and read the token back.
await page.waitForFunction((p) => Object.keys(localStorage).some((k) => /_user_\d$/.test(k) && k.startsWith(p)), KEY_PREFIX, { timeout: 120000 });
const profile = await page.evaluate((p) => {
  const key = Object.keys(localStorage).find((k) => k.startsWith(p) && /_user_\d$/.test(k));
  return { slot: Number(key.at(-1)), token: JSON.parse(localStorage.getItem(key)).token };
}, KEY_PREFIX);

// Plant the lap. This is the exact shape the client's own saveRecord writes:
//   uploadId   null = "not on the server"
//   tokenHash  ties the lap to this local profile
//   frames     lap time in physics ticks (ms)
//   recording  the recording string
// "_default_" is the key variant used when the client's determinism self-test passes.
const recordKey = `${KEY_PREFIX}record_${profile.slot}_default_${trackId}`;
const recordValue = JSON.stringify({ uploadId: null, tokenHash: sha256(profile.token), frames: lap.frames, recording: lap.recording });
await page.evaluate(([k, v]) => localStorage.setItem(k, v), [recordKey, recordValue]);
await page.reload({ waitUntil: 'load' });
console.log(`Planted a ${(lap.frames / 1000).toFixed(3)} s lap on ${name} in the temporary profile.`);

if (checkOnly) {
  // Automated check: the first-run client drops straight into Summer 1, shows
  // the stored time, and enables Watch. Screenshot before and during the replay.
  const dir = fileURLToPath(new URL('../capture/', import.meta.url));
  mkdirSync(dir, { recursive: true });
  const watch = page.getByText('Watch', { exact: true }).first();
  await watch.waitFor({ timeout: 120000 });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${dir}ghost_1_loaded.png` });
  await watch.click();
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${dir}ghost_2_replay.png` });
  console.log(`Saved capture/ghost_1_loaded.png and capture/ghost_2_replay.png. Blocked ${blocked} API requests.`);
  await browser.close();
} else {
  console.log(`The game window is open. Click "Watch" (top left) to replay the lap, or drive to race its ghost.`);
  console.log(`Close the window when you are done; the temporary profile is deleted with it.`);
  // Keep this script alive until the window is closed.
  await new Promise((resolve) => { page.on('close', resolve); browser.on('disconnected', resolve); });
  console.log(`Closed. Blocked ${blocked} API requests in total.`);
  await browser.close().catch(() => {});
}
process.exit(0);
