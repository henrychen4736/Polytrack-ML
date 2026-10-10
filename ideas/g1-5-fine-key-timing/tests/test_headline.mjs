// The README's results, re-checked from the files with sim/env.mjs and the
// game's Verify only (ideas/shared/tests/headline.mjs). One simulator.
//   runs/g1-5-smoke-human_desert4   21.722 s, 28 ms faster than the best human lap
//   runs/g1-5-smoke_desert4         21.907 s, the searched lap unchanged (0 ms gained)
import { readFileSync, existsSync } from 'node:fs';
import { CHANNELS, decodeRecording } from '../../../sim/recording.mjs';
import { loadTrack } from '../../../sim/env.mjs';
import { checkHeadline, Env } from '../../shared/tests/headline.mjs';
import { nudge, shiftTail } from '../fine.mjs';
import { checker, ROOT } from '../../shared/tests/harness.mjs';

const { check, eq, note } = checker();
const read = (file) => JSON.parse(readFileSync(new URL(file, ROOT), 'utf8'));
const upTo = (timeline, tick) => JSON.stringify(CHANNELS.map((ch) => timeline[ch].filter((t) => t < tick)));

const env = await Env.create();
const r = await checkHeadline(env, check, { run: 'g1-5-smoke-human', track: 'desert4', claimed: 21722 });
if (r) {
  const log = read('ideas/g1-5-fine-key-timing/smoke_human_desert4.json');
  eq([log.inputFrames, log.frames, log.verified, log.accepted.length], [21750, 21722, true, 9], 'smoke_human_desert4.json: 21750 -> 21722, verified, 9 accepted changes');
  const shifts = log.accepted.filter((a) => a.move === 'shift');
  eq([shifts.length, shifts.filter((a) => a.d === -10).length], [7, 5], 'README: seven of the nine were tail shifts, five of them at the window edge (-10 ms)');
  // The logged moves applied to the human lap must give the saved lap: the log explains the whole result.
  const human = { timeline: decodeRecording(r.human.recording) };
  let timeline = human.timeline;
  for (const a of log.accepted) timeline = a.move === 'nudge' ? nudge(timeline, a.key, timeline[a.key].indexOf(a.tick), a.d) : shiftTail(timeline, a.tick, a.d);
  check(upTo(timeline, 21722) === upTo(r.timeline, 21722), 'the nine logged moves, applied to the human lap by hand with fine.mjs, give exactly the saved 21.722 s lap');
  // README: flips from 17.75 s on, window 10: nothing before 17740 can have changed.
  check(upTo(r.timeline, 17740) === upTo(human.timeline, 17740), 'every key flip before tick 17740 is the human\'s (only the last 4 s were re-timed)');
  // g1-1 also reports 21.722 on desert4. The same lap?
  if (existsSync(new URL('runs/g1-1-smoke_desert4.recording.json', ROOT))) {
    const other = decodeRecording(read('runs/g1-1-smoke_desert4.recording.json').recording);
    note(`g1-1's desert4 lap is also 21722 ticks; it is ${upTo(other, 21722) === upTo(r.timeline, 21722) ? 'THE SAME lap' : 'a different lap (different key timings), so the equal time is a coincidence'}`);
  }
}

// ---- smoke test 1: the searched lap, nothing gained --------------------------------------------
{
  const log = read('ideas/g1-5-fine-key-timing/smoke_desert4.json');
  eq([log.input, log.inputFrames, log.frames, log.accepted.length, log.drives], ['runs/rollout_desert4.recording.json', 21907, 21907, 0, 821], 'smoke_desert4.json: searched lap 21907 -> 21907, no accepted change in 821 drives (README: 820 candidates + the input)');
  const saved = read('runs/g1-5-smoke_desert4.recording.json'), input = read('runs/rollout_desert4.recording.json');
  check(saved.frames === 21907 && upTo(decodeRecording(saved.recording), 21907) === upTo(decodeRecording(input.recording), 21907), 'runs/g1-5-smoke_desert4 is the input lap key for key ("Verify PASS (the input, unchanged)")');
  const inputs = loadTrack('desert4');
  const full = await env.evaluate(inputs, saved.recording, 23000);
  const at = await env.worker.verify({ ...inputs, carRecording: saved.recording, targetFrames: 21907 });
  const early = await env.worker.verify({ ...inputs, carRecording: saved.recording, targetFrames: 21906 });
  check(full.finishFrames === 21907 && at && !early, 'it replays to tick 21907; Verify accepts 21907 and rejects 21906');
}
await env.close();
