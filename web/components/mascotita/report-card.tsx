"use client";

// "Mientras no estabas": resumen numérico de lo que vivió desde tu última
// visita y sus entradas de diario agrupadas por día. "Ya lo leí" lo cierra.
import { useState } from "react";
import { api } from "@/lib/api";
import type { DiaryEntryView, EnvInfo, ReportView } from "@/lib/mascotita/types";
import { DeltaChips, DiaryEntry, groupByDay } from "./diary-panel";
import { errorMessage } from "./shared";

export function ReportCard({
  report,
  envs,
  onSeen,
}: {
  report: ReportView;
  envs: EnvInfo[];
  onSeen: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const seen = async () => {
    setError("");
    setBusy(true);
    try {
      await api("/api/mascotita/seen", { method: "POST" });
      onSeen();
    } catch (err) {
      setError(errorMessage(err, "No se pudo marcar como leído."));
      setBusy(false);
    }
  };

  const days = groupByDay(report.entries);
  const summary: string[] = [
    report.days === 1 ? "1 día" : `${report.days} días`,
    report.ticks === 1 ? "1 exploración" : `${report.ticks} exploraciones`,
    `+${report.newConcepts.length} conceptos`,
  ];
  if (report.forgotten.length > 0) summary.push(`${report.forgotten.length} olvidados`);
  if (report.predictions.made > 0) {
    summary.push(`predicciones ${report.predictions.ok}/${report.predictions.made}`);
  }

  return (
    <section className="animate-rise rounded-2xl border border-emerald-200/70 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2 className="text-base font-semibold text-stone-900">Mientras no estabas</h2>
        <span className="text-xs text-stone-400">{summary.join(" · ")}</span>
      </div>

      {report.traitWords.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {report.traitWords.map((w) => (
            <span key={w} className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-800">
              {w}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-2">
        <DeltaChips newConcepts={report.newConcepts} forgotten={report.forgotten} />
      </div>

      {report.question ? (
        <div className="mt-3 rounded-2xl rounded-tl-md border border-stone-200/70 bg-stone-50 px-3.5 py-2.5 text-sm text-stone-800">
          <span className="block text-[11px] font-medium text-stone-400">Te quiere preguntar</span>
          {report.question}
        </div>
      ) : null}

      {days.length > 0 ? (
        <div className="mt-4 space-y-4">
          {days.map(({ day, entries }) => (
            <div key={day}>
              <h3 className="mb-2 text-xs font-semibold text-stone-500 first-letter:uppercase">{day}</h3>
              <div className="space-y-2">
                {entries.map((e: DiaryEntryView) => (
                  <DiaryEntry key={e.id} entry={e} envs={envs} compact />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-3 border-t border-stone-100 pt-3">
        <button
          type="button"
          onClick={seen}
          disabled={busy}
          className="rounded-full bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:opacity-50"
        >
          {busy ? "Guardando…" : "Ya lo leí"}
        </button>
        {error ? <p className="text-xs text-red-700">{error}</p> : null}
      </div>
    </section>
  );
}
