// child.mjs through its own protocol: nodes, candidates, commit, adopt,
// finish, lookahead, and the forced car rebuild.
//
// One child is driven through a fixed list of requests and every reply is
// checked against values worked out independently (the tick of a node from
// the block layout, the policy's top choice from the policy's own lap, a
// finished lap replayed on the bare simulator through
// ideas/shared/sim_session.mjs, which shares no code with the training
// environment the child uses). Then a SECOND child is started with
// carBudget=60000, which makes it throw its car away and rebuild every node
// several times during the same list of requests, and its replies must be
// the first child's, number for number.
//
// Simulators: one child plus the bare simulator, then the second child alone.
// Never more than two.
import { createPool } from '../../../sim/pool.mjs';
import { SimSession } from '../../shared/sim_session.mjs';
import { decisionsToKeys } from '../../shared/laps.mjs';
import { check, same, finish } from './harness.mjs';

const TRACK = 'desert4';
const ACTOR = `rl/checkpoints/ppo_sr1_${TRACK}.u800.actor.bin`;
const SETUP = { actor: ACTOR, critic: ACTOR.replace('.actor.bin', '.critic.bin'), env: { maxOffLine: 40 } };
const AT = 400; // decisions into the policy's lap where the branching is done (20 s: rollouts from here are short)

const targets = (d) => [d[0], d[2], d[4]];
/** child.mjs's rule for writing a decision: slice 0 where the target is what the control already does. */
const canonical = (d, held) => d.map((v, i) => (i % 2 === 1 && d[i - 1] === held[(i - 1) / 2] ? 0 : v));
const strip = ({ ticks, rebuilds, live, ...rest }) => rest; // what may differ between a child that rebuilds and one that does not

/**
 * The fixed list of requests. Each step is asked of the child and its reply
 * stored under a name; later steps may use earlier replies. Returns
 * { replies, rebuilds }.
 */
async function script(pool) {
  const replies = {};
  let rebuilds = 0;
  const ask = async (name, request) => {
    const [reply] = await pool.runAll([request]);
    if (reply.rebuilds != null) rebuilds = Math.max(rebuilds, reply.rebuilds);
    replies[name] = reply;
    return reply;
  };
  const root = await ask('root', { cmd: 'root' });
  const lap = (await ask('policyLap', { cmd: 'finish', runs: [{ node: root.node }] })).laps[0];
  const prefix = lap.decisions.slice(0, AT);
  const held = targets(prefix.at(-1));
  const top = lap.decisions[AT];
  const base = await ask('adopt', { cmd: 'adopt', decisions: prefix });
  const expand = { cmd: 'expand', parents: [{ node: base.node }], samples: 2, alts: true, temperature: 1, lookahead: 0 };
  const first = await ask('expand', { ...expand, seed: 7 });
  await ask('expandAgain', { ...expand, seed: 7 });
  await ask('expandOtherSeed', { ...expand, seed: 8 });
  // A forced decision that is not the top choice: steer to another target from slice 2.
  const forced = [(top[0] + 1) % 3, 2, top[2], 0, top[4], 0];
  await ask('expandForced', { ...expand, seed: 7, parents: [{ node: base.node, forced }] });
  await ask('expandBare', { ...expand, seed: 7, samples: 0, alts: false });
  // Keep the first and the last candidate; everything else (the root, the adopted node) is freed.
  const live = first.children.filter((c) => c.node !== null);
  const picks = [live[0], live.at(-1)];
  const commit = await ask('commit', { cmd: 'commit', picks: picks.map((c) => ({ parent: c.parent, decision: c.decision })) });
  // The same partial laps driven again from the start line.
  await ask('adoptPick0', { cmd: 'adopt', decisions: [...prefix, picks[0].decision] });
  await ask('adoptPick1', { cmd: 'adopt', decisions: [...prefix, picks[1].decision] });
  await ask('keep', { cmd: 'keep', nodes: commit.nodes });
  const explicit = [lap.decisions[AT + 1], lap.decisions[AT + 2]];
  await ask('finish', { cmd: 'finish', runs: [{ node: commit.nodes[0] }, { node: commit.nodes[1], explicit }] });
  await ask('look', { cmd: 'expand', parents: [{ node: commit.nodes[0] }], samples: 0, alts: false, seed: 1, lookahead: 3 });
  await ask('marked', { cmd: 'expand', parents: [{ node: commit.nodes[0] }], samples: 2, alts: true, seed: 3, mark: true });
  await ask('keepOne', { cmd: 'keep', nodes: [commit.nodes[1]] });
  // Full throttle and full left lock from the start line leaves the road within a few seconds.
  await ask('adoptDead', { cmd: 'adopt', decisions: Array.from({ length: 300 }, () => [1, 0, 1, 0, 0, 0]) });
  await ask('idle', { cmd: 'idle' });
  return { replies, rebuilds, held, top, forced, picks, explicit };
}

// ---- the first child ------------------------------------------------------------------------
const poolA = await createPool(TRACK, 1, '../ideas/g1-4-beam-search/child.mjs', SETUP);
const A = await script(poolA);
const R = A.replies;
const lap = R.policyLap.laps[0];

