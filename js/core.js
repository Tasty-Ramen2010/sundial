/* SUNDIAL core: shared geography, the illustrative hotspot field, and the clock model.
   Everything here is synthetic and labelled as such in the UI. */
(function () {
  const world = window.__WORLD;
  const countries = topojson.feature(world, world.objects.countries);
  const land = topojson.feature(world, world.objects.land);
  const borders = topojson.mesh(world, world.objects.countries, (a, b) => a !== b);

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function gauss(r) {
    let u = 0, v = 0;
    while (u === 0) u = r();
    while (v === 0) v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /* Daily fire curve (schematic): peak near 15:00 local, weak before dawn. */
  function D(lt) {
    let d = Math.abs(lt - 15);
    if (d > 12) d = 24 - d;
    return 0.08 + 0.92 * Math.exp(-0.5 * (d / 3.8) * (d / 3.8));
  }
  /* Seasonal weight for month m (1..12, fractional ok), peaking at pk. */
  function seasonal(m, pk, sg) {
    let d = Math.abs(m - pk);
    if (d > 6) d = 12 - d;
    return Math.exp(-0.5 * (d / sg) * (d / sg));
  }

  /* Satellite local pass times. Terra drifts earlier, Aqua later, from about 2020. */
  function drift(y) {
    const t = (y - 2020.3) / 6.5;
    if (t <= 0) return 0;
    const s = Math.min(1, t);
    return s * s * (3 - 2 * s) * 0.45 + s * 0.55; // eased, ends at 1
  }
  const terraH = (y) => 10.5 - 1.0 * drift(y);
  const aquaH = (y) => 13.5 + 1.0 * drift(y);
  const VIIRS_H = 13.5;

  function fmtH(h) {
    const hh = Math.floor(h);
    const mm = Math.round((h - hh) * 60);
    const H = mm === 60 ? hh + 1 : hh;
    const M = mm === 60 ? 0 : mm;
    return String(H).padStart(2, '0') + ':' + String(M).padStart(2, '0');
  }

  /* Land mask (equirectangular raster) so we can drop points on land cheaply. */
  const MW = 1440, MH = 720;
  const mc = document.createElement('canvas');
  mc.width = MW; mc.height = MH;
  const mctx = mc.getContext('2d', { willReadFrequently: true });
  const mproj = d3.geoEquirectangular().scale(MW / (2 * Math.PI)).translate([MW / 2, MH / 2]);
  mctx.fillStyle = '#fff';
  mctx.beginPath();
  d3.geoPath(mproj, mctx)(land);
  mctx.fill();
  const maskData = mctx.getImageData(0, 0, MW, MH).data;
  function onLand(lon, lat) {
    const x = Math.floor(((lon + 180) / 360) * MW);
    const y = Math.floor(((90 - lat) / 180) * MH);
    if (x < 0 || x >= MW || y < 0 || y >= MH) return false;
    return maskData[(y * MW + x) * 4 + 3] > 128;
  }

  /* Fire regions: box, weight, peak month, season width. Hand-placed from where
     fire seasons are known to burn; this is an illustration, not a measurement. */
  const REGIONS = [
    { n: 'Sahel savanna', lon: [-14, 36], lat: [6, 13], w: 3.2, pk: 12.3, sg: 1.5 },
    { n: 'Southern Africa', lon: [12, 38], lat: [-17, -5], w: 3.4, pk: 8, sg: 1.5 },
    { n: 'Madagascar', lon: [44, 48.5], lat: [-22, -14], w: 0.6, pk: 10, sg: 1.2 },
    { n: 'Cerrado', lon: [-55, -45], lat: [-18, -6], w: 2.4, pk: 9, sg: 1.3 },
    { n: 'Amazon arc', lon: [-64, -50], lat: [-12, -4], w: 1.8, pk: 8.5, sg: 1.2 },
    { n: 'Chaco / Paraguay', lon: [-63, -56], lat: [-25, -19], w: 1.3, pk: 9, sg: 1.2 },
    { n: 'Argentina north', lon: [-66, -58], lat: [-34, -24], w: 1.5, pk: 9, sg: 1.5 },
    { n: 'Patagonia', lon: [-72, -68], lat: [-44, -39], w: 0.5, pk: 2, sg: 1.0 },
    { n: 'Northern Australia', lon: [124, 145], lat: [-19, -12], w: 2.2, pk: 9, sg: 1.7 },
    { n: 'Indonesia', lon: [101, 115], lat: [-4, 2], w: 1.2, pk: 9, sg: 1.1 },
    { n: 'Mainland SE Asia', lon: [97, 107], lat: [14, 22], w: 2.0, pk: 3.2, sg: 1.1 },
    { n: 'Punjab / Haryana', lon: [74, 77], lat: [29.5, 32], w: 1.3, pk: 10.4, sg: 0.7 },
    { n: 'Central India', lon: [78, 86], lat: [18, 24], w: 1.3, pk: 3.2, sg: 1.1 },
    { n: 'Kazakh steppe', lon: [60, 78], lat: [49, 54], w: 0.9, pk: 4.2, sg: 1.0 },
    { n: 'Siberia', lon: [100, 130], lat: [55, 62], w: 1.0, pk: 7, sg: 0.9 },
    { n: 'Canadian boreal', lon: [-122, -105], lat: [52, 58], w: 0.8, pk: 7, sg: 0.9 },
    { n: 'US West', lon: [-122, -118], lat: [34, 40], w: 0.5, pk: 8.5, sg: 1.0 },
    { n: 'Mexico', lon: [-105, -90], lat: [15, 22], w: 0.9, pk: 4.2, sg: 0.9 },
    { n: 'Ukraine', lon: [30, 38], lat: [47, 51], w: 0.5, pk: 8, sg: 0.9 },
    { n: 'Eastern China', lon: [112, 121], lat: [31, 37], w: 0.8, pk: 6, sg: 0.8 }
  ];

  const PTS = [];
  (function build() {
    const r = rng(20261113);
    const total = 5400;
    const wsum = REGIONS.reduce((a, g) => a + g.w, 0);
    REGIONS.forEach((g, gi) => {
      const n = Math.round((total * g.w) / wsum);
      let made = 0, guard = 0;
      while (made < n && guard < n * 40) {
        guard++;
        const lon = g.lon[0] + r() * (g.lon[1] - g.lon[0]);
        const lat = g.lat[0] + r() * (g.lat[1] - g.lat[0]);
        if (!onLand(lon, lat)) continue;
        // soft, patchy edges instead of a hard box
        const ex = (lon - (g.lon[0] + g.lon[1]) / 2) / ((g.lon[1] - g.lon[0]) / 2);
        const ey = (lat - (g.lat[0] + g.lat[1]) / 2) / ((g.lat[1] - g.lat[0]) / 2);
        if (r() > Math.exp(-1.3 * (ex * ex + ey * ey))) continue;
        const lam = (lon * Math.PI) / 180, phi = (lat * Math.PI) / 180;
        PTS.push({
          lon, lat, gi, pk: g.pk, sg: g.sg,
          u: r(), i: 0.25 + 0.75 * r() * r() + 0.1 * r(),
          x: Math.cos(phi) * Math.cos(lam), y: Math.cos(phi) * Math.sin(lam), z: Math.sin(phi)
        });
        made++;
      }
    });
  })();

  window.SUN = { d3, countries, land, borders, rng, hashStr, gauss, D, seasonal, terraH, aquaH, VIIRS_H, fmtH, REGIONS, PTS, onLand };
})();
