// The simulator process pool. This file held the version of sim/pool.mjs in
// which a child that dies is an error, not a hang; that version is now
// sim/pool.mjs itself, and this line keeps the ideas' imports working.
//
//   import { createPool } from '../shared/pool.mjs';
//   const pool = await createPool('desert4', 2, '../ideas/g1-4-beam-search/child.mjs', setup);
//   const replies = await pool.runAll(requests);   // rejects if a child dies
//   pool.close();
//
// `childFile` is resolved relative to sim/.
export { createPool } from '../../sim/pool.mjs';
