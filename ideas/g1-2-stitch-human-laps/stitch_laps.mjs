// Build one lap from the fastest sections of several human laps.
//
// data/laps/<track>.json holds ten leaderboard laps. Different players are
// fastest in different parts of the track, so a lap that follows each player
// where that player is quickest could beat all ten. This script:
//
//   1. replays the ten laps and records every tick of each (paths.mjs);
//   2. lays boundaries along the fastest lap, one per `section` ms, and prints
//      each lap's section times and the theoretical best-of-sections time;
//   3. measures how often a switch from one lap's keys to another's SURVIVES,
//      for the three ways of following a donor lap in follow.mjs (raw, resync,
//      repair), on `joins` randomly chosen switches;
//   4. plans which lap to follow in each section (planRoute in paths.mjs) and
//      drives the plan with repaired joins. At every planned switch two cars
//      leave the same save state, one switching and one not, and the switch
//      is kept only if its car reaches a later boundary sooner and in as good
//      a state; then the rest is planned again from where the car is;
//   5. if the stitched lap finishes, checks it with the game's own Verify and
//      saves it as runs/<name>_<track>.json (+ .recording.json).
//
// Usage, from the project root:
//   node ideas/g1-2-stitch-human-laps/stitch_laps.mjs [track] [key=value ...]
//     track           desert4 (default)
//     section=250     ms of the fastest lap between two boundaries
//     joins=12        switches to test for survival (0 = skip step 3)
//     horizon=3000    ms after a join at which "still on the donor's path" is judged
//     finish=1        also follow tested joins to the finish line: 0 none, 1 raw
//                     and resync only (cheap), 2 repair too (about 20 s a join)
//     stitch=1        0 = skip steps 4 and 5
//     switchPenalty=10  ms a switch must be expected to gain before it is planned
//     risk=0.3        ms of planning cost per ms of state mismatch at a switch
//     maxMismatch=60  no switch is planned where the two states differ by more (ms)
//     check=2000      ms after a switch at which it is judged against not switching
//     margin=2        a switch is kept only if it is at least this many ms ahead then
//     acceptCost=40   ... and its mismatch against the donor is below this (ms)
//     attempts=8      switches tried at most (each costs about `check` ms of
//                     repaired driving, 5 to 10 s of wall time)
//     judge=check     how a planned switch is judged:
//                       check   (default, the original rule) both cars are
//                               driven `check` ms on and compared there
//                       finish  both cars are driven on to the FINISH LINE and
//                               the switch is kept only if its lap ends at
//                               least `margin` ms sooner. The run then goes on
//                               from the chosen car's state `check` ms after
//                               the switch, so later switches are still tried.
//                               Why: repair goes on costing time after the
//                               2 s look (on desert4, 3 switches each ahead
//                               after 2 s made a lap 44 ms SLOWER). Costs two
//                               repaired drives to the finish per switch tried
//                               (5 to 40 s each). The fastest lap any judged
//                               car finished is also kept, and is the result
//                               if the stitch itself ends slower or lost.
//     fallback=0      when the car loses the path, go back to the state just
//                     before the last kept switch, forbid that switch (there
//                     and for `check` ms of boundaries after), plan again from
//                     there, and carry on; at most this many times (0 = off:
//                     report NO LAP as before). An undone switch does not use
//                     up one of `attempts`. Why: on summer4 three switches were
//                     kept and the car then lost the path after boundary 116,
//                     so the whole run gave no lap at all; with fallback=6 it
//                     undid one switch and finished (34.374 s, Verify PASS,
//                     still 269 ms slower than the best human lap).
//     window, look, good, timeWeight, lostDistance   see FOLLOW_DEFAULTS in follow.mjs
//     start=          the lap to begin on (default: the plan's choice; 0 = the
//                     fastest lap, so that refused switches cannot leave a slower lap)
//     seed=1          random seed for choosing the tested joins
//     name=g1-2-stitch  run name of the saved lap
//     table=0         1: print every section's time for every lap
//
// One simulator, no GPU. Local use only: nothing here contacts any server.
import { loadTrack } from '../../sim/env.mjs';
import { humanLaps } from '../shared/laps.mjs';
import { SimSession } from '../shared/sim_session.mjs';
import { verifyAndSave } from '../shared/verify.mjs';
import { createRng } from '../shared/policy.mjs';
import { recordPath, crossings, sectionTimes, planRoute, mismatch, stateAt } from './paths.mjs';
import { follow, compare, FOLLOW_DEFAULTS } from './follow.mjs';

