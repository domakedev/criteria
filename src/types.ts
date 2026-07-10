/**
 * criteria — core types.
 * The format is defined in /spec; these types mirror it 1:1.
 */

/** Declared importance of a lens for one specific decision. */
export type Weight = 'high' | 'medium' | 'low';

/** Residual doubt after deciding. */
export type Doubt = 'low' | 'medium' | 'high';

/** How a decision actually turned out. */
export type OutcomeStatus = 'pending' | 'good' | 'bad' | 'mixed';

/** community = shared knowledge; personal = private, local-first. */
export type Layer = 'community' | 'personal';

/** One point of view actually considered by the human (outer layer only). */
export interface LensReading {
  /** Lens id, kebab-case, e.g. "delivery-time". */
  name: string;
  /** Declared importance of this lens for THIS decision. */
  weight: Weight;
  /** What was observed through this lens. */
  reading: string;
}

export interface Outcome {
  status: OutcomeStatus;
  note?: string;
  recordedAt?: string | null;
}

export interface CaseContext {
  /** Knowledge community, kebab-case, e.g. "software-development". */
  domain: string;
  tags: string[];
}

/** The atomic unit: one real human decision. */
export interface DecisionCase {
  id: string;
  situation: string;
  context: CaseContext;
  lenses: LensReading[];
  decision: string;
  reason: string;
  doubt: Doubt;
  /** What the human expected to happen (temporal data). */
  expectation?: string;
  outcome: Outcome;
  layer: Layer;
  author: string;
  createdAt: string;
}

/** What a human (or a Structurer) provides; the engine fills the rest. */
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

/** A known lens in a domain's catalog. */
export interface LensDefinition {
  name: string;
  description: string;
}

export interface LensCatalog {
  domain: string;
  lenses: LensDefinition[];
}

/**
 * Optional AI plumbing: turns raw input (text transcript, OCR of a photo,
 * audio transcription…) into a structured CaseDraft. The engine never needs
 * this — a plain form produces the same draft. AI structures; humans judge.
 */
export interface Structurer {
  structure(rawInput: string): Promise<CaseDraft>;
}

/** A query: a new situation the user faces. */
export interface CriterionQuery {
  situation: string;
  domain?: string;
  tags?: string[];
}

export interface MatchedCase {
  case: DecisionCase;
  score: number;
}

/** Emergent salience of a lens, computed from accumulated cases. */
export interface LensSalience {
  name: string;
  /** Aggregate score (declared weights × case relevance × outcome factor). */
  score: number;
  appearances: number;
}

export type Confidence = 'none' | 'low' | 'medium' | 'high';

/** What the engine returns: retrieved human criterion, never invented. */
export interface Guidance {
  confidence: Confidence;
  /** Human-readable summary; on cold start, asks the human to teach. */
  message: string;
  /** Lenses that historically mattered for situations like this. */
  topLenses: LensSalience[];
  /** Best-backed suggestion, if any — always with provenance. */
  suggestion?: {
    decision: string;
    reason: string;
    basedOn: string[]; // case ids
  };
  /** Similar cases that went BAD — warnings, not suggestions. */
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

/** Aggregate track record of stored criterion. */
export interface TrackRecord {
  total: number;
  good: number;
  bad: number;
  mixed: number;
  pending: number;
  /** good / (good + bad + mixed), or null if nothing resolved yet. */
  reliability: number | null;
}
