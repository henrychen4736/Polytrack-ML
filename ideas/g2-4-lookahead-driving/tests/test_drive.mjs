// drive.mjs, the command line, run as it is used (a child process, one
// simulator at a time): its seed list, its summary line, its log file, and the
// lap it verifies and saves. The saved files are named g2-4-test-drv and
// removed afterwards.
//
//   node ideas/g2-4-lookahead-driving/tests/test_drive.mjs
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sameKeys } from '../../shared/laps.mjs';
import { check, same, finish } from './check.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const TMP = fileURLToPath(new URL('./tmp/', import.meta.url));
mkdirSync(TMP, { recursive: true });
const ACTOR = 'actor=rl/checkpoints/ppo_blkgen.best2.actor.bin';
const drive = (...args) => {
  const r = spawnSync(process.execPath, ['ideas/g2-4-lookahead-driving/drive.mjs', ...args], { cwd: ROOT, encoding: 'utf8', timeout: 110000 });
  return { code: r.status, text: (r.stdout ?? '') + (r.stderr ?? '') };
};
const saved = [`${ROOT}runs/g2-4-test-drv_winter4.json`, `${ROOT}runs/g2-4-test-drv_winter4.recording.json`];

try {
  // --- plain, three seeds given as a range, with a log -------------------------------
  const log = `${TMP}plain.jsonl`;
  const plain = drive('winter4', ACTOR, 'mode=plain', 'sample=1', 'seeds=10..12', `log=${log}`);
  const seedLines = [...plain.text.matchAll(/^\s+seed (\d+): (.*)$/gm)].map((m) => [Number(m[1]), m[2]]);
  check(plain.code === 0 && same(seedLines.map((s) => s[0]), [10, 11, 12]), 'drive.mjs mode=plain seeds=10..12: one attempt per seed, exit code 0', plain.text.slice(-400));
  check(/finished 0 of 3;/.test(plain.text) && seedLines.every(([, text]) => /^(stalled|off track|off line) at .* 66\.[6-9]% of the line/.test(text)),
    'the three plain attempts stop near 66.8% and the summary says "finished 0 of 3"', seedLines.map((s) => s[1]).join(' | '));
  const rows = readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const fractions = rows.map((r) => r.fraction);
  const meanShare = Number(plain.text.match(/mean share of the line ([\d.]+)%/)[1]);
  check(rows.length === 3 && same(rows.map((r) => r.seed), [10, 11, 12]) && rows.every((r) => r.mode === 'plain' && r.sample === true && r.track === 'winter4' && !('decisions' in r) && r.simTicks === r.tick - 1)
    && Math.abs(meanShare - 100 * fractions.reduce((s, f) => s + f, 0) / 3) < 0.06,
  'log=: one JSON line per attempt with its settings; a plain attempt costs exactly its own ticks; the printed mean share is the mean of the three');
  const author = readFileSync(new URL('../logs/plain_sample.jsonl', import.meta.url), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.track === 'winter4' && r.seed <= 12);
  check(same(author.map((r) => [r.seed, r.tick, r.reason]), rows.map((r) => [r.seed, r.tick, r.reason])), 'these three attempts end on the same ticks as in the author\'s log (plain_sample.jsonl)');
  // A comma list, top choices.
  const top = drive('winter4', ACTOR, 'mode=plain', 'seeds=3,7');
  const topLines = [...top.text.matchAll(/^\s+seed (\d+): (.*?);/gm)].map((m) => [Number(m[1]), m[2]]);
  check(same(topLines.map((s) => s[0]), [3, 7]) && topLines[0][1] === topLines[1][1] && /off track at .* 36\.4% of the line/.test(topLines[0][1]),
    'seeds=3,7 without sample=1: top choices, the same attempt whatever the seed (off track at 36.4%)', top.text.slice(-300));
  check(drive('winter4').code === 1, 'drive.mjs without actor= prints its usage and exits with code 1');

  // --- lazy, one seed, verified and saved ---------------------------------------------------
  const lazy = drive('winter4', ACTOR, 'seeds=10', 'out=test-drv');
  check(lazy.code === 0 && /seed 10: FINISHED 19\.819 s; 37 replans, policy failed at 2, rescued 2, dead ends 0, backed up 0/.test(lazy.text) && /8\.7x the lap's ticks/.test(lazy.text),
    'drive.mjs seeds=10 out=test-drv: finished in 19.819 s, 37 replans, 2 troubled and rescued, 8.7x the lap\'s ticks', lazy.text.slice(-500));
  check(/verified: 19\.819 s \(human 19\.311 s\), saved runs\/g2-4-test-drv_winter4\.json, runs\/g2-4-test-drv_winter4\.recording\.json/.test(lazy.text) && saved.every(existsSync),
    'it reports the lap as verified and saves both files under the g2-4- prefix');
  if (saved.every(existsSync)) {
    const mine = JSON.parse(readFileSync(saved[0], 'utf8')), theirs = JSON.parse(readFileSync(`${ROOT}runs/g2-4-gen_winter4.json`, 'utf8'));
    const rec = JSON.parse(readFileSync(saved[1], 'utf8')), theirRec = JSON.parse(readFileSync(`${ROOT}runs/g2-4-gen_winter4.recording.json`, 'utf8'));
    check(mine.finishFrames === 19819 && mine.finished === true && sameKeys(mine.controlsPerTick, theirs.controlsPerTick) && rec.frames === 19819 && rec.recording === theirRec.recording,
      'the saved lap is the README\'s runs/g2-4-gen_winter4, key for key (the documented command reproduces it)');
  }
} finally {
  for (const file of saved) rmSync(file, { force: true });
  rmSync(TMP, { recursive: true, force: true });
}
finish();
