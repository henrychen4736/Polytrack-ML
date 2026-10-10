// stitch_laps.mjs as a command: exit codes, the numbers it prints, the lap it
// writes. One run at a time (each is one simulator); the independent replay
// of a written lap happens after the script has ended.
import { existsSync, readFileSync } from 'node:fs';
import { Env, loadTrack } from '../../../sim/env.mjs';
import { decodeRecording } from '../../../sim/recording.mjs';
import { checker, runNode, removeFiles, ROOT } from '../../shared/tests/harness.mjs';

const { check, note } = checker();
const SCRIPT = 'ideas/g1-2-stitch-human-laps/stitch_laps.mjs';
const filesOf = (name) => [`runs/${name}_desert4.json`, `runs/${name}_desert4.recording.json`];
const NAMES = ['g1-2-test-stitch', 'g1-2-test-nolap', 'g1-2-test-many'];
const clean = () => removeFiles(NAMES.flatMap(filesOf));
const exists = (file) => existsSync(new URL(file, ROOT));
const read = (file) => JSON.parse(readFileSync(new URL(file, ROOT), 'utf8'));
clean();

/** Replay a saved recording file from the start line and run the game's Verify on it. */
async function recheck(file) {
  const saved = read(file), env = await Env.create(), inputs = loadTrack('desert4');
  const full = await env.evaluate(inputs, saved.recording, saved.frames + 1000);
  const at = await env.worker.verify({ ...inputs, carRecording: saved.recording, targetFrames: saved.frames });
  const early = await env.worker.verify({ ...inputs, carRecording: saved.recording, targetFrames: saved.frames - 1 });
  await env.close();
  return { saved, ok: full.finished && full.finishFrames === saved.frames && at && !early, finishFrames: full.finishFrames };
}

// ---- the README's tables for the other three tracks (no stitching: about 10 s each) --------
for (const [track, bestHuman, bestOf, planned] of [['winter2', '26.830', '26.778', '26.830'], ['summer1', '22.131', '21.438', '22.027'], ['summer4', '34.105', '33.505', '33.637']]) {
  const r = await runNode(SCRIPT, [track, 'joins=0', 'stitch=0']);
  const got = [r.out.match(/best human lap\s+(\S+) s/)?.[1], r.out.match(/theoretical best of sections\s+(\S+) s/)?.[1], r.out.match(/planned route\s+(\S+) s/)?.[1]];
  check(r.code === 0 && JSON.stringify(got) === JSON.stringify([bestHuman, bestOf, planned]),
    `${track} stitch=0: exit ${r.code}; best human / best of sections / planned route ${got.join(' / ')} s (README: ${bestHuman} / ${bestOf} / ${planned})`);
  if (track === 'winter2') check(!/stitching/.test(r.out) && !/Verify/.test(r.out), 'stitch=0 joins=0 prints the tables only: no stitch, no Verify');
}

// ---- the default run: must reproduce the headline lap exactly --------------------------------
let r = await runNode(SCRIPT, ['desert4', 'joins=0', 'name=g1-2-test-stitch']);
check(r.code === 0, `desert4, defaults (joins=0 to skip the survival test): exit code ${r.code} in ${r.seconds.toFixed(0)} s`);
check(/best human lap\s+21\.750 s/.test(r.out) && /theoretical best of sections\s+21\.680 s/.test(r.out) && /planned route\s+21\.734 s .*lap1@0 -> lap7@68/.test(r.out),
  'it prints best human 21.750, best of sections 21.680, planned route 21.734 as lap1 then lap7 from boundary 68 (the README table)');
check(/1 switches kept, 0 refused: lap1 -> lap7@68/.test(r.out) && /stitched lap 21\.730 s; best human 21\.750 s \(20 ms FASTER\)/.test(r.out) && /PASS Verify: the game finishes it on tick 21730/.test(r.out),
  'one switch kept, stitched lap 21.730 s, 20 ms faster, PASS Verify on tick 21730');
