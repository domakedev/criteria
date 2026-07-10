"use client";

// Tarjeta de una decisión: muestra lo esencial (situación → decisión → porqué)
// y pliega el resto tras "Ver detalles" para no saturar la lista.
import { useState } from "react";
import type { DecisionCase } from "@/lib/types";
import {
  DOUBT_LABEL,
  OUTCOME_DOT,
  OUTCOME_LABEL,
  WEIGHT_LABEL,
  domainLabel,
} from "@/lib/labels";
import { ChevronDownIcon } from "./icons";

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
  const [open, setOpen] = useState(false);
  const hasDetails =
    Boolean(c.expectation) || Boolean(c.outcome.note) || c.lenses.length > 0;

  return (
    <article className="rounded-2xl border border-stone-200/70 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium text-stone-600">
          <span className={`h-2 w-2 rounded-full ${OUTCOME_DOT[c.outcome.status]}`} />
          {OUTCOME_LABEL[c.outcome.status]}
        </span>
        <span className="text-stone-300">·</span>
        <span className="text-stone-500">{domainLabel(c.context.domain)}</span>
        {showLayer && c.layer === "community" ? (
          <>
            <span className="text-stone-300">·</span>
            <span className="text-sky-700">Compartida</span>
          </>
        ) : null}
        <span className="ml-auto text-stone-400">
          {c.author} · {new Date(c.createdAt).toLocaleDateString("es-PE")}
        </span>
      </div>

      <p className="leading-snug font-medium text-stone-900">{c.situation}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-stone-700">
        <span className="font-semibold text-emerald-700">Decidió</span>{" "}
        {c.decision}
      </p>
      <p className="mt-0.5 text-sm leading-relaxed text-stone-500">
        <span className="font-medium text-stone-400">porque</span> {c.reason}
      </p>

      {hasDetails ? (
        <>
          {open ? (
            <div className="mt-3 space-y-2 border-t border-stone-100 pt-3 text-sm">
              {c.expectation ? (
                <p className="text-stone-600">
                  <span className="font-medium text-stone-400">Esperaba:</span>{" "}
                  {c.expectation}
                </p>
              ) : null}
              {c.outcome.note ? (
                <p className="text-stone-600">
                  <span className="font-medium text-stone-400">Al final:</span>{" "}
                  {c.outcome.note}
                </p>
              ) : null}
              {c.lenses.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5">
                  {c.lenses.map((l) => (
                    <li
                      key={l.name}
                      className="rounded-lg bg-stone-100 px-2 py-1 text-xs text-stone-600"
                      title={l.reading}
                    >
                      <span className="font-medium text-stone-700">
                        {l.name.replace(/-/g, " ")}
                      </span>{" "}
                      · {WEIGHT_LABEL[l.weight].toLowerCase()}
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="text-xs text-stone-400">
                Decidió {DOUBT_LABEL[c.doubt].toLowerCase()}.
              </p>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-stone-400 transition-colors hover:text-emerald-700"
          >
            <ChevronDownIcon
              className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
            />
            {open ? "Ver menos" : "Ver detalles"}
          </button>
        </>
      ) : null}

      {footer}
    </article>
  );
}
