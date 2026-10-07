#!/bin/sh
# Ten attempts per track on all 17 official tracks for one checkpoint.
#
#   sh scripts/eval_generalist.sh <name>     reads rl/checkpoints/ppo_<name>.pt
#
# Each attempt starts on the start line and uses the policy's usual randomness
# (seeds 10..19). Prints the total finished out of 170, the share of decisions
# with body contact, and per track: finishes out of 10, best lap, human lap.
# Three attempts per track turned out too few to tell checkpoints apart
# (differences of 3 or 4 laps were noise), hence ten. Logs go to runs/big_<name>/.
c=$1
d=runs/big_$c
mkdir -p $d
T="desert1 desert2 desert3 desert4 desert5 summer1 summer2 summer3 summer4 summer5 summer6 summer7 winter1 winter2 winter3 winter4 winter5"
for t in $T; do for s in 10 11 12 13 14 15 16 17 18 19; do echo "$t $s"; done; done |
  xargs -P 8 -L 1 sh -c "python rl/evaluate.py --track \$0 --checkpoint rl/checkpoints/ppo_$c.pt --policy sample --seed \$1 --run big_s\$1 > $d/\$0.\$1.txt 2>&1"
echo "== $c: $(grep -l '^FINISHED' $d/*.txt | wc -l) of 170; $(grep -ho 'contact on [0-9]* of [0-9]*' $d/*.txt | awk '{c+=$3;n+=$5} END{printf "contact %.2f%%",100*c/n}')"
for t in $T; do
  printf "%s %s/10 best %s (h %s)\n" $t $(grep -l '^FINISHED' $d/$t.*.txt 2>/dev/null | wc -l) "$(grep -ho '^FINISHED in [0-9.]*' $d/$t.*.txt | awk '{print $3}' | sort -n | head -1)" "$(grep -ho 'human [0-9.]*' $d/$t.*.txt | head -1 | cut -d' ' -f2)"
done
