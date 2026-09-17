"use client";

// Lo que sabe: sus creencias con barra de confianza, vistas/fallos, fuentes
// y relaciones. El selector cambia el orden y vuelve a pedir la lista.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ConceptView } from "@/lib/mascotita/types";
import { KIND_EMOJI, ago, errorMessage, pct } from "./shared";

type Order = "score" | "recent" | "fading";

const ORDERS: Array<{ id: Order; label: string }> = [
  { id: "score", label: "Lo más seguro" },
  { id: "recent", label: "Lo más reciente" },
  { id: "fading", label: "Se le olvida" },
];

export function KnowledgePanel({ initial, refreshKey = 0 }: { initial: ConceptView[]; refreshKey?: number }) {
  const [order, setOrder] = useState<Order>("score");
  const [concepts, setConcepts] = useState<ConceptView[]>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    api<{ concepts: ConceptView[] }>(`/api/mascotita/knowledge?order=${order}&limit=100`)
      .then((d) => {
        if (alive) setConcepts(d.concepts);
      })
      .catch((err) => {
        if (alive) setError(errorMessage(err, "No se pudo cargar lo que sabe."));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [order, refreshKey]);

  return (
    <section className="animate-fade space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {ORDERS.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setOrder(o.id)}
            aria-pressed={order === o.id}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              order === o.id
                ? "bg-emerald-100 text-emerald-900"
                : "text-stone-400 hover:bg-stone-100 hover:text-stone-600"
            }`}
          >
            {o.label}
          </button>
        ))}
        {loading ? <span className="ml-auto text-xs text-stone-400">Cargando…</span> : null}
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {!loading && concepts.length === 0 && !error ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center">
          <p className="font-medium text-stone-700">
            {order === "fading" ? "No se le está olvidando nada" : "Todavía no sabe nada"}
          </p>
          <p className="mt-1 text-sm text-stone-500">
            {order === "fading"
              ? "Lo que no vuelve a ver pierde fuerza con los días; aquí aparecería."
              : "Aprende solo de lo que vive al explorar y de lo que le enseñes."}
          </p>
        </div>
      ) : null}

      <ul className={`space-y-2 ${loading ? "opacity-60" : ""}`}>
        {concepts.map((c) => (
          <ConceptCard key={c.id} c={c} />
        ))}
      </ul>
    </section>
  );
}

function ConceptCard({ c }: { c: ConceptView }) {
  const conf = Math.round(Math.min(1, Math.max(0, c.confidence)) * 100);
  const bar = c.verified ? "bg-emerald-500" : c.uncertain ? "bg-amber-400" : "bg-stone-400";
  return (
    <li className="rounded-2xl border border-stone-200/70 bg-white p-3.5 shadow-sm">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 text-base leading-none" aria-hidden>
          {KIND_EMOJI[c.kind]}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold text-stone-900">{c.label}</span>
            <span className="text-[11px] text-stone-400">{c.kind}</span>
            {c.verified ? <Badge tone="bg-emerald-100 text-emerald-800">comprobado</Badge> : null}
            {c.taught ? <Badge tone="bg-violet-100 text-violet-800">enseñado</Badge> : null}
            {c.toTest ? <Badge tone="bg-amber-100 text-amber-800">por probar</Badge> : null}
            {c.uncertain && !c.toTest ? <Badge tone="bg-stone-100 text-stone-600">duda</Badge> : null}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-stone-700">{c.claim}</p>

          <div className="mt-2 flex items-center gap-2 text-[11px] text-stone-500">
            <div
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100"
              role="meter"
              aria-label="confianza"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={conf}
            >
              <div className={`h-full rounded-full ${bar}`} style={{ width: `${conf}%` }} />
            </div>
            <span className="w-24 shrink-0 text-right tabular-nums">
              {pct(c.confidence)}
              {Math.abs(c.lastConfDelta) >= 0.005 ? (
                <span className={c.lastConfDelta > 0 ? "text-emerald-600" : "text-red-600"}>
                  {" "}
                  {c.lastConfDelta > 0 ? "↑" : "↓"}
                </span>
              ) : null}
            </span>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-stone-400">
            <span className="tabular-nums">
              {c.hits} {c.hits === 1 ? "vista" : "vistas"} · {c.misses} {c.misses === 1 ? "fallo" : "fallos"}
            </span>
            {c.sources.map((s) => (
              <span key={s} className="rounded-full bg-stone-100 px-1.5 py-0.5 text-stone-500">
                {s}
              </span>
            ))}
            {c.ref ? <span className="truncate font-mono text-stone-400">{c.ref}</span> : null}
            <span className="ml-auto">{ago(c.lastSeenAt)}</span>
          </div>
          {c.related.length > 0 ? (
            <p className="mt-1 text-[11px] text-stone-400">relacionado con {c.related.join(", ")}</p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${tone}`}>{children}</span>;
}
