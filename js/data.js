/* SUNDIAL data: loads the static JSON exported from the team's pipeline (see tools/export_static.py). */
(function () {
  const get = (p) => fetch(p).then((r) => { if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); });
  const D = { series: {}, ready: null };
  D.ready = Promise.all([get('data/meta.json'), get('data/countries.geojson'), get('data/scoreboard.json'), get('data/satellites.json'), get('data/climo.json'), get('data/diurnal.json'), get('data/provenance.json').catch(() => ({}))])
    .then(([meta, geo, sb, sat, climo, diur, provenance]) => {
      D.meta = meta; D.geo = geo; D.sat = sat; D.diurnal = diur; D.provenance = provenance || {};
      D.byId = Object.fromEntries(meta.countries.map((c) => [c.id, c]));
      D.score = Object.fromEntries(sb.rows.filter((r) => D.byId[r.country]).map((r) => [r.country, r]));   // only countries that are on the globe
      D.features = Object.fromEntries(geo.features.map((f) => [f.properties.id, f]));
      D.fbox = {};   // bounding box per country, so hover tests can skip shapes that cannot contain the pointer
      for (const id in D.features) {
        let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
        const walk = (x) => { if (typeof x[0] === 'number') { if (x[0] < a) a = x[0]; if (x[0] > c) c = x[0]; if (x[1] < b) b = x[1]; if (x[1] > d) d = x[1]; } else x.forEach(walk); };
        walk(D.features[id].geometry.coordinates); D.fbox[id] = [a, b, c, d];
      }
      // lighter copies of the shapes for drawing the whole globe (the full-detail ones stay for hit-testing and the selected country)
      const TOL = 0.2, simpRing = (r) => { const o = [r[0]]; let l = r[0]; for (let i = 1; i < r.length - 1; i++) { if (Math.abs(r[i][0] - l[0]) + Math.abs(r[i][1] - l[1]) >= TOL) { o.push(r[i]); l = r[i]; } } o.push(r[r.length - 1]); return o.length >= 4 ? o : r; };
      D.lite = {};
      for (const id in D.features) {
        const g = D.features[id].geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
        const lp = polys.map((p) => p.map(simpRing)).filter((p) => p[0].length >= 4);
        D.lite[id] = { type: 'Feature', properties: D.features[id].properties, geometry: { type: 'MultiPolygon', coordinates: lp } };
      }
      // fire climatology -> typed arrays for the globe
      const cells = climo.cells, n = cells.length;
      const x = new Float32Array(n), y = new Float32Array(n), z = new Float32Array(n), lon = new Float32Array(n), lat = new Float32Array(n);
      const v = new Float32Array(n * 12), all = [];
      cells.forEach((c, i) => {
        const la = c[0] * Math.PI / 180, lo = c[1] * Math.PI / 180;
        x[i] = Math.cos(la) * Math.cos(lo); y[i] = Math.cos(la) * Math.sin(lo); z[i] = Math.sin(la);
        lat[i] = c[0]; lon[i] = c[1];
        for (let m = 0; m < 12; m++) { v[i * 12 + m] = c[2][m]; if (c[2][m] > 0) all.push(c[2][m]); }
      });
      all.sort((a, b) => a - b);
      D.climo = { n, x, y, z, lon, lat, v, years: climo.years, cell_deg: climo.cell_deg, p95: all[Math.floor(all.length * 0.95)] || 1, p50: all[Math.floor(all.length * 0.5)] || 1 };
      return D;
    });
  D.loadSeries = (id) => D.series[id] ? Promise.resolve(D.series[id]) : get('data/series/' + id + '.json').then((s) => (D.series[id] = s));
  window.DATA = D;
})();
