#!/bin/sh
# Train a block-decision specialist that INHERITS from a generalist.
#
#   sh scripts/train_block_specialist_from.sh <track> <generalist checkpoint> [extra train_ppo.py options]
#   PREFIX=g3blk STEPS=2500000 sh scripts/train_block_specialist_from.sh <track> <checkpoint> --pace-cap 1.3
#
# The counterpart of scripts/train_block_specialist.sh, which starts from the
# imitation-only model. This one starts as a copy of a model that already
# drives, and practises on the one track (5 million block decisions unless
# STEPS says otherwise), so the two kinds of specialist can be compared like
# for like. Differences from the other script, because the start is a trained
# driver and not a beginner:
#   - a lower learning rate (5e-5 fading to zero, against 1.5e-4): the aim is
#     to refine, not to relearn
#   - a short critic warm-up: the critic already knows this reward
# Anything after the checkpoint is passed on to rl/train_ppo.py, which is how
# the "set 3" specialists get a higher pace cap, a wider line limit and a
# different reference lap.
# Output: rl/checkpoints/ppo_<PREFIX>_<track>.pt (+ .u<update>.pt copies),
#         runs/rl_train_<PREFIX>_<track>.log        (PREFIX defaults to gblk)
track=$1
base=$2
shift 2
prefix=${PREFIX:-gblk}
[ "$base" != "rl/checkpoints/ppo_${prefix}_$track.pt" ] && cp "$base" rl/checkpoints/ppo_${prefix}_$track.pt
.venv/Scripts/python -u rl/train_ppo.py --track $track --envs 8 --block 5 --device cuda \
  --no-lap-fraction --resume --checkpoint rl/checkpoints/ppo_${prefix}_$track.pt \
  --random-start 0.5 --failure-start 0.3 --own-start 0.5 --gamma 0.995 --gae-lambda 0.9 \
  --critic-warmup 30 --bc-data rl/checkpoints/bc_block.npz --bc-coef 0.01 --bc-coef-end 0.01 \
  --lr 5e-5 --lr-end 0 --keep-every 200 --total-steps ${STEPS:-5000000} "$@" >> runs/rl_train_${prefix}_$track.log 2>&1
