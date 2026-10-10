// fine.mjs without a simulator: the two moves, the sub-tick measure and the
// small helpers, on hand-made timelines with the expected values worked out
// by hand; then the README's numbers against the data files in this folder.
import { readFileSync } from 'node:fs';
import { MOVABLE, listFlips, nudge, shiftTail, subTick, makePlane, better, parseArgs } from '../fine.mjs';
import { timelineToKeys, keysToTimeline } from '../../shared/laps.mjs';
import { checker } from '../../shared/tests/harness.mjs';

const { check, eq } = checker();
const T = (parts) => ({ up: [], right: [], down: [], left: [], reset: [], ...parts });
const frozen = (timeline) => JSON.stringify(timeline);

eq(MOVABLE, ['up', 'right', 'down', 'left'], 'MOVABLE: the four driving keys, not reset');

// ---- listFlips ---------------------------------------------------------------------
{
  const t = T({ up: [1, 400], left: [100, 150], right: [100], reset: [7] });
  eq(listFlips(t), [{ ch: 'up', i: 0, tick: 1 }, { ch: 'right', i: 0, tick: 100 }, { ch: 'left', i: 0, tick: 100 }, { ch: 'left', i: 1, tick: 150 }, { ch: 'up', i: 1, tick: 400 }],
    'listFlips: every flip of the four keys in order of tick, with its key and its index in that key\'s list; reset left out');
  eq(listFlips(T({})), [], 'listFlips of an empty lap: none');
}

// ---- nudge ---------------------------------------------------------------------------
{
  const t = T({ left: [100, 150, 300], up: [1] }), before = frozen(t);
  eq(nudge(t, 'left', 1, 7), T({ left: [100, 157, 300], up: [1] }), 'nudge(+7): that one flip moves 7 ticks later, nothing else');
  eq(nudge(t, 'left', 1, -49).left, [100, 101, 300], 'nudge(-49): may come to within one tick of the flip before it');
  eq([nudge(t, 'left', 1, -50), nudge(t, 'left', 1, -60)], [null, null], 'nudge that would reach or pass the flip before it on the same key: null');
  eq([nudge(t, 'left', 1, 149).left, nudge(t, 'left', 1, 150)], [[100, 299, 300], null], 'nudge towards the flip after it: one tick short is fine, reaching it is null');
  eq([nudge(t, 'up', 0, -1).up, nudge(t, 'up', 0, -2)], [[0], null], 'nudge of the first flip: tick 0 is allowed, before tick 0 is null');
  eq(nudge(t, 'left', 2, 5000).left, [100, 150, 5300], 'nudge of the last flip of a key is not limited upwards');
  eq(nudge(t, 'left', 0, 0), t, 'nudge by 0 is the same lap');
  check(frozen(t) === before && nudge(t, 'left', 1, 7).up !== t.up, 'nudge does not modify its input (the result shares no list with it)');
}

