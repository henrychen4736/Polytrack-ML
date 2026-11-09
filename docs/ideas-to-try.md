# Ideas to try

Approaches proposed but not yet started. When one is started it moves into
`ideas/` (its own folder, README and tests) or `docs/model-history.md`, and a
line here says where it went. What has already been tried is in
[`idea-tree.md`](idea-tree.md); check it before adding an idea here, since
some ideas have been tried under another name.

Each entry says what the idea is, why it might help this project in
particular, what already exists to build on, a small first experiment that
would show whether it is worth more, and what could make it fail.

Last updated 8 November 2026.

## New ideas (8 November 2026)

### N1. A learned world model to make training data

**Idea.** Train a model that predicts the next car state from the current
state and keys, then train policies partly on imagined driving from that
model (as Dreamer and MBPO do). Henry's note named Gaussian splatting; see
the caveat below.

**Why it might help.** PPO is limited by the simulators, not the GPU. A
learned model runs on the GPU in large batches and could give many more
practice decisions per second, and lets a planner look ahead without saving
and restoring simulator states.

**Gaussian splatting.** Splatting reconstructs a 3D scene so it can be
rendered from new viewpoints. Our policies read numbers (car state, road
edges, rays), not pictures, and the simulator already holds the exact track
geometry, so splatting would only matter if a policy were trained on screen
images (for example to drive the real client from pixels). For training data
on the current inputs, a dynamics model is the relevant kind of world model.

**What exists.** IQN's replay buffer is millions of recorded transitions;
`sim/` gives exact ground truth to measure the model against; save states
allow checking a prediction from any point.

**First experiment.** Fit a dynamics model on recorded desert4 transitions.
Measure how far its predicted position drifts from the simulator's after
0.1, 0.5 and 2 s of the same keys, on laps it did not train on. Worth going
further only if 0.5 s predictions stay within about a car width.

**Risks.** Lap time depends on single-millisecond key timing and on
collisions; a learned model will be least accurate exactly there, and a
policy trained on it may exploit its errors. The real simulator is already
cheap (about 6 million ticks per car), which narrows the gain.

### N2. A JEPA-style model as the decision maker

**Idea.** JEPA (joint embedding predictive architecture, LeCun's proposal,
used for planning in V-JEPA 2). Learn an encoder of the car and the road ahead,
plus a predictor of the next embedding given the keys; decide by searching
over key sequences in that embedding space for the one that reaches the most
progress.

**Why it might help.** Predicting in an embedding rather than the full state
may ignore detail that does not matter for driving, and planning would
replace the trial-and-error of PPO with explicit look-ahead. It also gives
the generalist a representation that might transfer to unseen tracks better
than the current inputs, which so far go unused in parts (the rays).

**What exists.** The 334-number route inputs (no human lap), recorded
transitions from IQN and PPO, g2-4's look-ahead driver as a comparison.

**First experiment.** Train the encoder and predictor on transitions from
the 14 training tracks. Use the embedding as IQN's input on desert4 and
compare decisions to reach 22.0 s against the raw inputs (IQN reached it in
about 6M decisions). Planning in the embedding comes after, if the
embedding helps.

**Risks.** Embeddings learned without the reward can drop what matters
(the exact moment to release a key). Planning in a learned space carries the
same exploitation risk as N1.

### N3. Optimise the whole pipeline, not one stage

**Idea.** Treat "new track in, fast verified lap out" as one system: route
from geometry (g2-1), explore from save states (g2-3), adapt the generalist,
search from the adapted lap (g1-1). Measure each stage's time and gain, and
tune the budget split and settings across stages together instead of each
alone.

**Why it might help.** Each stage was tuned on its own. Search gains 46 to
72 ms from a model lap, and practice turns 1 of 10 into 10 of 10, but nobody
has measured whether ten more minutes are better spent on practice or on
search, or which stage is the bottleneck on an unseen track.

**What exists.** All four stages run from scripts; `scripts/queue_*.sh` shows
how to chain them; the held-out tracks and 10 unseen generated tracks to
measure on.

**First experiment.** Run the full chain on desert3, summer3 and winter4 with
the stage time recorded, at two budget splits (more practice, more search).
Score: best verified lap and time to first finish, per hour of machine time.

**Risks.** Each run costs hours, so few settings can be compared; seeds
vary, so differences need several runs per setting.

### N4. Document the study process, and measure more than lap time

**Idea.** Two parts.

1. A study log: one short entry per experiment with the question, the
   setup, the result as measured, and the decision taken. `model-history.md`
   records models and `ideas/README.md` records ideas, but the reasoning
   between them (why one thing was tried next) lives only in commit messages
   and chat sessions.
2. A scoreboard of metrics beyond the fastest lap, tracked for every model.

**Metrics worth tracking.**

| Metric | Why it matters | Measured now? |
| --- | --- | --- |
| Fastest verified lap | Goal 1 | Yes |
| Finishes out of 10 attempts per track | Reliability, goal 2 | Yes |
| Spread of lap times across attempts | A fast lap that comes once in ten is less useful than a steady one | Partly (in raw test output) |
| Time and simulated laps to a first finish on an unseen track | How quickly a generalist adapts, goal 2 | Partly (g2-3) |
| Decisions or hours of training to reach a lap time | Sample efficiency; compares PPO, IQN, N1, N2 fairly | No |
| Wall contact per decision | Clean driving, Henry's rule | Yes (contact %) |
| Key changes per second on straights; air-brake use | Driving like a person (W and S held, A and D tapped) | Partly |
| Lap time against seed and small start changes | Robustness | No |

