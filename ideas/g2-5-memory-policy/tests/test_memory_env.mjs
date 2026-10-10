// MemoryEnv (memory_env.mjs) on the real simulator, desert3, one simulator at
// a time. The memory inputs of EVERY observation are compared with a slow
// reference written here from the README's description (RefMemory below),
// fed by a trace this test records itself, so a wiring mistake between the
// environment and the map (wrong clock, wrong stretch, an attempt committed
// twice or not at all) shows as a number that differs.
//
//   node ideas/g2-5-memory-policy/tests/test_memory_env.mjs
import { MemoryEnv, MEMORY_OBS_SIZE, MEM_SIZE } from '../memory_env.mjs';
import { OBS_SIZE } from '../../../rl/racing_env.mjs';
import { loadPolicy } from '../../shared/policy.mjs';
import { BLOCK_ENV } from '../../shared/block_rollout.mjs';
import { check, known, finish } from './check.mjs';

// ---------------------------------------------------------------------------------
// The slow reference. Per 2-unit bin: visits, crashes, best surviving pass
// {speed, lateral, tick}, worst doomed pass {speed, lateral}. Plain objects
// and loops, nothing shared with track_memory.mjs.
class RefMemory {
  constructor(length) { this.last = Math.ceil(length / 2); this.bins = new Map(); this.attempts = 0; this.finished = false; this.furthest = 0; }
  at(b) { if (!this.bins.has(b)) this.bins.set(b, { visits: 0, crashes: 0, pass: null, fail: null }); return this.bins.get(b); }
  binOf(progress) { return Math.min(this.last, Math.max(0, Math.floor(progress / 2))); }
  add(trace, how) {            // how: 'crashed' | 'finished' | 'other'
    const furthest = Math.max(...trace.map((s) => s.progress));
    const stop = trace.find((s) => s.progress >= furthest - 1).tick;       // when it stopped getting anywhere
    let seen = this.binOf(trace[0].progress) - 1;
    for (const s of trace) {
      const b1 = this.binOf(s.progress);
      for (let b = seen + 1; b <= b1; b++) {
        if (b < 0) continue;
        const bin = this.at(b);
        bin.visits++;
        let survived, doomed = false;
        if (how === 'finished') survived = true;
        else if (how === 'crashed') { survived = s.tick + 3000 < stop; doomed = !survived && s.tick <= stop; }
        else survived = s.tick + 3000 < trace.at(-1).tick;
        if (survived && s.speedKmh > (bin.pass?.speed ?? 0)) bin.pass = { speed: s.speedKmh, lateral: s.lateral, tick: s.tick };
        if (doomed && (bin.fail == null || Math.max(1, s.speedKmh) < bin.fail.speed)) bin.fail = { speed: Math.max(1, s.speedKmh), lateral: s.lateral };
      }
      seen = Math.max(seen, b1);
    }
    if (how === 'crashed') this.at(this.binOf(furthest)).crashes++;
    this.attempts++;
    if (how === 'finished') this.finished = true;
    this.furthest = Math.max(this.furthest, furthest);
  }
  read(edges, tick) {
    const clip = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const out = [];
    for (let k = 0; k < 21; k++) {
      let visits = 0, crashes = 0, pass = null, fail = null;
      if (edges[k] < this.last * 2) {
        const from = this.binOf(edges[k]), to = Math.max(from + 1, Math.min(this.last + 1, Math.floor(edges[k + 1] / 2)));
        for (let b = from; b < to; b++) {
          const bin = this.bins.get(b);
          if (!bin) continue;
          visits = Math.max(visits, bin.visits); crashes += bin.crashes;
          if (bin.pass && (!pass || bin.pass.speed > pass.speed)) pass = bin.pass;
          if (bin.fail && (!fail || bin.fail.speed < fail.speed)) fail = bin.fail;
        }
      }
      out.push(Math.min(visits, 4) / 4, Math.min(crashes, 3) / 3, pass ? pass.speed / 300 : 0, pass ? clip(pass.lateral / 10, -3, 3) : 0, fail ? fail.speed / 300 : 0, fail ? clip(fail.lateral / 10, -3, 3) : 0);
    }
    const here = this.bins.get(this.binOf(edges[0]));
    out.push(Math.min(this.attempts, 8) / 8, this.finished ? 1 : 0, here?.pass ? clip((tick - here.pass.tick) / 2000, -3, 3) : 0, clip((this.furthest - edges[0]) / 100, 0, 3));
    return out;
  }
}

