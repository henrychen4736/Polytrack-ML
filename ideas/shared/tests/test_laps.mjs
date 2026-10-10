// laps.mjs: the conversions, with hand-worked expected values. No simulator.
import { existsSync } from 'node:fs';
import {
  TRACKS, ROOT, humanLaps, loadLap, recordingToKeys, keysToRecording, keysToTimeline, timelineToKeys,
  recordingToTimeline, timelineToRecording, sameKeys, decisionsToKeys, keysToDecisions, LEAD, BLOCK_TICKS,
} from '../laps.mjs';
import { createRng } from '../../../sim/search.mjs';
import { checker } from './harness.mjs';

const { check, eq, throws, note } = checker();
const K = (s = '') => ({ up: s.includes('W'), right: s.includes('D'), down: s.includes('S'), left: s.includes('A'), reset: s.includes('R') });
const NONE = { up: [], right: [], down: [], left: [], reset: [] };

// ---- keys <-> timeline, by hand ------------------------------------------------
// tick:   0    1    2     3    4    5
// keys:   -    W    WA    W    -    D
const six = [K(), K('W'), K('WA'), K('W'), K(), K('D')];
eq(keysToTimeline(six), { up: [1, 4], right: [5], down: [], left: [2, 3], reset: [] }, 'keysToTimeline: 6 hand-written ticks give the flip ticks worked out by hand');
check(sameKeys(timelineToKeys({ up: [1, 4], right: [5], down: [], left: [2, 3], reset: [] }, 6), six), 'timelineToKeys: the same timeline gives back the 6 ticks');
// A key pressed on tick 0 flips at 0; a key never released has an odd number of flips.
eq(keysToTimeline([K('W'), K('W'), K('W')]), { ...NONE, up: [0] }, 'keysToTimeline: a key down from the first tick to the last is one flip at tick 0');
// Asking for more ticks than the timeline covers holds the last keys (CONTRACT: "after the last key, the last keys are held").
check(sameKeys(timelineToKeys({ ...NONE, up: [0] }, 5), Array(5).fill(K('W'))), 'timelineToKeys: past the last flip the last keys are held');
// Asking for fewer ticks cuts off; a flip exactly on tick `frames` is not included.
check(sameKeys(timelineToKeys({ ...NONE, up: [2] }, 2), [K(), K()]), 'timelineToKeys: a flip on tick `frames` itself is outside the result');
eq(keysToTimeline([]), NONE, 'keysToTimeline([]): five empty lists');
eq(timelineToKeys(NONE, 0), [], 'timelineToKeys(empty, 0): no ticks');
check(sameKeys(recordingToKeys(keysToRecording([]), 3), [K(), K(), K()]), 'an empty lap encodes to a recording that decodes to no keys held');

// ---- the recording string ------------------------------------------------------
{
  // Large gaps need all three bytes of the 24-bit delta; the reset key is a channel like any other.
  const timeline = { up: [0, 70000, 70001, 16_000_000], right: [255, 256, 65535, 65536], down: [], left: [1], reset: [3, 9] };
  eq(recordingToTimeline(timelineToRecording(timeline)), timeline, 'timeline -> recording string -> timeline is exact, with gaps of 1, 255, 256, 65536 and 16 million ticks');
  const rec = keysToRecording(six);
  check(typeof rec === 'string' && /^[A-Za-z0-9_-]+$/.test(rec), 'keysToRecording gives a base64url string without padding');
  check(sameKeys(recordingToKeys(rec, 6), six), 'keys -> recording -> keys is exact for the 6 hand-written ticks');
}

// ---- sameKeys --------------------------------------------------------------------
check(!sameKeys([K('W')], [K('W'), K('W')]), 'sameKeys: different lengths are not the same');
check(sameKeys([{ up: true }], [K('W')]), 'sameKeys: a missing key counts as released');
check(!sameKeys([K('W')], [K('WR')]), 'sameKeys: the reset key is compared too');
check(sameKeys([], []), 'sameKeys: two empty laps are the same');

