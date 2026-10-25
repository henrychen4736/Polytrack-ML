// Race the best generalist and the best human in the real PolyTrack client.
//
// What it is for: anyone who clones this repository can play a track against
// two ghosts, the project's best generalist (models/ppo_blkgen.best2.actor.bin,
// 139 of 170 laps finished in the ten-attempt test) and the fastest human lap
// on the public leaderboard, without training anything.
//
// How it works, in plain terms:
//   1. The model drives the track once in this project's headless copy of
//      the game's physics. Its top choice at every decision ("greedy"); if
//      that does not finish, ten tries with its usual randomness (seeds 10 to
//      19), fastest finished lap kept. The lap is checked with the game's
//      own Verify and kept in runs/race-generalist_<track>.recording.json,
//      so the next race on that track starts at once. About 5 to 30 s.
//   2. The real 0.6.3 client opens in a throwaway browser window
//      (scripts/game_client.mjs). When it asks Kodub's server for the
//      track's leaderboard, this script answers instead, with two entries:
//      "Best human" (lap 0 of data/laps/<track>.json) and "Best generalist
//      (bot)". Both can be watched or raced from the leaderboard like any
//      other entry. Every other request to the server is blocked, uploads
//      included, so neither ghost nor your own lap ever leaves this machine.
//
// Usage (from the project root, after the setup in README.md):
//   node scripts/race.mjs [track] [browser=edge|chrome|firefox] [--redo] [--check]
//   npm run race -- desert4 browser=firefox
//     track    an official track: desert1..5, summer1..7, winter1..5
//              (default desert4)
//     browser  edge (default), chrome, or firefox (Playwright's own build:
//              npx playwright-core install firefox; see game_client.mjs)
//     --redo   drive the model again instead of reusing the kept lap
//     --check  no window: open the leaderboard, save screenshots to
//              capture/race_*.png and exit (an automated test of this script)
//
// Needs: data/ (npm run capture; node scripts/fetch_laps.mjs <track>),
// Edge, Chrome or Playwright's Firefox, Node 20+. No Python, no GPU.
//
// Local use only. Bot laps must never be submitted to Kodub's leaderboards;
// see the SAFETY note in scripts/game_client.mjs before changing anything.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openClient, openTrackPage, trackIdOf, shownName, browserArg, BROWSERS } from './game_client.mjs';

const ROOT = new URL('../', import.meta.url);
const MODEL = 'models/ppo_blkgen.best2.actor.bin';
/** The seeds of the ten-attempt test (CLAUDE.md), tried when greedy fails. */
const SEEDS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
/** Longest the model may drive, in 50 ms decisions: 3 minutes. */
const MAX_DECISIONS = 3600;

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const redo = args.includes('--redo');
const track = args.find((a) => !a.startsWith('--') && !a.includes('=')) ?? 'desert4';
const browser = browserArg(args);

/** Stop with a message that says how to fix it. */
function fail(message) {
  console.error(message);
  process.exit(1);
}

// ---- what is needed, checked up front -------------------------------------------

if (!BROWSERS.includes(browser)) fail(`browser=${browser} is not supported; use one of ${BROWSERS.join(', ')}.`);
if (!/^(desert[1-5]|summer[1-7]|winter[1-5])$/.test(track)) fail(`"${track}" is not an official track: desert1..5, summer1..7, winter1..5.`);
if (!existsSync(new URL('data/init_0.6.3.json', ROOT))) fail('No data/init_0.6.3.json. Run `npm run setup` and then `npm run capture` first (README.md, Setup).');
if (!existsSync(new URL(`data/laps/${track}.json`, ROOT))) fail(`No human laps for ${track}. Run \`node scripts/fetch_laps.mjs ${track}\` first (it only reads the public leaderboard).`);
if (!existsSync(new URL(MODEL, ROOT))) fail(`No ${MODEL}. It is part of the repository; try \`git pull\`.`);

// Imported after the checks: these load the simulator, which needs data/.
const { humanLaps, decisionsToKeys } = await import('../ideas/shared/laps.mjs');
const { verifyAndSave } = await import('../ideas/shared/verify.mjs');
const { openBlockEnv, fromStart, roll } = await import('../ideas/shared/block_rollout.mjs');
const { loadPolicy, createRng } = await import('../ideas/shared/policy.mjs');

const human = humanLaps(track)[0];
console.log(`${shownName(track)}: best human lap ${(human.frames / 1000).toFixed(3)} s.`);

// ---- 1. the model's lap ------------------------------------------------------------

const keptFile = new URL(`runs/race-generalist_${track}.recording.json`, ROOT);
let model = null;
if (!redo && existsSync(keptFile)) {
  model = JSON.parse(readFileSync(keptFile, 'utf8'));
  console.log(`Model lap: ${(model.frames / 1000).toFixed(3)} s (${model.how}), kept from an earlier run. --redo drives it again.`);
} else {
  model = await driveModel();
  if (model) {
    mkdirSync(new URL('runs/', ROOT), { recursive: true });
    writeFileSync(keptFile, JSON.stringify(model, null, 1));
  }
}

/**
 * Let the generalist drive from the start line: greedy first, then the ten
 * test seeds. Returns { frames, recording, how } for the fastest lap that
 * passes Verify, or null when no attempt finishes.
 */
