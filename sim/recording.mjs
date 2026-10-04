// PolyTrack recording codec. A recording is five channels of toggle frames
// (up, right, down, left, reset; every channel starts false). On the wire each
// channel is a u24 count followed by u24 deltas between toggles, the whole
// thing zlib-deflated (level 9) and base64url-encoded without padding.
import zlib from 'node:zlib';

export const CHANNELS = ['up', 'right', 'down', 'left', 'reset'];

/** Recording string -> { up: [absolute toggle frames], right: [...], ... } */
export function decodeRecording(str) {
  const raw = zlib.inflateSync(Buffer.from(str, 'base64url'));
  const rec = {};
  let o = 0;
  const u24 = () => { const v = raw[o] | (raw[o + 1] << 8) | (raw[o + 2] << 16); o += 3; return v; };
  for (const ch of CHANNELS) {
    const n = u24();
    const toggles = [];
    let acc = 0;
    for (let i = 0; i < n; i++) toggles.push((acc += u24()));
    rec[ch] = toggles;
  }
  return rec;
}

export function encodeRecording(rec) {
  const bytes = [];
  const u24 = (v) => bytes.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff);
  for (const ch of CHANNELS) {
    const toggles = rec[ch] ?? [];
    u24(toggles.length);
    let prev = 0;
    for (const f of toggles) { u24(f - prev); prev = f; }
  }
  return zlib.deflateSync(Buffer.from(bytes), { level: 9 }).toString('base64url');
}

/** Expand to one {up,right,down,left,reset} object per frame. */
export function toDense(rec, numFrames) {
  const idx = [0, 0, 0, 0, 0];
  const state = [false, false, false, false, false];
  const out = new Array(numFrames);
  for (let f = 0; f < numFrames; f++) {
    for (let c = 0; c < 5; c++) {
      const t = rec[CHANNELS[c]];
      while (idx[c] < t.length && t[idx[c]] <= f) { state[c] = !state[c]; idx[c]++; }
    }
    out[f] = { up: state[0], right: state[1], down: state[2], left: state[3], reset: state[4] };
  }
  return out;
}

export function fromDense(frames) {
  const rec = Object.fromEntries(CHANNELS.map((ch) => [ch, []]));
  frames.forEach((st, f) => {
    for (const ch of CHANNELS) if (!!st[ch] !== (rec[ch].length % 2 === 1)) rec[ch].push(f);
  });
  return rec;
}
