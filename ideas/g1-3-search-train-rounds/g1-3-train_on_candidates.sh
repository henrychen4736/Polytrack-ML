#!/bin/sh
# Search with near-best candidates kept, train towards all of them, test.
#
#   sh ideas/g1-3-search-train-rounds/g1-3-train_on_candidates.sh <track>
#   BASE=rl/checkpoints/ppo_sr2_desert4.final.pt sh ideas/g1-3-search-train-rounds/g1-3-train_on_candidates.sh desert4
#
# Why: a round of search-then-train (scripts/search_round.sh, rounds.mjs)
# trains towards ONE searched lap, about 440 imitation examples, and on
# desert4, summer4, summer1 and winter2 it has stalled (round 1 of rounds.mjs:
# -10, -21, -13 and +11 ms). One search finishes thousands of candidates; the
# ones within a few tens of ms of its best show the same fast driving from
# slightly different states. This trains towards those too (README change 3).
#
# Steps, each skipped when its result is already there (restartable after a
# shutdown; delete the work folder and rl/checkpoints/$NAME_<track>.* to start
# over):
#   1. export the base checkpoint's policy (rl/export_actor.py) and search
#      from it (scripts/search_rollout.mjs, one pass, keep=$KEEP): the
#      searched lap runs/$NAME_<track>.recording.json and every different
#      finished lap within $KEEP ms of it, runs/$NAME_<track>.candidates.json.
#      Done when both exist and the lap passes Verify (ideas/shared/verify_lap.mjs).
#   2. imitation examples (laps_bc.py): first the fastest verified lap of the
#      track ($BEST_LAP; its examples are at least half of the file), then
#      the $MAX_CANDIDATES fastest candidates. Laps with the same keys as one
#      already taken are skipped.
#   3. practice as search_round.sh does (the options of
#      scripts/train_block_specialist_from.sh, imitation weight 0.05 towards
#      these examples, --max-off-line 40), $STEPS decisions, on a copy of the
#      base: rl/checkpoints/$NAME_<track>.pt and kept copies .u<update>.pt.
#      Called with --target-steps (rl/train_ppo.py), so a relaunch after a
#      shutdown continues the run exactly, with the learning rate it would
#      have had; the target is written to the work folder on the first launch.
#      The learning rate fades to 0 over the run, as every stretch does.
#   4. test each of $COPIES (the last kept copies and the end) ten times with
#      the policy's usual randomness (seeds 10 to 19) and once greedy, as
#      search_round.sh; an attempt whose output has a result line is not run
#      again. Prints finishes out of ten, the fastest lap and the greedy lap
#      of each copy, next to the searched lap and the lap trained towards.
#
# Settings (environment variables, defaults in brackets):
#   BASE            checkpoint to start from [the copy rounds.mjs picked last
#                   for this track, "base" in work/<track>/state.json]
#   BEST_LAP        lap to train towards first [state.json "best", the
#                   fastest verified lap of the track; else the searched lap]
#   NAME            [g1-3-cand]   names of checkpoints, laps and the work folder
#   KEEP            [30]   ms behind the searched lap a candidate may be
#   SEARCH_SECONDS  [600]  WORKERS [8]   the search
#   MAX_CANDIDATES  [50]   candidates turned into examples (about 1.5 s each)
#   STEPS           [2500000]  ENVS [8]  ROLLOUT [256]  DEVICE [cuda]
#   KEEP_EVERY      [200]  practice; 2.5 M decisions at 2048 per update is
#                   1220 updates, kept every 200
#   COPIES          ["u800 u1000 u1200 final"]   SEEDS ["10 ... 19"]
#   PARALLEL        [8]    test attempts at once (one simulator each)
# Output: ideas/g1-3-search-train-rounds/work/<track>/$NAME/ (search, practice
# and test logs; results.txt), rl/checkpoints/$NAME_<track>.*,
# runs/$NAME_<track>.*, runs/$NAME-<copy>-<policy><seed>_<track>.json.
#
# Cost (estimated, not run at full size): search 10 min on 8 processes;
# examples about 1.5 min; practice 34 to 41 min (the rounds.mjs figure for
# 1220 updates, GPU + 8 simulators); tests a few minutes. About 50 minutes.
#
# Local use only: nothing here contacts Kodub's servers; the laps are for
# local ghosts and must not be submitted to the leaderboards.
track=$1
[ -n "$track" ] || { echo "usage: sh ideas/g1-3-search-train-rounds/g1-3-train_on_candidates.sh <track>"; exit 1; }
[ -f scripts/search_rollout.mjs ] || { echo "run this from the project root"; exit 1; }
PY=.venv/Scripts/python
IDEA=ideas/g1-3-search-train-rounds
NAME=${NAME:-g1-3-cand}
STATE=$IDEA/work/$track/state.json
W=$IDEA/work/$track/$NAME
mkdir -p $W/test
fromState() { [ -f $STATE ] && node -e "const s = require('./$STATE'); console.log(($1) ?? '')"; }
BASE=${BASE:-$(fromState "s.base")}
BEST_LAP=${BEST_LAP:-$(fromState "s.best?.file")}
[ -n "$BASE" ] && [ -f "$BASE" ] || { echo "no base checkpoint: give BASE=<checkpoint.pt> (no $STATE or no base in it)"; exit 1; }
KEEP=${KEEP:-30}; SEARCH_SECONDS=${SEARCH_SECONDS:-600}; WORKERS=${WORKERS:-8}; MAX_CANDIDATES=${MAX_CANDIDATES:-50}
STEPS=${STEPS:-2500000}; ENVS=${ENVS:-8}; ROLLOUT=${ROLLOUT:-256}; DEVICE=${DEVICE:-cuda}; KEEP_EVERY=${KEEP_EVERY:-200}
COPIES=${COPIES:-"u800 u1000 u1200 final"}; SEEDS=${SEEDS:-"10 11 12 13 14 15 16 17 18 19"}; PARALLEL=${PARALLEL:-8}
CK=rl/checkpoints/${NAME}_$track
LAP=runs/${NAME}_$track.recording.json
CANDS=runs/${NAME}_$track.candidates.json
NPZ=rl/checkpoints/${NAME}_$track-bc.npz
echo "$track: base $BASE; towards ${BEST_LAP:-the searched lap} and the candidates within $KEEP ms of the searched lap"