check('root: a node on the start line, after the lap\'s one empty tick (tick 1)', R.root.node > 0 && R.root.tick === 1 && R.root.reward === 0, JSON.stringify(R.root));
check('finish from the root: the policy\'s own lap is the 22.061 s the README and CONTRACT.md give', lap.finished && lap.finishFrames === 22061 && lap.reason === 'finished', `${lap.finishFrames} ${lap.reason}`);
// Decision k covers ticks 1 + 50k .. 50 + 50k, so a lap of n decisions finishes within the last one.
check('finish: the number of decisions fits the finish tick (finish inside the last 50 ms block)', lap.finishFrames > 1 + 50 * (lap.decisions.length - 1) && lap.finishFrames <= 1 + 50 * lap.decisions.length, `${lap.decisions.length} decisions, ${lap.finishFrames} ticks`);
check('finish from the root: "rest" is the whole lap, with one progress value and one value estimate per decision', JSON.stringify(lap.rest) === JSON.stringify(lap.decisions) && lap.trace.length === lap.decisions.length && lap.valueTrace.length === lap.decisions.length);
check('finish: progress along the lap never goes backwards by more than a unit', lap.trace.every((p, i) => i === 0 || p > lap.trace[i - 1] - 1));

check('adopt 400 decisions: a node at tick 1 + 50 x 400 = 20001', R.adopt.node > 0 && R.adopt.tick === 1 + 50 * AT, `${R.adopt.tick}`);
check('adopt: reports where the policy\'s lap was at that decision (progress to 2 decimals)', +R.adopt.progress.toFixed(2) === lap.trace[AT - 1], `${R.adopt.progress} against ${lap.trace[AT - 1]}`);

// ---- candidates -------------------------------------------------------------------------------
const kids = R.expand.children;
const keyOf = (c) => c.decision.join('');
check('expand: between 2 and 6 candidates (top choice, 2 samples, 3 alternatives, repeats removed), all from the node asked', kids.length >= 2 && kids.length <= 6 && kids.every((c) => c.parent === R.adopt.node), `${kids.length}`);
check('expand: no two candidates are the same decision', new Set(kids.map(keyOf)).size === kids.length);
check('expand: only the first candidate is marked "first"', kids[0].first === true && kids.slice(1).every((c) => c.first === false));
check('expand: the first candidate is the policy\'s top choice (the decision its own lap took there)', JSON.stringify(kids[0].decision) === JSON.stringify(canonical(A.top, A.held)), `${kids[0].decision} against ${canonical(A.top, A.held)} (held ${A.held})`);
check('expand: every candidate is written with slice 0 where a control does not change', kids.every((c) => JSON.stringify(c.decision) === JSON.stringify(canonical(c.decision, A.held))));
{
  const has = (t) => kids.some((c) => targets(c.decision).join() === t.join());
  const t = targets(A.top);
  check('expand: the three systematic alternatives are among them (the two other steering targets, W flipped)',
    has([(t[0] + 1) % 3, t[1], t[2]]) && has([(t[0] + 2) % 3, t[1], t[2]]) && has([t[0], 1 - t[1], t[2]]), kids.map((c) => targets(c.decision).join('')).join(' '));
}
const alive = kids.filter((c) => c.node !== null);
check('expand without "mark": no save states are made (node 0) and every candidate is one block further (tick 20051)', alive.length > 0 && alive.every((c) => c.node === 0 && c.tick === 1 + 50 * (AT + 1)));
check('expand: the top choice lands where the policy\'s own lap was one decision later', +alive[0].progress.toFixed(2) === lap.trace[AT], `${alive[0].progress} against ${lap.trace[AT]}`);
check('expand: the candidates do not all end in the same place', new Set(alive.map((c) => `${c.progress},${c.lateral},${c.speed}`)).size > 1);
check('expand: reports the ticks it spent (50 per candidate)', R.expand.ticks === 50 * kids.length, `${R.expand.ticks} for ${kids.length}`);
same('expand: the same request again (same seed) gives the same candidates to the last digit', R.expandAgain.children, R.expand.children);
check('expand: another seed changes only the random choices (the first candidate and the alternatives stay)', JSON.stringify(R.expandOtherSeed.children[0]) === JSON.stringify(kids[0]));
check('expand with samples=0 alts=0: the top choice alone', R.expandBare.children.length === 1 && JSON.stringify(R.expandBare.children[0]) === JSON.stringify(kids[0]));
{
  const f = R.expandForced.children;
  check('expand with a forced decision: it comes first and is the one marked "first"; the top choice follows', JSON.stringify(f[0].decision) === JSON.stringify(canonical(A.forced, A.held)) && f[0].first && JSON.stringify(f[1].decision) === JSON.stringify(kids[0].decision) && !f[1].first,
    `${f[0].decision} | ${f[1]?.decision}`);
  check('expand with a forced decision: still no repeats', new Set(f.map(keyOf)).size === f.length);
}

