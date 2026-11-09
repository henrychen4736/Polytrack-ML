# Idea tree

Every approach tried in this project, joined to the one it was built on.
GitHub draws the diagram below from the text in this file, so to update it,
edit the text: add a node line, a `parent --> child` line, and a `class` line
for its status. Full details of each model are in
[`model-history.md`](model-history.md); the side ideas are in
[`../ideas/README.md`](../ideas/README.md).

Last updated 8 November 2026. Lap times are against the best human lap;
generalist scores are finishes out of 170 test attempts (10 per track, 17
tracks).

## Key

- **Blue**: in use, or the best of its kind.
- **Grey**: fed the next step.
- **White, dashed**: dropped, or no gain.
- **Gold**: a lap faster than the best human.

```mermaid
flowchart LR
  root["Headless sim, Verify, human laps<br/>4 Oct"]

  %% Search on laps
  pursuit["Pure pursuit + settings search<br/>summer1 23.319 s"]
  sect["Sectional key search<br/>keys re-timed from save states"]
  g11["g1-1 search on human laps<br/>4 tracks under the human"]
  g15["g1-5 fine key timing<br/>last 4 to 8 s only"]
  g14["g1-4 beam search<br/>desert4 21.880 s, no gain"]
  g12["g1-2 stitch human laps<br/>winter5 18.374 s, desert4 21.730 s"]
  g17["g1-7 computed racing line<br/>desert4 22.083 s; car model kept"]

  %% PPO, old scheme
  ppo1["ppo_summer1, one track<br/>0 of 9 on winter1"]
  gen["ppo_general, general2<br/>31 of 51; tapped W"]
  gen3["ppo_general3, held keys<br/>114 of 170"]
  follow["ppo_follow<br/>85 of 170; fast, unreliable"]
  rays["ppo_rays, 17 distance rays<br/>112 of 170, no gain"]
  spec["First specialists<br/>desert4 22.13 s; wobbly"]

  %% PPO, block decisions
  block["ppo_block.bc, block decisions<br/>imitation only"]
  blk1["Set 1 specialists<br/>desert4 22.27 s"]
  blkgen["ppo_blkgen, blkgen2<br/>139 of 170, 7 of 30 held out"]
  set2["Set 2 specialists<br/>desert4 21.981 s"]
  srt["Search-then-train rounds<br/>desert4 21.880 s; stalled"]
  cand["Train on near-best laps<br/>own lap 21.987 to 21.961 s"]
  set3["Set 3, three new rules<br/>no gain"]
  g23["g2-3 explore, then adapt<br/>8 to 10 of 10 held out"]
  g24["g2-4 lookahead driving<br/>16 of 16 held out, 9 to 39x sim time"]
  race["Race demo in the real client<br/>rolled back 6 Nov"]

  %% No human lap in the inputs
  route["g2-1 route from geometry<br/>17 of 17 tracks routed"]
  rgen["ppo_g2-1-route generalist<br/>90 of 170, 0 of 30 held out"]
  mem["g2-5 memory of attempts<br/>no effect"]
  rgen2["+ 40 generated tracks, g2-2<br/>71 of 100 unseen generated"]

  %% Off-policy learner
  iqn["g1-6 IQN, off-policy learner<br/>desert4 21.792 s"]
  iqnvar["IQN gamma 0.995; 10 ms timing<br/>no gain"]
  iqnw2["IQN on winter2<br/>26.997 s, best model there"]
  iqnr["IQN on route inputs<br/>desert4 21.846 s, no human lap"]
  iqns["g1-1 search on IQN's lap<br/>desert4 21.720 s, human 21.750 s"]
  iqngen["IQN route generalist, 8 Nov<br/>29% official, 0 of 90 held out"]

  root --> pursuit --> sect
  sect --> g11
  sect --> g15
  sect --> g14
  root --> g12
  root --> g17
  root --> ppo1 --> gen --> gen3
  gen3 --> follow
  gen3 --> rays --> spec
  gen3 --> block
  block --> blk1
  block --> blkgen
  blkgen --> set2
  set2 --> srt --> cand
  set2 --> set3
  blkgen --> g23
  blkgen --> g24
  blkgen --> race
  root --> route --> rgen
  rgen --> mem
  rgen --> rgen2
  root --> iqn
  iqn --> iqnvar
  iqn --> iqnw2
  iqn --> iqnr
  iqn --> iqns
  g11 -.-> iqns
  iqnr --> iqngen
  rgen2 -.-> iqngen

  classDef use fill:#dbeafe,stroke:#2563eb,stroke-width:2px,color:#111
  classDef fed fill:#eeeeee,stroke:#888,color:#111
  classDef drop fill:#fff,stroke:#aaa,stroke-dasharray:4 3,color:#666
  classDef beat fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#111

  class blkgen,set2,g23,rgen2,iqn,iqnw2,iqnr use
  class root,pursuit,sect,g15,gen3,block,cand,g24,route,rgen fed
  class g14,g17,ppo1,gen,follow,rays,spec,blk1,srt,set3,race,mem,iqnvar,iqngen drop
  class g11,g12,iqns beat
```

The dotted lines mark a second source: the better-than-human lap from IQN
used the g1-1 search on IQN's own lap, and the IQN route generalist trained
on g2-2's generated tracks.

## How to update it

1. Add a node: `id["Name<br/>best result"]` in its group.
2. Join it to what it was built on: `parent --> id`.
3. Add its id to one of the `class` lines at the bottom (`use`, `fed`,
   `drop` or `beat`), and move any node whose status changed.
4. Change the date at the top. Preview with GitHub's file view or any
   Mermaid previewer (for example the Markdown preview in VS Code).
