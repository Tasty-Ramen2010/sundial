# tools

- `export_static.py`: turns the team's precomputed record into static JSON in `data/`, so the site runs on GitHub Pages with no server.
  Run from the team repo with its venv active: `python /path/to/sundial/tools/export_static.py /path/to/sundial/data`
- `pipeline_fixes.patch`: two bugs found when running the pipeline on 65 countries (apply in the team repo with `patch -p1 < pipeline_fixes.patch`):
  1. `clean.py`: polars guessed `scan`/`track`/`frp` as integers from the first 100 rows and crashed on the first `1.9` (small countries). Types are now forced to float.
  2. `boundaries.py`: FIRMS and Natural Earth spell some countries differently (Russian_Federation/Russia, Lao_PDR/Laos, Cote_d_Ivoire/Ivory Coast, Republic_of_Congo, Tanzania), so those had no border. Mapping added.
