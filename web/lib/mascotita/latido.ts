// El LATIDO: una llamada cada 15 minutos (GitHub Action → /api/mascotita/cron,
// o la página cuando nota atraso) que hace vivir a la colonia un rato. Toma
// el candado del mundo, regenera la comida, tickea a las criaturas vivas en
// round-robin (en serie, con plazo por criatura y presupuesto de fetches
// compartido), decide muertes y nacimientos, guarda cada criatura apenas
// termina, y al final el mundo, la crónica, el linaje y los contadores del día.
import { LIMITES, RED, SOCIEDAD, cfg } from "./config";
import { cabeOtra, modoAhorro } from "./presupuesto";
import * as C from "./cognition";
import { cargarCerebro, cerebroDoc } from "./cerebro";
import { agregarEventos, cronicaVacia, evento } from "./cronica";
import { getStore } from "./db";
import { makeDeadline } from "./plazo";
import {
  TEXTO_MUERTE,
  anotarLinaje,
  causaMuerteDe,
  claveZona,
  engendrar,
  linajeVacio,
  lugarTexto,
  morir,
  puedeReproducirse,
  regenerarRecursos,
} from "./sociedad";
import { runTick } from "./tick";
import { fotoDe } from "./vistas";
import type { CriaturaDoc, Evento, LatidoReason, LatidoResult, LinajeDoc, MundoDoc } from "./types";

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

function vacio(skipped: LatidoResult["skipped"], retryAt: string | null, ms: number): LatidoResult {
  return { skipped, retryAt, seq: null, procesadas: [], saltadas: [], nacidas: [], muertas: [], eventos: [], ms };
}

