// Child process for the beam search (beam.mjs, calibrate.mjs): one simulator,
// the training environment on top of it, a block policy and its critic.
// Started through sim/pool.mjs, like rl/rollout_child.mjs.
//
// rollout_child.mjs holds ONE mark (the end of the committed lap). A beam
// needs many partial laps alive at once, so this child holds a table of
// NODES. A node is one partial lap: a save state (RacingEnv mark), the
// observation at that moment, the reward earned so far, and the full list of
// block decisions from the start line that leads there. The decision list is
// what lets a node outlive its car: a simulator car can only be stepped about
// 6 million ticks (CONTRACT.md, "Car tick budget"), and when this one is nearly
// used up every live node is rebuilt on a new car by driving its decisions
// again (rebuild() below).
//
// A "decision" is a block decision, [steer, steerAt, w, wAt, s, sAt], one per
// 50 ms (BLOCK DECISIONS in rl/racing_env.mjs).
//
// Protocol (sim/pool.mjs):
//   parent -> child  { track, actor, critic, env, carBudget }   once
//   child -> parent  { ready: true }
//
//   { id, cmd: 'root' }
//       Start line; that moment becomes a node. Reply { node }.
//   { id, cmd: 'adopt', decisions }
//       Start line, drive `decisions`, and make that moment a node.
//       Reply { node } (node is null if the decisions ended the lap).
//   { id, cmd: 'expand', parents: [{ node, forced }], samples, alts, seed, temperature, lookahead, mark }
//       For each parent node, try several next decisions (candidates() below)
//       and report where each leaves the car. With lookahead = H > 0 the
//       policy's top choices then drive H more decisions and where that got
//       to is reported too. With `mark`, every surviving result becomes a
//       node; without it none does (`node` is 0) and the parent names the
//       ones it wants with 'commit'. Saving a state is the dearest step here
//       (measured: rewind 2.7 ms, the 50 ticks 3.5 ms, the save 12 ms), and a
//       beam throws most candidates away, so it only saves what it keeps.
//       Reply { children: [child, ...], ticks } where a child is
//         { parent, first, decision, node, tick, progress, speed, lateral,
//           value, reward, look, lookScore, lookDead }       still driving, or
//         { parent, first, decision, node: null, finished, finishFrames, reason, decisions }
//       `first` marks the parent's first candidate (the forced decision, or
//       the policy's top choice).
//   { id, cmd: 'commit', picks: [{ parent, decision }] }
//       Make a node of each pick (parent node + one decision, as reported by
//       'expand'), then free every other node. Reply { nodes: [ids] }.
//   { id, cmd: 'idle' }   nothing; reply {}.
//   { id, cmd: 'keep', nodes: [ids] }
//       Free every node not listed. Reply { live }.
//   { id, cmd: 'finish', runs: [{ node, explicit }] }
//       From each node drive to the finish: `explicit` decisions first if
//       given, then the policy's top choices. Reply { laps: [{ node, finished,
//       finishFrames, reason, decisions (whole lap), rest (from the node on),
//       trace (progress after each decision of `rest`),
//       valueTrace (reward since the node + critic's estimate, likewise) }], ticks }.
//
// Local use only: nothing here contacts Kodub's servers.
import { openBlockEnv } from '../shared/block_rollout.mjs';
import { loadPolicy, loadValue, createRng } from '../shared/policy.mjs';

let renv = null, policy = null, value = null;
// Rebuild on a new car past this many ticks. 4.5 million is the contract's
// figure; the parent can pass a small number to test the rebuild.
let carBudget = 4_500_000;
const nodes = new Map(); // id -> { mark, obs, reward, decisions }
let nextNode = 1;

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Where the car is now, as the numbers the parent ranks and buckets by. */
function features() {
  const i = renv.progressIndex, p = renv.state.position, q = renv.line.points[i];
  return {
    tick: renv.state.frames,
    progress: renv.progress,                 // units along the reference line
    speed: renv.state.speedKmh / 3.6,        // units per second
    // units to the left of the reference line (negative = right): the
    // "across the track" coordinate for the diversity buckets
    lateral: dot([p[0] - q[0], p[1] - q[1], p[2] - q[2]], renv.lineLeft[i]),
  };
}

/** Remember the present moment as a node. */
async function makeNode(obs, reward, decisions) {
  const id = nextNode++;
  nodes.set(id, { mark: await renv.mark(), obs, reward, decisions });
  return id;
}

