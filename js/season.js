/* Shared calculations for observed histories and the published seasonal grid. */
(function (root) {
  'use strict';
  const valid = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  function bounds(box) {
    if (!Array.isArray(box) || box.length !== 4 || !box.every(Number.isFinite)) return false;
    const [w, s, e, n] = box;
    return w >= -180 && e <= 180 && s >= -90 && n <= 90 && w < e && s < n;
  }
  function profile(series, start = 2012, end = 2025) {
    return Array.from({ length: 12 }, (_, month) => {
      const values = series.months.flatMap((ym, i) => Math.floor(ym / 100) >= start && Math.floor(ym / 100) <= end && ym % 100 === month + 1 && valid(series.harm[i]) ? [series.harm[i]] : []);
      return { month: month + 1, mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null, n: values.length };
    });
  }
  function peaks(months) {
    const total = months.reduce((a, m) => a + (m.mean || 0), 0);
    const top = months.filter((m) => valid(m.mean) && m.mean > 0).sort((a, b) => b.mean - a.mean || a.month - b.month).slice(0, 3);
    return { top, share: total ? top.reduce((a, m) => a + m.mean, 0) / total : null };
  }
  function compare(series, idx, start = 2012, end = 2025) {
    const ym = series.months[idx], value = series.harm[idx], year = Math.floor(ym / 100);
    const values = series.months.flatMap((m, i) => m % 100 === ym % 100 && Math.floor(m / 100) !== year && Math.floor(m / 100) >= start && Math.floor(m / 100) <= end && valid(series.harm[i]) ? [series.harm[i]] : []);
    const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    return { mean, n: values.length, pct: valid(value) && mean > 0 && values.length >= 3 ? (value / mean - 1) * 100 : null };
  }
  function regional(grid, box) {
    if (!bounds(box)) throw new Error('Enter west < east and south < north, within longitude ±180° and latitude ±90°.');
    const means = Array(12).fill(0); let cells = 0;
    for (let i = 0; i < grid.n; i++) {
      // Half-open bounds avoid counting a cell twice in adjacent regions.
      if (grid.lon[i] < box[0] || grid.lon[i] >= box[2] || grid.lat[i] < box[1] || grid.lat[i] >= box[3]) continue;
      cells++;
      for (let m = 0; m < 12; m++) means[m] += grid.v[i * 12 + m];
    }
    return { cells, months: means.map((mean, i) => ({ month: i + 1, mean: cells ? mean : null, n: 14 })) };
  }
  const api = { bounds, profile, peaks, compare, regional };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SEASON = api;
})(typeof window === 'undefined' ? globalThis : window);
