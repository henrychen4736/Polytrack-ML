// The decision functions of lib.mjs on hand-built inputs. No simulator, no
// files: every expected value below was worked out by hand from what the
// README says the rule is, not read off the code.
import {
  DEFAULTS, parseArgs, paths, parseAttempt, parseSearchLog, summariseCopy, pickCopy, copiesToTest,
  trainPlan, concludeRound, chooseExamples, resultsText, seconds,
} from '../lib.mjs';
import { check, same, throws, finish } from './harness.mjs';

// ---- parseArgs -----------------------------------------------------------------------
{
  const before = JSON.stringify(DEFAULTS);
  const { track, opt } = parseArgs(['rounds=3', 'desert4', 'pick=best', 'lap=runs/a=b.json,runs/c.json', 'minGain=7.5']);
  check('parseArgs: the track is the argument without "=", wherever it stands', track === 'desert4');
  check('parseArgs: numbers become numbers, text stays text', opt.rounds === 3 && opt.minGain === 7.5 && opt.pick === 'best');
  check('parseArgs: a value may itself hold "="', opt.lap === 'runs/a=b.json,runs/c.json');
  check('parseArgs: settings not given keep their defaults', opt.searches === 3 && opt.searchSeconds === 200 && opt.minFinishes === 8 && opt.patience === 2 && opt.minutes === 105);
  check('parseArgs: DEFAULTS itself is not changed by a call', JSON.stringify(DEFAULTS) === before);
  throws('parseArgs: a mistyped setting is an error', () => parseArgs(['desert4', 'round=3']), /unknown setting "round"/);
  throws('parseArgs: a number setting given text is an error', () => parseArgs(['desert4', 'rounds=three']), /must be a number/);
  check('parseArgs: no track -> undefined', parseArgs(['rounds=1']).track === undefined);
}

// ---- paths: the naming rules of CONTRACT.md ---------------------------------------------
{
  const NAME = /^(g[12]-\d|shared)-[A-Za-z0-9_-]+$/; // ideas/shared/verify.mjs
  for (const tag of ['', 'x2']) {
    const p = paths('desert4', 2, tag);
    const label = `paths(tag="${tag}")`;
    check(`${label}: every checkpoint file is a new name starting rl/checkpoints/g1-3-`,
      [p.examples, p.checkpoint, p.copy(800), p.actor(800)].every((f) => f.startsWith('rl/checkpoints/g1-3-') && !f.includes('ppo_')), [p.examples, p.checkpoint, p.copy(800), p.actor(800)].join(' '));
    check(`${label}: run names under runs/ carry the idea id and have no dots`, NAME.test(p.searchRun(1)) && NAME.test(p.testRun(800, 'sample', 10)), `${p.searchRun(1)} ${p.testRun(800, 'sample', 10)}`);
    check(`${label}: the search lap is the file search_rollout.mjs writes for that run name`, p.searchLap(3) === `runs/${p.searchRun(3)}_desert4.recording.json`);
    check(`${label}: state, lock, logs and results stay inside the idea folder`, [p.state, p.lock, p.trainLog, p.results, p.testOut(800, 'greedy', 0), p.searchLog(1)].every((f) => f.startsWith('ideas/g1-3-search-train-rounds/')));
  }
  same('paths: exact names for round 1, no tag', (({ checkpoint, examples, state }) => [checkpoint, examples, state, paths('desert4', 1).copy(1220), paths('desert4', 1).searchRun(2)])(paths('desert4', 1)),
    ['rl/checkpoints/g1-3-desert4-r1.pt', 'rl/checkpoints/g1-3-desert4-r1-bc.npz', 'ideas/g1-3-search-train-rounds/work/desert4/state.json', 'rl/checkpoints/g1-3-desert4-r1.c1220.pt', 'g1-3-r1s2']);
  const all = (track, n, tag) => { const p = paths(track, n, tag); return [p.checkpoint, p.examples, p.copy(1), p.searchLap(1), p.testOut(1, 'sample', 10), p.state, `runs/${p.testRun(1, 'sample', 10)}_${track}.json`]; }; // rl/evaluate.py adds the track to the run name
  const sets = [all('desert4', 1, ''), all('desert4', 2, ''), all('desert4', 1, 'x2'), all('summer4', 1, ''), all('desert4', 11, '')];
  const flat = sets.flat().filter((f) => !f.endsWith('state.json'));
  check('paths: two rounds, two tracks and two tags never share a file', new Set(flat).size === flat.length);
  check('paths: a tagged series has its own state file', paths('desert4', 1, 'x2').state !== paths('desert4', 1, '').state && paths('desert4', 1).state === paths('desert4', 2).state);
}

