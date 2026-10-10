// refine.mjs and smoothness.mjs as commands: exit codes, what they print and
// write. One script at a time (each uses its own 2 worker processes); the
// independent replay of a written lap happens after the script has ended.
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { Env, loadTrack } from '../../../sim/env.mjs';
import { decodeRecording, CHANNELS } from '../../../sim/recording.mjs';
import { humanLaps, keysToTimeline } from '../../shared/laps.mjs';
import { nudge, shiftTail } from '../fine.mjs';
import { checker, runNode, removeFiles, ROOT } from '../../shared/tests/harness.mjs';

const { check, eq, note } = checker();
const REFINE = 'ideas/g1-5-fine-key-timing/refine.mjs', SMOOTH = 'ideas/g1-5-fine-key-timing/smoothness.mjs';
const TMP = 'ideas/g1-5-fine-key-timing/tests/tmp/';
const runFiles = ['runs/g1-5-test-refine_desert4.json', 'runs/g1-5-test-refine_desert4.recording.json', 'runs/g1-5-test-short_desert4.json', 'runs/g1-5-test-short_desert4.recording.json'];
const clean = () => { removeFiles(runFiles); rmSync(new URL(TMP, ROOT), { recursive: true, force: true }); };
const exists = (file) => existsSync(new URL(file, ROOT));
const read = (file) => JSON.parse(readFileSync(new URL(file, ROOT), 'utf8'));
const human = humanLaps('desert4')[0];
clean();
mkdirSync(new URL(TMP, ROOT), { recursive: true });

// ---- refine.mjs: wrong use --------------------------------------------------------------
let r = await runNode(REFINE, []);
check(r.code === 1 && /usage/.test(r.out), `refine.mjs with no lap: exit code ${r.code} (want 1) and a usage line`);
writeFileSync(new URL(`${TMP}test-short.recording.json`, ROOT), JSON.stringify({ track: 'desert4', frames: 3000, recording: human.recording }));
r = await runNode(REFINE, [`${TMP}test-short.recording.json`, 'seconds=5', 'name=g1-5-test-short']);
check(r.code === 1 && /does not finish/.test(r.out), `refine.mjs on a lap that does not finish: exit code ${r.code} (want 1) and it says so`);
check(!runFiles.some(exists), 'and nothing is written to runs/');

// ---- refine.mjs: the flips of the human lap from 21.0 s on, one pass ------------------------
// The same settings as the README's human smoke test except `from`, so the
// first accepted changes must be the first ones of the README's log.
r = await runNode(REFINE, ['human:0', 'track=desert4', 'from=21000', 'window=10', 'passes=1', 'name=g1-5-test-refine', `log=${TMP}test-log.json`]);
check(r.code === 0 && /desert4: human:0 finishes on tick 21750/.test(r.out), `refine.mjs human:0 from=21000 window=10 passes=1: exit code ${r.code}; the input is driven and finishes on 21750 (${r.seconds.toFixed(0)} s)`);
const said = r.out.match(/PASS Verify: the game finishes the result on tick (\d+)/);
if (check(said && runFiles.slice(0, 2).every(exists) && exists(`${TMP}test-log.json`), `it reports PASS Verify (tick ${said?.[1]}) and wrote the two runs/ files and the log`)) {
  const frames = Number(said[1]), saved = read(runFiles[1]), log = read(`${TMP}test-log.json`);
  eq([saved.frames, log.frames, log.inputFrames, log.verified, log.input], [frames, frames, 21750, true, 'human:0'], 'the recording file, the log and the printed line agree on the result');
  check(frames <= 21750, `the result (${frames}) is not slower than the input (21750)`);
  // The log is a chain: each change starts from the time the one before reached.
  const chain = log.accepted.every((a, k) => a.after < a.before && a.before === (k ? log.accepted[k - 1].after : 21750)) && (log.accepted.at(-1)?.after ?? 21750) === frames;
  check(chain, `the ${log.accepted.length} accepted changes form a chain from 21750 down to ${frames}, each strictly faster than the one before`);
  // Applying the logged moves to the human lap with fine.mjs must give the saved lap.
  let timeline = keysToTimeline(human.keys);
  for (const a of log.accepted) timeline = a.move === 'nudge' ? nudge(timeline, a.key, timeline[a.key].indexOf(a.tick), a.d) : shiftTail(timeline, a.tick, a.d);
  const upTo = (t) => JSON.stringify(CHANNELS.map((ch) => t[ch].filter((x) => x < frames)));
  check(upTo(timeline) === upTo(decodeRecording(saved.recording)), 'the logged moves, applied to the human lap by hand, give exactly the saved lap');
  // Against the README's log of the longer run.
  const readme = read('ideas/g1-5-fine-key-timing/smoke_human_desert4.json').accepted.filter((a) => a.tick >= 21000);
  const short = (a) => `${a.key}@${a.tick} ${a.move} ${a.d} -> ${a.after}`;
  eq(log.accepted.map(short), readme.map(short), `deterministic: the changes accepted here are the README log's own changes at flips after 21.0 s (${readme.map(short).join('; ')})`);
  const env = await Env.create(), inputs = loadTrack('desert4');
  const full = await env.evaluate(inputs, saved.recording, frames + 1000);
  const at = await env.worker.verify({ ...inputs, carRecording: saved.recording, targetFrames: frames });
  const early = await env.worker.verify({ ...inputs, carRecording: saved.recording, targetFrames: frames - 1 });
  await env.close();
  check(full.finished && full.finishFrames === frames && at && !early, `independently: the saved lap replays from the start line to tick ${full.finishFrames}; Verify accepts ${frames} and rejects ${frames - 1}`);
}

