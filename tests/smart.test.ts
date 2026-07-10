import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStore } from '../src/store.js';
import { createCase } from '../src/ingest.js';
import { askSmart } from '../src/smart.js';
import { cosine, type Embedder } from '../src/embeddings.js';
import type { CaseDraft } from '../src/types.js';

function freshStore(): FileStore {
  return new FileStore(mkdtempSync(join(tmpdir(), 'criteria-')));
}

/**
 * Stub "AI": maps texts onto 3 meaning axes (work, money, health) by keyword,
 * so tests are deterministic and never download a model.
 */
const AXES: Array<[RegExp, number]> = [
  [/oficio|carrera|laboral|ocupacion|empleo|trabajo|chamba/i, 0],
  [/finanzas|ahorro|sueldo|plata|dinero|economia/i, 1],
  [/salud|dormir|estres|cuerpo|medico/i, 2],
];
function fakeVector(text: string): number[] {
  const v = [0.01, 0.01, 0.01];
  for (const [re, axis] of AXES) if (re.test(text)) v[axis]! += 1;
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return v.map((x) => x / norm);
}
function stubEmbedder(): Embedder & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    async embed(texts: string[]): Promise<number[][]> {
      calls.push(texts);
      return texts.map(fakeVector);
    },
  };
}

function draft(overrides: Partial<CaseDraft> = {}): CaseDraft {
  return {
    situation: 'No sabia si aceptar mas responsabilidad en mi ocupacion actual',
    context: { domain: 'trabajo', tags: [] },
    lenses: [{ name: 'estres', weight: 'high', reading: 'mi nivel de estres' }],
    decision: 'Aceptar solo la mitad de las tareas nuevas',
    reason: 'cuidar mi salud primero',
    doubt: 'medium',
    author: 'yo',
    layer: 'personal',
    ...overrides,
  };
}

test('finds a case by MEANING when zero words overlap', async () => {
  const store = freshStore();
  store.save(createCase(draft()));
  // query shares an axis (work) but no meaningful word with the stored case
  const result = await askSmart(store, { situation: 'dudas sobre mi carrera' }, stubEmbedder());
  assert.equal(result.mode, 'semantic');
  assert.ok(result.matchedCases.length >= 1);
});

test('unrelated meaning stays unmatched — no invented matches', async () => {
  const store = freshStore();
  store.save(createCase(draft()));
  const result = await askSmart(store, { situation: 'finanzas del hogar y ahorro' }, stubEmbedder());
  // money axis vs work/health case → below floor, and no shared words
  assert.equal(result.matchedCases.length, 0);
  assert.equal(result.confidence, 'none');
});

test('embedder null → clean lexical fallback', async () => {
  const store = freshStore();
  store.save(createCase(draft()));
  const result = await askSmart(store, { situation: 'aceptar mas responsabilidad en mi ocupacion' }, null);
  assert.equal(result.mode, 'lexical');
  assert.ok(result.matchedCases.length >= 1);
});

test('a failing embedder never breaks the answer', async () => {
  const store = freshStore();
  store.save(createCase(draft()));
  const broken: Embedder = {
    embed() {
      return Promise.reject(new Error('boom'));
    },
  };
  const result = await askSmart(store, { situation: 'responsabilidad en mi ocupacion' }, broken);
  assert.equal(result.mode, 'lexical');
});

test('case vectors are cached on disk: second ask only embeds the query', async () => {
  const store = freshStore();
  store.save(createCase(draft()));
  const embedder = stubEmbedder();
  await askSmart(store, { situation: 'dudas sobre mi carrera' }, embedder);
  assert.ok(existsSync(join(store.root, '.embeddings-cache.json')));
  const callsAfterFirst = embedder.calls.length;
  await askSmart(store, { situation: 'otra duda de mi oficio' }, embedder);
  const newCalls = embedder.calls.slice(callsAfterFirst);
  // only one embed call for the new query, with a single text
  assert.equal(newCalls.length, 1);
  assert.equal(newCalls[0]!.length, 1);
});

test('cosine of identical normalized vectors is 1', () => {
  const v = fakeVector('mi trabajo y mi salud');
  assert.ok(Math.abs(cosine(v, v) - 1) < 1e-9);
});
