// driveLap() on hand-built worlds (toy_env.mjs), no simulator: the failure
// rule, the choice among continuations, the back-up rule, the save-state
// bookkeeping and the tick count, each against values worked out by hand
// (the working is in the comment above each case).
//
//   node ideas/g2-4-lookahead-driving/tests/test_logic.mjs
import { driveLap, DEFAULTS } from '../lookahead.mjs';
import { createRng } from '../../shared/policy.mjs';
import { ToyEnv, toyPolicy, replayToy } from './toy_env.mjs';
import { check, same, finish } from './check.mjs';

const S = [0, 0, 1, 0, 0, 0], L = [1, 0, 1, 0, 0, 0], R = [2, 0, 1, 0, 0, 0];
const times = (n, d) => Array.from({ length: n }, () => d);

/** Run one lap on a fresh world and add the facts every case checks. */
async function run(world, options) {
  const env = new ToyEnv(world);
  const lap = await driveLap(env, toyPolicy, options);
  return { env, lap };
}

/** The invariants that must hold whatever the world: the committed decisions
 *  are what the car really did, they replay to the same end, the tick count
 *  is every tick stepped, and no save state is left behind. */
async function invariants(name, world, { env, lap }) {
  check(same(env.history, lap.decisions), `${name}: the committed decisions are the simulator's actual history`,
    `history ${JSON.stringify(env.history.map((d) => d[0]))} committed ${JSON.stringify(lap.decisions.map((d) => d[0]))}`);
  const again = await replayToy({ ...world, frames: 0 }, lap.decisions);
  check(again.frames === lap.tick && again.reason === lap.reason && again.finishFrames === lap.finishFrames,
    `${name}: the committed decisions driven again from the start end the same way (tick ${lap.tick}, ${lap.reason})`,
    `again ${JSON.stringify(again)}`);
  check(lap.simTicks === env.count.ticks, `${name}: simTicks (${lap.simTicks}) is every tick stepped (${env.count.ticks} counted here)`);
  check(env.leaked === 0, `${name}: every save state was dropped (${env.leaked} left)`);
}

// --- defaults -----------------------------------------------------------------
check(same({ ...DEFAULTS, value: null }, {
  mode: 'lazy', horizon: 40, every: 10, force: [4, 10], samples: 6, sampleFor: 20, temperature: 1,
  score: 'reward', value: null, slowShare: 0.4, back: 6, maxBackups: 30, sample: false, seed: 1,
}), 'DEFAULTS are the settings the README reports (lazy, horizon 40, every 10, force 4 and 10, 6 samples, back 6)');

// --- A. nothing goes wrong ----------------------------------------------------
// Road of 25, no walls. Plain: 25 x straight; the finish lands 30 ticks into
// block 25, so the lap is 24 x 50 + 30 = 1230 ticks and that is all it costs.
{
  const world = { length: 25 };
  const r = await run(world, { mode: 'plain' });
  check(r.lap.finished && r.lap.finishFrames === 1230 && same(r.lap.decisions, times(25, S)), 'A plain: 25 straight decisions, finished on tick 1230');
  check(r.lap.simTicks === 1230, 'A plain: costs exactly its own 1230 ticks');
  check(r.lap.fraction === 1 && r.lap.progress === 25 && r.lap.tick === 1230, 'A plain: progress, fraction and tick are the end of the lap');
  await invariants('A plain', world, r);
}
// Lazy, horizon 8, every 4: replans at 0, 4, 8, 12, 16 try 8 decisions (400
// ticks) and commit 4 (200); the one at 20 reaches the finish in 5 decisions
// (230 ticks) and commits all 5 (230). 5 x 600 + 460 = 3460 ticks, 6 replans,
// 2 rewinds each (try-out, commit).
{
  const world = { length: 25 };
  const r = await run(world, { mode: 'lazy', horizon: 8, every: 4, force: [2], samples: 0 });
  check(r.lap.finished && r.lap.finishFrames === 1230 && same(r.lap.decisions, times(25, S)), 'A lazy: the same lap as plain when the policy never fails');
  check(r.lap.replans === 6 && r.lap.troubled === 0 && r.lap.rescued === 0 && r.lap.deadEnds === 0 && r.lap.backups === 0 && same(r.lap.picks, { policy: 6 }),
    'A lazy: 6 replans, none troubled, 6 policy picks', JSON.stringify(r.lap));
  check(r.lap.simTicks === 3460, `A lazy: 3460 ticks by hand, reported ${r.lap.simTicks}`);
  check(r.env.count.rewinds === 12 && r.env.count.marks === 6, `A lazy: 6 marks, 12 rewinds (got ${r.env.count.marks}, ${r.env.count.rewinds}): no alternatives tried`);
  await invariants('A lazy', world, r);
}
// Full, same world: every replan tries the policy and all 9 forced
// alternatives. All score the same, so the policy's own stays (ties do not
// replace it). 5 x (10 x 400 + 200) + 10 x 230 + 230 = 23530 ticks.
{
  const world = { length: 25 };
  const r = await run(world, { mode: 'full', horizon: 8, every: 4, force: [2], samples: 0 });
  check(same(r.lap.decisions, times(25, S)) && same(r.lap.picks, { policy: 6 }), 'A full: on equal scores the policy\'s own continuation is kept');
  check(r.env.count.rewinds === 6 * 11, `A full: 1 + 9 try-outs and a commit per replan (66 rewinds, got ${r.env.count.rewinds})`);
  check(r.lap.simTicks === 23530, `A full: 23530 ticks by hand, reported ${r.lap.simTicks}`);
  await invariants('A full', world, r);
}
// The number of alternatives with the default lists: 2 hold lengths x 3
// steerings x 3 pedal states + 6 samples = 24, so a full replan is 25 try-outs
// and a commit.
{
  const env = new ToyEnv({ length: 12 });
  const lap = await driveLap(env, toyPolicy, { mode: 'full', horizon: 4, every: 12 });
  check(env.count.rewinds === 26 * lap.replans, `defaults give 24 alternatives (26 rewinds per full replan, got ${env.count.rewinds} at ${lap.replans} replans)`);
}

