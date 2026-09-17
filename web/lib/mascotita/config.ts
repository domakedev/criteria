// Configuración y constantes de calibración de la sociedad, en UN solo lugar.
// Las variables de entorno se leen en cada llamada (no al importar) para que
// las pruebas y Vercel puedan variarlas. Todo tope que limita la población o
// el presupuesto está en LIMITES y viaja a la UI tal cual.

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

export type Nacimiento = "junto-a-madre" | "aleatorio";

export function cfg() {
  const nacRaw = (process.env.MASCOTITA_NACIMIENTO ?? "").trim();
  const nacimiento: Nacimiento = nacRaw === "aleatorio" ? "aleatorio" : "junto-a-madre";
  return {
    /** uids o correos verificados con permiso (los dioses); vacío = cualquier usuario con sesión. */
    owners: list("MASCOTITA_OWNERS"),
    /** id de la colonia (una por despliegue) */
    colonia: (process.env.MASCOTITA_COLONIA ?? "principal").trim() || "principal",
    repo: (process.env.MASCOTITA_REPO ?? "domakedev/criteria").trim(),
    repoBranch: (process.env.MASCOTITA_REPO_BRANCH ?? "main").trim(),
    githubToken: (process.env.GITHUB_TOKEN ?? "").trim(),
    cronSecret: process.env.CRON_SECRET ?? "",
    nacimiento,
    /** tope de vivas (se puede bajar por env sin tocar código) */
    maxVivas: Math.max(1, Math.min(LIMITES.maxVivas, num("MASCOTITA_MAX_VIVAS", LIMITES.maxVivas))),
  };
}

/** Topes duros de la sociedad y del presupuesto gratis. Visibles en la UI. */
export const LIMITES = {
  /** criaturas vivas a la vez */
  maxVivas: 12,
  /** criaturas que tickean por latido (round-robin si hay más vivas) */
  ticksPorLatido: 12,
  /** acciones por tick (las etapas tempranas dan menos) */
  pasosPorTick: 3,
  /** fetches al repositorio por latido, repartidos entre las que están ahí */
  fetchesPorLatido: 6,
  fetchTimeoutMs: 4_000,
  /** plazo total de un latido (maxDuration de la ruta es 60 s) */
  latidoMs: 50_000,
  /** plazo por criatura dentro del latido */
  tickMs: 8_000,
  /** candado del latido (ms) — debe superar latidoMs */
  lockMs: 58_000,
  /** latidos esperados por día (uno cada 15 min) */
  latidosDia: 96,
  /** si el último latido tiene más de esto, la página dispara uno (catch-up) */
  atrasoMin: 25,
  /** topes gratis de Firestore por día */
  escriturasDia: 20_000,
  lecturasDia: 50_000,
  /** fracción del tope que nos permitimos proyectar */
  fraccionSegura: 0.6,
  /** al pasar esta fracción del tope real del día, modo ahorro (mitad de ticks) */
  fraccionAhorro: 0.9,
  cronicaPorDia: 400,
  /** eventos que se devuelven a la página */
  cronicaVista: 80,
  creencias: 120,
  memorias: 150,
  simbolos: 16,
  /** fotos de criaturas en el mundo (vivas + muertas recientes) */
  fotos: 40,
  /** entradas del árbol genealógico */
  linaje: 600,
  traitHistory: 60,
  /** tamaño máximo esperado de un doc de criatura (para la prueba de humo) */
  docKb: 200,
} as const;

/** Arquitectura y entrenamiento de la red. Cambiar `entrada` u `oculta*` cambia `formato`. */
export const RED = {
  formato: 1,
  entrada: 96,
  oculta1: 48,
  oculta2: 24,
  salidaQ: 1,
  salidaMundo: 2,
  /** 16 símbolos + silencio */
  salidaSimbolos: 17,
  /** descuento del retorno dentro del tick */
  gamma: 0.6,
  /** recorte del gradiente por norma */
  clipNorm: 1,
  huberDelta: 1,
  /** peso de la sorpresa (error de predicción) en la recompensa total */
  curiosidadPeso: 0.5,
  /** replay nocturno */
  suenoMuestra: 60,
  suenoPasadas: 2,
  suenoLrFactor: 0.5,
  /** hora (Lima) del latido que incluye el sueño */
  horaSueno: 3,
  /** rangos de los genes del cerebro */
  lr: [0.003, 0.03] as const,
  tau: [0.15, 0.6] as const,
  sigma: [0.005, 0.05] as const,
  vida: [900, 1500] as const,
  /** fracción de pesos que se reinicializan al heredar */
  reinicioHeredado: 0.03,
  /** mutación de los rasgos de nacimiento (desviación) */
  mutacionRasgos: 0.05,
  /** costo de energía por símbolo emitido */
  costoEmitir: 0.005,
  /** costo en unidades de recompensa que la cabeza de símbolos paga por emitir sin que sirva */
  costoEmitirValor: 0.1,
  /** temperatura de la cabeza de símbolos = temperatura de acción × esto (más decidida) */
  tauSimbolos: 0.5,
  /** peso de la ventaja de la oyente en la recompensa social de la emisora */
  beta: 0.8,
  bonoOyente: 0,
  /** creencias: α mínimo de la media incremental */
  creenciaAlphaMin: 0.1,
  /** creencias heredadas por la cría (las más firmes) */
  creenciasHeredadas: 12,
} as const;