// ---- decisions -> keys, by hand ----------------------------------------------------
{
  // One decision: steer LEFT from slice 2, W from slice 0, no S.
  const keys = decisionsToKeys([[1, 2, 1, 0, 0, 0]]);
  check(keys.length === LEAD + BLOCK_TICKS && LEAD === 1 && BLOCK_TICKS === 50, 'decisionsToKeys: one decision is 1 empty tick + 50 ticks');
  eq([keys[0], keys[1], keys[20], keys[21], keys[50]], [K(), K('W'), K('W'), K('WA'), K('WA')],
    'decisionsToKeys: tick 0 empty; W from tick 1 (slice 0); A from tick 21 (slice 2), not tick 20');
  check(decisionsToKeys([[1, 2, 1, 0, 0, 0]], { lead: 0 }).length === 50, 'decisionsToKeys lead=0: only the 50 ticks');
  // A second decision starts from the first one's targets: steer RIGHT from
  // slice 4, W stays (its slice is ignored), S from slice 1.
  const two = decisionsToKeys([[1, 2, 1, 0, 0, 0], [2, 4, 1, 3, 1, 1]]);
  eq([two[51], two[60], two[61], two[90], two[91], two[100]], [K('WA'), K('WA'), K('WAS'), K('WAS'), K('WDS'), K('WDS')],
    'decisionsToKeys: the second block starts from the first block\'s keys and switches S at tick 61, steering at tick 91');
  check(two.length === 101, 'decisionsToKeys: two decisions are 101 ticks');
  // `before`: what is held as the first decision begins.
  const from = decisionsToKeys([[0, 3, 0, 1, 0, 0]], { before: [2, 1, 0], lead: 0 });
  eq([from[0], from[9], from[10], from[29], from[30]], [K('WD'), K('WD'), K('D'), K('D'), K()], 'decisionsToKeys before=[right, W, -]: W released at slice 1, steering at slice 3');
  eq(decisionsToKeys([]), [K()], 'decisionsToKeys([]): just the one empty tick');
  eq(decisionsToKeys([], { lead: 0 }), [], 'decisionsToKeys([], lead 0): nothing');
}

// ---- keys -> decisions ----------------------------------------------------------------
{
  const r = keysToDecisions(decisionsToKeys([[1, 2, 1, 0, 0, 0], [2, 4, 1, 3, 1, 1]]));
  // The unchanged W in block 2 comes back with slice 0 (documented: stepBlock ignores it).
  eq(r.decisions, [[1, 2, 1, 0, 0, 0], [2, 4, 1, 0, 1, 1]], 'keysToDecisions inverts the two hand-written decisions (unchanged control: slice written as 0)');
  eq([r.wrongTicks, r.before], [0, [2, 1, 1]], 'keysToDecisions: 0 wrong ticks, and `before` is the last decision\'s targets');
  // Random block-driven laps: decisions -> keys -> decisions -> keys must be the same keys.
  const rng = createRng(11);
  let bad = 0;
  for (let n = 0; n < 50; n++) {
    const decisions = Array.from({ length: 30 }, () => [Math.floor(rng() * 3), Math.floor(rng() * 5), Math.floor(rng() * 2), Math.floor(rng() * 5), Math.floor(rng() * 2), Math.floor(rng() * 5)]);
    const keys = decisionsToKeys(decisions);
    const back = keysToDecisions(keys);
    if (back.wrongTicks !== 0 || !sameKeys(decisionsToKeys(back.decisions), keys)) bad++;
  }
  check(bad === 0, 'keysToDecisions is exact on 50 random block-driven stretches of 30 decisions (0 wrong ticks, same keys back)');

  // What a block decision cannot say, counted by hand.
  const block = (fill) => [K(), ...Array.from({ length: 50 }, (_, k) => fill(k))];
  // A 10-tick tap of W inside one block (offsets 10..19): the block ends as it began, so the tap is lost.
  let d = keysToDecisions(block((k) => (k >= 10 && k < 20 ? K('W') : K())));
  eq([d.decisions, d.wrongTicks], [[[0, 0, 0, 0, 0, 0]], 10], 'keysToDecisions: a 10 ms tap inside a block is lost, 10 wrong ticks');
  // W pressed at offset 14: nearest slice is 1 (offset 10), so 4 ticks are wrong.
  d = keysToDecisions(block((k) => (k >= 14 ? K('W') : K())));
  eq([d.decisions[0].slice(2, 4), d.wrongTicks], [[1, 1], 4], 'keysToDecisions: a press 14 ms into a block is rounded to slice 1, 4 wrong ticks');
  // Pressed at offset 46: would round to slice 5, which does not exist; slice 4 (offset 40), 6 wrong.
  d = keysToDecisions(block((k) => (k >= 46 ? K('W') : K())));
  eq([d.decisions[0].slice(2, 4), d.wrongTicks], [[1, 4], 6], 'keysToDecisions: a press 46 ms into a block goes to the last slice (4), 6 wrong ticks');
  // Both arrows held: left wins (as controlsToAction), so the D key is "wrong" nowhere by its own measure.
  d = keysToDecisions(block(() => K('AD')));
  eq([d.decisions[0][0], d.wrongTicks], [1, 0], 'keysToDecisions: left + right held together reads as left');
  // A lap that ends 20 ticks into a block: the short block is still one decision.
  d = keysToDecisions([K(), ...Array(70).fill(K('W'))]);
  eq([d.decisions.length, d.wrongTicks, decisionsToKeys(d.decisions).length], [2, 0, 101], 'keysToDecisions: 71 ticks give 2 decisions (the short last block filled by holding), 0 wrong ticks');
  eq(keysToDecisions([]).decisions, [], 'keysToDecisions([]): no decisions');
  eq(keysToDecisions([K()]).decisions, [], 'keysToDecisions(one empty tick): no decisions');
}

