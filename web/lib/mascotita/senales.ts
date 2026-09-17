// Percepción cruda: lo que la criatura "ve" antes de decidir entra a la red
// como un vector fijo de 96 números en [−1, 1]. Nada de etiquetas: los
// nombres (rutas, objetos, zonas, verbos) se convierten en patrones por
// hashing de rasgos (cada token cae en una casilla con signo), así "hongo-rojo"
// produce siempre el mismo patrón y la red aprende sola qué le hace. NO entran
// ni el riesgo estimado por el entorno ni las probabilidades ocultas.
import { RED } from "./config";
import { hashString } from "./rng";
import type { Creencia, CriaturaDoc, Senal } from "./types";

/** Bloques del vector de entrada: [inicio, fin). */
export const BLOQUES = {
  cuerpo: [0, 8],
  rasgos: [8, 14],
  entorno: [14, 18],
  zona: [18, 26],
  verbo: [26, 38],
  objetivo: [38, 62],
  historia: [62, 68],
  oido: [68, 88],
  cultura: [88, 96],
} as const;

/** Orden fijo del one-hot de entornos; uno nuevo se agrega AL FINAL (cambio de formato). */
export const ENV_ORDEN = ["repo", "bosque", "ciudad", "cine"] as const;

export const SIMBOLOS = 16;

/** Lo que oyó en su zona desde el último tick, ya resumido. */
export interface Oido {
  /** conteo por símbolo (16) */
  conteo: number[];
  dios: boolean;
  /** pasos desde que se oyó (0 = este mismo latido) */
  hacePasos: number;
  emisoras: number;
  pariente: boolean;
}

export interface ContextoSenales {
  criatura: CriaturaDoc;
  env: string;
  zona: string;
  esDia: boolean;
  /** unidades de comida a la vista */
  comida: number;
  /** otras criaturas en la zona */
  otras: number;
  oido: Oido | null;
}

export interface AccionSenales {
  type: string;
  target: string;
  costEnergy: number;
}

function s11(v01: number): number {
  return Math.max(-1, Math.min(1, v01 * 2 - 1));
}

/** Tokens de un nombre: separa por no alfanuméricos y camelCase; ≤ 12, minúsculas. */
export function tokens(s: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const norm = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase();
  for (const t of norm.split(/[^a-z0-9]+/)) {
    if (t.length < 2 || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 12) break;
  }
  return out;
}