export async function latir(reason: LatidoReason, opts: { now?: Date; deadlineMs?: number } = {}): Promise<LatidoResult> {
  const store = getStore();
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const t0 = Date.now();
  const deadline = makeDeadline(opts.deadlineMs ?? LIMITES.latidoMs, t0);
  const dayKey = C.limaDayKey(now);
  const contInicio = store.contadores();
  const maxVivas = cfg().maxVivas;

  const lease = await store.tomarLatido(now, LIMITES.lockMs);
  if (!lease.ok) return vacio(lease.skipped, lease.retryAt, Date.now() - t0);
  const { mundo, seq } = lease;
  rotarDia(mundo, dayKey);
  mundo.dia.latidos += 1;

  const procesadas: string[] = [];
  const saltadas: Array<{ cid: string; why: string }> = [];
  const nacidas: string[] = [];
  const muertas: string[] = [];
  const eventos: Evento[] = [];
  const esHoraDeSonar = C.limaHour(now) === RED.horaSueno;
  const fetchBudget = { remaining: LIMITES.fetchesPorLatido };
  let linaje: LinajeDoc | null = null;
  const conLinaje = async (): Promise<LinajeDoc> => (linaje ??= (await store.getLinaje()) ?? linajeVacio(nowIso));

  try {
    // comida: lo que creció desde el último latido
    const horas = mundo.latido.lastAt ? Math.max(0, (now.getTime() - Date.parse(mundo.latido.lastAt)) / 3_600_000) : 0;
    regenerarRecursos(mundo, horas, nowIso);

    const todas = await store.listarVivas(LIMITES.fotos);
    // Round-robin: orden estable por cid, empezando donde quedó el cursor. Con
    // pocas vivas todas tickean cada latido; con más, se turnan. En modo
    // ahorro (el día ya gastó demasiado) tickea la mitad.
    todas.sort((a, b) => a.cid.localeCompare(b.cid));
    const ahorro = modoAhorro(mundo);
    const cupoBase = ahorro ? Math.ceil(LIMITES.ticksPorLatido / 2) : LIMITES.ticksPorLatido;
    const cupo = Math.min(cupoBase, todas.length);
    const inicio = todas.length ? mundo.rotacion.cursor % todas.length : 0;
    const orden: CriaturaDoc[] = todas.map((_, k) => todas[(inicio + k) % todas.length]);
    mundo.rotacion.cursor = todas.length ? (inicio + cupo) % todas.length : 0;
    if (ahorro && mundo.dia.latidos % 4 === 1) {
      eventos.push(evento(nowIso, "aviso", null, "Modo ahorro: hoy ya se gastó el 90 % del presupuesto; tickea la mitad."));
    }
    const cronica = (await store.getCronica(dayKey)) ?? cronicaVacia(dayKey);
    let vivasAhora = todas.length;
    // dónde está cada una (para contar compañía; se actualiza al mudarse)
    const donde = new Map(todas.map((c) => [c.cid, claveZona(c.env, c.zona)] as const));

    for (let i = 0; i < orden.length; i++) {
      const c: CriaturaDoc = orden[i];
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
      const aqui = claveZona(c.env, c.zona);
      let otras = 0;
      for (const [cid, k] of donde) if (cid !== c.cid && k === aqui) otras += 1;

      const out = await runTick(c, red, {
        now,
        deadline: makeDeadline(plazo),
        fetchBudget,
        esHoraDeSonar,
        otras,
        recursos: mundo.recursos,
      });
      eventos.push(...out.eventos);
      donde.set(c.cid, claveZona(c.env, c.zona));
      if (!red.sana()) {
        // Un NaN en los pesos no se guarda jamás: se conservan los previos.
        eventos.push(evento(nowIso, "aviso", c.cid, `${c.nombre}: la red se desbordó en el tick ${out.seq}; se conservan los pesos previos.`));
        saltadas.push({ cid: c.cid, why: "red inestable" });
        continue;
      }

      // --- muerte ---
      const causa = causaMuerteDe(c);
      if (causa) {
        morir(c, causa, nowIso);
        await store.guardarCriatura(c);
        await store.borrarCerebro(c.cid);
        mundo.fotos[c.cid] = fotoDe(c);
        anotarLinaje(await conLinaje(), c, nowIso);
        mundo.poblacion.muertas += 1;
        vivasAhora -= 1;
        donde.delete(c.cid);
        muertas.push(c.cid);
        eventos.push(
          evento(nowIso, "muerte", c.cid, `${c.nombre} ${TEXTO_MUERTE[causa]} en ${lugarTexto(c.env, c.zona)}, a los ${c.edadTicks} ticks (gen ${c.gen}).`, {
            causa,
            edad: c.edadTicks,
            gen: c.gen,
          }),
        );
        continue;
      }

      // --- reproducción ---
      const puede = puedeReproducirse(c, mundo);
      if (puede.ok) {
        const cabe = cabeOtra(mundo, vivasAhora, maxVivas);
        if (cabe.ok) {
          const { hija, redHija } = engendrar(c, red, mundo, seq, nowIso);
          await store.guardarCriatura(hija);
          await store.guardarCerebro(cerebroDoc(hija.cid, redHija, 0, 0, nowIso));
          mundo.fotos[hija.cid] = fotoDe(hija);
          const l = await conLinaje();
          anotarLinaje(l, c, nowIso);
          anotarLinaje(l, hija, nowIso);
          mundo.poblacion.nacidas += 1;
          mundo.poblacion.generacionMax = Math.max(mundo.poblacion.generacionMax, hija.gen);
          vivasAhora += 1;
          donde.set(hija.cid, claveZona(hija.env, hija.zona));
          nacidas.push(hija.cid);
          eventos.push(
            evento(nowIso, "nacimiento", hija.cid, `Nació ${hija.nombre} (gen ${hija.gen}), cría de ${c.nombre}, en ${lugarTexto(hija.env, hija.zona)}.`, {
              madre: c.cid,
              gen: hija.gen,
              env: hija.env,
              zona: hija.zona,
            }),
          );
        } else if (c.ticksDesdeCria % 40 === 0) {
          eventos.push(evento(nowIso, "aviso", c.cid, `${c.nombre} podría tener cría, pero no nace nadie: ${cabe.motivo}.`, { motivo: cabe.motivo ?? "" }));
        }
      }

      const pasosPrevios = cerebroPrevio?.pasos ?? 0;
      await store.guardarCriatura(c);
      await store.guardarCerebro(cerebroDoc(c.cid, red, pasosPrevios + out.pasosGradiente, out.perdida, nowIso));
      mundo.fotos[c.cid] = fotoDe(c);
      procesadas.push(c.cid);
    }

    if (vivasAhora === 0 && todas.length > 0) {
      eventos.push(evento(nowIso, "aviso", null, "La colonia se extinguió. Solo el dios puede fundar otra."));
    }
    mundo.poblacion.vivas = vivasAhora;
    podarFotos(mundo);
    agregarEventos(cronica, eventos);
    await store.guardarCronica(cronica);
    if (linaje) await store.guardarLinaje(linaje);
  } finally {
    const cont = store.contadores();
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

  return { skipped: null, retryAt: null, seq, procesadas, saltadas, nacidas, muertas, eventos, ms: Date.now() - t0 };
}

/** Comida necesaria para que nazca una cría (para la UI). */
export const COMIDA_PARA_CRIA = SOCIEDAD.comidaParaCria;
