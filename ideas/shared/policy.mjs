// A trained block-decision policy, and its value estimate, on the Node side.
// The code is in rl/policy.mjs, where training and the search use it too;
// this file keeps the ideas' imports working.
//
//   const policy = loadPolicy('rl/checkpoints/ppo_sr1_desert4.u800.actor.bin');
//   const decision = policy.decide(obs);            // top choices
//   const decision = policy.decide(obs, rng, 1);    // sampled, as in training
//   const value = loadValue('rl/checkpoints/ppo_sr1_desert4.u800.critic.bin');
//   value(obs)                                      // expected discounted reward to go
export { loadPolicy, loadValue, GROUPS, NUM_SCORES } from '../../rl/policy.mjs';
export { createRng } from './rng.mjs';
