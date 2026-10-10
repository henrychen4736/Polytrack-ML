"""Development aid: draw a track from above with the route and the human lap.

    python ideas/g2-1-reference-free-inputs/plot_route.py desert4 [x0 x1 z0 z1]

Reads cache/plot_<track>.json (written by plot_dump.mjs) and writes
cache/plot_<track>.png. Grey = road surface (darker = higher), red = route
(dotted where it flies), blue = fastest human lap (dotted in the air), green
crosses = gates, numbers = seconds into the human lap / route point numbers.
"""
import json, sys, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

here = os.path.dirname(os.path.abspath(__file__))
track = sys.argv[1]
d = json.load(open(os.path.join(here, "cache", f"plot_{track}.json")))
fig, ax = plt.subplots(figsize=(16, 16))
n = d["nodes"]
ax.scatter([p[0] for p in n], [p[2] for p in n], c=[p[1] for p in n], cmap="Greys", s=2, vmin=min(p[1] for p in n) - 30, linewidths=0)

def draw(points, colour, label):
    for flag, style in ((1, "-"), (0, ":")):
        xs, zs = [], []
        for p in points:
            if p[3] == flag: xs.append(p[0]); zs.append(p[2])
            else: xs.append(None); zs.append(None)
        ax.plot(xs, zs, style, color=colour, lw=1.5, label=label if flag else None)

draw(d["human"], "tab:blue", "human")
if d["route"]:
    draw(d["route"], "tab:red", "route")
    for k in range(0, len(d["route"]), 100):
        ax.annotate(str(k), (d["route"][k][0], d["route"][k][2]), color="darkred", fontsize=7)
for p in d["human"]:
    if p[4] % 1000 < 30: ax.annotate(f"{p[4] / 1000:.0f}s", (p[0], p[2]), color="navy", fontsize=7)
for s, stage in enumerate(d["gates"]):
    for c in stage:
        ax.plot(c[0], c[2], "x", color="green", ms=10); ax.annotate(f"g{s}", (c[0], c[2]), color="green", fontsize=10)
ax.plot(d["start"][0], d["start"][2], "o", color="green")
if len(sys.argv) >= 6:
    ax.set_xlim(float(sys.argv[2]), float(sys.argv[3])); ax.set_ylim(float(sys.argv[4]), float(sys.argv[5]))
ax.set_aspect("equal"); ax.legend(); ax.set_title(f"{track}  route ok={d['ok']} {d.get('problem') or ''}")
out = os.path.join(here, "cache", f"plot_{track}.png")
fig.savefig(out, dpi=70, bbox_inches="tight")
print(out)
