// Drive laps with the lookahead driver (lookahead.mjs) on one track with one
// checkpoint, and verify any lap that finishes. One process, one simulator.
//
// Usage, from the project root:
//   node ideas/g2-4-lookahead-driving/drive.mjs <track> actor=<weights file> [key=value ...]
//
//   actor=...      policy weights (python rl/export_actor.py <checkpoint.pt>)
//   critic=...     value weights, only for score=value
//                  (.venv/Scripts/python ideas/shared/export_critic.py <checkpoint.pt>)
//   mode=lazy      plain | lazy | full (see lookahead.mjs)
//   seeds=1        one attempt per seed: "3", "10..14" or "1,5,9". The seed
//                  drives the sampled continuations (and the whole lap in
//                  mode=plain sample=1); the rest is deterministic.
//   sample=0       mode=plain only: 1 = sample the policy, as rl/evaluate.py
//                  --policy sample does; 0 = its top choices
//   horizon=40 every=10 force=4,10 samples=6 sampleFor=20 temperature=1
//   score=reward   progress | reward | value
//   slowShare=0.4 back=6 maxBackups=30
//   maxOffLine=40  the environment's cut-off distance from the reference line
//   refLap=-1      which human lap is the reference (rl/racing_env.mjs)
//   out=           if given, the fastest finished lap is verified with the
//                  game's Verify and saved as runs/g2-4-<out>_<track>.json
//   log=           append one JSON line per attempt to this file
//
// A finished lap's time is printed as "verified" only after shared
// verifyAndSave has passed it; without out= the fastest lap is still verified,
// just not saved.
import { appendFileSync } from 'node:fs';
import { openBlockEnv } from '../shared/block_rollout.mjs';
import { loadPolicy, loadValue } from '../shared/policy.mjs';
import { decisionsToKeys } from '../shared/laps.mjs';
import { verifyAndSave } from '../shared/verify.mjs';
import { driveLap, DEFAULTS } from './lookahead.mjs';

const args = process.argv.slice(2);
const track = args.find((a) => !a.includes('='));
const opt = Object.fromEntries(args.filter((a) => a.includes('=')).map((a) => a.split('=')));
if (!track || !opt.actor) { console.error('Usage: node ideas/g2-4-lookahead-driving/drive.mjs <track> actor=<weights file> [key=value ...]'); process.exit(1); }
const num = (key) => Number(opt[key] ?? DEFAULTS[key]);
/** "3" -> [3], "10..12" -> [10, 11, 12], "1,5" -> [1, 5] */
const seeds = (opt.seeds ?? '1').includes('..')
  ? (([a, b]) => Array.from({ length: b - a + 1 }, (_, k) => a + k))(opt.seeds.split('..').map(Number))
  : (opt.seeds ?? '1').split(',').map(Number);

const settings = {
  mode: opt.mode ?? DEFAULTS.mode,
  horizon: num('horizon'), every: num('every'),
  force: opt.force != null ? opt.force.split(',').filter(Boolean).map(Number) : DEFAULTS.force,
  samples: num('samples'), sampleFor: num('sampleFor'), temperature: num('temperature'),
  score: opt.score ?? DEFAULTS.score, slowShare: num('slowShare'), back: num('back'), maxBackups: num('maxBackups'),
  sample: opt.sample === '1',
};
const policy = loadPolicy(opt.actor);
const value = opt.critic ? loadValue(opt.critic) : null;
const renv = await openBlockEnv(track, { maxOffLine: Number(opt.maxOffLine ?? 40), refLap: Number(opt.refLap ?? -1) });
const human = renv.human.frames;
const describe = settings.mode === 'plain' ? `plain policy (${settings.sample ? 'sampled' : 'top choices'})`
  : `${settings.mode} lookahead, horizon ${settings.horizon}, every ${settings.every}, force ${settings.force.join('/')}, ${settings.samples} samples, score ${settings.score}`;
console.log(`${track}, ${opt.actor}: ${describe}; reference lap ${(human / 1000).toFixed(3)} s`);

let finishedCount = 0, fractionSum = 0, best = null, simTicks = 0, lapTicks = 0, seconds = 0;
for (const seed of seeds) {
  const lap = await driveLap(renv, policy, { ...settings, value, seed });
  if (lap.finished) { finishedCount++; if (!best || lap.finishFrames < best.finishFrames) best = lap; }
  fractionSum += lap.finished ? 1 : lap.fraction;
  simTicks += lap.simTicks; lapTicks += lap.tick; seconds += lap.seconds;
  const end = lap.finished ? `FINISHED ${(lap.finishFrames / 1000).toFixed(3)} s` : `${lap.reason} at ${(lap.tick / 1000).toFixed(2)} s, ${(100 * lap.fraction).toFixed(1)}% of the line`;
  const plan = settings.mode === 'plain' ? '' : `; ${lap.replans} replans, policy failed at ${lap.troubled}, rescued ${lap.rescued}, dead ends ${lap.deadEnds}, backed up ${lap.backups}; picks ${JSON.stringify(lap.picks)}`;
  // Slowdown: wall time against the lap's own duration (1 = real time).
  console.log(`  seed ${seed}: ${end}${plan}; ${lap.seconds.toFixed(1)} s wall, ${(lap.seconds / (lap.tick / 1000)).toFixed(2)}x real time, ${(lap.simTicks / lap.tick).toFixed(1)}x the lap's ticks`);
  if (opt.log) {
    const { decisions, ...row } = lap;
    appendFileSync(opt.log, JSON.stringify({ track, actor: opt.actor, ...settings, seed, human, ...row }) + '\n');
  }
}
console.log(`finished ${finishedCount} of ${seeds.length}; mean share of the line ${(100 * fractionSum / seeds.length).toFixed(1)}%; ` +
  `${(seconds / (lapTicks / 1000)).toFixed(2)}x real time, ${(simTicks / lapTicks).toFixed(1)}x the laps' ticks, ${(simTicks / seconds / 1000).toFixed(1)}k ticks per wall second`);

// The fastest finished lap: play its keys from the start line on the bare
// simulator and run the game's Verify. Uses this process's simulator, which
// replaces the car, so it comes last.
let ok = true;
if (best) {
  const r = await verifyAndSave({ track, keys: decisionsToKeys(best.decisions), name: `g2-4-${opt.out ?? 'x'}`, env: renv.env, save: !!opt.out });
  ok = r.ok && r.finishFrames === best.finishFrames;
  console.log(ok ? `verified: ${r.seconds.toFixed(3)} s (human ${(human / 1000).toFixed(3)} s)${r.files.length ? `, saved ${r.files.join(', ')}` : ''}`
    : `FAIL: Verify ${r.ok ? `gives ${r.finishFrames} ticks, the driver said ${best.finishFrames}` : 'did not pass'}`);
}
await renv.close();
process.exit(ok ? 0 : 1);
