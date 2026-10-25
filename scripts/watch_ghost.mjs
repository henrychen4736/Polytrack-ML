// Stage 4: watch a bot lap in the real PolyTrack client.
//
// The client keeps your best lap on each track in the browser's localStorage,
// and offers a "Watch" button that replays it. This script opens the real
// 0.6.3 client in a throwaway Edge window, plants our recording as that stored
// best lap, and reloads, so the lap can be watched with the game's own replay
// viewer (and raced against as a ghost).
//
// SAFETY: the client runs in a temporary Edge profile that cannot reach
// Kodub's server; see the SAFETY note in scripts/game_client.mjs before
// changing anything. Never paste a bot recording into localStorage in your
// normal browser: the game would submit it the next time it syncs.
//
// Usage: node scripts/watch_ghost.mjs [track] [run] [--check]
//   track     summer1 (default)
//   run       which saved lap: baseline (default) or search; reads
//             runs/<run>_<track>.recording.json
//   --check   run without a visible window, save screenshots to capture/, exit
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openClient, plantRecord, openTrackPage, shownName } from './game_client.mjs';

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const [name = 'summer1', run = 'baseline'] = args.filter((a) => !a.startsWith('--'));

let lap;
try {
  lap = JSON.parse(readFileSync(new URL(`../runs/${run}_${name}.recording.json`, import.meta.url), 'utf8'));
} catch {
  console.error(`No runs/${run}_${name}.recording.json. Create it with drive_baseline.mjs + export_recording.mjs, or search_timeline.mjs.`);
  process.exit(1);
}

console.log('Opening the 0.6.3 client (API server blocked)...');
const client = await openClient({ headless: checkOnly });
const { page } = client;
await plantRecord(client, name, lap);
await page.reload({ waitUntil: 'load' });
console.log(`Planted a ${(lap.frames / 1000).toFixed(3)} s lap on ${name} in the temporary profile.`);
await openTrackPage(page, name);
console.log(`Opened the ${shownName(name)} page.`);

// An attempt that did not finish the lap (saved by rl/evaluate.py for
// watching) is not a valid record, and the game says so in a dialog when it
// tries to load it as a ghost. Dismiss the dialog; the lap can still be opened
// with Watch.
if (lap.finished === false) {
  const ok = page.getByText('Ok', { exact: true }).first();
  await ok.waitFor({ timeout: 8000 }).then(() => ok.click()).catch(() => {});
  console.log('This attempt did not finish the lap; the game flags it as an invalid replay, which is expected.');
}

if (checkOnly) {
  // Automated check: the track page shows the stored time and enables Watch.
  // Screenshot before and during the replay.
  const dir = fileURLToPath(new URL('../capture/', import.meta.url));
  mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${dir}ghost_1_loaded.png` });
  await page.locator('button', { hasText: 'Watch' }).locator('visible=true').first().click();
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${dir}ghost_2_replay.png` });
  console.log(`Saved capture/ghost_1_loaded.png and capture/ghost_2_replay.png. Blocked ${client.blocked()} API requests.`);
  await client.close();
} else {
  console.log('The game window is open on the track page. Click "Watch" to replay the lap, or "Play" to race its ghost.');
  console.log('Close the window when you are done; the temporary profile is deleted with it.');
  // Keep this script alive until the window is closed.
  await new Promise((resolve) => { page.on('close', resolve); client.browser.on('disconnected', resolve); });
  console.log(`Closed. Blocked ${client.blocked()} API requests in total.`);
  await client.close();
}
process.exit(0);
