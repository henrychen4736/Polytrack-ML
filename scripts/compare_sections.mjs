// Where does a lap lose time against the human lap?
//
// Cuts the reference line (the human's trajectory) into equal sections and,
// for each section, compares the human lap with one of our saved laps:
//   - time spent in the section, and the difference,
//   - speed on entering the section,
//   - the furthest our car got from the human's line.
// A lap being "0.8 s slower" then becomes "it loses 0.3 s in sections 14-16".
//
// How a lap is placed on the line: we replay it tick by tick and, on every
// tick, find the nearest line point at or ahead of where the car was on the
// previous tick (the same forward-only search the controller uses). A section
// is entered on the first tick the car's line index reaches the section's
// first point.
//
// Usage: node scripts/compare_sections.mjs [track] [run] [sections]
//   track     summer1 (default)
//   run       tuned (default), baseline or search: reads runs/<run>_<track>.recording.json
//   sections  24 (default), the same count the settings search tunes
import { readFileSync } from 'node:fs';
import { Env, loadTrack } from '../sim/env.mjs';
import { decodeState } from '../sim/state.mjs';
import { buildLine, nearestIndex } from '../sim/line.mjs';
import { loadHumanLap } from '../sim/drive.mjs';

const [name = 'summer1', run = 'tuned', sectionsArg = '24'] = process.argv.slice(2);
const SECTIONS = Number(sectionsArg);

let lap;
try {
  lap = JSON.parse(readFileSync(new URL(`../runs/${run}_${name}.recording.json`, import.meta.url), 'utf8'));
} catch {
  console.error(`No runs/${run}_${name}.recording.json. Export one with scripts/export_recording.mjs.`);
  process.exit(1);
}

const track = loadTrack(name);
const env = await Env.create();
const human = loadHumanLap(name);
const humanRun = await env.replay(track, human.recording, human.frames + 100);
const line = buildLine(humanRun.states);
const ourRun = await env.replay(track, lap.recording, lap.frames + 100);
await env.close();

/**
 * Walk a lap's states along the line and summarise each section.
 * Returns one entry per section: { enterTick, enterKmh, worstOff }.
 * enterTick is null if the lap never reached that section.
 */
function profile(states) {
  const out = Array.from({ length: SECTIONS }, () => ({ enterTick: null, enterKmh: null, worstOff: 0 }));
  // First line index belonging to section k.
  const firstIndex = (k) => Math.floor((k * line.points.length) / SECTIONS);
  let progress = 0;
  let section = -1;
  for (const u8 of states) {
    const s = decodeState(u8);
    const near = nearestIndex(line, s.position, progress);
    progress = near.index;
    // Entered one or more new sections on this tick?
    while (section + 1 < SECTIONS && progress >= firstIndex(section + 1)) {
      section++;
      out[section].enterTick = s.frames;
      out[section].enterKmh = s.speedKmh;
    }
    if (section >= 0) out[section].worstOff = Math.max(out[section].worstOff, near.distance);
  }
  return out;
}

const h = profile(humanRun.states);
const o = profile(ourRun.states);
// Time in section k = entry to the next section, or to the finish for the last.
const duration = (p, k, finishTick) => (p[k].enterTick == null ? null : ((k + 1 < SECTIONS ? p[k + 1].enterTick : finishTick) ?? finishTick) - p[k].enterTick);

console.log(`${name}: "${run}" lap ${(lap.frames / 1000).toFixed(3)} s vs human ${(human.frames / 1000).toFixed(3)} s (${lap.frames - human.frames} ms slower), ${SECTIONS} sections of about ${(line.length / SECTIONS).toFixed(0)} units\n`);
console.log('section  line%   human ms  ours ms   lost ms   entry km/h (human / ours)   worst off line');
const rows = [];
for (let k = 0; k < SECTIONS; k++) {
  const hd = duration(h, k, human.frames), od = duration(o, k, lap.frames);
  const lost = od - hd;
  rows.push({ k, lost });
  console.log(
    `${String(k).padStart(5)}   ${String(Math.round((100 * k) / SECTIONS)).padStart(3)}%   ${String(hd).padStart(7)}  ${String(od).padStart(7)}   ${(lost >= 0 ? '+' : '') + lost}`.padEnd(48) +
    `${h[k].enterKmh.toFixed(0).padStart(6)} / ${o[k].enterKmh.toFixed(0).padEnd(6)}`.padEnd(30) +
    `${o[k].worstOff.toFixed(1)}`,
  );
}
const total = rows.reduce((n, r) => n + r.lost, 0);
const worst = [...rows].sort((a, b) => b.lost - a.lost).slice(0, 5);
console.log(`\ntotal lost: ${total} ms. Biggest losses: ${worst.map((r) => `section ${r.k} (+${r.lost} ms)`).join(', ')}`);
process.exit(0);
