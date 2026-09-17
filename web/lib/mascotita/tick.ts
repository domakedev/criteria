// Un TICK es un pedazo de vida de una criatura: despierta, mira qué puede
// hacer donde está, su red puntúa cada candidata y elige, actúa K veces
// (ensayo y error de verdad: 404s, imports que no resuelven, hongos que caen
// mal), y al final aprende: un paso de gradiente por experiencia, creencias
// actualizadas, ánimo, energía, rasgos y xp. De noche, además, sueña.
//
// Garantías:
//   · Sin IA externa: la red de la criatura decide y aprende; nada más.
//   · Idempotente: el tick N usa RNG sembrado con (cid, N); un reintento
//     reproduce las mismas decisiones.
//   · No toca la base: recibe la criatura y su red, y devuelve lo que cambió.
//     El latido (latido.ts) carga y guarda.
import { CAL, LIMITES, RED } from "./config";
import { clamp, clamp01, round3, seededRng } from "./rng";
import * as C from "./cognition";
import { Anillo, elegir, entrenar, pExito, retornos, sonar, sorpresaDe, type Experiencia } from "./cerebro";
import type { Red } from "./nn";
import { vectorEntrada, type ContextoSenales, type Oido } from "./senales";
import { actualizarCreencia, claveCreencia, podarCreencias } from "./creencias";
import { evento, signo } from "./cronica";
import { makeDeadline, type Deadline } from "./plazo";
import {
  DEFAULT_ENV,
  ENVIRONMENTS,
  REST_ACTION,
  getEnvironment,
  moveAction,
  newEnvState,
  nombreZona,
  restOutcome,
  type Action,
  type EnvContext,
  type Environment,
  type Outcome,
} from "./envs";
import type { CandidataRegistro, CriaturaDoc, Evento, PasoRegistro, UltimoTick } from "./types";

const ORDER_ACTIONS = new Set(["releer", "seguir"]);
const MAX_MUDANZAS = 3;

export interface TickOpts {
  now: Date;
  /** plazo del tick (dentro del plazo del latido) */
  deadline?: Deadline;
  /** presupuesto de fetches compartido por el latido */
  fetchBudget: { remaining: number };
  /** lo que oyó en su zona desde el último tick (fase 4) */
  oido?: Oido | null;
  /** otras criaturas en su zona (fase 3) */
  otras?: number;
  /** comida a la vista (fase 3) */
  comida?: number;
  /** ¿este latido incluye el sueño? */
  esHoraDeSonar?: boolean;
}

export interface TickOut {
  seq: number;
  eventos: Evento[];
  /** pérdida media de los pasos de gradiente */
  perdida: number;
  pasosGradiente: number;
  ms: number;
  error: string | null;
}