**First experiment.** Fill the scoreboard for the models still in use
(`ppo_blkgen.best2`, set 2, IQN desert4 and winter2, IQN route,
`ppo_g2-2-route-gen`) from existing test output, and add the missing
columns to the ten-attempt test scripts.

### N5. Run the simulation faster

**What is measured.** In the overnight IQN run of 8 November, each
simulator process spent about 2.1 ms per 50 ms decision in the physics
step (about 43 µs per 1 ms tick, wasm plus the bundle's JS around it) and
about 1.0 ms running the network in JavaScript (`greedy()` in
`ideas/g1-6-offpolicy-rl/iqn_server.mjs`). 12 processes on 16 logical
cores gave 2,100 to 2,500 decisions a second, against about 3,800 if each
process ran flat out, so the processes also contend for cores. In that run
the GPU learner was busy 64 to 85% of the time, so a faster simulator
alone only pays with less `--reuse`. For PPO the simulators are the limit.
One message per block decision (17 October) gave only 1.2 to 1.3 times, so
message traffic is not the main cost. The physics wasm
(`vendor/polyrl/node/vendor/polytrack_physics.wasm`) is 396 KB.

Five ideas, cheapest first. Any change to the physics itself needs a check
that recorded laps still Verify on the same tick.

1. **Profile one simulator before changing anything.** `node --cpu-prof`
   on one server for 30 s, and on a bare loop of physics steps. Split the
   time into wasm (Bullet), the bundle's JS per tick (building and posting
   the car state every tick, though a block needs only the last), and the
   message hops. Removing the per-tick state copies inside a block could
   give 1.1 to 1.5 times. No risk to Verify. Do this first: it says where
   ideas 2 to 5 should aim.
2. **Take the network out of the simulator processes.** About a third of
   each decision is the forward pass in JS. Batch it for all simulators on
   the GPU, as PPO does, or use a typed-array/SIMD kernel. Up to about 1.45
   times per process, more when processes contend for cores. No risk to
   Verify. First: time `greedy()` alone on a recorded input, 10,000 calls.
3. **Fit processes to cores, and Node flags.** Sweep 6, 8, 10, 12 and 14
   simulators for 30 s each, with and without `--no-liftoff` (compile the
   wasm with the optimising tier from the start), and leave cores for the
   learner. 1.1 to 1.3 times. No risk.
4. **Rebuild the physics as native code.** Translate the wasm to C with
   `wasm2c` (or optimise it with `wasm-opt -O3`), compile with full
   optimisation but no fast-maths so floating point stays exact, and load
   it in Node as an addon or a standalone stepping process. Native code is
   typically 1.5 to 3 times faster than the same wasm in V8. The risk is
   exactness: the game's maths module and the order of float operations
   must stay identical. First: `wasm-opt -O3`, then check that all 27
   recordings verify on the same ticks and time 1M ticks.
5. **A learned simulator for most of the training (see N1).** A dynamics
   model on the GPU can step thousands of cars at once, 10 to 100 times
   the throughput, but its error grows with each step and laps here are
   decided to the millisecond. Use it for exploration and early training,
   then finish on the real simulator, and Verify every lap that counts. The
   largest gain and the largest risk; after 1 to 3.

Also: save-state restores copy the whole physics memory (up to 24 MB, a
few ms each), which matters for searches and part-way starts. Rewriting
only the pages changed since the save would cut that, with byte-identical
results. Not worth it: several cars in one Bullet world (changes collision
order and breaks Verify), threads in one process (measured not to scale).

## Next steps from the 18 October results

Moved here on 8 November 2026 from the "What is next" lists in `README.md`
and `CLAUDE.md`, which now link to this file. In order of priority.

1. ~~**Combine the two things that work.**~~ Tried 8 November
   (`g1-6-iqn-routegen`, `docs/model-history.md` item 27): one night, worse
   than the PPO route generalists, 0 of 90 held out. Left from it: weight
   the official tracks more than the 40 generated ones, or continue from
   copy s2, the best on official tracks; then g2-3-style explore and adapt.
2. **A community track.** Henry to add one to the repository by hand; the
   no-network rule forbids fetching one.
3. **desert4 by a model alone.** IQN is 42 ms short (21.792 s against
   21.750 s). The search gains 46 to 72 ms from IQN laps, so a model whose
   own lap is about 20 ms better would do it.
4. **The route generalist.** Fix the summer4 and desert5 routes, and teach
   the route to take banked walls (desert2, summer5).

## Smaller untried items in the idea folders

Written down in each idea's README as part of its results, and left there,
since they record what a test did not cover. Listed here so there is one
place to pick from.

| Idea | Source |
| --- | --- |
| IQN with its own best lap as the ruler (`--ref-file`) | `ideas/g1-6-offpolicy-rl/README.md` |
| The stitched lap as a specialist's reference (`refFile`) | `ideas/g1-2-stitch-human-laps/README.md` |
| Model-guided mutations in the g2-3 explorer | `ideas/g2-3-explore-and-adapt/README.md` |
| g2-4's finished laps used as training examples | `ideas/README.md`, g2-4 |
| A repair step so g1-5 fine timing works before the last 4 to 8 s | `ideas/README.md`, g1-5 |
| A ranking measure that predicts finish time, for beam search | `ideas/README.md`, g1-4 |
| Generated tracks imported into the real game's editor | `ideas/g2-2-track-generator/README.md` |