// --- B. a wall the policy drives into ------------------------------------------
// Road of 20, wall in the middle lane at position 6. Replan at 0: the policy
// ends 'off track' on decision 6. Alternatives in order: steering 0 (three
// pedal states) all hit it; 'left for 2' is the first to survive 8 decisions
// (reward 8); the others that survive also score 8 and do not replace it.
// Committed: L L S S, then the policy in the left lane to the finish:
// 20 decisions, 19 x 50 + 30 = 980 ticks.
// Ticks: (6 + 3 x 6 + 6 x 8) x 50 = 3600, commit 200; replans at 4 and 8:
// 600 each; replan at 12 reaches the finish: 380 + 380. Total 5760.
{
  const world = { length: 20, walls: ['6:0'] };
  const plain = await run(world, { mode: 'plain' });
  check(!plain.lap.finished && plain.lap.reason === 'off track' && plain.lap.decisions.length === 6 && plain.lap.progress === 6,
    'B plain: ends off track at position 6');
  check(Math.abs(plain.lap.fraction - 6 / 20) < 1e-12, 'B plain: fraction is 6 / 20');
  const r = await run(world, { mode: 'lazy', horizon: 8, every: 4, force: [2], samples: 0 });
  check(r.lap.finished && r.lap.finishFrames === 980 && same(r.lap.decisions, [L, L, ...times(18, S)]), 'B lazy: left for two decisions, then straight, finished on tick 980',
    JSON.stringify(r.lap.decisions.map((d) => d[0])));
  check(r.lap.replans === 4 && r.lap.troubled === 1 && r.lap.rescued === 1 && r.lap.deadEnds === 0 && r.lap.backups === 0 && same(r.lap.picks, { force: 1, policy: 3 }),
    'B lazy: 4 replans, 1 troubled and rescued, picks 1 forced + 3 policy', JSON.stringify(r.lap));
  check(r.lap.simTicks === 5760, `B lazy: 5760 ticks by hand, reported ${r.lap.simTicks}`);
  check(r.env.count.rewinds === 11 + 3 * 2, `B lazy: alternatives only at the troubled replan (17 rewinds, got ${r.env.count.rewinds})`);
  await invariants('B lazy', world, r);
}
// Same wall, the right lane pays 0.5 more per decision. By reward the right
// lane wins (12 against 8) although it is tried later; by progress all
// survivors are level and the first one (left) stays.
{
  const world = { length: 20, walls: ['6:0'], laneBonus: { '-1': 0.5 } };
  const reward = await run(world, { mode: 'lazy', horizon: 8, every: 4, force: [2], samples: 0, score: 'reward' });
  check(same(reward.lap.decisions, [R, R, ...times(18, S)]), 'B score=reward: the survivor with the larger summed reward is committed (right lane)',
    JSON.stringify(reward.lap.decisions.map((d) => d[0])));
  const progress = await run(world, { mode: 'lazy', horizon: 8, every: 4, force: [2], samples: 0, score: 'progress' });
  check(same(progress.lap.decisions, [L, L, ...times(18, S)]), 'B score=progress: survivors level on progress, the first tried stays (left lane)');
  // score=value: discounted reward + 0.995^8 x value(final obs). A value of
  // 100 for the left lane: left = 7.86 + 96.07, right = 11.79, so left wins.
  const value = await run(world, { mode: 'lazy', horizon: 8, every: 4, force: [2], samples: 0, score: 'value', value: (obs) => (obs[1] === 1 ? 100 : 0) });
  check(same(value.lap.decisions, [L, L, ...times(18, S)]), 'B score=value: discounted reward plus the value at the horizon decides (left lane)');
  let threw = false;
  try { await run(world, { score: 'value' }); } catch { threw = true; }
  check(threw, 'score=value without a value function is refused');
  await invariants('B score=reward', world, reward);
}

