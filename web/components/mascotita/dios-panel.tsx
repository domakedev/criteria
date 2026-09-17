"use client";

// Lo que puede hacer el dios: dejar comida, plantar una fuente y hablar con
// el teclado de símbolos. Todo actúa sobre la zona seleccionada en el mapa
// (o la de la criatura tocada) y queda en la crónica.
import { useState } from "react";
import type { EnvInfo } from "@/lib/mascotita/types";
import { SILABAS, errorMessage, petApi, zonaNombre } from "./shared";

export function DiosPanel({
  envs,
  zona,
  onHecho,
}: {
  envs: EnvInfo[];
  zona: { env: string; zona: string } | null;
  onHecho: (msg: string) => void;
}) {
  const [unidades, setUnidades] = useState(5);
  const [porHora, setPorHora] = useState(0.5);
  const [horas, setHoras] = useState(24);
  const [sims, setSims] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const donde = zona ? `${zonaNombre(envs, zona.env, zona.zona)} (${envs.find((e) => e.id === zona.env)?.name ?? zona.env})` : null;

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    try {
      onHecho(await fn());
    } catch (e) {
      onHecho(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 text-[#1b1b24]">
      <p className="text-[11px]">
        {donde ? (
          <>
            Zona elegida: <b>{donde}</b>
          </>
        ) : (
          "Toca una zona (o una criatura) en el mapa para elegir dónde intervenir."
        )}
      </p>

      <div className="rounded border-2 border-[#1b1b24] bg-white p-2">
        <h4 className="text-[11px] font-bold uppercase tracking-wide">Comida</h4>
        <div className="mt-1 flex items-center gap-2">
          <input type="number" min={1} max={20} value={unidades} onChange={(e) => setUnidades(Number(e.target.value))} className="campo w-16" />
          <span className="text-[11px]">unidades (una = +0.35 de energía)</span>
          <button
            className="boton ml-auto"
            disabled={!zona || busy}
            onClick={() =>
              zona &&
              run(async () => {
                const r = await petApi<{ comida: number }>("/api/mascotita/dios", { method: "POST", body: { accion: "comida", ...zona, unidades } });
                return `Dejaste ${unidades} de comida; ahora hay ${r.comida}.`;
              })
            }
          >
            Dejar
          </button>
        </div>
      </div>

      <div className="rounded border-2 border-[#1b1b24] bg-white p-2">
        <h4 className="text-[11px] font-bold uppercase tracking-wide">Fuente</h4>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
          <input type="number" min={0.1} max={2} step={0.1} value={porHora} onChange={(e) => setPorHora(Number(e.target.value))} className="campo w-16" />
          <span>por hora, durante</span>
          <input type="number" min={1} max={168} value={horas} onChange={(e) => setHoras(Number(e.target.value))} className="campo w-16" />
          <span>h</span>
          <button
            className="boton boton-2 ml-auto"
            disabled={!zona || busy}
            onClick={() =>
              zona &&
              run(async () => {
                const r = await petApi<{ hasta: string }>("/api/mascotita/dios", { method: "POST", body: { accion: "fuente", ...zona, porHora, horas } });
                return `Fuente plantada hasta ${new Date(r.hasta).toLocaleString("es-PE")}.`;
              })
            }
          >
            Plantar
          </button>
        </div>
      </div>

      <div className="rounded border-2 border-[#1b1b24] bg-white p-2">
        <h4 className="text-[11px] font-bold uppercase tracking-wide">Hablar</h4>
        <p className="mt-1 text-[11px] text-[#5a5a6a]">
          Elige hasta 3 sílabas. Las criaturas de esa zona las oirán en su siguiente tick, como cualquier otra señal. Lo que pase después queda en el
          léxico: así aprendes tú.
        </p>
        <div className="mt-2 grid grid-cols-8 gap-1">
          {SILABAS.map((s, i) => (
            <button key={s} className="tecla" disabled={sims.length >= 3} onClick={() => setSims((v) => [...v, i])}>
              {s}
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="min-h-[1.5rem] flex-1 text-sm font-bold">{sims.map((i) => SILABAS[i]).join(" · ") || "—"}</span>
          <button className="boton boton-3" onClick={() => setSims([])} disabled={sims.length === 0}>
            Borrar
          </button>
          <button
            className="boton"
            disabled={!zona || sims.length === 0 || busy}
            onClick={() =>
              zona &&
              run(async () => {
                await petApi("/api/mascotita/decir", { method: "POST", body: { ...zona, simbolos: sims } });
                const dicho = sims.map((i) => SILABAS[i]).join(" ");
                setSims([]);
                return `Dijiste «${dicho}» en ${donde}.`;
              })
            }
          >
            Decir
          </button>
        </div>
      </div>
    </div>
  );
}