// ---- shiftTail -------------------------------------------------------------------------
{
  const t = T({ up: [1, 500], left: [100, 150, 300], right: [149, 400], reset: [200] }), before = frozen(t);
  eq(shiftTail(t, 150, -10), T({ up: [1, 490], left: [100, 140, 290], right: [149, 390], reset: [200] }),
    'shiftTail(from 150, -10): every flip of the four keys at or after tick 150 moves 10 earlier; flips before 150 (149!) and reset stay');
  eq(shiftTail(t, 150, 25), T({ up: [1, 525], left: [100, 175, 325], right: [149, 425], reset: [200] }), 'shiftTail(+25): the same, later');
  eq(shiftTail(t, 150, -49).left, [100, 101, 251], 'shiftTail(-49): the first shifted flip may come to within one tick of the unshifted one before it');
  eq(shiftTail(t, 150, -50), null, 'shiftTail that would bring a shifted flip onto an unshifted one of the same key: null');
  // Two shifted flips keep their spacing, so they never collide with each other.
  eq(shiftTail(T({ left: [100, 105] }), 100, -50).left, [50, 55], 'shiftTail: flips that both move keep their distance (no false refusal)');
  eq(shiftTail(T({ left: [5] }), 0, -6), null, 'shiftTail that would move a flip before tick 0: null');
  eq(shiftTail(t, 9999, -10), t, 'shiftTail from beyond the last flip changes nothing');
  eq(shiftTail(t, 0, 3), T({ up: [4, 503], left: [103, 153, 303], right: [152, 403], reset: [200] }), 'shiftTail(from 0): the whole lap moves');
  check(frozen(t) === before, 'shiftTail does not modify its input');
  // A tail shift of the last flip is that flip's nudge (refine.mjs relies on this to skip the duplicate).
  eq(shiftTail(t, 500, -4), nudge(t, 'up', 1, -4), 'shiftTail from the last flip of the lap equals the nudge of that flip');
  // In keys: before `from - |d|` nothing changes; from `from` on, the keys are the old keys d ticks later.
  const a = timelineToKeys(t, 700), b = timelineToKeys(shiftTail(t, 150, -10), 700);
  const key = (c) => `${+c.up}${+c.right}${+c.down}${+c.left}`;
  check(a.slice(0, 140).every((c, k) => key(c) === key(b[k])) && b.slice(150, 690).every((c, k) => key(c) === key(a[k + 160])),
    'shiftTail(-10) in per-tick keys: ticks 0..139 unchanged, and from tick 150 on the keys are the old keys of 10 ticks later');
}
// Both moves always give a valid timeline: random checks, round trip through per-tick keys.
{
  let seed = 12345, bad = 0, made = 0;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let n = 0; n < 400; n++) {
    const t = T({});
    for (const ch of MOVABLE) { let at = rnd(30); for (let k = rnd(6); k > 0; k--) { t[ch].push(at); at += 1 + rnd(40); } }
    const flips = listFlips(t);
    if (!flips.length) continue;
    const f = flips[rnd(flips.length)], d = rnd(41) - 20;
    for (const moved of [nudge(t, f.ch, f.i, d), shiftTail(t, f.tick, d)]) {
      if (!moved) continue;
      made++;
      const increasing = MOVABLE.every((ch) => moved[ch].every((x, i) => x >= 0 && (i === 0 || x > moved[ch][i - 1])));
      const count = MOVABLE.every((ch) => moved[ch].length === t[ch].length);
      if (!increasing || !count || frozen(keysToTimeline(timelineToKeys(moved, 400))) !== frozen(moved)) bad++;
    }
  }
  check(bad === 0 && made > 300, `nudge and shiftTail on 400 random timelines: all ${made} results have strictly increasing flips, the same number of flips, and survive timeline -> keys -> timeline`);
}

// ---- subTick, makePlane, better ---------------------------------------------------------------
{
  // Reference lap: on its finish tick the car is at x = 10, moving at 50 units/s along x.
  const plane = makePlane({ position: [10, 0, 0], velocity: [50, 0, 0] });
  eq(plane, { point: [10, 0, 0], normal: [1, 0, 0] }, 'makePlane: the reference car\'s finish position and its unit direction of travel');
  const result = (x, extra = {}) => ({ finished: true, finishFrames: 21907, position: [x, 3, 5], velocity: [50, 0, 20], ...extra });
  eq(subTick(plane, result(10)), 21907, 'subTick: a car on the plane on its finish tick scores exactly its finish tick');
  // 0.025 units past the plane at 0.05 units per tick = half a tick sooner.
  check(Math.abs(subTick(plane, result(10.025)) - 21906.5) < 1e-9, 'subTick: 0.025 units past the plane at 50 units/s is half a tick sooner (21906.5); sideways position and speed do not count');
  check(Math.abs(subTick(plane, result(9.99)) - 21907.2) < 1e-9, 'subTick: 0.01 units short of the plane is 0.2 ticks later');
  eq([subTick(plane, result(10, { finished: false })), subTick(plane, result(10, { velocity: null }))], [Infinity, Infinity], 'subTick: a lap that did not finish (or has no velocity) is Infinity');
  eq(subTick(plane, result(12, { velocity: [-50, 0, 0] })), 21907, 'subTick: a car not moving forwards through the plane falls back to the whole tick');
  eq(makePlane({ position: [1, 2, 3], velocity: [0, 3, 4] }).normal, [0, 0.6, 0.8], 'makePlane normalises the direction (3-4-5)');
}
eq([better({ frames: 10, fine: 10.9 }, { frames: 11, fine: 10.1 }), better({ frames: 11, fine: 10.1 }, { frames: 10, fine: 10.9 })], [true, false], 'better: fewer whole ticks wins whatever the sub-tick value says');
eq([better({ frames: 10, fine: 9.4 }, { frames: 10, fine: 9.5 }), better({ frames: 10, fine: 9.5 }, { frames: 10, fine: 9.5 }), better({ frames: 10, fine: 10 }, { frames: 10, fine: 10 })], [true, false, false],
  'better: on the same tick the smaller sub-tick time wins; equal is not better (so with ties off, the same finish tick is never accepted)');