// --- C. the "too slow" rule, at its boundary ------------------------------------
// The reference speed is 100 everywhere; slowShare 0.5 makes the limit exactly
// 50. Horizon 8 from the start ends at position 8, middle lane. A reading of
// 49.99 there fails the policy's continuation (no cut-off by the environment,
// only the speed); exactly 50 does not (the rule is "slower than").
{
  const options = { mode: 'lazy', horizon: 8, every: 4, force: [2], samples: 0, slowShare: 0.5 };
  const slow = await run({ length: 20, slow: { '8:0': 49.99 } }, options);
  check(slow.lap.troubled === 1 && slow.lap.rescued === 1 && same(slow.lap.decisions, [L, L, ...times(18, S)]),
    'C: 49.99 km/h at the horizon against a limit of 50 counts as failed, and the left lane is taken instead', JSON.stringify(slow.lap));
  const edge = await run({ length: 20, slow: { '8:0': 50 } }, options);
  check(edge.lap.troubled === 0 && same(edge.lap.decisions, times(20, S)), 'C: exactly 50 km/h does not count as failed');
  // A slow reading that is not at the horizon is not looked at.
  const earlier = await run({ length: 20, slow: { '7:0': 1 } }, options);
  check(earlier.lap.troubled === 0, 'C: only the speed at the end of the try-out is judged (a slow reading one decision earlier is ignored)');
}

// --- D. dead end and backing up ---------------------------------------------------
// Road of 14. At position 10 only the LEFT lane is open, and from position 4
// on the lane cannot be changed. Horizon 4, every 2: the replans at 0, 2 and
// 4 see nothing wrong and commit straight. At 6 the wall is in view and
// nothing survives (10 try-outs x 4 decisions): a dead end.
//   back 1 (mark at 4, horizon 6): 10 try-outs x 6, all fail (lane is stuck)
//   back 2 (mark at 2, horizon 8): 'left for 2' survives; the three 'right'
//     ones end in the wall at 10 like the straight ones (10 try-outs x 8)
// The decisions committed since position 2 are taken back, L L is committed
// from there, and the lap finishes: S S L L + 10 x S = 14 decisions, 680 ticks.
// Ticks: 3 x 300 + 2000 + 3000 + 4000 + 100 + 3 x 300 + 180 + 180 = 11260.
const dead = { length: 14, walls: ['10:0', '10:-1'], sticky: [4, 10] };
{
  const r = await run(dead, { mode: 'lazy', horizon: 4, every: 2, force: [2], samples: 0 });
  check(r.lap.finished && r.lap.finishFrames === 680 && same(r.lap.decisions, [S, S, L, L, ...times(10, S)]),
    'D: backs up two replan points, commits left there, finishes on tick 680', JSON.stringify(r.lap.decisions.map((d) => d[0])));
  check(r.lap.replans === 8 && r.lap.troubled === 1 && r.lap.rescued === 0 && r.lap.deadEnds === 1 && r.lap.backups === 1 && same(r.lap.picks, { policy: 7, force: 1 }),
    'D: 8 replans, 1 dead end, 1 back-up, picks 7 policy + 1 forced', JSON.stringify(r.lap));
  check(r.lap.simTicks === 11260, `D: 11260 ticks by hand, reported ${r.lap.simTicks}`);
  await invariants('D', dead, r);
}
// back = 2 keeps exactly the three marks that case needs; back = 1 keeps two,
// so the mark at position 2 is gone and the driver cannot get out: it commits
// the failing continuation, meets a second dead end at 8 and ends in the wall
// (10 straight decisions, tick 500, 2 dead ends, no back-up).
{
  const two = await run(dead, { mode: 'lazy', horizon: 4, every: 2, force: [2], samples: 0, back: 2 });
  check(two.lap.finished && two.lap.backups === 1, 'D back=2: three marks are kept, enough to back up two replan points');
  await invariants('D back=2', dead, two);
  for (const [name, extra] of [['back=1', { back: 1 }], ['maxBackups=0', { maxBackups: 0 }]]) {
    const r = await run(dead, { mode: 'lazy', horizon: 4, every: 2, force: [2], samples: 0, ...extra });
    check(!r.lap.finished && r.lap.reason === 'off track' && same(r.lap.decisions, times(10, S)) && r.lap.tick === 500,
      `D ${name}: cannot back up far enough, ends in the wall after 10 decisions`, JSON.stringify(r.lap));
    check(r.lap.deadEnds === 2 && r.lap.backups === 0 && r.lap.troubled === 2 && r.lap.rescued === 0 && r.lap.replans === 5,
      `D ${name}: 5 replans, 2 dead ends, 0 back-ups`, JSON.stringify(r.lap));
    await invariants(`D ${name}`, dead, r);
  }
}

