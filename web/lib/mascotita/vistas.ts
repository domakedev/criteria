// Vistas: lo que viaja al cliente, calculado desde los documentos. Sin
// memorias ni cursores (pesan y no se miran); las creencias, las más firmes.
import { LIMITES, RED } from "./config";
import { N_PARAMETROS } from "./cerebro";
import * as C from "./cognition";
import { creenciasVista } from "./creencias";
import type { CriaturaDoc, CriaturaView, FotoCriatura, LimitesView } from "./types";

const DAY_MS = 86_400_000;

export function fotoDe(c: CriaturaDoc): FotoCriatura {
  return {
    nombre: c.nombre,
    gen: c.gen,
    padre: c.padre,
    env: c.env,
    zona: c.zona,
    energia: c.drives.energy,
    edad: c.edadTicks,
    etapa: c.etapa,
    mood: c.mood.word,
    viva: c.viva,
    tono: C.tonoDe(c.genes),
    ultimoSimbolo: null,
    simboloAt: null,
  };
}

export function criaturaVista(c: CriaturaDoc, now: string): CriaturaView {
  const todayKey = C.limaDayKey(new Date(now));
  return {
    cid: c.cid,
    nombre: c.nombre,
    gen: c.gen,
    padre: c.padre,
    viva: c.viva,
    causaMuerte: c.causaMuerte,
    bornAt: c.bornAt,
    diedAt: c.diedAt,
    etapa: c.etapa,
    xp: c.xp,
    xpNext: C.xpForNext(c.etapa),
    edadTicks: c.edadTicks,
    edadDias: Math.max(0, Math.floor((Date.parse(now) - Date.parse(c.bornAt)) / DAY_MS)),
    genes: c.genes,
    rasgos: c.rasgos,
    traitDelta7d: C.traitDelta7d(c, todayKey),
    mood: c.mood,
    drives: c.drives,
    dano: c.dano,
    env: c.env,
    zona: c.zona,
    tono: C.tonoDe(c.genes),
    skills: Object.entries(c.skills)
      .map(([action, s]) => ({ action, competence: Math.round(C.competence(c, action) * 100) / 100, ok: s.ok, fail: s.fail }))
      .sort((a, b) => b.ok + b.fail - (a.ok + a.fail))
      .slice(0, 12),
    creencias: creenciasVista(c.creencias, 15),
    stats: c.stats,
    ultimoTick: c.ultimoTick,
    lastTickAt: c.lastTickAt,
    memorias: c.memorias.n,
    parametros: N_PARAMETROS,
  };
}

export function limitesVista(maxVivas: number): LimitesView {
  return {
    maxVivas,
    ticksPorLatido: LIMITES.ticksPorLatido,
    pasosPorTick: LIMITES.pasosPorTick,
    fetchesPorLatido: LIMITES.fetchesPorLatido,
    escriturasDia: LIMITES.escriturasDia,
    lecturasDia: LIMITES.lecturasDia,
    fraccionSegura: LIMITES.fraccionSegura,
    latidosDia: LIMITES.latidosDia,
    cronicaPorDia: LIMITES.cronicaPorDia,
    creencias: LIMITES.creencias,
    memorias: LIMITES.memorias,
    simbolos: RED.salidaSimbolos - 1,
    parametros: N_PARAMETROS,
  };
}
