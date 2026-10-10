// explore.mjs on the real simulator, winter4 (a track the generalist was not
// trained on). The script is run as it is used, as a child process, with
// hook.mjs loaded in front of it as an independent meter. At most two
// children at a time; the bare-simulator checks at the end run after them.
//
//   node ideas/g2-3-explore-and-adapt/tests/test_sim.mjs
//
// What is checked:
//   - the same seed twice gives the same run, attempt for attempt, to the tick
//   - a lap reported as finished is the simulator's actual history (hook), and
//     the saved file replays from the start line on the bare simulator to the
//     stated tick and passes the game's Verify
//   - the cost the script reports is the ticks really stepped
//   - the car-replacement path (rebuilding a cell by replaying its decisions),
//     which the README says has never run, forced by the hook
//   - plain mode is an honest baseline: every attempt from the line, no save
//     states, the same first attempt, the same budget
//   - the headline: explore finishes inside 10 laps of simulated time, plain
//     stops near 67%
// Everything written under runs/ and out/ is named g2-3-test-* and removed.
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Env, loadTrack } from '../../../sim/env.mjs';
import { decisionsToKeys, sameKeys, keysToRecording } from '../../shared/laps.mjs';
import { check, same, finish } from './check.mjs';

const HERE = new URL('./', import.meta.url);
const ROOT = fileURLToPath(new URL('../../../', HERE));
const TMP = new URL('./tmp/', HERE);
mkdirSync(TMP, { recursive: true });
const TRACK = 'winter4';
const written = [];   // every file a child may have written, for the clean-up

/** One run of explore.mjs under the hook. */
function run(name, mode, seed, extraEnv = {}) {
  const hookOut = fileURLToPath(new URL(`${name}.hook.json`, TMP));
  const logFile = new URL(`../out/${name}_${mode}_${TRACK}.json`, HERE);
  const lapName = mode === 'plain' ? `${name}-plain` : name;
  const lapFile = `${ROOT}runs/${lapName}_${TRACK}.json`, recFile = `${ROOT}runs/${lapName}_${TRACK}.recording.json`;
  written.push(hookOut, fileURLToPath(logFile), lapFile, recFile);
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--import', pathToFileURL(fileURLToPath(new URL('./hook.mjs', HERE))).href,
      'ideas/g2-3-explore-and-adapt/explore.mjs', TRACK, `mode=${mode}`, `seed=${seed}`, 'laps=10', 'seconds=100', `out=${name}`],
    { cwd: ROOT, env: { ...process.env, G23_HOOK_OUT: hookOut, ...extraEnv } });
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stdout += d; });
    child.on('close', (code) => {
      const read = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null);
      resolve({ name, mode, seed, code, stdout, seconds: (Date.now() - started) / 1000, log: read(logFile), hook: read(hookOut), lap: read(lapFile), rec: read(recFile) });
    });
  });
}
const describe = (r) => `${r.name}: ${r.log?.attempts} attempts, ${r.log?.lapsUsed} laps, ${r.log?.finished ? `finished ${r.log.finishFrames}` : `stopped at ${(100 * (r.log?.frontier ?? 0)).toFixed(1)}%`}, ${r.seconds.toFixed(0)} s wall`;
/** A log without the things that may differ between two identical runs. */
const essence = (log) => ({ ...log, wallSeconds: 0, files: [], log: log.log });

