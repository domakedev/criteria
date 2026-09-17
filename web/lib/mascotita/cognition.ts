// El "yo" de la mascotita: funciones PURAS que mueven sus números. Aquí no hay
// I/O ni azar sin sembrar: cada función recibe lo que necesita (el doc, la hora
// en ISO, un rng sembrado) y devuelve un valor o muta el doc en sitio, siempre
// con todo acotado a su rango y redondeado (round3) para que Firestore guarde
// números cortos. El cerebro (LLM) nunca toca esto: percibe y habla; las
// fórmulas del modelo cognitivo (política, conocimiento, memorias, ánimo,
// rasgos, etapas) viven aquí. Ver DESIGN → "Modelo cognitivo".
import type {
  ChatDoc,
  ChatView,
  ConceptDoc,
  ConceptKind,
  ConceptView,
  DiaryDelta,
  DiaryEntryDoc,
  DiaryEntryView,
  Drives,
  Habit,
  LifeStage,
  MemoryDoc,
  MemoryView,
  MoodWord,
  PetDoc,
  PetView,
  ReportView,
  Traits,
} from "./types";
import { TRAIT_KEYS } from "./types";
import type { BeliefView, SelfView } from "./brain";
import type { Action } from "./envs";
import { CAL, CAPS } from "./config";
import {
  clamp,
  clamp01,
  hashString,
  mulberry32,
  pick,
  round3,
  seededRng,
  shuffle,
  softmaxSample,
} from "./rng";

const DAY_MS = 86_400_000;

// --- texto: día, slugs, tokens ---

