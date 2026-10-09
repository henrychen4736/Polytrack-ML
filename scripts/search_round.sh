#!/bin/sh
# One round of "train towards the searched lap, then search again".
#
#   sh scripts/search_round.sh <track> <starting checkpoint> <searched lap> <round name>
#   sh scripts/search_round.sh desert4 rl/checkpoints/ppo_gblk_desert4.final.pt runs/rollout_desert4.recording.json r1
#
# scripts/search_rollout.mjs makes a specialist's lap faster, but only as far
# as the specialist's own driving of the rest of the lap allows; it stalls
# after one pass. This script moves the specialist to where the search got to
# and searches again from there:
#   1. the searched lap becomes imitation examples (rl/lap_bc.py)
#   2. the specialist practises for 2.5 million decisions as usual, with an
#      imitation term towards those examples (weight 0.05, against 0.01 for
#      the human examples in earlier training)
#   3. its last kept copies are tested, ten attempts each, and the one with
#      the fastest lap is picked
#   4. that copy's weights are exported and the search runs again (one pass,
#      SEARCH_SECONDS, default 600)
# Output: rl/checkpoints/ppo_s<round>_<track>.* , runs/rollout_<round>_<track>.recording.json,
#         runs/search_round/ (attempt logs), runs/rollout_<round>_<track>.log
# To run a further round, give this script the picked copy and the new lap
# (both are printed at the end).
track=$1; base=$2; lap=$3; round=$4
prefix=s$round
ck=rl/checkpoints/ppo_${prefix}_$track
mkdir -p runs/search_round

# 1. imitation examples from the searched lap
python rl/lap_bc.py $track $lap rl/checkpoints/bc_search_${round}_$track.npz || exit 1

# 2. practice with the imitation term (later options override the script's own)
PREFIX=$prefix STEPS=2500000 sh scripts/train_block_specialist_from.sh $track $base \
  --bc-data rl/checkpoints/bc_search_${round}_$track.npz --bc-coef 0.05 --bc-coef-end 0.05 --max-off-line 40 || exit 1

# 3. test the last kept copies; names without dots, they become lap file names
cp $ck.pt $ck.final.pt
for c in u800 u1000 u1200 final; do
  for s in 10 11 12 13 14 15 16 17 18 19; do echo "$c $s sample"; done
  echo "$c 0 greedy"
done | xargs -P 8 -L 1 sh -c "python rl/evaluate.py --track $track --max-off-line 40 --checkpoint $ck.\$0.pt --policy \$2 --seed \$1 --run ${prefix}_\$0_\$2\$1 > runs/search_round/$track.$round.\$0.\$2.\$1.txt 2>&1"
pick=""; pickTime=999
for c in u800 u1000 u1200 final; do
  n=$(grep -l '^FINISHED' runs/search_round/$track.$round.$c.sample.*.txt | wc -l)
  t=$(grep -ho '^FINISHED in [0-9.]*' runs/search_round/$track.$round.$c.sample.*.txt | awk '{print $3}' | sort -n | head -1)
  echo "$track.$round.$c: $n/10 best $t | greedy: $(grep -ho 'FINISHED in [0-9.]*\|DID NOT FINISH ([a-z ]*)[^:]*: reached [0-9.]*%' runs/search_round/$track.$round.$c.greedy.0.txt | sed 's/ at .*reached / /')"
  if [ -n "$t" ] && [ "$(echo "$t $pickTime" | awk '{print ($1 < $2)}')" = 1 ]; then pick=$c; pickTime=$t; fi
done
[ -n "$pick" ] || { echo "no copy finished a lap"; exit 1; }
echo "picked $ck.$pick.pt ($pickTime s)"

# 4. search again from the picked copy
.venv/Scripts/python rl/export_actor.py $ck.$pick.pt
node scripts/search_rollout.mjs $track actor=$ck.$pick.actor.bin seconds=${SEARCH_SECONDS:-600} passes=1 out=rollout_$round 2>&1 \
  | grep -v "wasm streaming\|falling back" > runs/rollout_${round}_$track.log
tail -n 5 runs/rollout_${round}_$track.log
echo "next round: sh scripts/search_round.sh $track $ck.$pick.pt runs/rollout_${round}_$track.recording.json <name>"
