// Explore from save states: get a FINISHED lap on a track the policy cannot
// yet drive, by restarting a little before wherever the furthest attempt
// ended and trying varied continuations (the Go-Explore idea), instead of
// starting every attempt on the start line.
//
// Why: the generalist usually fails an unseen track at ONE spot. An attempt
// from the start line spends most of its simulated time driving the part it
// can already drive, to get one more try at that spot. From a save state two
// seconds before it, the same simulated time buys several tries.
//
// The loop, in plain terms:
//
//   1. Attempt 1 drives from the start line with the policy's top choices.
//      While any attempt is driving, every 0.25 s the moment is offered to the
//      ARCHIVE: a table of save states ("cells"), one per 20 units of road and
//      per 2 units of sideways position. A cell keeps the state that got
//      there soonest. Keeping cells by sideways position as well as distance
//      is what stops the archive from being one line: a car 4 units left of
//      the usual line is a different starting point, and it is kept.
//   2. The FRONTIER is the furthest distance any attempt has reached.
//   3. Each later attempt picks a cell between `backMin` and B seconds of
//      driving behind the frontier, restores it, drives a short VARIED stretch
//      (see KINDS), then lets the policy drive on until the attempt ends.
//      Cells that have been tried often are picked less often.
//   4. B starts at the first entry of BACK and moves to the next entry
//      whenever `perLevel` attempts in a row have not moved the frontier:
//      the states close to the crash are then treated as lost causes (too
//      fast, too wide or too slow for what comes next, whatever is done) and
//      the loop backs off further. Moving the frontier puts B back to the
//      first entry; so does running out of entries (the levels go round).
//      BACK stops at 5 s because of a measurement: with levels up to 12 s,
//      0 of 33 restarts from more than 5 s behind the frontier moved it,
//      against 33 of 195 from closer (15 runs, three tracks; see README).
//   5. An attempt that crosses the finish line ends the search: its decisions
//      (the cell's own history plus the new stretch) are a whole lap from the
//      start line, which is replayed on a fresh simulator and put through
//      the game's Verify (ideas/shared/verify.mjs).
//
// `mode=plain` is the comparison: the same budget spent on ordinary attempts
// from the start line (top choices once, then the policy's usual randomness,
// which is how rl/evaluate.py --policy sample tests the generalist).
//
// The budget is counted in SIMULATED time, as "laps": ticks driven divided
// by the human's lap time on this track. That is the honest unit for "after
// a few tries": a restart from a save state is not free, it costs the
// seconds it drives.
//
// Needs a reference lap (rl/racing_env.mjs cannot run without one, and the
// generalist's inputs include it): the track's human lap by default. So this
// can only be tried on official tracks today; see the README.
//
// Local use only: nothing here contacts Kodub's servers.
//
// Usage (from the project root):
//   node ideas/g2-3-explore-and-adapt/explore.mjs <track> [key=value ...]
//     actor=rl/checkpoints/ppo_blkgen.best2.actor.bin   policy weights (rl/export_actor.py)
//     mode=explore      explore | plain
//     laps=8            budget of simulated time, in human lap times
//     seconds=100       wall-clock limit for the search itself
//     seed=1            random seed
//     back=1.5,3,5      how far behind the frontier to restart, in seconds, one entry per level
//     backMin=0.5       never restart closer to the frontier than this
//     perLevel=4        attempts without a new frontier before backing off further
//     kinds=sample,hot,kick,lift   which variations to use (see KINDS)
//     tail=sample       how the policy drives after the varied stretch: sample | greedy
//     hot=2             temperature of the 'hot' variation
//     out=g2-3-explore  run name: runs/<out>_<track>.json + .recording.json if a lap is found,
//                       and the log ideas/g2-3-explore-and-adapt/out/<out>_<mode>_<track>.json
//     refLap=-1         which human lap is the reference (see refLap in rl/racing_env.mjs)
import { mkdirSync, writeFileSync } from 'node:fs';
import { openBlockEnv, fromStart, needsFreshCar } from '../shared/block_rollout.mjs';
import { loadPolicy, createRng } from '../shared/policy.mjs';
import { decisionsToKeys } from '../shared/laps.mjs';
import { verifyAndSave } from '../shared/verify.mjs';