// ---- parseAttempt (the output of rl/evaluate.py) ---------------------------------------------
{
  same('parseAttempt: a finished lap, time to the millisecond',
    parseAttempt('loaded x.pt\n  10% at 2.10 s\nbody contact on 0 of 440 decisions\nFINISHED in 22.001 s (human 21.750 s, 1.01x), 440 decisions, total reward 61.20\nsaved runs/x.json\n'),
    { done: true, finished: true, frames: 22001 });
  same('parseAttempt: 34.689 s -> 34689 ticks (no float slip)', parseAttempt('FINISHED in 34.689 s (human'), { done: true, finished: true, frames: 34689 });
  same('parseAttempt: a lap that did not finish is a result too, with its reason',
    parseAttempt('  10% at 2.10 s\r\nDID NOT FINISH (off line) at 5.45 s: reached 23.1% of the line\r\n'), { done: true, finished: false, reason: 'off line' });
  same('parseAttempt: reason "time limit"', parseAttempt('DID NOT FINISH (time limit) at 60.00 s: reached'), { done: true, finished: false, reason: 'time limit' });
  same('parseAttempt: output cut off before the result line -> not done', parseAttempt('loaded x.pt (1 training steps)\n  10% at 5.45 s\n  20% at'), { done: false });
  same('parseAttempt: a result line cut off in the middle of the number -> not done', parseAttempt('body contact on 0 of 4\nFINISHED in 22.0'), { done: false });
  same('parseAttempt: empty and missing text -> not done', [parseAttempt(''), parseAttempt(null), parseAttempt(undefined)], [{ done: false }, { done: false }, { done: false }]);
  same('parseAttempt: the words inside another line do not count', parseAttempt('note: FINISHED in 3.000 s earlier'), { done: false });
}

// ---- parseSearchLog (the log of scripts/search_rollout.mjs) --------------------------------------
{
  const head = 'policy alone\nsearching for 200 s with 8 processes: 1 passes, sections of 30 decisions every 10, 4.5 s per section\n' +
    '    12 s  pass 1, 0.50 s into the lap: 22.020 s  (-15 ms)\npass 1: 22.035 s -> 21.913 s\n';
  const tail = '\ntried 5000 candidates in 200 s (25 per second); 4000 finished in time, 12 improvements\n22.035 s -> 21.913 s (122 ms faster than the policy\'s own best)\n';
  same('parseSearchLog: a complete log', parseSearchLog(`${head}${tail}PASS Verify at 21913\nsaved runs/x.recording.json\n`), { complete: true, noneFinished: false, ownFrames: 22035, finalFrames: 21913 });
  same('parseSearchLog: cut off during the search', parseSearchLog(head.split('\n').slice(0, 3).join('\n')), { complete: false, noneFinished: false, ownFrames: null, finalFrames: null });
  check('parseSearchLog: the "pass 1: a -> b" line is not taken for the summary', parseSearchLog(head).ownFrames === null);
  same('parseSearchLog: summary printed but cut off before Verify -> not complete', (({ complete, finalFrames }) => [complete, finalFrames])(parseSearchLog(head + tail)), [false, 21913]);
  check('parseSearchLog: the policy finished none of its own laps', parseSearchLog('  none of them finished, so there is no lap to improve\n').noneFinished === true);
  same('parseSearchLog: no text', parseSearchLog(undefined), { complete: false, noneFinished: false, ownFrames: null, finalFrames: null });
}

