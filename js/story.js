/* SUNDIAL story: the scroll-driven globe, plus the small figures inside the story cards. */
(function () {
  const S = window.SUN;
  const { countries, land, borders, PTS, D, seasonal, terraH, aquaH, VIIRS_H, fmtH } = S;
  const $ = (s, r = document) => r.querySelector(s);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const cv = $('#globe');
  const ctx = cv.getContext('2d');
  const stage = $('#stage');
  let W = 0, H = 0, DPR = 1, stars = [];

  const proj = d3.geoOrthographic().clipAngle(90).precision(0.6);
  const path = d3.geoPath(proj, ctx);
  const grat = d3.geoGraticule10();

  /* ---- scene focus table: where the globe looks for each section ---- */
  const FOCI = {
    hero: { lon: -28, lat: 12, k: 1, hero: true, auto: true, ring: 0.35 },
    cameras: { lon: 17, lat: -10, k: 1.18, month: 8, pins: [{ lon: 17.5, lat: -12, t: 'Angola' }, { lon: 33, lat: -17, t: 'Mozambique' }], ring: 0 },
    clock: { lon: 20, lat: 4, k: 1.05, ring: 1, playSpeed: 1, bands: ['viirs'] },
    drift: { lon: 40, lat: 6, k: 1.05, ring: 0.8, bands: ['terra', 'aqua', 'viirs'], yearDriven: true },
    swath: { lon: 28, lat: -6, k: 1.15, ring: 0.5, bands: ['terra'], pins: [{ lon: 22, lat: -26, t: 'west edge' }, { lon: 34.5, lat: -26, t: 'east edge' }] },
    evidence: { lon: 60, lat: 0, k: 1.0, month: 9, ring: 0, pins: [
      { lon: 35, lat: -18, t: 'Mozambique 89%' }, { lon: 133, lat: -25, t: 'Australia 67%' },
      { lon: 68, lat: 48, t: 'Kazakhstan 61%' }, { lon: -58, lat: -23, t: 'Paraguay 51%' } ] }
  };

  /* ---- sim clock ---- */
  const T = { utc: 11.2, month: 8.6, playing: !reduce, year: 2000 };
  let lastNow = performance.now();

  /* ---- view state, eased toward the current focus ---- */
  const V = { lon: -28, lat: 12, R: 300, cx: 0, cy: 0, ring: 0.35, band: 0 };
  let focusId = 'hero';
  let userUntil = 0;
  let dragging = false;
  let autoLon = -28;
  let hasInit = false;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const r = S.rng(77);
    stars = Array.from({ length: 160 }, () => ({ x: r() * W, y: r() * H, a: 0.1 + r() * 0.35, s: r() < 0.1 ? 1.4 : 0.8 }));
  }

  function layout(f) {
    const mobile = W < 860;
    if (mobile) {
      const R = Math.min(W * 0.4, H * 0.27) * (f.hero ? 1.12 : f.k || 1);
      return { R, cx: W * 0.5, cy: f.hero ? H * 0.38 : H * 0.28 };
    }
    if (f.hero) return { R: Math.min(H * 0.42, W * 0.36), cx: W * 0.62, cy: H * 0.52 };
    const R = Math.min(H * 0.4, W * 0.27) * (f.k || 1);
    return { R, cx: W * 0.7, cy: H * 0.5 };
  }

  const wrap = (a) => ((((a + 180) % 360) + 360) % 360) - 180;
  const angDiff = (a, b) => wrap(a - b);

  function sunPos() {
    const lon = (12 - T.utc) * 15;
    const doy = (T.month - 1) * 30.4 + 15;
    const lat = 23.44 * Math.sin(((2 * Math.PI) / 365) * (doy - 80));
    return [wrap(lon), lat];
  }

  /* ---- drawing ---- */
  function draw(now) {
    const dt = Math.min(0.06, (now - lastNow) / 1000);
    lastNow = now;
    const f = FOCI[focusId] || FOCI.hero;

    // time
    if (T.playing) {
      T.utc = (T.utc + dt * (24 / 52) * (f.playSpeed || 1)) % 24;
      if (f.month == null) T.month = 1 + ((T.month - 1 + dt * (12 / 75)) % 12);
    }
    if (f.month != null) {
      let d = f.month - T.month;
      if (d > 6) d -= 12; if (d < -6) d += 12;
      T.month = 1 + ((T.month - 1 + d * 0.03 + 12) % 12);
    }

    // ease view
    const L = layout(f);
    const e = hasInit ? 0.07 : 1;
    V.R += (L.R - V.R) * e; V.cx += (L.cx - V.cx) * e; V.cy += (L.cy - V.cy) * e;
    V.ring += ((f.ring || 0) - V.ring) * 0.06;
    V.band += (((f.bands && f.bands.length) ? 1 : 0) - V.band) * 0.06;
    if (!dragging && performance.now() > userUntil) {
      if (f.auto && !reduce) { autoLon += dt * 4; V.lon = wrap(autoLon); V.lat += (f.lat - V.lat) * 0.05; }
      else {
        V.lon = wrap(V.lon + angDiff(f.lon, V.lon) * 0.06);
        V.lat += (f.lat - V.lat) * 0.06;
      }
      if (!f.auto) autoLon = V.lon;
    } else autoLon = V.lon;
    hasInit = true;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // stars
    for (const s of stars) { ctx.fillStyle = `rgba(239,231,218,${s.a})`; ctx.fillRect(s.x, s.y, s.s, s.s); }

    proj.rotate([-V.lon, -V.lat]).scale(V.R).translate([V.cx, V.cy]);

    // atmosphere
    const g = ctx.createRadialGradient(V.cx, V.cy, V.R * 0.98, V.cx, V.cy, V.R * 1.22);
    g.addColorStop(0, 'rgba(255,170,90,0.16)'); g.addColorStop(0.5, 'rgba(120,150,210,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(V.cx, V.cy, V.R * 1.22, 0, 7); ctx.fill();

    // ocean
    const o = ctx.createRadialGradient(V.cx - V.R * 0.3, V.cy - V.R * 0.35, V.R * 0.1, V.cx, V.cy, V.R);
    o.addColorStop(0, '#16202f'); o.addColorStop(1, '#0b111b');
    ctx.fillStyle = o; ctx.beginPath(); path({ type: 'Sphere' }); ctx.fill();

    // graticule
    ctx.strokeStyle = 'rgba(239,231,218,0.05)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); path(grat); ctx.stroke();

    // land + borders
    ctx.fillStyle = '#1c242f'; ctx.beginPath(); path(land); ctx.fill();
    ctx.strokeStyle = 'rgba(239,231,218,0.09)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); path(borders); ctx.stroke();

    // night side
    const [sLon, sLat] = sunPos();
    const night = d3.geoCircle().center([wrap(sLon + 180), -sLat]);
    [[96, 0.2], [90, 0.26], [82, 0.2]].forEach(([r, a]) => {
      ctx.fillStyle = `rgba(4,5,10,${a})`;
      ctx.beginPath(); path(night.radius(r)()); ctx.fill();
    });

    // satellite swath bands (lines of constant local solar time)
    if (V.band > 0.02 && f.bands) drawBands(f);

    // fire points
    drawFires();

    // rim
    ctx.strokeStyle = 'rgba(239,231,218,0.22)'; ctx.lineWidth = 1;
    ctx.beginPath(); path({ type: 'Sphere' }); ctx.stroke();

    if (V.ring > 0.03) drawRing(sLon);
    if (f.pins) drawPins(f.pins);

    if (now - hudAt > 200) { hudAt = now; updateHud(); }
    if (!document.body.classList.contains('past-stage')) requestAnimationFrame(draw);
    else running = false;
  }
  let running = false, hudAt = 0;
  function loop() { if (running) return; running = true; lastNow = performance.now(); requestAnimationFrame(draw); }

  function bandInfo(id) {
    const y = T.year;
    if (id === 'terra') return { h: f_year() ? terraH(y) : 10.5, c: '255,206,120', label: 'TERRA' };
    if (id === 'aqua') return { h: f_year() ? aquaH(y) : 13.5, c: '255,122,26', label: 'AQUA' };
    return { h: VIIRS_H, c: '125,178,255', label: 'VIIRS' };
  }
  const f_year = () => (FOCI[focusId] && FOCI[focusId].yearDriven) || focusId === 'swath';
  function drawBands(f) {
    f.bands.forEach((id) => {
      const b = bandInfo(id);
      const lon = wrap((b.h - T.utc) * 15);
      const ring = d3.geoGraticule().extent([[lon - 5, -80], [lon + 5, 80]]).outline();
      ctx.fillStyle = `rgba(${b.c},${0.13 * V.band})`;
      ctx.strokeStyle = `rgba(${b.c},${0.7 * V.band})`; ctx.lineWidth = 1;
      ctx.beginPath(); path(ring); ctx.fill(); ctx.stroke();
      const lat = id === 'terra' ? 52 : id === 'aqua' ? 40 : 28;
      if (d3.geoDistance([lon, lat], [V.lon, V.lat]) < 1.3) {
        const p = proj([lon, lat]);
        ctx.font = '500 10.5px "JetBrains Mono", monospace';
        ctx.fillStyle = `rgba(${b.c},${V.band})`;
        ctx.textAlign = 'left';
        ctx.fillText(`${b.label} ${fmtH(b.h)}`, p[0] + 9, p[1] + 3);
      }
    });
  }

  const COLS = ['rgba(255,122,26,.22)', 'rgba(255,122,26,.42)', 'rgba(255,140,40,.68)', 'rgba(255,176,80,.9)', 'rgba(255,230,170,1)'];
  function drawFires() {
    const lam = (V.lon * Math.PI) / 180, phi = (V.lat * Math.PI) / 180;
    const vx = Math.cos(phi) * Math.cos(lam), vy = Math.cos(phi) * Math.sin(lam), vz = Math.sin(phi);
    const buckets = [[], [], [], [], []];
    const m = T.month;
    for (let i = 0; i < PTS.length; i++) {
      const p = PTS[i];
      if (p.x * vx + p.y * vy + p.z * vz < 0.03) continue;
      const sea = 0.03 + 0.97 * seasonal(m, p.pk, p.sg);
      if (p.u > sea) continue;
      const lt = (T.utc + p.lon / 15 + 24) % 24;
      const d = D(lt);
      const b = Math.min(4, Math.floor(d * p.i * 6.2));
      const q = proj([p.lon, p.lat]);
      q[2] = p.i;
      buckets[b].push(q);
    }
    const sz = Math.max(1.1, V.R * 0.0055);
    for (let b = 0; b < 5; b++) {
      ctx.fillStyle = COLS[b];
      const arr = buckets[b];
      const s = sz * (0.7 + b * 0.22);
      ctx.beginPath();
      for (let i = 0; i < arr.length; i++) ctx.rect(arr[i][0] - s / 2, arr[i][1] - s / 2, s, s);
      ctx.fill();
      if (b >= 3) {
        ctx.fillStyle = b === 3 ? 'rgba(255,140,40,.14)' : 'rgba(255,190,100,.22)';
        ctx.beginPath();
        for (let i = 0; i < arr.length; i++) { ctx.moveTo(arr[i][0] + s * 2.2, arr[i][1]); ctx.arc(arr[i][0], arr[i][1], s * 2.2, 0, 6.3); }
        ctx.fill();
      }
    }
  }

  function drawRing(sLon) {
    const r = V.R * 1.1;
    const a = V.ring;
    ctx.save();
    ctx.translate(V.cx, V.cy);
    ctx.strokeStyle = `rgba(239,231,218,${0.18 * a})`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.3); ctx.stroke();
    ctx.font = '500 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let k = 0; k < 24; k++) {
      const off = k * 15 - 180; // degrees east of view centre
      const th = (off * Math.PI) / 180 - Math.PI / 2;
      const major = k % 3 === 0;
      const r1 = r - (major ? 9 : 4);
      ctx.strokeStyle = `rgba(239,231,218,${(major ? 0.55 : 0.28) * a})`;
      ctx.beginPath(); ctx.moveTo(Math.cos(th) * r1, Math.sin(th) * r1); ctx.lineTo(Math.cos(th) * r, Math.sin(th) * r); ctx.stroke();
      if (major) {
        const lt = (T.utc + (V.lon + off) / 15 + 48) % 24;
        ctx.fillStyle = `rgba(239,231,218,${0.62 * a})`;
        ctx.fillText(String(Math.round(lt) % 24).padStart(2, '0'), Math.cos(th) * (r + 15), Math.sin(th) * (r + 15));
      }
    }
    // the sun: a gnomon tip on the ring
    const so = wrap(sLon - V.lon);
    const st = (so * Math.PI) / 180 - Math.PI / 2;
    ctx.fillStyle = `rgba(255,210,138,${a})`;
    ctx.beginPath(); ctx.arc(Math.cos(st) * r, Math.sin(st) * r, 4.2, 0, 6.3); ctx.fill();
    ctx.strokeStyle = `rgba(255,210,138,${0.35 * a})`;
    ctx.beginPath(); ctx.arc(Math.cos(st) * r, Math.sin(st) * r, 9, 0, 6.3); ctx.stroke();
    ctx.restore();
  }

  function drawPins(pins) {
    ctx.font = '500 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    pins.forEach((p) => {
      if (d3.geoDistance([p.lon, p.lat], [V.lon, V.lat]) > 1.35) return;
      const q = proj([p.lon, p.lat]);
      ctx.strokeStyle = 'rgba(239,231,218,.85)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(q[0], q[1], 4, 0, 6.3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(q[0] + 4, q[1] - 4); ctx.lineTo(q[0] + 18, q[1] - 16); ctx.lineTo(q[0] + 24, q[1] - 16); ctx.stroke();
      ctx.fillStyle = '#efe7da';
      ctx.fillText(p.t, q[0] + 28, q[1] - 12);
    });
  }

  function updateHud() {
    $('#hud-utc').textContent = 'UTC ' + fmtH(T.utc);
    $('#hud-month').textContent = MONTHS[Math.floor(T.month - 1 + 12) % 12];
  }

  /* ---- interaction ---- */
  let last = null;
  cv.addEventListener('pointerdown', (e) => { dragging = true; last = [e.clientX, e.clientY]; cv.setPointerCapture(e.pointerId); cv.classList.add('grab'); });
  cv.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const k = 90 / V.R;
    V.lon = wrap(V.lon - (e.clientX - last[0]) * k);
    V.lat = Math.max(-80, Math.min(80, V.lat + (e.clientY - last[1]) * k));
    last = [e.clientX, e.clientY];
  });
  const endDrag = () => { dragging = false; userUntil = performance.now() + 3500; cv.classList.remove('grab'); };
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  $('#play').addEventListener('click', () => {
    T.playing = !T.playing;
    const b = $('#play');
    b.setAttribute('aria-pressed', String(T.playing));
    b.setAttribute('aria-label', T.playing ? 'Pause time-lapse' : 'Play time-lapse');
    b.textContent = T.playing ? '❚❚' : '▶';
  });

  /* ---- scroll: pick focus, drive the year, hide the stage in the explorer ---- */
  const scenes = Array.from(document.querySelectorAll('.scene'));
  const exp = $('#explorer');
  const yearEl = $('#year');
  let yearTouched = false;
  function onScroll() {
    const mid = window.innerHeight * 0.5;
    let pick = 'hero';
    for (const s of scenes) { const r = s.getBoundingClientRect(); if (r.top <= mid && r.bottom > mid) pick = s.id; }
    if (pick !== focusId) { focusId = pick; userUntil = 0; }
    const past = exp.getBoundingClientRect().top < window.innerHeight * 0.55;
    if (past !== document.body.classList.contains('past-stage')) {
      document.body.classList.toggle('past-stage', past);
      if (!past) loop();
    }
    if (pick === 'drift' && !yearTouched) {
      const r = $('#drift').getBoundingClientRect();
      const p = Math.max(0, Math.min(1, (window.innerHeight * 0.35 - r.top) / (r.height - window.innerHeight * 0.6)));
      setYear(2000 + p * 26.8);
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => { resize(); drawDiurnal(); });

  /* ---- diurnal chart ---- */
  const dsvg = d3.select('#diurnal').append('svg').attr('viewBox', '0 0 380 190').attr('class', 'dchart');
  const dsvg2 = d3.select('#diurnal-static').append('svg').attr('viewBox', '0 0 380 150').attr('class', 'dchart');
  const dx = d3.scaleLinear().domain([0, 24]).range([30, 366]);
  const dy = d3.scaleLinear().domain([0, 1.05]).range([160, 14]);
  const dyS = d3.scaleLinear().domain([0, 1.05]).range([124, 12]);
  const curve = d3.range(0, 24.01, 0.25);
  function baseChart(svg, y, bottom) {
    svg.append('path').attr('class', 'dfill').attr('d', d3.area().x((t) => dx(t)).y0(bottom).y1((t) => y(D(t))).curve(d3.curveBasis)(curve));
    svg.append('path').attr('class', 'dline').attr('d', d3.line().x((t) => dx(t)).y((t) => y(D(t))).curve(d3.curveBasis)(curve));
    svg.append('line').attr('class', 'axis').attr('x1', 30).attr('x2', 366).attr('y1', bottom).attr('y2', bottom);
    [0, 6, 12, 18, 24].forEach((t) => svg.append('text').attr('class', 'tick').attr('x', dx(t)).attr('y', bottom + 15).attr('text-anchor', 'middle').text(String(t).padStart(2, '0') + ':00'));
  }
  baseChart(dsvg, dy, 160);
  baseChart(dsvg2, dyS, 124);
  dsvg2.append('line').attr('class', 'peak').attr('x1', dx(15)).attr('x2', dx(15)).attr('y1', dyS(1)).attr('y2', 124);
  dsvg2.append('text').attr('class', 'lab').attr('x', dx(15) + 6).attr('y', 16).text('peak ≈ 3 pm local');
  dsvg2.append('text').attr('class', 'lab dim').attr('x', dx(2.5)).attr('y', dyS(0.2)).text('pre-dawn: weakest');
  const marks = {};
  [['terra', '#ffce78', 'Terra'], ['aqua', '#ff7a1a', 'Aqua'], ['viirs', '#7db2ff', 'VIIRS']].forEach(([id, c, name]) => {
    const g = dsvg.append('g').attr('class', 'mk');
    g.append('line').attr('y1', 160).attr('stroke', c).attr('stroke-width', 1.4).attr('stroke-dasharray', '2 3');
    g.append('circle').attr('r', 5).attr('fill', c).attr('stroke', '#0a0908').attr('stroke-width', 1.5);
    g.append('text').attr('class', 'lab').attr('fill', c).attr('text-anchor', 'middle').text(name);
    marks[id] = g;
  });
  function drawDiurnal() {
    const y = T.year;
    const vals = { terra: terraH(y), aqua: aquaH(y), viirs: VIIRS_H };
    const lift = { terra: 0, aqua: 0, viirs: 18 };
    for (const id in marks) {
      const h = vals[id], px = dx(h), py = dy(D(h));
      const g = marks[id];
      g.select('line').attr('x1', px).attr('x2', px).attr('y2', py);
      g.select('circle').attr('cx', px).attr('cy', py);
      g.select('text').attr('x', px + (id === 'terra' ? -4 : id === 'aqua' ? 6 : 0)).attr('y', py - 11 - lift[id]).attr('text-anchor', id === 'terra' ? 'end' : id === 'aqua' ? 'start' : 'middle');
    }
  }
  function setYear(v) {
    T.year = Math.max(2000, Math.min(2026.8, v));
    yearEl.value = T.year.toFixed(1);
    $('#year-out').textContent = Math.floor(T.year) + (T.year % 1 > 0.5 ? '.5' : '');
    drawDiurnal();
    const th = terraH(T.year), ah = aquaH(T.year);
    const tMiss = Math.round((1 - Math.exp(-0.28 * (10.5 - th))) * 100);
    $('#drift-read').innerHTML =
      `<span class="t">Terra ${fmtH(th)}</span> sees about <b>${100 - tMiss}%</b> of what it saw at 10:30 &nbsp;·&nbsp; <span class="a">Aqua ${fmtH(ah)}</span> &nbsp;·&nbsp; <span class="v">VIIRS ${fmtH(VIIRS_H)}</span>`;
  }
  yearEl.addEventListener('input', () => { yearTouched = true; setYear(parseFloat(yearEl.value)); });
  yearEl.addEventListener('change', () => { setTimeout(() => (yearTouched = false), 4000); });

  /* ---- worked example ---- */
  function calc() {
    const n = +$('#c-n').value, h = +$('#c-h').value, k = +$('#c-k').value, b = +$('#c-b').value;
    const mult = Math.exp(-b * (h - 10.5));
    $('#c-mult').textContent = '×' + mult.toFixed(2);
    $('#c-res').textContent = '≈ ' + Math.round(n * mult * k).toLocaleString('en-US');
  }
  ['#c-n', '#c-h', '#c-k', '#c-b'].forEach((id) => $(id).addEventListener('input', calc));
  calc();

  /* ---- swath figure ---- */
  (function swathFig() {
    const svg = d3.select('#swath-fig').append('svg').attr('viewBox', '0 0 640 230').attr('class', 'sfig');
    // strip
    svg.append('rect').attr('class', 'strip').attr('x', 70).attr('y', 70).attr('width', 500).attr('height', 120).attr('rx', 4);
    svg.append('text').attr('class', 'lab dim').attr('x', 320).attr('y', 136).attr('text-anchor', 'middle').text('one satellite pass, seen from above');
    // flight arrow
    svg.append('path').attr('class', 'arrow').attr('d', 'M 320 58 L 320 24 M 314 32 L 320 22 L 326 32');
    svg.append('text').attr('class', 'lab dim').attr('x', 334).attr('y', 36).text('flight direction');
    // edge pixels, same size
    [[102, 'west edge', '09:10', '#ffce78'], [538, 'east edge', '09:50', '#ff7a1a']].forEach(([x, t, tm, c]) => {
      svg.append('rect').attr('x', x - 11).attr('y', 150 - 11).attr('width', 22).attr('height', 22).attr('fill', c).attr('opacity', 0.9);
      svg.append('text').attr('class', 'lab').attr('x', x).attr('y', 205).attr('text-anchor', 'middle').attr('fill', c).text(t + ' · ' + tm);
    });
    // time axis
    svg.append('line').attr('class', 'axis').attr('x1', 70).attr('x2', 570).attr('y1', 214).attr('y2', 214).attr('opacity', 0);
    svg.append('path').attr('class', 'bracket').attr('d', 'M 102 168 L 102 176 L 538 176 L 538 168');
    svg.append('text').attr('class', 'lab').attr('x', 320).attr('y', 168).attr('text-anchor', 'middle').text('≈ 40 minutes of local time · same pixel size');
  })();

  /* ---- scoreboard ---- */
  const BOARD = [
    ['Swath correction · Mozambique (held out)', 89, 'Passed', 'pass'],
    ['Swath correction · Australia (frozen vault test)', 67, 'Passed', 'pass'],
    ['Swath correction · Kazakhstan (held out)', 61, 'Passed', 'pass'],
    ['Swath correction · Paraguay (held out)', 51, 'Passed', 'pass'],
    ['First model, all held-out regions (median)', 43, 'Partial', 'part'],
    ['First model on Australia', null, 'Failed. This is why we switched to the swath method', 'fail'],
    ['Worldwide correction test "W1"', null, 'Failed. Missed its pre-written pass rule', 'fail'],
    ['Land-temperature check (MODIS also measures ground temperature)', null, 'Passed. Aqua minus Terra gap jumped 1.3 to 3.5 °C after the drift; placebo years moved ≤ 0.21 °C', 'pass'],
    ['Punjab, India', null, 'Exploratory. Burning-time shift visible in the swath from about 2011 (z ≈ 6)', 'expl'],
    ['Delhi haze', null, 'Exploratory. Aqua tracks the 2023–24 haze better than fixed VIIRS', 'expl'],
    ['People affected', null, 'Exploratory. 2.2 billion people live in grid squares with a fake decline over 20%, against 0.9 billion in the placebo', 'expl']
  ];
  const boardEl = $('#board');
  BOARD.forEach(([name, pct, note, cls]) => {
    const li = document.createElement('li');
    li.className = cls;
    li.innerHTML = `<div class="b-name">${name}</div>` +
      (pct != null
        ? `<div class="b-bar" role="img" aria-label="${pct}% of the gap closed"><i style="--w:${pct}%"></i><span class="mono">${pct}%</span></div>`
        : `<div class="b-note">${note}</div>`) +
      `<div class="b-tag"><span class="tag ${cls}">${pct != null ? note : cls === 'fail' ? 'Failed' : cls === 'expl' ? 'Exploratory' : 'Passed'}</span></div>`;
    boardEl.appendChild(li);
  });

  /* ---- go ---- */
  resize();
  setYear(2000);
  updateHud();
  onScroll();
  loop();
  if (reduce) { $('#play').textContent = '▶'; $('#play').setAttribute('aria-pressed', 'false'); }
  window.SUNDIAL_STAGE = { T };
})();
