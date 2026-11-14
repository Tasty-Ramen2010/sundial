/* SUNDIAL globe: one canvas that is the hero art, the thing you explore, and the map behind each country sheet. */
(function () {
  const S = window.SUN;
  const { land, borders, D: diurnal } = S;
  const $ = (s) => document.querySelector(s);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cv = $('#globe'), ctx = cv.getContext('2d');
  let W = 0, H = 0, DPR = 1, stars = [];
  const proj = d3.geoOrthographic().clipAngle(90).precision(0.6);
  const path = d3.geoPath(proj, ctx);
  const grat = d3.geoGraticule10();

  const T = { utc: 11, month: 9.2, playing: !reduce, utcTarget: null, monthTarget: null };
  const V = { lon: -45, lat: 8, R: 300, cx: 0, cy: 0, glass: 0, ring: 0.3, band: 0, ctry: 1, labels: 0 };
  let F = { layout: 'hero', lon: -45, lat: 8, auto: true, ring: 0.3 };
  let hover = null, selected = null, dragging = false, userUntil = 0, autoLon = -45, inited = false, running = false, last = performance.now(), fairTarget = 0, fairMix = 0;
  let flagTex = null, pickCb = null, hoverCb = null, bandInfo = () => ({ h: 13.5, c: '125,178,255', label: 'VIIRS' });

  const wrap = (a) => ((((a + 180) % 360) + 360) % 360) - 180;
  const angDiff = (a, b) => wrap(a - b);
  const hdiff = (a, b) => ((((a - b + 12) % 24) + 24) % 24) - 12;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const r = S.rng(77);
    stars = Array.from({ length: 170 }, () => ({ x: r() * W, y: r() * H, a: 0.1 + r() * 0.4, s: r() < 0.1 ? 1.5 : 0.8 }));
  }

  /* where on screen and how big, for each kind of scene */
  function layout(f) {
    const mobile = W < 860;
    if (f.layout === 'hero') return { R: Math.min(W * 0.36, H * 0.4), cx: W / 2, cy: mobile ? H * 0.36 : H * 0.47 };
    if (f.layout === 'explore') return { R: Math.min(W * 0.42, H * (mobile ? 0.28 : 0.4)), cx: W / 2, cy: mobile ? H * 0.38 : H * 0.46 };
    if (f.layout === 'sheet') {
      const spanDeg = Math.max(2, f.span || 20);
      const fit = Math.min(W * (mobile ? 0.9 : 0.5), H * 0.36);
      return { R: Math.min(9000, fit / (spanDeg * Math.PI / 180)), cx: mobile ? W / 2 : W * 0.5, cy: mobile ? H * 0.2 : H * 0.24 };
    }
    // story: globe sits to the right of the text column
    const R = Math.min(H * 0.4, W * 0.27) * (f.k || 1);
    return mobile ? { R: Math.min(W * 0.4, H * 0.27) * (f.k || 1), cx: W / 2, cy: H * 0.28 } : { R, cx: W * 0.7, cy: H * 0.5 };
  }

  function sunPos() {
    const lon = (12 - T.utc) * 15;
    const doy = (T.month - 1) * 30.4 + 15;
    return [wrap(lon), 23.44 * Math.sin(((2 * Math.PI) / 365) * (doy - 80))];
  }

  function hit(px, py) {
    const ll = proj.invert([px, py]);
    if (!ll || d3.geoDistance(ll, [V.lon, V.lat]) > 1.5 || !window.DATA.features) return null;
    for (const id in window.DATA.features) if (d3.geoContains(window.DATA.features[id], ll)) return id;
    return null;
  }

  function draw(now) {
    const dt = Math.min(0.06, (now - last) / 1000); last = now;
    const DATA = window.DATA;
    fairMix += (fairTarget - fairMix) * 0.08;

    // clock
    if (T.utcTarget != null) {
      const d = hdiff(T.utcTarget, T.utc);
      T.utc = (T.utc + d * 0.1 + 24) % 24;
    } else if (T.playing) T.utc = (T.utc + dt * (24 / 52) * (F.playSpeed || 1)) % 24;
    if (T.monthTarget != null) {
      let d = T.monthTarget - T.month; if (d > 6) d -= 12; if (d < -6) d += 12;
      T.month = 1 + ((T.month - 1 + d * 0.08 + 12) % 12);
    } else if (F.month != null) {
      let d = F.month - T.month; if (d > 6) d -= 12; if (d < -6) d += 12;
      T.month = 1 + ((T.month - 1 + d * 0.03 + 12) % 12);
    } else if (T.playing) T.month = 1 + ((T.month - 1 + dt * (12 / 80)) % 12);

    // ease the camera
    const L = layout(F), e = inited ? 0.075 : 1;
    V.R *= Math.pow(L.R / V.R, e);
    V.cx += (L.cx - V.cx) * e; V.cy += (L.cy - V.cy) * e;
    V.ring += ((F.ring || 0) - V.ring) * 0.06;
    V.band += (((F.bands && F.bands.length) ? 1 : 0) - V.band) * 0.06;
    V.glass += ((F.glass || 0) - V.glass) * 0.07;
    V.ctry += ((F.layout === 'story' ? 0.25 : F.layout === 'sheet' ? 0.0 : 1) - V.ctry) * 0.06;
    V.labels += (((F.layout === 'explore') ? 1 : 0) - V.labels) * 0.08;
    if (!dragging && now > userUntil) {
      if (F.auto && !reduce) { autoLon += dt * 3.2; V.lon = wrap(autoLon); V.lat += (F.lat - V.lat) * 0.05; }
      else { V.lon = wrap(V.lon + angDiff(F.lon, V.lon) * e); V.lat += (F.lat - V.lat) * e; autoLon = V.lon; }
    } else autoLon = V.lon;
    inited = true;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const g1 = 1 - V.glass;
    proj.rotate([-V.lon, -V.lat]).scale(V.R).translate([V.cx, V.cy]);

    for (const s of stars) { ctx.fillStyle = `rgba(243,234,217,${s.a * (0.35 + 0.65 * g1)})`; ctx.fillRect(s.x, s.y, s.s, s.s); }

    if (g1 > 0.02) { // atmosphere
      const g = ctx.createRadialGradient(V.cx, V.cy, V.R * 0.98, V.cx, V.cy, V.R * 1.22);
      g.addColorStop(0, `rgba(255,150,80,${0.17 * g1})`); g.addColorStop(0.5, `rgba(120,150,210,${0.05 * g1})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(V.cx, V.cy, V.R * 1.22, 0, 7); ctx.fill();
    }
    // ocean + land (turn translucent as we zoom, so the sky shows through)
    const o = ctx.createRadialGradient(V.cx - V.R * 0.3, V.cy - V.R * 0.35, V.R * 0.1, V.cx, V.cy, V.R);
    o.addColorStop(0, `rgba(22,32,47,${0.06 + 0.94 * g1})`); o.addColorStop(1, `rgba(11,17,27,${0.06 + 0.94 * g1})`);
    ctx.fillStyle = o; ctx.beginPath(); path({ type: 'Sphere' }); ctx.fill();
    ctx.strokeStyle = 'rgba(243,234,217,0.05)'; ctx.lineWidth = 0.6; ctx.beginPath(); path(grat); ctx.stroke();
    ctx.fillStyle = V.glass > 0.5 ? `rgba(14,20,34,${0.2 + 0.3 * g1})` : '#1c242f';
    ctx.fillStyle = `rgba(${Math.round(28 - 10 * V.glass)},${Math.round(36 - 12 * V.glass)},${Math.round(47 - 6 * V.glass)},${0.34 + 0.66 * g1})`;
    ctx.beginPath(); path(land); ctx.fill();
    ctx.strokeStyle = `rgba(243,234,217,${0.09 + 0.3 * V.glass})`; ctx.lineWidth = 0.6 + V.glass; ctx.beginPath(); path(borders); ctx.stroke();

    // night side
    if (g1 > 0.02) {
      const [sLon, sLat] = sunPos();
      const night = d3.geoCircle().center([wrap(sLon + 180), -sLat]);
      [[96, 0.2], [90, 0.26], [82, 0.2]].forEach(([r, a]) => { ctx.fillStyle = `rgba(4,5,10,${a * g1})`; ctx.beginPath(); path(night.radius(r)()); ctx.fill(); });
    }

    if (DATA.features) drawCountries();
    if (V.band > 0.02 && F.bands) drawBands();
    if (DATA.climo) drawFires(DATA.climo);

    if (g1 > 0.02) { ctx.strokeStyle = `rgba(243,234,217,${0.22 * g1})`; ctx.lineWidth = 1; ctx.beginPath(); path({ type: 'Sphere' }); ctx.stroke(); }
    if (V.ring > 0.03 && g1 > 0.1) drawRing(sunPos()[0], V.ring * g1);
    if (F.pins) drawPins(F.pins);
    if (V.labels > 0.05 && DATA.byId) drawLabels();

    if (running) requestAnimationFrame(draw);
  }

  function drawCountries() {
    const DATA = window.DATA;
    if (V.ctry < 0.02 && !selected) return;
    for (const id in DATA.features) {
      const f = DATA.features[id];
      const isSel = id === selected, isHov = id === hover;
      const a = isSel ? 1 : V.ctry;
      if (a < 0.02) continue;
      ctx.beginPath(); path(f);
      ctx.fillStyle = `rgba(255,130,50,${(isSel ? 0.05 : isHov ? 0.2 : 0.07) * a})`; ctx.fill();
      if (isSel && flagTex && V.glass > 0.25) {
        const bb = path.bounds(f), bw = bb[1][0] - bb[0][0], bh = bb[1][1] - bb[0][1];
        if (bw > 2 && bh > 2) {
          ctx.save(); ctx.beginPath(); path(f); ctx.clip();
          const sc = Math.max(bw / flagTex.width, bh / flagTex.height), dw = flagTex.width * sc, dh = flagTex.height * sc;
          ctx.globalAlpha = 0.34 * Math.min(1, (V.glass - 0.25) / 0.5);
          ctx.drawImage(flagTex, bb[0][0] + (bw - dw) / 2, bb[0][1] + (bh - dh) / 2, dw, dh);
          ctx.restore();
        }
      }
      ctx.strokeStyle = `rgba(255,170,90,${(isSel ? 0.9 : isHov ? 0.95 : 0.4) * a})`; ctx.lineWidth = isSel ? 1.6 : isHov ? 1.8 : 0.9; ctx.stroke();
    }
  }

  const COLS = ['rgba(255,110,30,.28)', 'rgba(255,120,30,.5)', 'rgba(255,150,50,.75)', 'rgba(255,190,90,.92)', 'rgba(255,236,180,1)'];
  function drawFires(C) {
    const lam = V.lon * Math.PI / 180, phi = V.lat * Math.PI / 180;
    const vx = Math.cos(phi) * Math.cos(lam), vy = Math.cos(phi) * Math.sin(lam), vz = Math.sin(phi);
    const m0 = Math.floor(T.month - 1) % 12, m1 = (m0 + 1) % 12, f = (T.month - 1) - Math.floor(T.month - 1);
    const lp = Math.log1p(C.p95);
    const buckets = [[], [], [], [], []];
    for (let i = 0; i < C.n; i++) {
      if (C.x[i] * vx + C.y[i] * vy + C.z[i] * vz < 0.03) continue;
      const v = C.v[i * 12 + m0] * (1 - f) + C.v[i * 12 + m1] * f;
      if (v < 0.6) continue;
      const s = Math.pow(Math.min(1, Math.log1p(v) / lp), 1.7);
      const lt = (T.utc + C.lon[i] / 15 + 24) % 24;
      const observed = 0.25 + 0.75 * diurnal(lt);
      const lvl = s * (observed * (1 - fairMix) + fairMix);
      if (lvl < 0.07) continue;
      const b = Math.min(4, Math.floor(lvl * 6.2));
      const q = proj([C.lon[i], C.lat[i]]);
      buckets[b].push(q[0], q[1]);
    }
    const cell = V.R * 0.5 * Math.PI / 180;
    const sz = Math.max(1.25, Math.min(cell * 0.95, V.R * 0.02));
    for (let b = 0; b < 5; b++) {
      const arr = buckets[b]; if (!arr.length) continue;
      const s = sz * (0.5 + b * 0.1);
      ctx.fillStyle = COLS[b]; ctx.beginPath();
      for (let i = 0; i < arr.length; i += 2) ctx.rect(arr[i] - s / 2, arr[i + 1] - s / 2, s, s);
      ctx.fill();
      if (b === 4 && sz < 12) {
        ctx.fillStyle = 'rgba(255,190,100,.12)'; ctx.beginPath();
        for (let i = 0; i < arr.length; i += 2) { ctx.moveTo(arr[i] + s * 1.7, arr[i + 1]); ctx.arc(arr[i], arr[i + 1], s * 1.7, 0, 6.3); }
        ctx.fill();
      }
    }
  }

  function drawBands() {
    F.bands.forEach((id) => {
      const b = bandInfo(id);
      const lon = wrap((b.h - T.utc) * 15);
      const ring = d3.geoGraticule().extent([[lon - 5, -80], [lon + 5, 80]]).outline();
      ctx.fillStyle = `rgba(${b.c},${0.13 * V.band})`; ctx.strokeStyle = `rgba(${b.c},${0.7 * V.band})`; ctx.lineWidth = 1;
      ctx.beginPath(); path(ring); ctx.fill(); ctx.stroke();
      const lat = id === 'terra' ? 52 : id === 'aqua' ? 40 : 28;
      if (d3.geoDistance([lon, lat], [V.lon, V.lat]) < 1.3) {
        const p = proj([lon, lat]);
        ctx.font = '600 10.5px "Hanken Grotesk", system-ui, sans-serif'; ctx.fillStyle = `rgba(${b.c},${V.band})`; ctx.textAlign = 'left';
        ctx.fillText(`${b.label} ${S.fmtH(b.h)}`, p[0] + 9, p[1] + 3);
      }
    });
  }

  function drawRing(sLon, a) {
    const r = V.R * 1.1;
    ctx.save(); ctx.translate(V.cx, V.cy);
    ctx.strokeStyle = `rgba(243,234,217,${0.18 * a})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.3); ctx.stroke();
    ctx.font = '600 10px "Hanken Grotesk", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let k = 0; k < 24; k++) {
      const off = k * 15 - 180, th = (off * Math.PI) / 180 - Math.PI / 2, major = k % 3 === 0, r1 = r - (major ? 9 : 4);
      ctx.strokeStyle = `rgba(243,234,217,${(major ? 0.55 : 0.28) * a})`;
      ctx.beginPath(); ctx.moveTo(Math.cos(th) * r1, Math.sin(th) * r1); ctx.lineTo(Math.cos(th) * r, Math.sin(th) * r); ctx.stroke();
      if (major) {
        const lt = (T.utc + (V.lon + off) / 15 + 48) % 24;
        ctx.fillStyle = `rgba(243,234,217,${0.62 * a})`;
        ctx.fillText(String(Math.round(lt) % 24).padStart(2, '0'), Math.cos(th) * (r + 15), Math.sin(th) * (r + 15));
      }
    }
    const st = (wrap(sLon - V.lon) * Math.PI) / 180 - Math.PI / 2;
    ctx.fillStyle = `rgba(255,198,90,${a})`; ctx.beginPath(); ctx.arc(Math.cos(st) * r, Math.sin(st) * r, 4.4, 0, 6.3); ctx.fill();
    ctx.strokeStyle = `rgba(255,198,90,${0.35 * a})`; ctx.beginPath(); ctx.arc(Math.cos(st) * r, Math.sin(st) * r, 9, 0, 6.3); ctx.stroke();
    ctx.restore();
  }

  function drawPins(pins) {
    ctx.font = '600 11px "Hanken Grotesk", system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    pins.forEach((p) => {
      if (d3.geoDistance([p.lon, p.lat], [V.lon, V.lat]) > 1.35) return;
      const q = proj([p.lon, p.lat]);
      ctx.strokeStyle = 'rgba(243,234,217,.85)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(q[0], q[1], 4, 0, 6.3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(q[0] + 4, q[1] - 4); ctx.lineTo(q[0] + 18, q[1] - 16); ctx.lineTo(q[0] + 24, q[1] - 16); ctx.stroke();
      ctx.fillStyle = '#f3ead9'; ctx.fillText(p.t, q[0] + 28, q[1] - 12);
    });
  }

  function drawLabels() {
    const DATA = window.DATA;
    ctx.font = '600 10.5px "Hanken Grotesk", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    DATA.meta.countries.forEach((c) => {
      if (d3.geoDistance(c.centroid, [V.lon, V.lat]) > 1.2) return;
      const q = proj(c.centroid);
      ctx.fillStyle = `rgba(243,234,217,${(c.id === hover ? 1 : 0.72) * V.labels})`;
      ctx.fillText(c.name.replace('United States', 'USA').toUpperCase(), q[0], q[1]);
    });
  }

  /* ---- input ---- */
  let down = null, lastPt = null, hoverAt = 0;
  cv.addEventListener('pointerdown', (e) => {
    if (F.layout === 'sheet') return;
    dragging = true; down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 }; lastPt = [e.clientX, e.clientY];
    cv.setPointerCapture(e.pointerId); cv.classList.add('grab');
  });
  cv.addEventListener('pointermove', (e) => {
    if (dragging) {
      const k = 90 / V.R;
      V.lon = wrap(V.lon - (e.clientX - lastPt[0]) * k * 1.1);
      V.lat = Math.max(-80, Math.min(80, V.lat + (e.clientY - lastPt[1]) * k * 1.1));
      down.moved += Math.abs(e.clientX - lastPt[0]) + Math.abs(e.clientY - lastPt[1]);
      lastPt = [e.clientX, e.clientY];
    } else if (performance.now() - hoverAt > 60 && F.layout !== 'sheet') {
      hoverAt = performance.now();
      const id = hit(e.clientX, e.clientY);
      if (id !== hover) { hover = id; cv.style.cursor = id ? 'pointer' : 'grab'; if (hoverCb) hoverCb(id, e.clientX, e.clientY); }
      else if (id && hoverCb) hoverCb(id, e.clientX, e.clientY);
    }
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = false; cv.classList.remove('grab'); userUntil = performance.now() + 3500;
    if (down && down.moved < 7 && performance.now() - down.t < 600 && e.type === 'pointerup') {
      const id = hit(e.clientX, e.clientY);
      if (id && pickCb) pickCb(id);
    }
  };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('pointerleave', () => { if (!dragging) { hover = null; if (hoverCb) hoverCb(null); } });

  function start() { if (running) return; running = true; last = performance.now(); requestAnimationFrame(draw); }
  function stop() { running = false; }
  window.addEventListener('resize', resize);
  resize();

  window.GLOBE = {
    T, V, start, stop,
    focus(f) { F = f; userUntil = 0; },
    get layout() { return F.layout; },
    setSelected(id) { selected = id; },
    setFlag(c) { flagTex = c; },
    onPick(cb) { pickCb = cb; }, onHover(cb) { hoverCb = cb; },
    setBandInfo(fn) { bandInfo = fn; },
    setFair(on) { fairTarget = on ? 1 : 0; },
    lockLocalHour(hour, lon) { T.utcTarget = ((hour - lon / 15) % 24 + 24) % 24; },
    unlock() { T.utcTarget = null; T.monthTarget = null; },
    setMonth(m) { T.monthTarget = m; },
    localHourAtCenter() { return (T.utc + V.lon / 15 + 24) % 24; },
    project: (ll) => proj(ll)
  };
})();
