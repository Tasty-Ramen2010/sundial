const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const S = require('../js/season.js');

test('same-month comparison excludes selected year, missing values and years outside baseline', () => {
  const s = { months: [200101, 201201, 201301, 201401, 201501, 201601, 202501], harm: [999, 10, 20, 30, null, NaN, 40] };
  assert.deepEqual(S.compare(s, 6), { mean: 20, n: 3, pct: 100 });
  assert.equal(S.profile(s)[0].mean, 25);
  assert.equal(S.profile(s)[1].mean, null);
});

test('zero baseline, insufficient history, and missing selected values are not anomalies', () => {
  assert.equal(S.compare({ months: [201201, 201301, 201401, 202501], harm: [0, 0, 0, 20] }, 3).pct, null);
  assert.equal(S.compare({ months: [201201, 202501], harm: [10, 20] }, 1).pct, null);
  assert.equal(S.compare({ months: [201201, 201301, 201401, 202501], harm: [10, 20, 30, null] }, 3).pct, null);
});

test('peaks preserve separate seasonal maxima and handle no positive detections', () => {
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, mean: [1, 10, 1, 1, 1, 1, 1, 1, 9, 8, 1, 1][i] }));
  assert.deepEqual(S.peaks(months).top.map((m) => m.month), [2, 9, 10]);
  assert.equal(S.peaks(months.map((m) => ({ ...m, mean: 0 }))).share, null);
});

test('regional aggregation uses half-open cell-center bounds; no cells is unavailable', () => {
  const g = { n: 3, lon: [0.25, 0.75, 1.25], lat: [0.25, 0.75, 1.25], v: Array(36).fill(4) };
  assert.equal(S.regional(g, [0, 0, 0.75, 0.75]).cells, 1);
  assert.equal(S.regional(g, [0, 0, 1, 1]).months[0].mean, 8);
  assert.equal(S.regional(g, [2, 2, 3, 3]).months[0].mean, null);
  for (const box of [[5, 0, 1, 1], [0, 0, 1, 91], [NaN, 0, 1, 1], [0, 0, 1]]) assert.equal(S.bounds(box), false);
});

test('all shipped country summaries are finite and render without inventing missing baselines', () => {
  const base = path.join(__dirname, '..');
  const meta = JSON.parse(fs.readFileSync(path.join(base, 'data/meta.json')));
  const score = JSON.parse(fs.readFileSync(path.join(base, 'data/scoreboard.json')));
  const window = { SEASON: S, DATA: { score: Object.fromEntries(score.rows.map((r) => [r.country, r])) } };
  vm.runInNewContext(fs.readFileSync(path.join(base, 'js/regions.js'), 'utf8'), { window });
  for (const c of meta.countries) {
    const series = JSON.parse(fs.readFileSync(path.join(base, 'data/series', c.id + '.json')));
    for (const idx of [0, series.months.length - 1]) {
      const html = window.REGIONS.countrySummary(series, c, idx);
      assert.doesNotMatch(html, /NaN|Infinity|undefined/, c.id);
      assert.match(html, /Country summary/);
    }
  }
});
