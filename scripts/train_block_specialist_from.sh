#!/bin/sh
# Train a block-decision specialist that INHERITS from a generalist.
#
#   sh scripts/train_block_specialist_from.sh <track> <generalist checkpoint>
#
# The counterpart of scripts/train_block_specialist.sh, which starts from the
# imitation-only model. This one starts as a copy of a generalist that already
# drives every track, and practises on the one track for the same 5 million
# block decisions, so the two kinds of specialist can be compared like for
# like. Differences from the other script, because the start is a trained
# driver and not a beginner:
#   - a lower learning rate (5e-5 fading to zero, against 1.5e-4): the aim is
#     to refine, not to relearn
#   - a short critic warm-up: the critic already knows this reward
# Output: rl/checkpoints/ppo_gblk_<track>.pt (+ .u<update>.pt copies),
#         runs/rl_train_gblk_<track>.log
track=$1
cp $2 rl/checkpoints/ppo_gblk_$track.pt
.venv/Scripts/python -u rl/train_ppo.py --track $track --envs 8 --block 5 --device cuda \
  --no-lap-fraction --resume --checkpoint rl/checkpoints/ppo_gblk_$track.pt \
  --random-start 0.5 --failure-start 0.3 --own-start 0.5 --gamma 0.995 --gae-lambda 0.9 \
  --critic-warmup 30 --bc-data rl/checkpoints/bc_block.npz --bc-coef 0.01 --bc-coef-end 0.01 \
  --lr 5e-5 --lr-end 0 --keep-every 200 --total-steps 5000000 > runs/rl_train_gblk_$track.log 2>&1
