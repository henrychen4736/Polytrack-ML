// beam.mjs end to end, on short stretches late in the desert4 lap (so that
// the rollouts to the finish are short): determinism, the reported lap
// replayed independently, the elite guarantee, and the forced car rebuild.
//
// Every run is the real command with a run name of its own
// (out=g1-4-test-<x>); the two files it writes under runs/ are checked and
// then removed. One beam run at a time (2 simulator processes each); the
// replay checks afterwards use one simulator.
//
// "Replayed independently" means: the recording string in the saved file is
// decoded to keys (ideas/shared/laps.mjs), driven on the bare simulator
// (ideas/shared/sim_session.mjs: no training environment, no reference lap,
// none of this idea's code) and must cross the line on exactly the tick the
// search printed; and the game's own Verify must accept that tick and reject
// one tick fewer (ideas/shared/verify.mjs).
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SimSession } from '../../shared/sim_session.mjs';
import { recordingToKeys, keysToDecisions, humanLaps } from '../../shared/laps.mjs';
import { verifyAndSave } from '../../shared/verify.mjs';
import { check, finish } from './harness.mjs';

const PROJECT = fileURLToPath(new URL('../../../', import.meta.url));
const BEAM = join(PROJECT, 'ideas/g1-4-beam-search/beam.mjs');
const TRACK = 'desert4';
const POLICY_LAP = 22061;                          // ppo_sr1_desert4.u800's own lap (README, CONTRACT.md)
const SEARCHED = 'runs/rollout_desert4.json';      // the 21.907 s lap, made of block decisions
const SEARCHED_LAP = 21907;
const files = (name) => [`runs/${name}_${TRACK}.json`, `runs/${name}_${TRACK}.recording.json`];
const remove = (name) => { for (const f of files(name)) rmSync(join(PROJECT, f), { force: true }); };

