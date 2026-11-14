/* SUNDIAL sky: the page background is the sky over the place you are looking at, at that place's local solar time,
   tinted by smoke when that place is burning. Same idea as Apple Weather's time-and-conditions gradients. */
(function () {
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix = (A, B, t) => A.map((v, i) => Math.round(lerp(v, B[i], t)));
  const css = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

  /* Sun altitude in degrees for a latitude, month (1..12, fractional) and local solar hour. */
  function sunAlt(latDeg, month, hour) {
    const doy = (month - 1) * 30.4 + 15;
    const dec = (23.44 * Math.PI / 180) * Math.sin((2 * Math.PI / 365) * (doy - 80));
    const phi = latDeg * Math.PI / 180;
    const H = (hour - 12) * 15 * Math.PI / 180;
    return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)) * 180 / Math.PI;
  }

  /* Key skies by sun altitude (top colour, middle, horizon glow). Night -> civil twilight -> golden -> day. */
  const KEYS = [
    { a: -18, top: '#050816', mid: '#0b1233', bot: '#18214a' },
    { a: -8,  top: '#0d1540', mid: '#2a2a6b', bot: '#8a4a7a' },
    { a: -1,  top: '#26357d', mid: '#8a5a8f', bot: '#f08a4b' },
    { a: 6,   top: '#3f6fc2', mid: '#8fa9d6', bot: '#f4b27a' },
    { a: 20,  top: '#2c78d4', mid: '#5aa0e6', bot: '#a9d3f5' },
    { a: 60,  top: '#1b66c9', mid: '#3f8fe0', bot: '#8cc4f0' }
  ].map((k) => ({ a: k.a, top: hex(k.top), mid: hex(k.mid), bot: hex(k.bot) }));

  const SMOKE = { top: hex('#4a2a14'), mid: hex('#9a5a2a'), bot: hex('#e08a3a') };

  /* smoke 0..1: how much the place is burning right now. Returns three CSS colours plus a night flag. */
  function sky(latDeg, month, hour, smoke) {
    const alt = sunAlt(latDeg, month, hour);
    let i = 0;
    while (i < KEYS.length - 2 && alt > KEYS[i + 1].a) i++;
    const A = KEYS[i], B = KEYS[i + 1];
    const t = clamp((alt - A.a) / (B.a - A.a), 0, 1);
    let top = mix(A.top, B.top, t), mid = mix(A.mid, B.mid, t), bot = mix(A.bot, B.bot, t);
    const s = clamp(smoke || 0, 0, 1) * 0.62 * (alt < -10 ? 0.45 : 1); // smoke is hard to see at night
    top = mix(top, mix(top, SMOKE.top, 0.9), s);
    mid = mix(mid, SMOKE.mid, s);
    bot = mix(bot, SMOKE.bot, s);
    return { top, mid, bot, alt, night: alt < -6, dusk: alt >= -6 && alt < 8 };
  }

  const gradient = (c) => `linear-gradient(180deg, ${css(c.top)} 0%, ${css(c.mid)} 52%, ${css(c.bot)} 100%)`;

  window.SKY = { sky, sunAlt, gradient, mix, hex, css };
})();
