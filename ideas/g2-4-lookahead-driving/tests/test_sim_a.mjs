// The lookahead driver on the real simulator, winter4 (a track the generalist
// was not trained on), one seed: determinism, the tick count, the baseline,
// the replay of the committed decisions, the game's Verify, and the README's
// headline numbers for this seed. One simulator.
//
//   node ideas/g2-4-lookahead-driving/tests/test_sim_a.mjs [seed]
import { readFileSync } from 'node:fs';
import { openBlockEnv, fromStart, roll } from '../../shared/block_rollout.mjs';
import { loadPolicy, createRng } from '../../shared/policy.mjs';
import { decisionsToKeys, sameKeys, ROOT } from '../../shared/laps.mjs';
import { verifyAndSave } from '../../shared/verify.mjs';
import { driveLap } from '../lookahead.mjs';
import { check, same, finish } from './check.mjs';

const seed = Number(process.argv[2] ?? 10);
const TRACK = 'winter4';
const policy = loadPolicy('rl/checkpoints/ppo_blkgen.best2.actor.bin');
const renv = await openBlockEnv(TRACK);

// Our own meter: the lap clock's advance over every block decision stepped,
// try-outs included. It does not use renv.env.frames, which is what the
// driver reports from.
let counted = 0;
const realStep = renv.stepBlock.bind(renv);
renv.stepBlock = async (decision) => {
  const before = renv.state.frames;
  const r = await realStep(decision);
  counted += renv.state.frames - before;
  return r;
};
const drive = async (options) => { counted = 0; const lap = await driveLap(renv, policy, options); return { ...lap, counted }; };

// --- the plain policy (the baseline) --------------------------------------------
const plain1 = await drive({ mode: 'plain', sample: true, seed });
const plain2 = await drive({ mode: 'plain', sample: true, seed });
check(same(plain1.decisions, plain2.decisions) && plain1.tick === plain2.tick && plain1.reason === plain2.reason,
  `plain, seed ${seed}, twice: the same attempt to the tick (${plain1.reason} at tick ${plain1.tick}, ${(100 * plain1.fraction).toFixed(1)}% of the line)`);
check(plain1.simTicks === plain1.counted, `plain: simTicks ${plain1.simTicks} = ticks counted here ${plain1.counted}`);
// The baseline written again with the shared roll(): sampled all the way from
// the seed's own stream, to the end of the episode.
const again = await roll(renv, await fromStart(renv), { policy, horizon: 100000, sampleUntil: Infinity, rng: createRng(seed) });
check(same(again.decisions, plain1.decisions) && again.tick === plain1.tick && again.reason === plain1.reason,
  'plain: identical to an independently written sampled rollout (same seed; stops where the environment ends the episode, as lookahead does)');
if (seed === 10) {
  check(!plain1.finished && plain1.fraction > 0.66 && plain1.fraction < 0.68,
    `README: the plain policy does not finish winter4 with seed 10 and stops near 66.8% (got ${plain1.reason} at ${(100 * plain1.fraction).toFixed(1)}%)`);
}

// --- the lookahead driver ---------------------------------------------------------
const lazy1 = await drive({ mode: 'lazy', seed });
const lazy2 = await drive({ mode: 'lazy', seed });
console.log(`     lazy seed ${seed}: ${lazy1.finished ? `finished ${lazy1.finishFrames}` : lazy1.reason}, ${lazy1.replans} replans, ${lazy1.troubled} troubled, ${lazy1.rescued} rescued, ` +
  `${lazy1.deadEnds} dead ends, ${lazy1.backups} back-ups, ${lazy1.simTicks} ticks = ${(lazy1.simTicks / lazy1.tick).toFixed(1)}x, ${lazy1.seconds.toFixed(0)} s wall`);
check(same(lazy1.decisions, lazy2.decisions) && lazy1.finishFrames === lazy2.finishFrames && lazy1.tick === lazy2.tick,
  `lazy, seed ${seed}, twice: the same lap to the tick (${lazy1.finishFrames})`);
check(lazy1.simTicks === lazy2.simTicks && same(lazy1.picks, lazy2.picks), 'lazy, twice: the same cost and the same picks');
check(lazy1.simTicks === lazy1.counted, `lazy: simTicks ${lazy1.simTicks} = ticks counted here ${lazy1.counted} (try-outs included)`);
check(lazy1.finished, `README: the lookahead driver finishes winter4 with seed ${seed} where the plain policy does not`);
if (seed === 10) {
  check(lazy1.finishFrames === 19819, `README: the seed 10 lap is 19.819 s (got ${lazy1.finishFrames})`);
  check(Math.abs(lazy1.simTicks / lazy1.tick - 8.7) < 0.1 && lazy1.backups === 0, `README: 8.7x the lap's ticks, no back-ups (got ${(lazy1.simTicks / lazy1.tick).toFixed(2)}x, ${lazy1.backups})`);
}
// Cost bounds that hold whatever the lap: a try-out of 40 for every 10
// committed, plus the commit, is 5 laps' worth before any trouble.
check(lazy1.simTicks >= 4.5 * lazy1.tick, `lazy: costs at least about horizon / every + 1 = 5 laps' worth (${(lazy1.simTicks / lazy1.tick).toFixed(2)}x)`);
check(lazy1.replans >= Math.ceil((lazy1.decisions.length - 40) / 10), `lazy: one replan per 10 committed decisions (${lazy1.replans} replans, ${lazy1.decisions.length} decisions)`);

// --- is the reported lap a lap the car really drives? ------------------------------
// The committed decisions, from the start line, in the training environment...
const replay = await roll(renv, await fromStart(renv), { explicit: lazy1.decisions });
check(replay.finished === lazy1.finished && replay.tick === lazy1.tick && replay.finishFrames === lazy1.finishFrames,
  `the committed decisions alone, from the start line, end on tick ${replay.tick} (driver said ${lazy1.tick})`);
// ... and as keys on the bare simulator, with the game's Verify. This replaces
// the car, so it is last.
const keys = decisionsToKeys(lazy1.decisions);
if (lazy1.finished) {
  const v = await verifyAndSave({ track: TRACK, keys, name: 'g2-4-test-a', env: renv.env, save: false });
  check(v.ok && v.finishFrames === lazy1.finishFrames, `the lap as keys on the bare simulator finishes on tick ${v.finishFrames} and passes Verify (one tick short is rejected: ${v.offByOneRejected})`);
  if (seed === 10) {
    const saved = JSON.parse(readFileSync(new URL('runs/g2-4-gen_winter4.json', ROOT), 'utf8'));
    check(saved.finishFrames === lazy1.finishFrames && sameKeys(saved.controlsPerTick, keys.slice(0, saved.finishFrames)),
      'the saved lap runs/g2-4-gen_winter4.json is this lap, key for key');
  }
}
await renv.close();
finish();
