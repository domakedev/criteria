// Tarjeta de una decisión: se usa en "Mis decisiones" y en "Comunidad".
import type { DecisionCase } from "@/lib/types";
import {
  DOUBT_LABEL,
  OUTCOME_LABEL,
  OUTCOME_STYLE,
  WEIGHT_LABEL,
  domainLabel,
} from "@/lib/labels";

export function CaseCard({
  c,
  footer,
  showLayer = false,
}: {
  c: DecisionCase;
  footer?: React.ReactNode;
  /** Muestra la insignia "Compartida" — útil en "Mis decisiones", redundante en Comunidad. */
  showLayer?: boolean;
}) {
  return (
    <article className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-600">
          {domainLabel(c.context.domain)}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 font-medium ${OUTCOME_STYLE[c.outcome.status]}`}
        >
          {OUTCOME_LABEL[c.outcome.status]}
        </span>
        {showLayer && c.layer === "community" ? (
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-800">
            Compartida
          </span>
        ) : null}
        <span className="ml-auto text-stone-400">
          {c.author} · {new Date(c.createdAt).toLocaleDateString("es-PE")}
        </span>
      </div>

      <p className="font-medium">{c.situation}</p>
      <p className="mt-1 text-sm text-stone-700">
        <span className="font-semibold text-emerald-800">Decidió:</span>{" "}
        {c.decision}
      </p>
      <p className="mt-0.5 text-sm text-stone-600">
        <span className="font-semibold">Porque:</span> {c.reason}
      </p>
      {c.expectation ? (
        <p className="mt-0.5 text-sm text-stone-600">
          <span className="font-semibold">Esperaba:</span> {c.expectation}
        </p>
      ) : null}
      {c.outcome.note ? (
        <p className="mt-0.5 text-sm text-stone-600">
          <span className="font-semibold">Al final:</span> {c.outcome.note}
        </p>
      ) : null}

      {c.lenses.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {c.lenses.map((l) => (
            <li
              key={l.name}
              className="rounded-lg bg-stone-100 px-2 py-1 text-xs text-stone-700"
              title={l.reading}
            >
              <span className="font-medium">{l.name.replace(/-/g, " ")}</span>
              <span className="text-stone-400"> · {WEIGHT_LABEL[l.weight].toLowerCase()}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-2 text-xs text-stone-400">
        Decidió {DOUBT_LABEL[c.doubt].toLowerCase()}.
      </p>

      {footer}
    </article>
  );
}
