// The author's scripts as the README runs them, the cache against a fresh
// build, and the "no human lap" claim read off the source. About 45 s; each
// script is awaited, so never more than one simulator.
//
//   validate.mjs           the 17-track table: exit code, the summary, and
//                          every row against the README's table
//   smoke_test.mjs desert4 exit code and its printed results
//   fresh builds           buildRoute() run now on summer1 and winter4 must give
//                          the routes that are in cache/ (every other test, and
//                          every user of routeFor, reads the cache)
//   imports                route.mjs, surface.mjs, progress.mjs, observation.mjs
//                          and route_store.mjs must not read a lap
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTrackInfo } from '../../shared/track_info.mjs';
import { buildRoute, gateStages } from '../route.mjs';
import { routeFor } from '../route_store.mjs';
import { check, near, fmt, section } from './_check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const folder = 'ideas/g2-1-reference-free-inputs';
const run = (script, args = [], timeoutMs = 150000) => new Promise((resolve) => {
  execFile(process.execPath, [path.join(folder, script), ...args], { cwd: root, timeout: timeoutMs, maxBuffer: 1 << 26 }, (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, out: stdout, err: stderr }));
});
const lines = (text) => text.split(/\r?\n/);
const firstError = (err) => lines(err).filter((l) => /Error/.test(l) && !/wasm streaming/.test(l))[0] ?? '';

await section('imports', () => {
  // "Nothing else reads a lap" (README): the modules a lap-free environment would load.
  const offenders = [];
  for (const file of ['route.mjs', 'surface.mjs', 'progress.mjs', 'observation.mjs', 'route_store.mjs']) {
    const source = readFileSync(path.join(root, folder, file), 'utf8');
    for (const m of source.matchAll(/^\s*import[^;]*?from\s+'([^']+)'/gm)) if (/laps|human|recording|drive\.mjs|racing_env/.test(m[1])) offenders.push(`${file} imports ${m[1]}`);
    if (/data\/laps|humanLaps|loadHumanLap|refLap/.test(source.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''))) offenders.push(`${file} mentions a lap in code`);
  }
  check('reference-free: route, surface, progress, observation and route_store import nothing that reads a human lap', offenders.length === 0, offenders.join('; '));
});

await section('fresh build against the cache', () => {
  for (const track of ['summer1', 'winter4']) {
    const info = loadTrackInfo(track);
    const cached = routeFor(info);
    const t0 = Date.now();
    const built = buildRoute(info);
    const seconds = (Date.now() - t0) / 1000;
    let worst = 0;
    const same = built.points.length === cached.points.length;
    if (same) for (let k = 0; k < built.points.length; k++) worst = Math.max(worst, Math.hypot(...built.points[k].map((v, c) => v - cached.points[k][c])));
    check(`${track}: the route built now from the track is the cached one (same points to 0.001, same gate points, flights and length)`, same && worst < 1e-3 && built.gateIndex.join() === cached.gateIndex.join() && built.length === cached.length && built.jumps.length === cached.jumps.length && built.ok === cached.ok,
      `${built.points.length} points against ${cached.points.length}, largest difference ${fmt(worst, 5)}, built in ${fmt(seconds, 1)} s`);
    // Building twice gives the same route (no randomness, no state left behind).
    if (track === 'summer1') {
      const again = buildRoute(info);
      check('summer1: building the route twice gives the same route', again.points.length === built.points.length && again.points.every((p, k) => p.every((v, c) => v === built.points[k][c])));
      // gateStages: one stage per checkpoint order, then the finish.
      const stages = gateStages(info.parts);
      check('summer1: gateStages gives one stage per checkpoint, then the finish (4 stages), each a detector box with a centre and a size', stages.length === 4 && stages.at(-1).every((g) => g.isFinish) && stages.slice(0, -1).every((s) => s.length >= 1 && s.every((g) => !g.isFinish && g.center.length === 3 && g.size.length === 3)), `${stages.map((s) => s.length).join(', ')} gate parts per stage`);
    }
  }
});

