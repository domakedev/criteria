import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStore } from '../src/store.js';
import { createCase } from '../src/ingest.js';
import type { CaseDraft } from '../src/types.js';

function draft(overrides: Partial<CaseDraft> = {}): CaseDraft {
  return {
    situation: 'Should I do X?',
    context: { domain: 'testing', tags: ['x'] },
    lenses: [{ name: 'risk', weight: 'high', reading: 'low risk' }],
    decision: 'Do X',
    reason: 'because',
    doubt: 'low',
    author: 'tester',
    ...overrides,
  };
}

function freshStore(): FileStore {
  return new FileStore(mkdtempSync(join(tmpdir(), 'criteria-')));
}

test('save + load round-trip', () => {
  const store = freshStore();
  const saved = createCase(draft());
  store.save(saved);
  const loaded = store.load(saved.id);
  assert.deepEqual(loaded, saved);
});

test('layers are kept separate and both are listed', () => {
  const store = freshStore();
  store.save(createCase(draft({ layer: 'personal' })));
  store.save(createCase(draft({ layer: 'community' })));
  assert.equal(store.listCases().length, 2);
  assert.equal(store.listCases({ layer: 'personal' }).length, 1);
  assert.equal(store.listCases({ layer: 'community' }).length, 1);
});

test('filter by domain and tag', () => {
  const store = freshStore();
  store.save(createCase(draft({ context: { domain: 'medicine', tags: ['triage'] } })));
  store.save(createCase(draft()));
  assert.equal(store.listCases({ domain: 'medicine' }).length, 1);
  assert.equal(store.listCases({ tag: 'triage' }).length, 1);
  assert.deepEqual(store.listDomains(), ['medicine', 'testing']);
});

test('promote moves a personal case to the community layer', () => {
  const store = freshStore();
  const personal = createCase(draft({ layer: 'personal' }));
  store.save(personal);
  const promoted = store.promote(personal.id);
  assert.equal(promoted.layer, 'community');
  assert.equal(store.listCases({ layer: 'community' }).length, 1);
});
