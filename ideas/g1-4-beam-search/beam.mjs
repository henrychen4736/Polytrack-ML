// Beam search over block decisions, guided by a specialist policy.
//
// scripts/search_rollout.mjs holds one lap and hill-climbs it: one change,
// the policy drives to the finish, keep it only if the lap is faster. Every
// candidate there costs most of a lap, and a candidate that is two or three
// changes away from the lap it holds is never seen. Here many partial laps
// ("members") are alive at once, all at the same lap tick:
//
//   1. Every member is extended by one block decision (50 ms) in several ways:
//      the policy's top choice, a few of its random choices, and three
//      systematic alternatives (child.mjs candidates()).
//   2. The results are ranked (RANKING below) and cut back to the best `beam`,
//      with limits on how many may sit in one spot (DIVERSITY below).
//   3. Every `rollEvery` decisions the top few members are driven to the
//      finish by the policy. That is the only number that counts, and it
//      feeds the ELITE.
//   4. Stop when a member crosses the finish line (all members are at the
//      same tick, so the first across is the fastest of them), or at `depth`
//      decisions, or after `seconds`.
//
// ELITE. The fastest finished lap known so far is the "incumbent"; it starts
// as the lap the policy drives on its own. The member that lies on the
// incumbent lap is the elite: it is never pruned, and one of its candidates
// is always "the incumbent's next decision". So the beam always still
// contains the incumbent, and the result can never be slower than the
// policy's own lap, whatever the ranking does. When a rollout in step 3
// finishes sooner than the incumbent, that lap becomes the incumbent and its
// member the elite.
//
// RANKING (rank=...). All members are at the same tick, so "better" means
// "will finish sooner from here", which nothing cheap measures. The choices:
//   progress   distance along the reference line now. Cheapest, and the
//              measure search_rollout.mjs found harmful when used alone.
//   value      reward so far + the critic's estimate of reward to come.
//   look       the policy's top choices drive `lookahead` more decisions;
//              rank by the distance reached THEN. Costs (1 + lookahead) times
//              the ticks. A candidate that dies in the lookahead is dropped.
//   lookvalue  as look, but reward so far + critic's estimate at the end.
// calibrate.mjs measures how well each of these agrees with the finish time;
// README.md has the numbers.
//
// DIVERSITY. Without a limit the beam fills with near-copies of its best
// member (candidates that differ by one 10 ms switch slice end up
// centimetres apart). Members are put in buckets by position across the
// track (`latBin` units) and along it (`alongBin` units), and at most
// `perBucket` are taken from one bucket while better-spread ones remain.
// Exact repeats (same tick, position and speed) are dropped first.
//
// SEVERAL PROCESSES. A save state cannot leave its simulator, so each process
// owns the members it made. Pruning is global, with one concession: no
// process may hold more than 1.5 times its even share, so that the work stays
// spread. Members are never moved between processes.
//
// Local use only: nothing here contacts Kodub's servers, and the result must
// not be submitted to the game's leaderboards.
//
// Usage: node ideas/g1-4-beam-search/beam.mjs <track> [key=value ...]
//   actor=rl/checkpoints/ppo_sr1_<track>.u800.actor.bin    (export_actor.py)
//   critic=<actor with .critic.bin>                        (ideas/shared/export_critic.py)
//   workers=2      simulator processes
//   beam=16        members kept after each decision
//   samples=2      random policy choices tried per member per decision
//   alts=1         also try the three systematic alternatives (0 = no)
//   rank=value     progress | value | look | lookvalue (value: as good as any
//                  in calibrate.mjs's measurements and costs nothing extra)
//   lookahead=10   decisions of policy driving behind each candidate (look, lookvalue)
//   rollEvery=20   decisions between rollouts to the finish (0 = only at the end)
//   rollTop=2      members driven to the finish each time
//   start=0        begin this many decisions into the incumbent lap instead of
//                  on the start line (a beam over one stretch of the lap)
//   depth=0        stop at this many decisions into the lap (0 = go to the finish)
//   seconds=0      stop extending after this much wall time (0 = no limit)
//   latBin=0.25 alongBin=0.5 perBucket=2   the diversity buckets
//   temperature=1  how random the random choices are
//   rngSeed=1
//   from=<file>    start with this lap as the incumbent instead of the
//                  policy's own (a lap made of block decisions, e.g.
//                  runs/rollout_<track>.json)
//   maxOffLine=40  refFile=...   environment options, as search_rollout.mjs
//   out=g1-4-beam  the lap is verified and saved as runs/<out>_<track>.json
//   carBudget=...  ticks per car before a rebuild (testing only)
// The shared pool, not sim/pool.mjs: the same interface, but a worker that
// throws fails the request instead of leaving this process waiting for ever.
import { createPool } from '../shared/pool.mjs';
import { createRng } from '../shared/policy.mjs';
import { decisionsToKeys, keysToDecisions, loadLap } from '../shared/laps.mjs';
import { verifyAndSave } from '../shared/verify.mjs';

