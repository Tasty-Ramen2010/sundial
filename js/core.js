/* SUNDIAL core: shared geography, the clock model and small helpers. No data lives here. */
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

  window.SUN = { d3, countries, land, borders, rng, hashStr, gauss, D, seasonal, terraH, aquaH, VIIRS_H, fmtH };
})();
