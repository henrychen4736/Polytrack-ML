// Drive one lap of a track with a trained RL agent and open it in the game.
//
// This just runs the three usual steps one after another, so that checking a
// track is a single command:
//   1. python rl/evaluate.py          drive one attempt from the start line
//   2. node scripts/export_recording  turn it into a recording (and run the
//                                     game's Verify if the lap finished)
//   3. node scripts/watch_ghost       open the real client with it loaded
// An attempt that crashes is still saved and opened, so you can see where.
//
// Usage: node scripts/check_track.mjs <track> [seed] [--checkpoint file] [--greedy] [--check]
//   track         e.g. summer1, winter4, desert3 (any official track)
//   seed          which random attempt (default 0). The agent picks its
//                 actions with some randomness, so each seed is a different lap.
//   --checkpoint  which trained agent (default rl/checkpoints/ppo_general3.pt,
//                 the multi-track one). For the summer1 specialist use
//                 rl/checkpoints/ppo_summer1.pt
//   --greedy      always take the agent's top choice instead of sampling
//   --check       do not open a window; save screenshots to capture/ instead
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const valueOf = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--checkpoint');
const [track, seed = '0'] = positional;
if (!track) { console.error('usage: node scripts/check_track.mjs <track> [seed]'); process.exit(2); }
const checkpoint = valueOf('--checkpoint', 'rl/checkpoints/ppo_general3.pt');
// Laps from this script are saved as runs/check_<track>.json.
const run = 'check';

/** Run one step, showing its output. Returns its exit code. */
function step(title, command, commandArgs) {
  console.log(`\n=== ${title} ===`);
  return spawnSync(command, commandArgs, { stdio: 'inherit' }).status;
}

// evaluate.py exits with 1 when the lap did not finish; that is not an error
// here, the attempt is saved either way. Anything else is a real failure.
const driven = step(`1/3 driving ${track} (seed ${seed})`, 'python', [
  'rl/evaluate.py', '--track', track, '--checkpoint', checkpoint, '--run', run,
  '--policy', flag('--greedy') ? 'greedy' : 'sample', '--seed', seed,
]);
if (driven !== 0 && driven !== 1) process.exit(driven ?? 1);

if (step('2/3 exporting the recording', 'node', ['scripts/export_recording.mjs', track, run]) !== 0) process.exit(1);

process.exit(step('3/3 opening the game', 'node', ['scripts/watch_ghost.mjs', track, run, ...(flag('--check') ? ['--check'] : [])]) ?? 1);
