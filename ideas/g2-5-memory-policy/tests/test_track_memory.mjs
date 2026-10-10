// TrackMemory (track_memory.mjs) on hand-built attempts. No simulator. Every
// expected number is worked out in the comment above its check.
//
//   node ideas/g2-5-memory-policy/tests/test_track_memory.mjs
import { TrackMemory, BIN, DOOM_MS, POINTS, PER_POINT, GLOBALS, MEM_SIZE } from '../track_memory.mjs';
import { check, same, finish } from './check.mjs';

const near = (a, b) => Math.abs(a - b) < 1e-6;
const list = (typed, from, to) => Array.from(typed.subarray(from, to));
/** Bins (by index) where an array is non-zero. */
const nonZero = (typed) => Array.from(typed).flatMap((v, b) => (v !== 0 ? [b] : []));
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, k) => from + k);

check(BIN === 2 && DOOM_MS === 3000 && POINTS === 21 && PER_POINT === 6 && GLOBALS === 4 && MEM_SIZE === 130,
  'constants: bins of 2 units, 3 s doom window, 21 stretches x 6 + 4 globals = 130 inputs');

// --- bins ----------------------------------------------------------------------
{
  const m = new TrackMemory(100);          // ceil(100 / 2) + 1 = 51 bins, 0..50
  check(m.count === 51 && new TrackMemory(101).count === 52 && new TrackMemory(0.5).count === 2, 'bin count is ceil(length / 2) + 1');
  const cases = [[0, 0], [1.999, 0], [2, 1], [3.999, 1], [4, 2], [99.99, 49], [100, 50], [1000, 50], [-0.4, 0], [-50, 0]];
  const wrong = cases.filter(([p, b]) => m.bin(p) !== b);
  check(wrong.length === 0, 'bin(): [0, 2) is bin 0, 2 opens bin 1, past the end and before the start are clamped', JSON.stringify(wrong));
}

// --- a crash, recorded in the right bin -------------------------------------------
// 11 samples 4 units and 50 ms apart: progress 0, 4, .. 40 at ticks 1, 51, ..
// 501, speed 100 + k km/h, lateral 0.1 k. Ends as a crash at 40 units.
// Furthest 40, so the impact is the last sample (tick 501); 3 s before that is
// before the attempt began, so nothing is a proven pass and every bin is
// doomed. Sample k is the first to reach bins 2k - 1 and 2k: bins 0..20 are
// visited once, the crash is in bin 20 = [40, 42), doomed speed of bins
// 2k - 1 and 2k is 100 + k.
{
  const m = new TrackMemory(1000);
  const trace = range(0, 10).map((k) => ({ progress: 4 * k, tick: 1 + 50 * k, speedKmh: 100 + k, lateral: 0.1 * k }));
  const r = m.commit(trace, { crashed: true });
  check(same(r, { crashBin: 20, doomedBins: 21, passBins: 0 }), 'crash at 40 units: commit reports crash bin 20, 21 doomed bins, no proven pass', JSON.stringify(r));
  check(same(nonZero(m.crashes), [20]) && m.crashes[20] === 1, 'crash at 40 units: one crash, in bin 20 and nowhere else');
  check(same(nonZero(m.visits), range(0, 20)) && m.visits[7] === 1, 'bins 0..20 visited once, nothing beyond');
  check(m.failSpeed[0] === 100 && m.failSpeed[1] === 101 && m.failSpeed[2] === 101 && m.failSpeed[19] === 110 && m.failSpeed[20] === 110 && near(m.failLat[19], 1.0) && near(m.failLat[3], 0.2),
    'each bin takes the speed and lateral offset of the first sample that reached it');
  check(nonZero(m.passSpeed).length === 0 && m.attempts === 1 && m.finishes === 0 && m.furthest === 40 && m.bestFinish === null, 'no surviving speed anywhere; 1 attempt, 0 finishes, furthest 40');
  // The same attempt ending 0.01 units earlier belongs to bin 19 = [38, 40).
  const m2 = new TrackMemory(1000);
  trace[10].progress = 39.99;
  check(m2.commit(trace, { crashed: true }).crashBin === 19, 'a crash at 39.99 units is in bin 19, at 40 in bin 20');
}

