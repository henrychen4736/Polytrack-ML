#!/bin/sh
# Train a generalist on the ROUTE observation (334 numbers, no human lap in
# what it sees or in its reward; ROUTE MODE in rl/racing_env.mjs), the way the
# block generalist ppo_blkgen / ppo_blkgen2 was trained on the human one.
#
#   sh ideas/g2-1-reference-free-inputs/train_route_generalist.sh        (from the project root)
#
# Settings by environment variable (defaults in brackets):
#   STRETCHES  stretches to run in this call [4]
#   STEPS      block decisions per stretch [13000000: ppo_blkgen's stretch,
#              1.9 hours at the 1860 decisions/s its logs show with 16
#              simulators and nothing else running; slower while another
#              trainer shares the machine]
#   ENVS       simulator processes [16, as ppo_blkgen]
#   DEVICE     cuda or cpu for the learning step [cuda]
#   LAPS       human laps per track for the imitation start [1: lap 0 only]
#   CK, LOGS   folders for checkpoints and logs [rl/checkpoints, runs]; only
#              for trying the script out without touching the real files
#
# What it does. Each step is skipped when its output exists, so after a
# shutdown the same command carries on where it stopped.
#   1. Imitation examples and the imitation start (rl/pretrain_bc.py
#      --reference route): the first LAPS human laps of the 14 training tracks
#      are driven with their own keys; at every 50 ms block the route
#      observation is recorded with the block decision the keys amount to.
#      The network is trained to make the human's choice, as ppo_block.bc.pt
#      was (docs/model-history.md, item 9).
#        -> rl/checkpoints/g2-1-route_bc.npz (examples), g2-1-route_bc.pt,
#           runs/g2-1-route_bc.log
#      All 14 tracks are used here, summer4 and desert5 included: their routes
#      go another way than the humans (g2-1 README), and demo() stops
#      recording a lap where it is more than 110 units from the route
#      (lap 0: summer4 after 8.4 s, desert5 after 26.3 s of 29.0), so what
#      is kept is human driving on the route.
#      With LAPS=1 the imitation start matched the human's held-back choices
#      for steering 76%, W 97.5%, S 97.8% (a trial run; ppo_block.bc.pt: 83%,
#      98%, 98%); the held-back loss fell from 5.6 to 4.8 and was flat from
#      epoch 20.
#      LAPS=1 gives about 7,000 examples, a twentieth of the 156,000 that
#      ppo_block.bc.pt learnt from (10 laps, each against two references).
#      In route mode a lap looks the same against any reference, so LAPS=10
#      gives ten times as many distinct examples, about 4 minutes of driving
#      per track. Delete g2-1-route_bc.* to redo it with another LAPS.
#   2. PPO from that start, in stretches (rl/train_ppo.py --reference route):
#      the settings of the block specialists' script
#      (scripts/train_block_specialist.sh), which are those of the block
#      generalist as far as its logs and docs/model-history.md record them:
#      16 simulators on the training tracks, block decisions, no lap-fraction
#      input, part-way starts 50% (30% of them before a recent crash, 30%
#      with a steering kick), own-state restarts 50%, gamma 0.995 and GAE
#      lambda 0.9, the imitation term 0.05 fading to 0.02, learning rate
#      1.5e-4 fading to 0 within every stretch, rotating among the first 10
#      human laps for placing the car (ppo_blkgen's "rotating reference
#      laps"; in route mode they only decide where part-way starts put the
#      car), a copy kept every 200 updates. The full command line of
#      ppo_blkgen was never written down; the learning rate and the
#      imitation weights are the specialists', not certainly the generalist's.
#      The first stretch trains the critic alone for 100 updates (the
#      imitation start has an untrained critic).
#        -> rl/checkpoints/ppo_g2-1-route.pt (latest), .actor.bin,
#           .after_<steps>.pt at the end of every stretch,
#           .s<k>.u<update>.pt the copies kept during stretch k,
#           runs/rl_train_g2-1-route_s<k>.log
#      Tracks for practice: the 14 training tracks except summer4, whose
#      route is wrong (it runs along the top of a wall of blocks, joins the
#      road against its direction and turns round on the floor; the human is
#      530 units from it at worst): practising there would reward driving
#      that route. desert5 stays: its route turns round on the floor where
#      the humans take a loop, which a car can drive, but two of the three
#      fastest human laps are cut off there (a 2.5 s stall at 26.2 s), so
#      expect desert5 to be learnt differently from the human. The 3 extra
#      simulators go to the longest tracks (summer5, winter3, summer6).
#      A stretch cut short by a shutdown leaves its log and its last periodic
#      save (every 10 updates); the next call starts a NEW stretch from that
#      save, with a fresh learning-rate fade. Which copy to use is chosen by
#      the ten-attempt test, never assumed to be the last:
#        sh ideas/g2-1-reference-free-inputs/eval_route_generalist.sh rl/checkpoints/ppo_g2-1-route.after_<steps>.pt
#
# Stopping: kill only the process whose command line contains
# rl/train_ppo.py and ppo_g2-1-route, then check its node simulators have
# exited. Stopping this script alone leaves the trainer running.
#
# Local use only: drives the local simulator; no network.
PY=.venv/Scripts/python
CK=${CK:-rl/checkpoints}
LOGS=${LOGS:-runs}
NAME=ppo_g2-1-route
STRETCHES=${STRETCHES:-4}
STEPS=${STEPS:-13000000}
ENVS=${ENVS:-16}
DEVICE=${DEVICE:-cuda}
LAPS=${LAPS:-1}
BC_TRACKS=desert1,desert2,desert4,desert5,summer1,summer2,summer4,summer5,summer6,summer7,winter1,winter2,winter3,winter5
PPO_TRACKS=desert1,desert2,desert4,desert5,summer1,summer2,summer5,summer6,summer7,winter1,winter2,winter3,winter5,summer5,winter3,summer6
mkdir -p $LOGS $CK

