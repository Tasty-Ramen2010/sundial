/* Search and provenance labels shared by the entry form and country views. */
(function (root) {
  'use strict';
  const normalize = (v) => String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_’']/g, ' ').replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase();
  const aliases = { usa: 'United_States', us: 'United_States', uk: 'United_Kingdom', 'south korea': 'Republic_of_Korea', 'north korea': 'Dem_Rep_Korea', russia: 'Russian_Federation', laos: 'Lao_PDR' };
  function matchCountries(countries, query) {
    const term = normalize(query);
    if (!term) return [];
    const exact = countries.filter((c) => normalize(c.name) === term || normalize(c.id) === term || c.id === aliases[term]);
    return exact.length ? exact : countries.filter((c) => normalize(c.name).includes(term) || normalize(c.id).includes(term));
  }
  function sourceLabel(code) {
    return { modis: 'Harmonized MODIS', snpp: 'Suomi NPP VIIRS', noaa20: 'NOAA-20 VIIRS', noaa21: 'NOAA-21 VIIRS' }[code] || (code ? String(code) : 'Not recorded');
  }
  const api = { matchCountries, sourceLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CATALOG = api;
})(typeof window === 'undefined' ? globalThis : window);