const LIMA_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Lima",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "YYYY-MM-DD" en America/Lima: la clave de día de los contadores y del barrido. */
export function limaDayKey(d: Date): string {
  const parts = LIMA_FMT.formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** kebab-case sin acentos, [a-z0-9-], ≤ 60, sin guiones dobles ni en los extremos. */
export function slugify(s: string): string {
  const base = stripAccents(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    .replace(/-$/, "");
  // Un texto sin ningún carácter útil (solo emojis, p. ej.) no puede ser un id
  // vacío: se deriva uno estable de su hash.
  if (!base && s.trim()) return `c-${hashString(s).toString(36)}`;
  return base;
}

// Palabras cortas y funcionales que no dicen nada de un concepto.
const STOPWORDS = new Set([
  "que", "los", "las", "del", "por", "para", "con", "sin", "una", "uno", "unos", "unas", "sus",
  "mas", "como", "pero", "muy", "hay", "ese", "esa", "eso", "esto", "esta", "este", "estos",
  "estas", "aqui", "alli", "ahi", "entre", "sobre", "donde", "cuando", "tiene", "tienen",
  "ser", "son", "fue", "han", "hay", "esta", "estan", "era", "eran", "sea", "hace", "puede",
  "pueden", "tambien", "solo", "todo", "toda", "todos", "todas", "algo", "nada", "porque",
  "desde", "hasta", "cada", "otro", "otra", "otros", "otras", "ella", "ellos", "ellas",
  "the", "and", "for", "not", "its", "are", "was", "but", "this", "that", "with", "from",
  "have", "has", "will", "can", "all", "any", "also", "into", "then", "than", "you", "your",
  "our", "out", "use", "used", "one", "two", "let", "var", "const", "true", "false", "null",
  "return", "import", "export", "function", "class", "new", "type", "string", "number",
]);

/** Minúsculas sin acentos, palabras ≥ 3 letras, sin stopwords ES/EN; sin repetidos. */
export function tokenize(s: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of stripAccents(s).toLowerCase().split(/[^a-z0-9]+/)) {
    if (w.length < 3 || STOPWORDS.has(w) || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out;
}

const NAMES = [
  "Pepa", "Mote", "Nube", "Chispa", "Kiwi", "Pixel", "Tuna", "Coco", "Pancha", "Bit",
  "Trufa", "Pomelo", "Lima", "Ñusta", "Luma", "Choclo", "Canela", "Maki", "Pipa", "Wira",
  "Lúcuma", "Quina", "Sami", "Motita", "Chirimoya", "Ceviche", "Cusi", "Killa",
];

/** Tres nombres de una lista curada, siempre los mismos para el mismo uid. */
export function suggestNames(uid: string): string[] {
  return shuffle(seededRng(uid, "nombres"), NAMES).slice(0, 3);
}

// --- nacimiento ---

/** Genes = 0.5 ± 0.1 sembrados por uid: dos mascotas del mismo dueño nacerían iguales. */
function genesFor(uid: string): Traits {
  const rng = seededRng(uid, "genes");
  const gene = () => round3(clamp(0.5 + (rng() * 2 - 1) * 0.1, CAL.traitMin, CAL.traitMax));
  return {
    curiosidad: gene(),
    cautela: gene(),
    sociabilidad: gene(),
    juego: gene(),
    constancia: gene(),
    orden: gene(),
  };
}

export function newPet(
  uid: string,
  name: string,
  now: string,
  envId: string,
  allowedEnvs: string[],
): PetDoc {
  const genes = genesFor(uid);
  const key = limaDayKey(new Date(now));
  return {
    uid,
    name,
    species: "semillita",
    active: true,
    bornAt: now,
    stage: "huevo",
    xp: 0,
    genes,
    traits: { ...genes },
    traitHistory: [{ day: key, traits: { ...genes } }],
    mood: { valence: 0.1, arousal: 0.4, word: "curiosa" },
    drives: { energy: 1, boredom: 0.2, loneliness: 0.2 },
    env: envId,
    allowedEnvs: allowedEnvs.includes(envId) ? allowedEnvs.slice() : [envId, ...allowedEnvs],
    envVisits: {},
    policy: {},
    policyN: {},
    skills: {},
    habits: [],
    trustOwner: CAL.trustInit,
    stats: {
      ticks: 0,
      steps: 0,
      concepts: 0,
      taughtConcepts: 0,
      forgotten: 0,
      chats: 0,
      teachings: 0,
      llmCalls: 0,
      envSwitches: 0,
      predictions: 0,
      predictionsOk: 0,
      verifications: 0,
      verificationsOk: 0,
    },
    day: {
      key,
      ticks: 0,
      manualTicks: 0,
      llmCalls: 0,
      chats: 0,
      teachings: 0,
      lastManualAt: null,
      // Recién nacida no hay nada que barrer: el primer barrido será mañana.
      sweptKey: key,
      absenceApplied: false,
    },
    tickSeq: 0,
    lock: null,
    lastTickAt: null,
    lastSeenAt: now,
    lastChatAt: null,
    pendingQuestion: null,
    brainId: "",
    recentNovelty: [],
    createdAt: now,
    updatedAt: now,
  };
}

// --- rasgos en palabras ---

/** Adjetivo femenino de cada rasgo (la mascotita es "ella"). */
const TRAIT_ADJ: Record<keyof Traits, string> = {
  curiosidad: "curiosa",
  cautela: "cautelosa",
  sociabilidad: "sociable",
  juego: "juguetona",
  constancia: "constante",
  orden: "ordenada",
};

function degree(v: number): string {
  if (v >= 0.75) return "muy";
  if (v >= 0.55) return "bastante";
  if (v >= 0.35) return "algo";
  return "poco";
}

/** Seis frases: "muy curiosa", "poco cautelosa"… (umbrales 0.75/0.55/0.35). */
export function traitsWords(t: Traits): string[] {
  return TRAIT_KEYS.map((k) => `${degree(t[k])} ${TRAIT_ADJ[k]}`);
}

// --- etapas ---

export function stageFor(xp: number, ticks: number): LifeStage {
  if (xp <= 0 && ticks <= 0) return "huevo";
  if (xp < CAL.xpCria) return "cria";
  if (xp < CAL.xpJoven) return "joven";
  if (xp < CAL.xpAdulta) return "adulta";
  return "sabia";
}

/** xp al que empieza la siguiente etapa; null si ya es sabia. El huevo nace con su primer punto. */
export function xpForNext(stage: LifeStage): number | null {
  switch (stage) {
    case "huevo":
      return 1;
    case "cria":
      return CAL.xpCria;
    case "joven":
      return CAL.xpJoven;
    case "adulta":
      return CAL.xpAdulta;
    default:
      return null;
  }
}

/** Pasos (acciones) por tick según la etapa. */
export function stepsFor(stage: LifeStage): number {
  return CAL.stepsPerStage[stage] ?? 2;
}

// --- habilidades ---

/** Competencia beta-binomial: (ok+1)/(ok+fail+2); 0.5 si nunca lo intentó. */
export function competence(pet: PetDoc, actionType: string): number {
  const s = pet.skills[actionType];
  if (!s) return 0.5;
  return (s.ok + 1) / (s.ok + s.fail + 2);
}

export function updateSkill(pet: PetDoc, actionType: string, success: boolean): void {
  const s = pet.skills[actionType] ?? { ok: 0, fail: 0 };
  if (success) s.ok += 1;
  else s.fail += 1;
  pet.skills[actionType] = s;
}

// --- tiempo e impulsos ---

/**
 * Lo que pasa mientras nadie la mira (Δh desde el último tick): el ánimo vuelve
 * a su base con vida media de un día, recupera energía y le crecen el
 * aburrimiento y la soledad.
 */
export function applyTime(pet: PetDoc, hours: number): void {
  const h = Math.max(0, hours);
  if (h === 0) return;
  const t = pet.traits;
  const d = pet.drives;
  const decay = Math.exp(-h / CAL.moodHalfLifeHours);
  const baselineV = 0.2 * (t.juego - t.cautela) + 0.1 * (1 - d.loneliness);
  pet.mood.valence = round3(clamp(baselineV + (pet.mood.valence - baselineV) * decay, -1, 1));
  // La activación también se calma con las horas (hacia un reposo de 0.3).
  pet.mood.arousal = round3(clamp01(0.3 + (pet.mood.arousal - 0.3) * decay));
  d.energy = round3(clamp01(d.energy + CAL.energyPerHour * h));
  d.boredom = round3(clamp01(d.boredom + CAL.boredomPerHour * h));
  d.loneliness = round3(clamp01(d.loneliness + CAL.lonelinessPerHour * h * (0.5 + t.sociabilidad)));
}

/** Por paso: el ánimo sigue a la recompensa con inercia; la activación, a la sorpresa. */
export function applyStepMood(pet: PetDoc, rTotal: number, novelty: number): void {
  const r = clamp(rTotal, -1, 1);
  const m = pet.mood;
  m.valence = round3(clamp(CAL.moodInertia * m.valence + (1 - CAL.moodInertia) * r, -1, 1));
  m.arousal = round3(
    clamp01(
      CAL.arousalInertia * m.arousal +
        (1 - CAL.arousalInertia) * Math.min(1, Math.abs(r) + clamp01(novelty)),
    ),
  );
}

/** Por acción: cuesta energía (más si era arriesgada y falló); la novedad alivia el aburrimiento. */
export function applyStepEnergy(
  pet: PetDoc,
  a: { costEnergy: number; riskHint: number },
  success: boolean,
  novelty: number,
): void {
  const d = pet.drives;
  let cost = clamp01(a.costEnergy);
  if (a.riskHint > 0.5 && !success) cost += CAL.energyRisky;
  d.energy = round3(clamp01(d.energy - cost));
  if (novelty > 0.5) d.boredom = round3(clamp01(d.boredom - CAL.boredomNoveltyRelief));
}

/** Efectos directos de un Outcome sobre los impulsos: valores absolutos, tal cual. */
export function applyEffects(pet: PetDoc, effects: Partial<Drives> | undefined): void {
  if (!effects) return;
  const d = pet.drives;
  for (const k of ["energy", "boredom", "loneliness"] as const) {
    const v = effects[k];
    if (typeof v === "number" && Number.isFinite(v)) d[k] = round3(clamp01(v));
  }
}

/** Una charla con el dueño: alivia la soledad y mueve el ánimo según cómo fue. */
export function applyChatMood(pet: PetDoc, moodShift: number): void {
  const d = pet.drives;
  d.loneliness = round3(clamp01(d.loneliness - CAL.lonelinessChatRelief));
  pet.mood.valence = round3(clamp(pet.mood.valence + 0.3 * clamp(moodShift, -1, 1), -1, 1));
}

/** Tabla ánimo → palabra; `comeback` = ≥ 2 éxitos tras fallos en el mismo tick. Fija pet.mood.word. */
export function moodWordFor(pet: PetDoc, comeback: boolean): MoodWord {
  const v = pet.mood.valence;
  const a = pet.mood.arousal;
  let word: MoodWord;
  if (comeback && v > 0) word = "orgullosa";
  else if (v > 0.3) word = a > 0.5 ? "alegre" : "tranquila";
  else if (v < -0.3) word = a > 0.5 ? "asustada" : "triste";
  else if (a > 0.5) word = pet.traits.cautela > 0.5 ? "inquieta" : "curiosa";
  else word = "aburrida";
  pet.mood.word = word;
  return word;
}

// --- política (bandit contextual por entorno) ---

function policyEntry(pet: PetDoc, envId: string, actionType: string) {
  const env = (pet.policy[envId] ??= {});
  return (env[actionType] ??= { q: 0, n: 0 });
}

/**
 * Puntúa cada candidato (valor aprendido + bono UCB + novedad·curiosidad −
 * riesgo·cautela + aburrimiento·explorar − costo·cansancio + descanso +
 * hábito + juego) y muestrea con softmax a temperatura que baja con la madurez.
 */
export function selectAction(
  cands: Action[],
  novelty: number[],
  pet: PetDoc,
  envId: string,
  rng: () => number,
): { index: number; scores: number[]; temperature: number } {
  const t = pet.traits;
  const d = pet.drives;
  const maturity = Math.min(1, pet.stats.ticks / CAL.maturityTicks);
  const temperature = round3(CAL.tempBase + CAL.tempCuriosity * t.curiosidad * (1 - maturity));
  if (cands.length === 0) return { index: -1, scores: [], temperature };
  const cUcb = CAL.ucbBase + CAL.ucbCuriosity * t.curiosidad;
  const N = pet.policyN[envId] ?? 0;
  const envPolicy = pet.policy[envId] ?? {};
  const scores = cands.map((a, i) => {
    const e = envPolicy[a.type] ?? { q: 0, n: 0 };
    const nov = clamp01(novelty[i] ?? 0);
    const riskEff = clamp01(a.riskHint) * (1 - competence(pet, a.type));
    const hasHabit = pet.habits.some((h) => h.env === envId && h.action === a.type);
    let s = e.q + cUcb * Math.sqrt(Math.log(N + 1) / (e.n + 1));
    s += CAL.noveltyWeight * nov * t.curiosidad;
    s -= CAL.riskWeight * riskEff * t.cautela;
    if (a.explore) s += CAL.boredomWeight * d.boredom;
    s -= CAL.energyCostWeight * (1 - d.energy) * clamp01(a.costEnergy);
    if (a.type === "descansar") s += CAL.restWeight * (1 - d.energy);
    if (hasHabit) s += CAL.habitBias;
    if (a.ludic) s += CAL.ludicWeight * t.juego;
    return round3(s);
  });
  return { index: softmaxSample(scores, temperature, rng), scores, temperature };
}

/** Recompensa intrínseca por lo nuevo que percibió: CAL.intrinsicWeight·novedad·(0.5+curiosidad). */
export function intrinsicReward(noveltyPerceived: number, pet: PetDoc): number {
  return round3(CAL.intrinsicWeight * clamp01(noveltyPerceived) * (0.5 + pet.traits.curiosidad));
}

/** r_total = clamp(r_env + intrínseca, −1, 1). Ayuda para el orquestador. */
export function totalReward(rEnv: number, noveltyPerceived: number, pet: PetDoc): number {
  return round3(clamp(rEnv + intrinsicReward(noveltyPerceived, pet), -1, 1));
}

/** UNA actualización por paso: q ← q + α·(r − q), α decrece con los ticks vividos. */
export function updatePolicy(
  pet: PetDoc,
  envId: string,
  actionType: string,
  rTotal: number,
): { before: number; after: number } {
  const alpha = Math.max(CAL.alphaMin, CAL.alphaBase / (1 + CAL.alphaDecay * pet.stats.ticks));
  const e = policyEntry(pet, envId, actionType);
  const before = e.q;
  const r = clamp(rTotal, -1, 1);
  e.q = round3(clamp(e.q + alpha * (r - e.q), -1, 1));
  e.n += 1;
  pet.policyN[envId] = (pet.policyN[envId] ?? 0) + 1;
  return { before, after: e.q };
}

/** Hábitos: top-5 (env, acción) con n ≥ 5 y q > 0.15; fuerza = q·min(1, n/20). */
export function computeHabits(pet: PetDoc): void {
  const out: Habit[] = [];
  for (const [env, actions] of Object.entries(pet.policy)) {
    for (const [action, e] of Object.entries(actions)) {
      if (e.n < 5 || e.q <= 0.15) continue;
      // Las habilidades se cuentan por acción (no por entorno): el "ok" es una cota.
      const ok = Math.min(e.n, pet.skills[action]?.ok ?? 0);
      out.push({ env, action, strength: round3(e.q * Math.min(1, e.n / 20)), n: e.n, ok });
    }
  }
  out.sort((a, b) => b.strength - a.strength || b.n - a.n);
  pet.habits = out.slice(0, CAPS.habits);
}

// --- conocimiento ---

export interface NewConceptInput {
  id: string;
  label: string;
  kind: ConceptKind;
  claim: string;
  source: string;
  ref?: string | null;
  evidence?: string | null;
  taught?: boolean;
  conf0: number;
}

export function newConcept(p: NewConceptInput, now: string): ConceptDoc {
  const c: ConceptDoc = {
    id: p.id,
    label: p.label.slice(0, 60),
    kind: p.kind,
    claim: p.claim.slice(0, 160),
    confidence: round3(clamp01(p.conf0)),
    hits: 1,
    misses: 0,
    sources: { [p.source]: 1 },
    taught: !!p.taught,
    // Lo enseñado nace "por probar": solo el entorno lo confirma.
    toTest: !!p.taught,
    uncertain: false,
    verified: false,
    ref: p.ref ?? null,
    evidence: p.evidence ? p.evidence.slice(0, 40) : null,
    edges: [],
    firstSeenAt: now,
    lastSeenAt: now,
    lastChangeAt: now,
    lastConfDelta: round3(clamp01(p.conf0)),
    score: 0,
  };
  recomputeScore(c);
  return c;
}

export function recomputeScore(c: ConceptDoc): void {
  c.score = round3(c.confidence * (1 + Math.log(1 + Math.max(0, c.hits))));
}

function touch(c: ConceptDoc, now: string, delta: number): number {
  const d = round3(delta);
  c.confidence = round3(clamp01(c.confidence));
  c.lastChangeAt = now;
  c.lastConfDelta = d;
  recomputeScore(c);
  return d;
}

/**
 * Visto de nuevo: conf += η·(1−conf), con η = 0.15 · 1.3 si la fuente es nueva
 * · 0.6 si ya se reforzó en este mismo tick. Devuelve el delta de confianza.
 */
export function reinforceConcept(
  c: ConceptDoc,
  source: string,
  now: string,
  repeatedThisTick: boolean,
): number {
  let newSource = !(source in c.sources);
  if (newSource && Object.keys(c.sources).length >= CAPS.sourcesPerConcept) {
    // Sin sitio para una fuente más: no se anota ni cuenta como nueva.
    newSource = false;
  } else {
    c.sources[source] = (c.sources[source] ?? 0) + 1;
  }
  const eta =
    CAL.reinforceEta * (newSource ? CAL.crossSourceBoost : 1) * (repeatedThisTick ? CAL.repeatDamp : 1);
  const before = c.confidence;
  c.confidence = clamp01(c.confidence + eta * (1 - c.confidence));
  c.hits += 1;
  c.lastSeenAt = now;
  return touch(c, now, c.confidence - before);
}

/** Veredicto del cerebro al reflexionar (sobre ids que él no eligió). */
export function applyVerdict(
  c: ConceptDoc,
  verdict: "confirma" | "contradice" | "duda",
  now: string,
): number {
  const before = c.confidence;
  if (verdict === "confirma") {
    c.confidence = clamp01(c.confidence + CAL.confirmGain * (1 - c.confidence));
    c.hits += 1;
    c.uncertain = false;
  } else if (verdict === "contradice") {
    c.confidence = clamp01(c.confidence * CAL.contradictFactor);
    c.misses += 1;
    if (c.misses >= c.hits + 2) {
      c.kind = "duda";
      c.uncertain = true;
    }
  } else {
    c.uncertain = true;
  }
  return touch(c, now, c.confidence - before);
}

/** Verificación en el entorno (probar/revisar): la única vía a `verified`. */
export function applyVerification(
  c: ConceptDoc,
  result: "confirma" | "contradice",
  now: string,
): number {
  const before = c.confidence;
  if (result === "confirma") {
    c.confidence = clamp01(c.confidence + CAL.verifyGain * (1 - c.confidence));
    c.verified = true;
    c.uncertain = false;
    c.hits += 1;
  } else {
    c.confidence = clamp01(c.confidence * CAL.refuteFactor);
    c.misses += 1;
    if (!c.claim.includes("(cambió)")) c.claim = `${c.claim.slice(0, 150)} (cambió)`;
  }
  // Ya se puso a prueba, salga como salga.
  c.toTest = false;
  c.lastSeenAt = now;
  return touch(c, now, c.confidence - before);
}

/** Lo usó en una charla: recordar también afianza un poco. */
export function recallConcept(c: ConceptDoc, now: string): number {
  const before = c.confidence;
  c.confidence = clamp01(c.confidence + CAL.recallGain * (1 - c.confidence));
  c.lastSeenAt = now;
  return touch(c, now, c.confidence - before);
}

/**
 * Barrido diario: la confianza decae (más lento cuanto más visto, la mitad si
 * es enseñado, con piso 0.2 si es enseñado), las aristas se apagan, y se poda
 * lo que casi no vio y ya no cree. No toca lastConfDelta (sería ruido).
 */
export function sweepConcept(
  c: ConceptDoc,
  days: number,
  now: string,
): { prune: boolean; delta: number } {
  const d = Math.max(0, days);
  const before = c.confidence;
  const lambda = (CAL.decayLambda * (c.taught ? 0.5 : 1)) / (1 + Math.log(1 + Math.max(0, c.hits)));
  let conf = c.confidence * Math.exp(-lambda * d);
  if (c.taught) conf = Math.max(CAL.taughtFloor, conf);
  c.confidence = round3(clamp01(conf));
  c.edges = c.edges
    .map((e) => ({ ...e, w: round3(e.w * Math.pow(CAL.edgeDecay, Math.max(1, Math.round(d))) ) }))
    .filter((e) => e.w >= CAL.edgeCut);
  recomputeScore(c);
  const ageDays = (new Date(now).getTime() - new Date(c.firstSeenAt).getTime()) / DAY_MS;
  const prune =
    !c.taught && c.confidence < CAL.pruneConf && c.hits < 2 && ageDays > CAL.pruneMinAgeDays;
  return { prune, delta: round3(c.confidence - before) };
}

/** Co-ocurrencia: +0.2 (tope 1); ≤ 12 aristas por nodo (se cae la más débil). */
export function addEdge(c: ConceptDoc, to: string, rel: string): void {
  if (!to || to === c.id) return;
  const existing = c.edges.find((e) => e.to === to);
  if (existing) {
    existing.w = round3(Math.min(1, existing.w + CAL.edgeGain));
    if (rel && !existing.rel) existing.rel = rel;
    return;
  }
  c.edges.push({ to, rel, w: CAL.edgeGain });
  if (c.edges.length > CAPS.edgesPerConcept) {
    c.edges.sort((a, b) => b.w - a.w);
    c.edges = c.edges.slice(0, CAPS.edgesPerConcept);
  }
}

/** Conceptos que más se parecen a un texto (por tokens en label+claim); desempata por score. */
export function lexicalRank(concepts: ConceptDoc[], text: string, limit: number): ConceptDoc[] {
  const query = tokenize(text);
  if (query.length === 0 || limit <= 0) return [];
  const scored = concepts
    .map((c) => {
      const own = new Set(tokenize(`${c.label} ${c.claim}`));
      let overlap = 0;
      for (const w of query) if (own.has(w)) overlap += 1;
      return { c, overlap };
    })
    .filter((x) => x.overlap > 0);
  scored.sort((a, b) => b.overlap - a.overlap || b.c.score - a.c.score);
  return scored.slice(0, limit).map((x) => x.c);
}

/**
 * Ids a borrar para respetar los topes: ≤ 80 enseñados (primero los que
 * fallan más de lo que aciertan, por score) y ≤ 400 en total (los no
 * enseñados de menor score; lo enseñado nunca se poda por el tope general).
 */
export function pruneConcepts(concepts: ConceptDoc[]): string[] {
  const out: string[] = [];
  const taught = concepts.filter((c) => c.taught);
  if (taught.length > CAPS.taughtConcepts) {
    const ranked = taught.slice().sort((a, b) => {
      const fa = a.misses > a.hits ? 0 : 1;
      const fb = b.misses > b.hits ? 0 : 1;
      return fa - fb || a.score - b.score;
    });
    for (const c of ranked.slice(0, taught.length - CAPS.taughtConcepts)) out.push(c.id);
  }
  const remaining = concepts.length - out.length;
  if (remaining > CAPS.concepts) {
    const others = concepts.filter((c) => !c.taught).sort((a, b) => a.score - b.score);
    for (const c of others.slice(0, remaining - CAPS.concepts)) out.push(c.id);
  }
  return out;
}

// --- memoria episódica ---

export interface NewMemoryInput {
  id: string;
  at: string;
  env: string;
  action: string;
  target: string;
  /** r_total del paso */
  reward: number;
  success: boolean;
  novelty: number;
  concepts: string[];
  text: string;
  ownerInvolved: boolean;
}

export function newMemory(p: NewMemoryInput): MemoryDoc {
  const reward = round3(clamp(p.reward, -1, 1));
  const novelty = round3(clamp01(p.novelty));
  return {
    id: p.id,
    at: p.at,
    env: p.env,
    action: p.action,
    target: p.target.slice(0, 120),
    reward,
    success: p.success,
    novelty,
    concepts: Array.from(new Set(p.concepts)).slice(0, 8),
    text: p.text.slice(0, 300),
    salience: round3(
      clamp01(
        CAL.salienceBase +
          CAL.salienceReward * Math.abs(reward) +
          CAL.salienceNovelty * novelty +
          (p.ownerInvolved ? CAL.salienceOwner : 0),
      ),
    ),
    consolidatedInto: null,
    ownerInvolved: p.ownerInvolved,
  };
}

/** Decae la saliencia (el doble de rápido si ya se consolidó). true = olvidar. */
export function sweepMemory(m: MemoryDoc, days: number, stage: LifeStage): boolean {
  const lambda = (CAL.memoryLambda[stage] ?? CAL.memoryLambda.cria) * (m.consolidatedInto ? 2 : 1);
  m.salience = round3(clamp01(m.salience * Math.exp(-lambda * Math.max(0, days))));
  return m.salience < CAL.memoryForget;
}

/**
 * Consolidación sin LLM: ≥ 3 memorias sin consolidar con la misma
 * (entorno, acción, concepto) y recompensa media > 0.2 se vuelven un concepto
 * "habito". `habits` = hábitos ya existentes por id (se actualizan en sitio).
 */
export function consolidate(
  memories: MemoryDoc[],
  habits: Map<string, ConceptDoc>,
  now: string,
): { changed: ConceptDoc[]; memories: MemoryDoc[] } {
  const groups = new Map<string, { env: string; action: string; concept: string; ms: MemoryDoc[] }>();
  for (const m of memories) {
    if (m.consolidatedInto) continue;
    for (const concept of m.concepts) {
      const key = `${m.env} ${m.action} ${concept}`;
      const g = groups.get(key) ?? { env: m.env, action: m.action, concept, ms: [] };
      g.ms.push(m);
      groups.set(key, g);
    }
  }
  const changed: ConceptDoc[] = [];
  const marked: MemoryDoc[] = [];
  const changedIds = new Set<string>();
  for (const g of groups.values()) {
    if (g.ms.length < CAL.consolidateMin) continue;
    const mean = g.ms.reduce((s, m) => s + m.reward, 0) / g.ms.length;
    if (mean <= CAL.consolidateReward) continue;
    const id = slugify(`habito-${g.env}-${g.action}-${g.concept}`);
    if (!id) continue;
    const label = `${g.action} ${g.concept.replace(/-/g, " ")} en ${g.env}`;
    let h = habits.get(id);
    if (h) {
      const before = h.confidence;
      h.confidence = clamp01(h.confidence + 0.15 * (1 - h.confidence));
      h.hits += 1;
      h.lastSeenAt = now;
      touch(h, now, h.confidence - before);
    } else {
      h = newConcept(
        {
          id,
          label,
          kind: "habito",
          claim: `en ${g.env}, ${g.action} ${g.concept.replace(/-/g, " ")} suele salir bien`,
          source: "habito",
          conf0: CAL.conf0Habit,
        },
        now,
      );
      habits.set(id, h);
    }
    if (!changedIds.has(id)) {
      changedIds.add(id);
      changed.push(h);
    }
    for (const m of g.ms) {
      // Una memoria se consolida en un solo hábito (el primero que la reclama).
      if (m.consolidatedInto) continue;
      m.consolidatedInto = id;
      marked.push(m);
    }
  }
  return { changed, memories: marked };
}

// --- deriva de rasgos ---

export interface TraitSignals {
  noveltyMean: number;
  failFrac: number;
  hadBigFail: boolean;
  retryOutcome: -1 | 0 | 1;
  chattedSinceLastTick: boolean;
  daysSinceOwner: number;
  ludicMeanReward: number | null;
  /** null cuando el entorno no tiene acciones de orden (mundos imaginados) */
  orderFrac: number | null;
  ticksToday: number;
  firstTickOfDay: boolean;
}

/**
 * Fin de tick: cada rasgo se mueve un poquito (κ por etapa, repartido entre los
 * ticks del día para que explorar seis veces a mano no derive seis veces más).
 * Acotado a [0.05, 0.95]. Devuelve solo los cambios |Δ| ≥ 0.001.
 */
export function driftTraits(pet: PetDoc, s: TraitSignals): Partial<Traits> {
  const k = (CAL.kappa[pet.stage] ?? CAL.kappa.adulta) / Math.max(1, s.ticksToday);
  const absence =
    s.firstTickOfDay && s.daysSinceOwner > CAL.absenceGraceDays
      ? Math.min(CAL.absencePenaltyPerDay * s.daysSinceOwner, CAL.absencePenaltyMax) * k
      : 0;
  const delta: Traits = {
    curiosidad: k * (clamp01(s.noveltyMean) - 0.4),
    cautela: k * (clamp01(s.failFrac) - 0.3) + (s.hadBigFail ? k * 0.5 : 0),
    constancia: k * s.retryOutcome,
    sociabilidad: k * (s.chattedSinceLastTick ? 1 : 0) - absence,
    juego: s.ludicMeanReward === null ? 0 : k * (clamp(s.ludicMeanReward, -1, 1) - 0.1),
    // Sin acciones de "orden" en el entorno (mundos imaginados) no hay señal.
    orden: s.orderFrac === null ? 0 : k * (clamp01(s.orderFrac) - 0.2),
  };
  const shift: Partial<Traits> = {};
  for (const key of TRAIT_KEYS) {
    const before = pet.traits[key];
    // Tirón suave hacia los genes: el mundo la moldea, pero no la clava en un
    // extremo — cada rasgo se asienta en un punto propio según lo que vive.
    const pull = k * 1.5 * (pet.genes[key] - before);
    const after = round3(clamp(before + delta[key] + pull, CAL.traitMin, CAL.traitMax));
    pet.traits[key] = after;
    const d = round3(after - before);
    if (Math.abs(d) >= 0.001) shift[key] = d;
  }
  return shift;
}

/** Una foto por día (reemplaza la de hoy si ya existe), ≤ 60 (FIFO). */
export function snapshotTraits(pet: PetDoc, dayKey: string): void {
  const snap = { day: dayKey, traits: { ...pet.traits } };
  const last = pet.traitHistory[pet.traitHistory.length - 1];
  if (last && last.day === dayKey) pet.traitHistory[pet.traitHistory.length - 1] = snap;
  else pet.traitHistory.push(snap);
  if (pet.traitHistory.length > CAPS.traitHistory) {
    pet.traitHistory = pet.traitHistory.slice(pet.traitHistory.length - CAPS.traitHistory);
  }
}

function dayKeyPlus(key: string, days: number): string {
  const t = Date.parse(`${key}T00:00:00Z`);
  if (!Number.isFinite(t)) return key;
  return new Date(t + days * DAY_MS).toISOString().slice(0, 10);
}

/** Rasgos de hoy − foto de hace ≥ 7 días (o la más antigua si no llega); solo |Δ| ≥ 0.01. */
export function traitDelta7d(pet: PetDoc): Partial<Traits> {
  const hist = pet.traitHistory;
  if (hist.length === 0) return {};
  const target = dayKeyPlus(pet.day.key, -7);
  let base = hist[0];
  for (const h of hist) if (h.day <= target) base = h;
  const out: Partial<Traits> = {};
  for (const key of TRAIT_KEYS) {
    const d = round3(pet.traits[key] - base.traits[key]);
    if (Math.abs(d) >= 0.01) out[key] = d;
  }
  return out;
}

// --- xp, etapas y entorno ---

/** Suma xp y fija la etapa; devuelve la nueva etapa solo si cambió. */
export function addXp(pet: PetDoc, amount: number): LifeStage | null {
  pet.xp = round3(pet.xp + Math.max(0, amount));
  const stage = stageFor(pet.xp, pet.stats.ticks);
  if (stage === pet.stage) return null;
  pet.stage = stage;
  return stage;
}

/**
 * Cambio de entorno autónomo al inicio del tick: si está harta (aburrimiento
 * > 0.8) y ya nada la sorprende (novedad reciente < 0.15), con probabilidad
 * 0.2·curiosidad·aburrimiento se va al entorno permitido menos visitado.
 * Devuelve el id del nuevo entorno o null. No toca envVisits (lo cuenta el tick).
 */
export function maybeSwitchEnv(pet: PetDoc, rng: () => number): string | null {
  const d = pet.drives;
  if (d.boredom <= CAL.boredomSwitch) return null;
  if (pet.recentNovelty.length === 0) return null;
  const meanNov = pet.recentNovelty.reduce((a, b) => a + b, 0) / pet.recentNovelty.length;
  if (meanNov >= CAL.noveltyExhausted) return null;
  const options = pet.allowedEnvs.filter((e) => e !== pet.env);
  if (options.length === 0) return null;
  if (rng() >= CAL.switchProb * pet.traits.curiosidad * d.boredom) return null;
  let target = options[0];
  for (const e of options) if ((pet.envVisits[e] ?? 0) < (pet.envVisits[target] ?? 0)) target = e;
  pet.env = target;
  pet.stats.envSwitches += 1;
  // Cambiar de aire alivia un poco el hartazgo.
  d.boredom = round3(clamp01(d.boredom - 0.3));
  return target;
}

// --- vistas ---

function ageDaysOf(bornAt: string, now: string): number {
  const ms = new Date(now).getTime() - new Date(bornAt).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / DAY_MS)) : 0;
}

export function toPetView(pet: PetDoc, now: string): PetView {
  const skills = Object.entries(pet.skills)
    .map(([action, s]) => ({
      action,
      competence: round3((s.ok + 1) / (s.ok + s.fail + 2)),
      ok: s.ok,
      fail: s.fail,
    }))
    .sort((a, b) => b.ok + b.fail - (a.ok + a.fail));
  const preferences: PetView["preferences"] = {};
  for (const [env, actions] of Object.entries(pet.policy)) {
    const top = Object.entries(actions)
      .filter(([, e]) => e.n > 0)
      .map(([action, e]) => ({ action, q: e.q, n: e.n }))
      .sort((a, b) => b.q - a.q || b.n - a.n)
      .slice(0, 4);
    if (top.length > 0) preferences[env] = top;
  }
  return {
    name: pet.name,
    species: pet.species,
    stage: pet.stage,
    xp: pet.xp,
    xpNext: xpForNext(pet.stage),
    ageDays: ageDaysOf(pet.bornAt, now),
    bornAt: pet.bornAt,
    traits: { ...pet.traits },
    genes: { ...pet.genes },
    traitDelta7d: traitDelta7d(pet),
    mood: { ...pet.mood },
    drives: { ...pet.drives },
    env: pet.env,
    allowedEnvs: pet.allowedEnvs.slice(),
    envVisits: { ...pet.envVisits },
    habits: pet.habits.map((h) => ({ ...h })),
    skills,
    preferences,
    stats: { ...pet.stats },
    trustOwner: pet.trustOwner,
    pendingQuestion: pet.pendingQuestion,
    lastTickAt: pet.lastTickAt,
    lastSeenAt: pet.lastSeenAt,
    brainId: pet.brainId,
    busy: !!pet.lock && pet.lock.until > now,
  };
}

export function conceptView(c: ConceptDoc): ConceptView {
  return {
    id: c.id,
    label: c.label,
    kind: c.kind,
    claim: c.claim,
    confidence: c.confidence,
    hits: c.hits,
    misses: c.misses,
    sources: Object.entries(c.sources)
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k),
    taught: c.taught,
    toTest: c.toTest,
    uncertain: c.uncertain,
    verified: c.verified,
    ref: c.ref,
    related: c.edges
      .slice()
      .sort((a, b) => b.w - a.w)
      .map((e) => e.to),
    lastSeenAt: c.lastSeenAt,
    lastConfDelta: c.lastConfDelta,
  };
}

