#!/bin/sh
# Fine-tune a trained generalist WITH the memory of earlier attempts (g2-5):
# the README's "First experiment".
#
#   sh ideas/g2-5-memory-policy/train_memory.sh                     (from the project root)
#   REFERENCE=route sh ideas/g2-5-memory-policy/train_memory.sh     the route generalist
#
# Settings by environment variable (defaults in brackets):
#   REFERENCE  human or route [human]
#   START      checkpoint to start from [human: rl/checkpoints/ppo_blkgen.best2.pt,
#              the best generalist; route: rl/checkpoints/ppo_g2-1-route.pt, made by
#              ideas/g2-1-reference-free-inputs/train_route_generalist.sh. Better:
#              the copy of it the ten-attempt test picked]
#   STRETCHES  stretches to run in this call [1]
#   STEPS      block decisions per stretch [13000000: about 2 hours at the 1860
#              decisions/s of the block generalist's logs on 16 simulators; the
#              memory adds an estimated 5%, and another trainer on the machine
#              slows it]
#   ENVS       simulator processes [16]
#   DEVICE     cuda or cpu for the learning step [cuda]
#   LR         learning rate at the start of each stretch, fading to 0 [5e-5]
#   CK, LOGS   folders for checkpoints and logs [rl/checkpoints, runs]; only
#              for trying the script out without touching the real files
#
# What it does. Each step is skipped when its output exists, so after a
# shutdown the same command carries on where it stopped.
#   1. Widen START to the memory width with zero weights for the 130 new
#      inputs (rl/extend_checkpoint_inputs.py: 352 -> 482, or 334 -> 464 in
#      route mode). The widened network drives exactly as START, whatever the
#      memory shows (largest output difference printed, under 1e-4 or nothing
#      is written).
#        -> rl/checkpoints/g2-5-mem.pt (human), g2-5-mem_route.pt (route)
#      Only if that file does not exist yet: delete it to start over.
#   2. PPO in stretches (rl/train_ppo.py --memory 1). The README's first
#      experiment: --session-max 6 (a session of 1 to 6 attempts shares one
#      memory, two attempts in seven are a first try), --failure-start 0.5
#      and --kick 0.3 (starts a few seconds before a crash the memory has
#      seen, which is the case the inputs are for), 16 simulators on the
#      training tracks only. The held-out tracks desert3, summer3 and winter4
#      are never driven here, so eval_memory.sh can measure on them.
#      The rest as the block generalist was trained (scripts/
#      train_block_specialist.sh and the generalist's logs): block decisions,
#      no lap-fraction input, part-way starts 50%, own-state restarts 50%,
#      rotating among the first 10 human laps, gamma 0.995, GAE lambda 0.9,
#      a copy kept every 200 updates.
#      Two choices differ from a fresh run, both from CLAUDE.md's "Lessons":
#      "Extending a trained model's inputs with zero weights is exact, but
#      learning must restart at a low rate and without the imitation term, or
#      it is damaged." So the rate is 5e-5 (the set-2 specialists' rate from
#      the same checkpoint) fading to 0 within each stretch, and there is no
#      --bc-data. (train_ppo.py pads 352- or 334-wide imitation examples with
#      zero memory inputs if --bc-data is added later.) The first stretch
#      trains the critic alone for 30 updates: the critic is exact as widened,
#      but the memory changes what a situation is worth.
#      --carry stays 0: each attempt is an ordinary episode; the policy learns
#      to USE what the memory shows. carry is the next experiment.
#      The progress line gives "finished by attempt 1:../.. 2:.. 3:.. 4+:.."
#      over the last 100 attempts of each number. Part-way starts are in it,
#      so compare the numbers with each other, not with the ten-attempt test.
#        -> rl/checkpoints/g2-5-mem[_route].pt (latest), .actor.bin,
#           .after_<steps>.pt at the end of every stretch,
#           .s<k>.u<update>.pt the copies kept during stretch k,
#           runs/rl_train_g2-5-mem[_route]_s<k>.log
#      A stretch cut short by a shutdown leaves its log and its last periodic
#      save (every 10 updates); the next call starts a NEW stretch from that
#      save, with a fresh learning-rate fade. Which copy to use is chosen by
#      test, never assumed to be the last:
#        sh ideas/g2-5-memory-policy/eval_memory.sh rl/checkpoints/g2-5-mem.after_<steps>.pt
#
# Tracks. Human reference: the 14 training tracks plus a second simulator on
# summer5 and winter3 (the block generalist's list, from its log). Route: as
# train_route_generalist.sh, without summer4 (its route is wrong) and with a
# second simulator on summer5, winter3 and summer6.
#
# Stopping: kill only the process whose command line contains
# rl/train_ppo.py and g2-5-mem, then check its node simulators have exited.
# Stopping this script alone leaves the trainer running.
#
# Local use only: drives the local simulator; no network.
PY=.venv/Scripts/python
CK=${CK:-rl/checkpoints}
LOGS=${LOGS:-runs}
REFERENCE=${REFERENCE:-human}
STRETCHES=${STRETCHES:-1}
STEPS=${STEPS:-13000000}
ENVS=${ENVS:-16}
DEVICE=${DEVICE:-cuda}
LR=${LR:-5e-5}
case $REFERENCE in
  human)
    START=${START:-rl/checkpoints/ppo_blkgen.best2.pt}
    NAME=g2-5-mem
    WIDTH=482
    TRACKS=desert1,desert2,desert4,desert5,summer1,summer2,summer4,summer5,summer6,summer7,winter1,winter2,winter3,winter5,summer5,winter3
    ;;
  route)
    START=${START:-rl/checkpoints/ppo_g2-1-route.pt}
    NAME=g2-5-mem_route
    WIDTH=464
    TRACKS=desert1,desert2,desert4,desert5,summer1,summer2,summer5,summer6,summer7,winter1,winter2,winter3,winter5,summer5,winter3,summer6
    ;;
  *) echo "REFERENCE must be human or route"; exit 2 ;;