try {
  // --- the runs, two at a time ---------------------------------------------------
  const [e1, p1] = await Promise.all([run('g2-3-test-e1', 'explore', 1), run('g2-3-test-p1', 'plain', 1)]);
  console.log(`     ${describe(e1)}\n     ${describe(p1)}`);
  const [e1b, e1c] = await Promise.all([run('g2-3-test-e1b', 'explore', 1), run('g2-3-test-e1c', 'explore', 1, { G23_FRESH_AFTER: '3' })]);
  console.log(`     ${describe(e1b)}\n     ${describe(e1c)}`);
  const [e2, p2] = await Promise.all([run('g2-3-test-e2', 'explore', 2), run('g2-3-test-p2', 'plain', 2)]);
  console.log(`     ${describe(e2)}\n     ${describe(p2)}`);
  const all = [e1, p1, e1b, e1c, e2, p2];
  const ran = all.every((r) => r.log && r.hook);
  check(ran && all.every((r) => r.code === 0), 'all six runs of explore.mjs exited with code 0 and wrote their logs',
    all.filter((r) => r.code !== 0 || !r.log).map((r) => `${r.name}: code ${r.code}\n${r.stdout.slice(-600)}`).join('\n'));
  if (!ran) throw new Error('a run wrote no log; the remaining checks cannot be made');
  const human = e1.log.humanFrames;

  // --- determinism --------------------------------------------------------------------
  check(same(essence(e1.log), essence(e1b.log)), 'explore, seed 1, twice: the same run, attempt for attempt (kind, start, end, tick, cost)');
  check(e1.hook.finished && e1b.hook.finished && same(e1.hook.finished, e1b.hook.finished) && sameKeys(e1.lap.controlsPerTick, e1b.lap.controlsPerTick),
    `explore, seed 1, twice: the same lap to the tick (${e1.log.finishFrames})`);
  check(!same(e1.log.log.map((a) => a.reached), e2.log.log.map((a) => a.reached)), 'another seed gives another run');

  // --- a finished lap is a real lap ------------------------------------------------------
  const env = await Env.create();
  const inputs = loadTrack(TRACK);
  for (const r of [e1, e1c, e2]) {
    const F = r.log.finishFrames;
    check(r.log.finished && r.log.verified && r.lap && r.rec, `${r.name}: reports a finished, verified lap of ${F} ticks and saved it`);
    if (!r.lap) continue;
    // What the script wrote down against what the simulator was really given.
    const driven = decisionsToKeys(r.hook.finished.decisions);
    check(r.hook.finished.finishFrames === F && sameKeys(r.lap.controlsPerTick, driven.slice(0, F)),
      `${r.name}: the saved lap is, key for key, the simulator's actual history after all its rewinds (${r.hook.rewinds} rewinds, ${r.hook.finished.decisions.length} decisions)`);
    check(r.lap.finishFrames === F && r.lap.controlsPerTick.length === F && r.rec.frames === F && keysToRecording(r.lap.controlsPerTick) === r.rec.recording,
      `${r.name}: both saved files state ${F} ticks and hold the same lap`);
    const played = await env.evaluate(inputs, r.rec.recording, F + 2000);
    const at = await env.worker.verify({ ...inputs, carRecording: r.rec.recording, targetFrames: F });
    const before = await env.worker.verify({ ...inputs, carRecording: r.rec.recording, targetFrames: F - 1 });
    check(played.finished && played.finishFrames === F && at === true && !before,
      `${r.name}: the saved lap played from the start line on the bare simulator finishes on tick ${played.finishFrames}; Verify passes there and rejects ${F - 1}`);
  }
  // --- the author's own saved laps (the b runs behind the README's table) ---------------
  // Each log names a finish tick; its recording under runs/ must finish on
  // that tick from the start line and pass Verify there.
  const outDir = new URL('../out/', HERE);
  for (const track of ['winter4', 'desert3', 'summer3']) {
    const trackInputs = loadTrack(track);
    const bad = [];
    let count = 0;
    for (const file of readdirSync(outDir).filter((f) => new RegExp(`^g2-3-b\\d+_explore_${track}\\.json$`).test(f))) {
      const log = JSON.parse(readFileSync(new URL(file, outDir), 'utf8'));
      const recFile = `${ROOT}runs/${file.replace(`_explore_${track}.json`, '')}_${track}.recording.json`;
      count++;
      if (!log.finished || !existsSync(recFile)) { bad.push(`${file}: no lap`); continue; }
      const rec = JSON.parse(readFileSync(recFile, 'utf8'));
      const played = await env.evaluate(trackInputs, rec.recording, log.finishFrames + 2000);
      const ok = await env.worker.verify({ ...trackInputs, carRecording: rec.recording, targetFrames: log.finishFrames });
      if (rec.frames !== log.finishFrames || played.finishFrames !== log.finishFrames || ok !== true) bad.push(`${file}: log ${log.finishFrames}, file ${rec.frames}, played ${played.finishFrames}, verify ${ok}`);
    }
    check(count > 0 && bad.length === 0, `README table, ${track}: all ${count} saved laps of the explore runs finish on the tick their log states and pass Verify`, bad.join('; '));
  }
  await env.close();

  // --- the budget ---------------------------------------------------------------------------
  // The script charges 50 ticks per block decision. The hook counted the
  // decisions and the lap-clock ticks they really advanced (a block that ends
  // an attempt can be shorter than 50).
  for (const r of all) {
    const charged = r.log.lapsUsed * human, blocks = 50 * r.hook.blocks, real = r.hook.ticks;
    check(Math.abs(charged - blocks) <= 0.0005 * human + 1 && real <= blocks && blocks - real < 50 * r.hook.episodes,
      `${r.name}: reported cost ${r.log.lapsUsed} laps = ${r.hook.blocks} decisions x 50 ticks; really stepped ${real} ticks = ${(real / human).toFixed(3)} laps (short by under one decision per attempt)`);
    check(r.hook.episodes === r.log.attempts && r.log.log.length === r.log.attempts, `${r.name}: ${r.log.attempts} attempts logged, ${r.hook.episodes} episodes ended in the simulator`);
  }

  // --- the car-replacement path ----------------------------------------------------------------
  // After attempt 3 the hook made the car look used up. The next restart must
  // build a new car and get its cell back by replaying the cell's decisions.
  // The simulator is deterministic, so the search must go exactly as before;
  // only the cost is higher, by the replays.
  check(e1c.hook.forcedFresh === 1 && e1c.hook.cars === 2, `fresh car: a second car was built after attempt 3 (${e1c.hook.cars} cars)`);
  const outcome = (log) => log.log.map((a) => [a.kind, a.level, a.from, a.reached, a.reason, a.endTick, a.moved]);
  check(same(outcome(e1c.log), outcome(e1.log)) && e1c.log.finishFrames === e1.log.finishFrames && sameKeys(e1c.lap?.controlsPerTick ?? [], e1.lap.controlsPerTick),
    'fresh car: every attempt starts and ends as it did on one car, and the lap found is the same');
  check(e1c.log.lapsUsed > e1.log.lapsUsed && e1c.hook.blocks > e1.hook.blocks, `fresh car: the replays are charged to the budget (${e1c.log.lapsUsed} laps against ${e1.log.lapsUsed})`);

  // --- plain mode is an honest baseline -----------------------------------------------------------
  for (const [p, e] of [[p1, e1], [p2, e2]]) {
    check(p.hook.marks === 0 && p.hook.rewinds === 0 && p.hook.resets === p.log.attempts && p.log.log.every((a) => a.from === 0),
      `${p.name}: every attempt starts on the line, no save state is taken or restored`);
    const a = p.log.log[0], b = e.log.log[0];
    check(a.kind === 'greedy' && b.kind === 'greedy' && a.endTick === b.endTick && a.reached === b.reached && a.laps === b.laps,
      `seed ${p.seed}: attempt 1 is the same top-choice attempt in both modes (ends at tick ${a.endTick}, ${(100 * a.reached / p.log.lineLength).toFixed(1)}%)`);
    check(p.log.log.slice(1).every((x) => x.kind === 'sample') && p.log.seed === e.log.seed && p.log.actor === e.log.actor && p.log.humanFrames === e.log.humanFrames,
      `seed ${p.seed}: plain samples the same policy with the same seed, and its budget is in the same unit`);
    // Same stopping rule: the first finish, or the budget; the wall-clock
    // limit must not be what ended either run.
    check(!p.log.finished && p.log.lapsUsed >= 10 && p.log.wallSeconds < 100 && e.log.wallSeconds < 100,
      `seed ${p.seed}: plain ran its whole budget (${p.log.lapsUsed} laps), neither run was ended by the wall-clock limit`);
  }

  // --- the headline --------------------------------------------------------------------------------
  check(e1.log.finished && e2.log.finished && e1.log.lapsUsed <= 10 && e2.log.lapsUsed <= 10,
    `README: explore finishes winter4 inside 10 laps of simulated time (seed 1 after ${e1.log.lapsUsed}, seed 2 after ${e2.log.lapsUsed})`);
  check([p1, p2].every((p) => !p.log.finished && p.log.frontier > 0.66 && p.log.frontier < 0.68),
    `README: plain attempts do not finish and stop near 67% (seed 1 at ${(100 * p1.log.frontier).toFixed(1)}%, seed 2 at ${(100 * p2.log.frontier).toFixed(1)}%, ${p1.log.attempts} and ${p2.log.attempts} attempts)`);
  check(e1.log.attempts === 11 && e1.log.lapsUsed === 2.848 && e1.log.finishFrames === 19920, `README smoke test: seed 1 finishes on attempt 11 after 2.85 laps in 19.920 s (got attempt ${e1.log.attempts}, ${e1.log.lapsUsed}, ${e1.log.finishFrames})`);
  check(e2.log.attempts === 62 && e2.log.lapsUsed === 9.368 && e2.log.finishFrames === 25539, `README: seed 2 is the slowest search, 62 attempts, 9.4 laps, 25.539 s (got ${e2.log.attempts}, ${e2.log.lapsUsed}, ${e2.log.finishFrames})`);
  check(e1.log.cells >= 20 && e2.log.cells >= e1.log.cells, `the archive holds more than one line of cells (${e1.log.cells} and ${e2.log.cells} cells)`);
} finally {
  for (const file of written) rmSync(file, { force: true });
  rmSync(TMP, { recursive: true, force: true });
}
finish();
