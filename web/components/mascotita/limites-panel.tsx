"use client";

// Los topes y el presupuesto del día, tal cual están en config.ts.
import type { MundoView } from "@/lib/mascotita/types";
import { num } from "./shared";

export function LimitesPanel({ m }: { m: MundoView }) {
  const l = m.limites;
  const filas: Array<[string, string]> = [
    ["Escrituras hoy", `${num(m.dia.escrituras)} / ${num(l.escriturasDia)} (seguro hasta ${num(Math.round(l.escriturasDia * l.fraccionSegura))})`],
    ["Lecturas hoy", `${num(m.dia.lecturas)} / ${num(l.lecturasDia)}`],
    ["Latidos hoy", `${num(m.dia.latidos)} / ${num(l.latidosDia)} esperados`],
    ["Vivas", `${num(m.poblacion.vivas)} / ${num(l.maxVivas)}`],
    ["Nacidas · muertas", `${num(m.poblacion.nacidas)} · ${num(m.poblacion.muertas)}`],
    ["Ticks por latido", `${l.ticksPorLatido} criaturas · ${l.pasosPorTick} pasos`],
    ["Fetches al repo por latido", `${l.fetchesPorLatido}`],
    ["Crónica", `≤ ${l.cronicaPorDia} eventos/día`],
    ["Red", `${num(l.parametros)} parámetros · ${l.memorias} memorias · ${l.creencias} creencias`],
  ];
  return (
    <dl className="space-y-1 text-xs">
      {filas.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 border-b border-stone-800/70 py-1">
          <dt className="text-stone-400">{k}</dt>
          <dd className="text-right text-stone-200 tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
