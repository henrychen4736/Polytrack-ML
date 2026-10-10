// pool.mjs (added by the orchestrator in phase 2, with this test): a child
// that throws must fail the request, not leave it waiting for ever.
// No simulator; three tiny child processes, a second or two.
import { checker } from './harness.mjs';
import { createPool } from '../pool.mjs';

const { check } = checker();
const CHILD = '../ideas/shared/tests/_throwing_child.mjs';

const pool = await createPool('none', 2, CHILD);
const replies = await pool.runAll([{ cmd: 'echo', text: 'a' }, { cmd: 'echo', text: 'b' }]);
check(replies[0].said === 'a' && replies[1].said === 'b', 'pool: replies come back in request order');

// Child 1 throws. With sim/pool.mjs this promise never settles; give it 20 s.
const timeout = new Promise((resolve) => { setTimeout(() => resolve('TIMEOUT'), 20000).unref(); });
const outcome = await Promise.race([pool.runAll([{ cmd: 'echo', text: 'c' }, { cmd: 'explode' }]).then(() => 'RESOLVED', (err) => err), timeout]);
check(outcome instanceof Error, 'pool: a request to a child that throws is rejected, not left waiting');
check(outcome instanceof Error && /cannot do "explode"/.test(outcome.message), "pool: the rejection carries the child's own error text");
const after = await pool.runAll([{ cmd: 'echo', text: 'd' }]).then((r) => r[0].said, (err) => err);
check(after === 'd', 'pool: the surviving child still answers');
const dead = await pool.runAll([{ cmd: 'echo', text: 'e' }, { cmd: 'echo', text: 'f' }]).then(() => 'RESOLVED', (err) => err);
check(dead instanceof Error && /no longer running/.test(dead.message), 'pool: a later request to the dead child is rejected at once');
pool.close();

const failed = await createPool('none', 1, CHILD, { failAtStart: true }).then((p) => { p.close(); return 'STARTED'; }, (err) => err);
check(failed instanceof Error && /refusing to start/.test(failed.message), 'pool: a child that dies while starting rejects createPool with its error');
