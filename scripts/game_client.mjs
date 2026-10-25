// The real PolyTrack 0.6.3 client in a throwaway Edge window that cannot
// reach Kodub's server. Shared by scripts/watch_ghost.mjs (watch one stored
// lap) and scripts/race.mjs (race the best model and the best human).
//
// How it works, in plain terms: Playwright starts Edge with a fresh,
// incognito-style profile, opens the game from Kodub's own site, and sits
// between the game and Kodub's API server (vps.kodub.com). Every request to
// that server either gets an answer made up on this machine (`answer`, for
// the few read-only requests a caller wants to serve, such as a leaderboard)
// or is blocked. Nothing the game sends ever leaves the machine.
//
// SAFETY. Read this before changing anything here.
// When the client sees a stored lap that is faster than what the server has
// for you, it UPLOADS it to the leaderboard by itself (`syncRecord` in the
// main bundle). A bot lap must never get there. Two things prevent it:
//   1. No request reaches vps.kodub.com: each one is answered locally or
//      aborted (see `route` below). Only GET requests can be answered; a
//      POST (an upload) is always aborted, whatever `answer` says.
//   2. The browser profile is temporary. It is created for this run and
//      deleted when the window closes, so a planted lap never exists in a
//      browser that can reach the server.
// For the same reason, never paste a bot recording into localStorage in your
// normal browser: the game would submit it the next time it syncs.
//
//   const client = await openClient({ headless: false, answer });
//   client.page, client.profile    // Playwright page; { slot, token, tokenHash }
//   await openTrackPage(client.page, 'desert4');
//   client.blocked()               // requests aborted so far
//   await client.close();
//
// Local use only. Needs Microsoft Edge and playwright-core (npm install).
import { chromium } from 'playwright-core';
import { createHash } from 'node:crypto';
import { loadTrack } from '../sim/env.mjs';
import { decodeSaveString } from '../sim/track.mjs';

export const GAME_URL = 'https://app-polytrack.kodub.com/0.6.3/';
/** localStorage key prefix used by 0.6.3 (`polytrack_v5_` + `prod_` in the bundle). */
export const KEY_PREFIX = 'polytrack_v5_prod_';

export const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/** The game identifies a track by the SHA-256 of its raw bytes; leaderboards
 *  and stored laps are filed under that id. */
export const trackIdOf = (name) => sha256(decodeSaveString(loadTrack(name).trackData));

/** "winter1" -> "Winter 1", the name the game shows in its track list. */
export const shownName = (name) => name.replace(/^([a-z])([a-z]*)(\d+)$/, (_, a, rest, n) => `${a.toUpperCase()}${rest} ${n}`);

/**
 * Open the client and wait until it has made its local profile.
 *
 *   headless  true for automated checks (software rendering, fixed size)
 *   answer    optional (url: URL) => any. Called for GET requests to
 *             vps.kodub.com; what it returns is sent back as the JSON reply
 *             (null included: the server's "nothing" answer), undefined
 *             blocks the request. Without it every request is blocked.
 *
 * Returns { browser, page, profile, blocked(), answered(), close() }.
 */
export async function openClient({ headless = false, answer = null } = {}) {
  let browser;
  try {
    browser = await chromium.launch({
      channel: 'msedge',
      headless,
      // Software rendering flags are only needed when there is no window/GPU.
      args: headless ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] : ['--start-maximized'],
    });
  } catch (err) {
    // Playwright's own message for a missing browser is a page of install
    // advice for its bundled browsers, which this project does not use.
    if (/msedge|distribution/i.test(err.message)) {
      console.error('Microsoft Edge was not found. Install it (https://www.microsoft.com/edge) and run this again.');
      process.exit(1);
    }
    throw err;
  }
  // newContext() is an incognito-style profile: nothing is shared with your
  // real Edge profile and everything is discarded when the browser closes.
  const context = await browser.newContext({ viewport: headless ? { width: 1280, height: 800 } : null });
  let blocked = 0, answered = 0;
  await context.route(/vps\.kodub\.com/, (route) => {
    const request = route.request();
    const reply = request.method() === 'GET' && answer ? answer(new URL(request.url())) : undefined;
    if (reply === undefined) { blocked++; return route.abort(); }
    answered++;
    // The game is served from another origin, so the reply needs CORS headers
    // the way Kodub's server sends them.
    return route.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(reply) });
  });
  const page = await context.newPage();
  await page.goto(GAME_URL, { waitUntil: 'load' });

  // On first load the client creates a local profile with a random token. A
  // stored lap is only accepted if it carries the hash of that token, so wait
  // for the profile to appear and read the token back.
  await page.waitForFunction((p) => Object.keys(localStorage).some((k) => /_user_\d$/.test(k) && k.startsWith(p)), KEY_PREFIX, { timeout: 120000 });
  const profile = await page.evaluate((p) => {
    const key = Object.keys(localStorage).find((k) => k.startsWith(p) && /_user_\d$/.test(k));
    return { slot: Number(key.at(-1)), token: JSON.parse(localStorage.getItem(key)).token };
  }, KEY_PREFIX);
  profile.tokenHash = sha256(profile.token);

  return {
    browser, page, profile,
    blocked: () => blocked,
    answered: () => answered,
    close: () => browser.close().catch(() => {}),
  };
}

/**
 * Plant a lap as this profile's stored best on a track. This is the exact
 * shape the client's own saveRecord writes:
 *   uploadId   null = "not on the server"
 *   tokenHash  ties the lap to this local profile
 *   frames     lap time in physics ticks (ms)
 *   recording  the recording string
 * "_default_" is the key variant used when the client's determinism
 * self-test passes. Reload the page afterwards for the client to read it.
 */
export async function plantRecord(client, name, { frames, recording }) {
  const key = `${KEY_PREFIX}record_${client.profile.slot}_default_${trackIdOf(name)}`;
  const value = JSON.stringify({ uploadId: null, tokenHash: client.profile.tokenHash, frames, recording });
  await client.page.evaluate(([k, v]) => localStorage.setItem(k, v), [key, value]);
}

/**
 * Go to a track's own page: its leaderboard on the left; on the right its
 * Personal best, "Opponents" (leaderboard entries picked to race against),
 * Watch and Play. A brand-new profile always opens driving on Summer 1, the
 * game's tutorial track, with only Exit, Watch and Next Track at the top;
 * "Exit" goes to the track list and clicking a track's name opens its page.
 * Checked on 25 October 2026 with screenshots (scripts/race.mjs --check).
 */
export async function openTrackPage(page, name) {
  const exit = page.getByText('Exit', { exact: true }).first();
  await exit.waitFor({ timeout: 120000 });
  await page.waitForTimeout(2000); // let the first track finish loading before leaving it
  await exit.click();
  await page.getByText(shownName(name), { exact: true }).first().click();
  await page.getByText('Leaderboard', { exact: true }).first().waitFor({ timeout: 60000 });
}
