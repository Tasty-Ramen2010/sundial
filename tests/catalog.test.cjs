const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { matchCountries, sourceLabel } = require('../js/catalog.js');
const countries = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/meta.json'))).countries;

test('country search resolves case, whitespace, diacritics, identifiers and common aliases', () => {
  for (const [query, id] of [[' angola ', 'Angola'], ['USA', 'United_States'], ['uk', 'United_Kingdom'], ['south korea', 'Republic_of_Korea'], ['Russian_Federation', 'Russian_Federation'], ['cote d ivoire', 'Cote_d_Ivoire']]) {
    const matches = matchCountries(countries, query);
    assert.equal(matches.length, 1, query);
    assert.equal(matches[0].id, id, query);
  }
  assert.equal(matchCountries([{ id: 'Example', name: 'Côte' }], 'cote')[0].id, 'Example');
});

test('ambiguous or unknown searches do not silently choose a country', () => {
  assert.ok(matchCountries(countries, 'guin').length > 1);
  // Exact names take precedence, even when other names contain the same word.
  assert.equal(matchCountries(countries, 'Guinea').length, 1);
  assert.ok(matchCountries(countries, 'united').length > 1);
  assert.deepEqual(matchCountries(countries, ''), []);
  assert.deepEqual(matchCountries(countries, 'Atlantis'), []);
});

test('provenance labels preserve unknown sources rather than inventing a platform', () => {
  assert.equal(sourceLabel('modis'), 'Harmonized MODIS');
  assert.equal(sourceLabel('snpp'), 'Suomi NPP VIIRS');
  assert.equal(sourceLabel(null), 'Not recorded');
  assert.equal(sourceLabel('new_source'), 'new_source');
});