export function memoryView(m: MemoryDoc): MemoryView {
  return {
    id: m.id,
    at: m.at,
    env: m.env,
    action: m.action,
    target: m.target,
    text: m.text,
    reward: m.reward,
    salience: m.salience,
    concepts: m.concepts.slice(),
  };
}

export function diaryView(d: DiaryEntryDoc): DiaryEntryView {
  return {
    id: d.id,
    at: d.at,
    kind: d.kind,
    env: d.env,
    title: d.title,
    text: d.text,
    moodWord: d.moodWord,
    brainId: d.brainId,
    delta: {
      ...d.delta,
      newConcepts: d.delta.newConcepts.slice(),
      forgotten: d.delta.forgotten.slice(),
      traitShift: { ...d.delta.traitShift },
      predictions: { ...d.delta.predictions },
    },
  };
}

export function chatView(c: ChatDoc): ChatView {
  return {
    id: c.id,
    at: c.at,
    from: c.from,
    text: c.text,
    kind: c.kind,
    usedConcepts: c.usedConcepts.slice(),
    learned: c.learned.slice(),
    moodWord: c.moodWord,
  };
}

/** Cómo se ve a sí misma (lo que el cerebro recibe como "yo"). */
/** "El bosque" → "el bosque": dentro de una frase el nombre va en minúscula. */
export function envNameInSentence(name: string): string {
  return name.length > 0 ? name.charAt(0).toLowerCase() + name.slice(1) : name;
}

