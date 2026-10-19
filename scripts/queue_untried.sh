#!/bin/sh
# The second queue (Henry's request of 17 October 2026: try each idea the
# docs suggested but nobody had tried, one at a time). Local use only: every
# step drives the simulator, nothing is uploaded.
#
#   sh scripts/queue_untried.sh            # from the project root
#   sh scripts/queue_untried.sh iqn-route  # start at a named step
#
# Restartable in the same way as scripts/queue_unfinished.sh: a step that
# ended well leaves runs/queue2/<step>.done and is skipped on a rerun. An IQN
# step that was interrupted is relaunched with --resume (a new stretch from
# its last save, replay buffer refilled), so nothing is lost but the buffer.
#
# Steps (each about 3.5 h unless said):
#   iqn-slices5   IQN on desert4 from nothing with 60 actions: a key
#                 combination AND the 10 ms slice it switches in (--slices 5).
#                 The 12-action runs levelled off at 21.792 s; key timing
#                 finer than 50 ms is what the searches found the last
#                 tens of ms in.
#   iqn-route     IQN on desert4 from nothing on the g2-1 route inputs (no
#                 human lap in them; progress and reward along the route).
#   iqn-winter2   IQN on winter2 from nothing (only desert4 had been tried).
#   g2-2          the route generalist continued on the 14 official tracks
#                 plus 40 generated ones (jumps, banked turns, wide roads):
#                 baseline test, 2 stretches of about 2 h, test again.
cd "$(dirname "$0")/.." || exit 1
mkdir -p runs/queue2
log=runs/queue2/queue.log
from=${1:-}
started=${from:+no}
py=.venv/Scripts/python
say() { echo "$(date '+%Y-%m-%d %H:%M:%S')  $*" | tee -a $log; }

run_step() {
  name=$1; shift
  if [ "$started" = no ]; then
    case $name in $from*) started=yes ;; *) return 0 ;; esac
  fi
  if [ -f runs/queue2/$name.done ]; then say "skip $name (done)"; return 0; fi
  say "start $name"
  if "$@" >> runs/queue2/$name.log 2>&1; then
    touch runs/queue2/$name.done; say "done $name"
  else
    say "FAILED $name (exit $?); see runs/queue2/$name.log; going on"
  fi
}

# iqn <checkpoint name> <track> <decisions> [train_iqn options...]
# From nothing the first time; --resume if the checkpoint already exists.
iqn() {
  ck=rl/checkpoints/$1.pt; track=$2; total=$3; shift 3
  resume=
  if [ -f $ck ]; then
    # --total-decisions counts from the resume point, so ask only for what is
    # left of the step's total (a pause at 10.6M of 12M resumes 1.4M, not 12M).
    resume=--resume
    done_so_far=$($py -c "import torch,sys; print(torch.load(sys.argv[1], map_location='cpu', weights_only=True)['decisions'])" $ck)
    total=$((total - done_so_far))
    [ $total -le 0 ] && return 0
  fi
  $py -u ideas/g1-6-offpolicy-rl/train_iqn.py --track $track --envs 6 --device cuda \
    --checkpoint $ck --save-laps --total-decisions $total $resume "$@"
}

run_step iqn-slices5 iqn g1-6-iqn-s5_desert4 desert4 12000000 --slices 5
run_step iqn-route   iqn g1-6-iqn-route_desert4 desert4 12000000 --reference route
run_step iqn-winter2 iqn g1-6-iqn_winter2 winter2 12000000
g22() {
  P=4 sh ideas/g2-2-track-generator/g2-2-eval_route_on_generated.sh rl/checkpoints/ppo_g2-1-route.pt &&
  STRETCHES=2 sh ideas/g2-2-track-generator/g2-2-train_route_on_generated.sh &&
  P=4 sh ideas/g2-2-track-generator/g2-2-eval_route_on_generated.sh rl/checkpoints/ppo_g2-2-route-gen.pt
}
run_step g2-2 g22
say "queue finished"