// ---- loading ----------------------------------------------------------------------------
check(TRACKS.length === 17 && TRACKS.every((t) => existsSync(new URL(`data/laps/${t}.json`, ROOT))), 'TRACKS: 17 names, each with data/laps/<track>.json');
{
  let ordered = true, tens = true, lengths = true;
  for (const track of TRACKS) {
    const laps = humanLaps(track);
    if (laps.length !== 10) tens = false;
    laps.forEach((lap, n) => {
      if (n && lap.frames < laps[n - 1].frames) ordered = false;
      if (lap.keys.length !== lap.frames || lap.track !== track || lap.source !== `human:${n}` || lap.finished !== true) lengths = false;
    });
  }
  check(tens, 'humanLaps: ten laps on each of the 17 tracks');
  check(ordered, 'humanLaps: fastest first on every track (so lap 0 is the best human lap we hold)');
  check(lengths, 'humanLaps: every lap has keys.length === frames, its track, source human:<n>, finished true');
}
eq(['desert4', 'winter2', 'summer4', 'summer1'].map((t) => humanLaps(t)[0].frames), [21750, 26830, 34105, 22131], 'best human laps: desert4 21750, winter2 26830, summer4 34105, summer1 22131 ms (the times the ideas compare against)');
eq(loadLap('fixture:summer1').frames, 22279, 'loadLap(fixture:summer1) is the 22.279 s fixture lap, slower than data/laps lap 0 (CONTRACT, "Which human lap")');
check(loadLap('human:3', 'desert4').frames === humanLaps('desert4')[3].frames, 'loadLap(human:3, track) is lap 3 of humanLaps');
await throws(() => loadLap('human:10', 'desert4'), 'loadLap(human:10): throws (there are ten laps, 0..9)');
await throws(() => humanLaps('nosuchtrack'), 'humanLaps of an unknown track throws');
{
  const a = loadLap({ finishFrames: 6, controlsPerTick: six, track: 'x' });
  eq([a.frames, a.keys.length, a.track, a.finished], [6, 6, 'x', true], 'loadLap({ finishFrames, controlsPerTick }): frames, keys, track taken from the object');
  const b = loadLap({ frames: 6, recording: a.recording }, 'y');
  check(sameKeys(b.keys, six) && b.track === 'y', 'loadLap({ frames, recording }): the same keys back; the track argument is used');
  const c = loadLap({ controlsPerTick: six, finished: false });
  eq([c.frames, c.finished], [6, false], 'loadLap of a crashed attempt: finished false, frames = number of keys');
  await throws(() => loadLap({ frames: 6 }), 'loadLap of an object in neither shape throws');
}
{
  // The two files verifyAndSave writes must load to the same lap.
  const a = loadLap('runs/g1-1-smoke_desert4.json'), b = loadLap('runs/g1-1-smoke_desert4.recording.json');
  check(a.frames === b.frames && sameKeys(a.keys, b.keys) && a.track === 'desert4' && b.track === 'desert4', `loadLap reads runs/x.json and runs/x.recording.json to the same ${a.frames} keys`);
}

// ---- the contract's numbers --------------------------------------------------------------
{
  const got = ['desert4', 'summer1', 'winter2'].map((t) => { const lap = humanLaps(t)[0]; return (100 * keysToDecisions(lap.keys).wrongTicks / lap.frames).toFixed(1); });
  eq(got, ['2.8', '1.7', '5.7'], 'CONTRACT: keysToDecisions gets 2.8% / 1.7% / 5.7% of ticks wrong on the best desert4 / summer1 / winter2 human laps');
  note('so block decisions do not replay a human lap, as the contract says');
}
