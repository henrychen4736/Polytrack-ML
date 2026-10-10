// The decisions of the multi-round driver (rounds.mjs), as plain functions:
// data in, a decision out, no files touched and nothing started. Keeping them
// apart from the driver is what lets test_restart.mjs check every decision
// against the real round-1 data without running a round.
//
// What is decided here:
//   pickCopy       which kept copy of the specialist the next search uses
//   trainPlan      how much practice is left after an interruption, and the
//                  options that continue the run instead of starting it again
//   copiesToTest   which kept copies are worth testing
//   concludeRound  the gain of a round, and whether rounds have stopped paying
//   chooseExamples which laps become imitation examples
// plus the readers for the two text formats the driver depends on (the output
// of rl/evaluate.py and the log of scripts/search_rollout.mjs) and the file
// names of everything a round writes.

/** This idea's id: every file the driver writes under runs/ and
 *  rl/checkpoints/ starts with it (ideas/shared/CONTRACT.md). */
export const ID = 'g1-3';
export const IDEA_DIR = 'ideas/g1-3-search-train-rounds';

/**
 * Settings, with the value each has when not given on the command line.
 * The training and search values are those of scripts/search_round.sh, the
 * round that gained 80 ms on summer1 and 189 ms on summer4.
 */
export const DEFAULTS = {
  // --- how far to go ---
  rounds: 1,          // stop when this many rounds are complete on the track (a total, not "more")
  minutes: 105,       // wall-clock budget of one launch; see TIME in rounds.mjs
  minGain: 10,        // ms: a round "paid" if its lap beat the best lap so far by at least this
  patience: 2,        // stop after this many rounds in a row that did not pay
  // --- first launch only ---
  base: '',           // checkpoint round 1 starts from
  lap: '',            // searched lap(s) so far, comma-separated; the fastest that verifies is used
  // --- practice (rl/train_ppo.py) ---
  steps: 2_500_000,   // decisions of practice per round
  envs: 8,            // simulator processes
  rollout: 256,       // decisions per process per update (train_ppo.py's default)
  lr: 5e-5,           // falls in a straight line to 0 over the round
  bcCoef: 0.05,       // weight of the imitation term towards the searched lap
  warmup: 30,         // critic-only updates at the very start of a round
  keepEvery: 200,     // updates between kept copies
  updatesPerMinute: 30, // for fitting a leg of practice into the time left. Measured: 36 with the
                        // machine otherwise idle (1220 updates in 34 min), 35 with other training running
  // --- testing the kept copies (rl/evaluate.py) ---
  seeds: 10,          // sampled attempts per copy (plus one with top choices)
  testFromShare: 0.6, // test copies kept after this share of the round's practice...
  maxCopies: 4,       // ...but no more than this many, the latest ones
  testWorkers: 8,     // attempts running at once (one simulator each)
  keepAttempts: 0,    // 1: keep the 1.4 MB lap file of every test attempt under runs/
  // --- picking a copy ---
  pick: 'top3',       // 'top3' (see pickCopy) or 'best' (search_round.sh: the single fastest lap)
  minFinishes: 8,     // of `seeds`: copies finishing fewer sampled attempts are set aside
  closeMs: 10,        // top3 scores this close count as equal; more finishes then decides
  // --- searching (scripts/search_rollout.mjs) ---
  searches: 3,        // separate searches per round, each from the picked copy with its own seed
  searchSeconds: 200, // budget of each; see SEARCHES in rounds.mjs for why 3 x 200 and not 1 x 600
  searchWorkers: 8,
  // --- imitation examples ---
  extraLaps: 0,       // besides the best lap, up to this many other verified laps...
  extraWithin: 50,    // ...that are at most this many ms slower than it
  // --- modes ---
  tag: '',            // a name for a separate series of rounds on the same track (letters and digits)
  dry: 0,             // 1: print every command and decision, run and write nothing
  root: '',           // test only (needs dry=1): look for data files under this folder instead of the project
};

/** `<track> key=value ...` -> { track, opt }. Unknown keys are an error: a
 *  mistyped setting silently ignored would cost an hour of training. */
export function parseArgs(argv) {
  const track = argv.find((a) => !a.includes('='));
  const opt = { ...DEFAULTS };
  for (const arg of argv.filter((a) => a.includes('='))) {
    const [key, value] = [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)];
    if (!(key in DEFAULTS)) throw new Error(`unknown setting "${key}". Settings: ${Object.keys(DEFAULTS).join(', ')}`);
    opt[key] = typeof DEFAULTS[key] === 'number' ? Number(value) : value;
    if (Number.isNaN(opt[key])) throw new Error(`${key} must be a number, got "${value}"`);
  }
  return { track, opt };
}