// --- E. a finished continuation beats any survivor ----------------------------------
// Road of 12; in the left lane the finish is at 10. The middle lane pays 5
// more per decision, so on reward alone it would win. Full mode, horizon 12:
// the policy finishes in 580 ticks, 'left for 2' in 480 and is the first to
// do so. Lazy mode never looks: the policy's own continuation did not fail.
{
  const world = { length: 12, finishAt: { 1: 10 }, laneBonus: { 0: 5 } };
  const full = await run(world, { mode: 'full', horizon: 12, every: 4, force: [2], samples: 0 });
  check(full.lap.finished && full.lap.finishFrames === 480 && same(full.lap.decisions, [L, L, ...times(8, S)]) && full.lap.replans === 1,
    'E full: the earlier finish is committed whole (480 ticks), not the better-paid survivor', JSON.stringify(full.lap));
  await invariants('E full', world, full);
  const lazy = await run(world, { mode: 'lazy', horizon: 12, every: 4, force: [2], samples: 0 });
  check(lazy.lap.finishFrames === 580 && same(lazy.lap.decisions, times(12, S)), 'E lazy: the policy\'s own finishing continuation is taken (580 ticks)');
}

// --- F. sampling -----------------------------------------------------------------
// Plain, sampled: one draw per decision from createRng(seed), as written here
// independently. The toy policy turns a draw into a steering choice.
{
  const world = { length: 25 };
  const rng = createRng(7);
  const expected = Array.from({ length: 25 }, () => [Math.floor(rng() * 3), 0, 1, 0, 0, 0]);
  const r = await run(world, { mode: 'plain', sample: true, seed: 7 });
  check(same(r.lap.decisions, expected), 'F plain sample=1: the decisions are the seed\'s own stream, one draw per decision');
  const other = await run(world, { mode: 'plain', sample: true, seed: 8 });
  check(!same(other.lap.decisions, expected), 'F plain: another seed gives another lap');
  const top = await run(world, { mode: 'plain', sample: false, seed: 7 });
  check(same(top.lap.decisions, times(25, S)), 'F plain sample=0: top choices whatever the seed');
}
// Lazy with sampled alternatives only: the same seed gives the same lap; the
// samples are random for sampleFor decisions and the policy's top choice after.
{
  const world = { length: 20, walls: ['6:0'] };
  const options = { mode: 'lazy', horizon: 8, every: 4, force: [], samples: 6, sampleFor: 3 };
  const laps = [];
  for (const seed of [1, 1, 2, 3, 4, 5]) laps.push(await run(world, { ...options, seed }));
  check(same(laps[0].lap.decisions, laps[1].lap.decisions) && laps[0].lap.simTicks === laps[1].lap.simTicks, 'F lazy: the same seed twice gives the same lap and the same cost');
  check(new Set(laps.map((l) => JSON.stringify(l.lap.decisions))).size > 1, 'F lazy: the seed changes the sampled alternatives');
  check(laps.every((l) => l.lap.decisions.slice(3).every((d) => d[0] === 0)) || laps.some((l) => !l.lap.finished),
    'F lazy: a committed sample steers at most for its first sampleFor decisions');
  for (const [k, l] of laps.entries()) if (k !== 1) await invariants(`F lazy seed ${[1, 1, 2, 3, 4, 5][k]}`, world, l);
}

// --- G. the car is used up in the middle of a lap ------------------------------------
// The road of case A, on a car that starts 2000 ticks short of the 4.5 million
// budget. After the replans at 0, 4, 8 and 12 (600 ticks each) the car is over
// budget, so before the replan at 16 a new car is built and the 16 committed
// decisions are driven again (800 ticks). The lap itself must not change, and
// the cost is 2400 + 800 + 600 + 460 = 4260 ticks.
{
  const world = { length: 25, frames: 4_500_000 - 2000 };
  const r = await run(world, { mode: 'lazy', horizon: 8, every: 4, force: [2], samples: 0 });
  check(r.env.count.newCars === 1, `G: the fresh-car path ran (${r.env.count.newCars} new car)`);
  check(r.lap.finished && r.lap.finishFrames === 1230 && same(r.lap.decisions, times(25, S)), 'G: the lap is the same as on one car');
  check(r.lap.simTicks === 4260, `G: 4260 ticks by hand, reported ${r.lap.simTicks}`);
  await invariants('G', world, r);
}

finish();
