"use client";

// La crónica del día: hechos de la colonia, los últimos primero.
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
  golpe: "text-red-300",
  logro: "text-emerald-300",
  muerte: "text-stone-400",
  genesis: "text-amber-200",
  nacimiento: "text-amber-200",
  aviso: "text-orange-300",
  sueno: "text-violet-300",
};

export function CronicaPanel({ eventos }: { eventos: Evento[] }) {
  if (eventos.length === 0) return <p className="text-sm text-stone-400">Hoy no ha pasado nada todavía.</p>;
  return (
    <ol className="max-h-[28rem] space-y-1 overflow-y-auto pr-1 font-mono text-[11px] leading-relaxed">
      {eventos.map((e, i) => (
        <li key={`${e.at}-${i}`} className="flex gap-2">
          <span className="shrink-0 text-stone-600 tabular-nums">{timeEs(e.at)}</span>
          <span className={`shrink-0 ${TONO[e.tipo] ?? "text-stone-500"}`}>{ICONO[e.tipo] ?? "·"}</span>
          <span className={`min-w-0 ${TONO[e.tipo] ?? "text-stone-300"}`}>{e.texto}</span>
        </li>
      ))}
    </ol>
  );
}
