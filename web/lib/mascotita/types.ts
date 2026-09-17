// Tipos de la sociedad de mascotitas: una colonia de criaturas, cada una con
// su propio cerebro (una red pequeña escrita a mano), que viven en el
// repositorio real y en mundos imaginados, aprenden solas de lo que les pasa
// y guardan TODO como números y strings planos en Firestore.
//
// Colecciones (ver PLAN.md §3):
//   colonia/{id}                         → MundoDoc (latido, contadores, fotos, recursos, señales)
//   colonia/{id}/criaturas/{cid}         → CriaturaDoc (estado, genes, creencias, memorias)
//   colonia/{id}/cerebros/{cid}          → CerebroDoc (pesos de la red, base64 float32)
//   colonia/{id}/cronica/{YYYY-MM-DD}    → CronicaDoc (eventos del día)
//   colonia/{id}/meta/linaje             → LinajeDoc (árbol genealógico)
//   colonia/{id}/meta/lexico             → LexicoDoc (conteos del intérprete)
//   mascotita_cache/repoTree             → RepoTreeCache (compartido, 1 fetch/día)

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

// --- genes ---

/** Lo que se hereda con mutación: rasgos de nacimiento y cuatro genes del cerebro. */
export interface Genes {
  rasgos: Traits;
  /** tasa de aprendizaje de la red */
  lr: number;
  /** temperatura base del softmax al elegir */
  tau: number;
  /** ruido que reciben los pesos al heredarse */
  sigma: number;
  /** vida esperada en ticks (vejez) */
  vida: number;
}

// --- creencias y memorias ---

/** Lo que la criatura cree de (objetivo, verbo): valor esperado y cuántas veces lo vivió. */
export interface Creencia {
  /** −1..1 */
  q: number;
  n: number;
  /** ISO de la última vez */
  t: string;
}

/** Anillo de experiencias cuantizadas a int8 (entrada + retorno + éxito + recompensa). */
export interface MemoriasDoc {
  /** cuántas hay guardadas (≤ tope) */
  n: number;
  /** siguiente posición a sobrescribir */
  cursor: number;
  /** Int8Array en base64; vacío si n = 0 */
  datos: string;
}

// --- lo que pasó en el último tick (para la vista "mente") ---

export interface CandidataRegistro {
  accion: string;
  objetivo: string;
  label: string;
  /** valor que le dio la red */
  q: number;
}

export interface PasoRegistro {
  accion: string;
  objetivo: string;
  label: string;
  /** recompensa del entorno */
  r: number;
  /** recompensa total (entorno + curiosidad) */
  rTotal: number;
  /** retorno descontado que se usó para entrenar */
  g: number;
  exito: boolean;
  novedad: number;
  /** error de predicción del modelo del mundo (0..1) */
  sorpresa: number;
  /** P(éxito) que predijo antes de actuar */
  pExito: number;
  /** todas las candidatas con su valor (la elegida incluida) */
  candidatas: CandidataRegistro[];
  /** símbolo emitido (0..15) o null si calló */
  simbolo: number | null;
  tags: string[];
  ms: number;
}

export interface OidoRegistro {
  /** símbolos oídos (0..15), con repetición */
  simbolos: number[];
  /** de quiénes (cids o "dios") */
  de: string[];
}

export interface UltimoTick {
  seq: number;
  at: string;
  env: string;
  zona: string;
  pasos: PasoRegistro[];
  /** lo que oyó antes de decidir, si algo */
  oido: OidoRegistro | null;
  /** recompensa social recibida por sus emisiones del tick anterior */
  social: number;
  /** pérdida media de los pasos de gradiente de este tick */
  perdida: number;
  /** norma media del gradiente (antes del recorte) */
  gradiente: number;
  /** activación de la capa 2 en el último paso (para pintarla) */
  activacion: number[];
  temperatura: number;
  ms: number;
}

// --- criatura ---

export type CausaMuerte = "vejez" | "hambre" | "fallos" | "dios";

export interface CriaturaStats {
  ticks: number;
  pasos: number;
  comidas: number;
  fallosGraves: number;
  emisiones: number;
  oidas: number;
  crias: number;
  mudanzas: number;
  suenos: number;
  /** media móvil de la recompensa total por paso */
  recompensaMedia: number;
  /** media móvil de la pérdida por paso de gradiente */
  perdidaMedia: number;
}

