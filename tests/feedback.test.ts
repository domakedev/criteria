import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStore } from '../src/store.js';
import { createCase } from '../src/ingest.js';
import { recordOutcome, trackRecord } from '../src/feedback.js';
import type { CaseDraft } from '../src/types.js';

function freshStore(): FileStore {
  return new FileStore(mkdtempSync(join(tmpdir(), 'criteria-')));
}

const baseDraft: CaseDraft = {
  situation: 'Should I do X?',
  context: { domain: 'testing', tags: ['x'] },
  lenses: [{ name: 'risk', weight: 'medium', reading: 'manageable' }],
  decision: 'Do X',
  reason: 'because',
  doubt: 'medium',
  expectation: 'X works fine',
  author: 'tester',
};

test('recordOutcome closes the loop and echoes the expectation', () => {
  const store = freshStore();
  const c = createCase(baseDraft);
  store.save(c);
  const report = recordOutcome(store, c.id, 'good', 'it worked');
  assert.equal(report.updated.outcome.status, 'good');
  assert.equal(report.expectation, 'X works fine');
  assert.equal(store.load(c.id)?.outcome.note, 'it worked');
  assert.ok(store.load(c.id)?.outcome.recordedAt);
});

test('recordOutcome on unknown case throws', () => {
  assert.throws(() => recordOutcome(freshStore(), 'case-nope', 'good'), /not found/);
});

test('trackRecord computes reliability from resolved cases only', () => {
  const store = freshStore();
  const a = createCase(baseDraft);
  const b = createCase(baseDraft);
  const c = createCase(baseDraft);
  [a, b, c].forEach((x) => store.save(x));
  recordOutcome(store, a.id, 'good');
  recordOutcome(store, b.id, 'bad');
  const record = trackRecord(store);
  assert.equal(record.total, 3);
  assert.equal(record.good, 1);
  assert.equal(record.bad, 1);
  assert.equal(record.pending, 1);
  assert.equal(record.reliability, 0.5);
});

test('empty store has null reliability — no fake confidence', () => {
  assert.equal(trackRecord(freshStore()).reliability, null);
});
