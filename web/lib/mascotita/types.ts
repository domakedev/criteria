// Tipos de la mascotita — una criatura que vive en un entorno (el repositorio
// real o mundos imaginados), aprende por ensayo y error y guarda su "yo" como
// NÚMEROS en Firestore. El cerebro (Gemini hoy, un modelo propio mañana) es
// solo un órgano de percepción y de lenguaje: nunca es la memoria ni la
// política. Cambiar de cerebro no cambia quién es la mascota.
//
// Colecciones:
//   mascotas/{uid}                    → PetDoc (estado numérico, ≤ ~40 KB)
//   mascotas/{uid}/conocimiento/{slug} → ConceptDoc (≤ 400)
//   mascotas/{uid}/memorias/{id}       → MemoryDoc (≤ 300)
//   mascotas/{uid}/diario/{id}         → DiaryEntryDoc (1 doc por entrada)
//   mascotas/{uid}/charlas/{id}        → ChatDoc (≤ 240)
//   mascotas/{uid}/entornos/{envId}    → EnvStateDoc (cursor por entorno)
//   mascotas/{uid}/ticks/{seq6}        → TickDoc (log y dataset, ≤ 60)
//   mascotita_cache/repoTree           → RepoTreeCache (compartido, 1 fetch/día)
//   mascotita_cache/usage              → UsageDoc (tope global de LLM por día)

// --- personalidad, ánimo, impulsos ---

/** Seis rasgos en [0.05, 0.95]; derivan lentamente con lo que vive. */
export interface Traits {
  curiosidad: number;
  cautela: number;
  sociabilidad: number;
  juego: number;
  constancia: number;
  orden: number;
}

export const TRAIT_KEYS = [
  "curiosidad",
  "cautela",
  "sociabilidad",
  "juego",
  "constancia",
  "orden",
] as const;
export type TraitKey = (typeof TRAIT_KEYS)[number];

export type MoodWord =
  | "alegre"
  | "tranquila"
  | "curiosa"
  | "inquieta"
  | "aburrida"
  | "asustada"
  | "triste"
  | "orgullosa";

export const MOOD_WORDS: MoodWord[] = [
  "alegre",
  "tranquila",
  "curiosa",
  "inquieta",
  "aburrida",
  "asustada",
  "triste",
  "orgullosa",
];

export interface Mood {
  /** −1..1 */
  valence: number;
  /** 0..1 */
  arousal: number;
  word: MoodWord;
}

/** Impulsos homeostáticos, todos en 0..1. */
export interface Drives {
  energy: number;
  boredom: number;
  loneliness: number;
}

export type LifeStage = "huevo" | "cria" | "joven" | "adulta" | "sabia";

export const LIFE_STAGES: LifeStage[] = ["huevo", "cria", "joven", "adulta", "sabia"];

// --- documento principal ---

export type TickReason = "cron" | "manual" | "catchup";

export interface PolicyEntry {
  /** Valor esperado de la acción en ese entorno (−1..1). */
  q: number;
  /** Veces elegida. */
  n: number;
}

export interface Habit {
  env: string;
  action: string;
  /** q · min(1, n/20) */
  strength: number;
  n: number;
  ok: number;
}

export interface PetStats {
  ticks: number;
  steps: number;
  concepts: number;
  taughtConcepts: number;
  forgotten: number;
  chats: number;
  teachings: number;
  llmCalls: number;
  envSwitches: number;
  predictions: number;
  predictionsOk: number;
  verifications: number;
  verificationsOk: number;
}

/** Contadores del día (clave de día en America/Lima). */
export interface DayCounters {
  key: string;
  ticks: number;
  manualTicks: number;
  llmCalls: number;
  chats: number;
  teachings: number;
  lastManualAt: string | null;
  /** Día en que se hizo el último barrido completo (decaimiento/poda). */
  sweptKey: string;
  /** Si ya se aplicó hoy la penalización de soledad por ausencia del dueño. */
  absenceApplied: boolean;
}

export interface TickLock {
  until: string;
  seq: number;
  reason: TickReason;
}

