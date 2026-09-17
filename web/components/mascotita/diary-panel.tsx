"use client";

// Diario en su voz, agrupado por día. Cada entrada trae su ánimo y los
// deltas numéricos del tick (conceptos nuevos, olvidados, recompensa,
// cambios de rasgos, predicciones). `DiaryEntry` y `DeltaChips` también los
// usa el informe "mientras no estabas".
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { DiaryDelta, DiaryEntryView, DiaryKind, EnvInfo, TraitKey } from "@/lib/mascotita/types";
import { MOOD_TONE, TRAIT_LABEL, dateEs, envInfoFor, errorMessage, signed, timeEs } from "./shared";

const KIND_LABEL: Record<DiaryKind, string> = {
  nacimiento: "nació",
  tick: "exploró",
  charla: "charla",
  ensenanza: "enseñanza",
  entorno: "se mudó",
  olvido: "olvidó",
  etapa: "creció",
  cambio: "cambio",
};

export function groupByDay(entries: DiaryEntryView[]): Array<{ day: string; entries: DiaryEntryView[] }> {
  const out: Array<{ day: string; entries: DiaryEntryView[] }> = [];
  for (const e of entries) {
    const day = dateEs(e.at, { weekday: "long", day: "numeric", month: "long" });
    const last = out[out.length - 1];
    if (last && last.day === day) last.entries.push(e);
    else out.push({ day, entries: [e] });
  }
  return out;
}

export function DeltaChips({ newConcepts, forgotten }: { newConcepts: string[]; forgotten: string[] }) {
  if (newConcepts.length === 0 && forgotten.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {newConcepts.map((s) => (
        <span key={`n-${s}`} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
          +{s}
        </span>
      ))}
      {forgotten.map((s) => (
        <span key={`f-${s}`} className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-400 line-through">
          {s}
        </span>
      ))}
    </div>
  );
}

function deltaLine(d: DiaryDelta): string {
  const parts: string[] = [];
  if (d.reinforced > 0) parts.push(`${d.reinforced} reforzados`);
  if (d.weakened > 0) parts.push(`${d.weakened} debilitados`);
  if (Math.abs(d.reward) >= 0.005) parts.push(`recompensa ${signed(d.reward)}`);
  if (d.predictions.made > 0) parts.push(`predijo ${d.predictions.ok}/${d.predictions.made}`);
  const shifts = (Object.keys(d.traitShift) as TraitKey[])
    .filter((k) => typeof d.traitShift[k] === "number")
    .map((k) => `${TRAIT_LABEL[k].toLowerCase()} ${signed(d.traitShift[k] as number)}`);
  return [...parts, ...shifts].join(" · ");
}

export function DiaryEntry({
  entry,
  envs,
  compact = false,
  highlight = false,
}: {
  entry: DiaryEntryView;
  envs: EnvInfo[];
  /** sin hora ni entorno (el informe ya agrupa por día) */
  compact?: boolean;
  /** recién escrita: entra animada */
  highlight?: boolean;
}) {
  const env = envInfoFor(envs, entry.env);
  const line = deltaLine(entry.delta);
  return (
    <article
      className={`rounded-xl border px-3.5 py-3 ${
        highlight ? "animate-rise border-emerald-200 bg-emerald-50/40" : "border-stone-100 bg-stone-50/60"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
        <span className={`rounded-full px-2 py-0.5 font-medium ${MOOD_TONE[entry.moodWord]}`}>
          {entry.moodWord}
        </span>
        <span className="text-stone-400">{KIND_LABEL[entry.kind]}</span>
        {!compact ? (
          <span className="ml-auto text-stone-400">
            <span aria-hidden>{env.emoji}</span> {env.name} · {timeEs(entry.at)}
          </span>
        ) : null}
      </div>
      <h4 className="mt-1.5 text-sm font-semibold text-stone-900">{entry.title}</h4>
      <p className="mt-1 text-sm leading-relaxed whitespace-pre-line text-stone-700">{entry.text}</p>
      <div className="mt-2 space-y-1.5">
        <DeltaChips newConcepts={entry.delta.newConcepts} forgotten={entry.delta.forgotten} />
        {line ? <p className="text-[11px] text-stone-400">{line}</p> : null}
        {entry.delta.question ? (
          <p className="text-xs text-stone-600">
            <span className="font-medium text-stone-400">Pregunta:</span> {entry.delta.question}
          </p>
        ) : null}
      </div>
    </article>
  );
}

export function DiaryPanel({
  initial,
  envs,
  refreshKey = 0,
}: {
  initial: DiaryEntryView[];
  envs: EnvInfo[];
  /** súbelo tras una exploración para volver a pedir el diario */
  refreshKey?: number;
}) {
  const [entries, setEntries] = useState<DiaryEntryView[]>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    api<{ entries: DiaryEntryView[] }>("/api/mascotita/diary?limit=60")
      .then((d) => {
        if (alive) setEntries(d.entries);
      })
      .catch((err) => {
        if (alive) setError(errorMessage(err, "No se pudo cargar el diario."));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const days = groupByDay(entries);

  return (
    <section className="animate-fade space-y-4">
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {loading && entries.length === 0 ? (
        <p className="py-8 text-center text-stone-400">Cargando…</p>
      ) : null}
      {!loading && entries.length === 0 && !error ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center">
          <p className="font-medium text-stone-700">Todavía no escribe nada</p>
          <p className="mt-1 text-sm text-stone-500">Después de su primera exploración aparece aquí, en su voz.</p>
        </div>
      ) : null}
      {days.map(({ day, entries: list }) => (
        <div key={day}>
          <h3 className="mb-2 text-xs font-semibold text-stone-500 first-letter:uppercase">{day}</h3>
          <div className="space-y-2">
            {list.map((e) => (
              <DiaryEntry key={e.id} entry={e} envs={envs} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
