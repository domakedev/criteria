"use client";

// El narrador: Gemini te cuenta qué pasó a partir de hechos y números. Solo
// para ti; ninguna criatura lo lee. Con tope diario.
import { useEffect, useState } from "react";
import type { NarracionDoc } from "@/lib/mascotita/types";
import { ago, errorMessage, petApi } from "./shared";

interface Lista {
  items: NarracionDoc[];
  hoy: number;
  porDia: number;
  disponible: boolean;
}

export function NarradorPanel() {
  const [lista, setLista] = useState<Lista | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const cargar = () =>
    petApi<Lista>("/api/mascotita/narrar")
      .then(setLista)
      .catch((e) => setErr(errorMessage(e)));
  useEffect(() => {
    void cargar();
  }, []);

  const pedir = async () => {
    setBusy(true);
    setErr("");
    try {
      await petApi("/api/mascotita/narrar", { method: "POST", body: {} });
      await cargar();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 text-[#1b1b24]">
      <p className="text-[11px] text-[#5a5a6a]">
        Gemini lee la crónica, el léxico y las fichas y te lo cuenta en español. Es de una sola vía: no decide nada, no interpreta símbolos por su
        cuenta y ninguna criatura lo oye.
      </p>
      <div className="flex items-center gap-2">
        <button className="boton" onClick={pedir} disabled={busy || !lista?.disponible || (lista ? lista.hoy >= lista.porDia : false)}>
          {busy ? "Escribiendo…" : "Cuéntame qué pasó"}
        </button>
        <span className="text-[11px] text-[#5a5a6a]">
          {lista ? (lista.disponible ? `${lista.hoy} / ${lista.porDia} hoy` : "sin GEMINI_API_KEY") : ""}
        </span>
      </div>
      {err ? <p className="text-xs text-[#d64f4f]">{err}</p> : null}
      <ul className="space-y-2">
        {(lista?.items ?? []).map((n) => (
          <li key={n.at} className="rounded border-2 border-[#1b1b24] bg-white p-2 text-[12px] leading-relaxed">
            <p className="mb-1 text-[10px] uppercase tracking-wide text-[#5a5a6a]">
              {ago(n.at)} · {n.modelo}
            </p>
            {n.texto.split(/\n+/).map((par, i) => (
              <p key={i} className="mb-1.5">
                {par}
              </p>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
