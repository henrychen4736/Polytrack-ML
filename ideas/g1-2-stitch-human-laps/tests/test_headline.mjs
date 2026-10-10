// The README's headline: runs/g1-2-stitch_desert4 is a verified 21.730 s lap,
// 20 ms faster than the best human lap, made of lap 1 and then lap 7 from
// boundary 68 (17.0 s). Re-checked from the file with sim/env.mjs and the
// game's Verify only. One simulator.
import { checkHeadline, Env } from '../../shared/tests/headline.mjs';
import { humanLaps, timelineToKeys } from '../../shared/laps.mjs';
import { checker } from '../../shared/tests/harness.mjs';

const { check } = checker();
const env = await Env.create();
const r = await checkHeadline(env, check, { run: 'g1-2-stitch', track: 'desert4', claimed: 21730 });
await env.close();
if (r) {
  // "lap 1, then lap 7 from boundary 68 (17.0 s)": up to the switch the keys are lap 1's, tick for tick.
  const keys = timelineToKeys(r.timeline, 21730), laps = humanLaps('desert4');
  const same = (a, b) => ['up', 'right', 'down', 'left', 'reset'].every((ch) => !!a[ch] === !!b[ch]);
  const firstOff = (other) => { let t = 0; while (t < keys.length && t < other.length && same(keys[t], other[t])) t++; return t; };
  const offLap1 = firstOff(laps[1].keys);
  check(offLap1 > 16500 && offLap1 < 17500, `the stitched lap is human lap 1 key for key up to tick ${offLap1} (README: the switch is at 17.0 s)`);
  const others = laps.map((lap, n) => (n === 1 ? 0 : firstOff(lap.keys)));
  check(Math.max(...others) < 3000, `and it is no other human lap for that long (the longest other match ends at tick ${Math.max(...others)})`);
  check(laps[1].frames > 21730 && laps[7].frames > 21730, `lap 1 alone is ${laps[1].frames} ticks, so the stitched 21730 beats both of its parents' whole laps (lap 7: ${laps[7].frames})`);
}
