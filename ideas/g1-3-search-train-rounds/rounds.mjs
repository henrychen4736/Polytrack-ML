// Unattended rounds of "search, train the specialist toward the searched lap,
// search again" on one track.
//
//   node ideas/g1-3-search-train-rounds/rounds.mjs <track> [key=value ...]
//
//   first launch on a track (round 1 needs a checkpoint and a searched lap):
//     node ideas/g1-3-search-train-rounds/rounds.mjs desert4 rounds=3 \
//       base=rl/checkpoints/ppo_sr1_desert4.u800.pt \
//       lap=runs/rollout_desert4.recording.json,runs/rollout_r1_desert4.recording.json
//   every later launch (after a shutdown, or to go further):
//     node ideas/g1-3-search-train-rounds/rounds.mjs desert4 rounds=3
//   see what it would do, without running or writing anything:
//     node ideas/g1-3-search-train-rounds/rounds.mjs desert4 rounds=3 dry=1
//
// One round is what scripts/search_round.sh does, in six steps:
//   1. examples  the fastest verified lap so far becomes imitation examples
//   2. practice  rl/train_ppo.py, 2.5 million decisions, imitation weight 0.05
//   3. test      the last kept copies drive ten sampled laps and one with top choices
//   4. pick      the copy the search will use (pickCopy in lib.mjs)
//   5. search    scripts/search_rollout.mjs from the picked copy
//   6. conclude  verify, compare with the best lap so far, decide whether to go on
// The decisions (which copy, how much practice is left, has it stopped paying)
// are plain functions in lib.mjs; this file is the part that reads files,
// starts programs and survives being stopped. All settings and their defaults
// are DEFAULTS in lib.mjs.
//
// RESTARTING. The machine is shut down in the middle of runs, so every step
// asks the files what has already been done, and does only the rest:
//   examples  done when the .npz exists (written under another name, then renamed)
//   practice  the step counter inside the checkpoint says how many updates
//             are done; the rest is run as a new "leg" (trainPlan in lib.mjs)
//   test      an attempt is done when its output has a result line; only the
//             others are run
//   search    done when its lap file exists and passes Verify; otherwise it
//             is run again from the start (see SEARCHES)
// The state file (work/<track>/state.json) holds only what files cannot say:
// the best lap, the checkpoint the next round starts from, each round's
// starting step count and picked copy, and the finished rounds' results.
//
// SEARCHES. scripts/search_rollout.mjs writes its lap only when it ends, so a
// shutdown nine minutes into a ten-minute search loses all of it (that is how
// winter2's round-1 result was lost). This driver may not edit that script,
// so instead of one search of 600 s it runs `searches` (3) of
// `searchSeconds` (200) each, with different random seeds, and keeps the
// fastest: a shutdown then costs at most the search in progress. The round-0
// logs suggest little is lost by the shorter budget: those searches made
// three passes in 600 s, and the first pass (186 to 240 s) found 154 of 154,
// 106 of 107, 364 of 368 and 141 of 141 ms of the gain. Three separate
// searches do not build on each other, though, and "3 x 200 s is as good as
// 1 x 600 s" has NOT been measured head to head. searches=1 searchSeconds=600
// is the old behaviour. A side effect: every round ends with up to three
// different verified laps, which extraLaps can use as imitation examples.
//
// RENAMING. train_ppo.py names its kept copies after the update number of the
// PROCESS (.u200.pt), which after a restart is no longer the update number of
// the round. Before each leg, and when practice is complete, the driver reads
// the step counter of each such file and renames it to .c<updates of this
// round>.pt. It also keeps the checkpoint as it stood at an interruption, if
// that is late enough in the round to be tested.
//
// TIME. A background job here is stopped after two hours. A launch stops
// itself after `minutes` (105): a leg of practice is sized to end before
// then (and is stopped if it has not), and a test or search that would not
// fit is left for the next launch. So "rounds=5" is safe to launch: it does
// what fits, exits with code 3 ("launch me again"), and the next launch
// carries on. Exit codes: 0 finished (the round target is reached or rounds
// stopped paying), 3 out of time, 2 another launch holds the track, 1 error.
//
// Local use only: nothing here contacts Kodub's servers.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, copyFileSync, readdirSync, rmSync, createWriteStream } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { verifyAndSave } from '../shared/verify.mjs';
import { recordingToKeys } from '../shared/laps.mjs';
import {
  IDEA_DIR, parseArgs, paths, parseAttempt, parseSearchLog, summariseCopy, pickCopy, copiesToTest,
  trainPlan, concludeRound, chooseExamples, resultsText, seconds,
} from './lib.mjs';