/** What each control is doing now, [steer, w, s], from the environment's
 *  nine-way action code (steer + 3 * w + 6 * s). */
const heldNow = () => { const a = renv.previousAction; return [a % 3, Math.floor(a / 3) % 2, a >= 6 ? 1 : 0]; };

/** stepBlock ignores a switch slice when the target is what the control is
 *  doing already. Write 0 there, so two decisions that hold the same keys on
 *  every tick are also the same six numbers and can be told apart cheaply. */
function canonical(decision, held) {
  const d = decision.slice();
  for (let c = 0; c < 3; c++) if (d[2 * c] === held[c]) d[2 * c + 1] = 0;
  return d;
}

/**
 * The next decisions to try from one node, without repeats:
 *   1. `forced` if the parent gave one (the next decision of the best finished
 *      lap, see ELITE in beam.mjs), otherwise the policy's top choice
 *   2. the policy's top choice (when 1 was forced)
 *   3. `samples` decisions picked at random in proportion to the policy's
 *      scores, as in training
 *   4. with `alts`, three systematic alternatives to the top choice that the
 *      policy may give almost no chance: steering to each of the other two
 *      targets and W flipped, all from the start of the block
 */
function candidates(obs, held, { forced, samples, alts, rng, temperature }) {
  const top = policy.decide(obs);
  const list = [];
  if (forced) list.push(forced);
  list.push(top);
  for (let k = 0; k < samples; k++) list.push(policy.decide(obs, rng, temperature));
  if (alts) {
    list.push([(top[0] + 1) % 3, 0, top[2], top[3], top[4], top[5]]);
    list.push([(top[0] + 2) % 3, 0, top[2], top[3], top[4], top[5]]);
    list.push([top[0], top[1], 1 - top[2], 0, top[4], top[5]]);
  }
  const seen = new Set(), out = [];
  for (const d of list) {
    const c = canonical(d, held), key = c.join('');
    if (!seen.has(key)) { seen.add(key); out.push(c); }
  }
  return out;
}

/** Drive on with the policy's top choices (after `explicit`, if any) until
 *  the episode ends or `horizon` decisions have gone by. */
async function drive(obs, { explicit = [], horizon = Infinity } = {}) {
  const decisions = [], trace = [], valueTrace = [];
  let r = null, reward = 0;
  for (let k = 0; k < horizon; k++) {
    const decision = explicit[k] ?? policy.decide(obs);
    decisions.push(decision);
    r = await renv.stepBlock(decision);
    reward += r.reward;
    obs = r.obs;
    trace.push(+renv.progress.toFixed(2));
    // reward since the node + the critic's estimate from here (calibrate.mjs)
    valueTrace.push(+(reward + value(obs)).toFixed(3));
    if (r.terminated || r.truncated) break;
  }
  return { decisions, trace, valueTrace, reward, obs, reason: r?.info.reason ?? null, finishFrames: r?.info.finishFrames ?? null };
}

/** New car on the start line. Every mark made on the old car is dead after
 *  this, so the caller must have dropped them. */
async function freshStart() {
  renv.ladder = null; // makes reset() build a new car and a new ladder
  return (await renv.reset({ startFraction: 0 })).obs;
}

/** Start line (restoring the ladder's save state, no new car) and drive
 *  `decisions`. Returns the last step's result and the reward. */
async function replay(decisions) {
  let { obs } = await renv.reset({ startFraction: 0 });
  let reward = 0, done = false;
  for (const decision of decisions) {
    const r = await renv.stepBlock(decision);
    reward += r.reward; obs = r.obs;
    if (r.terminated || r.truncated) { done = true; break; }
  }
  return { obs, reward, done };
}

/** The car is nearly used up: free every mark, build a new car, and drive
 *  each live node's decisions again to get its save state back. Costs 50
 *  ticks per decision per node (a 16-node share of a beam ten seconds into
 *  the lap: 160 000 ticks, 4% of the new car). */
async function rebuild() {
  for (const node of nodes.values()) renv.dropMark(node.mark);
  await freshStart();
  for (const node of nodes.values()) {
    const r = await replay(node.decisions);
    if (r.done) throw new Error('rebuild: a live node did not replay');
    node.mark = await renv.mark();
    node.obs = r.obs;
  }
  rebuilds++;
}
let rebuilds = 0;
const ensureCar = async () => { if (renv.env.frames > carBudget) await rebuild(); };