// --- arguments ---------------------------------------------------------------
const args = process.argv.slice(2);
const track = args.find((a) => !a.includes('='));
const opt = Object.fromEntries(args.filter((a) => a.includes('=')).map((a) => a.split('=')));
if (!track) { console.error('Usage: node ideas/g2-3-explore-and-adapt/explore.mjs <track> [key=value ...]'); process.exit(1); }
const num = (key, fallback) => Number(opt[key] ?? fallback);
const mode = opt.mode ?? 'explore';
const lapBudget = num('laps', 8), wallSeconds = num('seconds', 100);
const BACK = (opt.back ?? '1.5,3,5').split(',').map(Number);
const BACK_MIN = num('backMin', 0.5), PER_LEVEL = num('perLevel', 4);
const KIND_NAMES = (opt.kinds ?? 'sample,hot,kick,lift').split(',');
const tailGreedy = (opt.tail ?? 'sample') === 'greedy';
const HOT = num('hot', 2);
const outName = opt.out ?? 'g2-3-explore';
const rng = createRng(num('seed', 1));
const randInt = (n) => Math.floor(rng() * n);

// The archive's grid. The human averages 75 to 91 units per second on the
// three test tracks, so 0.25 s between offers is about 20 units and 20-unit
// cells give about one cell per offer along one line. 2 units sideways is the
// car's own width; the generalist's winter4 failure was a car 2 to 5 units
// left of the line, i.e. one or two cells from the line's own.
const MARK_EVERY = 5;       // decisions between offers to the archive (0.25 s)
const CELL_LENGTH = 20;     // units along the reference line
const CELL_WIDTH = 2;       // units sideways
const MAX_SIDE_CELLS = 4;   // further out than 8 units all counts as one cell
const GAIN = 5;             // units: the frontier "moved" if it moved by more than this

const policy = loadPolicy(opt.actor ?? 'rl/checkpoints/ppo_blkgen.best2.actor.bin');
const renv = await openBlockEnv(track, opt.refLap != null ? { refLap: num('refLap', -1) } : {});
const lapTicks = renv.human.frames;                      // the human's lap, ms: the unit of the budget
const lineLength = renv.line.length;                     // units
const paceUnitsPerSecond = lineLength / (lapTicks / 1000); // the human's average speed, to turn "seconds back" into units

// --- driving -----------------------------------------------------------------
let ticksUsed = 0;          // every simulated tick driven, replays included
let carId = 0;              // goes up when the simulator's car is replaced (all older marks are then dead)
let obs = null;             // the observation for the next decision

/**
 * KINDS: what an attempt does differently for its first few decisions.
 * Each returns { length, change(decision) -> decision, temperature }: for the
 * first `length` decisions the policy's sampled choice (at `temperature`) is
 * passed through `change`. After that the policy drives as `tail` says.
 *   sample  nothing special: the policy's usual randomness from the first decision
 *   hot     the policy's randomness made flatter (temperature `hot`) for 0.5 to 1.5 s
 *   kick    steering forced to one side for 0.1 to 0.4 s (as training's "kick"
 *           does, rl/racing_env.mjs _kick): arrives on a different line
 *   lift    W released for 0.2 to 0.6 s, and half the time S held: arrives slower
 */
const KINDS = {
  sample: () => ({ length: 0, change: (d) => d, temperature: 1 }),
  hot: () => ({ length: 10 + randInt(21), change: (d) => d, temperature: HOT }),
  kick: () => {
    const steer = 1 + randInt(2);
    return { length: 2 + randInt(7), change: (d) => [steer, 0, d[2], d[3], d[4], d[5]], temperature: 1 };
  },
  lift: () => {
    const brake = randInt(2);
    return { length: 4 + randInt(9), change: (d) => [d[0], d[1], 0, 0, brake, 0], temperature: 1 };
  },
  // Top choices all the way: only meaningful once per starting point.
  greedy: () => ({ length: 0, change: (d) => d, temperature: 1, greedy: true }),
};