export interface PetDoc {
  uid: string;
  name: string;
  species: "semillita";
  active: boolean;
  bornAt: string;
  stage: LifeStage;
  xp: number;
  /** Rasgos al nacer (para que el dueño vea cuánto cambió). */
  genes: Traits;
  traits: Traits;
  /** Una foto por día, ≤ 60 (FIFO). */
  traitHistory: Array<{ day: string; traits: Traits }>;
  mood: Mood;
  drives: Drives;
  env: string;
  allowedEnvs: string[];
  envVisits: Record<string, number>;
  /** policy[envId][actionType] */
  policy: Record<string, Record<string, PolicyEntry>>;
  /** N por entorno (para el bono UCB). */
  policyN: Record<string, number>;
  /** skills[actionType] → conteos (competencia beta-binomial). */
  skills: Record<string, { ok: number; fail: number }>;
  /** Derivados de la política, ≤ 5. */
  habits: Habit[];
  /** 0..1: cuánto confía en lo que le enseña el dueño. */
  trustOwner: number;
  stats: PetStats;
  day: DayCounters;
  /** Secuencia de ticks: el tick N usa RNG sembrado con (uid, N) → reintentos idempotentes. */
  tickSeq: number;
  lock: TickLock | null;
  lastTickAt: string | null;
  lastSeenAt: string;
  lastChatAt: string | null;
  /** Lo que quiere preguntarle al dueño (≤ 140). */
  pendingQuestion: string | null;
  /** Último cerebro usado: "gemini" | "simple" | "custom" | "gemini→simple"… */
  brainId: string;
  /** Novedad media de los últimos 3 ticks (para el aburrimiento y el cambio de entorno). */
  recentNovelty: number[];
  createdAt: string;
  updatedAt: string;
}

// --- conocimiento ---

export type ConceptKind =
  | "cosa"
  | "lugar"
  | "idea"
  | "regla"
  | "archivo"
  | "persona"
  | "habito"
  | "duda";

export const CONCEPT_KINDS: ConceptKind[] = [
  "cosa",
  "lugar",
  "idea",
  "regla",
  "archivo",
  "persona",
  "habito",
  "duda",
];

export interface ConceptEdge {
  to: string;
  rel: string;
  w: number;
}

export interface ConceptDoc {
  /** slug kebab-case ≤ 60 */
  id: string;
  label: string;
  kind: ConceptKind;
  /** Hecho corto (≤ 160) que la mascota cree. */
  claim: string;
  /** 0..1 */
  confidence: number;
  hits: number;
  misses: number;
  /** { repo: 3, bosque: 1, "dueño": 1 } ≤ 10 claves */
  sources: Record<string, number>;
  /** Enseñado por el dueño: piso 0.2, decae a la mitad. */
  taught: boolean;
  /** Enseñado y aún sin ponerse a prueba en el entorno. */
  toTest: boolean;
  uncertain: boolean;
  /** Confirmado por el entorno (hipótesis comprobada). */
  verified: boolean;
  /** Ruta del repo u objeto imaginado del que trata (para probarlo después). */
  ref: string | null;
  /** Texto literal (≤ 40) que debería aparecer en `ref` si el claim es cierto. */
  evidence: string | null;
  /** ≤ 12 */
  edges: ConceptEdge[];
  firstSeenAt: string;
  lastSeenAt: string;
  lastChangeAt: string;
  lastConfDelta: number;
  /** confidence · (1 + ln(1 + hits)), materializado para orderBy. */
  score: number;
}

// --- memoria episódica ---

export interface MemoryDoc {
  id: string;
  at: string;
  env: string;
  action: string;
  target: string;
  reward: number;
  success: boolean;
  novelty: number;
  /** slugs ≤ 8 */
  concepts: string[];
  /** ≤ 300 */
  text: string;
  /** 0..1; decae con el tiempo, se borra bajo 0.08 */
  salience: number;
  consolidatedInto: string | null;
  ownerInvolved: boolean;
}

// --- diario ---