/** Run the search; returns what it printed and what it claims. */
function beam(name, ...args) {
  remove(name);
  const r = spawnSync(process.execPath, [BEAM, TRACK, ...args, `out=${name}`], { cwd: PROJECT, encoding: 'utf8' });
  const out = (r.stdout + r.stderr).replaceAll('\r\n', '\n');
  const summary = /^([\d.]+) s -> ([\d.]+) s \((-?\d+) ms faster; policy's own lap ([\d.]+) s\)$/m.exec(out);
  const verified = /^verified: ([\d.]+) s, (\S+), (\S+)$/m.exec(out);
  const ms = (s) => Math.round(Number(s) * 1000);
  return {
    name, code: r.status, out,
    start: summary ? ms(summary[1]) : null, end: summary ? ms(summary[2]) : null, gain: summary ? Number(summary[3]) : null, policy: summary ? ms(summary[4]) : null,
    verified: verified ? ms(verified[1]) : null,
    saved: existsSync(join(PROJECT, files(name)[1])) ? JSON.parse(readFileSync(join(PROJECT, files(name)[1]), 'utf8')) : null,
    keysFile: existsSync(join(PROJECT, files(name)[0])) ? JSON.parse(readFileSync(join(PROJECT, files(name)[0]), 'utf8')) : null,
  };
}
/** What must not differ between two runs of the same command: every line, less the wall-clock numbers. */
const fingerprint = (out, { ticks = true } = {}) => out.split('\n')
  .filter((l) => l.trim() && !/wasm streaming|falling back|cars used up/.test(l))
  .map((l) => l.replace(/^\s+\d+ s {2}/, '').replaceAll(/g1-4-test-[a-z]/g, 'g1-4-test').replace(/ in \d+ s \(\d+ k ticks per second\)/, ''))
  .map((l) => (ticks ? l : l.replace(/, [\d.]+ M ticks/, '')))
  .join('\n');

// ---- arguments that must stop before anything starts --------------------------------------
{
  const noTrack = spawnSync(process.execPath, [BEAM], { cwd: PROJECT, encoding: 'utf8' });
  check('no track given: usage and exit code 1', noTrack.status === 1 && /Usage/.test(noTrack.stderr));
  const badRank = spawnSync(process.execPath, [BEAM, TRACK, 'rank=speed'], { cwd: PROJECT, encoding: 'utf8' });
  check('an unknown rank= is refused (exit code 1) before any simulator starts', badRank.status === 1 && /rank must be one of/.test(badRank.stderr));
}

// ---- the runs ----------------------------------------------------------------------------------
const STRETCH = ['start=300', 'depth=320', 'beam=6', 'rollEvery=10'];
const a = beam('g1-4-test-a', ...STRETCH);
const b = beam('g1-4-test-b', ...STRETCH);
// carBudget: 90000 ticks is passed once, by the process that also drove the
// policy's lap. A smaller budget is passed again straight after every
// rebuild (a rebuild itself costs about 70000 ticks at this depth: a new
// ladder and three nodes of 300 decisions) and the run takes minutes:
// 75000 gave 19 rebuilds in 150 s. test_child.mjs covers repeated rebuilds.
const c = beam('g1-4-test-c', ...STRETCH, 'carBudget=90000');
const d = beam('g1-4-test-d', 'beam=1', 'start=420', 'depth=424', 'rollEvery=2');
const e = beam('g1-4-test-e', `from=${SEARCHED}`, 'start=430', 'beam=4', 'rollEvery=0');
const f = beam('g1-4-test-f', `from=${SEARCHED}`, 'beam=1', 'start=425', 'depth=428');
const g = beam('g1-4-test-g', 'from=human:0', 'beam=1', 'start=430', 'depth=432');
const runs = [a, b, c, d, e, f, g];

for (const r of runs) check(`${r.name}: ends with exit code 0, a summary line and a "verified" line`, r.code === 0 && r.end != null && r.verified != null, r.out);
check('the policy\'s own lap is 22.061 s in every run', runs.every((r) => r.policy === POLICY_LAP), runs.map((r) => r.policy).join());

// ---- determinism ---------------------------------------------------------------------------------
check('determinism: the stretch run found a faster lap (so the comparison below is not of two untouched laps)', a.end < a.start, `${a.start} -> ${a.end}`);
check('determinism: the same command twice gives the same lap to the tick', a.end != null && a.end === b.end, `${a.end} and ${b.end}`);
check('determinism: ... the same recording, character for character', a.saved != null && a.saved.recording === b.saved?.recording && a.saved.frames === b.saved?.frames);
check('determinism: ... and the same printed search (candidates, rollouts, beam positions, improvements, ticks), wall-clock numbers aside', fingerprint(a.out) === fingerprint(b.out), `${fingerprint(a.out)}\n--- against ---\n${fingerprint(b.out)}`);

// ---- the forced car rebuild ------------------------------------------------------------------------
{
  const rebuilt = /^cars used up and rebuilt: (\d+), (\d+) \(per process\)$/m.exec(c.out);
  check('rebuild: with carBudget=90000 a process rebuilt its nodes on a new car in the middle of the search', rebuilt != null && Number(rebuilt[1]) + Number(rebuilt[2]) > 0, rebuilt?.[0] ?? c.out);
  check('rebuild: a run without carBudget reports no rebuild', !/cars used up/.test(a.out));
  check('rebuild: the lap is the same to the tick, and the same recording, as the run that never rebuilt', c.end === a.end && c.saved?.recording === a.saved?.recording, `${c.end} against ${a.end}`);
  check('rebuild: ... and the search printed the same (candidates, improvements, beam positions; tick totals aside)', fingerprint(c.out, { ticks: false }) === fingerprint(a.out, { ticks: false }), `${fingerprint(c.out, { ticks: false })}\n--- against ---\n${fingerprint(a.out, { ticks: false })}`);
}

// ---- the elite guarantee ------------------------------------------------------------------------------
for (const r of runs) check(`elite: ${r.name} is not slower than the lap it started from (${r.start} -> ${r.end})`, r.end != null && r.end <= r.start && r.gain === r.start - r.end);
check('elite: started from the policy -> the starting lap is the policy\'s own', [a, b, c, d].every((r) => r.start === POLICY_LAP));
// A beam of 1 holds the elite and nothing else, and its rollouts have no one
// to drive, so the result must be the starting lap itself: this fails if the
// incumbent, replayed decision by decision inside the beam, drifts at all.
check('elite: with beam=1 from the policy\'s lap the result is that lap exactly (22.061 s)', d.end === POLICY_LAP && d.start === POLICY_LAP, `${d.start} -> ${d.end}`);
check('elite, from a lap file: the file\'s lap (21.907 s) is taken as the starting lap', /starting from runs\/rollout_desert4\.json: 21\.907 s/.test(e.out) && e.start === SEARCHED_LAP && f.start === SEARCHED_LAP, e.out);
check('elite, from a lap file: beam=1 gives the file\'s lap back exactly (21.907 s)', f.end === SEARCHED_LAP, `${f.end}`);
check('elite, from a lap file: a beam of 4 run across the finish line (no depth) is not slower than 21.907 s, and far from the policy\'s 22.061 s', e.end != null && e.end <= SEARCHED_LAP, `${e.end}`);
check('from a lap file: the run went to the line (it did not stop at a depth)', !/stopped at decision/.test(e.out), e.out);
{
  const fileKeys = JSON.parse(readFileSync(join(PROJECT, SEARCHED), 'utf8')).controlsPerTick;
  const mine = f.keysFile?.controlsPerTick ?? [];
  const sameKeys = mine.length === fileKeys.length && mine.every((k, t) => ['up', 'right', 'down', 'left'].every((n) => !!k[n] === !!fileKeys[t][n]));
  check('elite, from a lap file with beam=1: the saved keys are the file\'s keys on every one of the 21907 ticks', sameKeys, `${mine.length} against ${fileKeys.length} ticks`);
}
// A human lap is not made of block decisions: it must be refused, not silently approximated.
check('from=human:0 (a lap that is not block decisions): refused with the reason, and the policy\'s lap is used instead',
  /from=human:0: not usable \(\d+ ticks do not fit block decisions/.test(g.out) && g.start === POLICY_LAP && g.end === POLICY_LAP, g.out);
check('... the human lap really is faster than what the run reported (so "refused" is the honest outcome)', humanLaps(TRACK)[0].frames < g.end);

// ---- the reported lap, replayed independently ------------------------------------------------------------
{
  const sim = await SimSession.create(TRACK);
  // The author's saved smoke-test lap too, if it is still there (README: 21.997 s).
  const smoke = existsSync(join(PROJECT, 'runs/g1-4-smoke_desert4.recording.json')) ? { name: 'g1-4-smoke (the README\'s 21.997 s lap, as saved by its author)', end: 21997, verified: 21997, saved: JSON.parse(readFileSync(join(PROJECT, 'runs/g1-4-smoke_desert4.recording.json'), 'utf8')), keysFile: null } : null;
  for (const r of [a, c, d, e, f, g, ...(smoke ? [smoke] : [])]) {
    if (!r.saved) { check(`${r.name}: a lap file was saved`, false); continue; }
    const keys = recordingToKeys(r.saved.recording, r.saved.frames);
    check(`${r.name}: printed time, "verified" time and saved file agree (${r.end} ticks)`, r.saved.frames === r.end && r.verified === r.end && r.saved.track === TRACK && (!r.keysFile || (r.keysFile.finishFrames === r.end && r.keysFile.controlsPerTick.length === r.end)), `file ${r.saved.frames}, printed ${r.end}, verified ${r.verified}`);
    await sim.restart();
    const played = await sim.drive(keys);
    check(`${r.name}: the saved recording, driven from the start line on the bare simulator, crosses the line on tick ${r.end}`, played.finished && played.finishFrames === r.end, `${played.finished} ${played.finishFrames}`);
    await sim.restart();
    const short = await sim.drive(keys.slice(0, r.end - 1));
    check(`${r.name}: ... and not one tick sooner`, !short.finished);
    check(`${r.name}: the lap is made of block decisions (one empty tick, then 50 ms blocks; no tick out of place)`, keysToDecisions(keys).wrongTicks === 0);
  }
  await sim.close();
  for (const r of [a, e]) {
    const v = await verifyAndSave({ track: TRACK, keys: recordingToKeys(r.saved.recording, r.saved.frames), save: false });
    check(`${r.name}: the game's Verify accepts tick ${r.end} and rejects ${r.end - 1}`, v.ok && v.finishFrames === r.end && v.verified && v.offByOneRejected, JSON.stringify({ ...v, recording: undefined }));
  }
}
for (const r of runs) remove(r.name);
check('the test laps were removed from runs/ again', runs.every((r) => files(r.name).every((file) => !existsSync(join(PROJECT, file)))));
finish();
