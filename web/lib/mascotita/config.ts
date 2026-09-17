// Configuración y constantes de calibración de la mascotita, en UN solo lugar.
// Los topes vienen de variables de entorno (con defaults pensados para el plan
// Hobby de Vercel + Firestore + Gemini Flash); las constantes de aprendizaje
// (α, κ, η, λ…) viven aquí para poder recalibrarlas tras unas semanas mirando
// traitHistory sin tocar la lógica.

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function list(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export type BrainMode = "gemini" | "simple" | "custom";

/** Se lee en cada llamada (no al importar) para que los tests y Vercel puedan variar el entorno. */
export function cfg() {
  const modeRaw = (process.env.MASCOTITA_BRAIN ?? "").trim().toLowerCase();
  const brainMode: BrainMode =
    modeRaw === "custom" || modeRaw === "simple" || modeRaw === "gemini"
      ? modeRaw
      : process.env.GEMINI_API_KEY
        ? "gemini"
        : "simple";
  return {
    /** uids o correos verificados con permiso; vacío = cualquier usuario con sesión. */
    owners: list("MASCOTITA_OWNERS"),
    brainMode,
    brainUrl: (process.env.MASCOTITA_BRAIN_URL ?? "").trim(),
    brainToken: (process.env.MASCOTITA_BRAIN_TOKEN ?? "").trim(),
    repo: (process.env.MASCOTITA_REPO ?? "domakedev/criteria").trim(),
    repoBranch: (process.env.MASCOTITA_REPO_BRANCH ?? "main").trim(),
    githubToken: (process.env.GITHUB_TOKEN ?? "").trim(),
    cronSecret: process.env.CRON_SECRET ?? "",
    /** ticks por mascota y día (cron + catch-up + manual) */
    maxTicksDay: num("MASCOTITA_MAX_TICKS_DAY", 6),
    /** ticks manuales ("Explorar ahora") por día */
    maxManualTicksDay: num("MASCOTITA_MAX_MANUAL_TICKS_DAY", 4),
    /** llamadas LLM por mascota y día (ticks + charlas + enseñanzas) */
    maxLlmDay: num("MASCOTITA_MAX_LLM_DAY", 40),
    /** llamadas LLM por día sumando TODAS las mascotas (protege la key) */
    maxLlmGlobalDay: num("MASCOTITA_MAX_LLM_GLOBAL_DAY", 150),
    maxChatsDay: num("MASCOTITA_MAX_CHATS_DAY", 30),
    maxTeachDay: num("MASCOTITA_MAX_TEACH_DAY", 10),
    /** minutos entre dos "Explorar ahora" */
    manualCooldownMin: num("MASCOTITA_MANUAL_COOLDOWN_MIN", 10),
  };
}

/** Presupuestos de tiempo y tamaño por tick. */
export const BOUNDS = {
  /** duración total objetivo de un tick (ms); maxDuration de la ruta es 60 s */
  tickMs: 40_000,
  /** el episodio (acciones + fetches) se corta aquí */
  episodeMs: 18_000,
  /** no se llama al LLM para reflexionar si queda menos que esto */
  reflectMinRemainingMs: 9_000,
  llmTimeoutMs: 12_000,
  fetchTimeoutMs: 5_000,
  fetchesPerTick: 4,
  llmCallsPerTick: 2,
  /** candado del tick (ms) — debe superar tickMs */
  lockMs: 55_000,
  /** exploraciones atrasadas máximas al abrir la página */
  maxOwed: 2,
  /** horas por exploración atrasada */
  owedHours: 20,
  /** el cron no repite si ya hubo tick hace menos de estas horas */
  cronMinHours: 6,
  observationChars: 2500,
  observationsPerTick: 3,
  hintsPerObservation: 12,
  knownLabelsForPerceive: 40,
  beliefsForReflect: 25,
  beliefsForReflectSabia: 40,
  chatHistoryTurns: 8,
  chatMaxChars: 500,
  teachMaxChars: 300,
  nameMaxChars: 30,
  ioLogChars: 6000,
} as const;

/** Topes de tamaño de las colecciones. */
export const CAPS = {
  concepts: 400,
  taughtConcepts: 80,
  memories: 300,
  chats: 240,
  ticks: 60,
  traitHistory: 60,
  edgesPerConcept: 12,
  sourcesPerConcept: 10,
  frontier: 50,
  visited: 400,
  fileSha: 200,
  repoTree: 800,
  repoFileBytes: 40_000,
  habits: 5,
} as const;

/** Constantes de aprendizaje. Ver cognition.ts para las fórmulas. */
export const CAL = {
  // política (bandit contextual por entorno)
  alphaMin: 0.08,
  alphaBase: 0.35,
  alphaDecay: 0.02,
  ucbBase: 0.3,
  ucbCuriosity: 0.7,
  noveltyWeight: 0.6,
  riskWeight: 0.8,
  boredomWeight: 0.4,
  energyCostWeight: 1.0,
  restWeight: 0.5,
  habitBias: 0.15,
  ludicWeight: 0.3,
  tempBase: 0.25,
  tempCuriosity: 0.5,
  maturityTicks: 150,
  intrinsicWeight: 0.5,
  // conocimiento
  conf0Repo: 0.35,
  conf0Imagined: 0.3,
  conf0Taught: 0.6,
  conf0Chat: 0.45,
  conf0Rule: 0.4,
  conf0Habit: 0.5,
  reinforceEta: 0.15,
  crossSourceBoost: 1.3,
  repeatDamp: 0.6,
  confirmGain: 0.1,
  verifyGain: 0.2,
  contradictFactor: 0.75,
  refuteFactor: 0.6,
  recallGain: 0.05,
  decayLambda: 0.02,
  taughtFloor: 0.2,
  pruneConf: 0.1,
  pruneMinAgeDays: 7,
  edgeGain: 0.2,
  edgeDecay: 0.98,
  edgeCut: 0.05,
  // memorias
  salienceBase: 0.25,
  salienceReward: 0.5,
  salienceNovelty: 0.5,
  salienceOwner: 0.3,
  memoryLambda: { huevo: 0.25, cria: 0.25, joven: 0.15, adulta: 0.1, sabia: 0.08 } as Record<string, number>,
  memoryForget: 0.08,
  consolidateMin: 3,
  consolidateReward: 0.2,
  // ánimo e impulsos
  moodInertia: 0.6,
  arousalInertia: 0.5,
  moodHalfLifeHours: 24,
  energyPerHour: 0.15,
  energyPerStep: 0.15,
  energyRisky: 0.3,
  energyRest: 0.4,
  boredomPerHour: 0.04,
  boredomNoveltyRelief: 0.5,
  lonelinessPerHour: 0.03,
  lonelinessChatRelief: 0.6,
  // deriva de rasgos
  kappa: { huevo: 0.06, cria: 0.06, joven: 0.04, adulta: 0.02, sabia: 0.01 } as Record<string, number>,
  traitMin: 0.05,
  traitMax: 0.95,
  absencePenaltyPerDay: 0.2,
  absencePenaltyMax: 0.6,
  absenceGraceDays: 2,
  // etapas (por xp)
  xpCria: 25,
  xpJoven: 120,
  xpAdulta: 400,
  stepsPerStage: { huevo: 1, cria: 2, joven: 3, adulta: 3, sabia: 3 } as Record<string, number>,
  // cambio de entorno por aburrimiento
  boredomSwitch: 0.8,
  switchProb: 0.2,
  noveltyExhausted: 0.15,
  // dueño
  trustInit: 0.7,
  trustGain: 0.02,
  trustLoss: 0.05,
  // predicciones en mundos imaginados
  predictionBonus: 0.1,
  predictionMinTries: 2,
} as const;