export type DiaryKind =
  | "nacimiento"
  | "tick"
  | "charla"
  | "ensenanza"
  | "entorno"
  | "olvido"
  | "etapa"
  | "cambio";

export interface DiaryDelta {
  /** slugs ≤ 6 */
  newConcepts: string[];
  reinforced: number;
  weakened: number;
  /** slugs ≤ 4 */
  forgotten: string[];
  /** recompensa media del tick */
  reward: number;
  /** solo cambios ≥ 0.01 */
  traitShift: Partial<Traits>;
  question: string | null;
  predictions: { made: number; ok: number };
}

export interface DiaryEntryDoc {
  id: string;
  at: string;
  kind: DiaryKind;
  env: string;
  /** ≤ 80 */
  title: string;
  /** ≤ 600, en su voz */
  text: string;
  moodWord: MoodWord;
  brainId: string;
  seq: number | null;
  delta: DiaryDelta;
}

// --- charlas ---

export interface ChatDoc {
  id: string;
  at: string;
  from: "dueño" | "mascota";
  /** ≤ 600 */
  text: string;
  kind: "charla" | "ensenanza";
  usedConcepts: string[];
  learned: string[];
  moodWord: MoodWord | null;
}

// --- entornos ---

export interface RepoCursor {
  kind: "repo";
  /** ruta → veces leída (≤ 400) */
  visited: Record<string, number>;
  /** rutas candidatas ≤ 50 (imports resueltos, hijos de carpetas exploradas, pistas del dueño) */
  frontier: string[];
  lastRead: { path: string; imports: string[] } | null;
  lastCommitSha: string | null;
  /** ruta → sha del blob cuando se leyó (≤ 200), para notar cambios */
  fileSha: Record<string, string>;
}

export interface ImaginedCursor {
  kind: "imaginado";
  zone: string;
  zoneVisits: Record<string, number>;
  /** objId → resultados (así descubre las probabilidades ocultas) */
  objectTries: Record<string, { ok: number; fail: number }>;
  discovered: string[];
  /** avanza 1 por tick; día/noche = clock % 4 < 2 */
  clock: number;
}

export type EnvCursor = RepoCursor | ImaginedCursor;

export interface EnvStateDoc {
  envId: string;
  visits: number;
  updatedAt: string;
  cursor: EnvCursor;
}

export interface RepoTreeEntry {
  /** ruta */
  p: string;
  /** bytes */
  s: number;
  /** sha del blob */
  h: string;
}

export interface RepoTreeCache {
  repo: string;
  branch: string;
  /** sha del árbol/commit al momento de bajarlo */
  sha: string;
  fetchedAt: string;
  /** ≤ 800 blobs de texto */
  tree: RepoTreeEntry[];
}

export interface UsageDoc {
  day: string;
  calls: number;
}

// --- log de ticks (también dataset para entrenar un cerebro propio) ---

export interface TickStep {
  action: string;
  target: string;
  label: string;
  reward: number;
  rTotal: number;
  success: boolean;
  novelty: number;
  ms: number;
  tags: string[];
}

export interface TickDoc {
  id: string;
  seq: number;
  at: string;
  reason: TickReason;
  env: string;
  steps: TickStep[];
  llmCalls: number;
  fetches: number;
  ms: number;
  brainId: string;
  error: string | null;
  /** Pares entrada→salida del cerebro (recortados) — el dataset del modelo propio. */
  io: {
    perceive: { input: string; output: string } | null;
    reflect: { input: string; output: string } | null;
  };
}

// --- vistas (lo que viaja al cliente) ---

export interface EnvInfo {
  id: string;
  name: string;
  emoji: string;
  kind: "real" | "imaginado";
  intro: string;
}

