// La sociedad: comida que se regenera, reproducción sin pareja con herencia
// (genes con mutación, pesos con ruido, creencias más firmes) y muerte por
// vejez, hambre o fallos. Funciones puras sobre los documentos; el latido
// las llama y guarda.
import { LIMITES, RECURSOS_NATURALES, RED, SOCIEDAD, cfg } from "./config";
import * as C from "./cognition";
import { heredarRed } from "./cerebro";
import { heredarCreencias } from "./creencias";
import { getEnvironment, lugarAlAzar } from "./envs";
import type { Red } from "./nn";
import { clamp01, round3, seededRng } from "./rng";
import type { CausaMuerte, CriaturaDoc, LinajeDoc, LinajeEntrada, MundoDoc, Recurso } from "./types";

export function claveZona(env: string, zona: string): string {
  return `${env}/${zona}`;
}

export function recursoDe(m: MundoDoc, env: string, zona: string): Recurso {
  const k = claveZona(env, zona);
  return (m.recursos[k] ??= { comida: 0, fuente: null });
}

/** Regeneración natural y de fuentes desde el último latido (`hours`). */
export function regenerarRecursos(m: MundoDoc, hours: number, nowIso: string): void {
  const h = Math.max(0, Math.min(24, hours));
  if (h === 0) return;
  for (const [k, porHora] of Object.entries(RECURSOS_NATURALES)) {
    const r = (m.recursos[k] ??= { comida: 0, fuente: null });
    r.comida = round3(Math.min(SOCIEDAD.comidaTope, r.comida + porHora * h));
  }
  for (const r of Object.values(m.recursos)) {
    if (!r.fuente) continue;
    if (r.fuente.hasta < nowIso) {
      r.fuente = null;
      continue;
    }
    r.comida = round3(Math.min(SOCIEDAD.comidaTope, r.comida + r.fuente.porHora * h));
  }
  // zonas sin nada y sin fuente no ocupan sitio
  for (const [k, r] of Object.entries(m.recursos)) {
    if (r.comida <= 0 && !r.fuente && !(k in RECURSOS_NATURALES)) delete m.recursos[k];
  }
}

// --- muerte ---

export function causaMuerteDe(c: CriaturaDoc): CausaMuerte | null {
  if (c.edadTicks > c.genes.vida) return "vejez";
  if (c.hambreTicks >= SOCIEDAD.hambreMuerteTicks) return "hambre";
  if (c.dano >= SOCIEDAD.danoMuerte) return "fallos";
  return null;
}

export function morir(c: CriaturaDoc, causa: CausaMuerte, nowIso: string): void {
  c.viva = false;
  c.diedAt = nowIso;
  c.causaMuerte = causa;
  c.updatedAt = nowIso;
}

export const TEXTO_MUERTE: Record<CausaMuerte, string> = {
  vejez: "murió de vieja",
  hambre: "murió de hambre",
  fallos: "murió de tantos golpes",
  dios: "se fue por decisión del dios",
};

// --- reproducción ---

export function puedeReproducirse(c: CriaturaDoc, m: MundoDoc): { ok: boolean; motivo: string } {
  if (c.edadTicks < SOCIEDAD.madurezTicks) return { ok: false, motivo: "inmadura" };
  if (c.drives.energy < SOCIEDAD.energiaParaCria) return { ok: false, motivo: "sin energía" };
  if (c.ticksDesdeCria < SOCIEDAD.ticksEntreCrias) return { ok: false, motivo: "cría reciente" };
  const r = m.recursos[claveZona(c.env, c.zona)];
  if (!r || r.comida < SOCIEDAD.comidaParaCria) return { ok: false, motivo: "sin comida en la zona" };
  return { ok: true, motivo: "" };
}

export interface Nacimiento {
  hija: CriaturaDoc;
  redHija: Red;
}

/** La madre paga; la hija hereda genes mutados, pesos con ruido y creencias firmes. */
export function engendrar(madre: CriaturaDoc, redMadre: Red, m: MundoDoc, seq: number, nowIso: string): Nacimiento {
  const gen = madre.gen + 1;
  const cid = C.cidPara(madre.cid, gen, `${seq}:${madre.stats.crias + 1}`);
  const genes = C.mutarGenes(madre.genes, cid);
  let env = madre.env;
  let zona = madre.zona;
  if (cfg().nacimiento === "aleatorio") {
    const lugar = lugarAlAzar(seededRng(cid, "lugar"));
    env = lugar.env;
    zona = lugar.zona;
  }
  const hija = C.nuevaCriatura({ cid, genes, gen, padre: madre.cid, env, zona, now: nowIso, energia: SOCIEDAD.energiaCria });
  hija.creencias = heredarCreencias(madre.creencias, RED.creenciasHeredadas, nowIso);
  const redHija = heredarRed(redMadre, madre.genes.sigma, cid);

  madre.drives.energy = round3(clamp01(madre.drives.energy - SOCIEDAD.costoCria));
  madre.ticksDesdeCria = 0;
  madre.stats.crias += 1;
  madre.updatedAt = nowIso;
  const r = recursoDe(m, madre.env, madre.zona);
  r.comida = round3(Math.max(0, r.comida - SOCIEDAD.comidaParaCria));
  return { hija, redHija };
}

// --- linaje ---

export function linajeVacio(nowIso: string): LinajeDoc {
  return { entradas: [], updatedAt: nowIso };
}

export function entradaLinaje(c: CriaturaDoc): LinajeEntrada {
  return {
    cid: c.cid,
    nombre: c.nombre,
    padre: c.padre,
    gen: c.gen,
    nacio: c.bornAt,
    murio: c.diedAt,
    causa: c.causaMuerte,
    tono: C.tonoDe(c.genes),
  };
}

/** Inserta o actualiza una entrada; recorta las muertas más viejas si pasa del tope. */
export function anotarLinaje(l: LinajeDoc, c: CriaturaDoc, nowIso: string): void {
  const e = entradaLinaje(c);
  const i = l.entradas.findIndex((x) => x.cid === c.cid);
  if (i >= 0) l.entradas[i] = e;
  else l.entradas.push(e);
  if (l.entradas.length > LIMITES.linaje) {
    const muertas = l.entradas.filter((x) => x.murio).sort((a, b) => a.murio!.localeCompare(b.murio!));
    const sobran = l.entradas.length - LIMITES.linaje;
    const fuera = new Set(muertas.slice(0, sobran).map((x) => x.cid));
    l.entradas = l.entradas.filter((x) => !fuera.has(x.cid));
  }
  l.updatedAt = nowIso;
}

/** Texto de dónde está para la crónica. */
export function lugarTexto(env: string, zona: string): string {
  const e = getEnvironment(env);
  return `${e?.nombreZona(zona) ?? zona} (${e?.name ?? env})`;
}