# --- 1. search with near-best candidates kept ------------------------------------
if [ -f $CANDS ] && node ideas/shared/verify_lap.mjs $track $LAP > /dev/null 2>&1; then
  echo "1. search: done ($(node -e "const c = require('./$CANDS'); console.log(c.count + ' laps, best ' + (c.best / 1000).toFixed(3) + ' s')"))"
else
  actor=${BASE%.pt}.actor.bin
  [ -f $actor ] || $PY rl/export_actor.py $BASE || exit 1
  echo "1. search: $SEARCH_SECONDS s, $WORKERS processes, from $actor"
  rm -f $CANDS
  node scripts/search_rollout.mjs $track actor=$actor seconds=$SEARCH_SECONDS workers=$WORKERS passes=1 keep=$KEEP out=$NAME 2>&1 \
    | grep -v "wasm streaming\|falling back" > $W/search.log
  tail -n 4 $W/search.log
  [ -f $CANDS ] && node ideas/shared/verify_lap.mjs $track $LAP > /dev/null 2>&1 || { echo "the search gave no verified lap; see $W/search.log"; exit 1; }
fi
[ -n "$BEST_LAP" ] || BEST_LAP=$LAP
node ideas/shared/verify_lap.mjs $track $BEST_LAP > /dev/null 2>&1 || { echo "$BEST_LAP does not pass Verify"; exit 1; }

# --- 2. imitation examples --------------------------------------------------------
if [ -f $NPZ ]; then
  echo "2. examples: done ($NPZ)"
else
  echo "2. examples: $BEST_LAP, then up to $MAX_CANDIDATES candidates"
  $PY $IDEA/laps_bc.py $track ${NPZ%.npz}.tmp.npz $BEST_LAP $CANDS --max-candidates $MAX_CANDIDATES 2>&1 \
    | grep -v "wasm streaming\|falling back" > $W/examples.log || { cat $W/examples.log; exit 1; }
  tail -n 1 $W/examples.log
  mv ${NPZ%.npz}.tmp.npz $NPZ
