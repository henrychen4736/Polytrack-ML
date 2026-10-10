// The README's tables against the author's own logs (logs/*.jsonl, one line
// per attempt). No simulator. This checks that the numbers written up are the
// numbers recorded, and that the plain / lookahead comparison used the same
// seeds; it does not re-run them (test_sim_a/b re-run a sample).
//
//   node ideas/g2-4-lookahead-driving/tests/test_logs.mjs
import { readFileSync } from 'node:fs';
import { check, same, finish } from './check.mjs';

const rows = (file) => readFileSync(new URL(`../logs/${file}`, import.meta.url), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const of = (list, track) => list.filter((r) => r.track === track);
const seconds = (r) => +(r.finishFrames / 1000).toFixed(3);
const TRACKS = ['desert3', 'summer3', 'winter4'];

// --- the baseline: plain policy, sampled, seeds 10..19 ----------------------------
const plain = rows('plain_sample.jsonl');
check(TRACKS.every((t) => same(of(plain, t).map((r) => r.seed), [10, 11, 12, 13, 14, 15, 16, 17, 18, 19])) && plain.every((r) => r.mode === 'plain' && r.sample === true),
  'baseline: plain sampled attempts with seeds 10..19 on each of the three tracks');
const finishedPlain = Object.fromEntries(TRACKS.map((t) => [t, of(plain, t).filter((r) => r.finished).length]));
check(same(finishedPlain, { desert3: 1, summer3: 7, winter4: 1 }), `README: plain finishes 1, 7 and 1 of 10 (9 of 30) (logs: ${JSON.stringify(finishedPlain)})`);
const w4 = of(plain, 'winter4').filter((r) => !r.finished).map((r) => r.fraction);
check(w4.length === 9 && w4.filter((f) => f > 0.6665 && f < 0.6695).length === 8, 'README: eight of the nine winter4 failures end at 66.7 to 66.9%');
const top = rows('plain_top.jsonl');
check(top.every((r) => !r.finished) && same(TRACKS.map((t) => +(100 * of(top, t)[0].fraction).toFixed(1)), [17.7, 66.5, 36.4]),
  'README: the top-choice policy finishes none, ending at 17.7%, 66.5% and 36.4%');

// --- the lookahead driver with its defaults -------------------------------------------
const lazy = rows('lazy_back.jsonl');
check(lazy.every((r) => r.mode === 'lazy' && r.horizon === 40 && r.every === 10 && r.back === 6 && r.score === 'reward' && r.samples === 6 && same(r.force, [4, 10])),
  'the main table\'s runs used the defaults (lazy, horizon 40, every 10, back 6, reward)');
const seedsOf = (t) => of(lazy, t).map((r) => r.seed).sort((a, b) => a - b);
check(same(seedsOf('desert3'), [10, 11, 12, 13, 14, 15]) && same(seedsOf('summer3'), [10, 11, 12, 13, 14]) && same(seedsOf('winter4'), [10, 11, 12, 13, 14]),
  'lookahead seeds: desert3 10..15, summer3 10..14, winter4 10..14 (16 laps)');
check(lazy.length === 16 && lazy.every((r) => r.finished), 'README: the lookahead driver finished 16 of 16');
// The plain policy on exactly those seeds.
const plainSame = TRACKS.map((t) => of(plain, t).filter((r) => seedsOf(t).includes(r.seed)).filter((r) => r.finished).length);
check(same(plainSame, [1, 5, 0]), `README: the plain policy finished 1, 5 and 0 of the same seeds (6 of 16) (logs: ${plainSame.join(', ')})`);
const times = (t) => of(lazy, t).map(seconds).sort((a, b) => a - b);
check(same(times('winter4'), [19.819, 21.726, 21.749, 21.953, 25.069]) && times('desert3')[0] === 20.793 && times('desert3')[5] === 21.313 && same([...new Set(times('summer3'))], [21.502, 21.503]),
  'README: lap times of the table (winter4 19.819 .. 25.069, desert3 20.793 .. 21.313, summer3 21.502 / 21.503)');
const cost = (r) => r.simTicks / r.tick;
const span = (t) => { const c = of(lazy, t).map(cost); return [Math.min(...c), Math.max(...c)].map((x) => +x.toFixed(1)); };
const mean = lazy.reduce((s, r) => s + cost(r), 0) / lazy.length;
check(same(span('desert3'), [16.1, 31.8]) && same(span('summer3'), [9.3, 9.3]) && same(span('winter4'), [8.7, 38.9]) && Math.round(mean) === 17,
  `README: cost 16 to 32, 9.3, and 9 to 39 times the lap's ticks, mean 17 (logs: mean ${mean.toFixed(1)})`);
const s3 = of(plain, 'summer3').filter((r) => r.seed <= 14).map(seconds).sort((a, b) => a - b);
check(s3[2] === 21.071, `README: the median of the five plain summer3 finishers on the same seeds is 21.07 s (${s3[2]})`);
check(of(lazy, 'winter4').find((r) => r.seed === 11).backups === 4, 'README: winter4 seed 11 needed 4 back-ups');

// --- design comparisons ---------------------------------------------------------------------
const one = (file) => rows(file)[0];
check(seconds(one('spec_plain.jsonl')) === 22.061 && seconds(one('spec_lazy.jsonl')) === 22.061 && one('spec_lazy.jsonl').troubled === 0 && one('spec_lazy.jsonl').replans === 42
  && seconds(one('spec_full_progress.jsonl')) === 21.988 && seconds(one('spec_full_reward.jsonl')) === 22.006 && seconds(one('spec_full_value.jsonl')) === 22.042,
  'README: desert4 specialist, plain 22.061, lazy the same lap (0 of 42 replans in trouble), full 21.988 / 22.006 / 22.042');
check(+cost(one('spec_lazy.jsonl')).toFixed(1) === 4.8 && +cost(one('var_full.jsonl')).toFixed(1) === 73 && seconds(one('var_full.jsonl')) === 22.773,
  'README: lazy costs 4.8 x on a lap with no trouble; full on winter4 seed 10 took 22.773 s at 73 x');
const pair = (file, track) => of(rows(file), track).map(seconds);
check(same(pair('var_h20.jsonl', 'winter4'), [20.508, 20.289]) && same(pair('var_e20.jsonl', 'winter4'), [19.847, 19.996]) && same(pair('var_e20.jsonl', 'desert3'), [21.403, 22.506])
  && same(pair('var_progress.jsonl', 'winter4'), [21.389, 21.875]) && same(pair('var_value.jsonl', 'winter4'), [21.389, 25.08]),
  'README: the horizon / interval and score tables');
const early = rows('lazy.jsonl');
check(of(early, 'desert3').filter((r) => !r.finished).length === 2 && of(early, 'desert3').filter((r) => !r.finished).every((r) => Math.abs(r.fraction - 0.534) < 0.001)
  && seconds(one('lazy_h80.jsonl')) === 22.669 && +cost(one('lazy_h80.jsonl')).toFixed(1) === 39.8,
  'README: without backing up, desert3 seeds 11 and 12 ended at 53.4%; horizon 80 finished seed 11 in 22.669 s at 39.8 x');

// For the record, not a check: the wall time of single laps in these logs.
const long = [...lazy, ...rows('lazy_h80.jsonl'), ...rows('var_full.jsonl')].filter((r) => r.seconds > 120).map((r) => `${r.track} seed ${r.seed}: ${r.seconds.toFixed(0)} s`);
console.log(`     laps in the logs that took over 2 minutes of wall time: ${long.join('; ') || 'none'}`);
finish();