// --- "still going 3 s later" against "stopped within 3 s", at the boundary ------------
// Samples (progress, tick): (0, 0) (2, 999) (4, 1000) (6, 1001) (8, 4000),
// then a crash. The car stopped getting anywhere at tick 4000, so a sample
// counts as a proven pass only if its tick is below 4000 - 3000 = 1000:
//   bins 0, 1 (ticks 0, 999)   passed, still going 3 s later
//   bin 2 (tick 1000)          exactly 3 s before the stop: doomed
//   bins 3, 4                  doomed
const boundary = () => [[0, 0, 50], [2, 999, 60], [4, 1000, 70], [6, 1001, 80], [8, 4000, 90]].map(([progress, tick, speedKmh]) => ({ progress, tick, speedKmh, lateral: -1 }));
{
  const m = new TrackMemory(1000);
  const r = m.commit(boundary(), { crashed: true });
  check(same(r, { crashBin: 4, doomedBins: 3, passBins: 2 }), 'boundary: 2 proven bins, 3 doomed, crash in bin 4', JSON.stringify(r));
  check(same(list(m.passSpeed, 0, 6), [50, 60, 0, 0, 0, 0]) && same(list(m.failSpeed, 0, 6), [0, 0, 70, 80, 90, 0]),
    'boundary: a sample 3001 ms before the stop is a pass, one exactly 3000 ms before it is doomed');
  check(same(list(m.passTick, 0, 3), [0, 999, 0]) && m.passLat[1] === -1 && m.failLat[2] === -1, 'the pass keeps its lap clock and lateral offset, the doomed pass its lateral offset');
}
// 'stalled' is called 2 s after the car stops. The same attempt followed by 2 s
// of standing against the wall (progress 8.3, within a unit of the furthest
// point) must give the same map: the 3 s count back from the stop, not from
// the end of the episode.
{
  const m = new TrackMemory(1000), plain = new TrackMemory(1000);
  plain.commit(boundary(), { crashed: true });
  const stalled = [...boundary(), ...range(1, 40).map((k) => ({ progress: 8.3, tick: 4000 + 50 * k, speedKmh: 0, lateral: -1 }))];
  const r = m.commit(stalled, { crashed: true });
  check(same(r, { crashBin: 4, doomedBins: 3, passBins: 2 }) && same(list(m.passSpeed, 0, 6), list(plain.passSpeed, 0, 6)) && same(list(m.failSpeed, 0, 6), list(plain.failSpeed, 0, 6)),
    'stalled: 2 s of standing still after the stop do not move the doom window');
  // And a car that bounced back 5 units before the episode ended: the crash
  // is recorded at the furthest point it reached, not where it came to rest.
  const m3 = new TrackMemory(1000);
  const back = [...boundary(), { progress: 3, tick: 4050, speedKmh: 20, lateral: 0 }];
  check(m3.commit(back, { crashed: true }).crashBin === 4 && same(nonZero(m3.visits), range(0, 4)) && m3.visits[1] === 1,
    'a car that slid back after the impact: crash in the bin of the furthest point, and the bins it slid through are not counted again');
}
// Out of time ('time limit': neither crashed nor finished), same samples: the
// last 3 s are neither a proven pass nor doomed, only visited.
{
  const m = new TrackMemory(1000);
  const r = m.commit(boundary(), {});
  check(same(r, { crashBin: null, doomedBins: 0, passBins: 2 }) && same(list(m.passSpeed, 0, 6), [50, 60, 0, 0, 0, 0]) && nonZero(m.failSpeed).length === 0 && nonZero(m.crashes).length === 0
    && same(nonZero(m.visits), range(0, 4)), 'time limit: bins of the last 3 s are visited only, nothing doomed, no crash');
}
// Finished: everything is a proven pass, and the lap time is kept.
{
  const m = new TrackMemory(1000);
  const r = m.commit(boundary(), { finished: true, finishFrames: 4000 });
  check(same(r, { crashBin: null, doomedBins: 0, passBins: 5 }) && same(list(m.passSpeed, 0, 6), [50, 60, 70, 80, 90, 0]) && m.finishes === 1 && m.bestFinish === 4000,
    'finished: every bin driven is a proven pass; one finish with its lap time');
  m.commit(boundary(), { finished: true, finishFrames: 4500 });
  m.commit(boundary(), { finished: true, finishFrames: null });     // a part-way start has no lap time
  check(m.bestFinish === 4000 && m.finishes === 3 && m.attempts === 3 && m.visits[2] === 3, 'the fastest lap time is kept; attempts and visits add up');
  m.commit(boundary(), { finished: true, finishFrames: 3999 });
  check(m.bestFinish === 3999, 'a faster finish replaces the lap time');
}
check(same(new TrackMemory(100).commit([], { crashed: true }), { crashBin: null, doomedBins: 0, passBins: 0 }), 'an empty trace changes nothing');

