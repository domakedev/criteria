/**
 * Motor criteria — versión servidor (Next.js).
 *
 * Igual que src/query.ts del repo raíz, pero puro: opera sobre arreglos de
 * casos (que aquí vienen de Firestore) en vez de un FileStore. El motor nunca
 * piensa: recupera y agrega criterio humano, siempre con procedencia.
 */
import { tokenize, semanticOverlap } from "./semantics";
import type {
  Confidence,
  CriterionQuery,
  DecisionCase,
  Guidance,
  LensSalience,
  MatchedCase,
  OutcomeStatus,
  TrackRecord,
  Weight,
} from "./types";

export const WEIGHT_VALUE: Record<Weight, number> = { high: 3, medium: 2, low: 1 };

/**
 * Factor del resultado: las decisiones que salieron bien pesan más; las que
 * salieron mal igual aparecen (como advertencias) pero empujan menos.
 */
export const OUTCOME_FACTOR: Record<OutcomeStatus, number> = {
  good: 1.2,
  mixed: 1.0,
  pending: 0.9,
  bad: 0.7,
};

/** El criterio vivido en carne propia pesa más que el de la multitud. */
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
    ...candidate.lenses.map((l) => l.reading),
    candidate.context.tags.join(" "),
  ].join(" ");
  const tokenOverlap = semanticOverlap(queryTokens, tokenize(caseText));

  const base = tagOverlap * 2 + tokenOverlap;
  if (base <= 0) return 0;

  const layerFactor = candidate.layer === "personal" ? PERSONAL_MULTIPLIER : 1;
  return base * layerFactor * OUTCOME_FACTOR[candidate.outcome.status];
}

/** Peso emergente de los lentes: qué puntos de vista importaron en estos casos. */
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
  if (matches.length === 0) return "none";
  const resolved = matches.filter((m) => m.case.outcome.status !== "pending");
  if (matches.length <= 2) return "low";
  if (matches.length <= 5 || resolved.length === 0) return "medium";
  return "high";
}

const COLD_START_MESSAGE =
  "Aún no hay experiencias parecidas a esta. Cuéntame la tuya: qué decidiste, " +
  "qué pesaste y por qué — así la próxima persona (o tú en el futuro) tendrá " +
  "de dónde partir.";

/** Los casos más parecidos a la consulta, puntuados (top 10). */
export function topMatches(
  cases: DecisionCase[],
  query: CriterionQuery,
): MatchedCase[] {
  const candidates = query.domain
    ? cases.filter((c) => c.context.domain === query.domain)
    : cases;

  return candidates
    .map((c) => ({ case: c, score: scoreCase(query, c) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

/**
 * Pregunta al criterio guardado sobre una situación nueva.
 * Todo lo que devuelve viene de casos aportados por humanos.
 */
export function ask(cases: DecisionCase[], query: CriterionQuery): Guidance {
  return buildGuidance(topMatches(cases, query));
}

/** Convierte los casos puntuados en Guidance: nunca inventa, siempre cita. */
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

  const goodMatches = matches.filter((m) => m.case.outcome.status === "good");
  const usable = matches.filter((m) => m.case.outcome.status !== "bad");
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
    .filter((m) => m.case.outcome.status === "bad")
    .map((m) => ({
      caseId: m.case.id,
      decision: m.case.decision,
      note: m.case.outcome.note ?? "esta decisión salió mal",
    }));

  const lenses = lensSalience(matches);
  const topLensNames = lenses
    .slice(0, 3)
    .map((l) => l.name.replace(/-/g, " "))
    .join(", ");

  const message =
    `Según ${matches.length} experiencia(s) real(es), lo que más pesó en ` +
    `situaciones como esta fue: ${topLensNames}. ` +
    (suggestion
      ? `La decisión mejor respaldada fue: "${suggestion.decision}".`
      : "Ninguna decisión con buen respaldo — revisa las advertencias.") +
    (warnings.length > 0
      ? ` Ojo: ${warnings.length} caso(s) parecido(s) salieron mal.`
      : "");

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

/** Historial: cuántas decisiones guardadas y cómo salieron. */
export function trackRecord(cases: DecisionCase[]): TrackRecord {
  const rec = { total: cases.length, good: 0, bad: 0, mixed: 0, pending: 0 };
  for (const c of cases) rec[c.outcome.status]++;
  const resolved = rec.good + rec.bad + rec.mixed;
  return {
    ...rec,
    reliability: resolved > 0 ? Number((rec.good / resolved).toFixed(2)) : null,
  };
}