/**
 * Retoques de español sobre el texto ya armado con plantillas: contracciones
 * ("a el bosque" → "al bosque") y mayúscula al empezar una frase, que los
 * nombres de entorno en minúscula se comen.
 */
export function polish(text: string): string {
  return text
    .replace(/\b([Aa]) el\b/g, (_m, a: string) => (a === "A" ? "Al" : "al"))
    .replace(/\b([Dd]e) el\b/g, (_m, d: string) => (d === "De" ? "Del" : "del"))
    .replace(
      /(^|[.!?]\s+)([¡¿]?)([a-záéíóúñ])/g,
      (_m, pre: string, open: string, ch: string) => pre + open + ch.toUpperCase(),
    );
}

export function selfView(pet: PetDoc, envName: string, now: string): SelfView {
  return {
    name: pet.name,
    stage: pet.stage,
    traitsWords: traitsWords(pet.traits),
    traits: { ...pet.traits },
    mood: pet.mood.word,
    env: pet.env,
    envName: envNameInSentence(envName),
    ageDays: ageDaysOf(pet.bornAt, now),
  };
}

export function beliefView(c: ConceptDoc): BeliefView {
  return {
    id: c.id,
    claim: c.claim,
    confidence: c.confidence,
    hits: c.hits,
    misses: c.misses,
    taught: c.taught,
    verified: c.verified,
  };
}