// --- arguments ---------------------------------------------------------------
const args = process.argv.slice(2);
const track = args.find((a) => !a.includes('='));
const opt = Object.fromEntries(args.filter((a) => a.includes('=')).map((a) => a.split('=')));
if (!track) { console.error('Usage: node ideas/g1-4-beam-search/beam.mjs <track> [key=value ...]'); process.exit(1); }
const num = (key, fallback) => Number(opt[key] ?? fallback);
const actor = opt.actor ?? `rl/checkpoints/ppo_sr1_${track}.u800.actor.bin`;
const critic = opt.critic ?? actor.replace('.actor.bin', '.critic.bin');
const workers = num('workers', 2), BEAM = num('beam', 16);
const samples = num('samples', 2), alts = num('alts', 1) !== 0, temperature = num('temperature', 1);
const rank = opt.rank ?? 'value';
const lookahead = rank.startsWith('look') ? num('lookahead', 10) : 0;
const rollEvery = num('rollEvery', 20), rollTop = num('rollTop', 2);
const startDepth = num('start', 0), maxDepth = num('depth', 0), seconds = num('seconds', 0);
// Bucket sizes. Measured on desert4 with 8 members: at one tick the beam
// spans 0.4 to 2.4 units across the track but only 0.1 to 0.4 along it, so
// with these sizes the buckets are in effect lanes a quarter of a unit wide.
// The sizes are a first guess and have not been tuned.
const latBin = num('latBin', 0.25), alongBin = num('alongBin', 0.5), perBucket = num('perBucket', 2);
const outName = opt.out ?? 'g1-4-beam';
const rng = createRng(num('rngSeed', 1));

const SCORE = {
  progress: (c) => c.progress,
  value: (c) => c.reward + c.value,
  look: (c) => c.look,
  lookvalue: (c) => c.lookScore,
};
if (!SCORE[rank]) { console.error(`rank must be one of ${Object.keys(SCORE).join(', ')}`); process.exit(1); }

const pool = await createPool(track, workers, '../ideas/g1-4-beam-search/child.mjs', {
  actor, critic, carBudget: opt.carBudget ? num('carBudget') : undefined,
  env: { maxOffLine: num('maxOffLine', 40), ...(opt.refFile ? { refFile: opt.refFile } : {}) },
});
const t0 = performance.now();
const elapsed = () => (performance.now() - t0) / 1000;
const secs = (frames) => `${(frames / 1000).toFixed(3)} s`;
let ticks = 0; // simulator ticks spent, all processes
const rebuilds = new Array(workers).fill(0); // times each process moved its nodes to a new car

/** One request per process, all at once; `perWorker[w]` may be null to leave
 *  process w idle. pool.runAll sends request k to child k, so an idle process
 *  still gets a (no-op) request to keep the positions right. */
