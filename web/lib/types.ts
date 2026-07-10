/**
 * Tipos del formato criteria — espejo 1:1 de /spec en la raíz del repo.
 * (Copia local para que el proyecto web sea autocontenido.)
 */

/** Importancia declarada de un lente para UNA decisión. */
export type Weight = "high" | "medium" | "low";

/** Duda residual después de decidir. */
export type Doubt = "low" | "medium" | "high";

/** Cómo salió la decisión en la realidad. */
export type OutcomeStatus = "pending" | "good" | "bad" | "mixed";

/** community = compartido; personal = privado del usuario. */
export type Layer = "community" | "personal";

/** Un punto de vista que el humano realmente consideró. */
export interface LensReading {
  /** id del lente, kebab-case, ej. "costo-mantenimiento". */
  name: string;
  weight: Weight;
  /** Qué se observó a través de este lente. */
  reading: string;
}

export interface Outcome {
  status: OutcomeStatus;
  note?: string;
  recordedAt?: string | null;
}

export interface CaseContext {
  /** Tema, kebab-case, ej. "trabajo". */
  domain: string;
  tags: string[];
}

/** La unidad atómica: una decisión humana real. */
export interface DecisionCase {
  id: string;
  situation: string;
  context: CaseContext;
  lenses: LensReading[];
  decision: string;
  reason: string;
  doubt: Doubt;
  /** Qué esperaba el humano que pasara. */
  expectation?: string;
  outcome: Outcome;
  layer: Layer;
  author: string;
  createdAt: string;
}

/** Lo que el humano aporta; el motor completa el resto. */
export interface CaseDraft {
  situation: string;
  context: CaseContext;
  lenses: LensReading[];
  decision: string;
  reason: string;
  doubt: Doubt;
  expectation?: string;
  layer?: Layer;
  author: string;
}

/** Una consulta: la situación nueva que enfrenta el usuario. */
export interface CriterionQuery {
  situation: string;
  domain?: string;
  tags?: string[];
}

export interface MatchedCase {
  case: DecisionCase;
  score: number;
}

/** Peso emergente de un lente, calculado desde los casos acumulados. */
export interface LensSalience {
  name: string;
  score: number;
  appearances: number;
}

export type Confidence = "none" | "low" | "medium" | "high";

/** Lo que devuelve el motor: criterio humano recuperado, nunca inventado. */
export interface Guidance {
  confidence: Confidence;
  message: string;
  topLenses: LensSalience[];
  suggestion?: {
    decision: string;
    reason: string;
    basedOn: string[]; // ids de casos
  };
  /** Casos parecidos que salieron MAL — advertencias, no sugerencias. */
  warnings: Array<{
    caseId: string;
    decision: string;
    note: string;
  }>;
  matchedCases: Array<{
    id: string;
    situation: string;
    decision: string;
    score: number;
    outcome: OutcomeStatus;
    layer: Layer;
    author: string;
  }>;
}

/** Historial agregado del criterio guardado. */
export interface TrackRecord {
  total: number;
  good: number;
  bad: number;
  mixed: number;
  pending: number;
  /** good / (good + bad + mixed), o null si nada resuelto aún. */
  reliability: number | null;
}