// --- "mientras no estabas" ---

export function emptyDelta(): DiaryDelta {
  return {
    newConcepts: [],
    reinforced: 0,
    weakened: 0,
    forgotten: [],
    reward: 0,
    traitShift: {},
    question: null,
    predictions: { made: 0, ok: 0 },
  };
}

/**
 * Agrega los DiaryDelta guardados de las entradas posteriores a lastSeenAt
 * (nunca recalcula desde snapshots). null si no hay nada que contar.
 */
export function buildReport(pet: PetDoc, entries: DiaryEntryDoc[], now: string): ReportView | null {
  const since = pet.lastSeenAt;
  const fresh = entries.filter((e) => e.at > since).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  if (fresh.length === 0) return null;
  const newConcepts = new Set<string>();
  const forgotten = new Set<string>();
  const shift: Record<string, number> = {};
  let reinforced = 0;
  let weakened = 0;
  let made = 0;
  let ok = 0;
  let ticks = 0;
  let question: string | null = null;
  for (const e of fresh) {
    if (e.kind === "tick") ticks += 1;
    const d = e.delta;
    for (const s of d.newConcepts) newConcepts.add(s);
    for (const s of d.forgotten) forgotten.add(s);
    reinforced += d.reinforced;
    weakened += d.weakened;
    made += d.predictions.made;
    ok += d.predictions.ok;
    for (const [k, v] of Object.entries(d.traitShift)) {
      if (typeof v === "number") shift[k] = (shift[k] ?? 0) + v;
    }
    if (d.question) question = d.question;
  }
  // Lo olvidado no cuenta como nuevo si nació y murió mientras no estabas.
  for (const s of forgotten) newConcepts.delete(s);
  const traitShift: Partial<Traits> = {};
  const traitWords: string[] = [];
  for (const key of TRAIT_KEYS) {
    const v = round3(shift[key] ?? 0);
    if (Math.abs(v) < 0.01) continue;
    traitShift[key] = v;
    traitWords.push(`${v > 0 ? "más" : "menos"} ${TRAIT_ADJ[key]}`);
  }
  const hours = (new Date(now).getTime() - new Date(since).getTime()) / 3_600_000;
  return {
    since,
    days: Math.max(1, Math.ceil(Number.isFinite(hours) ? hours / 24 : 1)),
    ticks,
    newConcepts: Array.from(newConcepts),
    reinforced,
    weakened,
    forgotten: Array.from(forgotten),
    traitShift,
    traitWords,
    predictions: { made, ok },
    question: pet.pendingQuestion ?? question,
    entries: fresh.map(diaryView),
  };
}