/** Reglas de la sociedad: comida, reproducción y muerte. */
export const SOCIEDAD = {
  /** ticks de edad para poder reproducirse (≈ 2 días) */
  madurezTicks: 200,
  energiaParaCria: 0.75,
  /** unidades de comida en la zona que consume el nacimiento */
  comidaParaCria: 2,
  ticksEntreCrias: 150,
  /** energía con la que nace la cría y la que pierde la madre */
  energiaCria: 0.5,
  costoCria: 0.4,
  /** ticks seguidos con energía en cero para morir de hambre (6 h) */
  hambreMuerteTicks: 24,
  danoMuerte: 1,
  /** comer una unidad */
  comidaEnergia: 0.35,
  comidaRecompensa: 0.3,
  /** en el repo, leer algo nuevo alimenta */
  novedadRepoEnergia: 0.15,
  /** tope de comida acumulada por zona (natural + fuentes) */
  comidaTope: 6,
  /** tope de unidades que el dios deja de una vez */
  comidaDiosMax: 20,
  fuenteMaxPorHora: 2,
  fuenteMaxHoras: 168,
} as const;

/** Regeneración natural de comida (unidades por hora) por "env/zona". */
export const RECURSOS_NATURALES: Record<string, number> = {
  "bosque/arroyo": 0.5,
  "bosque/claro": 0.3,
  "ciudad/mercado": 0.5,
  "ciudad/plaza": 0.2,
  "cine/lobby": 0.2,
};

/** El canal de símbolos y el intérprete. Las sílabas son etiquetas para mostrar; nadie les asigna significado. */
export const LENGUAJE = {
  silabas: ["ka", "ti", "mo", "su", "ra", "ne", "pi", "lo", "wa", "ki", "ta", "chu", "yu", "mi", "ño", "sa"],
  /** señales que se conservan por zona */
  senalesPorZona: 8,
  /** símbolos por emisión del dios */
  maxDios: 3,
  /** recorte de la ventaja de la oyente */
  ventajaMax: 0.3,
  /** ventaja mínima para anotarla en la crónica */
  ventajaCronica: 0.15,
  /** una pista entra en la glosa si acompaña al menos esta fracción de las emisiones del símbolo */
  minFraccionPista: 0.15,
  minPmiPista: 0.3,
  clavesPorSimbolo: 60,
  /** emisiones mínimas para intentar una glosa */
  minGlosa: 20,
  /** conteo mínimo de una pista para entrar en la glosa */
  minPista: 5,
} as const;

/** El narrador (Gemini, solo para el dueño, solo lectura). */
export const NARRADOR = {
  porDia: 10,
  guardadas: 20,
  maxChars: 24_000,
} as const;

/** Presupuestos de tiempo y tamaño por tick. */
export const BOUNDS = {
  fetchTimeoutMs: LIMITES.fetchTimeoutMs,
  observationChars: 2500,
  hintsPerObservation: 12,
  nameMaxChars: 30,
  eventoChars: 200,
} as const;

/** Topes de tamaño de las estructuras del entorno. */
export const CAPS = {
  traitHistory: LIMITES.traitHistory,
  frontier: 50,
  visited: 400,
  fileSha: 200,
  repoTree: 800,
  repoFileBytes: 40_000,
} as const;

/** Constantes de aprendizaje del cuerpo (ánimo, impulsos, rasgos, etapas). */
export const CAL = {
  // ánimo e impulsos
  moodInertia: 0.6,
  arousalInertia: 0.5,
  moodHalfLifeHours: 24,
  /** energía que recupera por hora sin hacer nada (casi nada: la comida es lo que alimenta) */
  energyPerHour: 0.02,
  energyRisky: 0.3,
  /** lo que da descansar */
  energyRest: 0.05,
  /** factor sobre los costos de energía de las acciones (96 ticks/día; sin esto se morirían en horas) */
  energiaEscala: 0.12,
  /** compañía en la zona: cuánto baja la soledad por tick */
  soledadCompania: 0.1,
  boredomPerHour: 0.04,
  boredomNoveltyRelief: 0.5,
  lonelinessPerHour: 0.03,
  /** daño por fallo grave y cuánto sana por tick */
  danoPorFallo: 0.15,
  danoSanaPorTick: 0.01,
  /** recompensa ≤ esto = fallo grave */
  falloGrave: -0.6,
  // deriva de rasgos
  kappa: { huevo: 0.06, cria: 0.06, joven: 0.04, adulta: 0.02, sabia: 0.01 } as Record<string, number>,
  traitMin: 0.05,
  traitMax: 0.95,
  // etapas (por xp)
  xpCria: 25,
  xpJoven: 120,
  xpAdulta: 400,
  stepsPerStage: { huevo: 1, cria: 2, joven: 3, adulta: 3, sabia: 3 } as Record<string, number>,
  /** ticks hasta que la temperatura llega a su mínimo */
  maturityTicks: 300,
  /** mudarse de entorno: costo de energía y recompensa inmediata (el viaje cansa) */
  mudanzaCosto: 0.15,
  mudanzaRecompensa: -0.1,
} as const;