// --- the bracket: highest surviving speed, lowest doomed speed ---------------------------
// One sample per bin. Attempts through bin 5 (10 units):
//   finished at 150 km/h, 2 left     -> pass 150
//   finished at 190 km/h, 3 right    -> pass 190 (higher: replaces, with its lateral and clock)
//   finished at 170 km/h             -> pass stays 190
//   crashed there at 230, 4 left     -> fail 230
//   crashed there at 210, 1 right    -> fail 210 (lower: replaces)
//   crashed there at 220             -> fail stays 210
//   crashed there at 0 km/h          -> stored as 1 (0 means "none known")
{
  const m = new TrackMemory(1000);
  const through = (speedKmh, lateral, tick) => [{ progress: 10, tick, speedKmh, lateral }, { progress: 12, tick: tick + 50, speedKmh, lateral }];
  m.commit(through(150, 2, 700), { finished: true });
  m.commit(through(190, -3, 600), { finished: true });
  m.commit(through(170, 0, 500), { finished: true });
  check(m.passSpeed[5] === 190 && m.passLat[5] === -3 && m.passTick[5] === 600, 'pass: the highest surviving speed is kept, with the lateral offset and clock of that attempt');
  const crashAt = (speedKmh, lateral) => [{ progress: 10, tick: 100, speedKmh, lateral }];
  m.commit(crashAt(230, 4), { crashed: true });
  m.commit(crashAt(210, -1), { crashed: true });
  m.commit(crashAt(220, 0), { crashed: true });
  check(m.failSpeed[5] === 210 && m.failLat[5] === -1 && m.crashes[5] === 3 && m.passSpeed[5] === 190, 'fail: the lowest doomed speed is kept, with its lateral offset; the pass is untouched; 3 crashes');
  m.commit(crashAt(0, 0), { crashed: true });
  check(m.failSpeed[5] === 1, 'a doomed pass at a standstill is stored as 1 km/h, not as "none known"');
  check(m.attempts === 7 && m.visits[5] === 7 && m.visits[4] === 0 && m.visits[6] === 3, 'a start at 10 units does not count the road before it as driven');
}

