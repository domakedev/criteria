import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCase, validateDraft } from '../src/ingest.js';
import type { CaseDraft } from '../src/types.js';

const validDraft: CaseDraft = {
  situation: 'Should I do X or Y?',
  context: { domain: 'software-development', tags: ['x', 'y'] },
  lenses: [{ name: 'delivery-time', weight: 'high', reading: 'due tomorrow' }],
  decision: 'Do X',
  reason: 'cheaper and reversible',
  doubt: 'low',
  expectation: 'nothing breaks',
  author: 'tester',
};

test('a valid draft passes validation', () => {
  assert.deepEqual(validateDraft(validDraft), []);
});

test('a draft without lenses is rejected — criterion needs points of view', () => {
  const errors = validateDraft({ ...validDraft, lenses: [] });
  assert.ok(errors.some((e) => e.includes('lens')));
});

test('missing provenance (author) is rejected', () => {
  const errors = validateDraft({ ...validDraft, author: '' });
  assert.ok(errors.some((e) => e.includes('author')));
});

test('createCase fills id, timestamps, pending outcome and defaults to personal layer', () => {
  const c = createCase(validDraft);
  assert.match(c.id, /^case-[a-z0-9-]+$/);
  assert.equal(c.outcome.status, 'pending');
  assert.equal(c.layer, 'personal');
  assert.ok(c.createdAt);
  assert.equal(c.expectation, 'nothing breaks');
});

test('createCase throws on invalid draft', () => {
  assert.throws(() => createCase({ ...validDraft, decision: '' }), /decision/);
});