async function ask(perWorker) {
  const replies = await pool.runAll(Array.from({ length: workers }, (_, w) => perWorker[w] ?? { cmd: 'idle' }));
  replies.forEach((r, w) => { if (r.ticks) ticks += r.ticks; if (r.rebuilds != null) rebuilds[w] = r.rebuilds; });
  return replies.map((r, w) => (perWorker[w] ? r : null));
}

// --- the policy's own lap, and the incumbent ---------------------------------
// A member is { worker, node, tick, progress, speed, lateral, value, reward, score }.
const roots = await ask(Array.from({ length: workers }, () => ({ cmd: 'root' })));
let members = roots.map((r, worker) => ({ worker, ...r, score: 0 }));
const [own] = await ask([{ cmd: 'finish', runs: [{ node: members[0].node }] }]);
const policyLap = own.laps[0];
if (!policyLap.finished) { console.log(`${track}: the policy does not finish on its own (${policyLap.reason}); nothing to compare with`); pool.close(); process.exit(1); }
console.log(`${track}: the policy's own lap ${secs(policyLap.finishFrames)}`);

// incumbent: the fastest finished lap known. elite: the member on it, and the
// incumbent's decisions from that member on.
let incumbent = { decisions: policyLap.decisions, frames: policyLap.finishFrames, source: 'policy' };
if (opt.from) {
  const lap = loadLap(opt.from, track);
  const { decisions, wrongTicks } = keysToDecisions(lap.keys);
  const [check] = await ask([{ cmd: 'finish', runs: [{ node: members[0].node, explicit: decisions }] }]);
  const driven = check.laps[0];
  if (wrongTicks > 0 || !driven.finished) {
    console.log(`  from=${opt.from}: not usable (${wrongTicks} ticks do not fit block decisions, ${driven.finished ? 'finishes' : `ends: ${driven.reason}`}); starting from the policy's lap`);
  } else {
    incumbent = { decisions: driven.decisions, frames: driven.finishFrames, source: opt.from };
    console.log(`  starting from ${opt.from}: ${secs(incumbent.frames)}`);
  }
}
const startFrames = incumbent.frames;
let elite = { worker: 0, node: members[0].node, rest: incumbent.decisions };
if (startDepth > 0) {
  // Every process drives the incumbent's first `start` decisions and begins
  // there. (They all hold the same car; the copies part ways at the first
  // decision, where each process draws its own random choices, and exact
  // repeats are dropped by prune().)
  const begun = await ask(Array.from({ length: workers }, () => ({ cmd: 'adopt', decisions: incumbent.decisions.slice(0, startDepth) })));
  members = begun.map((r, worker) => ({ worker, ...r, score: 0 }));
  await ask(members.map((m) => ({ cmd: 'keep', nodes: [m.node] })));
  elite = { worker: 0, node: members[0].node, rest: incumbent.decisions.slice(startDepth) };
}

// --- pruning ------------------------------------------------------------------
/** Cut `children` (all still driving) back to BEAM members: best score first,
 *  no exact repeats, at most `perBucket` per bucket and 1.5 even shares per
 *  process while others remain; then fill up with what was passed over. */
function prune(children, isElite) {
  const sorted = children.slice().sort((a, b) => b.score - a.score);
  const kept = [], passed = [], seen = new Set(), inBucket = new Map(), onWorker = new Array(workers).fill(0);
  const cap = Math.ceil(1.5 * BEAM / workers);
  const take = (c) => { kept.push(c); onWorker[c.worker]++; };
  for (const c of sorted) if (isElite(c)) { take(c); seen.add(same(c)); }
  for (const c of sorted) {
    if (isElite(c)) continue;
    if (seen.has(same(c))) continue; // the same car twice: drop for good
    seen.add(same(c));
    const bucket = `${Math.floor(c.lateral / latBin)},${Math.floor(c.progress / alongBin)}`;
    const n = inBucket.get(bucket) ?? 0;
    if (kept.length < BEAM && n < perBucket && onWorker[c.worker] < cap) { inBucket.set(bucket, n + 1); take(c); }
    else passed.push(c);
  }
  for (const c of passed) { if (kept.length >= BEAM) break; take(c); }
  return kept;
}
/** Two results are the same car if they agree to a millimetre and a mm/s. */
const same = (c) => `${c.progress.toFixed(3)},${c.lateral.toFixed(3)},${c.speed.toFixed(3)}`;

