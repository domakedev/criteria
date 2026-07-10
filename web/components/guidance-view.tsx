// Respuesta del motor, en lenguaje llano. Todo lo que se muestra viene de
// experiencias reales con procedencia — el motor nunca inventa.
import type { Guidance } from "@/lib/types";
import { CONFIDENCE_LABEL, OUTCOME_LABEL, OUTCOME_STYLE } from "@/lib/labels";

export function GuidanceView({ g }: { g: Guidance }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            g.confidence === "high"
              ? "bg-emerald-100 text-emerald-800"
              : g.confidence === "medium"
                ? "bg-amber-100 text-amber-800"
                : "bg-stone-200 text-stone-600"
          }`}
        >
          {CONFIDENCE_LABEL[g.confidence]}
        </span>
      </div>

      <p className="text-stone-800">{g.message}</p>

      {g.topLenses.length > 0 ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-stone-700">
            Lo que más pesó en casos parecidos
          </h3>
          <ul className="space-y-1.5">
            {g.topLenses.slice(0, 5).map((l) => (
              <li key={l.name} className="flex items-center gap-2 text-sm">
                <span className="w-40 shrink-0 truncate text-stone-700">
                  {l.name.replace(/-/g, " ")}
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
                  <span
                    className="block h-full rounded-full bg-emerald-600"
                    style={{ width: `${Math.round(l.score * 100)}%` }}
                  />
                </span>
                <span className="w-10 text-right text-xs text-stone-400">
                  ×{l.appearances}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {g.suggestion ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <h3 className="text-sm font-semibold text-emerald-900">
            La decisión mejor respaldada
          </h3>
          <p className="mt-1 text-emerald-950">{g.suggestion.decision}</p>
          <p className="mt-1 text-sm text-emerald-800">
            Porque: {g.suggestion.reason}
          </p>
          <p className="mt-2 text-xs text-emerald-700">
            Basado en {g.suggestion.basedOn.length} experiencia(s) real(es). Tú
            decides — esto es lo que le funcionó a otros.
          </p>
        </section>
      ) : null}

      {g.warnings.length > 0 ? (
        <section className="rounded-xl border border-red-200 bg-red-50 p-4">
          <h3 className="text-sm font-semibold text-red-900">
            Cuidado: a otros esto les salió mal
          </h3>
          <ul className="mt-1 space-y-1.5">
            {g.warnings.map((w) => (
              <li key={w.caseId} className="text-sm text-red-800">
                <span className="font-medium">“{w.decision}”</span> — {w.note}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {g.matchedCases.length > 0 ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-stone-700">
            Experiencias parecidas
          </h3>
          <ul className="space-y-2">
            {g.matchedCases.map((m) => (
              <li
                key={m.id}
                className="rounded-lg border border-stone-200 bg-white p-3 text-sm"
              >
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={`rounded-full px-2 py-0.5 font-medium ${OUTCOME_STYLE[m.outcome]}`}
                  >
                    {OUTCOME_LABEL[m.outcome]}
                  </span>
                  <span className="text-stone-400">
                    {m.layer === "personal" ? "tuya" : `de ${m.author}`}
                  </span>
                </div>
                <p className="text-stone-800">{m.situation}</p>
                <p className="mt-0.5 text-stone-600">Decidió: {m.decision}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
