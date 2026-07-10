"use client";

// Respuesta del motor, en lenguaje llano y con la conclusión primero: la
// decisión mejor respaldada arriba, los avisos después y las experiencias
// completas plegadas. Todo viene de casos reales con procedencia.
import { useState } from "react";
import type { Guidance } from "@/lib/types";
import {
  CONFIDENCE_LABEL,
  OUTCOME_DOT,
  OUTCOME_LABEL,
} from "@/lib/labels";
import { ChevronDownIcon } from "./icons";

export function GuidanceView({ g }: { g: Guidance }) {
  const [showCases, setShowCases] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            g.confidence === "high"
              ? "bg-emerald-100 text-emerald-800"
              : g.confidence === "medium"
                ? "bg-amber-100 text-amber-800"
                : "bg-stone-100 text-stone-500"
          }`}
        >
          {CONFIDENCE_LABEL[g.confidence]}
        </span>
        <p className="w-full text-sm leading-relaxed text-stone-600">{g.message}</p>
      </div>

      {g.suggestion ? (
        <section className="rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-100">
          <h3 className="text-xs font-semibold tracking-wide text-emerald-700 uppercase">
            Lo que mejor funcionó a otros
          </h3>
          <p className="mt-1.5 leading-snug font-medium text-emerald-950">
            {g.suggestion.decision}
          </p>
          <p className="mt-1 text-sm text-emerald-800">
            Porque: {g.suggestion.reason}
          </p>
          <p className="mt-2 text-xs text-emerald-600">
            Basado en {g.suggestion.basedOn.length} experiencia(s) real(es). La
            decisión es tuya.
          </p>
        </section>
      ) : null}

      {g.warnings.length > 0 ? (
        <section className="rounded-xl bg-red-50 p-4 ring-1 ring-red-100">
          <h3 className="text-xs font-semibold tracking-wide text-red-700 uppercase">
            A otros esto les salió mal
          </h3>
          <ul className="mt-1.5 space-y-1.5">
            {g.warnings.map((w) => (
              <li key={w.caseId} className="text-sm text-red-800">
                <span className="font-medium">“{w.decision}”</span> — {w.note}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {g.topLenses.length > 0 ? (
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-stone-500 uppercase">
            Lo que más pesó en casos parecidos
          </h3>
          <ul className="space-y-1.5">
            {g.topLenses.slice(0, 5).map((l) => (
              <li key={l.name} className="flex items-center gap-2 text-sm">
                <span className="w-36 shrink-0 truncate text-stone-600">
                  {l.name.replace(/-/g, " ")}
                </span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100">
                  <span
                    className="block h-full rounded-full bg-emerald-500"
                    style={{ width: `${Math.round(l.score * 100)}%` }}
                  />
                </span>
                <span className="w-8 text-right text-xs text-stone-400">
                  ×{l.appearances}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {g.matchedCases.length > 0 ? (
        <section className="border-t border-stone-100 pt-3">
          <button
            type="button"
            onClick={() => setShowCases((v) => !v)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-500 transition-colors hover:text-emerald-700"
          >
            <ChevronDownIcon
              className={`h-4 w-4 transition-transform ${showCases ? "rotate-180" : ""}`}
            />
            {showCases
              ? "Ocultar experiencias"
              : `Ver las ${g.matchedCases.length} experiencia(s) encontradas`}
          </button>
          {showCases ? (
            <ul className="mt-3 space-y-2">
              {g.matchedCases.map((m) => (
                <li
                  key={m.id}
                  className="rounded-xl border border-stone-200/70 bg-white p-3 text-sm"
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 font-medium text-stone-600">
                      <span className={`h-2 w-2 rounded-full ${OUTCOME_DOT[m.outcome]}`} />
                      {OUTCOME_LABEL[m.outcome]}
                    </span>
                    <span className="text-stone-400">
                      {m.layer === "personal" ? "tuya" : `de ${m.author}`}
                    </span>
                  </div>
                  <p className="text-stone-800">{m.situation}</p>
                  <p className="mt-0.5 text-stone-500">Decidió: {m.decision}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
