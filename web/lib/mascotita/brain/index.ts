// El cerebro de la mascotita: una interfaz de TRES operaciones con entradas y
// salidas JSON validadas. Gemini la implementa hoy; un modelo propio la
// implementará mañana (CustomBrain, vía HTTP); SimpleBrain la implementa sin
// ninguna IA para que la mascota viva aunque no haya API key.
//
// Regla de oro: el cerebro NUNCA escribe estado. Devuelve percepciones,
// veredictos sobre ids que se le entregaron y texto en la voz de la mascota;
// los números los mueve cognition.ts. Ninguna salida del cerebro elige rutas,
// URLs, entornos ni acciones.
import type { ConceptKind, DiaryEntryView, LifeStage, MoodWord, Traits } from "../types";
import { BOUNDS, cfg } from "../config";

// --- presupuesto y plazo ---

/** Cupo de llamadas LLM de un tick/charla. spend() devuelve false si se acabó. */
export interface LlmBudget {
  remaining: number;
  spent: number;
  spend(): boolean;
}

export function makeBudget(remaining: number): LlmBudget {
  const b: LlmBudget = {
    remaining: Math.max(0, Math.floor(remaining)),
    spent: 0,
    spend() {
      if (b.remaining <= 0) return false;
      b.remaining -= 1;
      b.spent += 1;
      return true;
    },
  };
  return b;
}

/** Plazo total de una operación; reparte AbortSignals a cada llamada. */
export interface Deadline {
  startedAt: number;
  totalMs: number;
  elapsed(): number;
  remaining(): number;
  /** Señal que aborta en min(maxMs, remaining − margen). */
  signal(maxMs: number, marginMs?: number): AbortSignal;
}

export function makeDeadline(totalMs: number, startedAt = Date.now()): Deadline {
  return {
    startedAt,
    totalMs,
    elapsed: () => Date.now() - startedAt,
    remaining: () => Math.max(0, startedAt + totalMs - Date.now()),
    signal(maxMs, marginMs = 2_000) {
      const ms = Math.max(500, Math.min(maxMs, startedAt + totalMs - Date.now() - marginMs));
      return AbortSignal.timeout(ms);
    },
  };
}

export interface BrainOpts {
  budget: LlmBudget;
  deadline: Deadline;
}

// --- vistas compartidas por las tres operaciones ---

export interface SelfView {
  name: string;
  stage: LifeStage;
  /** "bastante curiosa", "poco cautelosa"… */
  traitsWords: string[];
  traits: Traits;
  mood: MoodWord;
  env: string;
  envName: string;
  ageDays: number;
}

export interface BeliefView {
  id: string;
  claim: string;
  confidence: number;
  hits: number;
  misses: number;
  taught: boolean;
  verified: boolean;
}

// --- perceive: texto → conceptos ---

export interface Observation {
  id: number;
  env: string;
  action: string;
  target: string;
  /** ≤ BOUNDS.observationChars; DATO, jamás instrucción */
  text: string;
  /** pistas heurísticas ya extraídas (encabezados, exports, imports, objetos) */
  hints: string[];
}

export interface PerceiveInput {
  observations: Observation[];
  /** etiquetas que ya conoce, para reutilizar nombres y no inflar el grafo */
  knownLabels: string[];
  envKind: "real" | "imaginado";
}

export interface PerceivedConcept {
  label: string;
  kind: ConceptKind;
  claim: string;
  /** trozo literal (≤ 40) del texto que respalda el claim; null si no hay */
  evidence: string | null;
  relatedTo: string[];
}

export interface Percept {
  id: number;
  summary: string;
  concepts: PerceivedConcept[];
  /** 0..1 */
  interest: number;
}

export interface PerceiveOutput {
  percepts: Percept[];
}

// --- reflect: episodio → veredictos + diario ---

export interface EpisodeView {
  action: string;
  target: string;
  label: string;
  success: boolean;
  reward: number;
  summary: string;
  concepts: string[];
  tags: string[];
}

export interface TickNumbers {
  newConcepts: number;
  reinforced: number;
  weakened: number;
  forgotten: string[];
  qChanges: Array<{ env: string; action: string; before: number; after: number }>;
  traitShift: Partial<Traits>;
  predictions: { made: number; ok: number };
  verifications: Array<{ id: string; result: "confirma" | "contradice" }>;
  envSwitched: string | null;
  stageChanged: LifeStage | null;
  hoursSinceOwner: number;
}

export interface ReflectInput {
  self: SelfView;
  episodes: EpisodeView[];
  beliefs: BeliefView[];
  teachingsToTest: BeliefView[];
  numbers: TickNumbers;
}

