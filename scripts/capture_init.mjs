// Capture the messages the real 0.6.3 client posts to its simulation worker
// (Init, CreateCar, ...) so the headless harness can replay them verbatim.
// Runs headless Edge against the official client; all requests to Kodub's API
// server are blocked, so nothing is read from or written to the leaderboards.
// Usage: node scripts/capture_init.mjs [--track "Summer 1"]
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const GAME_URL = 'https://app-polytrack.kodub.com/0.6.3/';
const OUT = new URL('../capture/', import.meta.url);

const browser = await chromium.launch({
  channel: 'msedge', headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
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
await browser.close();
