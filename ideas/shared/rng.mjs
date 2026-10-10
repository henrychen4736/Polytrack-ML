// The project's one seeded random number generator, under one import.
//
// Math.random cannot be seeded, and searches, generators and tests here must
// be repeatable. The algorithm (mulberry32) lives in sim/search.mjs; copies of
// it had also grown in rl/racing_env.mjs, rl/rollout_child.mjs and three idea
// folders (g1-6, g2-2, g2-5). Everything under ideas/ now imports this one.
//
//   const rng = createRng(7);
//   rng()            // a float in [0, 1); same seed, same sequence
//
// This file imports nothing but that function, so a module with no simulator
// (the track generator) can use it without loading one.
export { createRng } from '../../sim/search.mjs';