/**
 * Every file of round `n` on `track`, as paths from the project root.
 * Checkpoints and laps carry the idea id as CONTRACT.md requires; logs, test
 * output and the state file stay in this idea's folder. `tag` (letters and
 * digits) puts a second, separate series of rounds on the same track next to
 * the first, e.g. to compare extraLaps=2 with extraLaps=0.
 */
export function paths(track, n, tag = '') {
  const stem = `${ID}-${tag ? `${tag}-` : ''}${track}-r${n}`;
  const ck = `rl/checkpoints/${stem}`;
  const work = `${IDEA_DIR}/work/${track}${tag ? `-${tag}` : ''}`;
  return {
    work,
    stem,                 // file name stem of the round's checkpoints
    state: `${work}/state.json`,
    lock: `${work}/lock.json`,
    results: `${IDEA_DIR}/results/${track}${tag ? `-${tag}` : ''}.txt`,
    examples: `${ck}-bc.npz`,
    checkpoint: `${ck}.pt`,                       // the file the trainer keeps replacing
    copy: (k) => `${ck}.c${k}.pt`,                // the copy after k updates of this round's practice
    actor: (k) => `${ck}.c${k}.actor.bin`,
    trainLog: `${work}/train_r${n}.log`,
    // No dots in the run name: it becomes a lap file name.
    testRun: (k, policy, seed) => `${ID}-t${tag}-r${n}-c${k}-${policy}${seed}`,
    testOut: (k, policy, seed) => `${work}/test/r${n}.c${k}.${policy}.${seed}.txt`,
    searchRun: (s) => `${ID}-${tag}r${n}s${s}`,
    searchLog: (s) => `${work}/search_r${n}s${s}.log`,
    searchLap: (s) => `runs/${ID}-${tag}r${n}s${s}_${track}.recording.json`,
  };
}

// ---- reading the tools' output -------------------------------------------------

/**
 * One attempt as rl/evaluate.py prints it. `done` is false when the text has
 * neither result line, which is what an attempt cut off by a shutdown looks
 * like; the driver runs those again.
 */
export function parseAttempt(text) {
  const finished = /^FINISHED in ([\d.]+) s/m.exec(text ?? '');
  if (finished) return { done: true, finished: true, frames: Math.round(Number(finished[1]) * 1000) };
  const failed = /^DID NOT FINISH \(([a-z ]+)\)/m.exec(text ?? '');
  if (failed) return { done: true, finished: false, reason: failed[1] };
  return { done: false };
}

/**
 * The log of scripts/search_rollout.mjs.
 *   complete      the search reached its last line (Verify passed and the lap was saved)
 *   noneFinished  the policy finished none of its own sixteen laps, so there was nothing to search from
 *   ownFrames, finalFrames   the policy's own best lap and the searched lap, from the summary line
 * A log with neither `complete` nor `noneFinished` is a search that was
 * interrupted: its lap exists nowhere (the script writes it only at the end).
 */