export interface PetView {
  name: string;
  species: string;
  stage: LifeStage;
  xp: number;
  /** xp necesario para la siguiente etapa (null si es sabia). */
  xpNext: number | null;
  ageDays: number;
  bornAt: string;
  traits: Traits;
  genes: Traits;
  traitDelta7d: Partial<Traits>;
  mood: Mood;
  drives: Drives;
  env: string;
  allowedEnvs: string[];
  envVisits: Record<string, number>;
  habits: Habit[];
  /** actionType → competencia 0..1 (con conteos) */
  skills: Array<{ action: string; competence: number; ok: number; fail: number }>;
  /** env → top acciones por q */
  preferences: Record<string, Array<{ action: string; q: number; n: number }>>;
  stats: PetStats;
  trustOwner: number;
  pendingQuestion: string | null;
  lastTickAt: string | null;
  lastSeenAt: string;
  brainId: string;
  /** true si hay un tick en curso ahora mismo */
  busy: boolean;
}

export interface ConceptView {
  id: string;
  label: string;
  kind: ConceptKind;
  claim: string;
  confidence: number;
  hits: number;
  misses: number;
  sources: string[];
  taught: boolean;
  toTest: boolean;
  uncertain: boolean;
  verified: boolean;
  ref: string | null;
  related: string[];
  lastSeenAt: string;
  lastConfDelta: number;
}

export interface MemoryView {
  id: string;
  at: string;
  env: string;
  action: string;
  target: string;
  text: string;
  reward: number;
  salience: number;
  concepts: string[];
}

export interface DiaryEntryView {
  id: string;
  at: string;
  kind: DiaryKind;
  env: string;
  title: string;
  text: string;
  moodWord: MoodWord;
  brainId: string;
  delta: DiaryDelta;
}

export interface ChatView {
  id: string;
  at: string;
  from: "dueño" | "mascota";
  text: string;
  kind: "charla" | "ensenanza";
  usedConcepts: string[];
  learned: string[];
  moodWord: MoodWord | null;
}

/** "Mientras no estabas": agregado en servidor a partir de los deltas guardados. */
export interface ReportView {
  since: string;
  days: number;
  ticks: number;
  newConcepts: string[];
  reinforced: number;
  weakened: number;
  forgotten: string[];
  /** cambios de rasgos acumulados (solo |Δ| ≥ 0.01) */
  traitShift: Partial<Traits>;
  /** frases cortas: "más cautelosa", "menos curiosa" */
  traitWords: string[];
  predictions: { made: number; ok: number };
  question: string | null;
  entries: DiaryEntryView[];
}

export interface CapsView {
  ticksLeft: number;
  chatsLeft: number;
  teachLeft: number;
  /** ISO de cuándo puede volver a explorar a mano (null = ya) */
  manualReadyAt: string | null;
}

export interface StateResponse {
  pet: PetView | null;
  envs: EnvInfo[];
  report: ReportView | null;
  knowledge: ConceptView[];
  fading: ConceptView[];
  memories: MemoryView[];
  chat: ChatView[];
  diary: DiaryEntryView[];
  /** exploraciones atrasadas que la UI debe disparar (≤ 2) */
  owed: number;
  caps: CapsView;
  brainId: string;
  /** nombres sugeridos cuando aún no hay mascota */
  names: string[];
}

export interface StepView {
  action: string;
  target: string;
  label: string;
  reward: number;
  success: boolean;
  novelty: number;
  tags: string[];
}

export type TickSkipReason = "locked" | "cap" | "cooldown" | "nopet" | "inactive";

export interface TickResult {
  skipped: TickSkipReason | null;
  seq: number | null;
  entry: DiaryEntryView | null;
  extraEntries: DiaryEntryView[];
  steps: StepView[];
  llmCalls: number;
  ms: number;
  brainId: string;
  pet: PetView | null;
  /** ISO para reintentar si skipped = cooldown/locked */
  retryAt: string | null;
}

export interface ChatResponse {
  reply: string;
  usedConcepts: string[];
  learned: ConceptView[];
  moodWord: MoodWord;
  question: string | null;
  pet: PetView;
}

export interface TeachResponse {
  ack: string;
  concepts: ConceptView[];
  /** Si algo de lo enseñado choca con lo que ya vio: "Pero yo vi que…" */
  contradiction: { conceptId: string; label: string; why: string } | null;
  pet: PetView;
}