/** Where the car is now, in the terms the archive and the log use. */
const here = (info) => ({
  progress: renv.progress, lateral: renv.lateral, tick: info.frames, speed: info.speedKmh,
});

/** Put the car on the start line; replaces the car first when it is nearly
 *  used up (see "Car tick budget" in ideas/shared/CONTRACT.md). */
async function toStart() {
  if (needsFreshCar(renv)) carId++;
  obs = await fromStart(renv);
}

/** Drive decisions exactly as given (to rebuild a cell's state on a new car).
 *  Returns false if the episode ended on the way, which would mean the
 *  simulator did not repeat itself. */
async function replay(decisions) {
  for (const decision of decisions) {
    const r = await renv.stepBlock(decision);
    ticksUsed += 50;
    obs = r.obs;
    if (r.terminated || r.truncated) return false;
  }
  return true;
}

// --- the archive -------------------------------------------------------------
// key -> { key, progress, lateral, tick, speed, decisions, mark, car, tries, wins }
//   decisions  the whole lap so far, from the start line to this moment
//   mark/car   RacingEnv save state, and which car it belongs to
//   tries      attempts started here; wins: how many of them moved the frontier
const archive = new Map();
const cellKey = (progress, lateral) => {
  const side = Math.max(-MAX_SIDE_CELLS, Math.min(MAX_SIDE_CELLS, Math.round(lateral / CELL_WIDTH)));
  return `${Math.floor(progress / CELL_LENGTH)}:${side}`;
};

/** Offer the current moment to the archive. Kept if its cell is empty or the
 *  car got here sooner than the state the cell holds (sooner = more speed
 *  carried, and it leaves more of the time limit for the rest). */
async function offer(decisions, info) {
  const at = here(info);
  const key = cellKey(at.progress, at.lateral);
  const old = archive.get(key);
  if (old && old.tick <= at.tick) return;
  if (old?.mark && old.car === carId) renv.dropMark(old.mark);
  archive.set(key, { key, ...at, decisions: decisions.slice(), mark: await renv.mark(), car: carId, tries: 0, wins: 0 });
}

/** Restore a cell's state. Its save state is used if it belongs to the
 *  current car; otherwise the cell's decisions are driven again from the
 *  start line (the simulator is deterministic) and a new save state is taken. */
async function goTo(cell) {
  if (needsFreshCar(renv)) await toStart();
  if (cell.car === carId) { ({ obs } = await renv.rewind(cell.mark)); return; }
  await toStart();
  if (!(await replay(cell.decisions))) throw new Error(`cell ${cell.key}: replaying its decisions ended the lap`);
  cell.mark = await renv.mark();
  cell.car = carId;
}

/**
 * One attempt: from `cell` (null = the start line), a varied stretch of kind
 * `kindName`, then the policy until the episode ends. Offers a state to the
 * archive every MARK_EVERY decisions (explore mode only).
 * Returns { decisions (whole lap from the start line), reason, finished,
 *           finishFrames, progress, lateral, speed, tick }.
 */
