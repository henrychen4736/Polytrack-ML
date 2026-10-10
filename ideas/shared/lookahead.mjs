// "Get a finished lap from a policy that does not finish on its own."
// PROMOTED in phase 2 from ideas/g2-4-lookahead-driving/lookahead.mjs, where
// the code still lives; this file is the supported way in.
//
//   const renv = await openBlockEnv('winter4');                           // block_rollout.mjs
//   const policy = loadPolicy('rl/checkpoints/ppo_blkgen.best2.actor.bin');
//   const lap = await driveLap(renv, policy, { mode: 'lazy', seed: 1 });
//   if (lap.finished) await verifyAndSave({ track: 'winter4', keys: decisionsToKeys(lap.decisions), name: 'g2-3-start' });
//
// driveLap drives from the start line and, every 0.5 s, saves the simulator
// and tries the next 2 s: in 'lazy' mode the policy's own top choices first,
// and only if that try-out crashes, forced alternatives (each steering /
// pedal combination held 0.2 or 0.5 s) and sampled ones; if nothing survives
// it backs up as far as 3 s. Returns { decisions, finished, finishFrames,
// reason, progress, fraction, tick, replans, troubled, rescued, deadEnds,
// backups, picks, simTicks, seconds }; `decisions` are block decisions from
// the start line (laps.mjs decisionsToKeys turns them into keys).
//
// Measured by g2-4 and confirmed by its tester with the generalist
// (ppo_blkgen.best2) on the three tracks it was not trained on (desert3,
// summer3, winter4): 16 of 16 attempts finished, against 6 of 16 for the
// policy alone with one attempt each. Read that with its cost: a lookahead
// lap took 9 to 39 times the simulator ticks of a plain lap (mean 17; 5 times
// where nothing goes wrong), and the tester points out that 17 plain retries
// would also have finished summer3 and usually desert3. winter4 is the track
// where it does something retries do not (plain: 0 of 8 runs within 10 laps
// of driving, in g2-3's logs). The tester re-drove or verified 5 of the 16
// laps and took the rest from the logs. DEFAULTS in the g2-4 file has the
// settings and the numbers behind each.
//
// It needs a RacingEnv, so a reference lap (CONTRACT.md): it is not a way to
// drive a track nobody has driven. The laps it produces are slow and safe;
// they are starting laps for a search or examples for training, not times.
export { driveLap, DEFAULTS as LOOKAHEAD_DEFAULTS } from '../g2-4-lookahead-driving/lookahead.mjs';
