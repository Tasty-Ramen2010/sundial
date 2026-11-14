"""Export the SUNDIAL team's precomputed record to static JSON so the site runs on GitHub Pages (no server).

Run from the team repo (Nasa_Space_App_Test) with its venv active:
    python /path/to/sundial/tools/export_static.py /path/to/sundial/data
Everything written here is computed by the team's pipeline from NASA FIRMS; nothing is invented.
"""
import json, sys, shutil, math
from pathlib import Path
import numpy as np
import polars as pl

sys.path.insert(0, str(Path.cwd()))
from backend import main as B  # noqa: E402

out = Path(sys.argv[1]); (out / "series").mkdir(parents=True, exist_ok=True)

def clean(o):
    """JSON has no NaN/Infinity: turn them into null so browsers can parse the files."""
    if isinstance(o, float):
        return o if math.isfinite(o) else None
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    return o


def dump(path, obj):
    path.write_text(json.dumps(clean(obj), separators=(",", ":"), ensure_ascii=False))
    return path.stat().st_size

# countries: id, name, bbox, centroid from the geojson
gj = json.loads((B.DATA / "countries.geojson").read_text())
def centroid(feat):
    xs, ys, n = 0.0, 0.0, 0
    g = feat["geometry"]; polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    best = max(polys, key=lambda p: len(p[0]))
    for x, y in best[0]: xs += x; ys += y; n += 1
    return [round(xs / n, 2), round(ys / n, 2)]
cent = {}
for f in gj["features"]:
    pid = f["properties"].get("id") or f["properties"].get("name") or f["properties"].get("NAME")
    cent[pid] = centroid(f)
print("geojson props sample:", gj["features"][0]["properties"])

cal_all = json.loads((B.DATA / "calibration.json").read_text())
meta = {"first_month": B.META["first_month"], "last_month": B.META["last_month"], "countries": [],
        "excluded": len(cal_all.get("excluded", {})), "thresholds": cal_all.get("thresholds", {})}
SHOWN = [c for c in B.META["countries"] if c.get("bbox")]   # a country with no border cannot be drawn on the globe
print("skipped (no border):", [c["id"] for c in B.META["countries"] if not c.get("bbox")])
for c in SHOWN:
    cx = cent.get(c["id"]) or cent.get(c["name"]) or [(c["bbox"][0] + c["bbox"][2]) / 2, (c["bbox"][1] + c["bbox"][3]) / 2]
    q = (B.CAL.get(c["id"], {}) or {}).get("quality", {})
    meta["countries"].append({"id": c["id"], "name": c["name"], "bbox": c["bbox"], "centroid": cx,
                              "tier": q.get("tier"), "calib_n": q.get("calibration_detections")})
tot = dump(out / "meta.json", meta)

for c in SHOWN:
    s = B.series(f"country:{c['id']}")
    tot += dump(out / "series" / f"{c['id']}.json", s)

tot += dump(out / "diurnal.json", B.DIURNAL)
tot += dump(out / "satellites.json", B.satellites())
tot += dump(out / "scoreboard.json", B.scoreboard())
shutil.copy(B.DATA / "countries.geojson", out / "countries.geojson")

# Real fire climatology for the globe: mean harmonized detections per 0.5 degree cell for each calendar
# month over 2012-2025 (the VIIRS era, where the record is on one footing), summed over what we have.
g = B.GLOBE.filter((pl.col("ym") >= 201201) & (pl.col("ym") <= 202512)).with_columns((pl.col("ym") % 100).alias("mo"))
nyears = 14
cl = g.group_by("gy", "gx", "mo").agg((pl.col("harm").sum() / nyears).alias("v"))
cells = {}
for gy, gx, mo, v in cl.iter_rows():
    cells.setdefault((gy, gx), [0] * 12)[mo - 1] = int(round(float(v)))
rows = [[round((gy + 0.5) * 0.5, 2), round((gx + 0.5) * 0.5, 2), vals] for (gy, gx), vals in cells.items() if max(vals) >= 4]
rows.sort(key=lambda r: -max(r[2]))
tot += dump(out / "climo.json", {"cell_deg": 0.5, "years": "2012-2025", "unit": "harmonized detections per month (mean)", "cells": rows})
print("cells kept:", len(rows), "| total bytes written:", tot // 1024, "KB")