// ---------------------------------------------------------------------------------
const OFF = [1, 0, 1, 0, 0, 0];            // W and left: off the road
const policy = loadPolicy('rl/checkpoints/ppo_blkgen.best2.actor.bin');
const menv = await MemoryEnv.create({ track: 'desert3', ...BLOCK_ENV, sessionMax: 0 });
const renv = menv.renv;
let ref = null;

/** The 22 edges of the 21 stretches, from the README: the car's place and the
 *  20 lookahead points max(2 units, 0.15 s x speed) apart, clamped to the
 *  line's last point, plus one more gap to close the last stretch. */
function edgesNow() {
  const gap = Math.max(2, (renv.state.speedKmh / 3.6) * 0.15);
  const last = renv.line.points.length - 1;
  const edges = [renv.progressIndex];
  for (let k = 1; k <= 20; k++) edges.push(Math.min(last, renv.progressIndex + Math.round(k * gap)));
  edges.push(edges[20] + gap);
  return edges;
}
const sample = () => ({ progress: renv.progress, speedKmh: renv.state.speedKmh, lateral: renv.lateral, tick: renv.state.frames });

/**
 * One attempt from the start line: the policy's top choices, from decision
 * `sabotage` on W + left. Compares every observation with the reference.
 * Returns what the checks need.
 */
async function attempt({ sabotage = Infinity, maxDecisions = 2000 } = {}) {
  let { obs, info } = await menv.reset({ startFraction: 0 });
  ref ??= new RefMemory(renv.line.length);
  const trace = [sample()];
  const a = { attempt: info.attempt, decisions: 0, worst: 0, worstAt: null, peak: 0, crashLit: 0, lengthOk: true, baseOk: true, firstObs: obs, lastInfo: null };
  const look = (o) => {
    a.lengthOk &&= o.length === MEMORY_OBS_SIZE;
    const expected = ref.read(edgesNow(), renv.state.frames);
    for (let j = 0; j < MEM_SIZE; j++) {
      const d = Math.abs(o[OBS_SIZE + j] - expected[j]);
      if (d > a.worst) { a.worst = d; a.worstAt = `decision ${a.decisions}, input ${j}: got ${o[OBS_SIZE + j]}, expected ${expected[j]}`; }
      a.peak = Math.max(a.peak, Math.abs(o[OBS_SIZE + j]));
    }
    for (let k = 0; k < 21; k++) if (o[OBS_SIZE + 6 * k + 1] > 0) { a.crashLit++; break; }
    // The first 352 numbers are RacingEnv's own observation, untouched.
    const base = renv._observe();
    for (let j = 0; j < OBS_SIZE; j++) if (o[j] !== base[j]) a.baseOk = false;
  };
  look(obs);
  for (let k = 0; k < maxDecisions; k++) {
    const r = await menv.stepBlock(k >= sabotage ? OFF : policy.decide(obs.slice(0, OBS_SIZE)));
    a.decisions++;
    trace.push(sample());
    obs = r.obs;
    look(obs);
    if (r.terminated || r.truncated) { a.lastInfo = r.info; break; }
  }
  const reason = a.lastInfo.reason;
  a.how = reason === 'finished' ? 'finished' : ['stalled', 'off line', 'off track'].includes(reason) ? 'crashed' : 'other';
  a.furthest = Math.max(...trace.map((s) => s.progress));
  ref.add(trace, a.how);
  return a;
}
const firstMemoryIsZero = (a) => a.firstObs.slice(OBS_SIZE).every((v) => v === 0);

