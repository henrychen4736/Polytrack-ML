// How does a saved attempt use the keys, compared with the human lap?
//
// Two questions this answers:
//   1. Overall: for each key, what share of the lap is it held, and how many
//      times per second is it pressed or released? A human holds W almost all
//      the time and changes keys a few times per second. An agent that
//      "feathers" a key (taps it on and off) shows up as a low share and a
//      high toggle rate.
//   2. Near the end of the attempt: stretch by stretch along the line, the
//      human's speed and ours, how far off the line we were, and how much of
//      each stretch W and S were held. For an attempt that crashed, this is
//      the approach to the crash.
//
// Usage: node scripts/key_usage.mjs <track> <run> [stretches] [stretchLength]
//   reads      runs/<run>_<track>.json (from rl/evaluate.py or check_track.mjs)
//   stretches  how many stretches before the end to print (default 16)
//   stretchLength  line points per stretch (default 15; one point = 1 unit)
import { readFileSync } from 'node:fs';
import { Env, loadTrack } from '../sim/env.mjs';
import { decodeState } from '../sim/state.mjs';
import { buildLine, nearestIndex } from '../sim/line.mjs';
import { loadHumanLap } from '../sim/drive.mjs';
import { CHANNELS, fromDense, toDense, encodeRecording, decodeRecording } from '../sim/recording.mjs';

const [name, run, stretchesArg = '16', lengthArg = '15'] = process.argv.slice(2);
if (!name || !run) { console.error('usage: node scripts/key_usage.mjs <track> <run> [stretches] [stretchLength]'); process.exit(2); }
const STRETCHES = Number(stretchesArg), LENGTH = Number(lengthArg);

const saved = JSON.parse(readFileSync(new URL(`../runs/${run}_${name}.json`, import.meta.url), 'utf8'));
const ourKeys = saved.controlsPerTick;
const track = loadTrack(name);
const human = loadHumanLap(name);
const humanKeys = toDense(decodeRecording(human.recording), human.frames);

const env = await Env.create();
const humanRun = await env.replay(track, human.recording, human.frames + 100);
const line = buildLine(humanRun.states);
const ourRun = await env.replay(track, encodeRecording(fromDense(ourKeys)), ourKeys.length);
await env.close();

// ---- 1. overall key use -----------------------------------------------------
function keyUse(keys) {
  const out = {};
  for (const ch of ['up', 'down', 'left', 'right']) {
    let held = 0, toggles = 0;
    for (let k = 0; k < keys.length; k++) {
      if (keys[k][ch]) held++;
      if (k > 0 && !!keys[k][ch] !== !!keys[k - 1][ch]) toggles++;
    }
    out[ch] = { share: held / keys.length, perSecond: toggles / (keys.length / 1000) };
  }
  return out;
}
const hu = keyUse(humanKeys), ou = keyUse(ourKeys);
console.log(`${name}: "${run}" (${(ourKeys.length / 1000).toFixed(2)} s, ${saved.finished === false ? 'did not finish' : 'finished'}) vs human (${(human.frames / 1000).toFixed(2)} s)\n`);
console.log('key     held: human / ours     presses+releases per second: human / ours');
for (const [ch, label] of [['up', 'W'], ['down', 'S'], ['left', 'A'], ['right', 'D']]) {
  console.log(`${label}       ${(100 * hu[ch].share).toFixed(0).padStart(3)}% / ${(100 * ou[ch].share).toFixed(0).padStart(3)}%` +
    `            ${hu[ch].perSecond.toFixed(1).padStart(5)} / ${ou[ch].perSecond.toFixed(1).padStart(5)}`);
}

// ---- 2. the approach to the end ---------------------------------------------
/** Per line stretch: mean speed, W and S share, worst distance from the line, wheels-on-ground share. */
function profile(states, keys) {
  const rows = new Map();
  let progress = 0;
  states.forEach((u8, k) => {
    const s = decodeState(u8);
    const near = nearestIndex(line, s.position, progress);
    progress = near.index;
    const id = Math.floor(progress / LENGTH);
    let r = rows.get(id);
    if (!r) rows.set(id, (r = { ticks: 0, kmh: 0, up: 0, down: 0, off: 0, enter: s.frames }));
    r.ticks++; r.kmh += s.speedKmh; r.off = Math.max(r.off, near.distance);
    if (keys[k]?.up) r.up++;
    if (keys[k]?.down) r.down++;
  });
  return { rows, last: Math.floor(progress / LENGTH) };
}
const h = profile(humanRun.states, humanKeys), o = profile(ourRun.states, ourKeys);
const pct = (r, key) => (r ? `${Math.round((100 * r[key]) / r.ticks)}%`.padStart(4) : '   -');
console.log(`\nlast ${STRETCHES} stretches of ${LENGTH} units before the attempt ended (line point ${o.last * LENGTH} of ${line.points.length}):`);
console.log('line pt  human-in-air   km/h human / ours   W held human / ours   S held human / ours   ours off line   time human / ours (ms)');
for (let id = Math.max(0, o.last - STRETCHES + 1); id <= o.last; id++) {
  const a = h.rows.get(id), b = o.rows.get(id);
  // Share of this stretch's line points where the human's wheels were off the ground.
  let air = 0;
  for (let p = id * LENGTH; p < Math.min((id + 1) * LENGTH, line.points.length); p++) if (!line.grounded[p]) air++;
  console.log(`${String(id * LENGTH).padStart(6)}   ${`${Math.round((100 * air) / LENGTH)}%`.padStart(8)}        ` +
    `${a ? (a.kmh / a.ticks).toFixed(0).padStart(4) : '   -'} / ${b ? (b.kmh / b.ticks).toFixed(0).padStart(4) : '   -'}        ` +
    `${pct(a, 'up')} / ${pct(b, 'up')}          ${pct(a, 'down')} / ${pct(b, 'down')}        ` +
    `${b ? b.off.toFixed(1).padStart(6) : '     -'}          ${a ? String(a.ticks).padStart(5) : '    -'} / ${b ? String(b.ticks).padStart(5) : '    -'}`);
}
process.exit(0);