const handlers = {
  idle() { return {}; },

  async root() {
    for (const node of nodes.values()) renv.dropMark(node.mark);
    nodes.clear();
    const obs = await freshStart();
    const node = await makeNode(obs, 0, []);
    return { node, ...features(), value: value(obs), reward: 0 };
  },

  async adopt({ decisions }) {
    await ensureCar();
    const r = await replay(decisions);
    if (r.done) return { node: null };
    const node = await makeNode(r.obs, r.reward, decisions);
    return { node, ...features(), value: value(r.obs), reward: r.reward };
  },

  async expand({ parents, samples = 2, alts = true, seed = 1, temperature = 1, lookahead = 0, mark = false }) {
    await ensureCar();
    const rng = createRng(seed);
    const before = renv.env.frames;
    const children = [];
    for (const { node: parentId, forced = null } of parents) {
      const parent = nodes.get(parentId);
      await renv.rewind(parent.mark);
      const list = candidates(parent.obs, heldNow(), { forced, samples, alts, rng, temperature });
      for (let c = 0; c < list.length; c++) {
        if (c > 0) await renv.rewind(parent.mark);
        const decision = list[c];
        const r = await renv.stepBlock(decision);
        const decisions = [...parent.decisions, decision];
        const child = { parent: parentId, first: c === 0, decision };
        if (r.terminated || r.truncated) {
          children.push({ ...child, node: null, finished: r.terminated, finishFrames: r.info.finishFrames, reason: r.info.reason, decisions: r.terminated ? decisions : null });
          continue;
        }
        const reward = parent.reward + r.reward;
        Object.assign(child, { node: mark ? await makeNode(r.obs, reward, decisions) : 0, ...features(), value: value(r.obs), reward });
        if (lookahead > 0) {
          // The policy's top choices for `lookahead` more decisions. What is
          // reported is where the car is at the END of that: a candidate that
          // gained a metre by cutting into a wall shows up as a loss here.
          const ahead = await drive(r.obs, { horizon: lookahead });
          const endTick = child.tick + 50 * lookahead;
          if (ahead.reason === 'finished') {
            // Crossed the line inside the lookahead: count the time left over
            // as distance at the speed the car had, so earlier is better.
            child.look = renv.line.length + child.speed * (endTick - ahead.finishFrames) / 1000;
            child.lookScore = reward + ahead.reward;
          } else if (ahead.reason) {
            child.lookDead = true; // off the road, off the line or stalled
          } else {
            child.look = renv.progress;
            child.lookScore = reward + ahead.reward + value(ahead.obs);
          }
        }
        children.push(child);
      }
    }
    return { children, ticks: renv.env.frames - before, rebuilds };
  },

  async commit({ picks }) {
    await ensureCar();
    const made = [];
    for (const { parent: parentId, decision } of picks) {
      const parent = nodes.get(parentId);
      await renv.rewind(parent.mark);
      // The same decision from the same save state: the same car as 'expand'
      // reported, to the tick (MARK AND REWIND in racing_env.mjs).
      const r = await renv.stepBlock(decision);
      made.push(await makeNode(r.obs, parent.reward + r.reward, [...parent.decisions, decision]));
    }
    return { nodes: made, ...handlers.keep({ nodes: made }) };
  },

  keep({ nodes: ids }) {
    const wanted = new Set(ids);
    for (const [id, node] of nodes) if (!wanted.has(id)) { renv.dropMark(node.mark); nodes.delete(id); }
    return { live: nodes.size };
  },

  async finish({ runs }) {
    await ensureCar();
    const before = renv.env.frames;
    const laps = [];
    for (const { node: id, explicit = [] } of runs) {
      const node = nodes.get(id);
      await renv.rewind(node.mark);
      const r = await drive(node.obs, { explicit });
      laps.push({
        node: id, finished: r.reason === 'finished', finishFrames: r.finishFrames, reason: r.reason,
        decisions: [...node.decisions, ...r.decisions], rest: r.decisions, trace: r.trace, valueTrace: r.valueTrace,
      });
    }
    return { laps, ticks: renv.env.frames - before };
  },
};

process.on('message', async (msg) => {
  if (msg.track) {
    renv = await openBlockEnv(msg.track, msg.env ?? {});
    policy = loadPolicy(msg.actor);
    value = loadValue(msg.critic);
    if (msg.carBudget) carBudget = msg.carBudget;
    process.send({ ready: true });
    return;
  }
  process.send({ id: msg.id, ...(await handlers[msg.cmd](msg)) });
});
