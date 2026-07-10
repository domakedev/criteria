import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, normalizeWord, semanticOverlap, fuzzyEqual } from '../src/semantics.js';

test('accents are ignored: decisión === decision', () => {
  assert.equal(normalizeWord('decisión'), normalizeWord('decision'));
});

test('plurals collapse: equipos === equipo', () => {
  assert.equal(normalizeWord('equipos'), normalizeWord('equipo'));
});

test('reflexive verbs collapse: cambiarme === cambiar', () => {
  assert.equal(normalizeWord('cambiarme'), normalizeWord('cambiar'));
});

test('synonyms map to the same token: jefe === líder, empleo === trabajo', () => {
  assert.equal(normalizeWord('jefe'), normalizeWord('líder'));
  assert.equal(normalizeWord('empleo'), normalizeWord('trabajo'));
  assert.equal(normalizeWord('sueldo'), normalizeWord('plata'));
});

test('different meanings stay different: jefe !== trabajo', () => {
  assert.notEqual(normalizeWord('jefe'), normalizeWord('trabajo'));
});

test('tokenize drops stopwords and short words', () => {
  const t = tokenize('debería dejar mi trabajo por mi jefe');
  assert.ok(!t.has('por'));
  assert.ok(!t.has('mi'));
  // "dejar" is not a synonym here, but trabajo/jefe are meaningful
  assert.ok(t.has(normalizeWord('trabajo')));
  assert.ok(t.has(normalizeWord('jefe')));
});

test('fuzzyEqual catches a one-letter typo on long words', () => {
  assert.ok(fuzzyEqual('trabjo', 'trabajo'));
  assert.ok(!fuzzyEqual('sol', 'sal')); // too short to risk it
});

test('semanticOverlap: synonyms and typos count as matches', () => {
  const a = tokenize('debería renunciar a mi empleo por mi líder');
  const b = tokenize('renuncié a mi trabajo por culpa de mi jefe');
  // empleo≈trabajo, líder≈jefe, renunciar≈renuncié → strong overlap
  assert.ok(semanticOverlap(a, b) >= 3);
});