// --- attempt 1: a crash made to order, 3 s in -------------------------------------------
const a1 = await attempt({ sabotage: 60 });
check(MEMORY_OBS_SIZE === 482 && menv.obsSize === 482 && a1.lengthOk, 'every observation is 352 + 130 = 482 long');
check(a1.baseOk, 'the first 352 numbers are exactly RacingEnv\'s own observation');
check(a1.attempt === 1 && a1.peak === 0, `attempt 1 (${a1.decisions} decisions, ${a1.lastInfo.reason}): every memory input of every observation is exactly 0, the one after the crash included`);
check(a1.how === 'crashed' && a1.lastInfo.committed.crashBin === Math.floor(a1.furthest / 2) && a1.lastInfo.attempt === 1,
  `attempt 1's crash is recorded in the bin of the furthest point reached (${a1.furthest.toFixed(1)} units, bin ${a1.lastInfo.committed.crashBin})`);
check(a1.lastInfo.sessionEnd === false, 'with sessionMax 0 an attempt never ends the session');

// --- attempt 2: the memory of attempt 1, at every decision ---------------------------------
const a2 = await attempt();
check(a2.attempt === 2 && a2.firstObs[OBS_SIZE + 126] === 0.125 && a2.firstObs[OBS_SIZE + 127] === 0, 'attempt 2 starts with "attempts so far" at 1/8 and "has finished" at 0');
check(a2.worst < 1e-5, `attempt 2 (${a2.decisions} decisions, ${a2.lastInfo.reason}): all 130 memory inputs of every observation equal the reference (largest difference ${a2.worst.toExponential(1)})`, a2.worstAt);
check(a2.crashLit > 0 && a2.peak > 0, `attempt 2 sees attempt 1's crash ahead on ${a2.crashLit} of its ${a2.decisions + 1} observations`);
check(a2.baseOk, 'attempt 2: the first 352 numbers are still RacingEnv\'s own');

// --- attempts 3 and 4: several attempts in the map -----------------------------------------
const a3 = await attempt({ sabotage: 20 });
const a4 = await attempt();
check(a3.attempt === 3 && a4.attempt === 4 && a4.firstObs[OBS_SIZE + 126] === 0.375, 'attempts 3 and 4 count on (3/8 shown on the fourth)');
check(a3.worst < 1e-5 && a4.worst < 1e-5, `attempts 3 and 4: every memory input equals the reference with two and three attempts in the map (largest difference ${Math.max(a3.worst, a4.worst).toExponential(1)})`, a3.worstAt ?? a4.worstAt);

// --- memory: 0 holds the inputs at zero (the baseline) -----------------------------------------
menv.mcfg.memory = 0;
const off = await attempt({ sabotage: 0 }).catch((e) => e);
menv.mcfg.memory = 1;
check(off.attempt === 5 && off.peak === 0 && off.lengthOk, 'memory = 0: a fifth attempt of the same session sees 130 zeros in a 482-long observation');

// --- newSession() ---------------------------------------------------------------------------------
menv.newSession(); ref = null;
const fresh = await attempt({ sabotage: 0 });
check(fresh.attempt === 1 && fresh.peak === 0 && menv.memory.attempts === 1, 'newSession(): the next attempt is attempt 1 with every memory input 0');

