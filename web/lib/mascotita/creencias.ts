// Creencias: una tabla (objetivo, verbo) → valor esperado y cuántas veces lo
// vivió. Solo se alimenta de resultados propios (y de lo que heredó de su
// madre). Es la "cultura" transmisible: números que dicen "comer hongo-rojo
// me fue −0.62 siete veces". La red las recibe como entrada y decide cuánto
// fiarse.
import { LIMITES, RED } from "./config";
import { clamp, round3 } from "./rng";
import type { Creencia, CreenciaView } from "./types";

function slugObjetivo(target: string): string {
  const s = target
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9./-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return (s || "nada").slice(0, 48);
}

export function claveCreencia(target: string, verb: string): string {
  return `${slugObjetivo(target)}|${verb.slice(0, 20)}`;
}

export function partesClave(clave: string): { objetivo: string; verbo: string } {
  const i = clave.lastIndexOf("|");
  if (i < 0) return { objetivo: clave, verbo: "" };
  return { objetivo: clave.slice(0, i), verbo: clave.slice(i + 1) };
}

/** Media incremental con α ≥ αmin: las viejas creencias siguen moviéndose. */
export function actualizarCreencia(
  map: Record<string, Creencia>,
  clave: string,
  r: number,
  now: string,
): Creencia {
  const prev = map[clave];
  const n = (prev?.n ?? 0) + 1;
  const alpha = Math.max(RED.creenciaAlphaMin, 1 / n);
  const q0 = prev?.q ?? 0;
  const q = round3(clamp(q0 + alpha * (clamp(r, -1, 1) - q0), -1, 1));
  const c: Creencia = { q, n, t: now };
  map[clave] = c;
  return c;
}

/** Firmeza de una creencia: cuántas veces y qué tan lejos de cero. */
export function firmeza(c: Creencia): number {
  return c.n * Math.abs(c.q);
}

/** Deja como máximo `max` creencias: se van las de menor n y, a igual n, las más viejas. */
export function podarCreencias(map: Record<string, Creencia>, max = LIMITES.creencias): void {
  const claves = Object.keys(map);
  if (claves.length <= max) return;
  claves.sort((a, b) => map[a].n - map[b].n || map[a].t.localeCompare(map[b].t));
  for (const k of claves.slice(0, claves.length - max)) delete map[k];
}

/** Las `k` más firmes (por n·|q|). */
export function creenciasFirmes(map: Record<string, Creencia>, k: number): Array<[string, Creencia]> {
  return Object.entries(map)
    .sort((a, b) => firmeza(b[1]) - firmeza(a[1]))
    .slice(0, k);
}

/** Lo que hereda la cría: las más firmes de la madre, con la mitad de n (las cree, pero menos). */
export function heredarCreencias(map: Record<string, Creencia>, k: number, now: string): Record<string, Creencia> {
  const out: Record<string, Creencia> = {};
  for (const [clave, c] of creenciasFirmes(map, k)) {
    out[clave] = { q: c.q, n: Math.max(1, Math.floor(c.n / 2)), t: now };
  }
  return out;
}

export function creenciasVista(map: Record<string, Creencia>, k: number): CreenciaView[] {
  return creenciasFirmes(map, k).map(([clave, c]) => {
    const { objetivo, verbo } = partesClave(clave);
    return { clave, objetivo, verbo, q: c.q, n: c.n };
  });
}
