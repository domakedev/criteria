import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStore } from '../src/store.js';
import { createCase } from '../src/ingest.js';
import { ask } from '../src/query.js';
import { recordOutcome } from '../src/feedback.js';
import type { CaseDraft } from '../src/types.js';

function freshStore(): FileStore {
  return new FileStore(mkdtempSync(join(tmpdir(), 'criteria-')));
}

const refactorDraft: CaseDraft = {
  situation: 'Should I refactor this messy module or deliver the ticket?',
  context: { domain: 'software-development', tags: ['refactor', 'deadline'] },
  lenses: [
    { name: 'delivery-time', weight: 'high', reading: 'ticket due today' },
    { name: 'personal-state', weight: 'low', reading: 'tired' },
  ],
  decision: 'Deliver as-is, log tech debt',
  reason: 'cost does not justify benefit',
  doubt: 'low',
  expectation: 'no bugs',
  author: 'tester',
  layer: 'community',
};

test('cold start: empty store answers "teach me", never invents', () => {
  const guidance = ask(freshStore(), { situation: 'should I rewrite everything?' });
  assert.equal(guidance.confidence, 'none');
  assert.equal(guidance.suggestion, undefined);
  assert.equal(guidance.matchedCases.length, 0);
  assert.match(guidance.message, /learn/i);
});

test('finds analogous cases and returns provenance', () => {
  const store = freshStore();
  const stored = createCase(refactorDraft);
  store.save(stored);
  const guidance = ask(store, {
    situation: 'refactor now or deliver the ticket?',
    domain: 'software-development',
    tags: ['refactor'],
  });
  assert.notEqual(guidance.confidence, 'none');
  assert.equal(guidance.matchedCases[0]?.id, stored.id);
  assert.equal(guidance.matchedCases[0]?.author, 'tester');
  assert.ok(guidance.suggestion);
  assert.equal(guidance.suggestion?.decision, 'Deliver as-is, log tech debt');
  assert.deepEqual(guidance.suggestion?.basedOn, [stored.id]);
});

test('lens salience emerges from cases', () => {
  const store = freshStore();
  store.save(createCase(refactorDraft));
  const guidance = ask(store, {
    situation: 'refactor or deliver?',
    tags: ['refactor'],
  });
  const [top] = guidance.topLenses;
  assert.equal(top?.name, 'delivery-time'); // declared high > low
  assert.ok((top?.score ?? 0) > 0);
});

test('cases that went bad become warnings, never suggestions', () => {
  const store = freshStore();
  const badCase = createCase({
    ...refactorDraft,
    situation: 'Rewrite the legacy module from scratch under deadline?',
    context: { domain: 'software-development', tags: ['rewrite', 'deadline'] },
    decision: 'Rewrite from scratch in the sprint',
  });
  store.save(badCase);
  recordOutcome(store, badCase.id, 'bad', 'missed deadline, new bugs');
  const guidance = ask(store, {
    situation: 'rewrite the module from scratch before the deadline?',
    tags: ['rewrite'],
  });
  assert.equal(guidance.warnings.length, 1);
  assert.equal(guidance.warnings[0]?.caseId, badCase.id);
  assert.equal(guidance.suggestion, undefined); // a bad case must not be suggested
});

test('personal layer outweighs community for equal content', () => {
  const store = freshStore();
  const community = createCase({ ...refactorDraft, layer: 'community' });
  const personal = createCase({ ...refactorDraft, layer: 'personal' });
  store.save(community);
  store.save(personal);
  const guidance = ask(store, {
    situation: 'refactor or deliver the ticket?',
    tags: ['refactor'],
  });
  assert.equal(guidance.matchedCases[0]?.layer, 'personal');
});