// ---- summariseCopy ----------------------------------------------------------------------------
const S = (frames) => ({ policy: 'sample', finished: true, frames });
const X = { policy: 'sample', finished: false, reason: 'off line' };
/** A test-table row from sampled lap times (null = did not finish). */
const row = (copy, laps, greedy = null) => summariseCopy(copy, [...laps.map((f) => (f == null ? X : S(f))), greedy == null ? { policy: 'greedy', finished: false } : { policy: 'greedy', finished: true, frames: greedy }]);
{
  same('summariseCopy: 4 of 10 finished; three fastest 22000, 22050, 22100 average 22050; the top-choices lap is kept apart',
    row('c800', [22100, null, 22000, null, 22050, 22300, null, null, null, null], 21990),
    { copy: 'c800', finishes: 4, of: 10, laps: [22000, 22050, 22100, 22300], best: 22000, top3: 22050, greedy: 21990 });
  same('summariseCopy: two finishers -> the mean of those two, rounded (22001, 22004 -> 22003)',
    (({ finishes, top3, best }) => [finishes, top3, best])(row('a', [22004, null, 22001])), [2, 22003, 22001]);
  same('summariseCopy: none finished', row('a', [null, null]), { copy: 'a', finishes: 0, of: 2, laps: [], best: null, top3: null, greedy: null });
  check('summariseCopy: the top-choices lap never counts as a sampled finish', row('a', [null, null], 21000).finishes === 0 && row('a', [null, null], 21000).best === null);
  check('summariseCopy: lap times sort as numbers (9999 before 10000)', row('a', [10000, 9999]).best === 9999);
}

// ---- pickCopy ------------------------------------------------------------------------------------
/** A row given directly: finishes out of ten and the three-fastest score. */
const R = (copy, finishes, top3, best = top3 - 5) => ({ copy, finishes, of: 10, laps: [], best, top3, greedy: null });
{
  check('pickCopy: the 8-of-10 gate sets aside a faster copy that finished 7', pickCopy([R('a', 7, 21900), R('b', 8, 22000)]).copy === 'b');
  check('pickCopy: exactly 8 of 10 passes the gate', pickCopy([R('a', 8, 21900), R('b', 10, 22000)]).copy === 'a');
  check('pickCopy: minFinishes=7 lets that copy back in', pickCopy([R('a', 7, 21900), R('b', 8, 22000)], { minFinishes: 7 }).copy === 'a');
  check('pickCopy: scores exactly closeMs (10) apart count as equal, and more finishes wins', pickCopy([R('a', 8, 22000), R('b', 10, 22010)]).copy === 'b');
  check('pickCopy: 11 ms apart is not close: the lower score wins despite fewer finishes', pickCopy([R('a', 8, 22000), R('b', 10, 22011)]).copy === 'a');
  check('pickCopy: close and equal finishes -> the lower score (given second)', pickCopy([R('a', 9, 22005), R('b', 9, 22000)]).copy === 'b');
  check('pickCopy: close and equal finishes -> the lower score (given first)', pickCopy([R('a', 9, 22000), R('b', 9, 22005)]).copy === 'a');
  check('pickCopy: a complete tie goes to the later copy', pickCopy([R('a', 9, 22000), R('b', 9, 22000), R('c', 9, 22000)]).copy === 'c');
  check('pickCopy: "close" is measured from the best score, not chained (22000/8, 22008/9, 22016/10 -> the middle one)',
    pickCopy([R('a', 8, 22000), R('b', 9, 22008), R('c', 10, 22016)]).copy === 'b');
  check('pickCopy: no copy passes the gate -> those with the most finishes, then the lower score', pickCopy([R('a', 5, 22000), R('b', 7, 22500), R('c', 7, 22400)]).copy === 'c');
  check('pickCopy: no copy finished any sampled lap -> null', pickCopy([R('a', 0, null, null), R('b', 0, null, null)]) === null);
  check('pickCopy: a copy without finishes is never picked, even alone below the gate', pickCopy([R('a', 0, null, null), R('b', 1, 23000)]).copy === 'b');
  check('pickCopy: rule "best" takes the single fastest lap, ignoring finishes', pickCopy([R('a', 3, 22500, 22001), R('b', 10, 22010, 22002)], { pick: 'best' }).copy === 'a');
  check('pickCopy: rule "best", equal fastest laps -> the earlier copy (as the shell script\'s strict "<")', pickCopy([R('a', 9, 22010, 22001), R('b', 10, 22010, 22001)], { pick: 'best' }).copy === 'a');
  // The four copies used by the driver test: worked by hand in test_driver.mjs.
  const four = [R('c800', 10, 22010), R('c1000', 7, 21900, 21900), R('c1200', 9, 22006), R('c1220', 10, 22014)];
  check('pickCopy: four copies; gate drops c1000, c800/c1200/c1220 are within 10 ms, c800 and c1220 lead on finishes, c800 has the lower score', pickCopy(four).copy === 'c800', pickCopy(four)?.why);
  check('pickCopy: the same four with closeMs=0 -> the lowest allowed score, c1200', pickCopy(four, { closeMs: 0 }).copy === 'c1200');
  check('pickCopy: the same four with rule "best" -> c1000', pickCopy(four, { pick: 'best' }).copy === 'c1000');
  const picked = pickCopy(four);
  check('pickCopy: returns the row it picked and says why', picked.row === four[0] && typeof picked.why === 'string' && picked.why.length > 0);
}