/** Drive the given members to the finish with the policy; make the fastest
 *  the incumbent (and its member the elite) if it beats the incumbent.
 *  Returns the finish times (ticks) of those that finished. */
async function rollOut(list, label) {
  const replies = await ask(Array.from({ length: workers }, (_, w) => {
    const runs = list.filter((m) => m.worker === w).map((m) => ({ node: m.node }));
    return runs.length ? { cmd: 'finish', runs } : null;
  }));
  const times = [];
  replies.forEach((reply, w) => reply?.laps.forEach((lap) => {
    if (!lap.finished) return;
    times.push(lap.finishFrames);
    if (lap.finishFrames >= incumbent.frames) return;
    console.log(`  ${elapsed().toFixed(0).padStart(4)} s  ${label}: ${secs(lap.finishFrames)}  (-${incumbent.frames - lap.finishFrames} ms)`);
    incumbent = { decisions: lap.decisions, frames: lap.finishFrames, source: 'beam' };
    elite = { worker: w, node: lap.node, rest: lap.rest };
  }));
  return times;
}

// --- the search ----------------------------------------------------------------
console.log(`beam ${BEAM}, ${samples} samples${alts ? ' + 3 alternatives' : ''} per member, rank by ${rank}` +
  `${lookahead ? ` (${lookahead} decisions ahead)` : ''}, ${workers} processes`);
let depth = startDepth, crossed = false, tried = 0, rolled = 0, rolledFinished = 0;
const isEliteMember = (m) => m.worker === elite.worker && m.node === elite.node;

while (!crossed && (maxDepth === 0 || depth < maxDepth) && (seconds === 0 || elapsed() < seconds)) {
  // 1. extend every member
  const replies = await ask(Array.from({ length: workers }, (_, w) => {
    const parents = members.filter((m) => m.worker === w).map((m) => ({ node: m.node, forced: isEliteMember(m) ? elite.rest[0] : null }));
    return parents.length ? { cmd: 'expand', parents, samples, alts, temperature, lookahead, seed: Math.floor(rng() * 2 ** 31) } : null;
  }));
  depth++;
  const alive = [];
  let eliteChild = null; // the candidate that is the incumbent's next decision
  replies.forEach((reply, w) => reply?.children.forEach((c) => {
    tried++;
    c.worker = w;
    const onIncumbent = c.first && w === elite.worker && c.parent === elite.node;
    if (c.node === null) {
      if (c.finished) {
        crossed = true;
        if (c.finishFrames < incumbent.frames) {
          console.log(`  ${elapsed().toFixed(0).padStart(4)} s  across the line: ${secs(c.finishFrames)}  (-${incumbent.frames - c.finishFrames} ms)`);
          incumbent = { decisions: c.decisions, frames: c.finishFrames, source: 'beam' };
        }
      } else if (onIncumbent) throw new Error(`the incumbent lap ended (${c.reason}) at decision ${depth}: replay is not exact`);
      return;
    }
    if (onIncumbent) eliteChild = c;
    // A candidate that dies in its lookahead is dropped, except the elite,
    // whose way to the finish is known and is not the policy's.
    if (c.lookDead && !onIncumbent) return;
    c.score = c.lookDead ? -Infinity : SCORE[rank](c);
    alive.push(c);
  }));
  if (crossed) break;

  // 2. prune; the kept candidates become save states, the rest and the old
  //    members are freed
  members = prune(alive, (c) => c === eliteChild);
  const made = await ask(Array.from({ length: workers }, (_, w) => ({
    cmd: 'commit', picks: members.filter((m) => m.worker === w).map((m) => ({ parent: m.parent, decision: m.decision })),
  })));
  for (let w = 0; w < workers; w++) members.filter((m) => m.worker === w).forEach((m, i) => { m.node = made[w].nodes[i]; });
  elite = { worker: eliteChild.worker, node: eliteChild.node, rest: elite.rest.slice(1) };

  // 3. now and then, the finish time of the top few
  if (rollEvery > 0 && depth % rollEvery === 0) {
    const top = members.filter((m) => !isEliteMember(m)).sort((a, b) => b.score - a.score).slice(0, rollTop);
    rolled += top.length;
    rolledFinished += (await rollOut(top, `${(depth * 0.05).toFixed(2)} s into the lap`)).length;
  }
  if (depth % 20 === 0) {
    const p = members.map((m) => m.progress), l = members.map((m) => m.lateral);
    console.log(`  ${elapsed().toFixed(0).padStart(4)} s  decision ${depth}: ${members.length} members, ` +
      `along ${Math.min(...p).toFixed(1)}..${Math.max(...p).toFixed(1)} (policy ${policyLap.trace[depth - 1] ?? '-'}), ` +
      `across ${Math.min(...l).toFixed(2)}..${Math.max(...l).toFixed(2)}, incumbent ${secs(incumbent.frames)}, ${(ticks / 1e6).toFixed(2)} M ticks`);
  }
}

