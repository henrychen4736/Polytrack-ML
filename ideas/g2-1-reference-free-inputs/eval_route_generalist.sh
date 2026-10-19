#!/bin/sh
# The ten-attempt test for a ROUTE-reference generalist (334 inputs; trained by
# train_ppo.py --reference route, e.g. by train_route_generalist.sh): the same
# test as scripts/eval_generalist.sh, plus one greedy attempt per track.
#
#   sh ideas/g2-1-reference-free-inputs/eval_route_generalist.sh rl/checkpoints/ppo_g2-1-route.after_13008896.pt
#   P=8 sh ideas/g2-1-reference-free-inputs/eval_route_generalist.sh <checkpoint>    (8 attempts at once; default 4)
#
# All 17 official tracks, from the start line: ten attempts with the policy's
# usual randomness (seeds 10 to 19) and one with its top choices ("greedy").
# rl/evaluate.py reads from the checkpoint that it is a route model and builds
# the route-mode environment for it; the human lap time printed is only for
# comparison (the policy never sees a human lap). The held-out tracks are
# desert3, summer3 and winter4, and summer4 too for a model from
# train_route_generalist.sh (it does not practise there; its route is wrong).
#
# Prints the total finished out of 170 (sampled), the greedy finishes out of
# 17, the share of decisions with body contact, and per track: sampled
# finishes out of 10, the best of those laps, the greedy result, the human
# lap. One file per attempt in runs/big_g2-1-<checkpoint name>/.
#
# Each attempt is one simulator; P of them run at once.
# Local use only: drives the local simulator; no network.
ck=$1
[ -f "$ck" ] || { echo "usage: sh ideas/g2-1-reference-free-inputs/eval_route_generalist.sh <checkpoint .pt>"; exit 2; }
P=${P:-4}
name=$(basename "$ck" .pt)
d=runs/big_g2-1-$name
mkdir -p $d
T="desert1 desert2 desert3 desert4 desert5 summer1 summer2 summer3 summer4 summer5 summer6 summer7 winter1 winter2 winter3 winter4 winter5"
# One line per attempt: track, seed (or "greedy").
for t in $T; do for s in 10 11 12 13 14 15 16 17 18 19 greedy; do echo "$t $s"; done; done |
  xargs -P $P -L 1 sh -c "if [ \$1 = greedy ]; then a='--policy greedy'; else a=\"--policy sample --seed \$1\"; fi;
    .venv/Scripts/python rl/evaluate.py --track \$0 --checkpoint $ck \$a --run g2-1-eval_\$1 > $d/\$0.\$1.txt 2>&1"
sampled=$(ls $d/*.1[0-9].txt | xargs grep -l '^FINISHED' | wc -l)
greedy=$(ls $d/*.greedy.txt | xargs grep -l '^FINISHED' | wc -l)
contact=$(grep -ho 'contact on [0-9]* of [0-9]*' $d/*.txt | awk '{c+=$3;n+=$5} END{printf "contact %.2f%%",100*c/n}')
echo "== $name: $sampled of 170 sampled, $greedy of 17 greedy; $contact"
for t in $T; do
  printf "%-8s %2s/10 best %-7s greedy %-24s (human %s)\n" $t \
    $(ls $d/$t.1[0-9].txt | xargs grep -l '^FINISHED' 2>/dev/null | wc -l) \
    "$(grep -ho '^FINISHED in [0-9.]*' $d/$t.1[0-9].txt | awk '{print $3}' | sort -n | head -1)" \
    "$(grep -ho '^FINISHED in [0-9.]*\|^DID NOT FINISH ([a-z ]*)' $d/$t.greedy.txt | head -1 | sed 's/FINISHED in //;s/DID NOT FINISH //')" \
    "$(grep -ho 'human [0-9.]*' $d/$t.*.txt | head -1 | cut -d' ' -f2)"
done