// ---- copiesToTest -------------------------------------------------------------------------------------
{
  same('copiesToTest: copies every 200 of a 1220-update round -> 800, 1000, 1200 and the end', copiesToTest([200, 400, 600, 800, 1000, 1200], 1220), [800, 1000, 1200, 1220]);
  same('copiesToTest: a copy exactly at 60% is in (600 of 1000)', copiesToTest([400, 600, 800, 1000], 1000), [600, 800, 1000]);
  same('copiesToTest: a copy just under 60% is out (731 of 1220; 60% is 732)', copiesToTest([731, 732], 1220), [732, 1220]);
  same('copiesToTest: at most four, the latest', copiesToTest([200, 400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000], 2000), [1400, 1600, 1800, 2000]);
  same('copiesToTest: no copy kept yet -> only the end', copiesToTest([], 1220), [1220]);
  same('copiesToTest: unsorted, repeated and out-of-range input', copiesToTest([1200, 800, 800, 1300, 1000], 1220), [800, 1000, 1200, 1220]);
  same('copiesToTest: maxCopies=1 is the end of practice', copiesToTest([800, 1000], 1220, { maxCopies: 1 }), [1220]);
}

// ---- trainPlan ----------------------------------------------------------------------------------------
{
  const base = { startSteps: 1000, updates: 1220, batch: 2048 };
  same('trainPlan: nothing done -> one leg of everything, full learning rate, the warm-up',
    trainPlan({ ...base, steps: 1000 }), { done: false, doneUpdates: 0, remaining: 1220, leg: 1220, lr: 5e-5, lrEnd: 0, warmup: 30, totalSteps: 2498560 });
  const at400 = trainPlan({ ...base, steps: 1000 + 400 * 2048 });
  check('trainPlan: 400 of 1220 done -> 820 left, 1679360 steps, no warm-up', at400.doneUpdates === 400 && at400.remaining === 820 && at400.leg === 820 && at400.totalSteps === 1679360 && at400.warmup === 0 && !at400.done, JSON.stringify(at400));
  check('trainPlan: ... at 5e-5 x 820/1220 = 3.36066e-5, ending at 0', Math.abs(at400.lr - 3.360655737704918e-5) < 1e-18 && at400.lrEnd === 0, `${at400.lr}`);
  const fit = trainPlan({ ...base, steps: 1000 + 400 * 2048, minutesLeft: 17, updatesPerMinute: 30 });
  check('trainPlan: 17 minutes at 30 updates a minute -> a leg of 510, ending at 5e-5 x 310/1220', fit.leg === 510 && fit.totalSteps === 1044480 && Math.abs(fit.lrEnd - 5e-5 * 310 / 1220) < 1e-18 && fit.remaining === 820, JSON.stringify(fit));
  check('trainPlan: a save between updates counts only whole updates', trainPlan({ ...base, steps: 1000 + 400 * 2048 + 2047 }).doneUpdates === 400);
  const done = trainPlan({ ...base, steps: 1000 + 1220 * 2048 });
  check('trainPlan: all 1220 done -> done, nothing to run', done.done && done.leg === 0 && done.remaining === 0 && done.totalSteps === 0);
  check('trainPlan: one update short is not done', trainPlan({ ...base, steps: 1000 + 1219 * 2048 }).done === false && trainPlan({ ...base, steps: 1000 + 1219 * 2048 }).leg === 1);
  check('trainPlan: more than the round done -> done, not negative', (({ done: d, remaining, leg }) => d && remaining === 0 && leg === 0)(trainPlan({ ...base, steps: 1000 + 1300 * 2048 })));
  check('trainPlan: no time left (negative minutes) -> a leg of 0, not done', (({ done: d, leg, totalSteps }) => !d && leg === 0 && totalSteps === 0)(trainPlan({ ...base, steps: 1000, minutesLeft: -2 })));
  // The critic warm-up. rl/train_ppo.py freezes the policy while its own
  // update number is <= --critic-warmup, counted from the start of the
  // process. A round interrupted at update 20 (the checkpoint is written
  // every 10 updates) therefore still owes 10 warm-up updates.
  check('trainPlan: interrupted at update 20 of a 30-update warm-up -> the remaining 10, not none', trainPlan({ ...base, steps: 1000 + 20 * 2048 }).warmup === 10, `warmup ${trainPlan({ ...base, steps: 1000 + 20 * 2048 }).warmup}`);
  check('trainPlan: interrupted at update 30 or later -> no warm-up left', trainPlan({ ...base, steps: 1000 + 30 * 2048 }).warmup === 0 && trainPlan({ ...base, steps: 1000 + 40 * 2048 }).warmup === 0);

  // The learning rate over a round cut into legs must be the round's single
  // straight line. The trainer's own rule (rl/train_ppo.py): in a process of
  // n updates, update u (1-based) uses lr + (lr_end - lr) * (u - 1) / n.
  const trainer = (lr, lrEnd, n) => Array.from({ length: n }, (_, i) => lr + (lrEnd - lr) * i / n);
  const whole = trainer(5e-5, 0, 1220);
  for (const cuts of [[400], [10, 520, 1030], [1, 2, 1219]]) {
    const stitched = [];
    let stepsNow = 1000;
    for (const stop of [...cuts, 1220]) {
      // A leg that the time limit cuts at update `stop` of the round.
      const want = stop - stitched.length;
      const plan = trainPlan({ ...base, steps: stepsNow, minutesLeft: want, updatesPerMinute: 1 });
      // The driver passes the two rates through toPrecision(6).
      stitched.push(...trainer(Number(plan.lr.toPrecision(6)), Number(plan.lrEnd.toPrecision(6)), plan.leg));
      stepsNow += plan.totalSteps;
    }
    const worst = Math.max(...whole.map((v, i) => Math.abs(v - stitched[i]) / 5e-5));
    check(`trainPlan: legs ending at updates ${cuts.join(', ')} give the uninterrupted round's learning rate at every one of 1220 updates (to 6 digits)`,
      stitched.length === 1220 && worst < 2e-6, `${stitched.length} updates, worst relative difference ${worst}`);
  }
}