export interface CriaturaDoc {
  cid: string;
  nombre: string;
  /** generación: 0 la fundadora */
  gen: number;
  padre: string | null;
  bornAt: string;
  diedAt: string | null;
  causaMuerte: CausaMuerte | null;
  viva: boolean;
  genes: Genes;
  rasgos: Traits;
  /** Una foto por día, ≤ 60 (FIFO). */
  traitHistory: Array<{ day: string; traits: Traits }>;
  mood: Mood;
  drives: Drives;
  /** 0..1: fallos graves acumulados (sana despacio) */
  dano: number;
  /** ticks seguidos con energía en cero */
  hambreTicks: number;
  edadTicks: number;
  xp: number;
  etapa: LifeStage;
  env: string;
  /** zona dentro del entorno (en el repo: carpeta de primer nivel o "raiz") */
  zona: string;
  /** cursor por entorno (rutas visitadas, zona, ensayos) */
  cursores: Record<string, EnvStateDoc>;
  /** competencia por tipo de acción (beta-binomial) */
  skills: Record<string, { ok: number; fail: number }>;
  /** "objetivo|verbo" → creencia; ≤ tope */
  creencias: Record<string, Creencia>;
  memorias: MemoriasDoc;
  /** emisiones del último tick a la espera de su recompensa social (entrada cuantizada + símbolo) */
  emisiones: EmisionPendiente[];
  stats: CriaturaStats;
  ultimoTick: UltimoTick | null;
  /** Secuencia de ticks: el tick N usa RNG sembrado con (cid, N) → reintentos idempotentes. */
  seq: number;
  lastTickAt: string | null;
  ticksDesdeCria: number;
  /** clave de día del último sueño */
  ultimoSueno: string;
  createdAt: string;
  updatedAt: string;
}

/** Los pesos de la red, aparte del estado para que la página no los baje. */
export interface CerebroDoc {
  cid: string;
  formato: number;
  dims: number[];
  /** Float32Array en base64 (little-endian) */
  pesos: string;
  /** pasos de gradiente dados en toda su vida */
  pasos: number;
  /** pérdida media reciente */
  perdida: number;
  updatedAt: string;
}

// --- mundo ---

export interface FotoCriatura {
  nombre: string;
  gen: number;
  padre: string | null;
  env: string;
  zona: string;
  energia: number;
  edad: number;
  etapa: LifeStage;
  mood: MoodWord;
  viva: boolean;
  /** tono (0..360) derivado de los genes, para el sprite */
  tono: number;
  ultimoSimbolo: number | null;
  simboloAt: string | null;
}

export interface Senal {
  /** cid de la emisora o "dios" */
  de: string;
  /** 0..15 */
  sim: number;
  /** seq del latido en que se emitió */
  seq: number;
  dios: boolean;
}

export interface Recurso {
  comida: number;
  fuente: { porHora: number; hasta: string } | null;
}

export interface LatidoLock {
  until: string;
  seq: number;
}

export interface MundoDoc {
  id: string;
  latido: {
    seq: number;
    lock: LatidoLock | null;
    lastAt: string | null;
  };
  /** contadores del día (clave de día en America/Lima) */
  dia: {
    key: string;
    latidos: number;
    escrituras: number;
    lecturas: number;
  };
  poblacion: {
    vivas: number;
    nacidas: number;
    muertas: number;
    generacionMax: number;
  };
  /** cid → foto para el terrario (≤ tope) */
  fotos: Record<string, FotoCriatura>;
  /** "env/zona" → recurso */
  recursos: Record<string, Recurso>;
  /** "env/zona" → señales del último latido */
  senales: Record<string, Senal[]>;
  /** cid → recompensa social pendiente */
  pendientes: Record<string, number>;
  rotacion: { cursor: number };
  createdAt: string;
  updatedAt: string;
}

/** Una emisión esperando su recompensa social: la entrada de la red (int8 base64) y el símbolo elegido. */
export interface EmisionPendiente {
  x: string;
  sim: number;
}

// --- léxico ---

export interface LexicoDoc {
  emisiones: number;
  oidas: number;
  porSimbolo: number[];
  /** cuántas veces se oyó cada símbolo (para las fracciones de consecuencia) */
  oidasPorSimbolo: number[];
  /** símbolo → clave de contexto → n */
  contexto: Record<string, Record<string, number>>;
  totContexto: Record<string, number>;
  /** símbolo → clave de consecuencia (en quien oye) → n */
  consecuencia: Record<string, Record<string, number>>;
  totConsecuencia: Record<string, number>;
  bigramas: Record<string, number>;
  resumen: { bitsContexto: number; bitsConsecuencia: number; at: string; emisionesDia: number; diaKey: string };
  updatedAt: string;
}

export interface PistaView {
  clave: string;
  humano: string;
  n: number;
  frac: number;
  pmi: number;
}

export interface GlosaView {
  simbolo: number;
  silaba: string;
  n: number;
  texto: string;
  contexto: PistaView[];
  consecuencia: PistaView[];
}

