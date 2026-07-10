import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStore } from '../src/store.js';
import { createCase } from '../src/ingest.js';
import { recordOutcome } from '../src/feedback.js';
import { askForApp } from '../src/server.js';
import type { CaseDraft } from '../src/types.js';

function freshStore(): FileStore {
  return new FileStore(mkdtempSync(join(tmpdir(), 'criteria-')));
}

function draft(overrides: Partial<CaseDraft> = {}): CaseDraft {
  return {
    situation: 'Me ofrecieron cambiar de proyecto por mas sueldo',
    context: { domain: 'trabajo', tags: [] },
    lenses: [{ name: 'confianza-del-equipo', weight: 'high', reading: 'la confianza de mi equipo' }],
    decision: 'Quedarme en mi equipo',
    reason: 'la confianza vale mas que el dinero ahora',
    doubt: 'low',
    author: 'yo',
    layer: 'personal',
    ...overrides,
  };
}

test('cold start: no experiences → hasAnswer false, echoes situation to teach', async () => {
  const app = await askForApp(freshStore(), 'me ofrecen otro trabajo lejos de casa', undefined, null);
  assert.equal(app.hasAnswer, false);
  assert.equal(app.confidence, 'none');
  assert.equal(app.situation, 'me ofrecen otro trabajo lejos de casa');
  assert.equal(app.suggestion, null);
});

test('answers from the user own experience, with a friendly factor label', async () => {
  const store = freshStore();
  const c = createCase(draft());
  store.save(c);
  recordOutcome(store, c.id, 'good', 'llego una mejor oferta despues');
  const app = await askForApp(store, 'me ofrecieron cambiar de proyecto, mas sueldo', undefined, null);
  assert.equal(app.hasAnswer, true);
  assert.ok(app.suggestion);
  assert.equal(app.suggestion?.decision, 'Quedarme en mi equipo');
  // friendly label taken from the lens reading, not the slug
  assert.equal(app.factors[0]?.label, 'la confianza de mi equipo');
  assert.ok(app.similar.length >= 1);
});

test('a similar decision that went badly comes back as a warning, not a suggestion', async () => {
  const store = freshStore();
  const bad = createCase(
    draft({
      situation: 'acepte cambiarme de proyecto de golpe por el sueldo',
      decision: 'Cambiarme de inmediato',
    }),
  );
  store.save(bad);
  recordOutcome(store, bad.id, 'bad', 'perdi la confianza que habia construido');
  const app = await askForApp(store, 'me ofrecieron cambiarme de proyecto por sueldo', undefined, null);
  assert.equal(app.warnings.length, 1);
  assert.equal(app.warnings[0]?.decision, 'Cambiarme de inmediato');
  assert.ok(app.warnings[0]?.situation.length > 0);
  assert.equal(app.suggestion, null);
});