// --- arguments ---------------------------------------------------------------
const args = process.argv.slice(2);
const name = args.find((a) => !a.includes('=')) ?? 'desert4';
const opt = Object.fromEntries(args.filter((a) => a.includes('=')).map((a) => a.split('=')));
const num = (key, fallback) => Number(opt[key] ?? fallback);
const sectionMs = num('section', 250);
const joins = num('joins', 12);
const horizon = num('horizon', 3000);
const finishMode = num('finish', 1);
const toFinish = finishMode > 0;
const doStitch = num('stitch', 1) === 1;
const switchPenalty = num('switchPenalty', 10);
const risk = num('risk', 0.3);
const maxMismatch = num('maxMismatch', 60);
const checkMs = num('check', 2000);
const attempts = num('attempts', 8);
const acceptCost = num('acceptCost', 40);
const margin = num('margin', 2);
const runName = opt.name ?? 'g1-2-stitch';
const judge = opt.judge ?? 'check';
if (judge !== 'check' && judge !== 'finish') { console.error('judge must be check or finish'); process.exit(2); }
const fallbacks = num('fallback', 0);
const followOptions = {};
for (const key of Object.keys(FOLLOW_DEFAULTS)) if (key in opt) followOptions[key] = Number(opt[key]);
const rng = createRng(num('seed', 1));
const sec = (ticks) => (ticks / 1000).toFixed(3);
const t0 = performance.now();
const elapsed = () => ((performance.now() - t0) / 1000).toFixed(0).padStart(3);

// --- 1. the ten laps -----------------------------------------------------------
const laps = humanLaps(name);
const sim = await SimSession.create(name);
const track = loadTrack(name);
const paths = [];
for (const lap of laps) paths.push(await recordPath(sim.env, track, lap));
const bestHuman = paths[0].frames;

// --- 2. sections ---------------------------------------------------------------
const { ticks } = crossings(paths, sectionMs);
const times = sectionTimes(ticks);
const sections = times[0].length;
// The check that the table means what it says: every lap's sections add up to its lap time.
times.forEach((row, i) => { if (row.reduce((a, b) => a + b, 0) !== paths[i].frames) throw new Error(`lap ${i}: section times do not add up`); });
console.log(`${name}: ${laps.length} human laps, ${sections} sections of about ${sectionMs} ms of the fastest lap
`);
if (num('table', 0) === 1) {
  console.log('a "-" is a boundary the lap passed more than 8 units from the line of the fastest lap; its time is in the section before');
  console.log('section  ' + paths.map((_, i) => `lap${i}`.padStart(6)).join(''));
  for (let k = 0; k < sections; k++) {
    console.log(String(k).padStart(7) + '  ' + times.map((row, i) => String(ticks[i][k] == null ? '-' : row[k]).padStart(6)).join(''));
  }
  console.log();
}
// The short table: the lap in a few long stretches, so it fits a screen.
const groups = Math.min(8, sections);
const edge = (g) => Math.round((g * sections) / groups);
console.log('ms spent between boundaries ("-": the lap was on another line at one of the two)');
console.log('lap   time s   ' + Array.from({ length: groups }, (_, g) => `${edge(g)}-${edge(g + 1)}`.padStart(8)).join('') + '   boundaries crossed');
paths.forEach((path, i) => {
  const cells = Array.from({ length: groups }, (_, g) => {
    const a = ticks[i][edge(g)], b = ticks[i][edge(g + 1)];
    return String(a == null || b == null ? '-' : b - a).padStart(8);
  });
  console.log(`${String(i).padStart(3)}   ${sec(path.frames)}   ${cells.join('')}   ${ticks[i].filter((t) => t != null).length - 2}/${sections - 1}`);
});
// Theoretical best of sections: the cheapest route when a switch is free
// wherever both laps crossed the boundary, however different their states.
const free = planRoute(times, (i, j, k) => (ticks[i][k] == null || ticks[j][k] == null ? Infinity : 0));
const bestOf = Math.min(...free.toGo[0]);
console.log(`
best human lap                 ${sec(bestHuman)} s`);
console.log(`theoretical best of sections   ${sec(bestOf)} s  (${bestHuman - bestOf} ms faster; assumes a switch is free wherever two laps cross the same boundary)`);

