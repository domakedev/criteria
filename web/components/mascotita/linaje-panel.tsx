"use client";

// El árbol genealógico: generaciones en filas, las vivas encendidas, la causa
// de muerte al tocar. Un SVG que se arma solo a partir de las entradas.
import { useEffect, useMemo, useState } from "react";
import type { LinajeDoc, LinajeEntrada } from "@/lib/mascotita/types";
import { errorMessage, petApi } from "./shared";

const CAUSA: Record<string, string> = { vejez: "vejez", hambre: "hambre", fallos: "golpes", dios: "el dios" };

export function LinajePanel({ refreshKey, onElegir, seleccion }: { refreshKey: number; onElegir: (cid: string) => void; seleccion: string | null }) {
  const [doc, setDoc] = useState<LinajeDoc | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let vivo = true;
    petApi<LinajeDoc>("/api/mascotita/linaje")
      .then((d) => vivo && setDoc(d))
      .catch((e) => vivo && setErr(errorMessage(e)));
    return () => {
      vivo = false;
    };
  }, [refreshKey]);

  const layout = useMemo(() => {
    if (!doc) return null;
    const entradas = doc.entradas.slice().sort((a, b) => a.nacio.localeCompare(b.nacio));
    const porGen = new Map<number, LinajeEntrada[]>();
    for (const e of entradas) (porGen.get(e.gen) ?? porGen.set(e.gen, []).get(e.gen)!).push(e);
    const gens = Array.from(porGen.keys()).sort((a, b) => a - b);
    const ancho = Math.max(1, ...gens.map((g) => porGen.get(g)!.length));
    const cx = 34;
    const cy = 46;
    const W = Math.max(320, ancho * cx + 20);
    const pos = new Map<string, { x: number; y: number }>();
    for (const g of gens) {
      const fila = porGen.get(g)!;
      const total = fila.length * cx;
      fila.forEach((e, i) => pos.set(e.cid, { x: (W - total) / 2 + i * cx + cx / 2, y: 22 + g * cy }));
    }
    return { entradas, pos, W, H: 30 + gens.length * cy };
  }, [doc]);

  if (err) return <p className="text-xs text-[#d64f4f]">{err}</p>;
  if (!doc || !layout) return <p className="text-xs text-[#5a5a6a]">Cargando…</p>;
  if (layout.entradas.length === 0) return <p className="text-xs text-[#5a5a6a]">Todavía no nació nadie.</p>;

  return (
    <div className="overflow-x-auto">
      <svg width={layout.W} height={layout.H} className="mx-auto block" role="img" aria-label="Árbol genealógico">
        {layout.entradas.map((e) => {
          const p = layout.pos.get(e.cid)!;
          const m = e.padre ? layout.pos.get(e.padre) : null;
          return m ? <line key={`l-${e.cid}`} x1={m.x} y1={m.y + 9} x2={p.x} y2={p.y - 9} stroke="#8a8a9a" strokeWidth={1.5} /> : null;
        })}
        {layout.entradas.map((e) => {
          const p = layout.pos.get(e.cid)!;
          const viva = !e.murio;
          const sel = seleccion === e.cid;
          return (
            <g key={e.cid} transform={`translate(${p.x} ${p.y})`} onClick={() => onElegir(e.cid)} className="cursor-pointer">
              <title>
                {e.nombre} · gen {e.gen} · {viva ? "viva" : `murió (${CAUSA[e.causa ?? ""] ?? e.causa})`}
              </title>
              <rect x={-9} y={-9} width={18} height={18} fill={viva ? `hsl(${e.tono} 70% 58%)` : "#7a7a86"} stroke={sel ? "#f5c542" : "#1b1b24"} strokeWidth={sel ? 3 : 1.5} rx={2} />
              {viva ? (
                <>
                  <rect x={-5} y={-3} width={2} height={3} fill="#fff" />
                  <rect x={3} y={-3} width={2} height={3} fill="#fff" />
                </>
              ) : (
                <text y={3} textAnchor="middle" fontSize={9} fill="#fff">
                  ✝
                </text>
              )}
              <text y={17} textAnchor="middle" fontSize={7} fill="#1b1b24">
                {e.nombre}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-[11px] text-[#5a5a6a]">
        Fila = generación. Toca una para ver su mente (las muertas también, sin su cerebro). {doc.entradas.length} en el árbol.
      </p>
    </div>
  );
}