interface PasoInterno {
  a: Action;
  out: Outcome;
  novedad: number;
  x: Float32Array;
  q: number;
  pExito: number;
  sorpresa: number;
  rTotal: number;
  candidatas: CandidataRegistro[];
  ms: number;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/**
 * Corre un tick sobre `c` (se muta en sitio) con su red `red` (se muta en
 * sitio). Devuelve los eventos para la crónica. Nunca lanza: un error a mitad
 * deja lo vivido hasta ahí y lo anota.
 */
export async function runTick(c: CriaturaDoc, red: Red, opts: TickOpts): Promise<TickOut> {
  const t0 = Date.now();
  const now = opts.now;
  const nowIso = now.toISOString();
  const deadline = opts.deadline ?? makeDeadline(LIMITES.tickMs, t0);
  const seq = c.seq + 1;
  c.seq = seq;
  const rng = seededRng(c.cid, seq);
  const dayKey = C.limaDayKey(now);
  const eventos: Evento[] = [];
  const pasos: PasoInterno[] = [];
  let error: string | null = null;
  let envId = c.env;
  let env: Environment = getEnvironment(envId) ?? ENVIRONMENTS[DEFAULT_ENV];
  let zona = c.zona;
  let perdida = 0;
  let pasosGradiente = 0;
  let normaMedia = 0;
  let activacion: number[] = [];
  const temperatura = C.temperaturaDe(c);

  const nombre = c.nombre;
  const ev = (tipo: Evento["tipo"], texto: string, datos: Record<string, string | number | boolean> = {}) =>
    eventos.push(evento(nowIso, tipo, c.cid, texto, { env: envId, zona, ...datos }));

  try {
    // --- 1. paso del tiempo y entorno ---
    const hours = c.lastTickAt ? clamp((now.getTime() - Date.parse(c.lastTickAt)) / 3_600_000, 0, 24 * 30) : 0;
    C.applyTime(c, hours);
    if (!getEnvironment(envId)) {
      envId = DEFAULT_ENV;
      env = ENVIRONMENTS[DEFAULT_ENV];
      c.env = envId;
    }
    let envState = c.cursores[envId] ?? newEnvState(env, nowIso);
    // Si nació "en" una zona de un mundo imaginado, el cursor arranca ahí.
    if (envState.visits === 0 && envState.cursor.kind === "imaginado" && env.zonas().some((z) => z.id === c.zona)) {
      envState.cursor.zone = c.zona;
    }
    envState.visits += 1;
    envState.updatedAt = nowIso;
    if (envState.cursor.kind === "imaginado") envState.cursor.clock += 1;
    c.cursores[envId] = envState;
    zona = env.zonaDe(envState);
    c.zona = zona;

    const ctx: EnvContext = {
      criatura: c,
      envState,
      rng,
      fetchBudget: opts.fetchBudget,
      deadline,
      now: nowIso,
      competence: (t) => C.competence(c, t),
    };
    const senales: ContextoSenales = {
      criatura: c,
      env: envId,
      zona,
      esDia: C.esDeDia(now),
      comida: opts.comida ?? 0,
      otras: opts.otras ?? 0,
      oido: opts.oido ?? null,
    };

    // --- 2. episodio: K pasos, la red elige ---
    const K = C.stepsFor(c.etapa);
    const failedKeys = new Set<string>();
    const retryResults: number[] = [];
    let successesAfterFail = 0;
    let hadFail = false;

    for (let i = 0; i < K; i++) {
      if (deadline.remaining() < 1_500) break;
      const ts = Date.now();
      let cands: Action[] = [];
      try {
        cands = (await env.affordances(ctx)).slice(0, 8);
      } catch {
        cands = [];
      }
      cands.push(REST_ACTION);
      // Mudarse a otro entorno también es una decisión de la red, pero solo al
      // empezar el tick (entre episodios, no a mitad de uno) y cuesta.
      if (i === 0) {
        let mudanzas = 0;
        for (const other of Object.values(ENVIRONMENTS)) {
          if (other.id === envId || mudanzas >= MAX_MUDANZAS) continue;
          cands.push(moveAction(other.id, other.name));
          mudanzas += 1;
        }
      }
      const novedad = cands.map((a) => {
        if (a.type === REST_ACTION.type) return 0;
        if (a.type === "mudarse") return 1 - Math.min(1, (c.cursores[a.target]?.visits ?? 0) / 10);
        return clamp01(env.noveltyOf(a, ctx));
      });
      const xs = cands.map((a, k) => vectorEntrada(senales, a, novedad[k], c.creencias[claveCreencia(a.target, a.type)]));
      const el = elegir(red, xs, temperatura, rng);
      const idx = Math.max(0, Math.min(cands.length - 1, el.index));
      const a = cands[idx];
      const salida = el.salidas[idx];
      activacion = Array.from(salida.h2, (v) => round3(v));

      let out: Outcome;
      if (a.type === REST_ACTION.type) {
        out = restOutcome(c);
      } else if (a.type === "mudarse") {
        const dest = getEnvironment(a.target);
        if (dest) {
          const prev = env.name;
          envId = dest.id;
          env = dest;
          c.env = envId;
          envState = c.cursores[envId] ?? newEnvState(env, nowIso);
          envState.visits += 1;
          envState.updatedAt = nowIso;
          c.cursores[envId] = envState;
          ctx.envState = envState;
          zona = env.zonaDe(envState);
          c.zona = zona;
          senales.env = envId;
          senales.zona = zona;
          c.stats.mudanzas += 1;
          // El viaje cansa y no da nada por sí mismo: lo que valga lo dirá el destino.
          out = { success: true, reward: CAL.mudanzaRecompensa, tags: ["mudanza"] };
          ev("mudanza", `${nombre} se mudó de ${prev} a ${env.name}.`, { desde: prev });
        } else {
          out = { success: false, reward: -0.1, tags: ["invalido"] };
        }
      } else {
        try {
          out = await env.act(a, ctx);
        } catch {
          out = { success: false, reward: -0.3, tags: ["error"] };
        }
      }
      out.reward = clamp(out.reward, -1, 1);

      // efectos en el cuerpo
      C.applyStepEnergy(c, a, out.success, novedad[idx]);
      C.applyEffects(c, out.effects);
      C.updateSkill(c, a.type, out.success);
      const grave = C.applyDano(c, out.reward);

      // sorpresa = error del modelo del mundo → curiosidad
      const sorpresa = sorpresaDe(salida, out.success, out.reward);
      const intrinseca = round3(RED.curiosidadPeso * sorpresa * (0.5 + c.rasgos.curiosidad));
      const rTotal = round3(clamp(out.reward + intrinseca, -1, 1));
      C.applyStepMood(c, rTotal, novedad[idx]);

      // creencia sobre (objetivo, verbo): lo que el mundo le hizo, sin la curiosidad
      if (a.type !== REST_ACTION.type) actualizarCreencia(c.creencias, claveCreencia(a.target, a.type), out.reward, nowIso);

      const key = `${a.type}|${a.target}`;
      if (failedKeys.has(key)) retryResults.push(out.success ? 1 : -1);
      if (!out.success) {
        failedKeys.add(key);
        hadFail = true;
      } else if (hadFail) {
        successesAfterFail += 1;
      }
      // zona pudo cambiar (explorar en un mundo imaginado)
      zona = env.zonaDe(envState);
      c.zona = zona;
      senales.zona = zona;

      if (grave || out.reward <= -0.5) {
        ev("golpe", `${nombre}: ${a.label} (${signo(out.reward)}). ${out.observation?.text.slice(0, 90) ?? ""}`, {
          accion: a.type,
          objetivo: a.target,
          r: out.reward,
          grave,
        });
      } else if (out.reward >= 0.4) {
        ev("logro", `${nombre}: ${a.label} (${signo(out.reward)}).`, { accion: a.type, objetivo: a.target, r: out.reward });
      }

      pasos.push({
        a,
        out,
        novedad: novedad[idx],
        x: xs[idx],
        q: round3(salida.q),
        pExito: round3(pExito(salida)),
        sorpresa,
        rTotal,
        candidatas: cands.map((k, j) => ({ accion: k.type, objetivo: k.target, label: k.label, q: round3(el.qs[j]) })),
        ms: Date.now() - ts,
      });
      c.stats.pasos += 1;
    }

    // --- 3. aprender: retornos descontados y un paso de gradiente por experiencia ---
    const gs = retornos(pasos.map((p) => p.rTotal));
    const exps: Experiencia[] = pasos.map((p, i) => ({ x: p.x, g: gs[i], exito: p.out.success, r: p.rTotal }));
    const anillo = new Anillo(c.memorias);
    if (exps.length > 0) {
      const r = entrenar(red, exps, c.genes.lr);
      perdida = r.perdidaMedia;
      normaMedia = r.normaMedia;
      pasosGradiente += r.pasos;
      for (const e of exps) anillo.recordar(e);
      c.stats.perdidaMedia = C.ema(c.stats.perdidaMedia || perdida, perdida);
      c.stats.recompensaMedia = C.ema(c.stats.recompensaMedia, mean(pasos.map((p) => p.rTotal)));
    }
    podarCreencias(c.creencias);

    // --- 4. sueño (replay) una vez por día ---
    if (opts.esHoraDeSonar && c.ultimoSueno !== dayKey && anillo.n > 0) {
      const r = sonar(red, anillo, c.genes.lr, seededRng(c.cid, "sueno", dayKey));
      pasosGradiente += r.pasos;
      c.ultimoSueno = dayKey;
      c.stats.suenos += 1;
      ev("sueno", `${nombre} soñó con ${r.pasos} recuerdos (pérdida ${r.perdidaMedia}).`, { pasos: r.pasos, perdida: r.perdidaMedia });
    }
    c.memorias = anillo.doc();

    // --- 5. rasgos, xp, etapa ---
    const noveltyMean = mean(pasos.map((p) => p.novedad));
    const failFrac = pasos.length ? pasos.filter((p) => !p.out.success).length / pasos.length : 0;
    const ludic = pasos.filter((p) => p.a.ludic);
    const orderSteps = pasos.filter((p) => ORDER_ACTIONS.has(p.a.type) && p.rTotal > 0);
    const retryOutcome: -1 | 0 | 1 =
      retryResults.length === 0 ? 0 : retryResults.every((r) => r > 0) ? 1 : retryResults.every((r) => r < 0) ? -1 : 0;
    C.driftTraits(c, {
      noveltyMean,
      failFrac,
      hadBigFail: pasos.some((p) => p.out.reward <= -0.5),
      retryOutcome,
      compania: (opts.otras ?? 0) > 0,
      ludicMeanReward: ludic.length ? mean(ludic.map((p) => p.rTotal)) : null,
      orderFrac: env.kind === "real" && pasos.length ? orderSteps.length / pasos.length : null,
      ticksToday: Math.max(1, Math.min(LIMITES.latidosDia, c.stats.ticks % LIMITES.latidosDia || 1)),
    });
    const xpGain = pasos.reduce((a, p) => a + Math.abs(p.rTotal), 0) * 0.5 + 0.3;
    const etapaNueva = C.addXp(c, xpGain);
    if (etapaNueva) ev("etapa", `${nombre} ahora es ${etapaNueva}.`, { etapa: etapaNueva });
    C.moodWordFor(c, successesAfterFail >= 2);
  } catch (err) {
    error = err instanceof Error ? `${err.name}: ${err.message}`.slice(0, 200) : "error";
    eventos.push(evento(nowIso, "aviso", c.cid, `${nombre} tuvo un tick con error: ${error}`, { seq }));
  } finally {
    c.stats.ticks += 1;
    c.edadTicks += 1;
    c.ticksDesdeCria += 1;
    c.dano = round3(clamp01(c.dano - CAL.danoSanaPorTick));
    c.hambreTicks = c.drives.energy <= 0 ? c.hambreTicks + 1 : 0;
    c.lastTickAt = nowIso;
    c.updatedAt = nowIso;
    if (c.etapa === "huevo") C.addXp(c, 0.001);
    C.snapshotTraits(c, dayKey, LIMITES.traitHistory);
    const registro: PasoRegistro[] = pasos.map((p, i) => ({
      accion: p.a.type,
      objetivo: p.a.target,
      label: p.a.label,
      r: round3(p.out.reward),
      rTotal: p.rTotal,
      g: i < pasos.length ? retornos(pasos.map((q) => q.rTotal))[i] : 0,
      exito: p.out.success,
      novedad: round3(p.novedad),
      sorpresa: p.sorpresa,
      pExito: p.pExito,
      candidatas: p.candidatas,
      simbolo: null,
      tags: p.out.tags.slice(0, 6),
      ms: p.ms,
    }));
    const ultimo: UltimoTick = {
      seq,
      at: nowIso,
      env: envId,
      zona,
      pasos: registro,
      perdida: round3(perdida),
      gradiente: round3(normaMedia),
      activacion,
      temperatura,
      ms: Date.now() - t0,
    };
    c.ultimoTick = ultimo;
  }

  return { seq, eventos, perdida, pasosGradiente, ms: Date.now() - t0, error };
}

/** Texto corto de dónde está: "el arroyo (El bosque)". */
export function dondeEsta(c: CriaturaDoc): string {
  const env = getEnvironment(c.env);
  return `${nombreZona(c.env, c.zona)} (${env?.name ?? c.env})`;
}