const PROJECT = fileURLToPath(new URL('../../', import.meta.url));
const { track, opt } = parseArgs(process.argv.slice(2));
if (!track) { console.error('Usage: node ideas/g1-3-search-train-rounds/rounds.mjs <track> [key=value ...]   (settings: DEFAULTS in lib.mjs)'); process.exit(1); }
const dry = opt.dry === 1;
if (!/^[A-Za-z0-9]*$/.test(opt.tag)) { console.error('tag= may hold letters and digits only (it becomes part of file names)'); process.exit(1); }
if (opt.root && !dry) { console.error('root= is for tests and needs dry=1: the tools a round runs always work in the project folder'); process.exit(1); }
const ROOT = opt.root ? resolve(opt.root) : PROJECT;
/** A data path from the project root -> where to look for it. */
const at = (file) => join(ROOT, file);
// The project's Python (it has CUDA PyTorch). Commands are printed with the
// short name and run with the full path.
const PY = '.venv/Scripts/python';
const pyExe = existsSync(join(PROJECT, '.venv/Scripts/python.exe')) ? join(PROJECT, '.venv/Scripts/python.exe') : PY;
const startTime = Date.now();
const deadline = startTime + opt.minutes * 60_000;
// A dry run plans as if the whole budget were ahead of it.
const minutesLeft = () => (dry ? opt.minutes : (deadline - Date.now()) / 60_000);
const say = (text) => console.log(text);
const show = (cmd) => say(`  $ ${cmd.join(' ')}`);

// ---- running programs ---------------------------------------------------------------
let currentChild = null;

/** Stop a program we started, with everything it started (the trainer's
 *  eight simulator processes would otherwise live on). */
function killTree(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F']);
  else child.kill();
}

/**
 * Run one command from the project root and wait for it.
 *   log     file for its output (stdout and stderr), from the project root
 *   append  add to the log instead of replacing it
 *   killAt  stop it at this time (ms since 1970)
 *   onStart called with the process id
 * Returns { code, out, timedOut }; `out` is the output when there is no log.
 */
function run(cmd, { log = null, append = false, killAt = null, onStart = null } = {}) {
  return new Promise((done, fail) => {
    const exe = cmd[0] === PY ? pyExe : cmd[0] === 'node' ? process.execPath : cmd[0];
    const child = spawn(exe, cmd.slice(1).map(String), { cwd: PROJECT, stdio: ['ignore', 'pipe', 'pipe'] });
    currentChild = child;
    onStart?.(child.pid);
    let out = '', timedOut = false;
    let stream = null;
    if (log) { mkdirSync(dirname(at(log)), { recursive: true }); stream = createWriteStream(at(log), { flags: append ? 'a' : 'w' }); }
    const take = (chunk) => { if (stream) stream.write(chunk); else out += chunk; };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    const timer = killAt == null ? null : setTimeout(() => { timedOut = true; killTree(child); }, Math.max(0, killAt - Date.now()));
    child.on('error', fail);
    child.on('close', (code) => {
      clearTimeout(timer);
      currentChild = null;
      const finish = () => done({ code, out, timedOut });
      if (stream) stream.end(finish); else finish();
    });
  });
}