// --- sessions of random length --------------------------------------------------------------------
// The length is drawn from the wrapper's own stream, mulberry32 seeded with
// sessionSeed + 104729, as 1 + floor(u x sessionMax). Written again here.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
menv.mcfg.sessionMax = 3;
menv.newSession();
const draw = mulberry32(0 + 104729);
const expectedLengths = Array.from({ length: 6 }, () => 1 + Math.floor(draw() * 3));
const seenAttempts = [];
let sessionsOk = true, zeroOk = true, countOk = true, lengths = [];
for (const length of expectedLengths) {
  ref = null;
  for (let n = 1; n <= length; n++) {
    const a = await attempt({ sabotage: 0 });
    seenAttempts.push(`${a.attempt}${a.lastInfo.sessionEnd ? '|' : ''}`);
    if (a.attempt !== n || a.lastInfo.sessionEnd !== (n === length)) sessionsOk = false;
    if ((n === 1) !== firstMemoryIsZero(a)) zeroOk = false;
    if (a.firstObs[OBS_SIZE + 126] !== (n - 1) / 8 || a.worst > 1e-5) countOk = false;
  }
  lengths.push(length);
}
console.log(`     attempts: ${seenAttempts.join(' ')}   (| = session end); lengths drawn here: ${expectedLengths.join(', ')}`);
check(sessionsOk, 'sessionMax 3: sessions have exactly the lengths the seed gives, and sessionEnd is set on the last attempt of each and on no other');
check(zeroOk, 'the memory inputs are all zero at the start of attempt 1 of a session and never at the start of a later one');
check(countOk, 'inside a session the attempt count and every memory input follow the reference');
check(new Set(lengths).size > 1 && Math.max(...lengths) <= 3 && Math.min(...lengths) >= 1, `session lengths vary within 1..3 (${lengths.join(', ')})`);

// --- a reference change called from outside ----------------------------------------------------------
menv.mcfg.sessionMax = 0; menv.newSession(); ref = null;
await attempt({ sabotage: 0 });
const lineBefore = renv.line;
await menv.setReference(1);
ref = null;
const switched = await attempt({ sabotage: 0 });
check(renv.line !== lineBefore && switched.attempt === 1 && switched.peak === 0 && menv.memory.count === Math.ceil(renv.line.length / 2) + 1,
  'setReference(): the next attempt is attempt 1 on a new, empty map sized for the new line');
await menv.close();

// --- a reference change made by RacingEnv itself (refLaps training) ---------------------------------
// With refLaps the environment switches reference inside reset() after
// refEvery episodes. The memory is cleared then, so for session_advantages
// (carry > 0) the attempt before the switch is the last of its session.
{
  const env2 = await MemoryEnv.create({ track: 'desert3', ...BLOCK_ENV, sessionMax: 6, sessionSeed: 3, refLaps: 2, refEvery: 2 });
  const rows = [];
  let line = null;
  for (let k = 0; k < 7; k++) {
    const { obs, info } = await env2.reset();
    const switchedNow = line !== null && env2.renv.line !== line;
    line = env2.renv.line;
    let r;
    do r = await env2.stepBlock(OFF); while (!r.terminated && !r.truncated);
    rows.push({ attempt: info.attempt, zero: obs.slice(OBS_SIZE).every((v) => v === 0), switchedNow, sessionEnd: r.info.sessionEnd });
  }
  await env2.close();
  console.log(`     refLaps run: ${rows.map((r) => `${r.switchedNow ? '(new line) ' : ''}${r.attempt}${r.sessionEnd ? '|' : ''}`).join(' ')}`);
  const switches = rows.filter((r) => r.switchedNow);
  check(switches.length >= 1 && switches.every((r) => r.attempt === 1 && r.zero), `refLaps: each of the ${switches.length} reference changes starts attempt 1 with an empty memory`);
  check(rows.every((r, k) => (r.attempt === 1) === r.zero && (k === 0 || r.attempt === 1 || r.attempt === rows[k - 1].attempt + 1)), 'refLaps: the memory is empty exactly on attempt 1, and attempts count up in between');
  const missed = rows.filter((r, k) => k > 0 && r.attempt === 1 && !rows[k - 1].sessionEnd).length;
  known(missed === 0, 'refLaps: every attempt that is followed by a cleared memory was flagged sessionEnd',
    `${missed} attempt(s) were followed by attempt 1 of a new session without info.sessionEnd (memory_env.mjs stepBlock: sessionEnd looks only at attemptsLeft). With carry > 0, session_advantages would pass value across that boundary.`);
}

finish();