// --- the end of the stretch -----------------------------------------------------
// Stopped short of the line: every member is driven to the finish, so the
// stretch is judged by lap time and not by where it ended.
if (!crossed) {
  const p = members.map((m) => m.progress);
  console.log(`stopped at decision ${depth} (${(depth * 0.05).toFixed(2)} s): the beam is at ${Math.min(...p).toFixed(1)}..${Math.max(...p).toFixed(1)} units, ` +
    `the policy's own lap was at ${policyLap.trace[depth - 1] ?? '-'}`);
  const rest = members.filter((m) => !isEliteMember(m));
  const times = await rollOut(rest, 'driven on from the end of the stretch');
  // The mean says how good the beam's members are as a set, which is what the
  // ranking controls; the best alone is partly luck.
  console.log(`  ${times.length} of ${rest.length} members finish when the policy drives on` + (times.length
    ? `: best ${secs(Math.min(...times))}, mean ${secs(times.reduce((a, b) => a + b, 0) / times.length)}, worst ${secs(Math.max(...times))}` : ''));
}

console.log(`\n${tried} candidates, ${rolled} mid-lap rollouts (${rolledFinished} finished), ${(ticks / 1e6).toFixed(2)} M ticks in ${elapsed().toFixed(0)} s ` +
  `(${(ticks / elapsed() / 1000).toFixed(0)} k ticks per second)`);
if (rebuilds.some((n) => n > 0)) console.log(`cars used up and rebuilt: ${rebuilds.join(', ')} (per process)`);
console.log(`${secs(startFrames)} -> ${secs(incumbent.frames)} (${startFrames - incumbent.frames} ms faster; policy's own lap ${secs(policyLap.finishFrames)})`);
pool.close();

// Verify with the game's own routine, on a simulator of its own (the pool is
// closed, so this is the only one running).
const result = await verifyAndSave({ track, keys: decisionsToKeys(incumbent.decisions), name: outName });
if (!result.ok || result.finishFrames !== incumbent.frames) {
  console.log(`FAIL: verify ${result.ok ? `gives ${result.finishFrames} ticks, not ${incumbent.frames}` : 'did not pass'}`);
  process.exit(1);
}
console.log(`verified: ${secs(result.finishFrames)}, ${result.files.join(', ')}`);
process.exit(0);
