#!/bin/sh
# The session test of a memory policy (g2-5): does it get better over the
# attempts of a session on tracks it never trained on, and is that the memory?
#
#   sh ideas/g2-5-memory-policy/eval_memory.sh            (default: rl/checkpoints/g2-5-mem.pt)
#   sh ideas/g2-5-memory-policy/eval_memory.sh rl/checkpoints/g2-5-mem.after_<steps>.pt
#   sh ideas/g2-5-memory-policy/eval_memory.sh rl/checkpoints/g2-5-mem_route.after_<steps>.pt
#   P=6 SESSIONS=20 sh ideas/g2-5-memory-policy/eval_memory.sh <checkpoint>
#
# Settings by environment variable (defaults in brackets):
#   P         runs at once, one simulator each [3]
#   SESSIONS  sessions per run [10]
#   ATTEMPTS  attempts per session [5]
#   TRACKS    [desert3 summer3 winter4: held out from every generalist and
#             from train_memory.sh]
#
# What it does: for each track, attempts.mjs twice with the same seed:
# memory=1 (the memory inputs filled in) and memory=0 (the same policy with
# them held at zero, the baseline). Each run is SESSIONS sessions of ATTEMPTS
# attempts from the start line, decisions sampled as in training (sample=1;
# with top choices the simulator repeats exactly and one session is all there
# is), the memory cleared before each session. On attempt 1 the memory is
# empty either way, so the attempt-1 numbers of the two runs differ only by
# chance (the first session's attempt 1 is identical; later sessions start
# from a random stream that the earlier, different attempts have moved on),
# and a gap that opens after attempt 1 is the memory's doing.
# The policy is the checkpoint's actor, exported to the output folder (not
# next to the checkpoint, where a training run may be writing its own).
# Success, as the README defines it: finishes on attempts 2, 3 and 5 clearly
# above attempt 1 and above the memory=0 column, attempt 1 no worse than the
# generalist it started from. Lap times printed are not verified laps.
#
# Prints, per track and attempt number, finished out of SESSIONS with the
# memory and without it, and the same summed over the tracks. Full output in
# runs/g2-5-eval_<checkpoint name>/<track>.mem<1|0>.txt. About 10 minutes per
# run on one simulator (README), so 20 minutes for the default six runs at 3
# at once on an idle machine.
#
# Local use only: drives the local simulator; no network.
PY=.venv/Scripts/python
ck=${1:-rl/checkpoints/g2-5-mem.pt}
[ -f "$ck" ] || { echo "usage: sh ideas/g2-5-memory-policy/eval_memory.sh <memory checkpoint .pt>  (no $ck)"; exit 2; }
P=${P:-3}
SESSIONS=${SESSIONS:-10}
ATTEMPTS=${ATTEMPTS:-5}
TRACKS=${TRACKS:-desert3 summer3 winter4}
name=$(basename "$ck" .pt)
d=runs/g2-5-eval_$name
mkdir -p $d
cp "$ck" $d/policy.pt
$PY rl/export_actor.py $d/policy.pt || exit 1
for t in $TRACKS; do for m in 1 0; do echo "$t $m"; done; done |
  xargs -P $P -L 1 sh -c "node ideas/g2-5-memory-policy/attempts.mjs track=\$0 policy=$d/policy.actor.bin memory=\$1 \
    sessions=$SESSIONS attempts=$ATTEMPTS sample=1 seed=1 > $d/\$0.mem\$1.txt 2>&1"

# Lines of attempts.mjs's table: "  attempt 2: finished 7/10, mean lap ..., mean share of the lap 93.1%".
finished() { grep -h "^  attempt $2: finished" $1 2>/dev/null | sed 's/.*finished \([0-9]*\/[0-9]*\).*/\1/'; }
share() { grep -h "^  attempt $2: finished" $1 2>/dev/null | sed 's/.*mean share of the lap \([0-9.]*%\).*/\1/'; }
echo "== $name: finished per attempt number, with memory / without (mean share of the lap reached)"
for t in $TRACKS; do
  printf "%-8s" $t
  for a in $(seq 1 $ATTEMPTS); do
    printf "  #%s %5s %-8s / %5s %-8s" $a "$(finished $d/$t.mem1.txt $a)" "($(share $d/$t.mem1.txt $a))" "$(finished $d/$t.mem0.txt $a)" "($(share $d/$t.mem0.txt $a))"
  done
  echo
done
printf "%-8s" all
for a in $(seq 1 $ATTEMPTS); do
  one=$(for t in $TRACKS; do finished $d/$t.mem1.txt $a; done | awk -F/ '{f+=$1;n+=$2} END{printf "%d/%d",f,n}')
  zero=$(for t in $TRACKS; do finished $d/$t.mem0.txt $a; done | awk -F/ '{f+=$1;n+=$2} END{printf "%d/%d",f,n}')
  printf "  #%s %5s / %5s        " $a $one $zero
done
echo
grep -h "crashes after attempt 1" $d/*.mem1.txt >/dev/null 2>&1 && for t in $TRACKS; do
  echo "$t: $(grep -h 'crashes after attempt 1' $d/$t.mem1.txt | sed 's/^ *//') (memory on)"
done
