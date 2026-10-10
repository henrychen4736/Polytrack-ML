// The Node actor's 22 scores for a file of observations, for test_agent.py.
//
//   node ideas/g2-5-memory-policy/tests/node_scores.mjs <actor.bin> <obs.bin> <out.bin> <obsSize>
//
// Paths from the project root. obs.bin is float32 rows of obsSize numbers;
// out.bin gets float64 rows of 22 scores, computed by ideas/shared/policy.mjs
// (the code that drives the car on the Node side).
import { readFileSync, writeFileSync } from 'node:fs';
import { loadPolicy, NUM_SCORES } from '../../shared/policy.mjs';

const [actorFile, obsFile, outFile, size] = process.argv.slice(2);
const obsSize = Number(size);
const policy = loadPolicy(actorFile, { obsSize });
const bytes = readFileSync(obsFile);
const all = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
const rows = all.length / obsSize;
const out = new Float64Array(rows * NUM_SCORES);
for (let k = 0; k < rows; k++) out.set(policy.scores(Array.from(all.subarray(k * obsSize, (k + 1) * obsSize))), k * NUM_SCORES);
writeFileSync(outFile, Buffer.from(out.buffer));
console.log(`${rows} rows, hidden ${policy.hidden}`);
