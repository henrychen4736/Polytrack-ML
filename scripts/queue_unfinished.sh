#!/bin/sh
# Runs the ideas that were started but never trained, one training at a time,
# in a fixed order (Henry's request of 16 October 2026: up to 24 hours, one
# job at a time). Local use only: every step drives the simulator, nothing is
# uploaded.
#
#   sh scripts/queue_unfinished.sh            # from the project root
#   sh scripts/queue_unfinished.sh g1-3       # start at a named step
#
# Restartable: each step leaves a marker in runs/queue/<step>.done when it
# ends, and a rerun skips steps with a marker. Every step's own script is
# restartable too (it skips what it already wrote), so after a shutdown just
# run this again. Delete a marker to run that step again.
#
# Steps:
#   g2-3-<track>  fine-tune the generalist towards the lap explore.mjs found
#                 (ideas/g2-3-explore-and-adapt/finetune_run.sh), about 30 min each
#   g1-3-<track>  one unattended search-then-train round (rounds.mjs), about
#                 an hour each; a launch stops itself after 105 min (exit 3)
#                 and is launched again
#   g2-1          the reference-free (route) generalist: imitation start from
#                 10 human laps per track, then 3 stretches of PPO of about 2 h
#                 (ideas/g2-1-reference-free-inputs/train_route_generalist.sh)
#   g2-5-route    the memory policy on the route generalist: one stretch of
#                 about 2 h (ideas/g2-5-memory-policy/train_memory.sh), then
#                 memory on against off on the three held-out tracks
cd "$(dirname "$0")/.." || exit 1
mkdir -p runs/queue
log=runs/queue/queue.log
from=${1:-}
started=${from:+no}

say() { echo "$(date '+%Y-%m-%d %H:%M:%S')  $*" | tee -a $log; }

# run_step <name> <command...>: skip if done; otherwise run, mark if it succeeded.
run_step() {
  name=$1; shift
  if [ "$started" = no ]; then
    case $name in $from*) started=yes ;; *) return 0 ;; esac
  fi
  if [ -f runs/queue/$name.done ]; then say "skip $name (done)"; return 0; fi
  say "start $name"
  if "$@" >> runs/queue/$name.log 2>&1; then
    touch runs/queue/$name.done; say "done $name"
  else
    say "FAILED $name (exit $?); see runs/queue/$name.log; going on"
  fi
}

# g1-3: the first launch on a track names the checkpoint to start from (the
# copy round 2 picked, per CLAUDE.md) and every searched lap so far; later
# launches carry on from the driver's own state file. Exit 3 = out of time,
# launch again (at most 6 launches); 0 = done; anything else = stop.
g13() {
  track=$1; base=$2
  laps=runs/rollout_$track.recording.json,runs/rollout_r1_$track.recording.json,runs/rollout_r2_$track.recording.json
  for i in 1 2 3 4 5 6; do
    if [ -f ideas/g1-3-search-train-rounds/work/$track/state.json ]; then
      node ideas/g1-3-search-train-rounds/rounds.mjs $track rounds=1
    else
      node ideas/g1-3-search-train-rounds/rounds.mjs $track rounds=1 base=$base lap=$laps
    fi
    code=$?
    [ $code -eq 3 ] || return $code
  done
  return 3
}

for t in winter4 desert3 summer3; do
  run_step g2-3-$t sh ideas/g2-3-explore-and-adapt/finetune_run.sh $t
done
run_step g1-3-desert4 g13 desert4 rl/checkpoints/ppo_sr2_desert4.final.pt
run_step g1-3-summer4 g13 summer4 rl/checkpoints/ppo_sr2_summer4.u1000.pt
run_step g1-3-summer1 g13 summer1 rl/checkpoints/ppo_sr2_summer1.u800.pt
run_step g1-3-winter2 g13 winter2 rl/checkpoints/ppo_sr2_winter2.u1000.pt
run_step g2-1 env LAPS=10 STRETCHES=3 sh ideas/g2-1-reference-free-inputs/train_route_generalist.sh
# g2-5 on the route generalist just trained: its README says this is the run
# that matters (without the human's speeds in the inputs, the memory is the
# only source of "how fast through here"). One stretch of about 2 h, then the
# held-out tracks with memory on and off.
run_step g2-5-route env REFERENCE=route STRETCHES=1 sh ideas/g2-5-memory-policy/train_memory.sh
run_step g2-5-route-eval sh ideas/g2-5-memory-policy/eval_memory.sh rl/checkpoints/g2-5-mem_route.pt
say "queue finished"