// ---- commit, adopt, keep ----------------------------------------------------------------------
check('commit: one new node per pick, and every other node is freed', R.commit.nodes.length === 2 && R.commit.live === 2 && new Set(R.commit.nodes).size === 2, JSON.stringify(R.commit));
{
  // A committed node must be the car expand reported. adopt drives the same
  // decisions from the start line; its report must equal expand's exactly.
  const report = ({ tick, progress, speed, lateral, value, reward }) => ({ tick, progress, speed, lateral, value });
  same('the first kept candidate, driven again from the start line (adopt), is the same car to the last digit', report(R.adoptPick0), report(A.picks[0]));
  same('the last kept candidate likewise', report(R.adoptPick1), report(A.picks[1]));
  check('... and the reward so far agrees (to 1e-9; it is summed in a different order)', Math.abs(R.adoptPick0.reward - A.picks[0].reward) < 1e-9 && Math.abs(R.adoptPick1.reward - A.picks[1].reward) < 1e-9, `${R.adoptPick0.reward} ${A.picks[0].reward}`);
}
check('keep: frees everything not listed', R.keep.live === 2 && R.keepOne.live === 1);

// ---- finish from a node -------------------------------------------------------------------------
const [lap0, lap1] = R.finish.laps;
check('finish from two nodes: answers in the order asked, each naming its node', lap0.node === R.commit.nodes[0] && lap1.node === R.commit.nodes[1]);
check('finish from the top-choice node with no decisions given: the policy\'s own lap again, to the tick', lap0.finished && lap0.finishFrames === lap.finishFrames && JSON.stringify(lap0.decisions.map(targets)) === JSON.stringify(lap.decisions.map(targets)));
check('finish: "decisions" is the node\'s 401 decisions followed by "rest"', JSON.stringify(lap1.decisions) === JSON.stringify([...lap.decisions.slice(0, AT), A.picks[1].decision, ...lap1.rest]));
check('finish with explicit decisions: they are driven first, then the policy', JSON.stringify(lap1.rest.slice(0, 2)) === JSON.stringify(A.explicit));

// ---- lookahead ------------------------------------------------------------------------------------
{
  const c = R.look.children[0];
  // The node is the top-choice candidate of decision 400; this candidate is its top
  // choice and 3 more of the policy, which is the 4th decision of the lap driven on from the node.
  check('expand with lookahead=3: "look" is the distance after the candidate and 3 more top choices (the policy lap\'s own trace)', R.look.children.length === 1 && !c.lookDead && +c.look.toFixed(2) === lap0.trace[3], `${c.look} against ${lap0.trace[3]}`);
  check('expand with lookahead=3: costs (1 + 3) x 50 ticks per candidate', R.look.ticks === 200, `${R.look.ticks}`);
  check('expand with lookahead: the candidate itself is still reported one block on (not at the end of the lookahead)', c.tick === 1 + 50 * (AT + 2) && +c.progress.toFixed(2) === lap0.trace[0]);
  check('expand with lookahead: "lookScore" is a number', Number.isFinite(c.lookScore));
}
{
  const m = R.marked.children.filter((c) => c.node !== null);
  check('expand with mark: every surviving candidate is a node of its own', m.length > 1 && m.every((c) => c.node > 0) && new Set(m.map((c) => c.node)).size === m.length);
}
check('adopt of decisions that end the lap (full left lock from the start): no node', R.adoptDead.node === null, JSON.stringify(R.adoptDead));
check('idle: an empty reply', JSON.stringify(R.idle) === '{}');

// ---- the bare simulator agrees ------------------------------------------------------------------------
{
  const sim = await SimSession.create(TRACK);
  for (const [name, l] of [['the policy\'s own lap', lap], ['the lap finished from the last kept candidate', lap1]]) {
    if (!l.finished) { check(`${name} finishes (needed for the replay check)`, name !== 'the policy\'s own lap', l.reason); continue; }
    await sim.restart();
    const r = await sim.drive(decisionsToKeys(l.decisions));
    check(`${name} (${l.finishFrames} ticks), replayed from its decisions on the bare simulator, finishes on the same tick`, r.finished && r.finishFrames === l.finishFrames, `${r.finished} ${r.finishFrames}`);
    await sim.restart();
    const short = await sim.drive(decisionsToKeys(l.decisions).slice(0, l.finishFrames - 1));
    check(`${name}: one tick fewer does not finish`, !short.finished);
  }
  await sim.close();
}
poolA.close();

// ---- the forced car rebuild ------------------------------------------------------------------------------
{
  const poolB = await createPool(TRACK, 1, '../ideas/g1-4-beam-search/child.mjs', { ...SETUP, carBudget: 60_000 });
  const B = await script(poolB);
  poolB.close();
  check('with carBudget=60000 the child rebuilt its nodes on a new car more than once during the same requests', B.rebuilds >= 2, `rebuilds ${B.rebuilds}`);
  check('the child without a budget never rebuilt', A.rebuilds === 0);
  const names = Object.keys(R);
  const differs = names.filter((n) => JSON.stringify(strip(B.replies[n])) !== JSON.stringify(strip(R[n])));
  check(`after rebuilds, all ${names.length} replies (nodes, candidates, features, values, laps) are identical to the child that never rebuilt`, differs.length === 0, `different: ${differs.join(', ')}`);
}
finish();
