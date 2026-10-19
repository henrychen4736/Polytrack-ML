// A trained block-decision policy, and its value estimate, on the Node side.
// The code is in rl/policy.mjs, where training and the search use it too;
// this file keeps the ideas' imports working.
//
//   const policy = loadPolicy('rl/checkpoints/ppo_sr1_desert4.u800.actor.bin');
//   const decision = policy.decide(obs);            // top choices
//   const decision = policy.decide(obs, rng, 1);    // sampled, as in training
//   const value = loadValue('rl/checkpoints/ppo_sr1_desert4.u800.critic.bin');
//   value(obs)                                      // expected discounted reward to go
//
// A checkpoint trained with --reference route (rl/train_ppo.py) has 334 inputs,
// not 352: load it with { obsSize: OBS_SIZE_ROUTE } and drive it in an
// environment made with reference: 'route' (openBlockEnv(track, { reference:
// 'route' }) in block_rollout.mjs). `python rl/export_actor.py` prints which
// kind a checkpoint is.
//
//   const policy = loadPolicy('rl/checkpoints/ppo_g2-1-route.actor.bin', { obsSize: OBS_SIZE_ROUTE });
export { loadPolicy, loadValue, GROUPS, NUM_SCORES } from '../../rl/policy.mjs';
export { OBS_SIZE, OBS_SIZE_ROUTE } from '../../rl/racing_env.mjs';
export { createRng } from './rng.mjs';
