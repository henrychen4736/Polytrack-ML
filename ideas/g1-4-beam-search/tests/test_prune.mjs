// Pruning and bucketing (beam.mjs prune()) and the rank statistics of
// calibrate.mjs, on hand-built inputs. No simulator.
//
// beam.mjs and calibrate.mjs are scripts: importing them would start a
// search. The functions under test are therefore cut out of the source text
// (from their first line to their closing brace) and compiled here with the
// settings they read (BEAM, workers, latBin, alongBin, perBucket) passed in.
// It is the code in the file that runs, not a copy; if the function is
// renamed or reshaped the cut fails loudly.
import { readFileSync } from 'node:fs';
import { check, same, finish } from './harness.mjs';

const source = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
/** The text of a top-level `function name(` ... up to the first line that is just "}". */
function cut(text, start, endLine = '\n}\n') {
  const from = text.indexOf(start);
  if (from < 0) throw new Error(`cannot find "${start}" in the source`);
  const to = text.indexOf(endLine, from);
  return text.slice(from, to + endLine.length);
}

// ---- prune -----------------------------------------------------------------------------
const beamSrc = source('beam.mjs');
const pruneSrc = cut(beamSrc, 'function prune(children, isElite) {') + cut(beamSrc, 'const same = (c) =>', ';\n');
/** prune() as beam.mjs would run it with these settings. */
const makePrune = ({ BEAM, workers = 1, latBin = 0.25, alongBin = 0.5, perBucket = 2 }) =>
  new Function('BEAM', 'workers', 'latBin', 'alongBin', 'perBucket', `${pruneSrc}\nreturn prune;`)(BEAM, workers, latBin, alongBin, perBucket);
/** A candidate. By default each sits in a bucket of its own (progress 10 apart). */
let serial = 0;
const C = (name, score, at = {}) => ({ name, score, worker: 0, progress: 100 + 10 * serial++, lateral: 0.1, speed: 50, ...at });
const names = (list) => list.map((c) => c.name).join('');
const none = () => false;