/** State mismatch between lap i and lap j as each crosses boundary k. */
const mismatchAt = (i, j, k) => (ticks[i][k] == null || ticks[j][k] == null ? null : mismatch(stateAt(paths[i], ticks[i][k]), stateAt(paths[j], ticks[j][k])));
const switchCost = (i, j, k) => {
  const m = mismatchAt(i, j, k);
  return m == null || m.cost > maxMismatch ? Infinity : switchPenalty + risk * m.cost;
};
// Switches undone by `fallback` ("boundary:from:to"): never planned again.
const banned = new Set();
const allowedCost = (i, j, k) => (banned.has(`${k}:${i}:${j}`) ? Infinity : switchCost(i, j, k));
let plan = planRoute(times, allowedCost);
const startLap = 'start' in opt ? Number(opt.start) : plan.toGo[0].indexOf(Math.min(...plan.toGo[0]));
const describe = (routeLaps, first = 0) => {
  const parts = [];
  routeLaps.forEach((lap, n) => { if (n === 0 || lap !== routeLaps[n - 1]) parts.push(`lap${lap}@${first + n}`); });
  return parts.join(' -> ');
};
{
  const r = plan.route(0, startLap);
  console.log(`planned route                  ${sec(r.time)} s  (${bestHuman - r.time} ms faster if every switch were free): ${describe(r.laps)}`);
}

/** Which car the saved points belong to. renewCar() and a restore() of a dead
 *  point start a new car, and every point of the old one dies with it. */
let carGeneration = 0;
/** A new car, driven again along the keys driven so far. Needed when the car
 *  has used up its tick budget (see "Car tick budget" in CONTRACT.md); every
 *  saved point is dead afterwards. A snapshot (below) of a dead car is
 *  restored by driving its keys again, which gives the identical state
 *  (tests/test_follow.mjs checks this after a repaired follow). */
async function renewCar() {
  const keys = sim.keys.slice();
  const recent = sim.recent.slice();
  await sim.restart();
  carGeneration++;
  await sim.drive(keys);
  if (!sim.recent.length) sim.recent = recent;
}

