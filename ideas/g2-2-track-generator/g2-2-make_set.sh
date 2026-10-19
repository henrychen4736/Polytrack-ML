#!/bin/sh
# Make the fixed, seeded set of generated tracks that g2-2's training and test
# use: 40 training and 10 test tracks of mixed difficulty and features, each
# checked (structure, the scripted follower finishes it, idea g2-1's route
# search reaches the finish), with its follower lap and its route built and
# cached for the route-mode training environment.
#
#   sh ideas/g2-2-track-generator/g2-2-make_set.sh               (from the project root)
#   P=2 OUT=ideas/g2-2-track-generator/sets/other sh ideas/g2-2-track-generator/g2-2-make_set.sh
#
# Settings by environment variable (defaults in brackets):
#   OUT    folder for the set [ideas/g2-2-track-generator/sets/g2-2-set1]
#   P      simulators at once, one track each [3]
#   TRAIN, TEST   how many tracks [40, 10]
#
# What it writes (g2-2-make_set.mjs has the details and the mix of kinds):
#   $OUT/train/, $OUT/test/   <name>.track.json, .route.json, .lap.json per track
#   $OUT/train.txt, test.txt  the track files, one per line, for
#                             rl/train_ppo.py --track $OUT/train.txt
#   $OUT/set.json             every track: kind, seed, features, follower lap, g2-1 route
# and prints the table of the set at the end.
#
# Restartable: rerunning skips the tracks already made (after a shutdown it
# carries on). Delete $OUT to start the set over.
#
# Cost: about 5 to 10 s of wall time per track with 3 simulators (a follower
# drive of 20 to 50 s of game time, plus the g2-1 route, 1 to 5 s); 50 tracks
# in about 3 to 5 minutes.
#
# The folder is kept out of git (.gitignore): its routes are measured on
# Kodub's part geometry and its laps are driven on it.
# Local use only: drives the local simulator; no network.
OUT=${OUT:-ideas/g2-2-track-generator/sets/g2-2-set1}
P=${P:-3}
TRAIN=${TRAIN:-40}
TEST=${TEST:-10}
mkdir -p "$OUT"
echo "making $TRAIN + $TEST tracks in $OUT with $P simulators (log: $OUT/make_set.log)"
k=0
while [ $k -lt $P ]; do
  node ideas/g2-2-track-generator/g2-2-make_set.mjs --out "$OUT" --train $TRAIN --test $TEST --shard $k/$P >> "$OUT/make_set.log" 2>&1 &
  k=$((k + 1))
done
wait
node ideas/g2-2-track-generator/g2-2-make_set.mjs --out "$OUT" --train $TRAIN --test $TEST --list