await section('validate.mjs', async () => {
  const r = await run('validate.mjs');
  check('validate.mjs: runs and exits 0', r.code === 0, firstError(r.err));
  const out = lines(r.out);
  check('validate.mjs: "keeps step: 15 of 17" and "loses step: 2 of 17 (summer4, desert5)", no track without a route (README)', out.some((l) => /^keeps step: 15 of 17/.test(l)) && out.some((l) => /^loses step: 2 of 17\s+\(summer4, desert5\)/.test(l)) && out.some((l) => /^no route: 0 of 17/.test(l)), out.filter((l) => /step:|no route/.test(l)).join(' | '));
  // Each plain row (not the * reruns) against the README's table.
  const readme = readFileSync(path.join(root, folder, 'README.md'), 'utf8');
  const differ = []; let rows = 0;
  for (const line of lines(readme)) {
    const m = line.match(/^\| ((?:summer|winter|desert)\d) \| (\d+) of (\d+) \| (\d+) \/ (\d+) \| ([\d.]+) \/ ([\d.]+) \/ ([\d.]+) \| \**(\d+)%\** \| (\d+)% \| ([\d.]+) \| \**([\d.]+) s\** \|/);
    if (!m) continue;
    rows++;
    const row = out.find((l) => l.startsWith(`${m[1]} `));
    const f = row?.trim().split(/\s+/);
    if (!f) { differ.push(`${m[1]}: no line printed`); continue; }
    // columns: track route len jumps med p95 max gndmax pace above back stall end same noroad build
    const [routeLength, humanLength] = f[2].split('/').map(Number);
    const got = { ok: f[1] === 'ok', routeLength, humanLength, med: +f[4], p95: +f[5], max: +f[6], pace: +f[8], above: +f[9], back: +f[10], stall: +f[11], end: +f[12], noRoad: +f[14] };
    const bad = [];
    if (!got.ok || m[2] !== m[3]) bad.push('gates');
    if (got.routeLength !== +m[4] || got.humanLength !== +m[5]) bad.push(`lengths ${f[2]}`);
    if (!near(got.med, +m[6], m[6].includes('.') ? 0.051 : 0.51) || !near(got.p95, +m[7], 0.51) || !near(got.max, +m[8], 0.51)) bad.push(`distance ${f[4]} / ${f[5]} / ${f[6]}`);
    if (!near(100 * got.pace, +m[9], 0.51) || !near(100 * got.above, +m[10], 0.51)) bad.push(`pace ${f[8]}, above ${f[9]}`);
    if (!near(got.back, +m[11], 0.051) || !near(got.stall, +m[12], 0.051)) bad.push(`drop ${f[10]}, stall ${f[11]}`);
    if (got.end < 0.998) bad.push(`ends at ${f[12]}`);          // README: "ended within 0.2% of the route's length"
    if (got.noRoad > 0.005) bad.push(`no road ${f[14]}`);       // README: "under 0.5%"
    if (bad.length) differ.push(`${m[1]}: ${bad.join(', ')}`);
  }
  check('validate.mjs: all 17 rows it prints are the README\'s table (gates, lengths, distances, off pace, above, drop, stall; end within 0.2%; no-road under 0.5%)', rows === 17 && differ.length === 0, differ.join(' | ') || `${rows} rows`);
});

await section('smoke_test.mjs', async () => {
  const r = await run('smoke_test.mjs', ['desert4']);
  const out = r.out;
  check('smoke_test.mjs desert4: exits 0 with "all checks passed" and no FAIL line', r.code === 0 && /all checks passed/.test(out) && !/^FAIL/m.test(out), firstError(r.err) || lines(out).filter((l) => /^FAIL/.test(l)).join(' | '));
  check('smoke_test.mjs: the "as now" entries equal RacingEnv\'s own observation over 178 decisions, largest difference 0 (README)', /equal RacingEnv's over 178 decisions \(largest difference 0\.0e\+0\)/.test(out), lines(out).find((l) => /equal RacingEnv/.test(l)) ?? '');
  check('smoke_test.mjs: 435 observations along the human lap, progress never drops, finish at 21750 ms with progress = the route\'s length (README)', /435 observations along the human lap: all finite/.test(out) && /finished in 21750 ms; progress at the finish = 1984 of 1984/.test(out) && /largest drop 0\.00 units/.test(out), lines(out).find((l) => /finished in/.test(l)) ?? '');
  check('smoke_test.mjs: a car holding only W is seen to have no road under it from 3050 ms (README)', /no surface under it from 3050 ms/.test(out), lines(out).find((l) => /leave the road/.test(l)) ?? '');
  const ms = +(out.match(/([\d.]+) ms per observation/)?.[1] ?? NaN);
  check('smoke_test.mjs: an observation takes under 2 ms (README: 0.5 to 0.7 ms)', ms > 0 && ms < 2, `${ms} ms`);
});
