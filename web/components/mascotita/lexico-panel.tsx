"use client";

// El léxico: las glosas honestas del intérprete estadístico y el medidor de
// bits. "Contexto" = cuándo se dice; "consecuencia" = si cambia lo que hace
// quien oye. Solo lo segundo es significado.
import { useEffect, useState } from "react";
import type { LexicoView } from "@/lib/mascotita/types";
import { errorMessage, petApi } from "./shared";

export function LexicoPanel({ refreshKey }: { refreshKey: number }) {
  const [lex, setLex] = useState<LexicoView | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let vivo = true;
    petApi<LexicoView>("/api/mascotita/lexico")
      .then((l) => vivo && setLex(l))
      .catch((e) => vivo && setErr(errorMessage(e)));
    return () => {
      vivo = false;
    };
  }, [refreshKey]);
  if (err) return <p className="text-xs text-[#d64f4f]">{err}</p>;
  if (!lex) return <p className="text-xs text-[#5a5a6a]">Cargando…</p>;
  return (
    <div className="space-y-3 text-[#1b1b24]">
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <Medidor titulo="Contexto" bits={lex.bitsContexto} lectura={lex.lecturaContexto} nota="¿se dice en situaciones concretas?" />
        <Medidor titulo="Consecuencia" bits={lex.bitsConsecuencia} lectura={lex.lecturaConsecuencia} nota="¿cambia lo que hace quien oye?" />
      </div>
      <p className="text-[11px] text-[#5a5a6a]">
        {lex.emisiones.toLocaleString("es-PE")} emisiones en total · {lex.emisionesHoy} hoy · {lex.oidas.toLocaleString("es-PE")} veces oídas. Un
        símbolo significa algo solo si el segundo medidor sale del ruido.
      </p>
      <ul className="space-y-1.5">
        {lex.glosas.map((g) => (
          <li key={g.simbolo} className="text-[11px] leading-snug">
            <span className="chip mr-1 font-bold">{g.silaba}</span>
            <span className="text-[#5a5a6a]">{g.n}× · </span>
            <span>{g.texto.replace(/^«[^»]+» — /, "")}</span>
          </li>
        ))}
      </ul>
      {lex.bigramas.length ? (
        <p className="text-[11px] text-[#5a5a6a]">
          Pares seguidos: {lex.bigramas.map((b) => `${b.bigrama} (${b.n})`).join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

function Medidor({ titulo, bits, lectura, nota }: { titulo: string; bits: number; lectura: string; nota: string }) {
  const w = Math.min(100, Math.round((bits / 1) * 100));
  const color = bits < 0.1 ? "#9aa3b8" : bits < 0.4 ? "#f5c542" : "#3ca370";
  return (
    <div className="rounded border-2 border-[#1b1b24] bg-white p-2">
      <div className="flex items-baseline justify-between">
        <span className="font-bold uppercase tracking-wide">{titulo}</span>
        <span className="tabular-nums">{bits.toFixed(3)} bits</span>
      </div>
      <div className="barra mt-1">
        <div style={{ width: `${w}%`, background: color }} />
      </div>
      <p className="mt-1">
        <b>{lectura}</b> · {nota}
      </p>
    </div>
  );
}
