/**
 * Ingest: turn a CaseDraft (from a form, a CLI, or an AI Structurer)
 * into a valid DecisionCase. Validation lives here so every interface
 * — human or AI — goes through the same gate.
 */
import { randomBytes } from 'node:crypto';
import type { CaseDraft, DecisionCase } from './types.js';

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const WEIGHTS = new Set(['high', 'medium', 'low']);
const DOUBTS = new Set(['low', 'medium', 'high']);
const LAYERS = new Set(['community', 'personal']);

/** Returns a list of problems; empty list = valid. */
export function validateDraft(draft: CaseDraft): string[] {
  const errors: string[] = [];
  if (!draft.situation?.trim()) errors.push('situation is required');
  if (!draft.decision?.trim()) errors.push('decision is required');
  if (!draft.reason?.trim()) errors.push('reason is required');
  if (!draft.author?.trim()) errors.push('author is required (provenance)');
  if (!draft.doubt || !DOUBTS.has(draft.doubt)) {
    errors.push('doubt must be low | medium | high');
  }
  if (draft.layer !== undefined && !LAYERS.has(draft.layer)) {
    errors.push('layer must be community | personal');
  }
  if (!draft.context?.domain || !KEBAB.test(draft.context.domain)) {
    errors.push('context.domain is required and must be kebab-case');
  }
  if (!Array.isArray(draft.context?.tags)) {
    errors.push('context.tags must be an array');
  }
  if (!Array.isArray(draft.lenses) || draft.lenses.length === 0) {
    errors.push('at least one lens is required — criterion means looking through points of view');
  } else {
    draft.lenses.forEach((lens, i) => {
      if (!lens.name || !KEBAB.test(lens.name)) {
        errors.push(`lenses[${i}].name must be kebab-case`);
      }
      if (!WEIGHTS.has(lens.weight)) {
        errors.push(`lenses[${i}].weight must be high | medium | low`);
      }
      if (!lens.reading?.trim()) {
        errors.push(`lenses[${i}].reading is required — what did you see through this lens?`);
      }
    });
  }
  return errors;
}

export function generateCaseId(now: Date = new Date()): string {
  const stamp = now.toISOString().slice(0, 10).replaceAll('-', '');
  const suffix = randomBytes(3).toString('hex');
  return `case-${stamp}-${suffix}`;
}

/** Validates and promotes a draft into a full DecisionCase. Throws on invalid. */
export function createCase(draft: CaseDraft, now: Date = new Date()): DecisionCase {
  const errors = validateDraft(draft);
  if (errors.length > 0) {
    throw new Error(`Invalid decision case:\n- ${errors.join('\n- ')}`);
  }
  return {
    id: generateCaseId(now),
    situation: draft.situation.trim(),
    context: {
      domain: draft.context.domain,
      tags: draft.context.tags.map((t) => t.trim().toLowerCase()).filter(Boolean),
    },
    lenses: draft.lenses.map((l) => ({
      name: l.name,
      weight: l.weight,
      reading: l.reading.trim(),
    })),
    decision: draft.decision.trim(),
    reason: draft.reason.trim(),
    doubt: draft.doubt,
    ...(draft.expectation?.trim() ? { expectation: draft.expectation.trim() } : {}),
    outcome: { status: 'pending', recordedAt: null },
    layer: draft.layer ?? 'personal',
    author: draft.author.trim(),
    createdAt: now.toISOString(),
  };
}