async function attempt(cell, kindName) {
  if (cell) await goTo(cell); else await toStart();
  const kind = KINDS[kindName]();
  const decisions = cell ? cell.decisions.slice() : [];
  let info = null, r = null;
  // The car's state after each decision, to report how it ARRIVED at the place
  // it ended: a crash stops the car (and 'stalled' is only called 2 s later),
  // so the speed and sideways position at the end say little.
  const trail = [];
  for (let k = 0; ; k++) {
    const varied = k < kind.length;
    const useRng = kind.greedy || (!varied && tailGreedy) ? null : rng;
    let decision = policy.decide(obs, useRng, varied ? kind.temperature : 1);
    if (varied) decision = kind.change(decision);
    decisions.push(decision);
    r = await renv.stepBlock(decision);
    ticksUsed += 50;
    obs = r.obs;
    info = r.info;
    if (r.terminated || r.truncated) break;
    trail.push(here(info));
    if (mode === 'explore' && (k + 1) % MARK_EVERY === 0) await offer(decisions, info);
  }
  // The last moment at which the car was still more than 10 units short of
  // where it ended (about a quarter of a second of driving).
  const end = renv.progress;
  const before = trail.findLast((p) => p.progress < end - 10) ?? null;
  return { decisions, reason: info.reason, finished: info.reason === 'finished', finishFrames: info.finishFrames, ...here(info), before };
}

/**
 * Choose where the next attempt starts: a cell between BACK_MIN and
 * `backSeconds` of driving behind the frontier (in units, at the human's
 * average speed), picked at random with weight 1 / (1 + tries), so a cell
 * that keeps failing gives way to its neighbours. If the window is empty
 * (early in the lap) the start line is used.
 */
function chooseCell(frontier, backSeconds) {
  const from = frontier - backSeconds * paceUnitsPerSecond, to = frontier - BACK_MIN * paceUnitsPerSecond;
  const cells = [...archive.values()].filter((c) => c.progress >= from && c.progress <= to);
  if (!cells.length) return null;
  let total = 0;
  for (const c of cells) total += 1 / (1 + c.tries);
  let pick = rng() * total;
  for (const c of cells) { pick -= 1 / (1 + c.tries); if (pick <= 0) return c; }
  return cells.at(-1);
}

// --- the search ----------------------------------------------------------------
const t0 = performance.now();
const elapsed = () => (performance.now() - t0) / 1000;
const lapsUsed = () => ticksUsed / lapTicks;
const pct = (progress) => `${(100 * progress / lineLength).toFixed(1)}%`;
console.log(`${track}, ${mode}: human lap ${(lapTicks / 1000).toFixed(3)} s, line ${lineLength.toFixed(0)} units; ` +
  `budget ${lapBudget} laps of simulated time (${(lapBudget * lapTicks / 1000).toFixed(0)} s) or ${wallSeconds} s of wall time`);

const log = [];             // one entry per attempt
let frontier = 0;           // furthest progress so far, units
let stale = 0;              // attempts since the frontier last moved
let lap = null;             // the first finished attempt
while (!lap && lapsUsed() < lapBudget && elapsed() < wallSeconds) {
  const n = log.length;
  // Attempt 1 is always the policy's top choices from the start line.
  let cell = null, kindName = 'greedy', level = 0;
  if (n > 0 && mode === 'plain') kindName = 'sample';
  else if (n > 0) {
    level = Math.floor(stale / PER_LEVEL) % BACK.length;
    cell = chooseCell(frontier, BACK[level]);
    kindName = KIND_NAMES[randInt(KIND_NAMES.length)];
  }
  const startProgress = cell ? cell.progress : 0;
  const a = await attempt(cell, kindName);
  const gain = a.finished ? lineLength - frontier : a.progress - frontier;
  const moved = a.finished || gain > GAIN;
  if (cell) { cell.tries++; if (moved) cell.wins++; }
  stale = moved ? 0 : stale + 1;
  frontier = Math.max(frontier, a.finished ? lineLength : a.progress);
  if (a.finished) lap = a;
  log.push({
    attempt: n + 1, laps: +lapsUsed().toFixed(3), kind: kindName, level,
    from: +startProgress.toFixed(1), fromLateral: cell ? +cell.lateral.toFixed(2) : 0,
    // how far behind the frontier (as it was) this attempt started, in seconds at the human's average speed
    back: cell ? +((frontier - Math.max(0, gain) - startProgress) / paceUnitsPerSecond).toFixed(2) : null,
    reached: +a.progress.toFixed(1), reason: a.reason, moved,
    endLateral: +a.lateral.toFixed(2), endSpeed: +a.speed.toFixed(1), endTick: a.tick,
    // 10 units before the place it ended, while the car was still driving
    approachLateral: a.before ? +a.before.lateral.toFixed(2) : null,
    approachSpeed: a.before ? +a.before.speed.toFixed(1) : null,
    frontier: +(a.finished ? 1 : frontier / lineLength).toFixed(4),
  });
  console.log(`  ${String(n + 1).padStart(3)}  ${lapsUsed().toFixed(2).padStart(6)} laps  ${kindName.padEnd(6)} from ${pct(startProgress).padStart(6)}` +
    ` -> ${a.finished ? 'FINISH' : pct(a.progress).padStart(6)} (${a.reason})${moved ? '  frontier ' + (a.finished ? 'finish' : pct(frontier)) : ''}`);
}
const searchSeconds = elapsed();

