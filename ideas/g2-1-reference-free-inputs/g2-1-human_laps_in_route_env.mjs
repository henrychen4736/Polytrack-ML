// What route mode's episode ends (rl/racing_env.mjs, ROUTE MODE) would do to
// the HUMAN laps: a lap that is good driving should not be cut off.
//
//   node ideas/g2-1-reference-free-inputs/g2-1-human_laps_in_route_env.mjs [laps=3] [tracks=desert1,...]
//
// For each track, each of the first `laps` human laps of data/laps/<track>.json
// is driven with its own keys, tick for tick, in a RacingEnv with
// reference: 'route', and every 10 ms the environment's own route measures are
// read (_locate). Nothing ends the lap here; the script records what WOULD:
//   offRoute   largest distance from the route (units); 'off line' is > maxOffRoute (80)
//   bare1      longest run, in ms, with at least one wheel down, the route on
//              the road and no road within 2 units under the car
//   bare4      the same with all four wheels down: what 'off track' tests.
//              An offTrackTicks below this ends that lap.
//   stall      longest time, in ms, without a unit of route progress ('stalled' is > 2000)
//   progress   route progress at the finish / the route's length
// One simulator. Local use only: drives the local simulator; no network.
import { readFileSync } from 'node:fs';
import { RacingEnv } from '../../rl/racing_env.mjs';
import { toDense, decodeRecording } from '../../sim/recording.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')));
const LAPS = Number(args.laps ?? 3);
const TRACKS = (args.tracks ?? 'desert1,desert2,desert3,desert4,desert5,summer1,summer2,summer3,summer4,summer5,summer6,summer7,winter1,winter2,winter3,winter4,winter5').split(',');

console.log('track    lap  time     offRoute  bare1(ms) bare4(ms) stall(ms)  progress/length   would end');
for (const track of TRACKS) {
  const renv = await RacingEnv.create({ track, reference: 'route', block: 5, lapFraction: 0 });
  const laps = JSON.parse(readFileSync(new URL(`../../data/laps/${track}.json`, import.meta.url), 'utf8'));
  for (let n = 0; n < Math.min(LAPS, laps.length); n++) {
    const lap = laps[n];
    const keys = toDense(decodeRecording(lap.recording), lap.frames);
    // The start as demo() makes it: the untouched car, then the lap's first tick.
    if (!renv.ladder) await renv._buildLadder();
    await renv._restore(renv.ladder.rungs[0]);
    await renv._advance(keys[0] ?? {}, 1);
    renv.progressIndex = 0;
    renv._locate();
    let worstOff = 0, bare = 0, worstBare = 0, bare1 = 0, worstBare1 = 0, bestProgress = renv.progress, bestTick = 0, worstStall = 0, firstEnd = null;
    for (let t = 1; t < keys.length && renv.state.finishFrames == null; t += 10) {
      await renv._replayHuman(t, Math.min(keys.length, t + 10), keys);
      renv._locate();
      const s = renv.state, at = renv.at;
      worstOff = Math.max(worstOff, renv.offLine);
      if (at.grounded && s.wheelContact.some(Boolean) && !at.overRoad) bare1 += 10; else bare1 = 0;
      if (at.grounded && s.wheelContact.every(Boolean) && !at.overRoad) bare += 10; else bare = 0;
      worstBare = Math.max(worstBare, bare);
      worstBare1 = Math.max(worstBare1, bare1);
      if (renv.progress >= bestProgress + 1) { bestProgress = renv.progress; bestTick = s.frames; }
      worstStall = Math.max(worstStall, s.frames - bestTick);
      if (firstEnd == null) {
        if (renv.offLine > renv.cfg.maxOffRoute) firstEnd = `off line at ${(s.frames / 1000).toFixed(2)} s`;
        else if (s.frames - bestTick > renv.cfg.stallTicks) firstEnd = `stalled at ${(s.frames / 1000).toFixed(2)} s`;
        else if (bare > renv.cfg.offTrackTicks) firstEnd = `off track at ${(s.frames / 1000).toFixed(2)} s`;
      }
    }
    const finished = renv.state.finishFrames != null;
    console.log(`${track.padEnd(8)} ${String(n).padStart(3)}  ${(lap.frames / 1000).toFixed(3).padStart(7)}  ${worstOff.toFixed(1).padStart(8)}  ${String(worstBare1).padStart(9)} ${String(worstBare).padStart(9)}  ${String(worstStall).padStart(9)}  ${renv.progress.toFixed(0).padStart(6)} / ${String(renv.route.length).padEnd(6)} ${finished ? '' : '(no finish) '}${firstEnd ?? '-'}`);
  }
  await renv.close();
}