{
  const list = [C('c', 3), C('a', 5), C('e', 1), C('b', 4), C('d', 2)];
  check('prune: keeps the BEAM best by score, best first', names(makePrune({ BEAM: 3 })(list, none)) === 'abc', names(makePrune({ BEAM: 3 })(list, none)));
  check('prune: fewer candidates than BEAM -> all of them', names(makePrune({ BEAM: 9 })(list, none)) === 'abcde');
  check('prune: the list given is not reordered', names(list) === 'caebd');
  check('prune: nothing in, nothing out', makePrune({ BEAM: 4 })([], none).length === 0);
}
{
  // Exact repeats: the same car (position and speed to a millimetre) twice.
  const twin = { progress: 55.1234, lateral: 0.3004, speed: 61.0001 };
  const list = [C('a', 5, twin), C('b', 4, { ...twin, progress: 55.1231 }), C('c', 3), C('d', 2, { ...twin, speed: 61.0021 })];
  const kept = makePrune({ BEAM: 4 })(list, none);
  check('prune: a candidate that is the same car as a better one (to 0.001) is dropped even when the beam has room', names(kept) === 'acd', names(kept));
  check('prune: 2 mm/s apart is not the same car', kept.some((c) => c.name === 'd'));
}
{
  // The bucket limit. Five candidates in one spot hold the five best scores;
  // three others are spread out. A beam of 4 with 2 per bucket must take two
  // from the spot and the two best of the others, not the top four.
  const spot = (name, score, i) => C(name, score, { progress: 200.05 + 0.01 * i, lateral: 0.05 + 0.01 * i });
  const list = [spot('a', 10, 0), spot('b', 9, 1), spot('c', 8, 2), spot('d', 7, 3), spot('e', 6, 4), C('x', 5), C('y', 4), C('z', 3)];
  check('prune: at most perBucket (2) from one bucket while better-spread candidates remain', names(makePrune({ BEAM: 4 })(list, none)) === 'abxy', names(makePrune({ BEAM: 4 })(list, none)));
  check('prune: perBucket=1', names(makePrune({ BEAM: 4, perBucket: 1 })(list, none)) === 'axyz', names(makePrune({ BEAM: 4, perBucket: 1 })(list, none)));
  check('prune: when the spread ones run out, the beam is filled with what was passed over, best first', names(makePrune({ BEAM: 7 })(list, none)) === 'abxyzcd', names(makePrune({ BEAM: 7 })(list, none)));
  check('prune: never more than BEAM', makePrune({ BEAM: 6 })(list, none).length === 6);
}
{
  // Bucket edges. latBin 0.25 across, alongBin 0.5 along.
  const P = makePrune({ BEAM: 2, perBucket: 1 });
  const pair = (a, b) => names(P([C('a', 9, a), C('b', 8, b), C('c', 7, { progress: 900 })], none));
  check('prune: across 0.01 and 0.24 share a bucket (the third, elsewhere, is taken instead of the second)', pair({ progress: 50.1, lateral: 0.01 }, { progress: 50.2, lateral: 0.24 }) === 'ac');
  check('prune: across 0.24 and 0.26 are different buckets', pair({ progress: 50.1, lateral: 0.24 }, { progress: 50.2, lateral: 0.26 }) === 'ab');
  check('prune: just right and just left of the line (-0.01, +0.01) are different buckets', pair({ progress: 50.1, lateral: -0.01 }, { progress: 50.2, lateral: 0.01 }) === 'ab');
  check('prune: across -0.01 and -0.24 share a bucket', pair({ progress: 50.1, lateral: -0.01 }, { progress: 50.2, lateral: -0.24 }) === 'ac');
  check('prune: along 50.49 and 50.51 are different buckets, 50.01 and 50.49 the same', pair({ progress: 50.49 }, { progress: 50.51 }) === 'ab' && pair({ progress: 50.01 }, { progress: 50.49 }) === 'ac');
  const wide = makePrune({ BEAM: 2, perBucket: 1, latBin: 1, alongBin: 5 });
  check('prune: the bucket sizes are the settings (latBin=1 alongBin=5 puts 0.24/0.26 and 50.49/50.51 together)',
    names(wide([C('a', 9, { progress: 50.49, lateral: 0.24 }), C('b', 8, { progress: 50.51, lateral: 0.26 }), C('c', 7, { progress: 900 })], none)) === 'ac');
}
{
  // The elite.
  const list = [C('a', 5), C('b', 4), C('c', 3), C('E', -Infinity)];
  const elite = (c) => c.name === 'E';
  check('prune: the elite is kept whatever its score, and counts towards BEAM', names(makePrune({ BEAM: 3 })(list, elite)) === 'Eab', names(makePrune({ BEAM: 3 })(list, elite)));
  check('prune: with a beam of 1 the elite is the only member', names(makePrune({ BEAM: 1 })(list, elite)) === 'E');
  const twin = { progress: 77, lateral: 0.2, speed: 40 };
  const withTwin = [C('a', 9, twin), C('E', 1, twin), C('b', 5)];
  check('prune: a candidate that is the same car as the elite is dropped, not the elite', names(makePrune({ BEAM: 3 })(withTwin, elite)) === 'Eb', names(makePrune({ BEAM: 3 })(withTwin, elite)));
  // The elite's bucket. The README's "at most perBucket are taken from one
  // bucket" does not say whether the elite counts; in the code it does not,
  // so the elite's own spot can hold perBucket + 1 members. Recorded here as
  // what the code does (see TESTING.md), with the bound that must hold either way.
  const crowd = [C('E', 1, { progress: 300.1 }), C('a', 9, { progress: 300.2 }), C('b', 8, { progress: 300.3 }), C('c', 7, { progress: 300.4 }), C('x', 2), C('y', 1.5)];
  check('prune: the elite is outside the bucket count: its bucket holds the elite + perBucket (2) others, never more while spread ones remain', names(makePrune({ BEAM: 5 })(crowd, elite)) === 'Eabxy', names(makePrune({ BEAM: 5 })(crowd, elite)));
}
{
  // Several processes: no process holds more than ceil(1.5 * BEAM / workers) while others have candidates.
  const w = (name, score, worker) => C(name, score, { worker });
  const list = [w('a', 9, 0), w('b', 8, 0), w('c', 7, 0), w('d', 6, 0), w('e', 5, 0), w('f', 4, 0), w('g', 3, 1), w('h', 2, 1)];
  check('prune: 2 processes, beam 4 -> at most 3 from one process while the other has candidates', names(makePrune({ BEAM: 4, workers: 2 })(list, none)) === 'abcg', names(makePrune({ BEAM: 4, workers: 2 })(list, none)));
  check('prune: ... but a process may fill the beam when the other has nothing left', names(makePrune({ BEAM: 4, workers: 2 })(list.slice(0, 6), none)) === 'abcd');
  check('prune: beam 8 on 2 processes -> the cap is 6', names(makePrune({ BEAM: 8, workers: 2 })([...list, w('i', 1, 0), w('j', 0.5, 0)], none)) === 'abcdefgh');
}

// ---- calibrate.mjs: ranks and Spearman -------------------------------------------------------
{
  const calSrc = source('calibrate.mjs');
  const { ranks, spearman } = new Function(`${cut(calSrc, 'function ranks(xs) {')}\n${cut(calSrc, 'function spearman(a, b) {')}\nreturn { ranks, spearman };`)();
  same('ranks: 1..n in order of size', ranks([30, 10, 20]), [3, 1, 2]);
  same('ranks: ties share their mean rank', ranks([5, 1, 5, 9, 5]), [3, 1, 3, 5, 3]);
  const close = (a, b) => Math.abs(a - b) < 1e-12;
  check('spearman: the same order -> 1', close(spearman([1, 2, 3, 4], [10, 20, 30, 400]), 1));
  check('spearman: the opposite order -> -1', close(spearman([1, 2, 3, 4], [9, 7, 5, 3]), -1));
  // Worked by hand: ranks 1 2 3 4 5 against 2 1 4 3 5; d = 1 1 1 1 0; 1 - 6*4 / (5*24) = 0.8
  check('spearman: [1,2,3,4,5] against [2,1,4,3,5] -> 0.8', close(spearman([1, 2, 3, 4, 5], [2, 1, 4, 3, 5]), 0.8), `${spearman([1, 2, 3, 4, 5], [2, 1, 4, 3, 5])}`);
  // With a tie: ranks a = 1 2.5 2.5 4, b = 1 2 3 4: Pearson = 4.5 / sqrt(4.5 * 5) = 0.9487
  check('spearman: with a tie, the Pearson correlation of the mean ranks (0.9487)', close(spearman([1, 2, 2, 3], [1, 2, 3, 4]), 4.5 / Math.sqrt(4.5 * 5)), `${spearman([1, 2, 2, 3], [1, 2, 3, 4])}`);
  check('spearman: a measure that is the same everywhere -> 0, not NaN', spearman([7, 7, 7], [1, 2, 3]) === 0);
}
finish();
