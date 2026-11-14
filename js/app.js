/* SUNDIAL app: title that docks, scroll-driven globe, sky that follows place and time, places tray, country sheet. */
(function () {
  'use strict';
  const S = window.SUN, SKY = window.SKY, G = window.GLOBE, DATA = window.DATA;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONF = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const fmt = (n) => n == null ? '–' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : Math.round(n) + '';
  const TIER = { measured: ['Calibrated on this country', 'Enough data here to measure the correction directly.'], blended: ['Partly borrowed calibration', 'Fewer detections here, so the correction is blended with the pooled value from similar countries.'], borrowed: ['Borrowed calibration', 'Very few detections here, so the correction uses the pooled value from other countries. Treat the details with care.'] };
  const p0 = (v) => (v == null ? 'n/a' : v.toFixed(0) + '%');
  const ymLabel = (ym) => `${MON[ym % 100 - 1]} ${Math.floor(ym / 100)}`;
  const nowUTC = () => { const d = new Date(); return d.getUTCHours() + d.getUTCMinutes() / 60; };
  const hourAt = (lon) => ((nowUTC() + lon / 15) % 24 + 24) % 24;
  const hourWord = (h) => { h = Math.floor(h) % 24; return h === 0 ? '12a' : h < 12 ? h + 'a' : h === 12 ? '12p' : (h - 12) + 'p'; };
  const ICON = {
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></svg>',
    cal: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
    chart: '<svg viewBox="0 0 24 24"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg>',
    flame: '<svg viewBox="0 0 24 24"><path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 .3 1.5 1 2 2 2 0-3-1-5 1-8z"/></svg>',
    sat: '<svg viewBox="0 0 24 24"><path d="M4 20l6-6M9 6l3 3-3 3-3-3zM15 12l3 3-3 3-3-3zM13 8l3-3M19 14l2-2"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
    down: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7 11l5 5 5-5M5 20h14"/></svg>',
    warn: '<svg viewBox="0 0 24 24"><path d="M12 4l9 16H3zM12 10v4M12 17v.5"/></svg>'
  };

  const st = { year: 2000, yearTouched: false, sheetOpen: false };
  let focusId = 'hero';

  /* ============ focus table: where the globe looks for each part of the page ============ */
  const FOCI = {
    hero: { layout: 'hero', lon: -45, lat: 8, auto: true, ring: 0.3 },
    explore: { layout: 'explore', lon: -40, lat: 6, auto: true, ring: 0.45 },
    cameras: { layout: 'story', lon: 22, lat: -10, k: 1.15, month: 8, ring: 0, pins: [{ lon: 17.5, lat: -12, t: 'Angola' }, { lon: 35, lat: -17, t: 'Mozambique' }] },
    clock: { layout: 'story', lon: 20, lat: 4, k: 1.05, ring: 1, bands: ['viirs'] },
    drift: { layout: 'story', lon: 40, lat: 6, k: 1.05, ring: 0.8, bands: ['terra', 'aqua', 'viirs'] },
    swath: { layout: 'story', lon: 28, lat: -6, k: 1.12, ring: 0.5, bands: ['terra'], pins: [{ lon: 22, lat: -26, t: 'west edge' }, { lon: 34.5, lat: -26, t: 'east edge' }] },
    evidence: { layout: 'story', lon: 60, lat: 6, k: 1.0, month: 9, ring: 0, pins: [] }
  };
  G.setBandInfo((id) => {
    const y = st.year;
    if (id === 'terra') return { h: S.terraH(y), c: '255,198,90', cl: '176,104,6', label: 'TERRA' };
    if (id === 'aqua') return { h: S.aquaH(y), c: '255,106,26', cl: '200,60,8', label: 'AQUA' };
    return { h: S.VIIRS_H, c: '125,178,255', cl: '29,95,180', label: 'VIIRS' };
  });

  /* ============ title: big over the globe, then docks top right ============ */
  const title = $('#title');
  let tw = 1, th = 1, baseYear = reduce ? 1983 : 2050;
  function layoutTitle() {
    const W = innerWidth, H = innerHeight;
    title.style.fontSize = Math.min(W * 0.135, H * 0.27) + 'px';
    title.style.transform = 'none';
    tw = title.offsetWidth || 1; th = title.offsetHeight || 1;
    placeTitle();
  }
  function placeTitle() {
    const W = innerWidth, H = innerHeight, mobile = W < 860;
    tw = title.offsetWidth || tw; th = title.offsetHeight || th;
    const big = parseFloat(title.style.fontSize) || 100, small = mobile ? 16 : 21, s = small / big;
    const p = st.sheetOpen ? 1 : clamp(scrollY / (H * 0.85), 0, 1);
    const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    const cy = mobile ? H * 0.44 : H * 0.47;
    const x0 = (W - tw) / 2, y0 = cy - th / 2, x1 = W - tw * s - (mobile ? 16 : 30), y1 = mobile ? 15 : 22;
    title.style.transform = `translate(${x0 + (x1 - x0) * e}px,${y0 + (y1 - y0) * e}px) scale(${1 + (s - 1) * e})`;
    title.classList.toggle('docked', p > 0.95);
    const prog = clamp(scrollY / Math.max(1, document.documentElement.scrollHeight - H), 0, 1);
    title.style.setProperty('--year', (baseYear + (reduce ? 0 : 38 * prog)).toFixed(1));
  }

  /* ============ sky ============
     Title screen: black with distant stars. Everything after it: paper. A country sheet: black with an orange tint from one side
     that follows the local sun, and gets deeper with the time of day and wherever you point at hotter parts of the country. */
  const skyEl = $('#sky'), glowEl = $('#glow');
  const DARK = [10, 9, 8], PAPER = [243, 234, 217];
  const cur = { c: DARK.slice(), glow: 0.12, x: 90, y: 20, heat: 0 };
  let sheetCtx = null, lastSkyStr = '', lastGlowStr = '', heatTarget = 0;
  const glowAlpha = (hour, lat, month, smoke, heat) => {
    const alt = SKY.sunAlt(lat, month, hour), day = clamp(alt / 38, 0, 1), dusk = clamp((alt + 10) / 14, 0, 1) * (1 - day);
    return clamp(0.07 + 0.3 * day + 0.12 * dusk + 0.24 * smoke + 0.32 * heat, 0, 0.9);
  };
  const glowPos = (hour) => { const t = clamp((hour - 5) / 14, 0, 1); return { x: 100 - t * 100, y: 40 - 40 * Math.sin(Math.PI * t) }; };
  function skyFrame() {
    const light = document.body.classList.contains('lightpage');
    const c = SKY.sky(G.V.lat, G.T.month, G.localHourAtCenter(), 0), base = light ? PAPER : DARK, k = light ? 0.07 : 0.1;
    const tgt = SKY.mix(base, c.mid, k);
    for (let i = 0; i < 3; i++) cur.c[i] += (tgt[i] - cur.c[i]) * 0.12;
    const str = `rgb(${cur.c.map(Math.round).join(',')})`;
    if (str !== lastSkyStr) { skyEl.style.background = str; lastSkyStr = str; }
    if (sheetCtx) {
      const hour = ((G.T.utc + sheetCtx.lon / 15) % 24 + 24) % 24; sheetCtx.hourNow = hour;
      cur.heat += (heatTarget - cur.heat) * 0.08;
      const a = glowAlpha(hour, sheetCtx.lat, sheetCtx.month, sheetCtx.smoke, cur.heat), p = glowPos(hour);
      cur.glow += (a - cur.glow) * 0.1; cur.x += (p.x - cur.x) * 0.1; cur.y += (p.y - cur.y) * 0.1;
      const g = cur.glow, deep = Math.max(0, g - 0.2);
      const gs = `radial-gradient(ellipse 80% 95% at ${cur.x.toFixed(1)}% ${cur.y.toFixed(1)}%, rgba(255,106,26,${g.toFixed(3)}) 0%, rgba(224,70,12,${(g * 0.5).toFixed(3)}) 36%, rgba(120,30,6,${(deep * 0.35).toFixed(3)}) 62%, transparent 82%), ` +
        `radial-gradient(ellipse 60% 45% at ${(100 - cur.x).toFixed(1)}% 108%, rgba(150,40,8,${(0.1 + 0.3 * cur.heat).toFixed(3)}) 0%, transparent 70%), #050404`;
      if (gs !== lastGlowStr) { glowEl.style.background = gs; lastGlowStr = gs; }
    }
  }

  /* ============ embers: smoke you can see when a place is burning ============ */
  const ec = $('#embers'), ectx = ec.getContext('2d');
  let parts = [], emberLevel = 0, lastT = performance.now();
  function embersFrame(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    const W = innerWidth, H = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    if (ec.width !== Math.round(W * dpr)) { ec.width = Math.round(W * dpr); ec.height = Math.round(H * dpr); }
    ectx.setTransform(dpr, 0, 0, dpr, 0, 0); ectx.clearRect(0, 0, W, H);
    const want = st.sheetOpen && !reduce ? Math.round(emberLevel * 110) : 0;
    while (parts.length < want) parts.push({ x: Math.random() * W, y: H + Math.random() * 40, v: 18 + Math.random() * 46, s: 0.8 + Math.random() * 2.2, ph: Math.random() * 6.3, a: 0.2 + Math.random() * 0.5 });
    if (parts.length > want) parts.length = want;
    ectx.globalCompositeOperation = 'lighter';
    for (const p of parts) {
      p.y -= p.v * dt; p.x += Math.sin(now / 900 + p.ph) * 12 * dt;
      if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W; }
      const fade = clamp(p.y / (H * 0.35), 0, 1);
      ectx.fillStyle = `rgba(255,${Math.round(120 + 90 * (1 - fade))},40,${p.a * fade})`;
      ectx.beginPath(); ectx.arc(p.x, p.y, p.s, 0, 6.3); ectx.fill();
    }
    ectx.globalCompositeOperation = 'source-over';
  }

  /* ============ frame loop for things that are not the globe ============ */
  function frame(now) {
    skyFrame(); embersFrame(now);
    requestAnimationFrame(frame);
  }

  /* ============ scroll ============ */
  const scenes = $$('.scene');
  const dockMap = { hero: 'explore', explore: 'explore', cameras: 'cameras', clock: 'cameras', drift: 'cameras', swath: 'swath', evidence: 'evidence' };
  const closing = $('#why'), intro = $('#intro');
  function onScroll() {
    placeTitle();
    if (st.sheetOpen) return;
    const mid = innerHeight * 0.5, introTop = intro.getBoundingClientRect().top;
    document.body.classList.toggle('lightpage', introTop <= 0);
    document.body.classList.toggle('ink-title', introTop < 60);   // the paper band now fills the screen, so the page can safely turn white behind it
    let pick = 'hero';
    for (const s of scenes) { const r = s.getBoundingClientRect(); if (r.top <= mid && r.bottom > mid) pick = s.id; }
    if (pick === 'hero' && introTop < innerHeight * 0.2) pick = 'explore';   // while the paper band is up, the globe quietly moves to its next position behind it
    if (pick !== focusId) { focusId = pick; G.focus(FOCI[pick] || FOCI.hero); }
    document.body.classList.toggle('on-hero', pick === 'hero');
    $$('#dock a').forEach((a) => a.classList.toggle('on', a.dataset.for === dockMap[pick]));
    const past = closing.getBoundingClientRect().top < innerHeight * 0.4;
    if (past !== document.body.classList.contains('past-stage')) { document.body.classList.toggle('past-stage', past); past ? G.stop() : G.start(); }
    if (pick === 'drift' && !st.yearTouched) {
      const r = $('#drift').getBoundingClientRect();
      setYear(2000 + clamp((innerHeight * 0.35 - r.top) / (r.height - innerHeight * 0.6), 0, 1) * 26.8);
    }
  }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', () => { layoutTitle(); onScroll(); });

  /* ============ story figures ============ */
  const D3 = window.d3;
  const dsvg = D3.select('#diurnal').append('svg').attr('viewBox', '0 0 380 190').attr('class', 'dchart');
  const dsvg2 = D3.select('#diurnal-static').append('svg').attr('viewBox', '0 0 380 150').attr('class', 'dchart');
  const dx = D3.scaleLinear().domain([0, 24]).range([30, 366]);
  const dy = D3.scaleLinear().domain([0, 1.05]).range([160, 14]);
  const dyS = D3.scaleLinear().domain([0, 1.05]).range([124, 12]);
  const curve = D3.range(0, 24.01, 0.25);
  function baseChart(svg, y, bottom) {
    svg.append('path').attr('class', 'dfill').attr('d', D3.area().x((t) => dx(t)).y0(bottom).y1((t) => y(S.D(t))).curve(D3.curveBasis)(curve));
    svg.append('path').attr('class', 'dline').attr('d', D3.line().x((t) => dx(t)).y((t) => y(S.D(t))).curve(D3.curveBasis)(curve));
    svg.append('line').attr('class', 'axis').attr('x1', 30).attr('x2', 366).attr('y1', bottom).attr('y2', bottom);
    [0, 6, 12, 18, 24].forEach((t) => svg.append('text').attr('x', dx(t)).attr('y', bottom + 15).attr('text-anchor', 'middle').text(String(t).padStart(2, '0') + ':00'));
  }
  baseChart(dsvg, dy, 160); baseChart(dsvg2, dyS, 124);
  dsvg2.append('line').attr('class', 'peak').attr('x1', dx(15)).attr('x2', dx(15)).attr('y1', dyS(1)).attr('y2', 124);
  dsvg2.append('text').attr('class', 'lab').attr('x', dx(15) + 6).attr('y', 16).text('peak ≈ 3 pm local');
  dsvg2.append('text').attr('class', 'lab dim').attr('x', dx(2.5)).attr('y', dyS(0.2)).text('pre-dawn: weakest');
  const marks = {};
  [['terra', '#ffc65a', 'Terra'], ['aqua', '#ff6a1a', 'Aqua'], ['viirs', '#7db2ff', 'VIIRS']].forEach(([id, c, name]) => {
    const g = dsvg.append('g');
    g.append('line').attr('y1', 160).attr('stroke', c).attr('stroke-width', 1.4).attr('stroke-dasharray', '2 3');
    g.append('circle').attr('r', 5).attr('fill', c).attr('stroke', '#0a0908').attr('stroke-width', 1.5);
    g.append('text').attr('class', 'lab').attr('fill', c).text(name);
    marks[id] = g;
  });
  function setYear(v) {
    st.year = clamp(v, 2000, 2026.8);
    $('#year').value = st.year.toFixed(1);
    $('#year-out').textContent = Math.floor(st.year) + (st.year % 1 > 0.5 ? '.5' : '');
    const vals = { terra: S.terraH(st.year), aqua: S.aquaH(st.year), viirs: S.VIIRS_H }, lift = { terra: 0, aqua: 0, viirs: 18 };
    for (const id in marks) {
      const h = vals[id], px = dx(h), py = dy(S.D(h)), g = marks[id];
      g.select('line').attr('x1', px).attr('x2', px).attr('y2', py);
      g.select('circle').attr('cx', px).attr('cy', py);
      g.select('text').attr('x', px + (id === 'terra' ? -4 : id === 'aqua' ? 6 : 0)).attr('y', py - 11 - lift[id]).attr('text-anchor', id === 'terra' ? 'end' : id === 'aqua' ? 'start' : 'middle');
    }
    const th = vals.terra, miss = Math.round((1 - Math.exp(-0.28 * (10.5 - th))) * 100);
    $('#drift-read').innerHTML = `<span class="t">Terra ${S.fmtH(th)}</span> sees about <b>${100 - miss}%</b> of what it saw at 10:30 &nbsp;·&nbsp; <span class="a">Aqua ${S.fmtH(vals.aqua)}</span> &nbsp;·&nbsp; <span class="v">VIIRS ${S.fmtH(S.VIIRS_H)}</span>`;
  }
  $('#year').addEventListener('input', () => { st.yearTouched = true; setYear(parseFloat($('#year').value)); });
  $('#year').addEventListener('change', () => setTimeout(() => (st.yearTouched = false), 4000));
  function calc() {
    const n = +$('#c-n').value, h = +$('#c-h').value, k = +$('#c-k').value, b = +$('#c-b').value, m = Math.exp(-b * (h - 10.5));
    $('#c-mult').textContent = '×' + m.toFixed(2); $('#c-res').textContent = '≈ ' + Math.round(n * m * k).toLocaleString('en-US');
  }
  ['#c-n', '#c-h', '#c-k', '#c-b'].forEach((id) => $(id).addEventListener('input', calc)); calc();
  (function swathFig() {
    const svg = D3.select('#swath-fig').append('svg').attr('viewBox', '0 0 640 230').attr('class', 'sfig');
    svg.append('rect').attr('class', 'strip').attr('x', 70).attr('y', 70).attr('width', 500).attr('height', 120).attr('rx', 10);
    svg.append('text').attr('class', 'dim').attr('x', 320).attr('y', 136).attr('text-anchor', 'middle').text('one satellite pass, seen from above');
    svg.append('path').attr('class', 'arrow').attr('d', 'M 320 58 L 320 24 M 314 32 L 320 22 L 326 32');
    svg.append('text').attr('class', 'dim').attr('x', 334).attr('y', 36).text('flight direction');
    [[102, 'west edge', '09:10', '#ffc65a'], [538, 'east edge', '09:50', '#ff6a1a']].forEach(([x, t, tm, c]) => {
      svg.append('rect').attr('x', x - 11).attr('y', 139).attr('width', 22).attr('height', 22).attr('rx', 4).attr('fill', c);
      svg.append('text').attr('x', x).attr('y', 205).attr('text-anchor', 'middle').attr('fill', c).text(t + ' · ' + tm);
    });
    svg.append('path').attr('class', 'bracket').attr('d', 'M 102 168 L 102 176 L 538 176 L 538 168');
    svg.append('text').attr('x', 320).attr('y', 168).attr('text-anchor', 'middle').text('≈ 40 minutes of local time · same pixel size');
  })();

  /* ============ real numbers in the story ============ */
  function initEvidence() {
    const all = Object.values(DATA.score).map((r) => ({ id: r.country, name: DATA.byId[r.country].name, gap: r['V2_terra_drift.gap_closed_pct'], err: r['V1_holdout.median_abs_err_pct'] }));
    const rows = all.filter((r) => r.gap != null).sort((a, b) => b.gap - a.gap), skipped = all.filter((r) => r.gap == null);
    const better = rows.filter((r) => r.gap > 0), worse = rows.filter((r) => r.gap <= 0);
    $('#ev-title').textContent = `It shrank Terra's fake trend in ${better.length} of ${rows.length} tested countries.`;
    $('#board').innerHTML = rows.map((r) => {
      const w = r.gap <= 0, wd = clamp(Math.abs(r.gap), 0, 100);
      return `<li class="${w ? 'worse' : ''}"><span>${r.name}</span><span class="b-bar" role="img" aria-label="${Math.round(r.gap)} percent of the fake trend removed"><i style="width:${wd}%"></i></span><span class="b-num">${Math.round(r.gap)}%</span><span class="b-tag">${w ? 'Worse' : 'Better'}</span></li>`;
    }).join('');
    const errs = rows.map((r) => r.err).filter((e) => e != null).sort((a, b) => a - b);
    const tiers = {}; DATA.meta.countries.forEach((c) => { tiers[c.tier] = (tiers[c.tier] || 0) + 1; });
    const lowData = worse.filter((r) => { const t = DATA.byId[r.id].tier; return t === 'blended' || t === 'borrowed'; }).length;
    const bigWorse = worse.slice().sort((x, y) => (DATA.byId[y.id].calib_n || 0) - (DATA.byId[x.id].calib_n || 0)).slice(0, 4).map((r) => r.name);
    $('#ev-note').textContent = `${worse.length ? `It made ${worse.length} countries worse, and we show that on purpose: ${lowData} of them have little data here, and the largest are ${bigWorse.join(', ')}. ` : ''}${skipped.length ? 'Not enough clean data to test ' + skipped.length + ' smaller countries. ' : ''}Calibration adapts to the data: ${tiers.measured || 0} countries are calibrated on their own, ${tiers.blended || 0} are blended with the pooled value, ${tiers.borrowed || 0} borrow it. Another ${DATA.meta.excluded || 0} places had too little fire to include. ${DATA.score.India && DATA.score.India['V2_terra_drift.gap_closed_pct'] <= 0 ? 'In India the burning schedule itself changed (Punjab crop burning moved later in the day), which breaks the method\u2019s assumption. ' : ''}Converting MODIS to VIIRS units on held-out years (2016 to 2019) is off by a median of ${errs[0].toFixed(1)}% to ${errs[errs.length - 1].toFixed(1)}% per year, depending on the country.`;
    const a = DATA.score.Angola;
    if (a) $('#drift-angola').innerHTML = `<b>Real result, Angola:</b> after the drift began, Terra alone shows <b>${a['V2_terra_drift.raw_terra_change_pct'].toFixed(0)}%</b> while VIIRS shows <b>${a['V2_terra_drift.viirs_change_pct'].toFixed(0)}%</b>. Our correction brings Terra to <b>${a['V2_terra_drift.corrected_terra_change_pct'] > 0 ? '+' : ''}${a['V2_terra_drift.corrected_terra_change_pct'].toFixed(0)}%</b>. The decline is the satellite waking up earlier, not less fire.`;
    FOCI.evidence.pins = ['Mozambique', 'India', 'Kazakhstan', 'Australia'].map((id) => { const c = DATA.byId[id], r = DATA.score[id]; return { lon: c.centroid[0], lat: c.centroid[1], t: `${c.name} ${Math.round(r['V2_terra_drift.gap_closed_pct'])}%` }; });
  }

  /* ============ countries: loaded up front so tooltips, the switcher and the screen-reader list work ============ */
  async function buildPlaces() {
    const ids = DATA.meta.countries.map((c) => c.id);
    $('#places-list').innerHTML = ids.map((id) => `<li><button type="button" data-id="${id}">${DATA.byId[id].name}</button></li>`).join('');
    $('#places-list').addEventListener('click', (e) => { const b = e.target.closest('button[data-id]'); if (b) openPlace(b.dataset.id); });
    $('#switch').innerHTML = ids.slice().sort((a, b) => DATA.byId[a].name.localeCompare(DATA.byId[b].name)).map((id) => `<option value="${id}">${DATA.byId[id].name}</option>`).join('');
    $('#switch').addEventListener('change', (e) => openPlace(e.target.value));
  }

  /* ============ flag map: the country's flag in theme colours only (ink, ember, sun, paper) ============ */
  const flagCache = {};
  function ramp(l) {
    const stops = [[0, [18, 8, 10]], [0.25, [122, 34, 8]], [0.55, [255, 106, 26]], [0.8, [255, 198, 90]], [1, [243, 234, 217]]];
    for (let i = 1; i < stops.length; i++) if (l <= stops[i][0]) { const [a, A1] = stops[i - 1], [b, B1] = stops[i], t = (l - a) / (b - a); return A1.map((v, k) => v + (B1[k] - v) * t); }
    return stops[4][1];
  }
  function flagTex(id) {
    if (flagCache[id]) return flagCache[id];
    return (flagCache[id] = fetch('flags/' + id + '.svg').then((r) => r.text()).then((t) => new Promise((res) => {
      const svg = t.replace('<svg ', '<svg width="960" height="720" preserveAspectRatio="xMidYMid slice" ');
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })), img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = 960; c.height = 720;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0, 960, 720);
        const d = x.getImageData(0, 0, 960, 720), p = d.data;
        for (let i = 0; i < p.length; i += 4) { const col = ramp((0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]) / 255); p[i] = col[0]; p[i + 1] = col[1]; p[i + 2] = col[2]; }
        x.putImageData(d, 0, 0); URL.revokeObjectURL(url); res(c);
      };
      img.onerror = () => res(null); img.src = url;
    })).catch(() => null));
  }

  /* ============ the country sheet ============ */
  const sheet = $('#sheet'), scroller = $('#sheet-scroll'), cardsEl = $('#cards');
  const sh = { id: null, s: null, c: null, idx: 0, hour: 12, mode: 'camera', div: 0.5, playing: false };
  const cname = (c) => c.name;

  async function openPlace(id, opts) {
    opts = opts || {};
    const s = await DATA.loadSeries(id), c = DATA.byId[id];
    Object.assign(sh, { id, s, c, idx: opts.idx != null ? opts.idx : s.months.length - 1, hour: hourAt(c.centroid[0]), mode: 'camera', div: 0.5, playing: false });
    st.sheetOpen = true; document.body.classList.add('sheet-open');
    const b = c.bbox, lat = (b[1] + b[3]) / 2, lon = (b[0] + b[2]) / 2;
    const span = Math.max(b[3] - b[1], (b[2] - b[0]) * Math.cos(lat * Math.PI / 180));
    G.setSelected(id); G.setFlag(null); flagTex(id).then((t) => { if (sh.id === id) G.setFlag(t); });
    $('#switch').value = id;
    G.focus({ layout: 'sheet', lon, lat, span: span * 1.1, glass: 1, ring: 0 });
    G.lockLocalHour(sh.hour, lon);
    sheetCtx = { lat, lon, month: 6, smoke: 0, hourNow: sh.hour };
    sheet.classList.add('open'); sheet.setAttribute('aria-hidden', 'false');
    scroller.scrollTop = 0; hideTip();
    buildCards(); selectIdx(sh.idx);
    placeTitle();
    try { history.replaceState(null, '', `#place=${id}`); } catch (e) { /* ignore */ }
    setTimeout(() => $('#sheet-back').focus({ preventScroll: true }), 700);
  }
  function closePlace() {
    if (!st.sheetOpen) return;
    stopDay(); st.sheetOpen = false; document.body.classList.remove('sheet-open');
    sheet.classList.remove('open'); sheet.setAttribute('aria-hidden', 'true');
    G.setSelected(null); G.setFlag(null); G.unlock(); sheetCtx = null;
    G.focus(FOCI.explore); focusId = 'explore';
    placeTitle(); onScroll();
    try { history.replaceState(null, '', '#explore'); } catch (e) { /* ignore */ }
  }
  $('#sheet-back').addEventListener('click', closePlace);
  scroller.addEventListener('pointermove', (e) => {
    if (!st.sheetOpen || !sheetCtx) return;
    if (e.target.closest('.cards, .stepper, .switch, .sheet-back, .tier')) { heatTarget = 0; hideTip(); return; }
    const v = G.heatAt(e.clientX, e.clientY);
    if (v == null || v < 0.6) { heatTarget = 0; hideTip(); return; }
    heatTarget = clamp(Math.log1p(v) / Math.log1p(sheetCtx.vmax || 1), 0, 1);
    gtip.innerHTML = `Typical ${MONF[sheetCtx.month - 1]}<small>about ${fmt(v)} fires a month in this patch</small>`;
    gtip.style.left = e.clientX + 'px'; gtip.style.top = e.clientY + 'px'; gtip.hidden = false;
  });
  scroller.addEventListener('pointerleave', () => { heatTarget = 0; hideTip(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && st.sheetOpen) closePlace(); });
  scroller.addEventListener('scroll', () => $('#sheet-bar').classList.toggle('on', scroller.scrollTop > innerHeight * 0.3));
  $('#m-prev').addEventListener('click', () => selectIdx(Math.max(0, sh.idx - 1)));
  $('#m-next').addEventListener('click', () => selectIdx(Math.min(sh.s.months.length - 1, sh.idx + 1)));

  function setHour(h, fromUser) {
    sh.hour = ((h % 24) + 24) % 24;
    G.lockLocalHour(sh.hour, sh.c.bbox[0] / 2 + sh.c.bbox[2] / 2);
    $$('.hr', cardsEl).forEach((b) => b.classList.toggle('on', +b.dataset.h === Math.floor(sh.hour)));
    const tod = $('#tod'); if (tod) { tod.value = sh.hour.toFixed(2); $('#tod-out').textContent = fmt12(sh.hour); }
    if (fromUser) stopDay();
  }
  const fmt12 = (h) => { const hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60); return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`; };
  function paintTrack() {
    if (!sheetCtx || !$('#tod')) return;
    const stops = []; for (let h = 0; h <= 24; h++) { const k = clamp(glowAlpha(h % 24, sheetCtx.lat, sheetCtx.month, sheetCtx.smoke, 0) / 0.9, 0, 1); stops.push(`rgb(${Math.round(8 + 247 * k)},${Math.round(6 + 100 * k)},${Math.round(6 + 20 * k)}) ${(h / 24 * 100).toFixed(1)}%`); }
    $('#tod').style.setProperty('--trackbg', `linear-gradient(90deg, ${stops.join(',')})`);
  }
  let dayRaf = 0;
  function playDay() {
    sh.playing = true; $('#day-play').textContent = '❚❚ Pause'; let last = performance.now();
    const step = (now) => { if (!sh.playing) return; setHour(sh.hour + (now - last) / 1000 * (24 / 16)); last = now; dayRaf = requestAnimationFrame(step); };
    dayRaf = requestAnimationFrame(step);
  }
  function stopDay() { sh.playing = false; cancelAnimationFrame(dayRaf); const b = $('#day-play'); if (b) b.textContent = '▶ Play the day'; }

  function selectIdx(i) {
    sh.idx = i;
    const s = sh.s, ym = s.months[i], mo = ym % 100, v = s.harm[i], z = s.z[i];
    $('#sheet-name').textContent = cname(sh.c);
    const tr = TIER[sh.c.tier]; const te = $('#tier'); te.hidden = !tr; if (tr) { te.className = 'tier ' + sh.c.tier; te.textContent = tr[0]; te.title = tr[1]; }
    $('#sheet-num').textContent = Math.round(v).toLocaleString('en-US');
    $('#sheet-cond').textContent = z >= 2 ? `Unusually high for ${MONF[mo - 1]}` : z <= -2 ? `Unusually low for ${MONF[mo - 1]}` : `Typical for ${MONF[mo - 1]}`;
    $('#sheet-hl').textContent = `Fire detections in ${ymLabel(ym)} · peak ${ymLabel(s.summary.peak_month)} (${fmt(s.summary.peak_value)})`;
    $('#m-label').textContent = ymLabel(ym);
    $('#bar-name').textContent = cname(sh.c); $('#bar-val').textContent = Math.round(v).toLocaleString('en-US');
    $('#m-prev').disabled = i === 0; $('#m-next').disabled = i === s.months.length - 1;
    G.setMonth(mo);
    sheetCtx.month = mo; sheetCtx.smoke = clamp(v / (s.summary.peak_value || 1), 0, 1);
    emberLevel = sheetCtx.smoke; sheetCtx.vmax = G.heatScale(sh.c.bbox, mo); paintTrack();
    $$('.c-cell.sel', cardsEl).forEach((e) => e.classList.remove('sel'));
    const cell = $(`.c-cell[data-i="${i}"]`, cardsEl); if (cell) cell.classList.add('sel');
    refreshPasses(); drawMark();
    try { history.replaceState(null, '', `#place=${sh.id}&m=${ym}`); } catch (e) { /* ignore */ }
  }

  /* ---------- cards ---------- */
  function buildCards() {
    const s = sh.s;
    const hours = Array.from({ length: 24 }, (_, h) => `<button type="button" class="hr" data-h="${h}" aria-label="Local time ${h}:00"><span class="hl">${hourWord(h)}</span><span class="hb"><i style="height:${Math.round(S.D(h + 0.5) * 100)}%"></i></span><span class="hs"></span></button>`).join('');
    const years = D3.range(2001, 2026);
    const mx = D3.max(s.harm) || 1;
    const yrows = years.map((y) => {
      const v = s.months.map((m, i) => (Math.floor(m / 100) === y ? s.harm[i] : null)).filter((x) => x != null);
      if (!v.length) return '';
      const lo = Math.min(...v), hi = Math.max(...v), mean = v.reduce((a, b) => a + b, 0) / v.length;
      return `<button type="button" class="yr" data-y="${y}" aria-label="${y}: monthly range ${fmt(lo)} to ${fmt(hi)}"><span class="y">${y}</span><span class="rb"><i style="left:${(lo / mx * 100).toFixed(1)}%;width:${Math.max(1.5, (hi - lo) / mx * 100).toFixed(1)}%"></i><u style="left:${(mean / mx * 100).toFixed(1)}%"></u></span><span class="tot">${fmt(s.summary.yearly[y])}</span></button>`;
    }).join('');
    const sc = DATA.score[sh.id] || {};
    const gap = sc['V2_terra_drift.gap_closed_pct'], worse = gap != null && gap <= 0;
    const anoms = s.months.map((m, i) => ({ i, m, z: s.z[i], v: s.harm[i] })).filter((r) => Math.abs(r.z) >= 2).sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 7);
    cardsEl.innerHTML = `
<section class="gcard span2"><h3 class="gh">${ICON.clock} When in the day<span class="gr" id="pass-sum"></span></h3>
  <div class="dayrow"><p id="day-line"></p><button type="button" id="day-play">▶ Play the day</button></div>
  <div class="tod"><div class="tod-top"><span class="tod-lab">Local time · drag to change</span><output class="tod-out" id="tod-out" for="tod"></output></div><div class="tod-marks" id="tod-marks"></div><input type="range" id="tod" min="0" max="23.99" step="0.02" value="12" aria-label="Local time of day"><div class="tod-ticks" aria-hidden="true"><span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>12 AM</span></div></div>
  <div class="hours" id="hours">${hours}</div>
  <p class="note">The bars are a schematic daily fire rhythm. The markers show when each satellite passed this country in the selected month. Tap an hour to see the sky and the night side at that time.</p></section>
<section class="gcard"><h3 class="gh">${ICON.chart} Year by year</h3><div class="yrows" id="yrows">${yrows}</div><p class="note">Each bar spans the lowest to highest month. The dot is the average month.</p></section>
<section class="gcard"><h3 class="gh">${ICON.sat} Orbit drift</h3><div id="orb"></div>
  <div class="keys"><span><i style="background:#ffd27a"></i>Terra</span><span><i style="background:#ff8a4a"></i>Aqua</span><span><i style="background:#a9cdff"></i>Suomi NPP</span></div>
  <p class="note">Local time of each satellite's daytime pass over ${cname(sh.c)}. Terra slides earlier and Aqua later, from about 2020.</p></section>
<section class="gcard span2"><h3 class="gh">${ICON.cal} Burning calendar<span class="gr">tap a month</span></h3><div class="cal-scroll"><div class="cal" id="cal" role="grid" aria-label="Burning calendar"></div></div>
  <p class="note">Harmonized detections per month in VIIRS units. ▲ unusually high · ▼ unusually low, against the same month in other years.</p></section>
<section class="gcard span2"><h3 class="gh">${ICON.flame} Before and after</h3>
  <div class="seg" role="group" aria-label="Which fix to show"><button type="button" data-m="camera" class="on">Two cameras</button><button type="button" data-m="clock">Drifting clock</button></div>
  <div class="ba" id="ba"><svg id="ba-svg" role="img" aria-label="Monthly series. Left of the divider the uncorrected record, right of it the corrected record."></svg><span class="lab l">Before</span><span class="lab r">After</span></div>
  <p class="note" id="ba-note"></p></section>
<section class="gcard"><h3 class="gh">${ICON.warn} Unusual months</h3><ol class="anoms" id="anoms">${anoms.length ? anoms.map((r) => `<li><button type="button" data-i="${r.i}"><span class="k ${r.z > 0 ? 'up' : 'dn'}">${r.z > 0 ? '▲ High' : '▼ Low'}</span> ${ymLabel(r.m)}<em>${fmt(r.v)} · z ${r.z.toFixed(1)}</em></button></li>`).join('') : '<li class="note">No month passes the |z| ≥ 2 test here.</li>'}</ol></section>
<section class="gcard"><h3 class="gh">${ICON.check} Does it work here?</h3>
  ${gap == null ? `<p>Not enough clean data here to test the correction.</p>${TIER[sh.c.tier] ? `<p class="note"><b>${TIER[sh.c.tier][0]}.</b> ${TIER[sh.c.tier][1]}</p>` : ''}` : `<div class="score"><div><div class="n ${worse ? 'bad' : ''}">${Math.round(gap)}%</div><div class="l">of Terra's fake trend removed</div></div><div><div class="n">${sc['V1_holdout.median_abs_err_pct'] == null ? 'n/a' : sc['V1_holdout.median_abs_err_pct'].toFixed(1) + '%'}</div><div class="l">median yearly error on held-out years</div></div></div>
  <p>Terra alone changed by <b>${p0(sc['V2_terra_drift.raw_terra_change_pct'])}</b> after the drift began while VIIRS changed by <b>${p0(sc['V2_terra_drift.viirs_change_pct'])}</b>. Corrected, Terra changes by <b>${p0(sc['V2_terra_drift.corrected_terra_change_pct'])}</b>.</p>
  ${TIER[sh.c.tier] ? `<p class="note"><b>${TIER[sh.c.tier][0]}.</b> ${TIER[sh.c.tier][1]}</p>` : ''}
  ${worse ? `<p class="note"><b>Here the fix made things worse.</b> ${sh.id === 'India' ? 'Punjab crop burning moved later in the day, which breaks the method’s assumption.' : 'We show this on purpose.'}</p>` : ''}`}</section>
<section class="gcard span2"><h3 class="gh">${ICON.down} Download</h3><div class="dl"><button type="button" class="btn" id="dl-csv">Monthly table (CSV)</button><a class="btn ghost" href="https://firms.modaps.eosdis.nasa.gov/download/" target="_blank" rel="noopener">NASA FIRMS raw archive ↗</a><button type="button" class="btn ghost" id="dl-link">Copy link to this view</button></div>
  <p class="note">One row per month: harmonized count with 95% band, anomaly score, raw counts per satellite, uncorrected and drift-corrected MODIS, pass times and fire power. Hotspot-level files come from the team's server app.</p><p class="toast" id="toast" role="status" aria-live="polite"></p></section>`;
    // wire
    $('#tod').addEventListener('input', () => setHour(parseFloat($('#tod').value), true));
    $('#hours').addEventListener('click', (e) => { const b = e.target.closest('.hr'); if (b) setHour(+b.dataset.h + 0.5, true); });
    $('#day-play').addEventListener('click', () => (sh.playing ? stopDay() : playDay()));
    $('#yrows').addEventListener('click', (e) => { const b = e.target.closest('.yr'); if (!b) return; const y = +b.dataset.y; let best = -1, bi = -1; s.months.forEach((m, i) => { if (Math.floor(m / 100) === y && s.harm[i] > best) { best = s.harm[i]; bi = i; } }); if (bi >= 0) selectIdx(bi); });
    $('#anoms').addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (b) { selectIdx(+b.dataset.i); } });
    $$('.seg button', cardsEl).forEach((b) => b.addEventListener('click', () => { sh.mode = b.dataset.m; $$('.seg button', cardsEl).forEach((x) => x.classList.toggle('on', x === b)); drawBA(); }));
    $('#dl-csv').addEventListener('click', downloadCSV);
    $('#dl-link').addEventListener('click', async () => { try { await navigator.clipboard.writeText(location.href); toast('Link copied. It saves the country and month.'); } catch (e) { toast('Copy failed. The address bar holds the link.'); } });
    buildCalendar(); drawOrbit(); drawBA();
  }
  const toast = (t) => { const el = $('#toast'); if (!el) return; el.textContent = t; clearTimeout(toast.t); toast.t = setTimeout(() => (el.textContent = ''), 5000); };

  function refreshPasses() {
    const s = sh.s, i = sh.idx, H = s.hours;
    const t = H.hT[i], a = H.hA[i], v = H.hS[i] != null ? H.hS[i] : H.hN[i];
    $$('.hs', cardsEl).forEach((e) => (e.innerHTML = ''));
    const put = (h, cls, txt) => { if (h == null) return; const el = $(`.hr[data-h="${Math.floor(h) % 24}"] .hs`, cardsEl); if (el) el.insertAdjacentHTML('beforeend', `<b class="${cls}">${txt}</b>`); };
    put(t, 't', 'T'); put(a, 'a', 'A'); put(v, 'v', 'V');
    const tm = $('#tod-marks'); if (tm) { let prev = -99, row = 0; tm.innerHTML = [[t, 't', 'Terra'], [a, 'a', 'Aqua'], [v, 'v', 'VIIRS']].filter((x) => x[0] != null).sort((p, q) => p[0] - q[0]).map((x) => { row = x[0] - prev < 3.6 ? (row + 1) % 3 : 0; prev = x[0]; return `<b class="${x[1]}" style="left:${(x[0] / 24 * 100).toFixed(1)}%;top:${row * 1.25}rem">${x[2]}</b>`; }).join(''); tm.style.height = '3.7rem'; }
    const bits = [];
    if (t != null) bits.push(`<b style="color:#ffd27a">Terra ${S.fmtH(t)}</b>`);
    if (a != null) bits.push(`<b style="color:#ff9d62">Aqua ${S.fmtH(a)}</b>`);
    if (v != null) bits.push(`<b style="color:#b6d4ff">VIIRS ${S.fmtH(v)}</b>`);
    $('#day-line').innerHTML = bits.length ? bits.join(' &nbsp;·&nbsp; ') + ` <span style="opacity:.75">in ${ymLabel(s.months[i])}</span>` : 'No satellite pass data this month.';
    $$('.hr', cardsEl).forEach((b) => b.classList.toggle('on', +b.dataset.h === Math.floor(sh.hour)));
  }

  const RAMP = D3.interpolateRgbBasis(['rgba(255,255,255,0.14)', '#ffe9a8', '#ff9a3a', '#ff4d0e', '#b61a00']);
  function buildCalendar() {
    const s = sh.s, by = new Map(s.months.map((m, i) => [m, i])), p = D3.quantile(s.harm.slice().sort(D3.ascending), 0.97) || 1;
    const years = D3.range(2000, 2026);
    let h = '<div></div>' + years.map((y) => `<div class="c-yr" role="columnheader">${y % 5 === 0 ? y : ''}</div>`).join('');
    for (let m = 1; m <= 12; m++) {
      h += `<div class="c-mo" role="rowheader">${MON[m - 1]}</div>`;
      years.forEach((y) => {
        const i = by.get(y * 100 + m);
        if (i == null) { h += '<div class="c-cell empty" role="gridcell"></div>'; return; }
        const z = s.z[i], flag = z >= 2 ? '<b>▲</b>' : z <= -2 ? '<b class="lo">▼</b>' : '';
        h += `<button type="button" class="c-cell" role="gridcell" data-i="${i}" style="background:${RAMP(Math.sqrt(Math.max(0, s.harm[i]) / p))}" aria-label="${ymLabel(y * 100 + m)}: ${fmt(s.harm[i])} detections${z >= 2 ? ', unusually high' : z <= -2 ? ', unusually low' : ''}">${flag}</button>`;
      });
    }
    $('#cal').innerHTML = h;
    $('#cal').addEventListener('click', (e) => { const b = e.target.closest('.c-cell[data-i]'); if (b) selectIdx(+b.dataset.i); });
  }

  function drawOrbit() {
    const s = sh.s, w = 420, hh = 190, m = { l: 36, r: 8, t: 10, b: 22 };
    const yy = (mo) => Math.floor(mo / 100) + (mo % 100 - 0.5) / 12;
    const x = D3.scaleLinear().domain([2000.8, 2026]).range([m.l, w - m.r]), y = D3.scaleLinear().domain([8, 16]).range([hh - m.b, m.t]);
    const svg = D3.select('#orb').html('').append('svg').attr('class', 'orb').attr('viewBox', `0 0 ${w} ${hh}`);
    svg.append('g').attr('class', 'grid').selectAll('line').data([9, 10.5, 12, 13.5, 15]).join('line').attr('x1', m.l).attr('x2', w - m.r).attr('y1', (d) => y(d)).attr('y2', (d) => y(d));
    svg.selectAll('.yl').data([9, 10.5, 12, 13.5, 15]).join('text').attr('x', m.l - 5).attr('y', (d) => y(d) + 3).attr('text-anchor', 'end').text((d) => S.fmtH(d));
    svg.selectAll('.xl').data([2000, 2005, 2010, 2015, 2020, 2025]).join('text').attr('x', (d) => x(d)).attr('y', hh - 6).attr('text-anchor', 'middle').text((d) => d);
    [['hT', 't'], ['hA', 'a'], ['hS', 's']].forEach(([k, c]) => {
      const pts = s.months.map((mo, i) => [mo, s.hours[k][i]]).filter((d) => d[1] != null);
      svg.append('path').attr('class', 'ln ' + c).attr('d', D3.line().x((d) => x(yy(d[0]))).y((d) => y(d[1]))(pts));
    });
  }

  function drawBA() {
    const s = sh.s, wrap = $('#ba'), w = wrap.clientWidth || 600, h = Math.max(240, Math.min(340, w * 0.36)), m = { l: 46, r: 12, t: 12, b: 24 };
    const svg = D3.select('#ba-svg').attr('viewBox', `0 0 ${w} ${h}`).attr('width', w).attr('height', h); svg.selectAll('*').remove();
    const yy = (mo) => Math.floor(mo / 100) + (mo % 100 - 0.5) / 12;
    const pts = (arr) => s.months.map((mo, i) => ({ x: yy(mo), v: arr[i] }));
    const camera = sh.mode === 'camera';
    const A = pts(camera ? s.naive : s.terra_raw_vu), B = pts(camera ? s.harm : s.terra_vu), R = pts(s.viirs_vu);
    const x = D3.scaleLinear().domain([2000.8, 2026]).range([m.l, w - m.r]);
    const top = D3.max([...A, ...B, ...R].map((d) => d.v || 0)) * 1.06 || 1;
    const y = D3.scaleLinear().domain([0, top]).range([h - m.b, m.t]).nice();
    svg.append('g').attr('class', 'grid').selectAll('line').data(y.ticks(4)).join('line').attr('x1', m.l).attr('x2', w - m.r).attr('y1', (d) => y(d)).attr('y2', (d) => y(d));
    svg.append('g').selectAll('text').data(y.ticks(4)).join('text').attr('x', m.l - 6).attr('y', (d) => y(d) + 3).attr('text-anchor', 'end').text((d) => D3.format('~s')(d));
    svg.append('g').selectAll('text').data([2000, 2005, 2010, 2015, 2020, 2025]).join('text').attr('x', (d) => x(d)).attr('y', h - 7).attr('text-anchor', 'middle').text((d) => d);
    const ann = svg.append('g').attr('class', 'ann');
    (camera ? [[2012.1, 'VIIRS starts']] : [[2020.3, 'drift begins']]).forEach(([yv, t]) => { ann.append('line').attr('x1', x(yv)).attr('x2', x(yv)).attr('y1', m.t).attr('y2', h - m.b); ann.append('text').attr('x', x(yv) + 5).attr('y', m.t + 20).text(t); });
    const line = (d) => D3.line().defined((p) => p.v != null && isFinite(p.v)).x((p) => x(p.x)).y((p) => y(p.v))(d);
    const defs = svg.append('defs');
    defs.append('clipPath').attr('id', 'cL').append('rect').attr('id', 'cLr').attr('height', h);
    defs.append('clipPath').attr('id', 'cR').append('rect').attr('id', 'cRr').attr('height', h);
    const gL = svg.append('g').attr('clip-path', 'url(#cL)');
    gL.append('path').attr('class', 'ln ' + (camera ? 'naive' : 'rawT')).attr('d', line(A));
    if (!camera) gL.append('path').attr('class', 'ln ref').attr('d', line(R));
    const gR = svg.append('g').attr('clip-path', 'url(#cR)');
    if (camera) gR.append('path').attr('class', 'band').attr('d', D3.area().x((_, i) => x(yy(s.months[i]))).y0((_, i) => y(s.lo[i])).y1((_, i) => y(s.hi[i]))(s.months));
    gR.append('path').attr('class', 'ln harm').attr('d', line(B));
    if (!camera) gR.append('path').attr('class', 'ln ref').attr('d', line(R));
    if (camera) gR.selectAll('circle').data(s.months.map((mo, i) => ({ mo, i })).filter((d) => Math.abs(s.z[d.i]) >= 2)).join('circle').attr('class', (d) => 'an ' + (s.z[d.i] > 0 ? 'hi' : 'lo')).attr('r', 3.3).attr('cx', (d) => x(yy(d.mo))).attr('cy', (d) => y(s.harm[d.i]));
    svg.append('g').attr('class', 'selm').attr('id', 'selm');
    const dv = svg.append('g').attr('class', 'dv').attr('id', 'dv').attr('tabindex', 0).attr('role', 'slider').attr('aria-label', 'Before and after divider').attr('aria-valuemin', 0).attr('aria-valuemax', 100);
    dv.append('line').attr('y1', 0).attr('y2', h); dv.append('rect').attr('x', -15).attr('y', h / 2 - 15).attr('width', 30).attr('height', 30).attr('rx', 15);
    dv.append('path').attr('d', `M -5 ${h / 2 - 5} l -5 5 l 5 5 M 5 ${h / 2 - 5} l 5 5 l -5 5`);
    sh.geom = { x, y, w, h, m };
    placeDivider(); drawMark();
    $('#ba-note').textContent = camera ? 'Left: raw MODIS counts, then raw VIIRS counts, glued at 2012. The jump is the camera. Right: everything on one VIIRS scale, with a 95% band.' : 'Left: Terra alone in VIIRS units, with the drift wiping out its counts after 2020. Right: Terra corrected for its pass time. The dashed line is VIIRS, which never drifted.';
    if (!wrap._wired) {
      wrap._wired = true; let on = false;
      const set = (cx) => { const r = wrap.getBoundingClientRect(), g = sh.geom; sh.div = clamp((cx - r.left - g.m.l) / (g.w - g.m.l - g.m.r), 0, 1); placeDivider(); };
      wrap.addEventListener('pointerdown', (e) => { on = true; wrap.setPointerCapture(e.pointerId); set(e.clientX); });
      wrap.addEventListener('pointermove', (e) => { if (on) set(e.clientX); });
      wrap.addEventListener('pointerup', () => (on = false));
      wrap.addEventListener('keydown', (e) => { if (!e.target.closest('#dv')) return; const d = e.shiftKey ? 0.1 : 0.03; if (e.key === 'ArrowLeft') { sh.div = Math.max(0, sh.div - d); placeDivider(); e.preventDefault(); } if (e.key === 'ArrowRight') { sh.div = Math.min(1, sh.div + d); placeDivider(); e.preventDefault(); } });
    }
  }
  function placeDivider() {
    const g = sh.geom; if (!g) return; const px = g.m.l + sh.div * (g.w - g.m.l - g.m.r);
    D3.select('#cLr').attr('x', 0).attr('width', px); D3.select('#cRr').attr('x', px).attr('width', g.w - px);
    D3.select('#dv').attr('transform', `translate(${px},0)`).attr('aria-valuenow', Math.round(sh.div * 100));
    const l = $('.ba .lab.l'), r = $('.ba .lab.r'); if (l) l.style.opacity = sh.div > 0.14 ? 1 : 0.15; if (r) r.style.opacity = sh.div < 0.86 ? 1 : 0.15;
  }
  function drawMark() {
    const g = D3.select('#selm'); if (g.empty() || !sh.geom) return; g.selectAll('*').remove();
    const mo = sh.s.months[sh.idx], px = sh.geom.x(Math.floor(mo / 100) + (mo % 100 - 0.5) / 12);
    g.append('line').attr('x1', px).attr('x2', px).attr('y1', sh.geom.m.t).attr('y2', sh.geom.h - sh.geom.m.b);
    g.append('circle').attr('r', 5).attr('cx', px).attr('cy', sh.geom.y(sh.s.harm[sh.idx]));
  }

  function downloadCSV() {
    const s = sh.s, q = (v) => (typeof v === 'string' && /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v == null ? '' : v);
    const head = ['area', 'month', 'harmonized_fires_viirs_equiv', 'lower_95', 'upper_95', 'record_source', 'anomaly_z', 'anomaly_flag', 'modis_terra_count', 'modis_aqua_count', 'viirs_snpp_count', 'viirs_noaa20_count', 'naive_glued_count', 'modis_drift_corrected_viirs_equiv', 'modis_uncorrected_viirs_equiv', 'terra_day_overpass_local_hour', 'aqua_day_overpass_local_hour', 'fire_radiative_power_mw_total'];
    const rows = s.months.map((ym, i) => { const z = s.z[i]; return [s.label, `${Math.floor(ym / 100)}-${String(ym % 100).padStart(2, '0')}`, s.harm[i], s.lo[i], s.hi[i], s.source[i], z, z >= 2 ? 'high' : z <= -2 ? 'low' : '', s.T[i], s.A[i], s.S[i], s.N[i], s.naive[i], s.modis_vu[i], s.modis_raw_vu[i], s.hours.hT[i], s.hours.hA[i], s.frp[i]].map(q).join(','); });
    const url = URL.createObjectURL(new Blob([[head.join(',')].concat(rows).join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `sundial_${sh.id}_monthly.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Saved the monthly table.');
  }

  /* ============ globe interactions ============ */
  const gtip = $('#gtip');
  function hideTip() { gtip.hidden = true; }
  G.onHover((id, x, y) => {
    if (!id || st.sheetOpen) { hideTip(); return; }
    const s = DATA.series[id];
    gtip.innerHTML = s ? `${DATA.byId[id].name}<small>${ymLabel(s.months[s.months.length - 1])} · ${fmt(s.harm[s.months.length - 1])} fires · tap to open</small>` : `${DATA.byId[id].name}<small>tap to open</small>`;
    gtip.style.left = x + 'px'; gtip.style.top = y + 'px'; gtip.hidden = false;
  });
  G.onPick((id) => { hideTip(); openPlace(id); });

  /* ============ boot ============ */
  layoutTitle(); setYear(2000); onScroll();
  G.start(); requestAnimationFrame(frame);
  addEventListener('resize', () => { if (st.sheetOpen && sh.s) drawBA(); });

  const minWait = new Promise((r) => setTimeout(r, reduce ? 100 : 1900));
  Promise.all([DATA.ready.catch((e) => { console.error(e); return null; }), (document.fonts && document.fonts.ready) || 0, minWait]).then(async ([d]) => {
    layoutTitle();
    document.body.classList.remove('loading');
    if (!reduce) { const t0 = performance.now(); (function unmelt(now) { const t = clamp((now - t0) / 2200, 0, 1); baseYear = 2050 - 67 * (1 - Math.pow(1 - t, 3)); placeTitle(); if (t < 1) requestAnimationFrame(unmelt); })(t0); }
    if (!d) { $('.explore-hint').textContent = 'The data files did not load. Open this page over http(s), not as a local file.'; return; }
    initEvidence();
    $('.explore-hint').innerHTML = `<span aria-hidden="true">⟲</span> Drag to look around. Tap a glowing country. ${DATA.meta.countries.length} countries.`;
    await buildPlaces();
    const m = /place=([A-Za-z_]+)(?:&m=(\d{6}))?/.exec(location.hash);
    if (m && DATA.byId[m[1]]) { const s = await DATA.loadSeries(m[1]); const idx = m[2] ? s.months.indexOf(+m[2]) : -1; openPlace(m[1], idx >= 0 ? { idx } : {}); }
  });
})();