// --- 3. how often does a join survive? -------------------------------------------
if (joins > 0) {
  console.log(`\njoin survival: ${joins} random switches (lap i -> lap j at a boundary), followed three ways`);
  console.log(`  "on path" = ${horizon} ms after the join the car is within 1.5 units of the donor's path and has not been lost` +
    (toFinish ? '; "finish" = followed the same way to the finish line, it crosses it' : ''));
  console.log('  join                 mismatch ms   raw              resync           repair');
  const modes = ['raw', 'resync', 'repair'];
  const tally = Object.fromEntries(modes.map((m) => [m, { onPath: 0, finished: 0, delta: [] }]));
  let done = 0;
  for (let n = 0; n < joins; n++) {
    // Not in the first second (all laps are the same launch) and not so late
    // that there is no horizon left before the finish.
    const last = sections - 1 - Math.ceil(horizon / sectionMs);
    const k = 4 + Math.floor(rng() * Math.max(1, last - 4));
    const i = Math.floor(rng() * paths.length);
    let j = Math.floor(rng() * (paths.length - 1)); if (j >= i) j++;
    const m = mismatchAt(i, j, k);
    if (m == null) continue;
    await sim.restart();
    await sim.drive(paths[i].keys.slice(0, ticks[i][k]));
    const join = await sim.save();
    const cells = [];
    for (const mode of modes) {
      await sim.load(join);
      let r = await follow(sim, paths[j], ticks[j][k], ticks[j][k] + horizon, mode, followOptions);
      const onPath = !r.lost && r.distance < 1.5;
      let cell = onPath ? 'on path' : r.lost ? 'lost   ' : 'off    ';
      if (onPath) tally[mode].onPath++;
      if (toFinish && !r.lost && (mode !== 'repair' || finishMode === 2)) {
        r = await follow(sim, paths[j], r.donorTick, Infinity, mode, followOptions);
        if (r.finished) {
          // Against the time the two halves took their own players.
          const delta = sim.state.finishFrames - (ticks[i][k] + paths[j].frames - ticks[j][k]);
          tally[mode].finished++; tally[mode].delta.push(delta);
          cell += ` fin ${delta >= 0 ? '+' : ''}${delta}`;
        } else cell += ' no fin';
      }
      cells.push(cell.padEnd(17));
    }
    sim.drop(join);
    done++;
    console.log(`  lap${i} -> lap${j} @ ${String(k).padStart(3)}  ${m.cost.toFixed(0).padStart(8)}      ${cells.join('')}`);
  }
  const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);
  for (const mode of modes) {
    const t = tally[mode];
    console.log(`  ${mode.padEnd(7)} on path ${t.onPath}/${done}` + (toFinish && (mode !== 'repair' || finishMode === 2) ? `, finished ${t.finished}/${done}` +
      (t.delta.length ? `, median finish ${median(t.delta) >= 0 ? '+' : ''}${median(t.delta)} ms against the sum of the two halves` : '') : ''));
  }
  console.log(`  (${elapsed()} s so far)`);
}

// --- 4. the stitch -------------------------------------------------------------
// SimSession.load() only shortens sim.keys to the point's tick. Here a point
// is loaded after a DIFFERENT branch was driven from an earlier point, so the
// keys have to be put back by hand.
const snapshot = async () => ({ point: await sim.save(), keys: sim.keys.slice(), car: carGeneration });
const restore = async (snap) => {
  if (snap.car === carGeneration) { await sim.load(snap.point); sim.keys = snap.keys.slice(); return; }
  // Its car was replaced (tick budget) since: drive its keys again on a new one.
  await sim.restart();
  carGeneration++;
  await sim.drive(snap.keys);
};
const release = (snap) => { if (snap && snap.car === carGeneration) sim.drop(snap.point); };