if (check(filesOf('g1-2-test-stitch').every(exists), 'it wrote runs/<name>_desert4.json and .recording.json')) {
  const mine = read(filesOf('g1-2-test-stitch')[1]), claimed = read('runs/g1-2-stitch_desert4.recording.json');
  check(mine.frames === claimed.frames && JSON.stringify(decodeRecording(mine.recording)) === JSON.stringify(decodeRecording(claimed.recording)),
    'the lap written now is key for key the lap in runs/g1-2-stitch_desert4.recording.json: the headline result reproduces (and the SimSession.load fix did not change it)');
}

// ---- a run that produces no lap must not exit 0 ---------------------------------------------------
// Switches accepted on a 250 ms look with the repair search switched off
// (good = 1e6): several are kept and the car then leaves the road.
r = await runNode(SCRIPT, ['desert4', 'joins=0', 'risk=0', 'switchPenalty=0', 'maxMismatch=100000', 'margin=-100000', 'acceptCost=100000', 'check=250', 'good=1000000', 'attempts=40', 'name=g1-2-test-nolap']);
check(/NO LAP: lost lap\d+'s path/.test(r.out), 'forced bad switches without repair: the script reports NO LAP');
check(r.code !== 0, `and exits non-zero (exit code ${r.code})`);
check(!filesOf('g1-2-test-nolap').some(exists), 'and writes nothing to runs/');

// ---- many kept and refused switches: is the lap written the lap driven? ------------------------------
// Every planned switch is tried and kept unless its car is lost. Refused
// switches make the script go back to the "stay" car's save point after the
// "switch" car was driven from the earlier one: the case in which
// SimSession.load() used to leave the wrong keys.
// (attempts=6 and good=25 keep the run to about 50 s: with attempts=40 and the
// default good it is the same test with 8 kept and 2 refused, but 75 to 110 s.)
r = await runNode(SCRIPT, ['desert4', 'joins=0', 'risk=0', 'switchPenalty=0', 'maxMismatch=100000', 'margin=-100000', 'acceptCost=100000', 'attempts=6', 'good=25', 'name=g1-2-test-many']);
const counts = r.out.match(/(\d+) switches kept, (\d+) refused/);
check(r.code === 0 && counts && Number(counts[1]) >= 2 && Number(counts[2]) >= 1, `accept-everything run: exit ${r.code}, ${counts?.[1]} switches kept and ${counts?.[2]} refused in ${r.seconds.toFixed(0)} s`);
const said = r.out.match(/PASS Verify: the game finishes it on tick (\d+)/);
if (check(said && filesOf('g1-2-test-many').every(exists), `it reports PASS Verify (tick ${said?.[1]}) and wrote the lap`)) {
  const again = await recheck(filesOf('g1-2-test-many')[1]);
  check(again.ok && again.saved.frames === Number(said[1]), `independently: that lap replays from the start line to tick ${again.finishFrames}, Verify accepts it and rejects one tick fewer`);
  note(`(a lap of ${again.saved.frames} ticks: slower than the human's 21750, as the README says of loose settings)`);
}

// ---- the survival test ---------------------------------------------------------------------------------
r = await runNode(SCRIPT, ['desert4', 'joins=2', 'stitch=0', 'finish=1', 'horizon=2000', 'seed=1']);
const tallies = ['raw', 'resync', 'repair'].map((mode) => r.out.match(new RegExp(`${mode}\\s+on path (\\d+)/(\\d+)`)));
check(r.code === 0 && tallies.every((m) => m && Number(m[1]) <= Number(m[2]) && Number(m[2]) <= 2), `joins=2 stitch=0: exit ${r.code}, a tally line for raw, resync and repair (${tallies.map((m) => m?.[0]).join('; ')}) in ${r.seconds.toFixed(0)} s`);
clean();
