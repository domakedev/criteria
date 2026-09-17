"use client";

// La crónica del día: hechos de la colonia, los últimos primero, con filtro.
import { useState } from "react";
import type { Evento, EventoTipo } from "@/lib/mascotita/types";
import { timeEs } from "./shared";

const ICONO: Record<EventoTipo, string> = {
  genesis: "✦",
  nacimiento: "●",
  muerte: "✝",
  golpe: "✗",
  logro: "✓",
  mudanza: "→",
  etapa: "↑",
  sueno: "☾",
  senal: "♪",
  comida: "◆",
  dios: "☼",
  latido: "·",
  aviso: "!",
};

const TONO: Partial<Record<EventoTipo, string>> = {
  golpe: "#d64f4f",
  logro: "#2c8a5a",
  muerte: "#5a5a6a",
  genesis: "#b8860b",
  nacimiento: "#b8860b",
  aviso: "#c2410c",
  sueno: "#6d4fc2",
  senal: "#2f6fd6",
  dios: "#b8860b",
};

const FILTROS: Array<[string, EventoTipo[] | null]> = [
  ["todo", null],
  ["vida", ["genesis", "nacimiento", "muerte", "etapa"]],
  ["señales", ["senal", "dios"]],
  ["golpes", ["golpe", "aviso"]],
  ["comida", ["comida", "dios"]],
];

export function CronicaPanel({ eventos, cid }: { eventos: Evento[]; cid?: string | null }) {
  const [filtro, setFiltro] = useState(0);
  const tipos = FILTROS[filtro][1];
  const lista = eventos.filter((e) => (!tipos || tipos.includes(e.tipo)) && (!cid || e.cid === cid));
  return (
    <div className="text-[#1b1b24]">
      <div className="mb-2 flex flex-wrap gap-1">
        {FILTROS.map(([nombre], i) => (
          <button key={nombre} className="chip cursor-pointer" style={filtro === i ? { background: "#1b1b24", color: "#f6f1dc" } : undefined} onClick={() => setFiltro(i)}>
            {nombre}
          </button>
        ))}
        {cid ? <span className="chip">solo la elegida</span> : null}
      </div>
      {lista.length === 0 ? (
        <p className="text-xs text-[#5a5a6a]">Nada por aquí todavía.</p>
      ) : (
        <ol className="cronica">
          {lista.map((e, i) => (
            <li key={`${e.at}-${i}`}>
              <span className="shrink-0 text-[#5a5a6a] tabular-nums">{timeEs(e.at)}</span>
              <span className="shrink-0" style={{ color: TONO[e.tipo] ?? "#5a5a6a" }}>
                {ICONO[e.tipo] ?? "·"}
              </span>
              <span className="min-w-0" style={{ color: TONO[e.tipo] ?? "#1b1b24" }}>
                {e.texto}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
