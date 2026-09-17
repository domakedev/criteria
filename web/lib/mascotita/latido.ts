// El LATIDO: una llamada cada 15 minutos (GitHub Action → /api/mascotita/cron,
// o la página cuando nota atraso) que hace vivir a la colonia un rato. Toma
// el candado del mundo, tickea a las criaturas vivas (en serie, con plazo por
// criatura y presupuesto de fetches compartido), guarda cada una apenas
// termina, y al final el mundo, la crónica y los contadores del día.
//
// Fase 1: una sola criatura. Fases 2-3 añaden round-robin, presupuesto
// proyectado, nacimientos y muertes aquí mismo.
import { LIMITES, RED } from "./config";
import * as C from "./cognition";
import { cargarCerebro, cerebroDoc } from "./cerebro";
import { agregarEventos, cronicaVacia, evento } from "./cronica";
import { getStore } from "./db";
import { makeDeadline } from "./plazo";
import { runTick } from "./tick";
import { fotoDe } from "./vistas";
import type { CriaturaDoc, Evento, LatidoReason, LatidoResult, MundoDoc } from "./types";

export function mundoNuevo(id: string, now: string, dayKey: string): MundoDoc {
  return {
    id,
    latido: { seq: 0, lock: null, lastAt: null },
    dia: { key: dayKey, latidos: 0, escrituras: 0, lecturas: 0 },
    poblacion: { vivas: 0, nacidas: 0, muertas: 0, generacionMax: 0 },
    fotos: {},
    recursos: {},
    senales: {},
    pendientes: {},
    rotacion: { cursor: 0 },
    createdAt: now,
    updatedAt: now,
  };
}

/** Si cambió el día, reinicia los contadores. */
export function rotarDia(m: MundoDoc, dayKey: string): void {
  if (m.dia.key !== dayKey) m.dia = { key: dayKey, latidos: 0, escrituras: 0, lecturas: 0 };
}

/** Deja en `fotos` como máximo el tope: primero se van las muertas más viejas. */
export function podarFotos(m: MundoDoc): void {
  const cids = Object.keys(m.fotos);
  if (cids.length <= LIMITES.fotos) return;
  const muertas = cids.filter((k) => !m.fotos[k].viva).sort((a, b) => m.fotos[a].edad - m.fotos[b].edad);
  for (const k of muertas.slice(0, cids.length - LIMITES.fotos)) delete m.fotos[k];
}

export async function latir(reason: LatidoReason, opts: { now?: Date; deadlineMs?: number } = {}): Promise<LatidoResult> {
  const store = getStore();
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const t0 = Date.now();
  const deadline = makeDeadline(opts.deadlineMs ?? LIMITES.latidoMs, t0);
  const dayKey = C.limaDayKey(now);
  const contInicio = store.contadores();

  const lease = await store.tomarLatido(now, LIMITES.lockMs);
  if (!lease.ok) {
    return {
      skipped: lease.skipped,
      retryAt: lease.retryAt,
      seq: null,
      procesadas: [],
      saltadas: [],
      nacidas: [],
      muertas: [],
      eventos: [],
      ms: Date.now() - t0,
    };
  }
  const { mundo, seq } = lease;
  rotarDia(mundo, dayKey);
  mundo.dia.latidos += 1;

  const procesadas: string[] = [];
  const saltadas: Array<{ cid: string; why: string }> = [];
  const eventos: Evento[] = [];
  const esHoraDeSonar = C.limaHour(now) === RED.horaSueno;
  const fetchBudget = { remaining: LIMITES.fetchesPorLatido };

  try {
    const vivas = await store.listarVivas(LIMITES.fotos);
    vivas.sort((a, b) => (a.lastTickAt ?? "").localeCompare(b.lastTickAt ?? "") || a.cid.localeCompare(b.cid));
    const cupo = Math.min(LIMITES.ticksPorLatido, vivas.length);
    const cronica = (await store.getCronica(dayKey)) ?? cronicaVacia(dayKey);

    for (let i = 0; i < vivas.length; i++) {
      const c: CriaturaDoc = vivas[i];
      if (i >= cupo) {
        saltadas.push({ cid: c.cid, why: "cupo" });
        continue;
      }
      const restantes = cupo - i;
      const plazo = Math.min(LIMITES.tickMs, Math.floor((deadline.remaining() - 2_000) / restantes));
      if (plazo < 1_500) {
        saltadas.push({ cid: c.cid, why: "sin tiempo" });
        continue;
      }
      const cerebroPrevio = await store.getCerebro(c.cid);
      const { red, nueva } = cargarCerebro(cerebroPrevio, c.cid);
      if (nueva && cerebroPrevio) {
        eventos.push(evento(nowIso, "aviso", c.cid, `${c.nombre} despertó con un cerebro nuevo: el guardado no se pudo leer.`));
      }
      const out = await runTick(c, red, {
        now,
        deadline: makeDeadline(plazo),
        fetchBudget,
        esHoraDeSonar,
      });
      eventos.push(...out.eventos);
      if (!red.sana()) {
        // Un NaN en los pesos no se guarda jamás: se reintenta con el cerebro previo.
        eventos.push(evento(nowIso, "aviso", c.cid, `${c.nombre}: la red se desbordó en el tick ${out.seq}; se conservan los pesos previos.`));
        saltadas.push({ cid: c.cid, why: "red inestable" });
        continue;
      }
      const pasosPrevios = cerebroPrevio?.pasos ?? 0;
      await store.guardarCriatura(c);
      await store.guardarCerebro(cerebroDoc(c.cid, red, pasosPrevios + out.pasosGradiente, out.perdida, nowIso));
      mundo.fotos[c.cid] = fotoDe(c);
      procesadas.push(c.cid);
    }

    mundo.poblacion.vivas = vivas.length;
    podarFotos(mundo);
    agregarEventos(cronica, eventos);
    await store.guardarCronica(cronica);
  } finally {
    const cont = store.contadores();
    // +2 por el mundo (candado y guardado final) que se cuentan al escribir
    mundo.dia.lecturas += cont.lecturas - contInicio.lecturas;
    mundo.dia.escrituras += cont.escrituras - contInicio.escrituras + 1;
    mundo.latido.lastAt = nowIso;
    mundo.latido.lock = null;
    mundo.updatedAt = nowIso;
    try {
      await store.guardarMundo(mundo);
    } catch {
      await store.soltarLatido(seq).catch(() => {});
    }
  }

  return { skipped: null, retryAt: null, seq, procesadas, saltadas, nacidas: [], muertas: [], eventos, ms: Date.now() - t0 };
}