// ---- concludeRound ----------------------------------------------------------------------------------------
{
  same('concludeRound: a gain of exactly minGain (10 ms) pays', concludeRound({ bestFrames: 21907, lapFrames: 21897, strikes: 1 }), { gain: 10, paid: true, strikes: 0, stop: false });
  same('concludeRound: 9 ms does not pay: one strike', concludeRound({ bestFrames: 21907, lapFrames: 21898, strikes: 0 }), { gain: 9, paid: false, strikes: 1, stop: false });
  same('concludeRound: a second round in a row that does not pay stops the track', concludeRound({ bestFrames: 21907, lapFrames: 21898, strikes: 1 }), { gain: 9, paid: false, strikes: 2, stop: true });
  same('concludeRound: a slower lap has a negative gain', concludeRound({ bestFrames: 21907, lapFrames: 21913, strikes: 0 }), { gain: -6, paid: false, strikes: 1, stop: false });
  same('concludeRound: no lap at all counts as a round that did not pay', concludeRound({ bestFrames: 21907, lapFrames: null, strikes: 0 }), { gain: null, paid: false, strikes: 1, stop: false });
  same('concludeRound: no lap, second strike -> stop', concludeRound({ bestFrames: 21907, lapFrames: null, strikes: 1 }), { gain: null, paid: false, strikes: 2, stop: true });
  same('concludeRound: a paying round clears the strikes', concludeRound({ bestFrames: 34689, lapFrames: 34500, strikes: 1 }), { gain: 189, paid: true, strikes: 0, stop: false });
  same('concludeRound: patience=1 stops on the first round that does not pay', concludeRound({ bestFrames: 100, lapFrames: 100, strikes: 0, patience: 1 }), { gain: 0, paid: false, strikes: 1, stop: true });
  same('concludeRound: patience=3 needs three', [0, 1, 2].map((strikes) => concludeRound({ bestFrames: 100, lapFrames: 100, strikes, patience: 3 }).stop), [false, false, true]);
  same('concludeRound: minGain=6 makes a 6 ms gain pay, minGain=7 does not', [6, 7].map((minGain) => concludeRound({ bestFrames: 21913, lapFrames: 21907, strikes: 0, minGain }).paid), [true, false]);
}

