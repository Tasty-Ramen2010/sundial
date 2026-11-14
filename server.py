"""Serve Sundial and query real regional records. Python standard library only.

Run: python3 server.py --port 8000 [--history /path/to/regional-history.csv]
The optional CSV contains precomputed harmonized cell-month observations; see README.md.
"""
import argparse
import csv
import json
import math
import sqlite3
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

ROOT = Path(__file__).resolve().parent


def parse_bbox(value):
    try:
        box = [float(v) for v in value.split(",")]
    except (ValueError, AttributeError):
        raise ValueError("bbox must contain west,south,east,north") from None
    if len(box) != 4 or not all(math.isfinite(v) for v in box):
        raise ValueError("bbox must contain four finite coordinates")
    w, s, e, n = box
    if not (-180 <= w < e <= 180 and -90 <= s < n <= 90):
        raise ValueError("Require -180 <= west < east <= 180 and -90 <= south < north <= 90")
    return box


def month_number(value):
    value = str(value).replace("-", "")
    if len(value) != 6 or not value.isdigit():
        raise ValueError("month must be YYYYMM or YYYY-MM")
    ym = int(value)
    if not (1900 <= ym // 100 <= 2200 and 1 <= ym % 100 <= 12):
        raise ValueError("month is out of range")
    return ym


class RegionalStore:
    def __init__(self, history=None, manifest=None):
        self.db = sqlite3.connect(":memory:", check_same_thread=False)
        self.db.execute("CREATE TABLE observations (lat REAL, lon REAL, month INTEGER, value REAL, PRIMARY KEY (lat,lon,month))")
        self.months = []
        self.provenance = ""
        self.available = False
        self.manifest = manifest
        if history:
            self.load(Path(history))

    def load(self, path):
        manifest_path = Path(self.manifest) if self.manifest else path.with_suffix(".meta.json")
        if not manifest_path.exists():
            raise ValueError(f"Coverage manifest required: {manifest_path}")
        meta = json.loads(manifest_path.read_text())
        # Coverage is required: an absent sparse row is zero only inside a declared
        # observed month and spatial coverage. Never invent time-series from climatology.
        self.coverage = parse_bbox(",".join(map(str, meta["coverage_bbox"])))
        self.months = sorted(set(month_number(m) for m in meta["observed_months"]))
        self.provenance = str(meta["provenance"]).strip()
        if not self.months or not self.provenance or meta.get("missing_rows") != "zero_within_coverage":
            raise ValueError("Manifest needs observed_months, provenance and missing_rows=zero_within_coverage")
        known = set(self.months)
        with path.open(newline="") as stream:
            reader = csv.DictReader(stream)
            if not {"latitude", "longitude", "month", "harmonized_detections"}.issubset(reader.fieldnames or []):
                raise ValueError("CSV needs latitude,longitude,month,harmonized_detections")
            for line, row in enumerate(reader, 2):
                try:
                    lat, lon, value = float(row["latitude"]), float(row["longitude"]), float(row["harmonized_detections"])
                    ym = month_number(row["month"])
                    w, s, e, n = self.coverage
                    if not all(math.isfinite(v) for v in [lat, lon, value]) or value < 0 or not (s <= lat < n and w <= lon < e) or ym not in known:
                        raise ValueError("Observation outside declared coverage, negative, or non-finite")
                    self.db.execute("INSERT INTO observations VALUES (?,?,?,?)", (lat, lon, ym, value))
                except (ValueError, sqlite3.IntegrityError) as exc:
                    raise ValueError(f"Invalid or duplicate observation on CSV line {line}: {exc}") from exc
        self.db.execute("CREATE INDEX spatial ON observations (lon,lat,month)")
        self.db.commit()
        self.available = True

    def query(self, box):
        if not self.available:
            return {"history": None, "reason": "regional_observations_not_loaded"}
        w, s, e, n = box
        cw, cs, ce, cn = self.coverage
        if not (cw <= w and e <= ce and cs <= s and n <= cn):
            return {"history": None, "reason": "outside_historical_coverage"}
        sums = dict(self.db.execute("SELECT month,SUM(value) FROM observations WHERE lon>=? AND lon<? AND lat>=? AND lat<? GROUP BY month", (w, e, s, n)))
        return {"history": {"months": self.months, "harm": [round(sums.get(m, 0), 3) for m in self.months], "unit": "VIIRS-equivalent detections per month", "provenance": self.provenance, "coverage_bbox": self.coverage}}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, store, **kwargs):
        self.store = store
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_json(self, status, body, head=False):
        encoded = json.dumps(body, allow_nan=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        if not head:
            self.wfile.write(encoded)

    def route(self, head=False):
        path = urlsplit(self.path)
        if path.path == "/api/region":
            try:
                params = parse_qs(path.query)
                box = parse_bbox(params.get("bbox", [""])[0])
                self.send_json(200, {"bbox": box, **self.store.query(box)}, head)
            except ValueError as exc:
                self.send_json(400, {"error": str(exc)}, head)
        elif path.path.startswith("/api/"):
            self.send_json(404, {"error": "Unknown endpoint"}, head)
        elif any(part.startswith(".") for part in unquote(path.path).split("/") if part):
            self.send_error(404)
        else:
            if head:
                super().do_HEAD()
            else:
                super().do_GET()

    def do_GET(self):
        self.route()

    def do_HEAD(self):
        self.route(head=True)

    def list_directory(self, path):
        self.send_error(404)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--history", type=Path)
    parser.add_argument("--manifest", type=Path)
    args = parser.parse_args()
    history = args.history
    default = ROOT / "data" / "regional-history.csv"
    if history is None and default.exists():
        history = default
    try:
        store = RegionalStore(history, args.manifest)
    except (ValueError, KeyError, OSError, json.JSONDecodeError) as exc:
        parser.error(str(exc))
    httpd = ThreadingHTTPServer(("127.0.0.1", args.port), partial(Handler, store=store))
    print(f"Sundial: http://localhost:{args.port} · Regional history: {'loaded' if store.available else 'not loaded; seasonal explorer available'}", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        httpd.server_close()


if __name__ == "__main__":
    main()