// --- what the policy is shown: one stretch, by hand -------------------------------------
// Bins 10 (20..22 units), 11, 12 hold:
//   bin 10: 1 visit,  pass 150 at +2 (clock 3000)
//   bin 11: 5 visits, 2 crashes, fail 90 at +5
//   bin 12: 2 crashes, pass 240 at -45, fail 60 at -1
// Edges 20, 26, 32, ...: stretch 0 is bins 10, 11, 12; stretch 1 is bins 13..15 (empty).
//   visits  max 5 -> min(5, 4) / 4 = 1        crashes 4 -> min(4, 3) / 3 = 1
//   pass    240 / 300 = 0.8, lateral -45 / 10 clipped to -3
//   fail    60 / 300 = 0.2, lateral -0.1
const filled = () => {
  const m = new TrackMemory(1000);
  m.visits[10] = 1; m.passSpeed[10] = 150; m.passLat[10] = 2; m.passTick[10] = 3000;
  m.visits[11] = 5; m.crashes[11] = 2; m.failSpeed[11] = 90; m.failLat[11] = 5;
  m.crashes[12] = 2; m.passSpeed[12] = 240; m.passLat[12] = -45; m.passTick[12] = 3500; m.failSpeed[12] = 60; m.failLat[12] = -1;
  return m;
};
const edgesFrom = (start, gap) => range(0, POINTS).map((k) => start + gap * k);
const closeTo = (got, expected) => got.length === expected.length && got.every((v, k) => near(v, expected[k]));
{
  const m = filled();
  const out = m.features(edgesFrom(20, 6), 0, new Float32Array(MEM_SIZE).fill(9));
  check(closeTo(list(out, 0, 6), [1, 1, 0.8, -3, 0.2, -0.1]), 'stretch over bins 10..12: most visits, summed crashes, highest pass and lowest fail with their own lateral offsets, clipped', JSON.stringify(list(out, 0, 6)));
  check(list(out, 6, 126).every((v) => v === 0), 'every other stretch is exactly zero (also where the output array held something before)');
  // Edges 20, 24, 28: stretch 0 is bins 10, 11 only; bin 12 belongs to stretch 1.
  //   stretch 0: visits 1 (5 capped at 4), crashes 2/3, pass 150/300 at +0.2, fail 90/300 at +0.5
  //   stretch 1: visits 0, crashes 2/3, pass 0.8 at -3, fail 0.2 at -0.1
  const narrow = m.features(edgesFrom(20, 4), 0, new Float32Array(MEM_SIZE));
  check(closeTo(list(narrow, 0, 6), [1, 2 / 3, 0.5, 0.2, 0.3, 0.5]) && closeTo(list(narrow, 6, 12), [0, 2 / 3, 0.8, -3, 0.2, -0.1]),
    'a stretch ends where the next begins: bin 12 is read by the second stretch only', JSON.stringify(list(narrow, 0, 12)));
  // Edges that do not sit on bin borders (21, 25, 29): stretch 0 still starts
  // with the bin the car is in (10) and stops before the bin of the next point (12).
  const odd = m.features(edgesFrom(21, 4), 0, new Float32Array(MEM_SIZE));
  check(closeTo(list(odd, 0, 6), [1, 2 / 3, 0.5, 0.2, 0.3, 0.5]) && closeTo(list(odd, 6, 12), [0, 2 / 3, 0.8, -3, 0.2, -0.1]), 'edges between bin borders: the same split');
  // Visits and crashes below their caps: 3 visits -> 0.75, 1 crash -> 1/3.
  const m2 = new TrackMemory(1000); m2.visits[10] = 3; m2.crashes[10] = 1;
  const few = m2.features(edgesFrom(20, 6), 0, new Float32Array(MEM_SIZE));
  check(closeTo(list(few, 0, 6), [0.75, 1 / 3, 0, 0, 0, 0]), 'visits read n / 4 and crashes n / 3 below their caps; unknown speeds read 0');
  // The offset argument: written from out[offset], nothing before it touched.
  const wide = m.features(edgesFrom(20, 6), 0, new Float32Array(352 + MEM_SIZE).fill(7), 352);
  check(list(wide, 0, 352).every((v) => v === 7) && closeTo(list(wide, 352, 358), [1, 1, 0.8, -3, 0.2, -0.1]), 'features() writes at the given offset and leaves the 352 numbers before it alone');
}

