#!/bin/sh
# The ten-attempt test of a ROUTE-reference checkpoint (334 inputs; e.g. from
# g2-2-train_route_on_generated.sh) on tracks it has never practised on: the
# 10 generated test tracks of the set and the 3 held-out official tracks.
#
#   sh ideas/g2-2-track-generator/g2-2-eval_route_on_generated.sh rl/checkpoints/ppo_g2-2-route-gen.after_<steps>.pt
#   P=8 sh ideas/g2-2-track-generator/g2-2-eval_route_on_generated.sh <checkpoint>    (8 attempts at once; default 4)
#   SET=<set folder> sh ideas/g2-2-track-generator/g2-2-eval_route_on_generated.sh <checkpoint>
#
# Per track, from the start line: ten attempts with the policy's usual
# randomness (seeds 10 to 19) and one with its top choices ("greedy"), as in
# scripts/eval_generalist.sh. rl/evaluate.py reads from the checkpoint that it
# is a route model and builds the route-mode environment; a generated track
# is given as its .track.json file. The tracks:
#   generated  every track in $SET/test.txt (seeds 30000 and up; no training
#              track shares a seed with them)
#   official   desert3, summer3, winter4 (no generalist has trained on them)
# Run it on ppo_g2-1-route.pt too: that is the comparison that says whether
# the generated tracks helped.
#
# Prints the total finished out of 130 (sampled) and out of 13 (greedy), the
# share of decisions with body contact, and per track: sampled finishes out
# of 10, the best of those laps, the greedy result, and the comparison lap:
# the best human lap on an official track, the scripted follower's lap
# (about 110 km/h down the middle, a proof of drivability, not a target) on a
# generated one. One file per attempt in runs/big_g2-2-<checkpoint name>/.
#
# Each attempt is one simulator; P of them run at once. 13 tracks x 11
# attempts = 143 attempts, about 10 minutes at P=4 (187 attempts of the
# official-track test took 12.6 minutes at 3 at a time).
# Local use only: drives the local simulator; no network.
ck=$1
[ -f "$ck" ] || { echo "usage: sh ideas/g2-2-track-generator/g2-2-eval_route_on_generated.sh <checkpoint .pt>"; exit 2; }
SET=${SET:-ideas/g2-2-track-generator/sets/g2-2-set1}
[ -f "$SET/test.txt" ] || { echo "no $SET/test.txt: make the set first (sh ideas/g2-2-track-generator/g2-2-make_set.sh)"; exit 2; }
P=${P:-4}
name=$(basename "$ck" .pt)
d=runs/big_g2-2-$name
mkdir -p $d
T="$(grep -v '^ *$' "$SET/test.txt" | tr -d '\r') desert3 summer3 winter4"
# Short name of a track: an official name, or a file's base name.
label() { basename "$1" .track.json; }
# One line per attempt: track, label, seed (or "greedy").
for t in $T; do for s in 10 11 12 13 14 15 16 17 18 19 greedy; do echo "$t $(label $t) $s"; done; done |
  xargs -P $P -L 1 sh -c "if [ \$2 = greedy ]; then a='--policy greedy'; else a=\"--policy sample --seed \$2\"; fi;
    .venv/Scripts/python rl/evaluate.py --track \$0 --checkpoint $ck \$a --run g2-2-eval_\$2 > $d/\$1.\$2.txt 2>&1"
n=$(echo $T | wc -w)
sampled=$(ls $d/*.1[0-9].txt | xargs grep -l '^FINISHED' | wc -l)
greedy=$(ls $d/*.greedy.txt | xargs grep -l '^FINISHED' | wc -l)
contact=$(grep -ho 'contact on [0-9]* of [0-9]*' $d/*.txt | awk '{c+=$3;n+=$5} END{printf "contact %.2f%%",100*c/n}')
echo "== $name: $sampled of $((n * 10)) sampled, $greedy of $n greedy; $contact"
for t in $T; do
  l=$(label $t)
  if [ "$l" = "$t" ]; then
    ref="human $(.venv/Scripts/python -c "import json; print(json.load(open('data/laps/$t.json'))[0]['frames'] / 1000)" 2>/dev/null)"
  else
    ref="follower $(node -e "console.log(JSON.parse(require('fs').readFileSync('${t%.track.json}.lap.json','utf8')).frames / 1000)" 2>/dev/null)"
  fi
  printf "%-34s %2s/10 best %-7s greedy %-24s (%s)\n" $l \
    $(ls $d/$l.1[0-9].txt | xargs grep -l '^FINISHED' 2>/dev/null | wc -l) \
    "$(grep -ho '^FINISHED in [0-9.]*' $d/$l.1[0-9].txt | awk '{print $3}' | sort -n | head -1)" \
    "$(grep -ho '^FINISHED in [0-9.]*\|^DID NOT FINISH ([a-z ]*)' $d/$l.greedy.txt | head -1 | sed 's/FINISHED in //;s/DID NOT FINISH //')" \
    "$ref"
done
