#!/bin/sh
# Continue the route generalist (ppo_g2-1-route, ROUTE MODE in
# rl/racing_env.mjs: 334 inputs, no human lap in what it sees or in its
# reward) on the official training tracks PLUS the generated training set,
# so it practises on tracks it could never memorise.
#
#   sh ideas/g2-2-track-generator/g2-2-train_route_on_generated.sh        (from the project root)
#
# Needs the set first: sh ideas/g2-2-track-generator/g2-2-make_set.sh
#
# Settings by environment variable (defaults in brackets):
#   SET        the set folder [ideas/g2-2-track-generator/sets/g2-2-set1]; its
#              train.txt lists the generated training tracks
#   FROM       checkpoint to start from [rl/checkpoints/ppo_g2-1-route.pt]
#   STRETCHES  stretches to run in this call [4]
#   STEPS      block decisions per stretch [12000000: about 2 hours. The
#              route generalist's stretches were 13M in 1.9 h at 1860
#              decisions/s with 16 simulators and nothing else running;
#              switching tracks costs 0.4 to 2.4 s per switch (TRACK
#              ROTATION in rl/env_server.mjs), a few per cent at ROTATE 25]
#   ENVS       simulator processes [16]
#   ROTATE     episodes on one track before a simulator moves to its next [25]
#   DEVICE     cuda or cpu for the learning step [cuda]
#   OFFICIAL   official tracks, comma separated [the 13 ppo_g2-1-route
#              practised on: the 14 training tracks without summer4]
#   CK, LOGS   folders for checkpoints and logs [rl/checkpoints, runs]; only
#              for trying the script out without touching the real files
#
# Why summer4 is left out by default: its route (the reference the reward
# and the observation use in route mode) runs along the top of a wall of
# blocks and joins the road against its direction; the human is 530 units
# from it at worst (g2-1 README). ppo_g2-1-route was trained without it, so
# leaving it out keeps this a continuation of the same practice plus the
# generated tracks. OFFICIAL=...,summer4 puts it back.
#
# What it does. Each step is skipped when its output exists, so after a
# shutdown the same command carries on.
#   1. Copies $FROM to rl/checkpoints/ppo_g2-2-route-gen.pt, only if that
#      file does not exist yet (it is never overwritten).
#   2. PPO in stretches (rl/train_ppo.py --reference route) with the
#      settings of ideas/g2-1-reference-free-inputs/train_route_generalist.sh
#      (block decisions, no lap-fraction input, part-way starts 50% with 30%
#      before a recent crash and 30% with a steering kick, own-state
#      restarts 50%, gamma 0.995, GAE lambda 0.9, the imitation term on the
#      official tracks' human laps 0.05 fading to 0.02, learning rate 1.5e-4
#      fading to 0 within every stretch, a copy kept every 200 updates).
#      The tracks are $OFFICIAL plus every track in $SET/train.txt (13 + 40 =
#      53 by default) on $ENVS simulators: simulator k drives tracks k,
#      k + ENVS, k + 2 ENVS, ... in turn, ROTATE episodes each
#      (rl/train_ppo.py --rotate-every). A generated track has no human lap,
#      so every episode on one starts on its start line (own-state restarts
#      still happen); part-way starts happen on the official tracks only.
#      No critic warm-up: the network and its critic are already trained.
#        -> rl/checkpoints/ppo_g2-2-route-gen.pt (latest), .actor.bin,
#           .after_<steps>.pt at the end of every stretch,
#           .s<k>.u<update>.pt the copies kept during stretch k,
#           runs/rl_train_g2-2-route-gen_s<k>.log (with every 50 updates a
#           line of finishes per track, generated ones by their names)
#      A stretch cut short by a shutdown leaves its log and its last periodic
#      save (every 10 updates); the next call starts a NEW stretch from that
#      save, with a fresh learning-rate fade. Which copy to use is chosen by
#      the ten-attempt test, never assumed to be the last:
#        sh ideas/g2-2-track-generator/g2-2-eval_route_on_generated.sh rl/checkpoints/ppo_g2-2-route-gen.after_<steps>.pt
#
# Stopping: kill only the process whose command line contains
# rl/train_ppo.py and ppo_g2-2-route-gen, then check its node simulators have
# exited. Stopping this script alone leaves the trainer running.
#
# Local use only: drives the local simulator; no network.
PY=.venv/Scripts/python
CK=${CK:-rl/checkpoints}
LOGS=${LOGS:-runs}
SET=${SET:-ideas/g2-2-track-generator/sets/g2-2-set1}
FROM=${FROM:-rl/checkpoints/ppo_g2-1-route.pt}
NAME=ppo_g2-2-route-gen
STRETCHES=${STRETCHES:-4}
STEPS=${STEPS:-12000000}
ENVS=${ENVS:-16}
ROTATE=${ROTATE:-25}
DEVICE=${DEVICE:-cuda}
OFFICIAL=${OFFICIAL:-desert1,desert2,desert4,desert5,summer1,summer2,summer5,summer6,summer7,winter1,winter2,winter3,winter5}
mkdir -p $LOGS $CK
[ -f "$SET/train.txt" ] || { echo "no $SET/train.txt: make the set first (sh ideas/g2-2-track-generator/g2-2-make_set.sh)"; exit 1; }
[ -f $CK/g2-1-route_bc.npz ] || { echo "no $CK/g2-1-route_bc.npz (the imitation examples of train_route_generalist.sh)"; exit 1; }

