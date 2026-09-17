// El intérprete estadístico: nadie asigna significado a los símbolos; aquí
// solo se cuenta en qué contexto se emite cada uno y qué hace quien lo oye.
// Las glosas salen de esos conteos (ranking por información mutua puntual,
// no por frecuencia bruta) y siempre llevan su n. Un medidor de bits dice si
// hay convención o ruido. Todo son enteros en un documento.
import { LENGUAJE, LIMITES } from "./config";
import type { CriaturaDoc, GlosaView, LexicoDoc, LexicoView } from "./types";

export const SIMBOLOS = LIMITES.simbolos;

export function silaba(sim: number): string {
  return LENGUAJE.silabas[sim] ?? `s${sim}`;
}

export function lexicoVacio(nowIso: string): LexicoDoc {
  return {
    emisiones: 0,
    oidas: 0,
    porSimbolo: Array.from({ length: SIMBOLOS }, () => 0),
    oidasPorSimbolo: Array.from({ length: SIMBOLOS }, () => 0),
    contexto: {},
    totContexto: {},
    consecuencia: {},
    totConsecuencia: {},
    bigramas: {},
    resumen: { bitsContexto: 0, bitsConsecuencia: 0, at: nowIso, emisionesDia: 0, diaKey: "" },
    updatedAt: nowIso,
  };
}

// --- contexto y consecuencia como claves "familia:valor" ---

export interface ContextoEmision {
  env: string;
  zona: string;
  /** objetivos a la vista (ids de objetos, rutas) */
  objetos: string[];
  comida: number;
  energia: number;
  golpeReciente: boolean;
  otras: number;
  comio: boolean;
}

export function clavesContexto(ctx: ContextoEmision): string[] {
  const out = [
    `env:${ctx.env}`,
    `zona:${ctx.env}/${ctx.zona}`,
    `comida:${ctx.comida >= 1 ? "si" : "no"}`,
    `energia:${ctx.energia < 0.3 ? "baja" : ctx.energia < 0.7 ? "media" : "alta"}`,
    `golpe:${ctx.golpeReciente ? "si" : "no"}`,
    `otras:${ctx.otras === 0 ? "0" : ctx.otras === 1 ? "1" : "2+"}`,
    `comio:${ctx.comio ? "si" : "no"}`,
  ];
  for (const o of ctx.objetos.slice(0, 6)) out.push(`obj:${o.slice(0, 40)}`);
  return out;
}

export interface Consecuencia {
  accion: string;
  r: number;
  cambioDeIdea: boolean;
  comio: boolean;
  seFue: boolean;
}

export function clavesConsecuencia(k: Consecuencia): string[] {
  return [
    `acc:${k.accion}`,
    `r:${k.r > 0.05 ? "+" : k.r < -0.05 ? "-" : "0"}`,
    `cambio:${k.cambioDeIdea ? "si" : "no"}`,
    `comio:${k.comio ? "si" : "no"}`,
    `zona:${k.seFue ? "se-fue" : "quedo"}`,
  ];
}

function sumar(tabla: Record<string, Record<string, number>>, tot: Record<string, number>, sim: number, claves: string[]): void {
  const fila = (tabla[String(sim)] ??= {});
  for (const k of claves) {
    fila[k] = (fila[k] ?? 0) + 1;
    tot[k] = (tot[k] ?? 0) + 1;
  }
  // poda: como máximo N claves por símbolo (se van las menos vistas)
  const ks = Object.keys(fila);
  if (ks.length > LENGUAJE.clavesPorSimbolo) {
    ks.sort((a, b) => fila[a] - fila[b]);
    for (const k of ks.slice(0, ks.length - LENGUAJE.clavesPorSimbolo)) delete fila[k];
  }
}

export function registrarEmision(l: LexicoDoc, sim: number, ctx: ContextoEmision, anterior: number | null): void {
  if (sim < 0 || sim >= SIMBOLOS) return;
  l.emisiones += 1;
  l.porSimbolo[sim] = (l.porSimbolo[sim] ?? 0) + 1;
  sumar(l.contexto, l.totContexto, sim, clavesContexto(ctx));
  if (anterior !== null && anterior >= 0 && anterior < SIMBOLOS) {
    const b = `${silaba(anterior)}-${silaba(sim)}`;
    l.bigramas[b] = (l.bigramas[b] ?? 0) + 1;
    const ks = Object.keys(l.bigramas);
    if (ks.length > 40) {
      ks.sort((a, b2) => l.bigramas[a] - l.bigramas[b2]);
      for (const k of ks.slice(0, ks.length - 40)) delete l.bigramas[k];
    }
  }
  l.resumen.emisionesDia += 1;
}

