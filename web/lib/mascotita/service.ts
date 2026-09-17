// Operaciones de la colonia que no son un latido: el estado para la página,
// fundar (nace la primera criatura), borrar todo.
import { LIMITES, cfg } from "./config";
import * as C from "./cognition";
import { cerebroDoc, cerebroNuevo } from "./cerebro";
import { agregarEventos, cronicaVacia, evento } from "./cronica";
import { getStore } from "./db";
import { MascotitaError } from "./errors";
import { listEnvironments, lugarAlAzar, nombreZona, getEnvironment } from "./envs";
import { mundoNuevo, rotarDia } from "./latido";
import { seededRng } from "./rng";
import { presupuestoVista } from "./presupuesto";
import { criaturaVista, fotoDe, limitesVista } from "./vistas";
import type { CriaturaView, MundoView } from "./types";

const MIN_MS = 60_000;

export async function getMundoView(): Promise<MundoView> {
  const store = getStore();
  const now = new Date();
  const nowIso = now.toISOString();
  const dayKey = C.limaDayKey(now);
  const envs = listEnvironments();
  const limites = limitesVista(cfg().maxVivas);
  const mundo = await store.getMundo();
  if (!mundo) {
    return {
      hay: false,
      latido: { seq: 0, lastAt: null, ocupado: false, retryAt: null },
      dia: { key: dayKey, latidos: 0, escrituras: 0, lecturas: 0 },
      poblacion: { vivas: 0, nacidas: 0, muertas: 0, generacionMax: 0 },
      fotos: {},
      recursos: {},
      limites,
      presupuesto: presupuestoVista(null, 0, limites.maxVivas),
      envs,
      criaturas: [],
      cronica: [],
      atrasado: false,
    };
  }
  rotarDia(mundo, dayKey);
  const [vivas, cronica] = await Promise.all([store.listarVivas(LIMITES.fotos), store.getCronica(dayKey)]);
  const ocupado = !!mundo.latido.lock && Date.parse(mundo.latido.lock.until) > now.getTime();
  const lastMs = mundo.latido.lastAt ? Date.parse(mundo.latido.lastAt) : 0;
  const atrasado = !ocupado && vivas.length > 0 && now.getTime() - lastMs > LIMITES.atrasoMin * MIN_MS;
  return {
    hay: true,
    latido: { seq: mundo.latido.seq, lastAt: mundo.latido.lastAt, ocupado, retryAt: ocupado ? mundo.latido.lock!.until : null },
    dia: mundo.dia,
    poblacion: { ...mundo.poblacion, vivas: vivas.length },
    fotos: mundo.fotos,
    recursos: mundo.recursos,
    limites,
    presupuesto: presupuestoVista(mundo, vivas.length, limites.maxVivas),
    envs,
    criaturas: vivas.map((c) => criaturaVista(c, nowIso)).sort((a, b) => a.bornAt.localeCompare(b.bornAt)),
    cronica: (cronica?.eventos ?? []).slice(-LIMITES.cronicaVista).reverse(),
    atrasado,
  };
}

/** Nace la fundadora (solo si no hay vivas). Devuelve su vista. */
export async function fundar(uid: string): Promise<CriaturaView> {
  const store = getStore();
  const now = new Date();
  const nowIso = now.toISOString();
  const dayKey = C.limaDayKey(now);
  let mundo = await store.getMundo();
  if (!mundo) {
    mundo = mundoNuevo(cfg().colonia, nowIso, dayKey);
    const creado = await store.crearMundo(mundo);
    if (!creado) mundo = (await store.getMundo()) ?? mundo;
  }
  if (mundo.latido.lock && Date.parse(mundo.latido.lock.until) > now.getTime()) {
    throw new MascotitaError("La colonia está latiendo ahora mismo; espera un momento.", 409, mundo.latido.lock.until);
  }
  const vivas = await store.listarVivas(2);
  if (vivas.length > 0) throw new MascotitaError("Ya hay criaturas vivas; solo se funda sobre la extinción.", 409);

  const semilla = `${mundo.poblacion.nacidas + 1}:${nowIso}`;
  const cid = C.cidPara(null, 0, semilla);
  const lugar = lugarAlAzar(seededRng(cid, "lugar"));
  const c = C.nuevaCriatura({ cid, genes: C.genesFundadora(cid), gen: 0, padre: null, env: lugar.env, zona: lugar.zona, now: nowIso });
  const red = cerebroNuevo(cid);
  await store.guardarCriatura(c);
  await store.guardarCerebro(cerebroDoc(cid, red, 0, 0, nowIso));

  rotarDia(mundo, dayKey);
  mundo.poblacion.vivas = 1;
  mundo.poblacion.nacidas += 1;
  mundo.fotos[cid] = fotoDe(c);
  mundo.updatedAt = nowIso;
  const cronica = (await store.getCronica(dayKey)) ?? cronicaVacia(dayKey);
  const env = getEnvironment(lugar.env);
  agregarEventos(cronica, [
    evento(nowIso, "genesis", cid, `${c.nombre} nació en ${nombreZona(lugar.env, lugar.zona)} (${env?.name ?? lugar.env}). Fundó la colonia.`, {
      dios: uid,
      env: lugar.env,
      zona: lugar.zona,
    }),
  ]);
  await store.guardarCronica(cronica);
  await store.guardarMundo(mundo);
  return criaturaVista(c, nowIso);
}

export async function borrarTodo(): Promise<void> {
  const store = getStore();
  const mundo = await store.getMundo();
  if (mundo?.latido.lock && Date.parse(mundo.latido.lock.until) > Date.now()) {
    throw new MascotitaError("La colonia está latiendo ahora mismo; espera a que termine.", 409, mundo.latido.lock.until);
  }
  await store.borrarColonia();
}