fi

# --- 3. practice ----------------------------------------------------------------------
if [ -f $W/trained ]; then
  echo "3. practice: done"
else
  if [ ! -f $CK.pt ]; then
    # The target is fixed once, from the base's step counter, before the copy
    # is put in place: a relaunch must aim at the same target.
    cp $BASE $CK.pt.tmp || exit 1
    start=$($PY $IDEA/ckpt_steps.py $CK.pt.tmp | sed 's/.*: *\([0-9]*\)}.*/\1/')
    echo $((start + STEPS)) > $W/target
    mv $CK.pt.tmp $CK.pt
  fi
  [ -f $W/target ] || { echo "$CK.pt exists but $W/target does not: delete $CK.pt to start the practice over"; exit 1; }
  target=$(cat $W/target)
  echo "3. practice: to $target decisions in all ($(sed -n '$p' $W/train.log 2>/dev/null | cut -c1-80))"
  $PY -u rl/train_ppo.py --track $track --envs $ENVS --rollout $ROLLOUT --block 5 --device $DEVICE \
    --no-lap-fraction --resume --checkpoint $CK.pt \
    --random-start 0.5 --failure-start 0.3 --own-start 0.5 --gamma 0.995 --gae-lambda 0.9 \
    --critic-warmup 30 --bc-data $NPZ --bc-coef 0.05 --bc-coef-end 0.05 --max-off-line 40 \
    --lr 5e-5 --lr-end 0 --keep-every $KEEP_EVERY --target-steps $target >> $W/train.log 2>&1 || { echo "practice stopped; see $W/train.log"; exit 1; }
  cp $CK.pt $CK.final.pt
  touch $W/trained
fi

# --- 4. ten attempts per copy, plus one greedy ----------------------------------------
echo "4. test: $COPIES"
for c in $COPIES; do
  [ -f $CK.$c.pt ] || continue
  for s in $SEEDS; do echo "$c sample $s"; done
  echo "$c greedy 0"
done | while read c p s; do
  f=$W/test/$c.$p.$s.txt
  grep -q '^FINISHED\|^DID NOT FINISH' $f 2>/dev/null || echo "$c $p $s"
done | xargs -r -P $PARALLEL -L 1 sh -c "$PY rl/evaluate.py --track $track --max-off-line 40 --checkpoint $CK.\$0.pt --policy \$1 --seed \$2 --run $NAME-\$0-\$1\$2 > $W/test/\$0.\$1.\$2.txt 2>&1"

{
  echo "$track: $NAME, from $BASE"
  echo "trained towards $BEST_LAP ($(node ideas/shared/verify_lap.mjs $track $BEST_LAP 2>/dev/null | awk '{printf "%.3f s", $2 / 1000}')) and $(sed -n 's/.*: \([0-9]*\) examples from \([0-9]*\) lap(s).*/\1 examples from \2 laps/p' $W/examples.log)"
  echo "searched lap $(node -e "console.log((require('./$CANDS').best / 1000).toFixed(3))") s, $(node -e "console.log(require('./$CANDS').count)") candidates kept within $KEEP ms"
  echo
  echo "copy     finishes  fastest sampled  greedy"
  for c in $COPIES; do
    if [ ! -f $CK.$c.pt ]; then echo "$c: no such checkpoint"; continue; fi
    n=$(grep -l '^FINISHED' $W/test/$c.sample.*.txt 2>/dev/null | wc -l)
    t=$(grep -ho '^FINISHED in [0-9.]*' $W/test/$c.sample.*.txt 2>/dev/null | awk '{print $3}' | sort -n | head -n 1)
    g=$(grep -ho '^FINISHED in [0-9.]*\|^DID NOT FINISH ([a-z ]*)' $W/test/$c.greedy.0.txt 2>/dev/null | sed 's/FINISHED in //')
    printf '%-8s %5s/%s  %15s  %s\n' $c $n $(echo $SEEDS | wc -w) "${t:--}" "${g:-not run}"
  done
} > $W/results.txt
cat $W/results.txt
