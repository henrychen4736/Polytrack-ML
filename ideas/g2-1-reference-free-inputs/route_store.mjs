// Build a track's route once and keep it on disk.
//
// Building a route means sampling the whole collision mesh and searching it
// (2 to 30 s per track, see README). A route is small (a few thousand points),
// so it is saved in cache/ under a name made from the track's own data and
// the route settings; the next call for the same track reads it back in a
// few milliseconds. The cache is git-ignored and stays on this machine (it is
// derived from Kodub's part geometry).
//
//   const route = routeFor(loadTrackInfo('desert4'));          // official track
//   const route = routeFor(loadTrackInfo(saveString));         // any track
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { buildRoute, DEFAULTS } from './route.mjs';

/** Change this whenever route.mjs or surface.mjs would give a different
 *  route for the same track, so old cache files are not picked up. */
export const ROUTE_VERSION = 1;
const CACHE = new URL('./cache/', import.meta.url);

/**
 * The route for a track (info = loadTrackInfo(...)), from the cache if it is
 * there. options: overrides for route.mjs DEFAULTS; `fresh: true` rebuilds.
 * The returned route has no `surface` field (that is the multi-megabyte
 * search graph, not needed to use a route).
 */
export function routeFor(info, { fresh = false, ...options } = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const key = createHash('sha1').update(String(info.createCar.trackData)).update(JSON.stringify([ROUTE_VERSION, cfg])).digest('hex').slice(0, 16);
  const file = new URL(`route_${info.name ?? 'track'}_${key}.json`, CACHE);
  if (!fresh && existsSync(file)) {
    const r = JSON.parse(readFileSync(file, 'utf8'));
    for (const f of ['edgeLeft', 'edgeRight', 'curvature', 'slope']) if (r[f]) r[f] = Float32Array.from(r[f]);
    return r;
  }
  const { surface, ...route } = buildRoute(info, options);
  void surface;
  mkdirSync(CACHE, { recursive: true });
  // Float32Arrays are written as plain arrays; 4 decimals is 0.1 mm.
  writeFileSync(file, JSON.stringify(route, (k, v) => (v instanceof Float32Array ? Array.from(v, (x) => +x.toFixed(4)) : typeof v === 'number' ? +v.toFixed(4) : v)));
  return route;
}