/** Tokens de un objetivo con su "forma": extensión, profundidad, si parece ruta. */
export function tokensObjetivo(target: string): string[] {
  const t = tokens(target);
  const slashes = (target.match(/\//g) ?? []).length;
  if (slashes > 0) t.push(`prof:${Math.min(4, slashes)}`);
  const ext = /\.([a-z0-9]{1,5})$/i.exec(target);
  if (ext) t.push(`ext:${ext[1].toLowerCase()}`);
  if (target === "") t.push("nada");
  return t;
}

/** Vuelca tokens en las casillas [ini, ini+dim) con signo y normaliza el bloque a norma 1. */
export function hashEn(vec: Float32Array, ini: number, dim: number, toks: string[]): void {
  for (const t of toks) {
    const h = hashString(t);
    const idx = ini + (h % dim);
    const signo = (h & 0x40000) !== 0 ? 1 : -1;
    vec[idx] += signo;
  }
  let ss = 0;
  for (let i = ini; i < ini + dim; i++) ss += vec[i] * vec[i];
  if (ss > 0) {
    const inv = 1 / Math.sqrt(ss);
    for (let i = ini; i < ini + dim; i++) vec[i] *= inv;
  }
}

/**
 * El vector de entrada de la red para una acción candidata en este contexto.
 * `novedad` la estima el entorno (0..1); `creencia` es lo que ella misma vivió
 * con (objetivo, verbo), si algo.
 */
export function vectorEntrada(
  ctx: ContextoSenales,
  a: AccionSenales,
  novedad: number,
  creencia: Creencia | undefined,
): Float32Array {
  const x = new Float32Array(RED.entrada);
  const c = ctx.criatura;

  // cuerpo
  let i: number = BLOQUES.cuerpo[0];
  x[i++] = s11(c.drives.energy);
  x[i++] = s11(c.drives.boredom);
  x[i++] = s11(c.drives.loneliness);
  x[i++] = s11(c.dano);
  x[i++] = s11(Math.min(1, c.edadTicks / Math.max(1, c.genes.vida)));
  x[i++] = Math.max(-1, Math.min(1, c.mood.valence));
  x[i++] = s11(c.mood.arousal);
  x[i++] = 0;

  // rasgos
  i = BLOQUES.rasgos[0];
  x[i++] = s11(c.rasgos.curiosidad);
  x[i++] = s11(c.rasgos.cautela);
  x[i++] = s11(c.rasgos.sociabilidad);
  x[i++] = s11(c.rasgos.juego);
  x[i++] = s11(c.rasgos.constancia);
  x[i++] = s11(c.rasgos.orden);

  // entorno (one-hot; desconocido = todo cero)
  const envIdx = (ENV_ORDEN as readonly string[]).indexOf(ctx.env);
  if (envIdx >= 0 && envIdx < BLOQUES.entorno[1] - BLOQUES.entorno[0]) x[BLOQUES.entorno[0] + envIdx] = 1;

  // zona: hash (4) + día/noche + comida + otras + reservado
  hashEn(x, BLOQUES.zona[0], 4, tokens(ctx.zona));
  x[BLOQUES.zona[0] + 4] = ctx.esDia ? 1 : -1;
  x[BLOQUES.zona[0] + 5] = s11(Math.min(1, ctx.comida / 4));
  x[BLOQUES.zona[0] + 6] = s11(Math.min(1, ctx.otras / 4));
  x[BLOQUES.zona[0] + 7] = 0;

  // acción: verbo y objetivo
  hashEn(x, BLOQUES.verbo[0], BLOQUES.verbo[1] - BLOQUES.verbo[0], [a.type]);
  hashEn(x, BLOQUES.objetivo[0], BLOQUES.objetivo[1] - BLOQUES.objetivo[0], tokensObjetivo(a.target));

  // historia propia
  i = BLOQUES.historia[0];
  x[i++] = creencia ? Math.max(-1, Math.min(1, creencia.q)) : 0;
  x[i++] = creencia ? s11(creencia.n / (creencia.n + 5)) : -1;
  x[i++] = s11(Math.max(0, Math.min(1, novedad)));
  x[i++] = s11(Math.max(0, Math.min(1, a.costEnergy)));
  x[i++] = creencia ? 1 : -1;
  x[i++] = 0;

  // oído
  if (ctx.oido) {
    const o = ctx.oido;
    const ini = BLOQUES.oido[0];
    for (let k = 0; k < SIMBOLOS; k++) x[ini + k] = Math.min(1, (o.conteo[k] ?? 0) / 2);
    x[ini + 16] = o.dios ? 1 : 0;
    x[ini + 17] = Math.max(0, 1 - o.hacePasos / 3);
    x[ini + 18] = Math.min(1, o.emisoras / 3);
    x[ini + 19] = o.pariente ? 1 : 0;
  }

  // cultura: hash del linaje (madre) para que pueda distinguir voces si le sirve
  if (c.padre) hashEn(x, BLOQUES.cultura[0], 4, [c.padre]);

  return x;
}

/** Zona "de un archivo" del repo: su carpeta de primer nivel, o "raiz". */
export function zonaRepo(path: string | null): string {
  if (!path) return "raiz";
  const i = path.indexOf("/");
  return i < 0 ? "raiz" : path.slice(0, i);
}

/** Resume las señales de una zona en lo que oye `c` (sin las suyas); null si no hay nada. */
export function resumirOido(senales: Senal[] | undefined, c: CriaturaDoc, seqActual: number, hijos: Set<string>): Oido | null {
  if (!senales || senales.length === 0) return null;
  const conteo = Array.from({ length: SIMBOLOS }, () => 0);
  let dios = false;
  let hacePasos = 3;
  let pariente = false;
  const emisoras = new Set<string>();
  for (const s of senales) {
    if (s.de === c.cid) continue;
    if (s.sim < 0 || s.sim >= SIMBOLOS) continue;
    conteo[s.sim] += 1;
    emisoras.add(s.de);
    if (s.dios) dios = true;
    hacePasos = Math.min(hacePasos, Math.max(0, seqActual - s.seq));
    if (s.de === c.padre || hijos.has(s.de)) pariente = true;
  }
  if (emisoras.size === 0) return null;
  return { conteo, dios, hacePasos, emisoras: emisoras.size, pariente };
}

/** Quiénes emitieron (cids y "dios") en una lista de señales, sin `yo`. */
export function emisorasDe(senales: Senal[] | undefined, yo: string): string[] {
  const out: string[] = [];
  for (const s of senales ?? []) if (s.de !== yo && !out.includes(s.de)) out.push(s.de);
  return out;
}
