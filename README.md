# SUNDIAL

NASA FIRMS fire records and a regional fire-season explorer. No dependencies are
required to run the website or local regional backend.

```sh
python3 server.py --port 8000
```

Open http://localhost:8000 and use **Explore the burning calendar**, the country
search, or **Try Angola**. Search opens the calendar directly; its shortcuts lead
to **Fire season**, the regional picker and sources. You can also select a country
on the globe. Draw a rectangle in **Explore a local fire season**, or enter west,
south, east and north coordinates. The selected box is preserved in copied links.

## What works with the checked-in data

- Country peak months, same-month comparison and calibration basis appear first.
  The seasonal baseline is 2012–2025. The comparison excludes the selected year
  and requires three other observed years; missing data is never treated as zero.
- Any rectangular area has a regional seasonal profile from the published
  NASA FIRMS-derived 2012–2025 spatial climatology. The grid is 0.5° (about 56 km
  north–south), uses cell-center inclusion, and omits cells whose peak monthly
  average is below four detections. Regional seasonal totals are approximate.
- Country observations and regional estimates are explicitly separate. Country
  calibration accuracy does not establish regional confidence.
- The website still works as a static GitHub Pages site, including regional
  seasonal selection. Regional historical API calls require the local backend.

## Loading regional monthly observations

The existing spatial file contains twelve seasonal means, **not** per-year
observations. It cannot produce regional anomalies or historical calendars.
`server.py` provides a read-only `/api/region?bbox=west,south,east,north` endpoint
for actual precomputed harmonized observations. The regional historical calendar,
same-month departures and CSV download appear automatically when these are loaded.

```sh
python3 server.py --history /path/to/regional-history.csv --port 8000
```

The CSV must contain one already aggregated row per grid-cell center and month:

```text
latitude,longitude,month,harmonized_detections
```

The companion file `regional-history.meta.json` must declare the data coverage:

```json
{
  "coverage_bbox": [-180, -90, 180, 90],
  "observed_months": [201201, 201202],
  "provenance": "Replace with the actual product, processing version and calibration method",
  "missing_rows": "zero_within_coverage"
}
```

This is a schema example, not supplied observations. Declare only months and
spatial coverage actually observed. A missing sparse row means zero only inside
that declared coverage; missing months are omitted from the calendar. Restrict
`coverage_bbox` to a fully covered rectangle if the input is regional. Inputs with
duplicate cells, invalid coordinates, negative counts, or undeclared months fail
at startup. Coordinates at east/north edges are excluded to avoid double counting
adjacent boxes. Antimeridian-crossing areas need two separate boxes.

The team pipeline export in `tools/export_static.py` now also writes this pair
from the real monthly spatial grid. Set `SUNDIAL_REGIONAL_MANIFEST` to the path of
a coverage manifest in the format above when exporting. No historical data is
synthesized or scaled from country totals.
The manifest is mandatory because an absent detection alone cannot establish
whether an area was observed.

## Sources and provenance

The sources panel is available on the home page and inside each country view.
Coverage labels come from `data/meta.json`; the globe period comes from the
climatology metadata. The selected-month source comes from the exported record.

`data/provenance.json` records product versions, the uncertainty method, the
upstream analysis repository/revision, and the export timestamp. Missing fields
remain `null` and are shown explicitly as unrecorded. Fill these only from the
actual analysis; the website does not infer them from current NASA documentation.
When exporting, set `SUNDIAL_PROVENANCE_FILE` to a JSON file with these fields
(`product_versions` and `uncertainty_method` are text). The exporter records a
new UTC export timestamp. This timestamp is separate from observation coverage.

A short description of the recent additions is in [CHANGES.txt](CHANGES.txt).

## Checks

```sh
node --test tests/*.test.cjs
python3 -m unittest discover -s tests -p 'test_*.py'
```
