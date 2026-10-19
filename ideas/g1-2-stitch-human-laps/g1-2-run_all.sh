#!/bin/sh
# Stitch human laps on every track, verify each lap, print one table.
#
#   sh ideas/g1-2-stitch-human-laps/g1-2-run_all.sh
#   PARALLEL=2 STITCH_OPTS="judge=check" sh ideas/g1-2-stitch-human-laps/g1-2-run_all.sh
#   TRACKS="desert4 summer4" sh ideas/g1-2-stitch-human-laps/g1-2-run_all.sh
#
# What it does, per track (stitch_laps.mjs explains the stitch itself):
#   1. runs stitch_laps.mjs <track> joins=0 name=$NAME $STITCH_OPTS, its
#      output in out/<track>.log;
#   2. if a lap with a switch in it was saved (runs/$NAME_<track>.recording.json),
#      checks that FILE again with the game's Verify (ideas/shared/verify_lap.mjs,
#      which uses ideas/shared/verify.mjs: accepted on its finish tick,
#      rejected one tick sooner). A lap with no switch kept is a human lap; stitch_laps.mjs
#      has verified it in the run and does not save it;
#   3. writes one line to out/<track>.result.
# Then prints the table: track, best human lap, stitched lap, gain in ms
# (positive = faster than the best human lap), and what happened.
#
# Restartable: a track with out/<track>.result is skipped. A run cut off by a
# shutdown leaves no result line (its log has neither "stitched lap" nor
# "NO LAP"), so the next launch runs that track again. To redo a track, delete
# its .result file.
#
# Settings (environment variables):
#   STITCH_OPTS  default "judge=finish fallback=4": judge each switch by
#                finish time and undo up to 4 switches after which the car was
#                lost. The lap begun on is the plan's choice, which need not be
#                the fastest human lap (desert4: lap 1; summer4: lap 7), so a
#                gain can be negative. Adding start=0 begins on the fastest lap
#                and makes the gain never negative, but on desert4 the plan from
#                lap 0 has no switch at all and the known 21.730 s lap (lap 1,
#                then lap 7) is lost; measured. ("judge=check" alone is the
#                original rule.)
#   NAME         run name of the saved laps, default g1-2-all
#   PARALLEL     tracks at once, one simulator each, default 4
#   TRACKS       default all 17
#   OUT          folder for logs and results, default ideas/g1-2-stitch-human-laps/out
#
# Cost, measured 17 October 2026 on a machine running one GPU trainer:
# 8 s (desert4, judge=check) to 100 s (summer4, judge=finish) per track, one
# simulator. All 17 with PARALLEL=4: about 10 minutes expected (not run).
#
# Local use only: nothing here contacts any server. out/ holds logs and
# lap times only; the laps themselves go to runs/, which is not in git.
OUT=${OUT:-ideas/g1-2-stitch-human-laps/out}
NAME=${NAME:-g1-2-all}
STITCH_OPTS=${STITCH_OPTS:-"judge=finish fallback=4"}
PARALLEL=${PARALLEL:-4}
TRACKS=${TRACKS:-"desert1 desert2 desert3 desert4 desert5 summer1 summer2 summer3 summer4 summer5 summer6 summer7 winter1 winter2 winter3 winter4 winter5"}
export NAME STITCH_OPTS OUT
[ -f ideas/g1-2-stitch-human-laps/stitch_laps.mjs ] || { echo "run this from the project root"; exit 1; }
mkdir -p $OUT

if [ "$1" = "--one" ]; then
  t=$2
  [ -f $OUT/$t.result ] && exit 0
  # Only this run's lap may be found afterwards.
  rm -f runs/${NAME}_$t.json runs/${NAME}_$t.recording.json
  echo "$t: stitching ($STITCH_OPTS)"
  node ideas/g1-2-stitch-human-laps/stitch_laps.mjs $t joins=0 name=$NAME $STITCH_OPTS > $OUT/$t.log 2>&1
  code=$?
  human=$(sed -n 's/^best human lap *\([0-9.]*\) s.*/\1/p' $OUT/$t.log | head -n 1)
  lap=$(sed -n 's/^stitched lap \([0-9.]*\) s.*/\1/p' $OUT/$t.log | tail -n 1)
  if [ -f runs/${NAME}_$t.recording.json ]; then
    v=$(node ideas/shared/verify_lap.mjs $t runs/${NAME}_$t.recording.json 2>/dev/null | tail -n 1)
    case "$v" in
      PASS*) what="switched, Verify PASS on tick ${v#PASS }" ;;
      *) what="lap file FAILS Verify: $v"; lap="" ;;
    esac
  elif [ -n "$lap" ] && grep -q '^PASS Verify' $OUT/$t.log; then
    what="no switch kept: a human lap, Verify PASS"
  elif grep -q '^NO LAP' $OUT/$t.log; then
    what="$(grep '^NO LAP' $OUT/$t.log | head -n 1)"
  elif [ -n "$lap" ]; then
    what="Verify FAILED in the run (exit $code)"; lap=""
  else
    echo "$t: cut off or crashed (exit $code), no result written; see $OUT/$t.log"
    exit 1
  fi
  gain=""
  [ -n "$lap" ] && [ -n "$human" ] && gain=$(echo "$human $lap" | awk '{printf "%d", ($1 - $2) * 1000 + ($1 > $2 ? 0.5 : -0.5)}')
  printf '%s\t%s\t%s\t%s\t%s\n' "$t" "${human:--}" "${lap:--}" "${gain:--}" "$what" > $OUT/$t.result.tmp && mv $OUT/$t.result.tmp $OUT/$t.result
  echo "$t: done ($what)"
  exit 0
fi

for t in $TRACKS; do echo $t; done | xargs -P $PARALLEL -I{} sh "$0" --one {}

echo
echo "g1-2 stitched laps ($STITCH_OPTS); gain = best human minus stitched, ms (positive = faster)"
printf '%-8s %10s %10s %7s  %s\n' track "human s" "stitched s" "gain" "what happened"
for t in $TRACKS; do
  if [ -f $OUT/$t.result ]; then
    awk -F '\t' '{printf "%-8s %10s %10s %7s  %s\n", $1, $2, $3, $4, $5}' $OUT/$t.result
  else
    printf '%-8s %10s %10s %7s  %s\n' $t - - - "not done (run again)"
  fi
done
