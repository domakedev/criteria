// La crónica de la sociedad: hechos en plantillas (no hay voz). Cada evento
// lleva su tipo, la criatura y datos numéricos para que la UI filtre y para
// que, algún día, un panel de hallazgos los agregue. El doc del día tiene un
// tope; lo que no cabe se cuenta en `omitidos` en vez de perderse en silencio.
import { BOUNDS, LIMITES } from "./config";
import type { CronicaDoc, Evento, EventoTipo } from "./types";

export function evento(
  at: string,
  tipo: EventoTipo,
  cid: string | null,
  texto: string,
  datos: Record<string, string | number | boolean> = {},
): Evento {
  return { at, tipo, cid, texto: texto.replace(/\s+/g, " ").trim().slice(0, BOUNDS.eventoChars), datos };
}

export function cronicaVacia(key: string): CronicaDoc {
  return { key, eventos: [], omitidos: 0 };
}

/** Agrega eventos respetando el tope del día; cuenta los que no caben. */
export function agregarEventos(doc: CronicaDoc, nuevos: Evento[], max = LIMITES.cronicaPorDia): void {
  for (const e of nuevos) {
    if (doc.eventos.length >= max) doc.omitidos += 1;
    else doc.eventos.push(e);
  }
}

export function signo(x: number): string {
  const v = x.toFixed(2);
  return x > 0 ? `+${v}` : x < 0 ? `−${v.slice(1)}` : v;
}