// ---- parseArgs ------------------------------------------------------------------------------------
eq(parseArgs(['human:0', 'track=desert4', 'window=10', 'x']), { words: ['human:0', 'x'], opt: { track: 'desert4', window: '10' } }, 'parseArgs: bare words and key=value');
eq(parseArgs([]), { words: [], opt: {} }, 'parseArgs([]): nothing');

// ---- the README's smoothness numbers against the data files ------------------------------------------
{
  const read = (name) => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'));
  const searched = read('smoothness_desert4.json'), human = read('smoothness_human_desert4.json');
  const clean = (j) => j.flips.every((row) => { const zero = row.points.find((p) => p.d === 0); return zero && zero.frames === j.baseFrames; });
  check(clean(searched) && clean(human), 'smoothness data: in every row the unmoved lap (d = 0), driven from the save state, finishes on the input\'s own tick');
  eq([searched.baseFrames, searched.flips.length, searched.overall.window, (100 * searched.overall.lostFraction).toFixed(1), searched.overall.flipsWithGain], [21907, 16, 20, '58.5', 0],
    'README: searched lap 21907, 16 flips at d = -20..20, 58.5% of candidates lost the lap, no flip with a gain');
  eq(searched.flips.map((row) => [row.tick, row.lost]), [[91, 40], [2881, 0], [5361, 40], [7311, 40], [7861, 40], [9021, 40], [10251, 39], [11711, 39], [13311, 35], [14251, 31], [15601, 26], [17921, 4], [18581, 0], [19151, 9], [20691, 0], [21841, 0]],
    'README table: lost laps per flip of the searched lap (40, 0, 40, 40, 40, 40, 39, 39, 35, 31, 26, 4, 0, 9, 0, 0)');
  const row = (j, tick) => { const r = j.flips.find((x) => x.tick === tick); return r.points.filter((p) => Math.abs(p.d) <= 10).map((p) => (p.frames == null ? null : p.frames - j.baseFrames)); };
  eq(row(searched, 18581), [11, 7, 9, 14, 4, 4, 12, 10, 12, 11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'README: finish tick against d for flip 18581 of the searched lap');
  eq(row(searched, 20691), [9, 9, 9, 10, 10, 11, 10, 11, 11, 11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'README: the same for flip 20691');
  eq([human.baseFrames, human.flips.length, human.flips.map((r) => r.lost)], [21750, 10, [20, 20, 19, 20, 20, 20, 12, 9, 0, 0]], 'README: human lap, 10 flips; the six before 12.2 s lose the lap on 19 or 20 of 20 moves, 13534 and 17103 about half');
  eq(row(human, 18578), [20, 13, 14, 14, 13, 14, 1, 1, 1, 0, 0, -1, -1, -1, -2, -1, -2, -1, -4, -5, -6], 'README: finish tick against d for flip 18578 of the human lap (the one slope, with a 13 ms cliff at d = -5)');
  const gain = (tick) => { const r = human.flips.find((x) => x.tick === tick); return [r.bestD, r.bestGain]; };
  const [g1, g2] = [gain(13534), gain(17103)];
  check(g1[0] === -2 && Math.abs(g1[1] - 6.9) < 0.1 && g2[0] === 1 && Math.abs(g2[1] - 4.4) < 0.1, `README: best d of -2 (6.9 ms) at 13534 and +1 (4.4 ms) at 17103 (data: ${g1[1].toFixed(2)} and ${g2[1].toFixed(2)} ms by the sub-tick measure)`);
}
