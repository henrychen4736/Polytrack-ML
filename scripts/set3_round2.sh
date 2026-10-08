#!/bin/sh
# "Set 3" specialists, second half: rules 2 and 3.
#
#   sh scripts/set3_round2.sh <track>          # test round 1, search, train round 2
#   sh scripts/set3_round2.sh <track> test     # test the finished round 2
#
# Round 1 (started by hand with scripts/train_block_specialist_from.sh,
# PREFIX=g3blk STEPS=2500000 --pace-cap 1.3 --max-off-line 40) is rule 1: the
# specialist is paid for going up to 1.3 times the human's speed and may be up
# to 40 units from the human's line. This script then does:
#   rule 2  take the fastest lap round 1 can drive (ten attempts with the
#           policy's usual randomness and one greedy attempt, for each of the
#           last kept copies) and run the key-timing search on it for
#           SEARCH_SECONDS (default 600)
#   rule 3  if the searched lap beats the human's, it becomes the reference
#           lap for round 2 (and the imitation term, which pulls towards the
#           HUMAN's keys, is switched off); if it does not, the human's lap
#           stays the reference and round 2 simply continues round 1
# Round 2 is another 2.5 million decisions, so rounds 1 + 2 equal the 5 million
# a "set 2" specialist gets and the two sets can be compared like for like.
#
# All tests here use --max-off-line 40, the limit this set trains with.
# Files: rl/checkpoints/ppo_g3blk_<track>.pt (+ .r1_*.pt copies of round 1; no dots in the
#        copy names, because they become lap file names and those allow none),
#        runs/g3search_<track>.recording.json, runs/set3/ (attempt logs),
#        runs/set3/<track>.ref (the reference option used for round 2, or empty)
track=$1
mode=${2:-train}
ck=rl/checkpoints/ppo_g3blk_$track
mkdir -p runs/set3

# Ten sampled attempts + one greedy attempt for each named copy.
#   $1 = label for the files (r1 or r2), $2 = extra evaluate.py options, rest = copies
run_tests() {
  label=$1; extra=$2; shift 2
  for c in "$@"; do
    for s in 10 11 12 13 14 15 16 17 18 19; do echo "$c $s sample"; done
    echo "$c 0 greedy"
  done | xargs -P 8 -L 1 sh -c "python rl/evaluate.py --track $track --max-off-line 40 $extra --checkpoint $ck.\$0.pt --policy \$2 --seed \$1 --run g3${label}_\$0_\$2\$1 > runs/set3/$track.$label.\$0.\$2.\$1.txt 2>&1"
  for c in "$@"; do
    echo "$track.$label.$c: $(grep -l '^FINISHED' runs/set3/$track.$label.$c.sample.*.txt | wc -l)/10 best $(grep -ho '^FINISHED in [0-9.]*' runs/set3/$track.$label.$c.sample.*.txt | awk '{print $3}' | sort -n | head -1) | greedy: $(grep -ho 'FINISHED in [0-9.]*\|DID NOT FINISH ([a-z ]*)[^:]*: reached [0-9.]*%' runs/set3/$track.$label.$c.greedy.0.txt | sed 's/ at .*reached / /') | human $(grep -ho 'human [0-9.]*' runs/set3/$track.$label.$c.*.txt | head -1 | cut -d' ' -f2)"
  done
}

if [ "$mode" = test ]; then
  # Round 2 is finished: test its last kept copies against the reference it
  # trained with.
  cp -n $ck.pt $ck.final.pt
  run_tests r2 "$(cat runs/set3/$track.ref 2>/dev/null)" u800 u1000 u1200 final
  exit 0
fi

# --- round 1 results ---------------------------------------------------------
# Keep round 1's copies under their own names: round 2 counts its updates from
# 1 again and would overwrite them.
for c in u800 u1000 u1200; do cp -n $ck.$c.pt $ck.r1_$c.pt; done
cp -n $ck.pt $ck.r1_final.pt
run_tests r1 "" r1_u800 r1_u1000 r1_u1200 r1_final

# --- rule 2: search from the fastest lap round 1 drove ------------------------
# Each attempt log holds "FINISHED in <seconds>"; the file name gives the run.
fastest=$(grep -H '^FINISHED in' runs/set3/$track.r1.*.txt | sed 's/:FINISHED in / /' | sort -k2 -n | head -1)
file=${fastest%% *}
# runs/set3/<track>.r1.<copy>.<policy>.<seed>.txt -> run name g3r1_<copy>_<policy><seed>
run=$(basename $file .txt | sed "s/^$track\.r1\.\(.*\)\.\([a-z]*\)\.\([0-9]*\)$/g3r1_\1_\2\3/")
echo "fastest round 1 lap: ${fastest##* } s ($run)"
node scripts/export_recording.mjs $track $run > runs/set3/$track.export.txt 2>&1
node scripts/search_timeline.mjs $track seed=$run seconds=${SEARCH_SECONDS:-600} out=g3search > runs/set3/$track.search.txt 2>&1
tail -n 3 runs/set3/$track.search.txt
# Stop here if the search produced nothing: round 2 must not start without it.
[ -f runs/g3search_$track.recording.json ] || { echo "no searched lap, stopping"; exit 1; }

# --- rule 3: is the searched lap faster than the human's? ---------------------
searched=$(node -e "console.log(JSON.parse(require('fs').readFileSync('runs/g3search_$track.recording.json','utf8')).frames)")
human=$(grep -ho 'human [0-9.]*' runs/set3/$track.r1.*.txt | head -1 | awk '{printf "%d", $2 * 1000}')
if [ "$searched" -lt "$human" ]; then
  echo "searched lap ${searched} ms beats the human's ${human} ms: it becomes the reference"
  echo "--ref-file runs/g3search_$track.recording.json" > runs/set3/$track.ref
  extra="--ref-file runs/g3search_$track.recording.json --bc-coef 0 --bc-coef-end 0"
else
  echo "searched lap ${searched} ms does not beat the human's ${human} ms: the human's lap stays the reference"
  : > runs/set3/$track.ref
  extra=""
fi

# --- round 2 -----------------------------------------------------------------
PREFIX=g3blk STEPS=2500000 sh scripts/train_block_specialist_from.sh $track $ck.pt --pace-cap 1.3 --max-off-line 40 $extra
