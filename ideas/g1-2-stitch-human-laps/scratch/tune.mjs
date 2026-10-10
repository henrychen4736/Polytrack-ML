// scratch: one join, several follow settings; time lost at 3 s and at the finish
import { loadTrack } from '../../../sim/env.mjs';
import { humanLaps } from '../../shared/laps.mjs';
import { SimSession } from '../../shared/sim_session.mjs';
import { recordPath, crossings } from '../paths.mjs';
import { follow } from '../follow.mjs';
const [name, ...rest] = process.argv.slice(2);
const joins = rest.filter(a=>a.includes('>')).map(a=>a.split(/[>@]/).map(Number));
const settings = rest.filter(a=>a.startsWith('{')).map(a=>JSON.parse(a));
const sim = await SimSession.create(name); const track = loadTrack(name);
const paths=[]; for (const lap of humanLaps(name)) paths.push(await recordPath(sim.env, track, lap));
const { ticks } = crossings(paths, 250);
for (const [i,j,k] of joins) {
  await sim.restart(); await sim.drive(paths[i].keys.slice(0,ticks[i][k])); const P = await sim.save();
  for (const s of settings) {
    await sim.load(P); const t0=performance.now();
    let r = await follow(sim, paths[j], ticks[j][k], ticks[j][k]+3000, 'repair', s);
    const d3 = (sim.tick-ticks[i][k]) - (r.donorTick-ticks[j][k]); let tried=r.tried;
    let fin='lost';
    if(!r.lost){ r = await follow(sim, paths[j], r.donorTick, Infinity, 'repair', s); tried+=r.tried;
      fin = r.finished ? sim.state.finishFrames-(ticks[i][k]+paths[j].frames-ticks[j][k]) : 'nofin'; }
    console.log(`${i}>${j}@${k} ${JSON.stringify(s)}  at3s ${d3}  finish ${fin}  tried ${tried}  ${((performance.now()-t0)/1000).toFixed(1)}s`);
  }
}
await sim.close();
