#!/bin/sh
# The "adapt" half: fine-tune the generalist on a track towards the lap that
# explore.mjs found. DRY RUN: this script only PRINTS the commands. Nothing
# here has been run (the GPU and CPU are training other things); see the
# README for what that leaves untested.
#
#   sh ideas/g2-3-explore-and-adapt/finetune_plan.sh <track> [found lap] [starting checkpoint] [decisions]
#   sh ideas/g2-3-explore-and-adapt/finetune_plan.sh winter4
#
# It is scripts/search_round.sh with three differences:
#   - the lap comes from explore.mjs, not from search_rollout.mjs
#   - the train_ppo.py command is written out instead of going through
#     scripts/train_block_specialist_from.sh, because that script names its
#     checkpoint ppo_<prefix>_<track>.pt and idea agents may only write
#     checkpoints called g2-3-...
#   - 500 000 decisions by default (about 10 minutes at the 850 decisions/s
#     the sr2 runs logged with 8 simulators), against 2.5 million there: the
#     requirement is "reasonable after a few tries", not a polished specialist.
#     Whether 500 000 is enough is not known.
track=${1:?track}
lap=${2:-runs/g2-3-explore_$track.recording.json}
base=${3:-rl/checkpoints/ppo_blkgen.best2.pt}
steps=${4:-500000}
ck=rl/checkpoints/g2-3-adapt_$track
bc=rl/checkpoints/g2-3-bc_$track.npz
cat <<EOF
# 1. The found lap as imitation examples: what the agent would have seen at
#    every decision of that lap, and the decision taken (reference lap: the human's).
.venv/Scripts/python rl/lap_bc.py $track $lap $bc

# 2. Practise on the track from a copy of the generalist, with an imitation
#    term towards those examples (weight 0.05 as in search_round.sh). The
#    restarts before failure points and from the agent's own earlier states
#    (--failure-start, --own-start) are the training-time cousin of the
#    explore loop and stay on.
cp $base $ck.pt
.venv/Scripts/python -u rl/train_ppo.py --track $track --envs 8 --block 5 --device cuda \\
  --no-lap-fraction --resume --checkpoint $ck.pt \\
  --random-start 0.5 --failure-start 0.3 --own-start 0.5 --gamma 0.995 --gae-lambda 0.9 \\
  --critic-warmup 30 --bc-data $bc --bc-coef 0.05 --bc-coef-end 0.05 --max-off-line 40 \\
  --lr 5e-5 --lr-end 0 --keep-every 50 --total-steps $steps > ideas/g2-3-explore-and-adapt/out/train_$track.log 2>&1

# 3. Test before and after: ten attempts from the start line with the
#    policy's usual randomness, plus one with its top choices.
for s in 10 11 12 13 14 15 16 17 18 19; do
  .venv/Scripts/python rl/evaluate.py --track $track --max-off-line 40 --checkpoint $base --policy sample --seed \$s --run g2-3-before\$s
  .venv/Scripts/python rl/evaluate.py --track $track --max-off-line 40 --checkpoint $ck.pt --policy sample --seed \$s --run g2-3-after\$s
done
.venv/Scripts/python rl/evaluate.py --track $track --max-off-line 40 --checkpoint $ck.pt --policy greedy --run g2-3-after-greedy

# 4. (optional) explore again with the adapted policy; it should now finish
#    from the start line, and search_rollout.mjs can take over to make the lap faster.
.venv/Scripts/python rl/export_actor.py $ck.pt
node ideas/g2-3-explore-and-adapt/explore.mjs $track actor=$ck.actor.bin out=g2-3-adapted
node scripts/search_rollout.mjs $track actor=$ck.actor.bin workers=8 seconds=600 out=g2-3-rollout
EOF