export interface LexicoView {
  emisiones: number;
  oidas: number;
  emisionesHoy: number;
  bitsContexto: number;
  bitsConsecuencia: number;
  lecturaContexto: string;
  lecturaConsecuencia: string;
  glosas: GlosaView[];
  bigramas: Array<{ bigrama: string; n: number }>;
  at: string;
}

// --- linaje ---

export interface LinajeEntrada {
  cid: string;
  nombre: string;
  padre: string | null;
  gen: number;
  nacio: string;
  murio: string | null;
  causa: CausaMuerte | null;
  /** tono del sprite (para el árbol) */
  tono: number;
}

export interface LinajeDoc {
  entradas: LinajeEntrada[];
  updatedAt: string;
}

// --- crónica ---

export type EventoTipo =
  | "genesis"
  | "nacimiento"
  | "muerte"
  | "golpe"
  | "logro"
  | "mudanza"
  | "etapa"
  | "sueno"
  | "senal"
  | "comida"
  | "dios"
  | "latido"
  | "aviso";

export interface Evento {
  at: string;
  tipo: EventoTipo;
  cid: string | null;
  /** ≤ 200, en plantilla (hechos, no voz) */
  texto: string;
  datos: Record<string, string | number | boolean>;
}

export interface CronicaDoc {
  key: string;
  eventos: Evento[];
  /** eventos que no cupieron en el tope del día */
  omitidos: number;
}

// --- entornos ---

export interface RepoCursor {
  kind: "repo";
  /** ruta → veces leída (≤ 400) */
  visited: Record<string, number>;
  /** rutas candidatas ≤ 50 (imports resueltos, hijos de carpetas exploradas) */
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
  /** último intento de refresco (para no insistir cada tick si GitHub falla) */
  lastAttemptAt?: string;
}

// --- vistas (lo que viaja al cliente) ---

export interface EnvInfo {
  id: string;
  name: string;
  emoji: string;
  kind: "real" | "imaginado";
  intro: string;
  zonas: Array<{ id: string; name: string }>;
}

export interface CreenciaView {
  clave: string;
  objetivo: string;
  verbo: string;
  q: number;
  n: number;
}

export interface CriaturaView {
  cid: string;
  nombre: string;
  gen: number;
  padre: string | null;
  viva: boolean;
  causaMuerte: CausaMuerte | null;
  bornAt: string;
  diedAt: string | null;
  etapa: LifeStage;
  xp: number;
  xpNext: number | null;
  edadTicks: number;
  edadDias: number;
  genes: Genes;
  rasgos: Traits;
  traitDelta7d: Partial<Traits>;
  mood: Mood;
  drives: Drives;
  dano: number;
  env: string;
  zona: string;
  tono: number;
  skills: Array<{ action: string; competence: number; ok: number; fail: number }>;
  /** top por n·|q| */
  creencias: CreenciaView[];
  stats: CriaturaStats;
  ultimoTick: UltimoTick | null;
  lastTickAt: string | null;
  memorias: number;
  parametros: number;
}

export interface LimitesView {
  maxVivas: number;
  ticksPorLatido: number;
  pasosPorTick: number;
  fetchesPorLatido: number;
  escriturasDia: number;
  lecturasDia: number;
  fraccionSegura: number;
  latidosDia: number;
  cronicaPorDia: number;
  creencias: number;
  memorias: number;
  simbolos: number;
  parametros: number;
}

export interface PresupuestoView {
  topeSeguro: number;
  proyeccionManana: number;
  proyeccionConUnaMas: number;
  lecturasManana: number;
  cabeOtra: boolean;
  motivo: string | null;
  ahorro: boolean;
}

export interface MundoView {
  /** false si la colonia no existe todavía */
  hay: boolean;
  latido: { seq: number; lastAt: string | null; ocupado: boolean; retryAt: string | null };
  dia: MundoDoc["dia"];
  poblacion: MundoDoc["poblacion"];
  fotos: Record<string, FotoCriatura>;
  recursos: Record<string, Recurso>;
  limites: LimitesView;
  presupuesto: PresupuestoView;
  envs: EnvInfo[];
  criaturas: CriaturaView[];
  /** eventos de hoy (los últimos primero) */
  cronica: Evento[];
  /** latidos atrasados que la página debería disparar (0 o 1) */
  atrasado: boolean;
}

export type LatidoReason = "cron" | "manual" | "catchup";

export interface LatidoResult {
  skipped: "locked" | "sinColonia" | null;
  retryAt: string | null;
  seq: number | null;
  procesadas: string[];
  saltadas: Array<{ cid: string; why: string }>;
  nacidas: string[];
  muertas: string[];
  eventos: Evento[];
  ms: number;
}