export function registrarConsecuencia(l: LexicoDoc, sim: number, k: Consecuencia): void {
  if (sim < 0 || sim >= SIMBOLOS) return;
  l.oidas += 1;
  if (!Array.isArray(l.oidasPorSimbolo)) l.oidasPorSimbolo = Array.from({ length: SIMBOLOS }, () => 0);
  l.oidasPorSimbolo[sim] = (l.oidasPorSimbolo[sim] ?? 0) + 1;
  sumar(l.consecuencia, l.totConsecuencia, sim, clavesConsecuencia(k));
}

// --- información ---

function familia(k: string): string {
  const i = k.indexOf(":");
  return i < 0 ? k : k.slice(0, i);
}

/** I(símbolo; clave) en bits dentro de una familia de claves ("zona", "obj"…). */
function bitsFamilia(tabla: Record<string, Record<string, number>>, fam: string): number {
  let N = 0;
  const ns: Record<string, number> = {};
  const nk: Record<string, number> = {};
  for (const [s, fila] of Object.entries(tabla)) {
    for (const [k, n] of Object.entries(fila)) {
      if (familia(k) !== fam) continue;
      N += n;
      ns[s] = (ns[s] ?? 0) + n;
      nk[k] = (nk[k] ?? 0) + n;
    }
  }
  if (N < 50) return 0;
  let I = 0;
  let celdas = 0;
  for (const [s, fila] of Object.entries(tabla)) {
    for (const [k, n] of Object.entries(fila)) {
      if (familia(k) !== fam || n === 0) continue;
      const p = n / N;
      I += p * Math.log2(p / ((ns[s] / N) * (nk[k] / N)));
      celdas += 1;
    }
  }
  // Corrección de Miller-Madow: con pocas muestras la información mutua se
  // infla sola; se descuenta el sesgo (celdas − filas − columnas + 1) / (2N ln 2).
  const sesgo = Math.max(0, celdas - Object.keys(ns).length - Object.keys(nk).length + 1) / (2 * N * Math.LN2);
  return Math.max(0, Math.round((I - sesgo) * 1000) / 1000);
}

/** Familias de un solo valor por emisión (la de objetos es multivaluada y sesgaría los bits). */
const FAMILIAS_CONTEXTO = ["zona", "comida", "energia", "golpe", "otras"];
const FAMILIAS_CONSECUENCIA = ["acc", "r", "cambio", "zona", "comio"];

export function resumir(l: LexicoDoc, nowIso: string, diaKey: string): void {
  l.resumen.bitsContexto = Math.max(...FAMILIAS_CONTEXTO.map((f) => bitsFamilia(l.contexto, f)), 0);
  l.resumen.bitsConsecuencia = Math.max(...FAMILIAS_CONSECUENCIA.map((f) => bitsFamilia(l.consecuencia, f)), 0);
  l.resumen.at = nowIso;
  if (l.resumen.diaKey !== diaKey) {
    l.resumen.diaKey = diaKey;
    l.resumen.emisionesDia = 0;
  }
  l.updatedAt = nowIso;
}

export function lecturaBits(bits: number): string {
  if (bits < 0.1) return "ruido";
  if (bits < 0.4) return "algo se repite";
  return "hay convención";
}

// --- glosas ---

interface Pista {
  clave: string;
  n: number;
  frac: number;
  pmi: number;
}

/**
 * Pistas de un símbolo: claves que lo acompañan más de lo que acompañan a
 * cualquier símbolo (PMI > umbral) y en una fracción mínima de sus emisiones
 * (`nSim` = cuántas veces se emitió/oyó). Sin eso, un contexto raro visto dos
 * veces parecería "su significado".
 */
function pistas(
  tabla: Record<string, Record<string, number>>,
  tot: Record<string, number>,
  totalEmisiones: number,
  sim: number,
  nSim: number,
  fams: string[],
  k: number,
): Pista[] {
  const fila = tabla[String(sim)] ?? {};
  const out: Pista[] = [];
  if (nSim === 0 || totalEmisiones === 0) return out;
  for (const [key, n] of Object.entries(fila)) {
    if (!fams.includes(familia(key)) || n < LENGUAJE.minPista) continue;
    const frac = n / nSim;
    if (frac < LENGUAJE.minFraccionPista) continue;
    // p(clave | símbolo) / p(clave): cuánto más acompaña a este símbolo que a cualquiera
    const pmi = Math.log2(frac / ((tot[key] ?? n) / totalEmisiones));
    if (pmi < LENGUAJE.minPmiPista) continue;
    out.push({ clave: key, n, frac, pmi: Math.round(pmi * 100) / 100 });
  }
  return out.sort((a, b) => b.pmi - a.pmi || b.n - a.n).slice(0, k);
}