async function driveModel() {
  console.log(`Driving ${shownName(track)} with the best generalist (${MODEL})...`);
  const policy = loadPolicy(fileURLToPath(new URL(MODEL, ROOT)));
  const renv = await openBlockEnv(track);
  let best = null;
  const attempts = [['greedy', null], ...SEEDS.map((seed) => [`seed ${seed}`, seed])];
  for (const [how, seed] of attempts) {
    const obs = await fromStart(renv);
    const r = await roll(renv, obs, {
      policy, horizon: MAX_DECISIONS,
      ...(seed == null ? {} : { rng: createRng(seed), sampleUntil: MAX_DECISIONS }),
    });
    if (!r.finished) { console.log(`  ${how}: did not finish (${r.reason})`); continue; }
    const check = await verifyAndSave({ track, keys: decisionsToKeys(r.decisions), name: 'shared-race', save: false });
    if (!check.ok) { console.log(`  ${how}: finished, but the lap did not pass Verify; not used`); continue; }
    console.log(`  ${how}: ${(check.finishFrames / 1000).toFixed(3)} s, verified`);
    if (!best || check.finishFrames < best.frames) best = { frames: check.finishFrames, recording: check.recording, how };
    // Block models mostly finish greedy (CLAUDE.md); a greedy finish is the
    // model's own best guess, so the seeds are only a fallback.
    if (seed == null) break;
  }
  await renv.close?.();
  if (best) console.log(`Model lap: ${(best.frames / 1000).toFixed(3)} s (${best.how}).`);
  else console.log(`The generalist finished none of 11 attempts on ${shownName(track)}; racing the human ghost only.`);
  return best;
}

// ---- 2. the real client, with a leaderboard made here --------------------------------

const trackId = trackIdOf(track);
// Car colours: 16 bytes (version 0, pattern, rims, exhaust, then four
// 3-byte colours, low byte first), base64url, as the client's CarStyle
// serialises them. Pattern, rims and exhaust 0 are the defaults.
const carStyle = (rgb) => {
  const b = new Uint8Array(16);
  for (let k = 0; k < 4; k++) b.set([rgb & 255, (rgb >> 8) & 255, (rgb >> 16) & 255], 4 + 3 * k);
  return Buffer.from(b).toString('base64url');
};
const ghosts = [
  { id: 1, nickname: 'Best human', lap: human, style: carStyle(0x2f6fde) },
  ...(model ? [{ id: 2, nickname: 'Best generalist (bot)', lap: model, style: carStyle(0xff8a1e) }] : []),
].sort((a, b) => a.lap.frames - b.lap.frames);

/** Answers for the client's read-only requests; undefined = blocked. */
function answer(url) {
  const path = url.pathname.split('/').pop();
  if (path === 'leaderboard') {
    const entries = url.searchParams.get('trackId') === trackId ? ghosts : [];
    return {
      total: entries.length,
      entries: entries.map((g) => ({
        id: g.id, userId: `race-${g.id}`, nickname: g.nickname, frames: g.lap.frames,
        time: new Date().toISOString(), carStyle: g.style, verifiedState: 1, countryCode: null,
      })),
      userEntry: null,
    };
  }
  if (path === 'leaderboardUserEntry') return null; // "you have no lap on the server"
  if (path === 'recordings') {
    const ids = (url.searchParams.get('ids') ?? '').split(',').map(Number);
    return ids.map((id) => {
      const g = ghosts.find((x) => x.id === id);
      return g ? { recording: g.lap.recording, frames: g.lap.frames, verifiedState: 1, carStyle: g.style } : null;
    });
  }
  return undefined; // user, trackOfTheWeek, every upload: blocked
}

console.log('Opening the 0.6.3 client (Kodub\'s server blocked; the leaderboard is answered here)...');
const client = await openClient({ browser, headless: checkOnly, answer });
await openTrackPage(client.page, track);

const summary = ghosts.map((g) => `  ${g.nickname.padEnd(22)} ${(g.lap.frames / 1000).toFixed(3)} s`).join('\n');
if (checkOnly) {
  const dir = fileURLToPath(new URL('capture/', ROOT));
  mkdirSync(dir, { recursive: true });
  const { page } = client;
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${dir}race_1_track.png` });
  // Pick every ghost as an opponent (the client then fetches their
  // recordings), start the race, hold W for 1.5 s and look: the two ghosts
  // should be on the road just ahead.
  for (const g of ghosts) { await page.getByText(g.nickname, { exact: true }).first().click(); await page.waitForTimeout(2000); }
  await page.screenshot({ path: `${dir}race_2_opponents.png` });
  await page.locator('button.play').first().click(); // the track page's Play (a hidden button of the same name sits elsewhere)
  await page.waitForTimeout(3000);
  await page.keyboard.down('KeyW'); // the clock starts on the first key
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyW');
  await page.screenshot({ path: `${dir}race_3_racing.png` });
  console.log(`Ghosts:\n${summary}`);
  console.log(`Saved capture/race_1_track.png, race_2_opponents.png, race_3_racing.png. Answered ${client.answered()}, blocked ${client.blocked()} requests to Kodub's server.`);
  await client.close();
  process.exit(0);
}

console.log(`The game is open on ${shownName(track)}. Ghosts on its leaderboard:\n${summary}`);
console.log('Open the leaderboard, pick a ghost to race or watch, then press Play. Close the window when you are done; the temporary profile is deleted with it.');
await new Promise((resolve) => { client.page.on('close', resolve); client.browser.on('disconnected', resolve); });
console.log(`Closed. Answered ${client.answered()}, blocked ${client.blocked()} requests to Kodub's server.`);
await client.close();
process.exit(0);
