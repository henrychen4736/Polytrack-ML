// The README's headline: four verified laps faster than the best human lap.
// Re-checked from the recording files with sim/env.mjs and the game's Verify
// only (ideas/shared/tests/headline.mjs), one simulator.
import { readFileSync } from 'node:fs';
import { CHANNELS, decodeRecording } from '../../../sim/recording.mjs';
import { checkHeadline, Env } from '../../shared/tests/headline.mjs';
import { checker, ROOT } from '../../shared/tests/harness.mjs';

const { check, note } = checker();
const CLAIMS = { desert4: 21722, winter2: 26816, summer4: 34100, summer1: 22127 };

// Could the SimSession.load() defect have touched these laps? Only if this folder uses SimSession.
{
  const uses = ['search_human.mjs', 'section_worker.mjs'].filter((f) => /sim_session/.test(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')));
  check(uses.length === 0, 'g1-1 does not import ideas/shared/sim_session.mjs (it drives sim/env.mjs save states itself), so the SimSession.load() defect cannot have affected its laps');
}

const env = await Env.create();
for (const [track, claimed] of Object.entries(CLAIMS)) {
  const r = await checkHeadline(env, check, { run: 'g1-1-smoke', track, claimed });
  if (!r) continue;
  // README: "Only the last 7 s of each lap was searched; the rest of each lap is still the human's keys, untouched."
  const humanLine = decodeRecording(r.human.recording), cut = r.human.frames - 7000;
  const head = (timeline, tick) => JSON.stringify(CHANNELS.map((ch) => timeline[ch].filter((t) => t < tick)));
  let firstChange = Infinity;
  for (const ch of CHANNELS) {
    const a = humanLine[ch], b = r.timeline[ch];
    for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) { firstChange = Math.min(firstChange, a[i] ?? Infinity, b[i] ?? Infinity); break; }
  }
  check(head(r.timeline, cut) === head(humanLine, cut), `${track}: every key flip before tick ${cut} (the last 7 s) is the human's; the first difference is at tick ${firstChange}`);
  // The unverified progress file the search leaves in out/ is the same lap.
  const kept = JSON.parse(readFileSync(new URL(`ideas/g1-1-human-seed-search/out/g1-1-smoke_${track}.recording.json`, ROOT), 'utf8'));
  check(kept.frames === claimed && JSON.stringify(decodeRecording(kept.recording)) === JSON.stringify(r.timeline), `${track}: out/g1-1-smoke_${track}.recording.json is the same lap as the verified one in runs/`);
}
await env.close();
note('README table: desert4 21.722, winter2 26.816, summer4 34.100, summer1 22.127 s');