# ---- 1. the starting point --------------------------------------------------------
if [ ! -f $CK/$NAME.pt ]; then
  [ -f "$FROM" ] || { echo "no $FROM to start from"; exit 1; }
  cp "$FROM" $CK/$NAME.pt
  echo "copied $FROM to $CK/$NAME.pt"
fi

# ---- 2. PPO in stretches ---------------------------------------------------------
steps_done() { $PY -c "import torch; print(torch.load('$CK/$NAME.pt', map_location='cpu', weights_only=True)['steps'])"; }
# Copies kept during stretch $1 (.u<update>.pt) get the stretch's number, so
# the next stretch's copies, numbered from its own start, do not overwrite them.
keep_copies() {
  for f in $CK/$NAME.u*.pt; do
    [ -f "$f" ] && mv "$f" "$CK/$NAME.s$1.${f#$CK/$NAME.}"
  done
}
for i in $(seq 1 $STRETCHES); do
  n=$(($(ls $LOGS/rl_train_g2-2-route-gen_s*.log 2>/dev/null | wc -l) + 1))
  [ $n -gt 1 ] && keep_copies $((n - 1))   # left over from a stretch cut short
  log=$LOGS/rl_train_g2-2-route-gen_s$n.log
  echo "stretch $n: $STEPS decisions from $(steps_done) (log: $log)"
  $PY -u rl/train_ppo.py --reference route --track "$OFFICIAL,$SET/train.txt" --envs $ENVS --rotate-every $ROTATE \
    --block 5 --device $DEVICE --no-lap-fraction --resume --checkpoint $CK/$NAME.pt \
    --random-start 0.5 --failure-start 0.3 --own-start 0.5 --kick 0.3 --ref-laps 10 \
    --gamma 0.995 --gae-lambda 0.9 \
    --bc-data $CK/g2-1-route_bc.npz --bc-coef 0.05 --bc-coef-end 0.02 \
    --lr 1.5e-4 --lr-end 0 --keep-every 200 --total-steps $STEPS > $log 2>&1 \
    || { echo "stretch $n stopped with an error; see $log"; exit 1; }
  keep_copies $n
  s=$(steps_done)
  cp $CK/$NAME.pt $CK/$NAME.after_$s.pt
  echo "stretch $n done at $s decisions: $CK/$NAME.after_$s.pt"
done