// --- result --------------------------------------------------------------------
const result = {
  track, mode, actor: opt.actor ?? 'rl/checkpoints/ppo_blkgen.best2.actor.bin', seed: num('seed', 1),
  humanFrames: lapTicks, lineLength: +lineLength.toFixed(1),
  attempts: log.length, lapsUsed: +lapsUsed().toFixed(3), wallSeconds: +searchSeconds.toFixed(1),
  cells: archive.size, frontier: +(frontier / lineLength).toFixed(4),
  finished: !!lap, finishFrames: lap?.finishFrames ?? null, verified: false, files: [], log,
};
console.log(`\n${log.length} attempts, ${lapsUsed().toFixed(2)} laps of simulated time, ${searchSeconds.toFixed(0)} s of wall time, ${archive.size} cells`);
await renv.env.close();     // one simulator at a time: Verify below boots its own

if (lap) {
  // The lap is only real if it finishes from the start line on a fresh
  // simulator, on the same tick, and passes the game's Verify.
  // (a plain-mode lap gets its own name, so a comparison run does not
  // overwrite the explore run's lap)
  const v = await verifyAndSave({ track, keys: decisionsToKeys(lap.decisions), name: mode === 'plain' ? `${outName}-plain` : outName });
  result.verified = v.ok && v.finishFrames === lap.finishFrames;
  result.files = v.files;
  console.log(result.verified
    ? `FINISHED LAP: ${v.seconds.toFixed(3)} s (human ${(lapTicks / 1000).toFixed(3)} s), Verify passed -> ${v.files.join(', ')}`
    : `FAIL: the lap finished in the search (${lap.finishFrames} ticks) but not on replay (${JSON.stringify({ ...v, recording: undefined })})`);
} else {
  // Where it is stuck: the attempts that ended within 10 units of the frontier.
  const near = log.filter((a) => a.reached > frontier - 10);
  const reasons = {};
  for (const a of near) reasons[a.reason] = (reasons[a.reason] ?? 0) + 1;
  const mean = (key) => { const v = near.map((a) => a[key]).filter((x) => x != null); return v.length ? (v.reduce((s, x) => s + x, 0) / v.length).toFixed(1) : '?'; };
  console.log(`NO FINISHED LAP. Furthest: ${pct(frontier)} of the lap (${frontier.toFixed(0)} of ${lineLength.toFixed(0)} units).`);
  console.log(`  ${near.length} attempts ended within 10 units of it: ${Object.entries(reasons).map(([r, c]) => `${c} ${r}`).join(', ')}; ` +
    `10 units earlier they were on average ${mean('approachLateral')} units left of the line at ${mean('approachSpeed')} km/h (the game's speed reading)`);
  result.stuck = { progress: +frontier.toFixed(1), attemptsNear: near.length, reasons };
}
mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
const file = new URL(`./out/${outName}_${mode}_${track}.json`, import.meta.url);
writeFileSync(file, JSON.stringify(result, null, 1));
console.log(`log: ideas/g2-3-explore-and-adapt/out/${outName}_${mode}_${track}.json`);
process.exit(lap && !result.verified ? 1 : 0);