# ---- 1. imitation start --------------------------------------------------------
if [ ! -f $CK/g2-1-route_bc.pt ]; then
  echo "making the imitation start (log: $LOGS/g2-1-route_bc.log)"
  $PY -u rl/pretrain_bc.py --reference route --block 5 --track $BC_TRACKS --laps $LAPS --workers 4 \
    --checkpoint $CK/g2-1-route_bc.pt --save-data $CK/g2-1-route_bc.npz > $LOGS/g2-1-route_bc.log 2>&1 \
    || { echo "imitation failed; see $LOGS/g2-1-route_bc.log"; exit 1; }
fi

# ---- 2. PPO in stretches ---------------------------------------------------------
[ -f $CK/$NAME.pt ] || cp $CK/g2-1-route_bc.pt $CK/$NAME.pt
steps_done() { $PY -c "import torch; print(torch.load('$CK/$NAME.pt', map_location='cpu', weights_only=True)['steps'])"; }
# Copies kept during stretch $1 (.u<update>.pt) get the stretch's number, so
# the next stretch's copies, numbered from its own start, do not overwrite them.
keep_copies() {
  for f in $CK/$NAME.u*.pt; do
    [ -f "$f" ] && mv "$f" "$CK/$NAME.s$1.${f#$CK/$NAME.}"
  done
}
for i in $(seq 1 $STRETCHES); do
  n=$(($(ls $LOGS/rl_train_g2-1-route_s*.log 2>/dev/null | wc -l) + 1))
  [ $n -gt 1 ] && keep_copies $((n - 1))   # left over from a stretch cut short
  # Critic alone for 100 updates while the network is still the imitation start.
  warmup=0
  [ "$(steps_done)" = "0" ] && warmup=100
  log=$LOGS/rl_train_g2-1-route_s$n.log
  echo "stretch $n: $STEPS decisions from $(steps_done) (log: $log)"
  $PY -u rl/train_ppo.py --reference route --track $PPO_TRACKS --envs $ENVS --block 5 --device $DEVICE \
    --no-lap-fraction --resume --checkpoint $CK/$NAME.pt \
    --random-start 0.5 --failure-start 0.3 --own-start 0.5 --kick 0.3 --ref-laps 10 \
    --gamma 0.995 --gae-lambda 0.9 --critic-warmup $warmup \
    --bc-data $CK/g2-1-route_bc.npz --bc-coef 0.05 --bc-coef-end 0.02 \
    --lr 1.5e-4 --lr-end 0 --keep-every 200 --total-steps $STEPS > $log 2>&1 \
    || { echo "stretch $n stopped with an error; see $log"; exit 1; }
  keep_copies $n
  s=$(steps_done)
  cp $CK/$NAME.pt $CK/$NAME.after_$s.pt
  echo "stretch $n done at $s decisions: $CK/$NAME.after_$s.pt"
done