esac
mkdir -p $LOGS $CK

# ---- 1. widen the starting checkpoint ------------------------------------------
if [ ! -f $CK/$NAME.pt ]; then
  [ -f "$START" ] || { echo "no starting checkpoint $START (for REFERENCE=route, train one with ideas/g2-1-reference-free-inputs/train_route_generalist.sh, or set START)"; exit 1; }
  echo "widening $START to $WIDTH inputs -> $CK/$NAME.pt"
  # Written under a temporary name and renamed, so a stop half-way leaves no
  # half-written checkpoint that the next call would take as done.
  $PY rl/extend_checkpoint_inputs.py "$START" "$CK/$NAME.pt.tmp" --obs-size $WIDTH \
    && mv "$CK/$NAME.pt.tmp" "$CK/$NAME.pt" \
    || { echo "widening failed"; exit 1; }
fi

# ---- 2. PPO in stretches -----------------------------------------------------------
steps_done() { $PY -c "import torch; print(torch.load('$CK/$NAME.pt', map_location='cpu', weights_only=True)['steps'])"; }
# Has this checkpoint been trained with the memory yet? (train_ppo.py records
# "memory" in every checkpoint it saves with --memory; the widened file has none.)
trained() { $PY -c "import torch; print(int('memory' in torch.load('$CK/$NAME.pt', map_location='cpu', weights_only=True)))"; }
# Copies kept during stretch $1 (.u<update>.pt) get the stretch's number, so
# the next stretch's copies, numbered from its own start, do not overwrite them.
keep_copies() {
  for f in $CK/$NAME.u*.pt; do
    [ -f "$f" ] && mv "$f" "$CK/$NAME.s$1.${f#$CK/$NAME.}"
  done
}
for i in $(seq 1 $STRETCHES); do
  n=$(($(ls $LOGS/rl_train_${NAME}_s*.log 2>/dev/null | wc -l) + 1))
  [ $n -gt 1 ] && keep_copies $((n - 1))   # left over from a stretch cut short
  warmup=0
  [ "$(trained)" = "0" ] && warmup=30
  log=$LOGS/rl_train_${NAME}_s$n.log
  echo "stretch $n: $STEPS decisions from $(steps_done) (log: $log)"
  $PY -u rl/train_ppo.py --reference $REFERENCE --track $TRACKS --envs $ENVS --block 5 --device $DEVICE \
    --no-lap-fraction --resume --checkpoint $CK/$NAME.pt \
    --memory 1 --session-max 6 \
    --random-start 0.5 --failure-start 0.5 --own-start 0.5 --kick 0.3 --ref-laps 10 \
    --gamma 0.995 --gae-lambda 0.9 --critic-warmup $warmup \
    --lr $LR --lr-end 0 --keep-every 200 --total-steps $STEPS > $log 2>&1 \
    || { echo "stretch $n stopped with an error; see $log"; exit 1; }
  keep_copies $n
  s=$(steps_done)
  cp $CK/$NAME.pt $CK/$NAME.after_$s.pt
  echo "stretch $n done at $s decisions: $CK/$NAME.after_$s.pt"
done