// ---- smoothness.mjs ---------------------------------------------------------------------------
r = await runNode(SMOOTH, []);
check(r.code === 1 && /usage/.test(r.out), `smoothness.mjs with no lap: exit code ${r.code} (want 1) and a usage line`);
r = await runNode(SMOOTH, [`${TMP}test-short.recording.json`]);
check(r.code === 1 && /does not finish/.test(r.out), `smoothness.mjs on a lap that does not finish: exit code ${r.code} (want 1)`);
r = await runNode(SMOOTH, ['human:0', 'track=desert4', 'flips=2', 'window=3', 'from=21000', `out=${TMP}test-smooth.json`]);
if (check(r.code === 0 && exists(`${TMP}test-smooth.json`), `smoothness.mjs human:0 flips=2 window=3 from=21000: exit code ${r.code}, output file written (${r.seconds.toFixed(0)} s)`)) {
  const out = read(`${TMP}test-smooth.json`);
  eq([out.track, out.baseFrames, out.flips.length, out.overall.window], ['desert4', 21750, 2, 3], 'the file: track, the input\'s finish tick, 2 flips, window 3');
  check(out.flips.every((row) => row.tick >= 21000 && row.tried === row.points.length && row.points.map((p) => p.d).join() === [-3, -2, -1, 0, 1, 2, 3].join()), 'each flip was moved by every d from -3 to 3');
  check(out.flips.every((row) => row.points.find((p) => p.d === 0).frames === 21750), 'd = 0 (the lap unmoved, from the save state) finishes on the input\'s tick in every row');
  check(out.flips.every((row) => row.lost === row.points.filter((p) => p.frames == null).length && row.bestGain >= 0), '`lost` counts the points without a finish tick; the best gain is never negative (d = 0 is among the points)');
  check(out.flips[0].tick !== out.flips[1].tick, 'the two sampled flips are different flips (first and last in range)');
}
// flips=1 used to crash (0 / 0 in the choice of the sample).
r = await runNode(SMOOTH, ['human:0', 'track=desert4', 'flips=1', 'window=2', 'from=21000', `out=${TMP}test-smooth1.json`]);
check(r.code === 0 && exists(`${TMP}test-smooth1.json`) && read(`${TMP}test-smooth1.json`).flips.length === 1, `smoothness.mjs flips=1: exit code ${r.code} (want 0), one flip measured`);
note('refine.mjs writes its lap even when nothing was gained (then it is the input lap); this run gained, so that case is not exercised here');
clean();
