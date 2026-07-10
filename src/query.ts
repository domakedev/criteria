/**
 * Query: the heart of the engine — and deliberately NOT intelligent.
 *
 * Like a human, it does not inspect everything it knows. It looks at the
 * outer layers: which stored situations resemble this one, which lenses
 * mattered there, and how those decisions actually turned out. It retrieves
 * and aggregates human criterion; it never invents judgment.
 */
import type { FileStore } from './store.js';
import { tokenize, semanticOverlap } from './semantics.js';
import type {
  Confidence,
  CriterionQuery,
  DecisionCase,
  Guidance,
  LensSalience,
  MatchedCase,
  OutcomeStatus,
  Weight,
} from './types.js';

export { tokenize } from './semantics.js';

export const WEIGHT_VALUE: Record<Weight, number> = { high: 3, medium: 2, low: 1 };

/**
 * Outcome factor: decisions that went well speak louder; decisions that went
 * badly still match (they become warnings) but push less.
 */
export const OUTCOME_FACTOR: Record<OutcomeStatus, number> = {
  good: 1.2,
  mixed: 1.0,
  pending: 0.9,
  bad: 0.7,
};

/** Personal lived criterion outweighs the crowd's — see spec/layers.md. */
export const PERSONAL_MULTIPLIER = 1.25;

export function scoreCase(query: CriterionQuery, candidate: DecisionCase): number {
  const caseTags = new Set(candidate.context.tags);
  let tagOverlap = 0;
  for (const t of query.tags ?? []) if (caseTags.has(t.toLowerCase())) tagOverlap++;

  const queryTokens = tokenize(query.situation);
  const caseText = [
    candidate.situation,
    candidate.decision,
    candidate.reason,
    ...candidate.lenses.map((l) => l.reading), // the factors carry a lot of meaning
    candidate.context.tags.join(' '),
  ].join(' ');
  const tokenOverlap = semanticOverlap(queryTokens, tokenize(caseText));

  const base = tagOverlap * 2 + tokenOverlap;
  if (base <= 0) return 0;

  const layerFactor = candidate.layer === 'personal' ? PERSONAL_MULTIPLIER : 1;
  return base * layerFactor * OUTCOME_FACTOR[candidate.outcome.status];
}

/** Emergent lens salience: which points of view mattered across these cases. */
export function lensSalience(matches: MatchedCase[]): LensSalience[] {
  const acc = new Map<string, { score: number; appearances: number }>();
  for (const { case: c, score } of matches) {
    for (const lens of c.lenses) {
      const entry = acc.get(lens.name) ?? { score: 0, appearances: 0 };
      entry.score += WEIGHT_VALUE[lens.weight] * score;
      entry.appearances += 1;
      acc.set(lens.name, entry);
    }
  }
  const max = Math.max(...[...acc.values()].map((e) => e.score), 1);
  return [...acc.entries()]
    .map(([name, e]) => ({
      name,
      score: Number((e.score / max).toFixed(3)),
      appearances: e.appearances,
    }))
    .sort((a, b) => b.score - a.score);
}

function confidenceFor(matches: MatchedCase[]): Confidence {
  if (matches.length === 0) return 'none';
  const resolved = matches.filter((m) => m.case.outcome.status !== 'pending');
  if (matches.length <= 2) return 'low';
  if (matches.length <= 5 || resolved.length === 0) return 'medium';
  return 'high';
}

const COLD_START_MESSAGE =
  'I do not have enough criterion for this yet. Tell me: what would you do, ' +
  'through which lenses did you look, and why? I will learn it. ' +
  '(ES: Aún no tengo criterio suficiente. Dime qué harías tú, con qué lentes ' +
  'lo miraste y por qué — lo aprenderé.)';

/**
 * Ask the stored criterion about a new situation.
 * Everything returned traces back to cases contributed by humans.
 */
export function ask(store: FileStore, query: CriterionQuery): Guidance {
  const candidates = store.listCases(
    query.domain ? { domain: query.domain } : {},
  );

  const matches: MatchedCase[] = candidates
    .map((c) => ({ case: c, score: scoreCase(query, c) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return buildGuidance(matches);
}

/**
 * Turn scored matches into Guidance. Shared by the lexical path (ask) and the
 * semantic path (askSmart) so both obey the same contract: never invent,
 * always cite, bad cases are warnings.
 */
export function buildGuidance(matches: MatchedCase[]): Guidance {
  const confidence = confidenceFor(matches);

  if (matches.length === 0) {
    return {
      confidence,
      message: COLD_START_MESSAGE,
      topLenses: [],
      warnings: [],
      matchedCases: [],
    };
  }

  const goodMatches = matches.filter((m) => m.case.outcome.status === 'good');
  const usable = matches.filter((m) => m.case.outcome.status !== 'bad');
  const bestBacked = goodMatches[0] ?? usable[0];

  const suggestion = bestBacked
    ? {
        decision: bestBacked.case.decision,
        reason: bestBacked.case.reason,
        basedOn: (goodMatches.length > 0 ? goodMatches : usable)
          .slice(0, 3)
          .map((m) => m.case.id),
      }
    : undefined;

  const warnings = matches
    .filter((m) => m.case.outcome.status === 'bad')
    .map((m) => ({
      caseId: m.case.id,
      decision: m.case.decision,
      note: m.case.outcome.note ?? 'this decision turned out badly',
    }));

  const lenses = lensSalience(matches);
  const topLensNames = lenses.slice(0, 3).map((l) => l.name).join(', ');

  const message =
    `Based on ${matches.length} human-contributed case(s), the lenses that ` +
    `historically mattered here are: ${topLensNames}. ` +
    (suggestion
      ? `The best-backed decision was: "${suggestion.decision}".`
      : 'No positively-backed decision found — see warnings.') +
    (warnings.length > 0
      ? ` ${warnings.length} similar case(s) went badly — check the warnings.`
      : '');

  return {
    confidence,
    message,
    topLenses: lenses,
    ...(suggestion ? { suggestion } : {}),
    warnings,
    matchedCases: matches.map((m) => ({
      id: m.case.id,
      situation: m.case.situation,
      decision: m.case.decision,
      score: Number(m.score.toFixed(2)),
      outcome: m.case.outcome.status,
      layer: m.case.layer,
      author: m.case.author,
    })),
  };
}

/** Domain-wide emergent lens weights (for `criteria lenses`). */
export function domainLensSalience(store: FileStore, domain: string): LensSalience[] {
  const cases = store.listCases({ domain });
  const matches: MatchedCase[] = cases.map((c) => ({
    case: c,
    score: OUTCOME_FACTOR[c.outcome.status],
  }));
  return lensSalience(matches);
}
