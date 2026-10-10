// Helper for test_export_critic.py, not a test: print what policy.mjs
// computes from an actor file and a critic file for three fixed observations,
// as JSON, so the Python side can compare it with PyTorch on the checkpoint.
//   node ideas/shared/tests/print_scores.mjs <actor.bin> <critic.bin>
import { loadPolicy, loadValue } from '../policy.mjs';
import { OBS_SIZE } from '../../../rl/racing_env.mjs';

const [actorFile, criticFile] = process.argv.slice(2);
const policy = loadPolicy(actorFile), value = loadValue(criticFile);
const out = [];
for (let n = 0; n < 3; n++) {
  // The same formula as in the Python test.
  const obs = Float32Array.from({ length: OBS_SIZE }, (_, i) => 0.8 * Math.sin(0.37 * i + n));
  const decision = policy.decide(obs);
  out.push({ scores: [...policy.scores(obs)], value: value(obs), decision, logProb: policy.logProb(obs, decision) });
}
console.log(JSON.stringify({ obsSize: OBS_SIZE, hidden: policy.hidden, out }));
