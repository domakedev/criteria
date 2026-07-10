import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStore } from '../src/store.js';
import { createCase } from '../src/ingest.js';
import { deriveGraph, similarity } from '../src/graph.js';
import type { CaseDraft } from '../src/types.js';

function freshStore(): FileStore {
  return new FileStore(mkdtempSync(join(tmpdir(), 'criteria-')));
}

function draft(overrides: Partial<CaseDraft> = {}): CaseDraft {
  return {
    situation: 'Should I refactor the module or deliver the ticket?',
    context: { domain: 'software-development', tags: ['refactor', 'deadline'] },
    lenses: [
      { name: 'delivery-time', weight: 'high', reading: 'due today' },
      { name: 'risk', weight: 'low', reading: 'low blast radius' },
    ],
    decision: 'Deliver and log tech debt',
    reason: 'not worth it now',
    doubt: 'low',
    author: 'tester',
    layer: 'community',
    ...overrides,
  };
}

test('derives case and lens nodes with R1 edges', () => {
  const store = freshStore();
  store.save(createCase(draft()));
  const graph = deriveGraph(store);
  const caseNodes = graph.nodes.filter((n) => n.type === 'case');
  const lensNodes = graph.nodes.filter((n) => n.type === 'lens');
  assert.equal(caseNodes.length, 1);
  assert.equal(lensNodes.length, 2);
  const r1 = graph.edges.filter((e) => e.type === 'looked-through');
  assert.equal(r1.length, 2);
  assert.equal(r1.find((e) => e.target === 'lens:delivery-time')?.weight, 'high');
});

test('salience emerges normalized to 0..1 with the top lens at 1', () => {
  const store = freshStore();
  store.save(createCase(draft()));
  const graph = deriveGraph(store);
  const delivery = graph.nodes.find((n) => n.id === 'lens:delivery-time');
  const risk = graph.nodes.find((n) => n.id === 'lens:risk');
  assert.equal(delivery?.salience, 1);
  assert.ok((risk?.salience ?? 1) < 1);
});

test('R2: similar cases get an undirected edge, dissimilar ones do not', () => {
  const store = freshStore();
  const a = createCase(draft());
  const b = createCase(
    draft({ situation: 'Refactor the legacy module or deliver as-is?' }),
  );
  const c = createCase(
    draft({
      situation: 'Which cloud region should we pick for storage pricing?',
      context: { domain: 'software-development', tags: ['infra', 'pricing'] },
      decision: 'Pick the nearest region',
    }),
  );
  [a, b, c].forEach((x) => store.save(x));
  const graph = deriveGraph(store);
  const similar = graph.edges.filter((e) => e.type === 'similar');
  assert.equal(similar.length, 1);
  const ids = [`case:${a.id}`, `case:${b.id}`].sort();
  assert.equal(similar[0]?.source, ids[0]);
  assert.equal(similar[0]?.target, ids[1]);
  assert.ok(similar[0]!.score! >= 3);
});

test('similarity is symmetric', () => {
  const a = createCase(draft());
  const b = createCase(draft({ situation: 'Refactor or ship the ticket now?' }));
  assert.equal(similarity(a, b), similarity(b, a));
});

test('deterministic: same cases and options produce the same graph', () => {
  const store = freshStore();
  store.save(createCase(draft()));
  store.save(createCase(draft({ situation: 'Refactor the helper or deliver?' })));
  const now = new Date('2026-07-09T12:00:00Z');
  const one = deriveGraph(store, { now });
  const two = deriveGraph(store, { now });
  assert.deepEqual(one, two);
});

test('domain filter and payload option are honored', () => {
  const store = freshStore();
  store.save(createCase(draft()));
  store.save(
    createCase(draft({ context: { domain: 'medicine', tags: ['triage'] } })),
  );
  const graph = deriveGraph(store, { domain: 'medicine', includePayload: false });
  assert.equal(graph.derivedFrom.domain, 'medicine');
  assert.equal(graph.nodes.filter((n) => n.type === 'case').length, 1);
  assert.equal(graph.nodes.find((n) => n.type === 'case')?.case, undefined);
});
