// Capture the messages the real 0.6.3 client posts to its simulation worker
// (Init, CreateCar, ...) so the headless harness can replay them verbatim.
// Runs a headless browser (Edge by default; browser=chrome or browser=firefox,
// see scripts/game_client.mjs) against the official client; all requests to Kodub's API
// server are blocked, so nothing is read from or written to the leaderboards.
//
// Writes capture/worker_messages.json (every message, for study) and the two
// files the simulator reads (sim/host.mjs loadCaptured):
//   data/init_0.6.3.json       the Init message (track parts, car shape)
//   data/createcar_summer1.json  the first CreateCar: a new profile always
//                              opens on Summer 1, the tutorial track
// Until 25 October 2026 those two were copied out of worker_messages.json by
// hand, so a fresh clone could not get past "npm run capture"; they are the
// type-0 and type-3 messages verbatim. Checked on 25 October 2026 against
// the files the project was built on: CreateCar identical; Init identical
// except isRealtime (true here, false in the old file), which sim/host.mjs
// sets to false when it sends Init anyway.
//
// Usage: node scripts/capture_init.mjs [browser=edge|chrome|firefox] [--steps '<json>'] [--dump-dom]
import { writeFileSync, mkdirSync } from 'node:fs';
import { launchBrowser, browserArg } from './game_client.mjs';

const GAME_URL = 'https://app-polytrack.kodub.com/0.6.3/';
const OUT = new URL('../capture/', import.meta.url);
const DATA = new URL('../data/', import.meta.url);
mkdirSync(OUT, { recursive: true });
mkdirSync(DATA, { recursive: true });

const browser = await launchBrowser(browserArg(process.argv.slice(2)), { headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await page.route(/vps\.kodub\.com/, (r) => r.abort());
page.on('console', (m) => { if (m.type() === 'error') console.log('[page error]', m.text().slice(0, 200)); });

await page.addInitScript(() => {
  const enc = (v) => {
    if (ArrayBuffer.isView(v)) {
      const u8 = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
      let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      return { __ta: v.constructor.name, b64: btoa(s) };
    }
    if (Array.isArray(v)) return v.map(enc);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)]));
    return v;
  };
  window.__cap = [];
  const RealWorker = window.Worker;
  window.Worker = class extends RealWorker {
    constructor(url, opts) { super(url, opts); this.__url = String(url); }
    postMessage(msg, ...rest) {
      // 6 = ControlCar: skip the per-keypress stream
      if (msg?.messageType !== 6) window.__cap.push({ url: this.__url, msg: enc(msg) });
      return super.postMessage(msg, ...rest);
    }
  };
});

await page.goto(GAME_URL, { waitUntil: 'load' });
const shot = (n) => page.screenshot({ path: new URL(`${n}.png`, OUT).pathname.slice(1) });
const types = async () => (await page.evaluate(() => window.__cap.map((c) => c.msg.messageType))).join(',');

await page.waitForFunction(() => window.__cap.some((c) => c.msg.messageType === 0), null, { timeout: 120000 });
console.log('Init captured; message types so far:', await types());
await page.waitForTimeout(3000);
await shot('01_menu');

const steps = process.argv.includes('--steps') ? JSON.parse(process.argv[process.argv.indexOf('--steps') + 1]) : [];
for (const [i, s] of steps.entries()) {
  if (s.text) await page.getByText(s.text, { exact: s.exact ?? true }).first().click({ timeout: 15000 });
  else if (s.css) await page.locator(s.css).first().click({ timeout: 15000 });
  else if (s.key) await page.keyboard.press(s.key);
  await page.waitForTimeout(s.wait ?? 2500);
  await shot(`0${i + 2}_step`);
  console.log(`step ${JSON.stringify(s)} -> types:`, await types());
}
if (process.argv.includes('--dump-dom')) {
  console.log(await page.evaluate(() => [...document.querySelectorAll('button, .button, [class*=button]')].map((b) => `${b.tagName}.${b.className}: ${b.innerText.replace(/\s+/g, ' ').slice(0, 60)}`).join('\n')));
}

const cap = await page.evaluate(() => window.__cap);
writeFileSync(new URL('worker_messages.json', OUT), JSON.stringify(cap));
console.log(`wrote capture/worker_messages.json (${cap.length} messages)`);
const init = cap.find((c) => c.msg.messageType === 0);
writeFileSync(new URL('init_0.6.3.json', DATA), JSON.stringify(init.msg));
console.log('wrote data/init_0.6.3.json');
// With --steps the client may have left Summer 1 before its first car, so
// only a plain run names the CreateCar after it.
const createCar = cap.find((c) => c.msg.messageType === 3);
if (createCar && !steps.length) {
  writeFileSync(new URL('createcar_summer1.json', DATA), JSON.stringify(createCar.msg));
  console.log('wrote data/createcar_summer1.json');
}
await browser.close();
