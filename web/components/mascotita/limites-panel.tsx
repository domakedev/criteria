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
    ["Proyección de mañana", `${num(m.presupuesto.proyeccionManana)} escrituras (con una más: ${num(m.presupuesto.proyeccionConUnaMas)})`],
    ["¿Cabe otra cría?", m.presupuesto.cabeOtra ? "sí" : `no: ${m.presupuesto.motivo ?? ""}`],
    ["Modo ahorro", m.presupuesto.ahorro ? "activo (tickea la mitad)" : "no"],
    ["Nacidas · muertas · gen máx", `${num(m.poblacion.nacidas)} · ${num(m.poblacion.muertas)} · ${m.poblacion.generacionMax}`],
    ["Ticks por latido", `${l.ticksPorLatido} criaturas · ${l.pasosPorTick} pasos`],
    ["Fetches al repo por latido", `${l.fetchesPorLatido}`],
    ["Crónica", `≤ ${l.cronicaPorDia} eventos/día`],
    ["Red", `${num(l.parametros)} parámetros · ${l.memorias} memorias · ${l.creencias} creencias · ${l.simbolos} símbolos`],
  ];
  return (
    <dl className="space-y-1 text-[11px] text-[#1b1b24]">
      {filas.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 border-b border-dashed border-[#cfc8b4] py-1">
          <dt className="text-[#5a5a6a]">{k}</dt>
          <dd className="text-right tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