// --- a crash site is seen in exactly one stretch, wherever it is ----------------------------
// One crash in bin b, for every b the 21 stretches cover, read out with
// uneven edges (gap 6.3 units from 101.7). Each must light exactly one stretch.
{
  const edges = edgesFrom(101.7, 6.3);
  const firstBin = Math.floor(edges[0] / BIN), lastBin = Math.floor(edges[POINTS] / BIN) - 1;
  const bad = [];
  for (let b = firstBin - 2; b <= lastBin + 2; b++) {
    const m = new TrackMemory(1000);
    m.crashes[b] = 1;
    const out = m.features(edges, 0, new Float32Array(MEM_SIZE));
    const lit = range(0, POINTS - 1).filter((k) => out[PER_POINT * k + 1] > 0);
    const expected = b >= firstBin && b <= lastBin ? 1 : 0;
    if (lit.length !== expected) bad.push(`bin ${b}: ${lit.length} stretches`);
    // and it is the stretch whose edges contain the bin
    else if (expected && !(Math.floor(edges[lit[0]] / BIN) <= b && b < Math.max(Math.floor(edges[lit[0]] / BIN) + 1, Math.floor(edges[lit[0] + 1] / BIN)))) bad.push(`bin ${b}: wrong stretch ${lit[0]}`);
  }
  check(bad.length === 0, `a single crash in any of the bins ${firstBin}..${lastBin} ahead shows in exactly one stretch, and bins outside show in none`, bad.join('; '));
}
// Past the end of the track there is nothing to say.
{
  const m = new TrackMemory(100);       // bins 0..50; the last one starts at 100
  m.visits.fill(2); m.crashes.fill(1);
  const out = m.features(edgesFrom(90, 4), 0, new Float32Array(MEM_SIZE));
  // stretches 0, 1 (90..94, 94..98) and 2 (98..102, cut at the last bin) hold something; from edge 102 on, nothing
  check(out[0] === 0.5 && out[6] === 0.5 && out[12] === 0.5 && list(out, 18, 126).every((v) => v === 0), 'stretches beyond the end of the track are all zero');
}

// --- the four globals ----------------------------------------------------------------------------
{
  const m = filled();
  const g = (edge0, tick) => list(m.features(edgesFrom(edge0, 6), tick, new Float32Array(MEM_SIZE)), 126, 130);
  // attempts 3 -> 3/8; no finish; in bin 10 the best pass was at clock 3000:
  // now 5000 -> (5000 - 3000) / 2000 = +1 (behind); furthest 120 from 20 -> 1.0
  m.attempts = 3; m.furthest = 120;
  check(closeTo(g(20, 5000), [0.375, 0, 1, 1]), 'globals: 3 attempts = 0.375, no finish, 2 s behind the best pass = +1, 100 units known ahead = 1', JSON.stringify(g(20, 5000)));
  check(closeTo(g(20, 2000), [0.375, 0, -0.5, 1]) && closeTo(g(20, 20000), [0.375, 0, 3, 1]) && closeTo(g(20, -9000), [0.375, 0, -3, 1]), 'ahead of the best pass is negative; clipped to +-3');
  check(closeTo(g(22, 5000), [0.375, 0, 0, 0.98]), 'in a bin with no surviving pass the ahead / behind input is 0');
  m.attempts = 8; m.finishes = 2; m.furthest = 10;
  check(closeTo(g(20, 3000), [1, 1, 0, 0]), '8 attempts = 1, a finish = 1, on its best pass = 0, nothing known ahead = 0 (not negative)');
  m.attempts = 50; m.furthest = 900;
  check(closeTo(g(20, 3000), [1, 1, 0, 3]), 'attempts capped at 8, distance known ahead capped at 300 units');
}

// --- a first attempt, and clearing ------------------------------------------------------------------
{
  const m = new TrackMemory(1000);
  const zero = (mem, start, gap, tick) => Array.from(mem.features(edgesFrom(start, gap), tick, new Float32Array(MEM_SIZE).fill(5))).every((v) => v === 0);
  check(zero(m, 0, 2, 1) && zero(m, 333.3, 12.5, 17000) && zero(m, 990, 6, 25000), 'a memory with no attempt in it: all 130 inputs are exactly 0, at the start, mid-lap and at the end of the track');
  m.commit(boundary(), { crashed: true });
  m.commit(boundary(), { finished: true, finishFrames: 4000 });
  check(!zero(m, 0, 2, 1), 'after two attempts the inputs are not zero');
  m.clear();
  const arrays = [m.visits, m.crashes, m.passSpeed, m.passLat, m.passTick, m.failSpeed, m.failLat];
  check(arrays.every((a) => nonZero(a).length === 0) && m.attempts === 0 && m.finishes === 0 && m.bestFinish === null && m.furthest === 0 && zero(m, 0, 2, 1) && zero(m, 4, 3, 5000),
    'clear(): every array, the counters, the lap time and the furthest point are reset, and the inputs are all 0 again');
}

finish();
