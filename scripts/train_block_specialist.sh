#!/bin/sh
# Train one block-decision specialist (see BLOCK DECISIONS in rl/racing_env.mjs).
#
#   sh scripts/train_block_specialist.sh <track>
#
# Starts from the imitation-trained block model (rl/checkpoints/ppo_block.bc.pt,
# made by rl/pretrain_bc.py --block 5), practises on the one track for 5 million
# block decisions with the learning rate fading to zero, uses the GPU build of
# PyTorch in .venv for the learning step, and keeps a copy of the checkpoint
# every 200 updates so the best one can be chosen afterwards by test.
# Output: rl/checkpoints/ppo_blk_<track>.pt (+ .u<update>.pt copies),
#         runs/rl_train_blk_<track>.log
# The imitation model is copied in only when the specialist's checkpoint does
# not exist yet. (It used to be copied every time, so a rerun silently threw
# the trained specialist away.) A rerun therefore continues from the
# checkpoint as a new stretch: the learning rate fades from --lr again and the
# kept copies are numbered from the start again, overwriting the earlier
# .u<update> copies. To start over, delete rl/checkpoints/ppo_blk_<track>.pt.
track=$1
[ -f rl/checkpoints/ppo_blk_$track.pt ] || cp rl/checkpoints/ppo_block.bc.pt rl/checkpoints/ppo_blk_$track.pt
.venv/Scripts/python -u rl/train_ppo.py --track $track --envs 8 --block 5 --device cuda \
  --no-lap-fraction --resume --checkpoint rl/checkpoints/ppo_blk_$track.pt \
  --random-start 0.5 --failure-start 0.3 --own-start 0.5 --gamma 0.995 --gae-lambda 0.9 \
  --critic-warmup 100 --bc-data rl/checkpoints/bc_block.npz --bc-coef 0.05 --bc-coef-end 0.02 \
  --lr 1.5e-4 --lr-end 0 --keep-every 200 --total-steps 5000000 > runs/rl_train_blk_$track.log 2>&1
