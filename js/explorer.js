/* SUNDIAL explorer: area picker, burning calendar, before/after series, anomalies, CSV.
   Runs on a synthetic fire field (see core.js). The harmonization maths mirrors the team brief:
   n_harm = k * n_Terra * exp(-b (h - 10.5)); MODIS-only years joined to VIIRS from 2012. */
(function () {
  const S = window.SUN;
  const { land, borders, PTS, seasonal, terraH, rng, hashStr, gauss } = S;
  const $ = (s, r = document) => r.querySelector(s);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtN = d3.format(',.0f');

  const PRESETS = [
    ['Argentina (showcase)', [-73.6, -55, -53.6, -21.8]],
    ['Angola', [11.6, -18.1, 24.1, -4.4]],
    ['Mozambique', [30.2, -26.9, 40.9, -10.4]],
    ['Paraguay', [-62.7, -27.6, -54.2, -19.3]],
    ['Kazakhstan', [46.5, 40.6, 87.3, 55.4]],
    ['Australia', [113, -44, 154, -10]],
    ['Punjab and Haryana, India', [73.8, 28.4, 77.6, 32.6]]
  ];
  const state = { bbox: PRESETS[0][1].slice(), month: null, data: null, divider: 0.5, custom: false };

  /* ---------- the synthetic engine ---------- */
  function simulate(bbox) {
    const [x0, y0, x1, y1] = bbox;
    const inside = PTS.filter((p) => p.lon >= x0 && p.lon <= x1 && p.lat >= y0 && p.lat <= y1);
    const n = inside.length;
    const r = rng(hashStr(bbox.map((v) => Math.round(v)).join(',')));

    // seasonal shape from the fire regions the box overlaps
    const shape = [];
    for (let m = 1; m <= 12; m++) {
      let v = 0;
      if (n >= 4) { for (const p of inside) v += seasonal(m, p.pk, p.sg); v /= n; }
      else v = seasonal(m, (y0 + y1) / 2 < 0 ? 9 : 3.5, 2);
      shape.push(v);
    }
    const mx = Math.max(...shape);
    const mf = shape.map((v) => 0.1 + 0.9 * (v / mx));
    const A = 60 + 40 * n;

    const kBase = 7.6 * (0.85 + 0.3 * r());
    const b = 0.28 * (0.85 + 0.3 * r());
    const bHat = b * 0.93;
    const yearF = {};
    for (let y = 2000; y <= 2026; y++) yearF[y] = Math.exp(0.2 * gauss(r));

    const total = (2026 - 2000) * 12 + 10 - 11 + 1; // Nov 2000 .. Oct 2026
    const events = new Map();
    for (let e = 0; e < 3; e++) events.set(24 + Math.floor(r() * (total - 48)), 1.9 + 0.5 * r());
    for (let e = 0; e < 2; e++) events.set(24 + Math.floor(r() * (total - 48)), 0.4 + 0.1 * r());

    const rows = [];
    let yr = 2000, mo = 11;
    for (let i = 0; i < total; i++) {
      const yy = yr + (mo - 0.5) / 12;
      const h = terraH(yy);
      const season = mf[mo - 1];
      let F = A * season * yearF[yr] * (events.get(i) || 1);
      F = Math.max(0.5, F);
      const kTrue = kBase * (1 + 0.15 * Math.sin((2 * Math.PI * (mo - 3)) / 12));
      const kHat = kTrue * (1 + 0.03 * gauss(r));
      const tn = (F / kTrue) * Math.exp(b * (h - 10.5));
      const T = Math.max(0, Math.round(tn + Math.sqrt(tn) * gauss(r)));
      const hasV = yr >= 2012;
      const V = hasV ? Math.max(0, Math.round(F * (1 + 0.04 * gauss(r)) + Math.sqrt(F) * 0.7 * gauss(r))) : null;
      const corr = kHat * T * Math.exp(-bHat * (h - 10.5));
      const H = hasV ? V : corr;
      const rel = hasV ? 0.04 + 1 / Math.sqrt(V + 1) : 0.07 + 1.2 / Math.sqrt(T + 1);
      rows.push({
        i, yr, mo, date: `${yr}-${String(mo).padStart(2, '0')}`, yy, h,
        T, V, H, lo: Math.max(0, H * (1 - rel)), hi: H * (1 + rel),
        naive: hasV ? V : T, terraK: kHat * T, terraCorr: corr, k: kHat, z: 0, flag: 0
      });
      mo++; if (mo > 12) { mo = 1; yr++; }
    }
    // anomalies: z-score against the same calendar month in other years
    for (let m = 1; m <= 12; m++) {
      const g = rows.filter((x) => x.mo === m);
      if (g.length < 8) continue;
      const mean = d3.mean(g, (x) => x.H), sd = d3.deviation(g, (x) => x.H) || 1;
      g.forEach((x) => { x.z = (x.H - mean) / sd; x.flag = x.z >= 2 ? 1 : x.z <= -2 ? -1 : 0; });
    }
    const mean = (a, b2) => d3.mean(rows.filter((x) => x.yy >= a && x.yy < b2), (x) => x.terraK);
    const meanH = (a, b2) => d3.mean(rows.filter((x) => x.yy >= a && x.yy < b2), (x) => x.H);
    const mean2 = (f, a, b2) => d3.mean(rows.filter((x) => x.yy >= a && x.yy < b2), f);
    const pct = (f) => { const a = mean2(f, 2014, 2020), c = mean2(f, 2022, 2026.9); return a > 0 ? (c / a - 1) * 100 : 0; };
    return { rows, n, A, trendTerra: pct((x) => x.terraK), trendHarm: pct((x) => x.H), inside };
  }

  /* ---------- map ---------- */
  const mapEl = $('#map');
  const mctx = mapEl.getContext('2d');
  const mproj = d3.geoEqualEarth();
  const mpath = d3.geoPath(mproj, mctx);
  let MW = 0, MH = 0, MDPR = 1;
  function sizeMap() {
    MDPR = Math.min(window.devicePixelRatio || 1, 2);
    const w = mapEl.clientWidth || 640;
    MW = w; MH = Math.round(w * 0.5);
    mapEl.width = MW * MDPR; mapEl.height = MH * MDPR; mapEl.style.height = MH + 'px';
    mproj.fitExtent([[6, 6], [MW - 6, MH - 6]], { type: 'Sphere' });
  }
  let drag = null;
  function drawMap() {
    mctx.setTransform(MDPR, 0, 0, MDPR, 0, 0);
    mctx.clearRect(0, 0, MW, MH);
    mctx.fillStyle = '#0d131d'; mctx.beginPath(); mpath({ type: 'Sphere' }); mctx.fill();
    mctx.fillStyle = '#1c242f'; mctx.beginPath(); mpath(land); mctx.fill();
    mctx.strokeStyle = 'rgba(239,231,218,.09)'; mctx.lineWidth = 0.5; mctx.beginPath(); mpath(borders); mctx.stroke();
    // hotspot field, weighted by the selected month (linked view)
    const m = state.month ? state.month.mo : null;
    mctx.fillStyle = 'rgba(255,140,40,.55)'; mctx.beginPath();
    for (const p of PTS) {
      if (m != null && p.u > 0.03 + 0.97 * seasonal(m, p.pk, p.sg)) continue;
      const q = mproj([p.lon, p.lat]); mctx.rect(q[0] - 0.8, q[1] - 0.8, 1.6, 1.6);
    }
    mctx.fill();
    // selection
    const bb = drag ? drag.bbox : state.bbox;
    if (bb) {
      const o = d3.geoGraticule().extent([[bb[0], bb[1]], [bb[2], bb[3]]]).outline();
      mctx.fillStyle = 'rgba(255,122,26,.14)'; mctx.strokeStyle = '#ff7a1a'; mctx.lineWidth = 1.5;
      mctx.beginPath(); mpath(o); mctx.fill(); mctx.stroke();
    }
    mctx.strokeStyle = 'rgba(239,231,218,.2)'; mctx.lineWidth = 1; mctx.beginPath(); mpath({ type: 'Sphere' }); mctx.stroke();
  }
  function evPoint(e) { const r = mapEl.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  mapEl.addEventListener('pointerdown', (e) => {
    const p = evPoint(e); const ll = mproj.invert(p);
    if (!ll) return;
    drag = { p0: ll, bbox: null };
    mapEl.setPointerCapture(e.pointerId);
  });
  mapEl.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const ll = mproj.invert(evPoint(e)); if (!ll) return;
    drag.bbox = [Math.min(drag.p0[0], ll[0]), Math.min(drag.p0[1], ll[1]), Math.max(drag.p0[0], ll[0]), Math.max(drag.p0[1], ll[1])];
    drawMap();
  });
  const endMap = () => {
    if (!drag) return;
    const bb = drag.bbox; drag = null;
    if (bb && bb[2] - bb[0] > 1 && bb[3] - bb[1] > 1) { setBBox(bb.map((v) => +v.toFixed(1)), true); } else drawMap();
  };
  mapEl.addEventListener('pointerup', endMap);
  mapEl.addEventListener('pointercancel', endMap);

  /* ---------- controls ---------- */
  const sel = $('#preset');
  PRESETS.forEach(([n], i) => { const o = document.createElement('option'); o.value = i; o.textContent = n; sel.appendChild(o); });
  const customOpt = document.createElement('option'); customOpt.value = 'c'; customOpt.textContent = 'Custom box'; customOpt.hidden = true; sel.appendChild(customOpt);
  sel.addEventListener('change', () => { if (sel.value !== 'c') setBBox(PRESETS[+sel.value][1].slice(), false); });
  const inputs = { w: $('#b-w'), s: $('#b-s'), e: $('#b-e'), n: $('#b-n') };
  Object.values(inputs).forEach((el) => el.addEventListener('change', () => {
    const bb = [+inputs.w.value, +inputs.s.value, +inputs.e.value, +inputs.n.value];
    if (bb[2] - bb[0] >= 0.5 && bb[3] - bb[1] >= 0.5) setBBox(bb, true);
  }));

  function setBBox(bb, custom) {
    state.bbox = bb; state.month = null;
    if (custom) { const idx = PRESETS.findIndex((p) => p[1].every((v, i) => Math.abs(v - bb[i]) < 0.05)); sel.value = idx >= 0 ? idx : 'c'; }
    else sel.value = String(PRESETS.findIndex((p) => p[1].every((v, i) => v === bb[i])));
    inputs.w.value = bb[0]; inputs.s.value = bb[1]; inputs.e.value = bb[2]; inputs.n.value = bb[3];
    state.data = simulate(bb);
    render(); writeHash();
  }

  /* ---------- render ---------- */
  function render() {
    drawMap(); renderStats(); renderCalendar(); renderSeries(); renderAnoms();
  }

  function renderStats() {
    const d = state.data;
    const f = (v) => (v > 0 ? '+' : '') + v.toFixed(0) + '%';
    const mm = d3.mean(d.rows.filter((x) => x.yr >= 2012), (x) => x.H);
    $('#stats').innerHTML =
      `<div><dt>Fire pixels in the box</dt><dd>${d.n.toLocaleString('en-US')}<small> in the demo field</small></dd></div>` +
      `<div><dt>Typical month, 2012 on</dt><dd>${fmtN(mm)}<small> VIIRS-equivalent</small></dd></div>` +
      `<div class="warn"><dt>Terra alone, 2014–19 → 2022–26</dt><dd>${f(d.trendTerra)}<small> a fake trend</small></dd></div>` +
      `<div class="ok"><dt>Harmonized, same window</dt><dd>${f(d.trendHarm)}<small> no real trend in the demo field</small></dd></div>`;
  }

  const tip = $('#tip');
  function showTip(html, el) {
    tip.innerHTML = html; tip.hidden = false;
    const r = el.getBoundingClientRect();
    const tw = tip.offsetWidth;
    tip.style.left = Math.max(8, Math.min(window.innerWidth - tw - 8, r.left + r.width / 2 - tw / 2)) + 'px';
    tip.style.top = window.scrollY + r.top - tip.offsetHeight - 8 + 'px';
  }
  const hideTip = () => { tip.hidden = true; };

  function renderCalendar() {
    const d = state.data, cal = $('#cal');
    const years = d3.range(2000, 2027);
    const vmax = d3.quantile(d.rows.map((x) => x.H).sort(d3.ascending), 0.98) || 1;
    const col = d3.scaleSequential((t) => d3.interpolateRgbBasis(['#1a1511', '#5b2a10', '#c4510f', '#ff7a1a', '#ffe0a8'])(t)).domain([0, Math.sqrt(vmax)]);
    const byKey = new Map(d.rows.map((x) => [x.yr * 100 + x.mo, x]));
    cal.style.setProperty('--cols', years.length);
    let html = '<div class="c-corner"></div>' + years.map((y) => `<div class="c-yr" role="columnheader">${y % 5 === 0 ? y : ''}</div>`).join('');
    for (let m = 1; m <= 12; m++) {
      html += `<div class="c-mo" role="rowheader">${MONTHS[m - 1]}</div>`;
      years.forEach((y) => {
        const x = byKey.get(y * 100 + m);
        if (!x) { html += '<div class="c-cell empty" role="gridcell"></div>'; return; }
        const sel = state.month && state.month.date === x.date ? ' sel' : '';
        html += `<button type="button" class="c-cell${sel}" role="gridcell" data-d="${x.date}" style="background:${col(Math.sqrt(x.H))}" aria-label="${MONTHS[m - 1]} ${y}: ${fmtN(x.H)} harmonized detections${x.flag ? (x.flag > 0 ? ', unusually high' : ', unusually low') : ''}">${x.flag > 0 ? '<b>▲</b>' : x.flag < 0 ? '<b class="lo">▼</b>' : ''}</button>`;
      });
    }
    cal.innerHTML = html;
    const lg = $('.legend i'); lg.style.background = `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map((t) => col(Math.sqrt(vmax) * t)).join(',')})`;
  }
  $('#cal').addEventListener('click', (e) => {
    const b = e.target.closest('.c-cell[data-d]'); if (!b) return;
    const x = state.data.rows.find((r) => r.date === b.dataset.d);
    state.month = state.month && state.month.date === x.date ? null : x;
    renderCalendar(); drawMap(); drawSeriesMark(); writeHash();
  });
  function calTip(e) {
    const b = e.target.closest('.c-cell[data-d]'); if (!b) { hideTip(); return; }
    const x = state.data.rows.find((r) => r.date === b.dataset.d);
    showTip(`<b>${MONTHS[x.mo - 1]} ${x.yr}</b><br>${fmtN(x.H)} harmonized<br><span class="dim">raw MODIS ${fmtN(x.T)} · ${x.V != null ? 'raw VIIRS ' + fmtN(x.V) : 'VIIRS not flying'}<br>Terra pass ${S.fmtH(x.h)} · z ${x.z.toFixed(1)}</span>`, b);
  }
  $('#cal').addEventListener('mouseover', calTip);
  $('#cal').addEventListener('focusin', calTip);
  $('#cal').addEventListener('mouseleave', hideTip);
  $('#cal').addEventListener('focusout', hideTip);

  /* ---------- before/after series ---------- */
  const svg = d3.select('#series');
  let sc = null;
  function renderSeries() {
    const d = state.data;
    const wrap = $('#series-wrap');
    const w = wrap.clientWidth || 800, h = Math.max(280, Math.min(380, w * 0.38));
    const m = { l: 56, r: 16, t: 14, b: 28 };
    svg.attr('viewBox', `0 0 ${w} ${h}`).attr('width', w).attr('height', h);
    svg.selectAll('*').remove();
    const x = d3.scaleLinear().domain([2000.8, 2026.85]).range([m.l, w - m.r]);
    const ymax = d3.max(d.rows, (r) => Math.max(r.naive, r.hi, r.terraK)) * 1.06 || 1;
    const y = d3.scaleLinear().domain([0, ymax]).range([h - m.b, m.t]).nice();
    sc = { x, y, w, h, m };

    svg.append('g').attr('class', 'grid').selectAll('line').data(y.ticks(5)).join('line')
      .attr('x1', m.l).attr('x2', w - m.r).attr('y1', (t) => y(t)).attr('y2', (t) => y(t));
    svg.append('g').attr('class', 'yaxis').selectAll('text').data(y.ticks(5)).join('text')
      .attr('x', m.l - 8).attr('y', (t) => y(t) + 3).attr('text-anchor', 'end').text((t) => d3.format('~s')(t));
    svg.append('g').attr('class', 'xaxis').selectAll('text').data(d3.range(2000, 2027, 5)).join('text')
      .attr('x', (t) => x(t)).attr('y', h - 8).attr('text-anchor', 'middle').text((t) => t);

    // sensor and drift annotations
    const ann = svg.append('g').attr('class', 'ann');
    [[2012, 'VIIRS starts'], [2020.3, 'drift begins']].forEach(([yv, t]) => {
      ann.append('line').attr('x1', x(yv)).attr('x2', x(yv)).attr('y1', m.t).attr('y2', h - m.b);
      ann.append('text').attr('x', x(yv) + 5).attr('y', m.t + 9).text(t);
    });

    const line = (key, defined) => d3.line().x((r) => x(r.yy)).y((r) => y(r[key])).defined(defined || (() => true));
    // naive layer
    const gN = svg.append('g').attr('clip-path', 'url(#clipL)');
    gN.append('path').attr('class', 'ln naive').attr('d', line('naive')(d.rows));
    gN.append('path').attr('class', 'ln terra').attr('d', line('terraK')(d.rows.filter((r) => r.yr >= 2012)));
    // harmonized layer
    const gH = svg.append('g').attr('clip-path', 'url(#clipR)');
    gH.append('path').attr('class', 'band').attr('d', d3.area().x((r) => x(r.yy)).y0((r) => y(r.lo)).y1((r) => y(r.hi))(d.rows));
    gH.append('path').attr('class', 'ln tc').attr('d', line('terraCorr')(d.rows.filter((r) => r.yr >= 2012)));
    gH.append('path').attr('class', 'ln harm').attr('d', line('H')(d.rows));
    gH.selectAll('circle').data(d.rows.filter((r) => r.flag)).join('circle')
      .attr('class', (r) => 'an ' + (r.flag > 0 ? 'hi' : 'lo')).attr('r', 3.6).attr('cx', (r) => x(r.yy)).attr('cy', (r) => y(r.H));

    const defs = svg.append('defs');
    defs.append('clipPath').attr('id', 'clipL').append('rect').attr('id', 'cl').attr('y', 0).attr('height', h);
    defs.append('clipPath').attr('id', 'clipR').append('rect').attr('id', 'cr').attr('y', 0).attr('height', h);

    svg.append('g').attr('id', 'selmark');
    // divider
    const dv = svg.append('g').attr('id', 'divider').attr('tabindex', 0).attr('role', 'slider')
      .attr('aria-label', 'Before and after divider').attr('aria-valuemin', 0).attr('aria-valuemax', 100);
    dv.append('line').attr('y1', 0).attr('y2', h);
    dv.append('rect').attr('x', -16).attr('y', h / 2 - 15).attr('width', 32).attr('height', 30).attr('rx', 15);
    dv.append('path').attr('d', `M -6 ${h / 2 - 5} l -5 5 l 5 5 M 6 ${h / 2 - 5} l 5 5 l -5 5`);
    placeDivider();
    drawSeriesMark();
  }
  function placeDivider() {
    const px = sc.m.l + state.divider * (sc.w - sc.m.l - sc.m.r);
    svg.select('#cl').attr('x', 0).attr('width', px);
    svg.select('#cr').attr('x', px).attr('width', sc.w - px);
    svg.select('#divider').attr('transform', `translate(${px},0)`).attr('aria-valuenow', Math.round(state.divider * 100));
    const lab = $('.ba-labels').children;
    lab[0].style.opacity = state.divider > 0.12 ? 1 : 0.2;
    lab[1].style.opacity = state.divider < 0.88 ? 1 : 0.2;
  }
  function drawSeriesMark() {
    const g = svg.select('#selmark'); g.selectAll('*').remove();
    if (!state.month || !sc) return;
    const px = sc.x(state.month.yy);
    g.append('line').attr('x1', px).attr('x2', px).attr('y1', sc.m.t).attr('y2', sc.h - sc.m.b);
    g.append('circle').attr('r', 5).attr('cx', px).attr('cy', sc.y(state.month.H));
  }
  (function dividerDrag() {
    const el = $('#series-wrap'); let on = false;
    const set = (cx) => {
      const r = el.getBoundingClientRect();
      const p = (cx - r.left - sc.m.l) / (sc.w - sc.m.l - sc.m.r);
      state.divider = Math.max(0, Math.min(1, p)); placeDivider();
    };
    el.addEventListener('pointerdown', (e) => { if (!e.target.closest('svg')) return; on = true; el.setPointerCapture(e.pointerId); set(e.clientX); });
    el.addEventListener('pointermove', (e) => { if (on) set(e.clientX); });
    el.addEventListener('pointerup', () => { on = false; });
    el.addEventListener('keydown', (e) => {
      if (!e.target.closest('#divider')) return;
      const s = e.shiftKey ? 0.1 : 0.03;
      if (e.key === 'ArrowLeft') { state.divider = Math.max(0, state.divider - s); placeDivider(); e.preventDefault(); }
      if (e.key === 'ArrowRight') { state.divider = Math.min(1, state.divider + s); placeDivider(); e.preventDefault(); }
    });
  })();

  /* ---------- anomalies ---------- */
  function renderAnoms() {
    const list = state.data.rows.filter((r) => r.flag).sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 8);
    $('#anoms').innerHTML = list.length
      ? list.map((r) => `<li><button type="button" data-d="${r.date}"><span class="${r.flag > 0 ? 'up' : 'dn'}">${r.flag > 0 ? '▲ high' : '▼ low'}</span> ${MONTHS[r.mo - 1]} ${r.yr}<em>${fmtN(r.H)} · z ${r.z.toFixed(1)}</em></button></li>`).join('')
      : '<li class="dim">No months pass the |z| ≥ 2 test in this area.</li>';
  }
  $('#anoms').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-d]'); if (!b) return;
    state.month = state.data.rows.find((r) => r.date === b.dataset.d);
    renderCalendar(); drawMap(); drawSeriesMark(); writeHash();
    $('#cal').scrollIntoView({ block: 'center', behavior: 'smooth' });
  });

  /* ---------- CSV ---------- */
  function csv(rows, cols) {
    const q = (v) => (typeof v === 'string' && /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
    return [cols.join(',')].concat(rows.map((r) => cols.map((c) => q(r[c] == null ? '' : r[c])).join(','))).join('\n');
  }
  function save(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  const tag = () => state.bbox.map((v) => Math.round(v)).join('_');
  $('#dl-month').addEventListener('click', () => {
    const bb = state.bbox.join(' ');
    const rows = state.data.rows.map((r) => ({
      area_bbox_w_s_e_n: bb, month: r.date,
      raw_modis_terra: r.T, raw_viirs: r.V, harmonized: Math.round(r.H),
      uncertainty_low: Math.round(r.lo), uncertainty_high: Math.round(r.hi),
      anomaly_z: r.z.toFixed(2), anomaly_flag: r.flag, terra_pass_local_h: r.h.toFixed(2), data_status: 'synthetic_demo'
    }));
    save(`sundial_monthly_${tag()}.csv`, csv(rows, Object.keys(rows[0])));
    toast('Saved the monthly table. Rows are marked synthetic_demo.');
  });
  $('#dl-hot').addEventListener('click', () => {
    const d = state.data;
    const months = state.month ? [state.month.mo] : [8, 9, 10];
    const rows = [];
    const r = rng(hashStr('hot' + tag()));
    d.inside.slice(0, 1500).forEach((p) => {
      months.forEach((m) => {
        if (p.u > 0.03 + 0.97 * seasonal(m, p.pk, p.sg)) return;
        const raw = r() < 0.5 ? 'Terra' : 'Aqua';
        rows.push({
          latitude: p.lat.toFixed(3), longitude: p.lon.toFixed(3), satellite: raw, month_of_year: m,
          frp_mw: (p.i * 60).toFixed(1), daynight: 'D', type: 0,
          harmonized_weight: (7.6 * Math.exp(-0.28 * (raw === 'Terra' ? -0.83 : 0.3)) * (0.9 + 0.2 * r())).toFixed(2),
          data_status: 'synthetic_demo'
        });
      });
    });
    if (!rows.length) { toast('No demo hotspots fall inside this box.'); return; }
    save(`sundial_hotspots_${tag()}.csv`, csv(rows, Object.keys(rows[0])));
    toast(`Saved ${rows.length.toLocaleString('en-US')} demo hotspots with a harmonized_weight column.`);
  });
  const toastEl = $('#toast'); let tt;
  function toast(t) { toastEl.textContent = t; clearTimeout(tt); tt = setTimeout(() => (toastEl.textContent = ''), 5000); }

  /* ---------- share links ---------- */
  function writeHash() {
    const h = `#area=${state.bbox.join(',')}` + (state.month ? `&m=${state.month.date}` : '');
    try { history.replaceState(null, '', h); } catch (e) { /* file:// or sandbox */ }
  }
  $('#copy').addEventListener('click', async () => {
    writeHash();
    try { await navigator.clipboard.writeText(location.href); toast('Link copied. It saves the area and month.'); }
    catch (e) { toast('Copy failed. The address bar now holds the link.'); }
  });
  function readHash() {
    const m = /area=(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)/.exec(location.hash);
    if (!m) return null;
    const bb = m.slice(1, 5).map(Number);
    if (bb.some(isNaN) || bb[2] <= bb[0] || bb[3] <= bb[1]) return null;
    const mm = /m=(\d{4}-\d{2})/.exec(location.hash);
    return { bb, month: mm && mm[1] };
  }

  /* ---------- boot ---------- */
  function boot() {
    sizeMap();
    const h = readHash();
    setBBox(h ? h.bb : PRESETS[0][1].slice(), !!h);
    if (h && h.month) { state.month = state.data.rows.find((r) => r.date === h.month) || null; renderCalendar(); drawMap(); drawSeriesMark(); }
  }
  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { sizeMap(); render(); }, 120); });
  boot();
})();
