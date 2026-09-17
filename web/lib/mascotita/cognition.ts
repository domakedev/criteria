// El cuerpo de la criatura: funciones PURAS que mueven sus números que no son
// la red — nacimiento, genes y su mutación, nombres, ánimo, impulsos, deriva
// de rasgos, etapas, competencia por acción. Cada función recibe lo que
// necesita (el doc, la hora ISO, un rng sembrado) y muta el doc en sitio,
// siempre acotado y redondeado (round3) para que Firestore guarde números
// cortos. Ver PLAN.md §2 y §4.
import type { CriaturaDoc, Drives, Genes, LifeStage, MoodWord, Traits } from "./types";
import { TRAIT_KEYS } from "./types";
import { CAL, RED } from "./config";
import { clamp, clamp01, gaussian, hashString, round3, seededRng } from "./rng";
import { memoriasVacias } from "./cerebro";

const DAY_MS = 86_400_000;

// --- texto: día, tokens ---

const LIMA_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Lima",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
});

/** "YYYY-MM-DD" en America/Lima: la clave de día de los contadores y de la crónica. */
export function limaDayKey(d: Date): string {
  const parts = LIMA_FMT.formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Hora (0..23) en Lima. */
export function limaHour(d: Date): number {
  const h = LIMA_FMT.formatToParts(d).find((p) => p.type === "hour")?.value ?? "0";
  return Number(h) % 24;
}

// --- nombres ---

const CONSONANTES = ["k", "t", "m", "s", "r", "n", "p", "l", "w", "ch", "y", "q", "h", "ñ"];
const VOCALES = ["a", "i", "u", "a", "e", "o"];

/** Nombre de dos o tres sílabas, siempre el mismo para la misma semilla. */
export function nombreDe(semilla: string): string {
  const rng = seededRng(semilla, "nombre");
  const n = rng() < 0.6 ? 2 : 3;
  let s = "";
  for (let i = 0; i < n; i++) {
    s += CONSONANTES[Math.floor(rng() * CONSONANTES.length)] + VOCALES[Math.floor(rng() * VOCALES.length)];
  }
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Tono (0..360) para el sprite, derivado de los genes. */
export function tonoDe(genes: Genes): number {
  const t = genes.rasgos;
  return Math.round((150 + 120 * (t.juego - t.cautela) + 60 * (t.curiosidad - 0.5) + 360) % 360);
}

// --- genes ---

function enRango(v: number, [lo, hi]: readonly [number, number]): number {
  return round3(clamp(v, lo, hi));
}

/** Genes de una fundadora: rasgos 0.5 ± 0.1 y genes del cerebro en el centro de su rango. */
export function genesFundadora(cid: string): Genes {
  const rng = seededRng(cid, "genes");
  const gene = () => round3(clamp(0.5 + (rng() * 2 - 1) * 0.1, CAL.traitMin, CAL.traitMax));
  const mid = (r: readonly [number, number]) => round3((r[0] + r[1]) / 2);
  return {
    rasgos: {
      curiosidad: gene(),
      cautela: gene(),
      sociabilidad: gene(),
      juego: gene(),
      constancia: gene(),
      orden: gene(),
    },
    lr: mid(RED.lr),
    tau: mid(RED.tau),
    sigma: mid(RED.sigma),
    vida: Math.round(mid(RED.vida)),
  };
}

/** Mutación: cada rasgo ± N(0, σ); cada gen del cerebro ± 10 % de su rango. */
export function mutarGenes(madre: Genes, cidHija: string): Genes {
  const rng = seededRng(cidHija, "mutacion");
  const rasgos = {} as Traits;
  for (const k of TRAIT_KEYS) {
    rasgos[k] = round3(clamp(madre.rasgos[k] + gaussian(rng) * RED.mutacionRasgos, CAL.traitMin, CAL.traitMax));
  }
  const paso = (r: readonly [number, number]) => gaussian(rng) * 0.1 * (r[1] - r[0]);
  return {
    rasgos,
    lr: enRango(madre.lr + paso(RED.lr), RED.lr),
    tau: enRango(madre.tau + paso(RED.tau), RED.tau),
    sigma: enRango(madre.sigma + paso(RED.sigma), RED.sigma),
    vida: Math.round(enRango(madre.vida + paso(RED.vida), RED.vida)),
  };
}

// --- nacimiento ---

export function statsVacias(): CriaturaDoc["stats"] {
  return {
    ticks: 0,
    pasos: 0,
    comidas: 0,
    fallosGraves: 0,
    emisiones: 0,
    oidas: 0,
    crias: 0,
    mudanzas: 0,
    suenos: 0,
    recompensaMedia: 0,
    perdidaMedia: 0,
  };
}

export function nuevaCriatura(p: {
  cid: string;
  genes: Genes;
  gen: number;
  padre: string | null;
  env: string;
  zona: string;
  now: string;
  energia?: number;
}): CriaturaDoc {
  const key = limaDayKey(new Date(p.now));
  return {
    cid: p.cid,
    nombre: nombreDe(p.cid),
    gen: p.gen,
    padre: p.padre,
    bornAt: p.now,
    diedAt: null,
    causaMuerte: null,
    viva: true,
    genes: p.genes,
    rasgos: { ...p.genes.rasgos },
    traitHistory: [{ day: key, traits: { ...p.genes.rasgos } }],
    mood: { valence: 0.1, arousal: 0.4, word: "curiosa" },
    drives: { energy: p.energia ?? 1, boredom: 0.2, loneliness: 0.2 },
    dano: 0,
    hambreTicks: 0,
    edadTicks: 0,
    xp: 0,
    etapa: "huevo",
    env: p.env,
    zona: p.zona,
    cursores: {},
    skills: {},
    creencias: {},
    memorias: memoriasVacias(),
    emisiones: [],
    stats: statsVacias(),
    ultimoTick: null,
    seq: 0,
    lastTickAt: null,
    ticksDesdeCria: 0,
    ultimoSueno: key,
    createdAt: p.now,
    updatedAt: p.now,
  };
}

/** Id de criatura: "c" + generación + hash corto de (madre, seq del latido). */
export function cidPara(padre: string | null, gen: number, semilla: string): string {
  return `c${gen}-${hashString(`${padre ?? "genesis"}:${semilla}`).toString(36)}`;
}

// --- rasgos en palabras ---

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

/** Seis frases: "muy curiosa", "poco cautelosa"… */
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

/** xp al que empieza la siguiente etapa; null si ya es sabia. */
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

/** Suma xp y devuelve la etapa nueva si cambió. */
export function addXp(c: CriaturaDoc, amount: number): LifeStage | null {
  c.xp = round3(Math.max(0, c.xp + Math.max(0, amount)));
  const stage = stageFor(c.xp, c.stats.ticks);
  if (stage !== c.etapa) {
    c.etapa = stage;
    return stage;
  }
  return null;
}

// --- habilidades ---

/** Competencia beta-binomial: (ok+1)/(ok+fail+2); 0.5 si nunca lo intentó. */
export function competence(c: CriaturaDoc, actionType: string): number {
  const s = c.skills[actionType];
  if (!s) return 0.5;
  return (s.ok + 1) / (s.ok + s.fail + 2);
}

export function updateSkill(c: CriaturaDoc, actionType: string, success: boolean): void {
  const s = c.skills[actionType] ?? { ok: 0, fail: 0 };
  if (success) s.ok += 1;
  else s.fail += 1;
  c.skills[actionType] = s;
}

// --- tiempo e impulsos ---

/**
 * Lo que pasa entre dos ticks (Δh): el ánimo vuelve a su base con vida media
 * de un día, recupera algo de energía y le crecen el aburrimiento y la soledad.
 */
export function applyTime(c: CriaturaDoc, hours: number): void {
  const h = Math.max(0, hours);
  if (h === 0) return;
  const t = c.rasgos;
  const d = c.drives;
  const decay = Math.exp(-h / CAL.moodHalfLifeHours);
  const baselineV = 0.2 * (t.juego - t.cautela) + 0.1 * (1 - d.loneliness);
  c.mood.valence = round3(clamp(baselineV + (c.mood.valence - baselineV) * decay, -1, 1));
  c.mood.arousal = round3(clamp01(0.3 + (c.mood.arousal - 0.3) * decay));
  d.energy = round3(clamp01(d.energy + CAL.energyPerHour * h));
  d.boredom = round3(clamp01(d.boredom + CAL.boredomPerHour * h));
  d.loneliness = round3(clamp01(d.loneliness + CAL.lonelinessPerHour * h * (0.5 + t.sociabilidad)));
}

/** Por paso: el ánimo sigue a la recompensa con inercia; la activación, a la sorpresa. */
export function applyStepMood(c: CriaturaDoc, rTotal: number, novelty: number): void {
  const r = clamp(rTotal, -1, 1);
  const m = c.mood;
  m.valence = round3(clamp(CAL.moodInertia * m.valence + (1 - CAL.moodInertia) * r, -1, 1));
  m.arousal = round3(
    clamp01(CAL.arousalInertia * m.arousal + (1 - CAL.arousalInertia) * Math.min(1, Math.abs(r) + clamp01(novelty))),
  );
}

/** Por acción: cuesta energía (más si era arriesgada y falló); la novedad alivia el aburrimiento. */
export function applyStepEnergy(
  c: CriaturaDoc,
  a: { costEnergy: number; riskHint: number },
  success: boolean,
  novelty: number,
): void {
  const d = c.drives;
  let cost = clamp01(a.costEnergy);
  if (a.riskHint > 0.5 && !success) cost += CAL.energyRisky;
  d.energy = round3(clamp01(d.energy - cost * CAL.energiaEscala));
  if (novelty > 0.5) d.boredom = round3(clamp01(d.boredom - CAL.boredomNoveltyRelief));
}

/** Efectos directos de un Outcome sobre los impulsos: valores absolutos, tal cual. */
export function applyEffects(c: CriaturaDoc, effects: Partial<Drives> | undefined): void {
  if (!effects) return;
  const d = c.drives;
  for (const k of ["energy", "boredom", "loneliness"] as const) {
    const v = effects[k];
    if (typeof v === "number" && Number.isFinite(v)) d[k] = round3(clamp01(v));
  }
}

/** Compañía en la zona: la soledad baja. */
export function applyCompania(c: CriaturaDoc, otras: number): void {
  if (otras > 0) c.drives.loneliness = round3(clamp01(c.drives.loneliness - CAL.soledadCompania));
}

/** Daño por fallo grave; sana un poco cada tick. */
export function applyDano(c: CriaturaDoc, r: number): boolean {
  if (r <= CAL.falloGrave) {
    c.dano = round3(clamp01(c.dano + CAL.danoPorFallo));
    c.stats.fallosGraves += 1;
    return true;
  }
  return false;
}

/** Tabla ánimo → palabra; `comeback` = ≥ 2 éxitos tras fallos en el mismo tick. Fija mood.word. */
export function moodWordFor(c: CriaturaDoc, comeback: boolean): MoodWord {
  const v = c.mood.valence;
  const a = c.mood.arousal;
  let word: MoodWord;
  if (comeback && v > 0) word = "orgullosa";
  else if (v > 0.3) word = a > 0.5 ? "alegre" : "tranquila";
  else if (v < -0.3) word = a > 0.5 ? "asustada" : "triste";
  else if (a > 0.5) word = c.rasgos.cautela > 0.5 ? "inquieta" : "curiosa";
  else word = "aburrida";
  c.mood.word = word;
  return word;
}

/** Temperatura del softmax: gen · (0.5 + curiosidad) · (1 − 0.6·madurez). */
export function temperaturaDe(c: CriaturaDoc): number {
  const madurez = Math.min(1, c.stats.ticks / CAL.maturityTicks);
  return round3(Math.max(0.05, c.genes.tau * (0.5 + c.rasgos.curiosidad) * (1 - 0.6 * madurez)));
}

// --- deriva de rasgos ---

export interface TraitSignals {
  /** novedad media de los pasos (0..1) */
  noveltyMean: number;
  /** fracción de pasos fallidos */
  failFrac: number;
  hadBigFail: boolean;
  /** 1 si reintentó tras fallar y le salió; −1 si reintentó y volvió a fallar; 0 si no reintentó */
  retryOutcome: -1 | 0 | 1;
  /** otras criaturas en la zona (fase 3+) */
  compania: boolean;
  /** recompensa media de las acciones lúdicas, null si no hubo */
  ludicMeanReward: number | null;
  /** fracción de pasos de "orden" (releer, seguir) con recompensa > 0; null fuera del repo */
  orderFrac: number | null;
  /** para repartir κ entre los ticks del día */
  ticksToday: number;
}

export function driftTraits(c: CriaturaDoc, s: TraitSignals): Partial<Traits> {
  const k = (CAL.kappa[c.etapa] ?? CAL.kappa.adulta) / Math.max(1, s.ticksToday);
  const delta: Traits = {
    curiosidad: k * (clamp01(s.noveltyMean) - 0.4),
    cautela: k * (clamp01(s.failFrac) - 0.3) + (s.hadBigFail ? k * 0.5 : 0),
    constancia: k * s.retryOutcome,
    sociabilidad: k * (s.compania ? 1 : -0.3),
    juego: s.ludicMeanReward === null ? 0 : k * (clamp(s.ludicMeanReward, -1, 1) - 0.1),
    orden: s.orderFrac === null ? 0 : k * (clamp01(s.orderFrac) - 0.2),
  };
  const shift: Partial<Traits> = {};
  for (const key of TRAIT_KEYS) {
    const before = c.rasgos[key];
    // Tirón suave hacia los genes: el mundo la moldea, pero no la clava en un extremo.
    const pull = k * 1.5 * (c.genes.rasgos[key] - before);
    const after = round3(clamp(before + delta[key] + pull, CAL.traitMin, CAL.traitMax));
    c.rasgos[key] = after;
    const d = round3(after - before);
    if (Math.abs(d) >= 0.001) shift[key] = d;
  }
  return shift;
}

/** Una foto por día (reemplaza la de hoy si ya existe), ≤ tope (FIFO). */
export function snapshotTraits(c: CriaturaDoc, dayKey: string, cap: number): void {
  const snap = { day: dayKey, traits: { ...c.rasgos } };
  const last = c.traitHistory[c.traitHistory.length - 1];
  if (last && last.day === dayKey) c.traitHistory[c.traitHistory.length - 1] = snap;
  else c.traitHistory.push(snap);
  if (c.traitHistory.length > cap) c.traitHistory = c.traitHistory.slice(c.traitHistory.length - cap);
}

function dayKeyPlus(key: string, days: number): string {
  const t = Date.parse(`${key}T00:00:00Z`);
  if (!Number.isFinite(t)) return key;
  return new Date(t + days * DAY_MS).toISOString().slice(0, 10);
}

/** Rasgos de hoy − foto de hace ≥ 7 días (o la más antigua si no llega); solo |Δ| ≥ 0.01. */
export function traitDelta7d(c: CriaturaDoc, todayKey: string): Partial<Traits> {
  const hist = c.traitHistory;
  if (hist.length === 0) return {};
  const target = dayKeyPlus(todayKey, -7);
  let base = hist[0];
  for (const h of hist) {
    if (h.day <= target) base = h;
    else break;
  }
  const out: Partial<Traits> = {};
  for (const k of TRAIT_KEYS) {
    const d = round3(c.rasgos[k] - base.traits[k]);
    if (Math.abs(d) >= 0.01) out[k] = d;
  }
  return out;
}

/** Media móvil exponencial corta para los stats. */
export function ema(prev: number, x: number, alpha = 0.05): number {
  return round3(prev + alpha * (x - prev));
}

/** Día entre las 06:00 y las 18:00 de Lima. */
export function esDeDia(d: Date): boolean {
  const h = limaHour(d);
  return h >= 6 && h < 18;
}
