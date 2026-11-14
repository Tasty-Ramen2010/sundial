/* SUNDIAL data: loads the static JSON exported from the team's pipeline (see tools/export_static.py). */
(function () {
  const get = (p) => fetch(p).then((r) => { if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); });
  const D = { series: {}, ready: null };
  D.ready = Promise.all([get('data/meta.json'), get('data/countries.geojson'), get('data/scoreboard.json'), get('data/satellites.json'), get('data/climo.json'), get('data/diurnal.json')])
    .then(([meta, geo, sb, sat, climo, diur]) => {
      D.meta = meta; D.geo = geo; D.sat = sat; D.diurnal = diur;
      D.score = Object.fromEntries(sb.rows.map((r) => [r.country, r]));
      D.byId = Object.fromEntries(meta.countries.map((c) => [c.id, c]));
      D.features = Object.fromEntries(geo.features.map((f) => [f.properties.id, f]));
      D.fbox = {};   // bounding box per country, so hover tests can skip shapes that cannot contain the pointer
      for (const id in D.features) {
        let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
        const walk = (x) => { if (typeof x[0] === 'number') { if (x[0] < a) a = x[0]; if (x[0] > c) c = x[0]; if (x[1] < b) b = x[1]; if (x[1] > d) d = x[1]; } else x.forEach(walk); };
        walk(D.features[id].geometry.coordinates); D.fbox[id] = [a, b, c, d];
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
      D.climo = { n, x, y, z, lon, lat, v, p95: all[Math.floor(all.length * 0.95)] || 1, p50: all[Math.floor(all.length * 0.5)] || 1 };
      return D;
    });
  D.loadSeries = (id) => D.series[id] ? Promise.resolve(D.series[id]) : get('data/series/' + id + '.json').then((s) => (D.series[id] = s));
  window.DATA = D;
})();