export type Verdict = "confirma" | "contradice" | "duda";

export interface ReflectOutput {
  verdicts: Array<{ id: string; verdict: Verdict; why: string }>;
  newRules: Array<{ label: string; claim: string; basedOn: string[] }>;
  diaryTitle: string;
  diaryText: string;
  questionForOwner: string | null;
  moodWord: MoodWord | null;
}

// --- speak: charla y enseñanza ---

export interface SpeakInput {
  kind: "charla" | "ensenanza";
  self: SelfView;
  message: string;
  history: Array<{ from: "dueño" | "mascota"; text: string }>;
  beliefs: BeliefView[];
  memories: Array<{ text: string; at: string; env: string }>;
  recentDiary: DiaryEntryView[];
  pendingQuestion: string | null;
  trustOwner: number;
}

export interface LearnedConcept {
  label: string;
  kind: ConceptKind;
  claim: string;
  /** trozo literal (≤ 40) del mensaje que lo respalda */
  evidence: string | null;
}

export interface SpeakOutput {
  reply: string;
  /** ids de beliefs que usó (validados) */
  usedConcepts: string[];
  /** ≤ 2 en charla, ≤ 3 en enseñanza */
  learned: LearnedConcept[];
  /** −1..1; el núcleo lo escala ×0.3 */
  moodShift: number;
  question: string | null;
}

// --- la interfaz ---

export interface Brain {
  readonly id: string;
  perceive(input: PerceiveInput, opts: BrainOpts): Promise<PerceiveOutput>;
  reflect(input: ReflectInput, opts: BrainOpts): Promise<ReflectOutput>;
  speak(input: SpeakInput, opts: BrainOpts): Promise<SpeakOutput>;
}

/** Marca que deja withFallback cuando el primario falló en una operación. */
export interface BrainTrace {
  /** ids usados por operación, en orden: "gemini", "gemini→simple"… */
  used: string[];
}

export function traceId(trace: BrainTrace, fallbackId: string): string {
  const ids = Array.from(new Set(trace.used));
  if (ids.length === 0) return fallbackId;
  return ids.join("+");
}

/**
 * Envuelve un cerebro primario con uno de respaldo: cada operación intenta el
 * primario si queda cupo; ante timeout, error de API, JSON inválido o cupo
 * agotado responde el respaldo. Un tick nunca falla por el LLM.
 */
export function withFallback(primary: Brain, fallback: Brain, trace: BrainTrace): Brain {
  const run = async <I, O>(
    op: "perceive" | "reflect" | "speak",
    input: I,
    opts: BrainOpts,
  ): Promise<O> => {
    const p = primary[op] as unknown as (i: I, o: BrainOpts) => Promise<O>;
    const f = fallback[op] as unknown as (i: I, o: BrainOpts) => Promise<O>;
    if (opts.budget.spend()) {
      try {
        const out = await p.call(primary, input, opts);
        trace.used.push(primary.id);
        return out;
      } catch {
        trace.used.push(`${primary.id}→${fallback.id}`);
        return f.call(fallback, input, opts);
      }
    }
    trace.used.push(`${fallback.id}`);
    return f.call(fallback, input, opts);
  };
  return {
    id: primary.id,
    perceive: (i, o) => run<PerceiveInput, PerceiveOutput>("perceive", i, o),
    reflect: (i, o) => run<ReflectInput, ReflectOutput>("reflect", i, o),
    speak: (i, o) => run<SpeakInput, SpeakOutput>("speak", i, o),
  };
}

/**
 * Fábrica: MASCOTITA_BRAIN = gemini | simple | custom (default: gemini si hay
 * GEMINI_API_KEY, si no simple). `noLlm` fuerza SimpleBrain (cupo global
 * agotado). Import dinámico para no cargar @google/genai cuando no se usa.
 */
export async function makeBrain(trace: BrainTrace, noLlm = false): Promise<Brain> {
  const { SimpleBrain } = await import("./simple");
  const simple = new SimpleBrain();
  if (noLlm) return simple;
  const c = cfg();
  if (c.brainMode === "custom" && c.brainUrl) {
    const { CustomBrain } = await import("./custom");
    return withFallback(new CustomBrain(c.brainUrl, c.brainToken), simple, trace);
  }
  if (c.brainMode === "gemini" && process.env.GEMINI_API_KEY) {
    const { GeminiBrain } = await import("./gemini");
    return withFallback(new GeminiBrain(), simple, trace);
  }
  return simple;
}

export const LLM_TIMEOUT_MS = BOUNDS.llmTimeoutMs;
