#!/bin/sh
# Test a block-decision specialist's kept checkpoints and say which is best.
#
#   sh scripts/eval_block_specialist.sh <track>
#
# For the copies kept at updates 1600, 2000 and 2400 and the final checkpoint
# (rl/checkpoints/ppo_blk_<track>.*), drives ten attempts from the start line
# with the policy's usual randomness (seeds 10..19) and one attempt always
# taking its top choice ("greedy"). Prints, per checkpoint: finishes out of
# ten, the best lap, and the greedy result. A run can get worse as well as
# better, so the checkpoint to keep is chosen from this, not assumed to be the
# last. Attempt logs go to runs/big_blk/.
track=$1
cp -n rl/checkpoints/ppo_${PREFIX:-blk}_$track.pt rl/checkpoints/ppo_${PREFIX:-blk}_$track.final.pt
mkdir -p runs/big_blk
for c in u1600 u2000 u2400 final; do
  for s in 10 11 12 13 14 15 16 17 18 19; do echo "$c $s sample"; done
  echo "$c 0 greedy"
done | xargs -P 8 -L 1 sh -c "python rl/evaluate.py --track $track --checkpoint rl/checkpoints/ppo_${PREFIX:-blk}_$track.\$0.pt --policy \$2 --seed \$1 --run blk_\$0_\$2\$1 > runs/big_blk/$track.\$0.\$2.\$1.txt 2>&1"
for c in u1600 u2000 u2400 final; do
  echo "$track.$c: $(grep -l '^FINISHED' runs/big_blk/$track.$c.sample.*.txt | wc -l)/10 best $(grep -ho '^FINISHED in [0-9.]*' runs/big_blk/$track.$c.sample.*.txt | awk '{print $3}' | sort -n | head -1) | greedy: $(grep -ho 'FINISHED in [0-9.]*\|DID NOT FINISH ([a-z ]*)[^:]*: reached [0-9.]*%' runs/big_blk/$track.$c.greedy.0.txt | sed 's/ at .*reached / /') | human $(grep -ho 'human [0-9.]*' runs/big_blk/$track.$c.*.txt | head -1 | cut -d' ' -f2)"
done