export function parseSearchLog(text) {
  const summary = /^([\d.]+) s -> ([\d.]+) s \(/m.exec(text ?? '');
  return {
    complete: /^PASS Verify/m.test(text ?? '') && /^saved runs\//m.test(text ?? ''),
    noneFinished: /none of them finished/.test(text ?? ''),
    ownFrames: summary ? Math.round(Number(summary[1]) * 1000) : null,
    finalFrames: summary ? Math.round(Number(summary[2]) * 1000) : null,
  };
}

// ---- which copy --------------------------------------------------------------

/**
 * One row of the test table for a kept copy.
 *   attempts  [{ policy: 'sample' | 'greedy', finished, frames }]
 * Returns { copy, finishes, of, laps (ms, fastest first), best, top3, greedy }.
 * top3 is the mean of the three fastest sampled laps (of all of them when
 * fewer finished); greedy is the top-choices lap, or null.
 */
export function summariseCopy(copy, attempts) {
  const sampled = attempts.filter((a) => a.policy === 'sample');
  const laps = sampled.filter((a) => a.finished).map((a) => a.frames).sort((a, b) => a - b);
  const fastest = laps.slice(0, 3);
  const greedy = attempts.find((a) => a.policy === 'greedy');
  return {
    copy, finishes: laps.length, of: sampled.length, laps,
    best: laps[0] ?? null,
    top3: fastest.length ? Math.round(fastest.reduce((a, b) => a + b, 0) / fastest.length) : null,
    greedy: greedy?.finished ? greedy.frames : null,
  };
}

/**
 * Pick the copy the search will use. Returns { copy, row, why } or null when
 * no copy finished a sampled lap.
 *
 * What the search needs from a policy is two things. It starts from the
 * fastest of sixteen laps the policy drives itself (one with top choices,
 * fifteen sampled), so the policy's FAST laps matter, not its typical lap.
 * And more than half of its candidates let the policy drive the rest of the
 * lap after a change, so a policy that often crashes wastes the search's
 * time: in round 1 summer4's search had 55% of candidates finish in time
 * against 81% on desert4.
 *
 * So, rule 'top3':
 *   1. Set aside copies that finished fewer than `minFinishes` of their
 *      sampled attempts. (If that leaves none, keep those with the most.)
 *   2. Score each by the mean of its three fastest sampled laps. The single
 *      fastest lap, which search_round.sh uses, is one draw: on summer4 the
 *      copy it picked had 34.741 s followed by 34.918 s, a 177 ms gap, while
 *      another copy had four laps inside 27 ms.
 *   3. Scores within `closeMs` of the best count as equal; among those take
 *      the copy with more finishes, then the lower score, then the later copy.
 *
 * On the round-1 tests this picks the same copy as search_round.sh on
 * summer1, summer4 and winter2 and a different one on desert4 (u1000, whose
 * three fastest average 22.030 s and whose top-choices lap is 22.006 s,
 * instead of u800 with 22.001 s then 22.062 s). Whether that would have
 * searched to a faster lap has NOT been measured.
 *
 * Rule 'best' is search_round.sh's: the single fastest sampled lap, no gate.
 */
export function pickCopy(rows, { pick = DEFAULTS.pick, minFinishes = DEFAULTS.minFinishes, closeMs = DEFAULTS.closeMs } = {}) {
  const finishers = rows.filter((r) => r.finishes > 0);
  if (!finishers.length) return null;
  if (pick === 'best') {
    const row = finishers.reduce((a, b) => (b.best < a.best ? b : a));
    return { copy: row.copy, row, why: `fastest single sampled lap (${seconds(row.best)} s)` };
  }
  let allowed = finishers.filter((r) => r.finishes >= minFinishes);
  let gate = `finished at least ${minFinishes} of ${rows[0].of}`;
  if (!allowed.length) {
    const most = Math.max(...finishers.map((r) => r.finishes));
    allowed = finishers.filter((r) => r.finishes === most);
    gate = `no copy finished ${minFinishes}; these finished the most (${most})`;
  }
  const bestScore = Math.min(...allowed.map((r) => r.top3));
  const close = allowed.filter((r) => r.top3 - bestScore <= closeMs);
  // rows arrive oldest copy first; >= makes the later copy win a full tie.
  const row = close.reduce((a, b) => (b.finishes > a.finishes || (b.finishes === a.finishes && b.top3 <= a.top3) ? b : a));
  return {
    copy: row.copy, row,
    why: `${gate}: ${allowed.map((r) => r.copy).join(', ')}; three fastest average ${seconds(row.top3)} s` +
      (close.length > 1 ? `, within ${closeMs} ms of ${close.filter((r) => r !== row).map((r) => r.copy).join(', ')} and ahead on finishes or score` : ', the lowest'),
  };
}

/**
 * Which kept copies to test: those from the last part of the round's practice
 * (after `testFromShare` of it), always including the last one, and at most
 * `maxCopies`, the latest. search_round.sh tests updates 800, 1000, 1200 and
 * the end of 1220; with the defaults this gives the same four.
 * `available` are the update counts for which a copy exists.
 */
export function copiesToTest(available, updates, { testFromShare = DEFAULTS.testFromShare, maxCopies = DEFAULTS.maxCopies } = {}) {
  const late = [...new Set(available)].filter((k) => k >= testFromShare * updates && k <= updates).sort((a, b) => a - b);
  if (!late.includes(updates)) late.push(updates);
  return late.slice(-maxCopies);
}

// ---- practice after an interruption ---------------------------------------------

/**
 * What to tell rl/train_ppo.py so that a round's practice CONTINUES.
 *
 * train_ppo.py --resume loads the weights and the step counter, but
 * --total-steps, the learning-rate line and the critic warm-up all count from
 * the start of the process. Relaunching an interrupted round with the same
 * options would therefore practise the full amount again at the full starting
 * learning rate, and freeze the policy for the first 30 updates once more.
 * So each launch is a "leg" with its own options:
 *   - only the updates that are left (or as many as fit in `minutesLeft`)
 *   - a learning rate that starts where the round's straight line had got to
 *     and ends where the line will be when the leg ends
 *   - only what is left of the critic warm-up (nothing once the round is past it)
 *
 *   startSteps   the checkpoint's step counter when the round began
 *   steps        its step counter now
 *   updates      updates in the whole round;  batch  decisions per update
 * Returns { done, doneUpdates, remaining, leg, lr, lrEnd, warmup, totalSteps }.
 */
export function trainPlan({ startSteps, steps, updates, batch, lr = DEFAULTS.lr, warmup = DEFAULTS.warmup,
  minutesLeft = Infinity, updatesPerMinute = DEFAULTS.updatesPerMinute }) {
  const doneUpdates = Math.floor((steps - startSteps) / batch);
  const remaining = Math.max(0, updates - doneUpdates);
  const fits = Math.max(0, Math.floor(minutesLeft * updatesPerMinute));
  const leg = Math.min(remaining, fits);
  return {
    done: remaining === 0, doneUpdates, remaining, leg,
    lr: lr * remaining / updates,
    lrEnd: lr * (remaining - leg) / updates,
    // The trainer freezes the policy while ITS update number is <= --critic-warmup,
    // counted from the start of the process, so a leg owes what is left of
    // the round's warm-up: 30 on the first leg, 10 after an interruption at
    // update 20 (the checkpoint is written every 10 updates), none from 30 on.
    // (This was "doneUpdates === 0 ? warmup : 0", which dropped the rest of
    // the warm-up after an early interruption; found by tests/test_lib.mjs.)
    warmup: Math.max(0, warmup - doneUpdates),
    totalSteps: leg * batch,
  };
}

// ---- did the round pay ----------------------------------------------------------

/**
 * The end of a round.
 *   bestFrames  the fastest verified lap before the round (what it trained towards)
 *   lapFrames   the fastest verified lap its searches produced, or null
 *   strikes     rounds in a row before this one that did not pay
 * Returns { gain, paid, strikes, stop }.
 *
 * gain is against the BEST lap, not the previous round's: desert4's round 1
 * searched to 21.913 s when 21.907 s was already in hand, a gain of -6 ms.
 * A round pays if gain >= minGain; `patience` rounds in a row that do not pay
 * stop the track. Why patience 2 and not 1: one round's result has luck in it
 * (the copy picked, the search's random choices), and the second attempt
 * starts from a policy that has practised more, so it is not a repeat.
 * Why minGain 10 ms: the three finished round-1 searches ended with single
 * gains of 1 to 4 ms in their last sections; less than 10 ms a round is that
 * kind of noise, and costs 50 minutes.
 */
export function concludeRound({ bestFrames, lapFrames, strikes, minGain = DEFAULTS.minGain, patience = DEFAULTS.patience }) {
  const gain = lapFrames == null ? null : bestFrames - lapFrames;
  const paid = gain != null && gain >= minGain;
  const now = paid ? 0 : strikes + 1;
  return { gain, paid, strikes: now, stop: now >= patience };
}

// ---- imitation examples -----------------------------------------------------------

/**
 * The laps a round trains towards: the fastest verified lap seen in ANY
 * round, then up to `extraLaps` other verified laps no more than
 * `extraWithin` ms slower, fastest first.
 *   laps  [{ file, frames }] every verified lap known so far
 */
export function chooseExamples(laps, { extraLaps = DEFAULTS.extraLaps, extraWithin = DEFAULTS.extraWithin } = {}) {
  const sorted = [...laps].sort((a, b) => a.frames - b.frames);
  const best = sorted[0];
  const extras = sorted.slice(1).filter((l) => l.file !== best.file && l.frames - best.frames <= extraWithin).slice(0, extraLaps);
  return [best, ...extras];
}

// ---- the results file --------------------------------------------------------------

export const seconds = (frames) => (frames == null ? '-' : (frames / 1000).toFixed(3));

/** The plain results table for one track, rebuilt whole from the state each
 *  time (so a rewrite after a restart cannot duplicate a row). */
export function resultsText(state) {
  const lines = [
    `${state.track}: search-and-train rounds (ideas/g1-3-search-train-rounds/rounds.mjs)`,
    `fastest verified lap: ${seconds(state.best.frames)} s  ${state.best.file}`,
    state.stopped ? `stopped: ${state.stopped}` : `rounds in a row that did not pay: ${state.strikes}`,
    '',
    'round  starting lap  copy picked  finishes  policy alone  searched lap  gain (ms)',
  ];
  for (const r of state.rounds.filter((x) => x.done)) {
    lines.push([
      String(r.n).padStart(5), `${seconds(r.startLap.frames)} s`.padStart(12),
      (r.picked ? `c${r.picked.copy}` : 'none').padStart(11),
      (r.picked ? `${r.picked.finishes}/${r.picked.of}` : '-').padStart(8),
      `${seconds(r.ownFrames)} s`.padStart(12), `${seconds(r.lap?.frames)} s`.padStart(12),
      (r.gain == null ? '-' : (r.gain > 0 ? '+' : '') + r.gain).padStart(9),
    ].join('  '));
  }
  lines.push('', 'starting lap: the fastest verified lap before the round, which the round trained towards.',
    'copy picked: kept copy after that many updates of the round\'s practice; finishes: its sampled test attempts.',
    'policy alone: the fastest lap that copy drove by itself at the start of its searches.',
    'gain: starting lap minus searched lap; negative means the round\'s lap was slower and was not carried forward.');
  return lines.join('\n') + '\n';
}
