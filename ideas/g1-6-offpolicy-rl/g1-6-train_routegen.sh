#!/bin/sh
# g1-6-train_routegen.sh: train IQN as a generalist with no human lap in its
# inputs (route mode, g2-1) on 13 official tracks plus the 40 generated
# tracks of g2-2-set1, in stretches until a deadline, then test the copies.
#
# Why: "next step 1" of docs/ideas-to-try.md. IQN learns per decision far
# faster than PPO (desert4 21.792 s, winter2 26.997 s from nothing), and the
# PPO route generalist (ppo_g2-2-route-gen) drives 71 of 100 unseen generated
# tracks but 0 of 30 held-out official ones.
#
# How:
#   - starts from nothing (exploration falling from all-random over the
#     first 2M decisions); after that every stretch resumes $NAME.pt, so a
#     shutdown loses at most a minute or so (checkpoint every 50 rounds).
#     Warm-starting from g1-6-iqn-route2_desert4.pt was tried in a smoke
#     test on 8 November: with the lap fraction hidden (--no-lap-fraction)
#     and a full learning rate it stalled on every track, desert4 included,
#     where it had driven 21.986 s (the same lesson as ppo_rays: changed
#     inputs plus a full rate damage a trained network). FROM=<checkpoint>
#     still warm-starts if wanted.
#   - each stretch is --stop-hours long (default 2.1 h, shorter if the
#     deadline is closer), learning rate fading to 0 inside it; the copy at
#     the end of stretch k is kept as $NAME.s<k>.pt / .s<k>.actor.bin.
#   - stops starting stretches at STOP_AT (local time, HH:MM) and then runs
#     g1-6-eval_routegen.py on every kept copy.
#   - summer4 is left out of practice (its route is wrong), as in the PPO run.
#   - 12 simulators and --reuse 16 (not 32): with 53 tracks fresh driving is
#     worth more than re-reading old decisions; the desert4 runs were 96% GPU
#     at reuse 32 with 6 simulators.
#
# Run from the project root:
#   STOP_AT=08:15 sh ideas/g1-6-offpolicy-rl/g1-6-train_routegen.sh
# Restartable: run it again and it carries on from the last stretch.
# Stop it: kill the processes whose command line contains train_iqn.py
# (then the shell script), and check the node simulators have exited.
#
# Local use only: nothing here contacts any server.

PY=.venv/Scripts/python
CK=rl/checkpoints
NAME=${NAME:-g1-6-iqn-routegen}
FROM=${FROM:-}
SET=ideas/g2-2-track-generator/sets/g2-2-set1
OFFICIAL=desert1,desert2,desert4,desert5,summer1,summer2,summer5,summer6,summer7,winter1,winter2,winter3,winter5
STOP_AT=${STOP_AT:-08:15}
STRETCH_HOURS=${STRETCH_HOURS:-2.1}
ENVS=${ENVS:-12}
LOGS=runs/g1-6-routegen
mkdir -p $LOGS

if [ ! -f $CK/$NAME.pt ] && [ -n "$FROM" ]; then
  [ -f "$FROM" ] || { echo "no $FROM to start from"; exit 1; }
  cp "$FROM" $CK/$NAME.pt
  echo "copied $FROM to $CK/$NAME.pt"
fi

# Minutes until STOP_AT today (or tomorrow, if it has passed).
minutes_left() {
  now=$(date +%H:%M)
  n=$((10#${now%:*} * 60 + 10#${now#*:}))
  s=$((10#${STOP_AT%:*} * 60 + 10#${STOP_AT#*:}))
  echo $((s - n))
}

lr_for() { case $1 in 1) echo 2.5e-4;; 2) echo 1.5e-4;; *) echo 1e-4;; esac; }

failures=0
while :; do
  left=$(minutes_left)
  [ "$left" -lt 20 ] && break
  k=$(($(ls $LOGS/train_s*.log 2>/dev/null | wc -l) + 1))
  hours=$($PY -c "print(round(min($STRETCH_HOURS, $left / 60), 3))")
  log=$LOGS/train_s$k.log
  resume=--resume
  [ -f $CK/$NAME.pt ] || resume=""   # the very first stretch starts from nothing
  echo "$(date +%H:%M) stretch $k: $hours h, lr $(lr_for $k) (log $log)"
  $PY -u ideas/g1-6-offpolicy-rl/train_iqn.py --reference route --no-lap-fraction \
    --track "$OFFICIAL,$SET/train.txt" --eval-tracks "$OFFICIAL" --rotate-every 20 \
    --envs $ENVS --reuse 16 --buffer 3000000 --lr $(lr_for $k) --lr-end 0 \
    --stop-hours $hours --total-decisions 1000000000 --eval-every 50 --save-every 50 \
    --eps-decisions 2000000 $resume --checkpoint $CK/$NAME.pt --device cuda > $log 2>&1
  code=$?
  if [ $code -ne 0 ]; then
    failures=$((failures + 1))
    echo "$(date +%H:%M) stretch $k stopped with code $code (see $log); failure $failures"
    mv $log $LOGS/failed_s${k}_$failures.log
    [ $failures -ge 5 ] && { echo "five failures; giving up"; break; }
    sleep 30
    continue
  fi
  cp $CK/$NAME.pt $CK/$NAME.s$k.pt
  cp $CK/$NAME.actor.bin $CK/$NAME.s$k.actor.bin
  echo "$(date +%H:%M) stretch $k done; kept $CK/$NAME.s$k.pt"
done

echo "$(date +%H:%M) training over; testing the kept copies"
$PY -u ideas/g1-6-offpolicy-rl/g1-6-eval_routegen.py --copies "$CK/$NAME.s*.pt" --out $LOGS/eval.txt \
  > $LOGS/eval.log 2>&1
echo "$(date +%H:%M) done (exit $?); results in $LOGS/eval.txt"
