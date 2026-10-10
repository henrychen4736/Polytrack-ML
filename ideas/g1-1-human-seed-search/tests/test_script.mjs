// search_human.mjs as a command: exit codes, what it prints, what it writes.
// Each run uses the script's own 2 worker processes; nothing else runs
// alongside, and the independent replay happens after the script has ended.
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { Env, loadTrack } from '../../../sim/env.mjs';
import { humanLaps } from '../../shared/laps.mjs';
import { checker, runNode, removeFiles, ROOT } from '../../shared/tests/harness.mjs';

const { check, note } = checker();
const SCRIPT = 'ideas/g1-1-human-seed-search/search_human.mjs';
const human = humanLaps('desert4')[0];
const runFiles = ['runs/g1-1-test-run_desert4.json', 'runs/g1-1-test-run_desert4.recording.json'];
const progress = 'ideas/g1-1-human-seed-search/out/g1-1-test-run_desert4.recording.json';
const TMP = new URL('./tmp/', import.meta.url);
const clean = () => { removeFiles([...runFiles, progress]); rmSync(TMP, { recursive: true, force: true }); };
clean();
const exists = (file) => existsSync(new URL(file, ROOT));

// ---- a starting lap that does not finish: exit 1 -------------------------------------
mkdirSync(TMP, { recursive: true });
writeFileSync(new URL('test-short.recording.json', TMP), JSON.stringify({ track: 'desert4', frames: 3000, recording: human.recording }));
let r = await runNode(SCRIPT, ['desert4', 'seed=ideas/g1-1-human-seed-search/tests/tmp/test-short.recording.json', 'seconds=5', 'out=test-run']);
check(r.code === 1 && /does not finish/.test(r.out), `a starting lap that does not finish: exit code ${r.code} (want 1) and it says so`);
check(!runFiles.some(exists), 'and nothing is written to runs/');

// ---- no time to search: exit 0, nothing saved -------------------------------------------
// seed= the saved 21.722 s lap: the README's "continue a run" form.
r = await runNode(SCRIPT, ['desert4', 'seed=runs/g1-1-smoke_desert4.recording.json', 'seconds=0', 'last=800', 'out=test-run']);
check(r.code === 0 && /no improvement, nothing saved/.test(r.out), `seconds=0: exit code ${r.code} (want 0), "no improvement, nothing saved"`);
check(/starting from runs\/g1-1-smoke_desert4\.recording\.json, 21\.722 s/.test(r.out), 'seed=<saved lap> is driven, and comes out at 21.722 s');
check(!runFiles.some(exists), 'and nothing is written to runs/');

// ---- a real short search -------------------------------------------------------------------
// The last two sections for 16 s. In every trial run this found a few ms; if it
// finds nothing the remaining checks are skipped (and said so), not failed.
r = await runNode(SCRIPT, ['desert4', 'seconds=16', 'last=1500', 'out=test-run']);
const said = r.out.match(/(\d+\.\d+) s -> (\d+\.\d+) s \((\d+) ms faster/);
check(r.code === 0 && said && said[1] === '21.750', `16 s on the last 1.5 s of the human lap: exit code ${r.code}, starts from 21.750 s (${r.seconds.toFixed(0)} s wall time)`);
check(/searching for 16 s with 2 processes: 1 pass\(es\) over 2 sections/.test(r.out), 'last=1500 selects the 2 sections that start in the last 1.5 s; 2 processes by default');
if (said && Number(said[3]) > 0) {
  const claimed = Math.round(Number(said[2]) * 1000);
  check(new RegExp(`PASS Verify: the game finishes the result on tick ${claimed} and not on tick ${claimed - 1}`).test(r.out), `it reports PASS Verify for tick ${claimed}`);
  check(runFiles.every(exists), 'it wrote runs/g1-1-test-run_desert4.json and .recording.json (the name is g1-1-<out>)');
  if (runFiles.every(exists)) {
    const saved = JSON.parse(readFileSync(new URL(runFiles[1], ROOT), 'utf8'));
    const env = await Env.create(), inputs = loadTrack('desert4');
    const full = await env.evaluate(inputs, saved.recording, claimed + 1000);
    const verified = await env.worker.verify({ ...inputs, carRecording: saved.recording, targetFrames: claimed });
    const early = await env.worker.verify({ ...inputs, carRecording: saved.recording, targetFrames: claimed - 1 });
    await env.close();
    check(saved.frames === claimed && full.finished && full.finishFrames === claimed && verified && !early && claimed < human.frames,
      `independently: the saved lap replays to tick ${full.finishFrames}, Verify accepts ${claimed} and rejects ${claimed - 1}, and it beats the human's ${human.frames}`);
    const kept = JSON.parse(readFileSync(new URL(progress, ROOT), 'utf8'));
    check(kept.frames === claimed && kept.recording === saved.recording, 'out/<name>.recording.json (written on every improvement) ends up as the same lap');
  }
} else note('SKIP: the 16 s search found no improvement this time, so there is no saved lap to check');
clean();
