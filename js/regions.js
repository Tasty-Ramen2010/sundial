/* Regional season explorer. Spatial averages never stand in for historical observations. */
(function () {
  'use strict';
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const S = window.SEASON, D = window.DATA, D3 = window.d3;
  const number = (v) => v == null ? 'Unavailable' : Math.round(v).toLocaleString('en-US');
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const peakText = (p) => p.top.length ? p.top.map((m) => M[m.month - 1]).join(' · ') : 'No seasonal estimate';
  function bars(months, selected) {
    const max = Math.max(...months.map((m) => m.mean || 0), 1);
    return `<div class="season-bars" aria-label="Average detections by calendar month">${months.map((m) => `<div class="season-month ${m.month === selected ? 'selected' : ''}"><span>${number(m.mean)}</span><i style="height:${Math.max(1, (m.mean || 0) / max * 100)}%"></i><b>${M[m.month - 1]}</b></div>`).join('')}</div>`;
  }
  function countrySummary(series, country, idx) {
    const months = S.profile(series), p = S.peaks(months), comparison = S.compare(series, idx);
    const score = D.score[country.id] || {}, err = score['V1_holdout.monthly_median_abs_err_pct'];
    const gap = score['V2_terra_drift.gap_closed_pct'], failed = gap != null && gap <= 0;
    const tier = { measured: 'Locally fitted', blended: 'Partly borrowed', borrowed: 'Borrowed' }[country.tier] || 'Unassessed';
    const delta = comparison.pct == null ? 'Not enough baseline data' : `${Math.abs(comparison.pct).toFixed(0)}% ${comparison.pct < 0 ? 'below' : 'above'} typical`;
    return `<h3 class="gh">Fire season · ${esc(country.name)}<span class="gr">Country summary</span></h3>
      <div class="season-metrics"><div><span>Typical busiest months</span><strong>${peakText(p)}</strong><small>${p.share == null ? 'Insufficient data' : `${Math.round(p.share * 100)}% of typical annual detections in these three months`}</small></div>
      <div><span>${M[series.months[idx] % 100 - 1]} ${Math.floor(series.months[idx] / 100)} versus baseline</span><strong>${delta}</strong><small>${comparison.n} other years · same-month mean ${number(comparison.mean)}</small></div>
      <div><span>Calibration basis</span><strong>${tier}</strong><small>${err == null ? 'No monthly holdout error available.' : `${err.toFixed(1)}% median monthly error on held-out 2016–2019 data.`}${failed ? ' Drift correction did not improve this country.' : ''}</small></div></div>
      ${bars(months, series.months[idx] % 100)}
      <p class="note">Seasonal baseline: 2012–2025. The comparison excludes the selected year; at least three other years are required. Busiest months can be separate seasons. Historical detections describe burning activity, not a forecast.</p>`;
  }
  function mount(container, country, onChange, initialBox) {
    let box = null, request = 0;
    container.innerHTML = `<h3 class="gh">Explore a local fire season<span class="gr">Regional view</span></h3>
      <p>Draw a box on the map, or enter its coordinates. See which months historically have the most burning activity in that area.</p>
      <svg class="region-map" id="region-map" viewBox="0 0 640 280" role="img" aria-label="Map of ${esc(country.name)}. Drag a rectangle to select an area; coordinate fields below provide a keyboard alternative."></svg>
      <form id="region-form"><div class="region-coordinates">${[['West', -180, 180], ['South', -90, 90], ['East', -180, 180], ['North', -90, 90]].map(([name, min, max]) => `<label>${name} (°)<input name="${name.toLowerCase()}" type="number" min="${min}" max="${max}" step="any" required></label>`).join('')}</div>
      <div class="region-actions"><button class="btn" type="submit">Show this area</button><button class="btn ghost" id="region-reset" type="button">Clear selection</button><span id="region-bounds"></span></div></form>
      <p id="region-error" class="region-error" role="alert"></p>
      <div id="region-results" role="status" aria-live="polite"><p class="note">Select an area to reveal its seasonal profile. The country history below stays separate.</p></div>`;
    const $ = (q) => container.querySelector(q), svg = $('#region-map');
    const projection = D3.geoIdentity().reflectY(true).fitExtent([[24, 20], [616, 260]], D.features[country.id]);
    const path = D3.geoPath(projection);
    D3.select(svg).append('g').attr('class', 'region-land').selectAll('path').data(Object.values(D.lite)).join('path').attr('d', path);
    D3.select(svg).append('path').attr('class', 'region-country').attr('d', path(D.features[country.id]));
    // The SVG viewport clips neighboring countries outside the current view.
    const rect = D3.select(svg).append('rect').attr('class', 'region-selection').attr('visibility', 'hidden');
    D3.select(svg).append('text').attr('x', 16).attr('y', 22).attr('class', 'region-map-label').text('Drag to select · 0.5° grid');
    function draw(b) {
      if (!b) { rect.attr('visibility', 'hidden'); return; }
      const a = projection([b[0], b[3]]), z = projection([b[2], b[1]]);
      rect.attr('visibility', 'visible').attr('x', a[0]).attr('y', a[1]).attr('width', z[0] - a[0]).attr('height', z[1] - a[1]);
    }
    function inputs(b) { ['west', 'south', 'east', 'north'].forEach((key, i) => { $('#region-form').elements[key].value = b[i]; }); }
    function renderSeason(result) {
      const p = S.peaks(result.months);
      return `<h4>Selected area · seasonal average</h4><div class="season-metrics"><div><span>Typical busiest months</span><strong>${peakText(p)}</strong><small>${p.share == null ? 'No retained fire cells in this box.' : `${Math.round(p.share * 100)}% of this area’s retained annual average`}</small></div><div><span>Spatial coverage</span><strong>${number(result.cells)} grid cells</strong><small>Cells selected by their centers. Values are rounded seasonal averages.</small></div><div><span>Regional calibration confidence</span><strong>Not assessed</strong><small>Country validation is not a regional accuracy estimate.</small></div></div>${result.cells ? bars(result.months) : ''}
      <p class="note">NASA FIRMS-derived 2012–2025 average, on a 0.5° grid (about 56 km north–south). The published grid omits cells whose busiest month averages fewer than four detections, so totals are approximate and a blank area does not mean no fire. A box includes all retained cells inside it, including across national borders.</p>`;
    }
    async function apply(b) {
      $('#region-error').textContent = '';
      if (!S.bounds(b)) { draw(box); $('#region-error').textContent = 'Enter west < east and south < north. Use longitudes from −180 to 180 and latitudes from −90 to 90. Split areas crossing the date line into two boxes.'; return; }
      box = b; inputs(b); draw(b); onChange(b);
      const stamp = ++request, result = S.regional(D.climo, b);
      $('#region-bounds').textContent = b.map((n) => n.toFixed(2) + '°').join(' / ');
      $('#region-results').innerHTML = renderSeason(result) + '<div id="region-history"><p class="note">Checking for regional historical observations…</p></div>';
      const history = $('#region-history');
      try {
        const response = await fetch(`/api/region?bbox=${b.join(',')}`);
        if (!response.ok) throw new Error('No regional API');
        const data = await response.json();
        if (stamp !== request) return;
        if (!data.history) { history.innerHTML = `<p class="region-availability">${data.reason === 'outside_historical_coverage' ? 'This box is outside the loaded historical coverage.' : 'Regional monthly observations are not loaded.'} Unusual months and a year-by-year regional calendar are unavailable; the profile above is a seasonal average. The country record below has observed monthly history.</p>`; return; }
        renderHistory(history, data.history);
      } catch (_) {
        if (stamp === request) history.innerHTML = '<p class="region-availability">Regional historical observations are unavailable here. The profile above is a seasonal average; use the country record below for observed monthly history.</p>';
      }
    }
    function renderHistory(el, history) {
      const valid = history.months.map((ym, i) => ({ ym, i, value: history.harm[i], comparison: S.compare(history, i) })).filter((r) => Number.isFinite(r.value));
      const unusual = valid.filter((r) => r.comparison.pct != null).sort((a, b) => Math.abs(b.comparison.pct) - Math.abs(a.comparison.pct)).slice(0, 5);
      el.innerHTML = `<h4>Regional monthly observations</h4><p class="note">${esc(history.unit)} · ${esc(history.provenance)}. Missing observations stay blank. Regional uncertainty has not been assessed.</p>
        <div class="region-history-scroll"><table class="region-history"><caption>Highest departures from the same-month 2012–2025 baseline (selected year excluded)</caption><thead><tr><th>Month</th><th>Detections</th><th>Versus typical</th></tr></thead><tbody>${unusual.length ? unusual.map((r) => `<tr><td>${M[r.ym % 100 - 1]} ${Math.floor(r.ym / 100)}</td><td>${number(r.value)}</td><td>${r.comparison.pct > 0 ? '+' : ''}${r.comparison.pct.toFixed(0)}%</td></tr>`).join('') : '<tr><td colspan="3">At least three other years are needed to compare a month.</td></tr>'}</tbody></table>
        <table class="region-history"><caption>Regional burning calendar · observed monthly detections</caption><thead><tr><th>Year</th>${M.map((m) => `<th>${m}</th>`).join('')}</tr></thead><tbody>${Array.from(new Set(history.months.map((ym) => Math.floor(ym / 100)))).map((y) => `<tr><th>${y}</th>${M.map((_, mo) => { const i = history.months.indexOf(y * 100 + mo + 1); return `<td>${i < 0 || history.harm[i] == null ? '—' : number(history.harm[i])}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>
        <button type="button" class="btn ghost" id="region-download">Download regional monthly CSV</button>`;
      el.querySelector('#region-download').addEventListener('click', () => {
        const text = 'month,harmonized_detections\n' + history.months.map((ym, i) => `${Math.floor(ym / 100)}-${String(ym % 100).padStart(2, '0')},${history.harm[i] == null ? '' : history.harm[i]}`).join('\n');
        const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' })), a = document.createElement('a');
        a.href = url; a.download = `sundial_region_${box.join('_')}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
      });
    }
    $('#region-form').addEventListener('submit', (e) => { e.preventDefault(); apply(['west', 'south', 'east', 'north'].map((key) => $('#region-form').elements[key].valueAsNumber)); });
    $('#region-reset').addEventListener('click', () => { box = null; request++; draw(null); inputs(country.bbox); onChange(null); $('#region-bounds').textContent = ''; $('#region-error').textContent = ''; $('#region-results').innerHTML = '<p class="note">Select an area to reveal its seasonal profile. The country history below stays separate.</p>'; });
    let start = null;
    function point(e) { const r = svg.getBoundingClientRect(); return [Math.max(0, Math.min(640, (e.clientX - r.left) / r.width * 640)), Math.max(0, Math.min(280, (e.clientY - r.top) / r.height * 280))]; }
    function rectangle(a, b) { const p = projection.invert(a), q = projection.invert(b); return [Math.max(-180, Math.min(p[0], q[0])), Math.max(-90, Math.min(p[1], q[1])), Math.min(180, Math.max(p[0], q[0])), Math.min(90, Math.max(p[1], q[1]))].map((n) => Math.round(n * 10000) / 10000); }
    svg.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; start = point(e); svg.setPointerCapture(e.pointerId); });
    svg.addEventListener('pointermove', (e) => { if (start) draw(rectangle(start, point(e))); });
    svg.addEventListener('pointerup', (e) => { if (!start) return; const end = point(e), first = start; start = null; if (Math.hypot(first[0] - end[0], first[1] - end[1]) > 5) apply(rectangle(first, end)); else draw(box); });
    svg.addEventListener('pointercancel', () => { start = null; draw(box); });
    inputs(country.bbox);
    if (initialBox) apply(initialBox);
    return { bounds: () => box };
  }
  window.REGIONS = { countrySummary, mount };
})();
