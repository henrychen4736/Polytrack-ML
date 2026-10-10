#!/bin/sh
# Smoke test: explore against plain attempts on one unseen track, the same
# budget of simulated time for both, one simulator at a time.
#
#   sh ideas/g2-3-explore-and-adapt/smoke_test.sh [track] [laps] [seed]
#   sh ideas/g2-3-explore-and-adapt/smoke_test.sh winter4 6 1
#
# winter4 is the default because it is the held-out track on which plain
# attempts never finished (0 of 5 runs of 10 laps each). Six laps of winter4
# are 116 s of simulated time; each half took 15 to 40 s of wall time with
# training running on the machine, and each is capped at 50 s.
# Prints both attempt lists, then the furthest point reached by laps used.
track=${1:-winter4}; laps=${2:-6}; seed=${3:-1}
for mode in explore plain; do
  node ideas/g2-3-explore-and-adapt/explore.mjs $track mode=$mode laps=$laps seconds=50 seed=$seed out=g2-3-smoke 2>&1 \
    | grep -v "wasm streaming\|falling back"
  echo
done
node ideas/g2-3-explore-and-adapt/analyze.mjs g2-3-smoke_ | head -5