if (doStitch) {
  console.log('\nstitching (a switch is kept only if the car that switched ' +
    (judge === 'finish' ? 'finishes the lap sooner than the car that did not):' : 'reaches a later boundary sooner than the car that did not):'));
  await sim.restart();
  let lap = startLap;      // the lap being followed
  let k = 0;               // the boundary the car is at
  let at = 0;              // which tick of that lap the car is at
  let exact = true;        // true until the first switch: the car IS that lap, tick for tick
  let kept = 0, refused = 0, failed = null, undone = 0;
  const route = [];        // [lap, boundary] of every kept switch
  // fallback: for every kept switch, the car just before it (see `fallback=`).
  const history = [];
  // judge=finish: the fastest lap any judged car drove to the finish line.
  let fastestJudged = null; // { keys, frames, switched }
  /** Drive lap `l` from its tick `from` on to its tick `until` (Infinity =
   *  the finish), exactly (the car IS that lap) or with repair. Returns the
   *  follow() result, or a stand-in for the exact case. */
  const advanceFrom = async (l, from, isExact, until) => {
    if (isExact) {
      await sim.drive(paths[l].keys.slice(sim.tick, until === Infinity ? undefined : until));
      return { donorTick: sim.tick, lost: false, cost: 0, finished: sim.finished };
    }
    return follow(sim, paths[l], from, until, 'repair', followOptions);
  };
  /** Drive the present lap on to its tick `until`. */
  const advance = (until) => advanceFrom(lap, at, exact, until);
  /** The lap clock now, or the finish time once across the line. */
  const clock = () => (sim.finished ? sim.state.finishFrames : sim.tick);
  /** judge=finish: drive on to the finish line; the finish tick, or null. */
  const toFinish = async (l, from, isExact, switched) => {
    if (!sim.budgetLeft) await renewCar();
    if (!sim.finished) await advanceFrom(l, from, isExact, Infinity);
    if (!sim.finished) return null;
    const frames = sim.state.finishFrames;
    if (!fastestJudged || frames < fastestJudged.frames) fastestJudged = { keys: sim.keys.slice(), frames, switched };
    return frames;
  };
  /** The car is lost. With `fallback`, undo the last kept switch and carry on
   *  from just before it; returns false when there is nothing to fall back to. */
  const fallBack = async (why) => {
    if (undone >= fallbacks || history.length === 0) return false;
    const last = history.pop();
    undone++; kept--; route.pop();
    // Forbidden at that boundary and over the next `check` ms of boundaries:
    // banning one boundary only was not enough (summer4: the same switch was
    // planned again one boundary later, 250 ms on, and lost the path again).
    for (let b = last.k; b <= last.k + Math.ceil(checkMs / sectionMs); b++) banned.add(`${b}:${last.lap}:${last.target}`);
    plan = planRoute(times, allowedCost);
    await restore(last.snap);
    release(last.snap);
    ({ lap, at, exact, k } = last);
    console.log(`  ${elapsed()} s  ${why}: back to boundary ${k} on lap${lap}; the switch to lap${last.target} there is undone and not planned again`);
    return true;
  };

  while (!sim.finished) {
    if (!sim.budgetLeft) await renewCar();
    // An undone switch does not use up an attempt (`fallback` bounds those),
    // so that the run can still look for a switch that works instead.
    const ahead = kept + refused >= attempts ? [] : plan.route(k, lap).laps;
    // The next boundary at which the plan changes lap, if any.
    const step = ahead.findIndex((l, n) => l !== (n === 0 ? lap : ahead[n - 1]));
    if (step === -1) {
      const r = await advance(Infinity);
      if (!sim.finished) {
        failed = r.lost ? `lost lap${lap}'s path at its tick ${r.donorTick}` : `lap${lap}'s keys ran out before the finish line`;
        if (await fallBack(failed)) { failed = null; continue; }
      }
      break;
    }
    const target = ahead[step];
    const r0 = await advance(ticks[lap][k + step]);
    if (r0.lost || sim.finished) {
      if (r0.lost) {
        failed = `lost lap${lap}'s path at its tick ${r0.donorTick}`;
        if (await fallBack(failed)) { failed = null; continue; }
      }
      break;
    }
    k += step; at = r0.donorTick;

    // Two cars from the same state: one stays on its lap, one switches. Both
    // are driven to the same later boundary (the first one, at least `check`
    // ms on, that both laps crossed; else the finish) and the clocks compared.
    // With judge=finish both then drive on to the finish line, and the
    // finish times decide.
    let checkAt = Math.min(sections, k + Math.ceil(checkMs / sectionMs));
    while (ticks[lap][checkAt] == null || ticks[target][checkAt] == null) checkAt++;
    const toEnd = checkAt === sections;
    const here = await snapshot();
    const stay = await advance(toEnd ? Infinity : ticks[lap][checkAt]);
    const stayClock = clock(), stayOk = !stay.lost && (!toEnd || sim.finished);
    const stayed = await snapshot();
    const stayFinish = judge === 'finish' && stayOk ? await toFinish(lap, stay.donorTick, exact, !exact) : null;
    await restore(here);
    const sw = await follow(sim, paths[target], ticks[target][k], toEnd ? Infinity : ticks[target][checkAt], 'repair', followOptions);
    const swClock = clock(), swOk = !sw.lost && (!toEnd || sim.finished);
    let switched = null, swFinish = null;
    if (judge === 'finish' && swOk) {
      switched = await snapshot();
      swFinish = await toFinish(target, sw.donorTick, false, true);
    }
    // judge=check: kept if it got there sooner, and is no further from its
    // donor's state than acceptCost (or than the car that stayed is from its
    // own lap). A car that is ahead but in a worse state has borrowed the
    // time, not won it. judge=finish: kept if its lap ends `margin` ms sooner
    // (or the car that stayed never finishes).
    const ok = judge === 'finish'
      ? swFinish != null && (stayFinish == null || swFinish + margin <= stayFinish)
      : swOk && (!stayOk || (swClock + margin <= stayClock && (toEnd || sw.cost <= Math.max(acceptCost, stay.cost))));
    const finishes = judge === 'finish'
      ? `; to the finish: stay ${stayFinish != null ? sec(stayFinish) + ' s' : 'NO LAP'}, switch ${swFinish != null ? sec(swFinish) + ' s' : 'NO LAP'}` : '';
    console.log(`  ${elapsed()} s  boundary ${String(k).padStart(3)}: lap${lap} -> lap${target}, to ${toEnd ? 'the finish' : `boundary ${checkAt}`}: ` +
      `stay ${stayOk ? `${stayClock - here.keys.length} ms` : 'LOST'}, switch ${swOk ? `${swClock - here.keys.length} ms (mismatch ${sw.cost.toFixed(0)} ms)` : 'LOST'}${finishes}  ${ok ? 'KEPT' : 'refused'}`);
    let keepHere = false;
    if (ok) {
      kept++; route.push([target, k]);
      if (fallbacks > 0) { history.push({ snap: here, lap, at, exact, k, target }); keepHere = true; }
      if (switched) await restore(switched); // judge=finish: back from the finish line to the boundary
      lap = target; at = sw.donorTick; exact = false;
    } else if (!stayOk) {
      failed = `lost lap${lap}'s path after boundary ${k}, and the switch to lap${target} failed too`;
      release(stayed); release(switched);
      if (await fallBack(failed)) { failed = null; release(here); continue; }
      break;
    } else {
      refused++;
      await restore(stayed);
      at = stay.donorTick;
    }
    k = checkAt;
    if (!keepHere) release(here);
    release(stayed); release(switched);
  }

  // --- 5. result ---------------------------------------------------------------
  console.log(`\n${kept} switches kept, ${refused} refused` + (undone ? `, ${undone} undone after the car was lost` : '') +
    (route.length ? `: lap${startLap} -> ${route.map(([l, b]) => `lap${l}@${b}`).join(' -> ')}` : `; the lap is lap${startLap} unchanged`));
  let keys = null, frames = null, hasSwitch = kept > 0;
  if (!failed && sim.finished) { keys = sim.keys.slice(); frames = sim.state.finishFrames; }
  // judge=finish: a car driven to the finish while judging may have been faster
  // than the stitch that carried on (repair is not the same window by window
  // when a drive is split at a boundary), or the stitch may have been lost.
  if (fastestJudged && (frames == null || fastestJudged.frames < frames)) {
    console.log(`the fastest lap driven while judging switches, ${sec(fastestJudged.frames)} s, is ${frames == null ? 'the result instead' : `faster than the stitch (${sec(frames)} s) and is the result`}`);
    ({ keys, frames } = fastestJudged); hasSwitch = fastestJudged.switched; failed = null;
  }
  if (keys == null) {
    console.log(`NO LAP: ${failed ?? 'the car did not finish'}`);
    // The stitch was asked for and produced nothing: say so in the exit code
    // too, so a caller (a shell loop over tracks) does not take it for a lap.
    await sim.close();
    process.exit(1);
  } else {
    await sim.close();
    // A lap with no switch in it is one of the human laps: check it, do not save it as ours.
    const v = await verifyAndSave({ track: name, keys, name: runName, save: hasSwitch });
    console.log(`stitched lap ${sec(frames)} s; best human ${sec(bestHuman)} s (${frames < bestHuman ? `${bestHuman - frames} ms FASTER` : frames === bestHuman ? 'the same' : `${frames - bestHuman} ms slower`})`);
    console.log(`${v.ok ? 'PASS' : 'FAIL'} Verify: ${v.ok ? `the game finishes it on tick ${v.finishFrames}; ${v.files.length ? `saved ${v.files.join(', ')}` : 'not saved (no switch in it)'}` : JSON.stringify({ finished: v.finished, finishFrames: v.finishFrames, verified: v.verified, offByOneRejected: v.offByOneRejected })}`);
    process.exit(v.ok ? 0 : 1);
  }
}
await sim.close();
process.exit(0);