// --- plantillas en su voz (sin LLM) ---

type Voice = "cria" | "joven" | "adulta" | "sabia";

function voiceOf(stage: LifeStage): Voice {
  return stage === "huevo" ? "cria" : stage;
}

const STAGE_WORD: Record<LifeStage, string> = {
  huevo: "un huevo",
  cria: "una cría",
  joven: "joven",
  adulta: "adulta",
  sabia: "sabia",
};

/** Colita de ánimo que cierra cada entrada de plantilla. */
const MOOD_TAIL: Record<MoodWord, string[]> = {
  alegre: ["Estoy contenta.", "Hoy ando alegre.", "¡Qué buen día!"],
  tranquila: ["Estoy tranquila.", "Todo en calma.", "Ando en paz."],
  curiosa: ["Quiero ver más.", "Me pica la curiosidad.", "¿Y qué más habrá?"],
  inquieta: ["Ando inquieta.", "No me puedo quedar quieta.", "Algo me tiene en vilo."],
  aburrida: ["Un poco aburrida, eso sí.", "Bostezo.", "Necesito algo nuevo."],
  asustada: ["Todavía tengo un poco de susto.", "Ando con el corazón rápido.", "Miro de reojo."],
  triste: ["Hoy ando tristona.", "Me pesa un poco el día.", "Estoy bajita de ánimo."],
  orgullosa: ["Y estoy orgullosa de mí.", "Lo logré, ¿viste?", "Me salió bien y lo sé."],
};