/** Step counters of checkpoints (ckpt_steps.py; CPU, read-only, a few seconds). */
function ckptSteps(files) {
  if (!files.length) return {};
  const r = spawnSync(pyExe, [join(PROJECT, IDEA_DIR, 'ckpt_steps.py'), ...files.map(at)], { cwd: PROJECT, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`could not read the step counter of ${files.join(', ')}:\n${r.stderr}`);
  const byPath = JSON.parse(r.stdout.trim().split('\n').at(-1));
  return Object.fromEntries(files.map((f) => [f, byPath[at(f)]]));
}

/**
 * Does this lap file hold a lap the game accepts? Returns its tick count, or
 * null. The file's own claim is not trusted: the keys are played from the
 * start line and the game's Verify must pass on exactly the claimed tick and
 * fail one tick earlier (ideas/shared/verify.mjs). One simulator, about 2 s;
 * this runs in a dry run too, because the best-lap decision depends on it.
 */
async function verifyLap(file) {
  if (!existsSync(at(file))) return null;
  let lap;
  try { lap = JSON.parse(readFileSync(at(file), 'utf8')); } catch { return null; } // cut off while being written
  if (!lap.recording || !lap.frames) return null;
  const r = await verifyAndSave({ track, keys: recordingToKeys(lap.recording, lap.frames), save: false });
  return r.ok && r.finishFrames === lap.frames ? lap.frames : null;
}

// ---- state --------------------------------------------------------------------------
const statePaths = paths(track, 0, opt.tag);
let state = existsSync(at(statePaths.state)) ? JSON.parse(readFileSync(at(statePaths.state), 'utf8')) : null;

/** Write a file whole or not at all (a shutdown mid-write must not leave half a state file). */
function writeWhole(file, text) {
  if (dry) return;
  mkdirSync(dirname(at(file)), { recursive: true });
  writeFileSync(at(file) + '.tmp', text);
  renameSync(at(file) + '.tmp', at(file));
}
const saveState = () => { writeWhole(statePaths.state, JSON.stringify(state, null, 2)); writeWhole(statePaths.results, resultsText(state)); };

/** First launch on a track: verify the laps given and start from the fastest. */
async function createState() {
  if (!opt.base || !opt.lap) throw new Error(`no state for ${track} yet (${statePaths.state}): the first launch needs base=<checkpoint> and lap=<searched lap>[,<another>...]`);
  if (!existsSync(at(opt.base))) throw new Error(`base checkpoint not found: ${opt.base}`);
  const laps = [];
  for (const file of opt.lap.split(',')) {
    const frames = await verifyLap(file);
    say(`  ${file}: ${frames ? `${seconds(frames)} s, verified` : 'does NOT verify (or is missing); left out'}`);
    if (frames) laps.push({ file, frames, round: 0 });
  }
  if (!laps.length) throw new Error('none of the laps given verifies, so there is nothing to train towards');
  const best = laps.reduce((a, b) => (b.frames < a.frames ? b : a));
  say(`starting ${track}: best lap ${seconds(best.frames)} s (${best.file}), checkpoint ${opt.base}`);
  return { track, best, laps, base: opt.base, strikes: 0, stopped: null, rounds: [] };
}

// ---- one launch at a time per track -----------------------------------------------------
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

/** Refuse to run next to another launch on the same track, or next to a
 *  trainer an earlier launch left behind (two trainers would replace the same
 *  checkpoint in turn). A lock written before the machine last booted is
 *  ignored: its process ids mean nothing any more. */
function takeLock() {
  if (dry) return;
  const file = at(statePaths.lock);
  if (existsSync(file)) {
    const lock = JSON.parse(readFileSync(file, 'utf8'));
    const bootTime = Date.now() - os.uptime() * 1000;
    const holder = [lock.pid, lock.child].find((pid) => pid && alive(pid));
    if (lock.time > bootTime && holder) {
      console.error(`${track}: process ${holder} from the launch of ${new Date(lock.time).toISOString()} is still running ` +
        `(${holder === lock.pid ? 'the driver' : 'a program it started'}). Wait for it or stop it, then launch again.`);
      process.exit(2);
    }
  }
  writeLock(null);
}
const writeLock = (child) => { if (!dry) writeWhole(statePaths.lock, JSON.stringify({ pid: process.pid, child, time: startTime })); };
const dropLock = () => { if (!dry) rmSync(at(statePaths.lock), { force: true }); };

// ---- the steps ------------------------------------------------------------------------
// Each returns 'done', 'time' (not enough of the launch left: stop, carry on
// next launch), 'stop' (the round cannot go on), or in a dry run 'pending'
// (the step would run a program now, and everything after depends on what
// that program produces).

/** 1. Imitation examples from the fastest verified lap (and extraLaps others). */
async function stepExamples(round) {
  const p = paths(track, round.n, opt.tag);
  if (existsSync(at(p.examples))) { say(`1 examples: done (${p.examples})`); return 'done'; }
  say(`1 examples: train towards ${round.exampleLaps.map((f) => f).join(', ')}`);
  const tmp = p.examples.replace(/\.npz$/, '.tmp.npz');
  const cmd = [PY, `${IDEA_DIR}/laps_bc.py`, track, tmp, ...round.exampleLaps];
  show(cmd);
  if (dry) return 'pending';
  const r = await run(cmd);
  if (r.code !== 0) throw new Error(`laps_bc.py failed:\n${r.out}`);
  renameSync(at(tmp), at(p.examples));
  return 'done';
}

/** The kept copies of a round that exist: update count -> file. */
function existingCopies(round) {
  const p = paths(track, round.n, opt.tag);
  const dir = at('rl/checkpoints');
  const copies = new Map(round.planned ?? []); // dry run: copies it would have made by renaming
  const pattern = new RegExp(`^${p.stem}\\.c(\\d+)\\.pt$`);
  for (const name of existsSync(dir) ? readdirSync(dir) : []) {
    const m = pattern.exec(name);
    if (m) copies.set(Number(m[1]), `rl/checkpoints/${name}`);
  }
  return copies;
}

/** 2. Practice, in as many legs as interruptions make necessary. */
async function stepTrain(round) {
  const p = paths(track, round.n, opt.tag);
  const batch = opt.envs * opt.rollout;
  let notYetCopied = false;
  if (!round.train) {
    const startSteps = ckptSteps([round.base])[round.base];
    const updates = Math.max(1, Math.floor(opt.steps / batch));
    say(`2 practice: starts as a copy of ${round.base} (${startSteps} steps); ${updates} updates of ${batch} decisions`);
    show(['cp', round.base, p.checkpoint]);
    if (dry) notYetCopied = true;
    else {
      // Copy first, record second: if the machine stops in between, the next
      // launch copies again, which is harmless because practice has not begun.
      copyFileSync(at(round.base), at(p.checkpoint) + '.tmp');
      renameSync(at(p.checkpoint) + '.tmp', at(p.checkpoint));
    }
    round.train = { startSteps, updates, batch };
    saveState();
  } else if (!existsSync(at(p.checkpoint))) {
    throw new Error(`round ${round.n} had started practising but ${p.checkpoint} is gone`);
  }
  const { startSteps, updates } = round.train;
  for (;;) {
    // RENAMING (see the top): the trainer's .u<k>.pt files of the last leg.
    const dir = at('rl/checkpoints');
    const trainerCopy = new RegExp(`^${p.stem}\\.u\\d+\\.pt$`);
    const kept = (existsSync(dir) ? readdirSync(dir) : []).filter((name) => trainerCopy.test(name)).map((name) => `rl/checkpoints/${name}`);
    const steps = notYetCopied ? {} : ckptSteps([p.checkpoint, ...kept]);
    for (const file of kept) {
      const k = Math.round((steps[file] - startSteps) / round.train.batch);
      say(`  kept copy ${file} is the round's update ${k}`);
      show(['mv', file, p.copy(k)]);
      if (dry) (round.planned ??= []).push([k, file]);
      else renameSync(at(file), at(p.copy(k)));
    }
    const plan = trainPlan({
      startSteps, steps: notYetCopied ? startSteps : steps[p.checkpoint], updates, batch: round.train.batch,
      lr: opt.lr, warmup: opt.warmup, minutesLeft: minutesLeft() - 3, updatesPerMinute: opt.updatesPerMinute,
    });
    const copies = existingCopies(round);
    if (plan.done) {
      if (!copies.has(updates)) {
        show(['cp', p.checkpoint, p.copy(updates)]);
        if (dry) (round.planned ??= []).push([updates, p.checkpoint]);
        else copyFileSync(at(p.checkpoint), at(p.copy(updates)));
      }
      say(`2 practice: done (${updates} updates)`);
      return 'done';
    }
    say(`2 practice: ${plan.doneUpdates} of ${updates} updates done, ${plan.remaining} left` +
      (plan.doneUpdates ? ' (interrupted; continuing, not starting again)' : ''));
    if (plan.leg < 10) { say('  not enough of this launch left for a useful leg of practice'); return 'time'; }
    // The checkpoint as the interruption left it is itself a copy from that
    // point of the round; keep it if it is late enough to be tested.
    if (plan.doneUpdates >= opt.testFromShare * updates && !copies.has(plan.doneUpdates)) {
      show(['cp', p.checkpoint, p.copy(plan.doneUpdates)]);
      if (!dry) copyFileSync(at(p.checkpoint), at(p.copy(plan.doneUpdates)));
    }
    // The options of scripts/train_block_specialist_from.sh as search_round.sh
    // calls it, with the four that make a leg continue the round (trainPlan).
    // train_ppo.py is called directly because that script copies the base
    // over the checkpoint every time it starts, which would throw away the
    // practice done before an interruption, and because it fixes the
    // checkpoint's name to ppo_*, which this idea may not write.
    const cmd = [PY, '-u', 'rl/train_ppo.py', '--track', track, '--envs', opt.envs, '--rollout', opt.rollout, '--block', 5, '--device', 'cuda',
      '--no-lap-fraction', '--resume', '--checkpoint', p.checkpoint,
      '--random-start', 0.5, '--failure-start', 0.3, '--own-start', 0.5, '--gamma', 0.995, '--gae-lambda', 0.9,
      '--max-off-line', 40, '--bc-data', p.examples, '--bc-coef', opt.bcCoef, '--bc-coef-end', opt.bcCoef,
      '--keep-every', opt.keepEvery,
      '--total-steps', plan.totalSteps, '--lr', Number(plan.lr.toPrecision(6)), '--lr-end', Number(plan.lrEnd.toPrecision(6)),
      '--critic-warmup', plan.warmup];
    say(`  leg of ${plan.leg} updates, about ${Math.ceil(plan.leg / opt.updatesPerMinute)} min; log ${p.trainLog}`);
    show(cmd);
    if (dry) return 'pending';
    const r = await run(cmd, { log: p.trainLog, append: true, killAt: deadline, onStart: writeLock });
    writeLock(null);
    if (r.timedOut) { say('  practice stopped at the end of this launch\'s time; the next launch continues it'); return 'time'; }
    if (r.code !== 0) throw new Error(`train_ppo.py ended with code ${r.code}; see ${p.trainLog}`);
  }
}

/** Every test attempt of a round: [{ k, policy, seed, out, run }]. */
function attemptsOf(round, copies) {
  const p = paths(track, round.n, opt.tag);
  const list = [];
  for (const k of copies) {
    for (let s = 0; s < opt.seeds; s++) list.push({ k, policy: 'sample', seed: 10 + s }); // seeds 10.. as search_round.sh
    list.push({ k, policy: 'greedy', seed: 0 });
  }
  return list.map((a) => ({ ...a, out: p.testOut(a.k, a.policy, a.seed), run: p.testRun(a.k, a.policy, a.seed) }));
}
const readAttempt = (a) => ({ ...a, ...parseAttempt(existsSync(at(a.out)) ? readFileSync(at(a.out), 'utf8') : '') });

/** 3. Test the last kept copies; only attempts without a result are run. */
async function stepTest(round) {
  const p = paths(track, round.n, opt.tag);
  const copies = existingCopies(round);
  // Once a copy is picked, the set of copies tested is fixed with it.
  round.tested ??= copiesToTest([...copies.keys()], round.train.updates, opt);
  const todo = attemptsOf(round, round.tested).filter((a) => !readAttempt(a).done);
  const total = round.tested.length * (opt.seeds + 1);
  if (!todo.length) { say(`3 test: done (${total} attempts on copies ${round.tested.map((k) => `c${k}`).join(', ')})`); saveState(); return 'done'; }
  say(`3 test: copies ${round.tested.map((k) => `c${k}`).join(', ')}; ${total - todo.length} of ${total} attempts have a result, ${todo.length} to run, ${opt.testWorkers} at a time`);
  // About 40 s per attempt including Python's start-up (an estimate, not measured here).
  if (!dry && minutesLeft() < Math.ceil(todo.length / opt.testWorkers) * 40 / 60 + 1) { say('  not enough of this launch left'); return 'time'; }
  const command = (a) => [PY, 'rl/evaluate.py', '--track', track, '--max-off-line', 40, '--checkpoint', p.copy(a.k),
    '--policy', a.policy, '--seed', a.seed, '--run', a.run];
  for (const a of todo) say(`  $ ${command(a).join(' ')} > ${a.out}`);
  if (dry) return 'pending';
  saveState();
  let next = 0;
  const failures = [];
  await Promise.all(Array.from({ length: Math.min(opt.testWorkers, todo.length) }, async () => {
    while (next < todo.length) {
      const a = todo[next++];
      const r = await run(command(a), { killAt: deadline + 10 * 60_000 });
      // evaluate.py exits 1 for a lap that did not finish; what matters is the result line.
      if (parseAttempt(r.out).done) writeWhole(a.out, r.out); else failures.push(`${a.run}: ${r.out.trim().split('\n').slice(-3).join(' | ')}`);
      // evaluate.py saves each attempt's keys (1.4 MB) under runs/; the
      // result line is all the driver uses.
      if (!opt.keepAttempts) rmSync(join(PROJECT, `runs/${a.run}_${track}.json`), { force: true });
    }
  }));
  if (failures.length) throw new Error(`${failures.length} test attempts gave no result:\n  ${failures.slice(0, 5).join('\n  ')}`);
  return 'done';
}

/** 4. Pick the copy to search with. */
async function stepPick(round) {
  const rows = round.tested.map((k) => summariseCopy(`c${k}`, attemptsOf(round, [k]).map(readAttempt)));
  say('4 pick:   copy   finishes  fastest  three fastest  top choices');
  for (const r of rows) say(`          ${String(r.copy).padEnd(7)}${`${r.finishes}/${r.of}`.padEnd(10)}${seconds(r.best).padEnd(9)}${seconds(r.top3).padEnd(15)}${r.greedy ? seconds(r.greedy) : 'did not finish'}`);
  if (round.picked) { say(`  picked earlier: c${round.picked.copy}`); return 'done'; }
  const choice = pickCopy(rows, opt);
  if (!choice) {
    // Nothing to search from. Training towards the same lap again from the
    // same checkpoint is not a decision this driver should make by itself.
    say('  no copy finished a sampled lap: the round has failed and the track stops here');
    Object.assign(round, { done: true, lap: null, gain: null, ownFrames: null });
    state.stopped = `round ${round.n}: no kept copy finished a lap in testing`;
    saveState();
    return 'stop';
  }
  say(`  picked ${choice.copy}: ${choice.why}`);
  round.picked = { copy: Number(choice.copy.slice(1)), finishes: choice.row.finishes, of: choice.row.of, best: choice.row.best, top3: choice.row.top3, greedy: choice.row.greedy, rule: opt.pick };
  saveState();
  return 'done';
}

/** 5. The searches (see SEARCHES at the top). */
async function stepSearch(round) {
  const p = paths(track, round.n, opt.tag);
  const k = round.picked.copy;
  round.searches ??= {};
  let exported = false, pending = false;
  const ran = new Set(); // searches run in this launch
  for (let s = 1; s <= opt.searches; s++) {
    if (round.searches[s]) continue; // verified, or found to have nothing to search from, in an earlier launch
    const frames = await verifyLap(p.searchLap(s));
    if (frames) {
      const log = parseSearchLog(existsSync(at(p.searchLog(s))) ? readFileSync(at(p.searchLog(s)), 'utf8') : '');
      say(`5 search ${s}: done, ${seconds(frames)} s, verified (${p.searchLap(s)})`);
      round.searches[s] = { file: p.searchLap(s), frames, ownFrames: log.ownFrames };
      saveState();
      continue;
    }
    const logged = existsSync(at(p.searchLog(s)));
    if (ran.has(s)) throw new Error(`search ${s} ended normally but ${p.searchLap(s)} does not pass Verify; see ${p.searchLog(s)}`);
    say(`5 search ${s}: ${logged ? 'was started but left no verified lap (interrupted): run it again from the start' : 'to run'}`);
    if (!dry && minutesLeft() < (opt.searchSeconds * 1.15 + 60) / 60) { say('  not enough of this launch left'); return 'time'; }
    const exportCmd = [PY, 'rl/export_actor.py', p.copy(k)];
    // A different seed for every search of every round: with the script's
    // default seed, a second search from the same copy would repeat the first.
    const cmd = ['node', 'scripts/search_rollout.mjs', track, `actor=${p.actor(k)}`, `seconds=${opt.searchSeconds}`, 'passes=1',
      `workers=${opt.searchWorkers}`, `rngSeed=${round.n * 100 + s}`, `out=${p.searchRun(s)}`];
    if (!exported) show(exportCmd);
    say(`  $ ${cmd.join(' ')} > ${p.searchLog(s)}`);
    if (dry) { exported = true; pending = true; continue; }
    if (!exported) {
      // Every launch: the file is small and a shutdown can leave it half written.
      const e = await run(exportCmd);
      if (e.code !== 0) throw new Error(`export_actor.py failed:\n${e.out}`);
      exported = true;
    }
    ran.add(s);
    const r = await run(cmd, { log: p.searchLog(s), killAt: deadline + 10 * 60_000, onStart: writeLock });
    writeLock(null);
    const log = parseSearchLog(readFileSync(at(p.searchLog(s)), 'utf8'));
    if (log.noneFinished) {
      say('  the picked copy finished none of its own laps in this search; counted as a search without a lap');
      round.searches[s] = { file: null, frames: null, ownFrames: null };
      saveState();
      continue;
    }
    if (r.timedOut) return 'time';
    if (r.code !== 0) throw new Error(`search_rollout.mjs ended with code ${r.code}; see ${p.searchLog(s)}`);
    s--; // back round the loop: the lap is accepted only by the Verify above
  }
  return pending ? 'pending' : 'done';
}

/** 6. Compare with the best lap so far and decide what happens next. */
async function stepConclude(round) {
  const found = Object.values(round.searches).filter((x) => x.frames);
  const lap = found.length ? found.reduce((a, b) => (b.frames < a.frames ? b : a)) : null;
  const before = state.best;
  const verdict = concludeRound({ bestFrames: round.startLap.frames, lapFrames: lap?.frames ?? null, strikes: state.strikes, minGain: opt.minGain, patience: opt.patience });
  const own = found.map((x) => x.ownFrames).filter(Boolean);
  Object.assign(round, { done: true, lap: lap ? { file: lap.file, frames: lap.frames } : null, gain: verdict.gain, ownFrames: own.length ? Math.min(...own) : null });
  for (const x of found) state.laps.push({ file: x.file, frames: x.frames, round: round.n });
  // Carry forward the fastest verified lap of ANY round, never simply the latest.
  if (lap && lap.frames < state.best.frames) state.best = { file: lap.file, frames: lap.frames, round: round.n };
  // The specialist itself does carry on from this round's picked copy even
  // when the searched lap was slower: it has 2.5 million more decisions of
  // practice, and going back would repeat the same round. (desert4 round 1:
  // the lap was 6 ms slower, the policy's own best lap 26 ms faster.)
  state.base = paths(track, round.n, opt.tag).copy(round.picked.copy);
  state.strikes = verdict.strikes;
  say(`6 conclude: round ${round.n} searched to ${seconds(lap?.frames)} s against ${seconds(round.startLap.frames)} s before: ` +
    `gain ${verdict.gain == null ? 'none (no search produced a lap)' : `${verdict.gain} ms`}, ${verdict.paid ? 'paid' : `did not pay (needs ${opt.minGain} ms)`}`);
  say(`  best lap ${state.best === before ? 'stays' : 'is now'} ${seconds(state.best.frames)} s (${state.best.file}); next round starts from ${state.base}`);
  if (verdict.stop) {
    state.stopped = `${verdict.strikes} rounds in a row gained less than ${opt.minGain} ms (after round ${round.n})`;
    say(`  ${state.stopped}: stopping`);
  } else if (!verdict.paid) say(`  ${verdict.strikes} of ${opt.patience} rounds in a row that did not pay`);
  saveState();
  return 'done';
}

// ---- the launch -----------------------------------------------------------------------
async function main() {
  say(`${track}: ${dry ? 'DRY RUN (nothing is run or written, except reading checkpoints and verifying laps)' : `launch of up to ${opt.minutes} min`}, target ${opt.rounds} round(s)`);
  takeLock();
  if (!state) { state = await createState(); saveState(); }
  const steps = [stepExamples, stepTrain, stepTest, stepPick, stepSearch, stepConclude];
  for (;;) {
    if (state.stopped) { say(`${track} has stopped: ${state.stopped}. Best lap ${seconds(state.best.frames)} s (${state.best.file}).`); return 0; }
    let round = state.rounds.at(-1);
    if (!round || round.done) {
      if (state.rounds.length >= opt.rounds) { say(`${track}: ${state.rounds.length} round(s) complete, the target. Best lap ${seconds(state.best.frames)} s (${state.best.file}).`); return 0; }
      const examples = chooseExamples(state.laps, opt);
      round = { n: state.rounds.length + 1, base: state.base, startLap: { file: state.best.file, frames: state.best.frames }, exampleLaps: examples.map((l) => l.file), done: false };
      state.rounds.push(round);
      saveState();
    }
    say(`\nround ${round.n}: from ${round.base}, towards ${seconds(round.startLap.frames)} s`);
    for (const step of steps) {
      const result = await step(round);
      if (result === 'stop') break;
      if (result === 'time') { say(`\nout of time for this launch after ${((Date.now() - startTime) / 60_000).toFixed(0)} min; launch again to continue`); return 3; }
      if (result === 'pending') {
        say('\nDRY RUN ends here: the commands above are what a real launch would run next, and every later');
        say('decision (which copy, the gain, whether to stop) depends on what they produce. Still to come in this round:');
        const p = paths(track, round.n, opt.tag), rest = steps.slice(steps.indexOf(step) + 1);
        const updates = Math.floor(opt.steps / (opt.envs * opt.rollout));
        if (rest.includes(stepTrain)) say(`  2 practice  ${PY} -u rl/train_ppo.py --resume --checkpoint ${p.checkpoint} --bc-data ${p.examples} ...  (${updates} updates, in legs)`);
        if (rest.includes(stepTest)) say(`  3 test      ${PY} rl/evaluate.py --checkpoint ${p.copy('<k>')} --policy sample|greedy --seed <s> ...  (${opt.seeds + 1} attempts on each of up to ${opt.maxCopies} copies)`);
        if (rest.includes(stepPick)) say(`  4 pick      rule ${opt.pick}, at least ${opt.minFinishes} of ${opt.seeds} finishes`);
        if (rest.includes(stepSearch)) say(`  5 search    ${opt.searches} x node scripts/search_rollout.mjs ${track} actor=${p.actor('<picked>')} seconds=${opt.searchSeconds} passes=1 out=${p.searchRun('<1..>')}`);
        if (rest.includes(stepConclude)) say(`  6 conclude  Verify each lap; it pays if at least ${opt.minGain} ms faster than ${seconds(round.startLap.frames)} s; stop after ${opt.patience} rounds in a row that do not`);
        return 0;
      }
    }
  }
}

let code = 1;
try { code = await main(); } catch (error) { console.error(`\nERROR: ${error.message}`); if (currentChild) killTree(currentChild); }
dropLock();
process.exit(code);