// ---- chooseExamples -----------------------------------------------------------------------------------------
{
  const laps = [{ file: 'r1', frames: 21913 }, { file: 'r0', frames: 21907 }, { file: 'r2', frames: 21957 }, { file: 'r3', frames: 21958 }, { file: 'r4', frames: 21930 }];
  const names = (list) => list.map((l) => l.file).join();
  const copy = JSON.stringify(laps);
  check('chooseExamples: by default only the fastest lap of any round', names(chooseExamples(laps)) === 'r0');
  check('chooseExamples: extras are the next fastest, fastest first, capped at extraLaps', names(chooseExamples(laps, { extraLaps: 2 })) === 'r0,r1,r4');
  check('chooseExamples: exactly 50 ms slower is in, 51 ms is out', names(chooseExamples(laps, { extraLaps: 9 })) === 'r0,r1,r4,r2');
  check('chooseExamples: extraWithin=5 leaves the best alone', names(chooseExamples(laps, { extraLaps: 9, extraWithin: 5 })) === 'r0');
  check('chooseExamples: the best lap listed twice is not its own extra', names(chooseExamples([{ file: 'a', frames: 5 }, { file: 'a', frames: 5 }, { file: 'b', frames: 6 }], { extraLaps: 5 })) === 'a,b');
  check('chooseExamples: the list given is left in its order', JSON.stringify(laps) === copy);
  check('chooseExamples: one lap', names(chooseExamples([{ file: 'a', frames: 5 }], { extraLaps: 2 })) === 'a');
}

// ---- resultsText -----------------------------------------------------------------------------------------------
{
  check('seconds: 21907 -> "21.907", 22000 -> "22.000", nothing -> "-"', seconds(21907) === '21.907' && seconds(22000) === '22.000' && seconds(null) === '-' && seconds(undefined) === '-');
  const state = {
    track: 'desert4', best: { file: 'runs/rollout_desert4.recording.json', frames: 21907 }, strikes: 1, stopped: null,
    rounds: [
      { n: 1, done: true, startLap: { frames: 21907 }, picked: { copy: 1220, finishes: 1, of: 1 }, ownFrames: 22067, lap: { frames: 22004 }, gain: -97 },
      { n: 2, done: true, startLap: { frames: 21907 }, picked: { copy: 800, finishes: 9, of: 10 }, ownFrames: 21990, lap: { frames: 21718 }, gain: 189 },
      { n: 3, done: false, startLap: { frames: 21718 } },
    ],
  };
  const text = resultsText(state).split('\n');
  check('resultsText: the README\'s row for round 1, character for character', text.includes('    1      21.907 s        c1220       1/1      22.067 s      22.004 s        -97'), text.join('\n'));
  check('resultsText: a gain is shown with "+"', text.includes('    2      21.907 s         c800      9/10      21.990 s      21.718 s       +189'), text.join('\n'));
  check('resultsText: a round that is not complete has no row', !text.some((l) => /^\s+3\s/.test(l)));
  check('resultsText: names the best lap and the strikes', text[1] === 'fastest verified lap: 21.907 s  runs/rollout_desert4.recording.json' && text[2] === 'rounds in a row that did not pay: 1');
  check('resultsText: a stopped track says why', resultsText({ ...state, stopped: 'because' }).split('\n')[2] === 'stopped: because');
  const header = text.find((l) => l.startsWith('round '));
  const first = text[text.indexOf(header) + 1];
  check('resultsText: every column ends under its heading', ['round', 'starting lap', 'copy picked', 'finishes', 'policy alone', 'searched lap', 'gain (ms)'].every((h) => /\S/.test(first[header.indexOf(h) + h.length - 1]) && (first[header.indexOf(h) + h.length] ?? ' ') === ' '), `${header}\n${first}`);
}
finish();