function humano(clave: string): string {
  const [fam, ...resto] = clave.split(":");
  const v = resto.join(":");
  switch (fam) {
    case "zona":
      return `en ${v.split("/")[1] ?? v}`;
    case "env":
      return `en ${v}`;
    case "obj":
      return `con ${v.replace(/-/g, " ")} a la vista`;
    case "comida":
      return v === "si" ? "con comida cerca" : "sin comida cerca";
    case "energia":
      return `con energía ${v}`;
    case "golpe":
      return v === "si" ? "tras un golpe" : "sin golpes recientes";
    case "otras":
      return v === "0" ? "estando sola" : `con ${v} más cerca`;
    case "comio":
      return v === "si" ? "después de comer" : "sin haber comido";
    case "acc":
      return `quien oye hace «${v}»`;
    case "r":
      return v === "+" ? "a quien oye le va bien" : v === "-" ? "a quien oye le va mal" : "a quien oye no le cambia nada";
    case "cambio":
      return v === "si" ? "quien oye cambia de idea" : "quien oye no cambia de idea";
    default:
      return clave;
  }
}

export function glosaDe(l: LexicoDoc, sim: number): GlosaView {
  const n = l.porSimbolo[sim] ?? 0;
  const nOida = l.oidasPorSimbolo?.[sim] ?? 0;
  const ctx = pistas(l.contexto, l.totContexto, l.emisiones, sim, n, ["zona", "obj", "comida", "energia", "golpe", "otras", "comio"], 3);
  const cons = pistas(l.consecuencia, l.totConsecuencia, l.oidas, sim, nOida, ["acc", "r", "cambio", "zona", "comio"], 2);
  let texto: string;
  if (n < LENGUAJE.minGlosa) {
    texto = `«${silaba(sim)}» — todavía sin datos suficientes (n = ${n})`;
  } else {
    const partes = ctx.map((p) => `${Math.round(p.frac * 100)} % ${humano(p.clave)} (n = ${p.n}, PMI ${p.pmi})`);
    const despues = cons.map((p) => `${humano(p.clave)} ${Math.round(p.frac * 100)} % (n = ${p.n})`);
    texto = `«${silaba(sim)}» — ${partes.length ? partes.join(" · ") : "sin contexto claro"}${despues.length ? ` · después: ${despues.join(" · ")}` : ""}`;
  }
  return {
    simbolo: sim,
    silaba: silaba(sim),
    n,
    texto,
    contexto: ctx.map((p) => ({ clave: p.clave, humano: humano(p.clave), n: p.n, frac: Math.round(p.frac * 100) / 100, pmi: p.pmi })),
    consecuencia: cons.map((p) => ({ clave: p.clave, humano: humano(p.clave), n: p.n, frac: Math.round(p.frac * 100) / 100, pmi: p.pmi })),
  };
}

export function lexicoVista(l: LexicoDoc): LexicoView {
  const glosas = Array.from({ length: SIMBOLOS }, (_, s) => glosaDe(l, s)).sort((a, b) => b.n - a.n);
  const bigramas = Object.entries(l.bigramas)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([b, n]) => ({ bigrama: b, n }));
  return {
    emisiones: l.emisiones,
    oidas: l.oidas,
    emisionesHoy: l.resumen.emisionesDia,
    bitsContexto: l.resumen.bitsContexto,
    bitsConsecuencia: l.resumen.bitsConsecuencia,
    lecturaContexto: lecturaBits(l.resumen.bitsContexto),
    lecturaConsecuencia: lecturaBits(l.resumen.bitsConsecuencia),
    glosas,
    bigramas,
    at: l.resumen.at,
  };
}

/** Lo que una criatura tiene a la vista, para el contexto de una emisión. */
export function objetosAlaVista(c: CriaturaDoc, candidatas: Array<{ accion: string; objetivo: string }>): string[] {
  const out: string[] = [];
  for (const k of candidatas) {
    if (!k.objetivo || k.objetivo === "comida" || k.accion === "mudarse" || k.accion === "explorar" || k.accion === "observar") continue;
    if (!out.includes(k.objetivo)) out.push(k.objetivo);
  }
  return out.slice(0, 6);
}