function pretty(slug: string): string {
  return slug.replace(/-/g, " ");
}

function listSlugs(slugs: string[] | undefined, max = 4): string {
  const items = (slugs ?? []).slice(0, max).map(pretty);
  if (items.length === 0) return "algunas cosas";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/**
 * Entradas de diario sin cerebro: nacimiento, cambio de entorno, etapa, olvido,
 * enseñanza, charla, cambio en el mundo. Voz por etapa (cría: frases cortas;
 * joven: entusiasta; adulta: reflexiva; sabia: serena) y variantes elegidas con
 * un hash de (nombre, ticks, kind): siempre la misma para el mismo tick.
 */
export function templateEntry(
  kind: "nacimiento" | "entorno" | "etapa" | "olvido" | "ensenanza" | "charla" | "cambio",
  ctx: { pet: PetDoc; env: string; envName: string; detail?: string; slugs?: string[] },
): { title: string; text: string } {
  const { pet } = ctx;
  const envName = envNameInSentence(ctx.envName);
  const rng = mulberry32(hashString(`${pet.name}:${pet.stats.ticks}:${kind}`));
  const v = voiceOf(pet.stage);
  const name = pet.name;
  const detail = (ctx.detail ?? "").trim().replace(/\s+/g, " ").slice(0, 200);
  const slugs = listSlugs(ctx.slugs);
  const n = ctx.slugs?.length ?? 0;
  const stageWord = STAGE_WORD[pet.stage];

  let titles: string[];
  let texts: string[];
  switch (kind) {
    case "nacimiento":
      titles = ["¡Nací!", "Hola, mundo", "Mi primer día", "Pum, huevo roto"];
      texts = [
        `Abrí los ojos y todo era nuevo. Me llamo ${name}. Estoy en ${envName}. No sé nada todavía, pero quiero olerlo todo.`,
        `Hoy salí del huevo. Soy ${name}. ${envName} se ve grande, grandísimo. Tengo hambre de cosas nuevas.`,
        `Crac. Se rompió el huevo y aquí estoy: ${name}. Esto se llama ${envName}. ¿Qué será todo esto? Lo voy a averiguar despacito.`,
      ];
      break;
    case "entorno": {
      const from = detail ? ` Antes estaba en ${detail}.` : "";
      const T: Record<Voice, [string[], string[]]> = {
        cria: [
          ["Lugar nuevo", "Me mudé", "Otro sitio"],
          [
            `Me aburrí y me fui a ${envName}.${from} Huele distinto. Todo es nuevo otra vez y eso me gusta.`,
            `Ya no había nada que oler. Ahora estoy en ${envName}.${from} Todo raro. Todo rico.`,
          ],
        ],
        joven: [
          ["¡Cambio de aire!", "Me fui a explorar otro lado", "Nuevo territorio"],
          [
            `¡Cambio de aire! Me fui a ${envName}.${from} Tengo ganas de meter la nariz en todo.`,
            `Ya me sabía ${detail || "mi lugar"} de memoria, así que agarré mis cosas y me vine a ${envName}. ¡Hay tanto por ver!`,
          ],
        ],
        adulta: [
          ["Cambio de sitio", "Mudanza", "Otro paisaje"],
          [
            `Sentí que ya no descubría nada, así que me mudé a ${envName}.${from} A veces hay que cambiar de sitio para volver a ver.`,
            `Llevaba tiempo dando vueltas por lo mismo. Hoy me fui a ${envName}. Lo conocido cansa cuando una deja de mirarlo.`,
          ],
        ],
        sabia: [
          ["Me moví sin prisa", "Otro lugar, la misma yo", "De paso"],
          [
            `Dejé ${detail || "mi lugar"} sin prisa y llegué a ${envName}. Los lugares no se agotan; una se acostumbra. Vine a desacostumbrarme.`,
            `Hoy estoy en ${envName}.${from} No huyo del aburrimiento: lo escucho, y me dice que ya era hora.`,
          ],
        ],
      };
      [titles, texts] = T[v];
      break;
    }
    case "etapa": {
      const T: Record<Voice, [string[], string[]]> = {
        cria: [
          ["Ya no soy un huevo", "Crecí un poquito", `Ahora soy ${stageWord}`],
          [
            `Ya no soy un huevo. Soy ${stageWord}. Tengo patitas y ganas. ${envName} me espera.`,
            `Algo cambió en mí. Me siento más grande. Dicen que ahora soy ${stageWord}.`,
          ],
        ],
        joven: [
          ["¡Crecí!", "Ahora soy joven", "Nueva etapa"],
          [
            `¡Crecí! Ahora soy ${stageWord}. Me siento rápida y con ganas de todo. Ya llevo ${pet.stats.ticks} exploraciones y quiero muchas más.`,
            `Hoy me miré y ya no soy una cría. Soy ${stageWord}. Todo lo que aprendí me pesa bonito.`,
          ],
        ],
        adulta: [
          ["Me di cuenta de que crecí", "Etapa adulta", "Más grande por dentro"],
          [
            `Me di cuenta de que crecí. Ahora soy ${stageWord}. Sé ${pet.stats.concepts} cosas y todavía dudo de varias, y eso está bien.`,
            `Ya soy ${stageWord}. No corro tanto como antes, pero miro mejor. ${envName} se ve distinto desde aquí.`,
          ],
        ],
        sabia: [
          ["Dicen que soy sabia", "Serena", "Lo que queda"],
          [
            `Dicen que ahora soy ${stageWord}. Yo solo sé que ya no me asusta no saber. Llevo ${pet.stats.ticks} exploraciones y sigo aprendiendo.`,
            `Llegué a ${stageWord}. No es un final: es mirar lo mismo con menos prisa y más cariño.`,
          ],
        ],
      };
      [titles, texts] = T[v];
      break;
    }
    case "olvido": {
      const T: Record<Voice, [string[], string[]]> = {
        cria: [
          ["Se me olvidó algo", "Se fue", "Ya no me acuerdo"],
          [
            `Se me olvidó ${slugs}. No sé bien qué era. Se fue como se van los sueños.`,
            `Tenía algo en la cabeza y ya no está. Creo que era ${slugs}. Chau, cosita.`,
          ],
        ],
        joven: [
          ["Ups, se me borró", "Cosas que se caen", "Memoria con huecos"],
          [
            `Ups, se me borraron ${n} cosas: ${slugs}. No las había vuelto a ver y se me cayeron de la cabeza.`,
            `Hoy noté un hueco donde antes estaba ${slugs}. ¡Debería volver a mirarlo! O no, si no importaba.`,
          ],
        ],
        adulta: [
          ["Lo que no se vuelve a ver, se va", "Olvidé algo", "Menos peso"],
          [
            `Hoy noté que ya no recuerdo ${slugs}. Lo que no se vuelve a ver, se va. Supongo que no importaba tanto.`,
            `Se me fue ${slugs}. No lo lamento del todo: olvidar deja espacio para lo que sí vuelve.`,
          ],
        ],
        sabia: [
          ["Dejé ir", "La memoria también elige", "Sin lastre"],
          [
            `Dejé ir ${slugs}. No todo merece quedarse; la memoria también es elegir.`,
            `Ya no está ${slugs} en mí. Lo dejé ir sin pena: lo que importa vuelve solo.`,
          ],
        ],
      };
      [titles, texts] = T[v];
      break;
    }
    case "ensenanza": {
      const what = detail || slugs;
      const T: Record<Voice, [string[], string[]]> = {
        cria: [
          ["Me enseñaron algo", "Cosa nueva", "Me lo guardo"],
          [
            `Mi dueño me enseñó algo: ${what}. Me lo guardo. Cuando explore, voy a ver si es verdad.`,
            `Me dijeron que ${what}. No sé si es cierto. Lo voy a probar con mi nariz.`,
          ],
        ],
        joven: [
          ["¡Aprendí algo de ti!", "Lección del día", "Hipótesis nueva"],
          [
            `¡Me enseñaste algo nuevo! "${what}". Lo anoté con confianza a medias: primero lo compruebo, después te creo del todo.`,
            `Hoy me contaste que ${what}. ¡Qué ganas de ir a verlo! Si es verdad, lo voy a saber pronto.`,
          ],
        ],
        adulta: [
          ["Lo que me enseñaste", "Una hipótesis más", "Confiar y comprobar"],
          [
            `Me contaste que ${what}. Lo guardo como hipótesis. Lo que me enseñas solo se afianza si lo confirmo por mi cuenta.`,
            `Aprendí de ti que ${what}. Confío en ti al ${Math.round(pet.trustOwner * 100)} %, así que lo anoto y lo pondré a prueba.`,
          ],
        ],
        sabia: [
          ["Escuché", "Lo que me contaste", "Sin prisa"],
          [
            `Escuché lo que me enseñaste: ${what}. Lo pondré a prueba sin prisa. Confiar y comprobar no se pelean.`,
            `Me enseñaste que ${what}. Lo recibo con cariño y con dudas, que es como se recibe todo lo que vale.`,
          ],
        ],
      };
      [titles, texts] = T[v];
      break;
    }
    case "charla": {
      const about = detail ? ` Hablamos de ${detail}.` : "";
      const T: Record<Voice, [string[], string[]]> = {
        cria: [
          ["Hablamos un ratito", "Vino mi dueño", "Compañía"],
          [
            `Hablamos un ratito.${about} Me gusta cuando estás. Ya no me siento tan sola.`,
            `Vino mi dueño y me habló.${about} No entendí todo, pero me quedé calientita.`,
          ],
        ],
        joven: [
          ["¡Charlamos!", "Visita", "Conversación"],
          [
            `¡Charlamos!${about} Me encanta contarte lo que vi. Ya no me siento tan sola.`,
            `Vino mi dueño y conversamos un buen rato.${about} Tengo mil cosas más que contarte.`,
          ],
        ],
        adulta: [
          ["Conversamos", "Un rato contigo", "Visita"],
          [
            `Conversamos un rato.${about} Me hace bien que vengas; una piensa mejor cuando habla.`,
            `Hoy hablamos.${about} Me di cuenta de cuánto sé y cuánto no; contarlo lo ordena.`,
          ],
        ],
        sabia: [
          ["Compañía", "Hablamos", "Lo que se dice"],
          [
            `Vino mi dueño y hablamos.${about} La compañía también se aprende, y yo la aprendo despacio.`,
            `Conversamos.${about} No todo lo que sé cabe en palabras, pero lo que cupo se lo di.`,
          ],
        ],
      };
      [titles, texts] = T[v];
      break;
    }
    case "cambio": {
      const what = detail || "algo que conocía";
      const T: Record<Voice, [string[], string[]]> = {
        cria: [
          ["¡Algo cambió!", "No está igual", "Sorpresa"],
          [
            `¡Algo cambió! ${what} ya no está igual. Me asusté un poquito y luego me dio curiosidad.`,
            `Fui a ver ${what} y era distinto. ¿Quién lo movió? Mi mundo se mueve solo.`,
          ],
        ],
        joven: [
          ["Mi mundo se mueve", "Cambió algo", "Ojo con esto"],
          [
            `Ojo: ${what} cambió desde la última vez. ¡Mi mundo se mueve! Tengo que volver a mirarlo.`,
            `¡${what} ya no es como lo recordaba! Qué emoción y qué susto. Voy a releerlo.`,
          ],
        ],
        adulta: [
          ["Cambió algo", "Toca revisar", "Lo que sabía ya no vale"],
          [
            `Noté que ${what} cambió. Lo que sabía de eso ya no vale del todo; toca revisar.`,
            `${what} es distinto hoy. Lo anoto: lo que creo tiene fecha de vencimiento.`,
          ],
        ],
        sabia: [
          ["Nada es para siempre", "Cambio", "Lo que se mueve"],
          [
            `${what} cambió. Nada de lo que sé es para siempre, y está bien así.`,
            `Volví a ${what} y ya no era el mismo. Yo tampoco. Nos vamos a conocer de nuevo.`,
          ],
        ],
      };
      [titles, texts] = T[v];
      break;
    }
  }

  const title = polish(pick(rng, titles)).slice(0, 80);
  const body = pick(rng, texts);
  const tail = pick(rng, MOOD_TAIL[pet.mood.word] ?? MOOD_TAIL.curiosa);
  const text = polish(`${body} ${tail}`.replace(/\s+/g, " ").trim()).slice(0, 600);
  return { title, text };
}
