// Operaciones de la colonia que no son un latido: el estado para la página,
// fundar (nace la primera criatura), borrar todo.
import { LENGUAJE, LIMITES, cfg } from "./config";
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
import { anotarLinaje, claveZona, linajeVacio } from "./sociedad";
import { lexicoVacio, lexicoVista, registrarEmision, silaba } from "./lexico";
import type { CriaturaView, LexicoView, LinajeDoc, MundoView, Senal } from "./types";

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
  const linaje = (await store.getLinaje()) ?? linajeVacio(nowIso);
  anotarLinaje(linaje, c, nowIso);
  await store.guardarLinaje(linaje);
  await store.guardarMundo(mundo);
  // La mascota de la versión 1 (si la hubo) se va: todo empieza de cero.
  await store.borrarMascotaVieja(uid).catch(() => {});
  return criaturaVista(c, nowIso);
}

export async function getLinaje(): Promise<LinajeDoc> {
  return (await getStore().getLinaje()) ?? linajeVacio(new Date().toISOString());
}

/** Una criatura (viva o muerta) con todo lo que se muestra en la "mente". */
export async function getCriatura(cid: string): Promise<CriaturaView> {
  const c = await getStore().getCriatura(cid);
  if (!c) throw new MascotitaError("Esa criatura no existe.", 404);
  return criaturaVista(c, new Date().toISOString());
}

export async function borrarTodo(): Promise<void> {
  const store = getStore();
  const mundo = await store.getMundo();
  if (mundo?.latido.lock && Date.parse(mundo.latido.lock.until) > Date.now()) {
    throw new MascotitaError("La colonia está latiendo ahora mismo; espera a que termine.", 409, mundo.latido.lock.until);
  }
  await store.borrarColonia();
}

export async function getLexico(): Promise<LexicoView> {
  const l = (await getStore().getLexico()) ?? lexicoVacio(new Date().toISOString());
  return lexicoVista(l);
}

/**
 * El dios habla: deja 1-3 símbolos en una zona. Las criaturas los procesan en
 * su siguiente tick como cualquier otra señal (con el bit "dios" encendido).
 * Queda en la crónica y en el léxico como emisión tuya.
 */
export async function decir(uid: string, envId: string, zona: string, simbolos: number[]): Promise<{ ok: true; zona: string }> {
  const env = getEnvironment(envId);
  if (!env) throw new MascotitaError("Ese lugar no existe.", 400);
  if (!env.zonas().some((z) => z.id === zona)) throw new MascotitaError("Esa zona no existe.", 400);
  const sims = simbolos.filter((s) => Number.isInteger(s) && s >= 0 && s < LIMITES.simbolos).slice(0, LENGUAJE.maxDios);
  if (sims.length === 0) throw new MascotitaError("Elige al menos un símbolo.", 400);
  const store = getStore();
  const now = new Date();
  const nowIso = now.toISOString();
  const dayKey = C.limaDayKey(now);
  const mundo = await store.getMundo();
  if (!mundo) throw new MascotitaError("Todavía no hay colonia.", 404);
  if (mundo.latido.lock && Date.parse(mundo.latido.lock.until) > now.getTime()) {
    throw new MascotitaError("La colonia está latiendo; habla en unos segundos.", 409, mundo.latido.lock.until);
  }
  const k = claveZona(envId, zona);
  const lista: Senal[] = mundo.senales[k] ?? [];
  for (const sim of sims) lista.push({ de: "dios", sim, seq: mundo.latido.seq, dios: true });
  mundo.senales[k] = lista.slice(-LENGUAJE.senalesPorZona);
  mundo.updatedAt = nowIso;
  const lexico = (await store.getLexico()) ?? lexicoVacio(nowIso);
  const comida = mundo.recursos[k]?.comida ?? 0;
  let otras = 0;
  for (const f of Object.values(mundo.fotos)) if (f.viva && f.env === envId && f.zona === zona) otras += 1;
  sims.forEach((sim, i) => {
    registrarEmision(lexico, sim, { env: envId, zona, objetos: [], comida, energia: 1, golpeReciente: false, otras, comio: false }, i > 0 ? sims[i - 1] : null);
  });
  const cronica = (await store.getCronica(dayKey)) ?? cronicaVacia(dayKey);
  agregarEventos(cronica, [
    evento(nowIso, "dios", null, `El dios dijo ${sims.map((x) => `«${silaba(x)}»`).join(" ")} en ${nombreZona(envId, zona)} (${env.name}), con ${otras} criatura${otras === 1 ? "" : "s"} cerca.`, {
      dios: uid,
      env: envId,
      zona,
      simbolos: sims.join(","),
    }),
  ]);
  await store.guardarLexico(lexico);
  await store.guardarCronica(cronica);
  await store.guardarMundo(mundo);
  return { ok: true, zona: k };
}
