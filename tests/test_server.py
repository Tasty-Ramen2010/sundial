"""Synthetic fixtures exercise aggregation; they are never served as NASA data."""
import csv
import json
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import RegionalStore, parse_bbox


class RegionalTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "history.csv"
        self.meta = {"coverage_bbox": [10, -10, 20, 0], "observed_months": [201201, 201202, 201401], "provenance": "Synthetic test only", "missing_rows": "zero_within_coverage"}
        self.rows = [[-9.75, 10.25, 201201, 10], [-9.75, 10.75, 201201, 20], [-9.75, 10.25, 201401, 40]]

    def write(self):
        self.path.with_suffix('.meta.json').write_text(json.dumps(self.meta))
        with self.path.open('w', newline='') as stream:
            writer = csv.writer(stream)
            writer.writerow(['latitude', 'longitude', 'month', 'harmonized_detections'])
            writer.writerows(self.rows)

    def test_sparse_zero_only_within_declared_coverage_and_months(self):
        self.write()
        store = RegionalStore(self.path)
        self.addCleanup(store.db.close)
        data = store.query([10, -10, 11, -9])['history']
        self.assertEqual(data['months'], [201201, 201202, 201401])
        self.assertEqual(data['harm'], [30, 0, 40])
        self.assertIsNone(store.query([0, -10, 11, -9])['history'])
        self.assertEqual(store.query([10, -10, 10.75, -9])['history']['harm'], [10, 0, 40])

    def test_no_history_is_explicitly_unavailable(self):
        store = RegionalStore()
        self.addCleanup(store.db.close)
        self.assertIsNone(store.query([10, -10, 11, -9])['history'])

    def test_invalid_and_duplicate_observations_rejected(self):
        for bad in [[-9.75, 10.25, 201201, 10], [-9, 11, 201301, 1], [-9, 11, 201201, -1], [-9, 11, 201201, float('nan')], [10, 11, 201201, 1]]:
            with self.subTest(bad=bad):
                self.rows = [[-9.75, 10.25, 201201, 10], bad]
                self.write()
                with self.assertRaises(ValueError):
                    RegionalStore(self.path)

    def test_requires_coverage_manifest(self):
        self.write()
        self.path.with_suffix('.meta.json').unlink()
        with self.assertRaises(ValueError):
            RegionalStore(self.path)

    def test_bbox_validation(self):
        self.assertEqual(parse_bbox('10,-10,20,0'), [10, -10, 20, 0])
        for value in ['', '1,2,3', 'nan,0,1,1', '10,0,1,1', '0,0,1,91', '-181,0,1,1']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                parse_bbox(value)


if __name__ == '__main__':
    unittest.main()
