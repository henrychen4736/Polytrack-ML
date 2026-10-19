#!/bin/sh
# The "adapt" half of g2-3, run for real: the commands finetune_plan.sh
# prints, executed in order for one track. Local use only: drives the
# simulator, uploads nothing.
#
#   sh ideas/g2-3-explore-and-adapt/finetune_run.sh <track> [decisions]
#   sh ideas/g2-3-explore-and-adapt/finetune_run.sh winter4
#
# Steps (see finetune_plan.sh for why each setting is what it is):
#   1. the lap explore.mjs found -> imitation examples (rl/lap_bc.py)
#   2. 500 000 decisions of PPO from a copy of the generalist, imitation
#      weight 0.05 towards that lap (about 10 minutes on 8 simulators + GPU)
#   3. the ten-attempt test (seeds 10 to 19, sampled) before and after, and
#      one greedy attempt after
#   4. explore again with the adapted policy, then search_rollout.mjs for 600 s
#
# Differences from the printed plan, for restarting after a shutdown:
#   - the generalist is copied to the fine-tune checkpoint only when that
#     checkpoint does not exist yet, so a rerun continues the practice from
#     its last save (as a new stretch: fresh learning-rate fade) instead of
#     throwing it away;
#   - a step whose output already exists is skipped (examples file, a test
#     attempt with a result file, the training's done marker).
# A rerun of an interrupted practice runs the whole decision count again from
# the last save; delete $ck.pt to start the track over.
set -e
track=${1:?track}
steps=${2:-500000}
lap=runs/g2-3-explore_$track.recording.json
base=rl/checkpoints/ppo_blkgen.best2.pt
ck=rl/checkpoints/g2-3-adapt_$track
bc=rl/checkpoints/g2-3-bc_$track.npz
out=ideas/g2-3-explore-and-adapt/out
py=.venv/Scripts/python
mkdir -p $out

# 1. examples
[ -f $bc ] || $py rl/lap_bc.py $track $lap $bc

# 2. practice
if [ ! -f $ck.done ]; then
  [ -f $ck.pt ] || cp $base $ck.pt
  $py -u rl/train_ppo.py --track $track --envs 8 --block 5 --device cuda \
    --no-lap-fraction --resume --checkpoint $ck.pt \
    --random-start 0.5 --failure-start 0.3 --own-start 0.5 --gamma 0.995 --gae-lambda 0.9 \
    --critic-warmup 30 --bc-data $bc --bc-coef 0.05 --bc-coef-end 0.05 --max-off-line 40 \
    --lr 5e-5 --lr-end 0 --keep-every 50 --total-steps $steps >> $out/train_$track.log 2>&1
  touch $ck.done
fi

# 3. the ten-attempt test, before and after; one result file per attempt
# (evaluate.py exits 1 when the attempt does not finish; that is a result, not a failure: || true)
for s in 10 11 12 13 14 15 16 17 18 19; do
  [ -f runs/g2-3-before${s}_$track.json ] || \
    $py rl/evaluate.py --track $track --max-off-line 40 --checkpoint $base --policy sample --seed $s --run g2-3-before$s || true
  [ -f runs/g2-3-after${s}_$track.json ] || \
    $py rl/evaluate.py --track $track --max-off-line 40 --checkpoint $ck.pt --policy sample --seed $s --run g2-3-after$s || true
done
$py rl/evaluate.py --track $track --max-off-line 40 --checkpoint $ck.pt --policy greedy --run g2-3-after-greedy || true

# 4. explore and search with the adapted policy
$py rl/export_actor.py $ck.pt
node ideas/g2-3-explore-and-adapt/explore.mjs $track actor=$ck.actor.bin out=g2-3-adapted || true  # "no finished lap" is a result
node scripts/search_rollout.mjs $track actor=$ck.actor.bin workers=8 seconds=600 out=g2-3-rollout
