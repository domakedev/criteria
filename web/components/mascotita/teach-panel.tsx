"use client";

// Enseñar: le cuentas un hecho y lo guarda como creencia con confianza
// media. Solo se afianza si lo confirma explorando; si choca con lo que ya
// vio, te lo dice ("Pero yo vi que…").
import { useState } from "react";
import { api } from "@/lib/api";
import type { ConceptView, PetView, TeachResponse } from "@/lib/mascotita/types";
import { KIND_EMOJI, errorMessage, pct } from "./shared";

const MAX_CHARS = 300;

export function TeachPanel({
  teachLeft,
  onPet,
  onSpent,
}: {
  teachLeft: number;
  onPet: (pet: PetView) => void;
  /** se gastó una enseñanza del día */
  onSpent: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [last, setLast] = useState<{ text: string; r: TeachResponse } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const msg = text.trim();
    if (!msg || busy) return;
    setError("");
    setBusy(true);
    try {
      const r = await api<TeachResponse>("/api/mascotita/teach", { method: "POST", body: { text: msg } });
      setLast({ text: msg, r });
      setText("");
      onPet(r.pet);
      onSpent();
    } catch (err) {
      setError(errorMessage(err, "No se pudo enseñar."));
    } finally {
      setBusy(false);
    }
  };

  const noQuota = teachLeft <= 0;
  const field =
    "w-full resize-none rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm shadow-sm focus:border-emerald-500 focus:outline-none disabled:bg-stone-50";

  return (
    <section className="animate-fade space-y-4">
      <form onSubmit={submit} className="rounded-2xl border border-stone-200/70 bg-white p-4 shadow-sm sm:p-5">
        <label htmlFor="mz-teach" className="block text-sm font-medium text-stone-800">
          ¿Qué quieres que sepa?
        </label>
        <textarea
          id="mz-teach"
          className={`mt-2 ${field}`}
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
          placeholder="Ej.: En web/lib/ai.ts está la función que habla con Gemini."
          disabled={busy || noQuota}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-stone-400 tabular-nums">
            {text.length}/{MAX_CHARS}
            <span className="mx-1.5 text-stone-300">·</span>
            {noQuota ? "sin enseñanzas hoy" : teachLeft === 1 ? "1 enseñanza hoy" : `${teachLeft} enseñanzas hoy`}
          </span>
          <button
            type="submit"
            disabled={busy || noQuota || !text.trim()}
            className="ml-auto rounded-full bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:opacity-50"
          >
            {busy ? "Escuchando…" : "Enséñale"}
          </button>
        </div>
        {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
        <p className="mt-3 border-t border-stone-100 pt-2.5 text-xs text-stone-400">
          Lo que le enseñes solo se afianza si lo confirma explorando.
        </p>
      </form>

      {last ? (
        <div className="animate-rise space-y-3">
          <div className="flex justify-end">
            <p className="max-w-[85%] rounded-2xl rounded-tr-md bg-emerald-700 px-3.5 py-2 text-sm whitespace-pre-line text-white">
              {last.text}
            </p>
          </div>
          <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-stone-200/70 bg-white px-3.5 py-2 text-sm whitespace-pre-line text-stone-800 shadow-sm">
            {last.r.ack}
          </div>

          {last.r.concepts.length > 0 ? (
            <ul className="space-y-2">
              {last.r.concepts.map((c) => (
                <LearnedCard key={c.id} c={c} />
              ))}
            </ul>
          ) : (
            <p className="px-1 text-xs text-stone-400">No sacó ningún hecho nuevo de eso.</p>
          )}

          {last.r.contradiction ? (
            <div className="rounded-2xl border border-amber-200/70 bg-amber-50 p-3.5 text-sm text-amber-900">
              <span className="block text-[11px] font-semibold tracking-wide text-amber-700 uppercase">
                Pero yo vi que…
              </span>
              <p className="mt-1">{last.r.contradiction.why}</p>
              <p className="mt-1 text-xs text-amber-700">
                sobre <span className="font-medium">{last.r.contradiction.label}</span>
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function LearnedCard({ c }: { c: ConceptView }) {
  return (
    <li className="flex items-start gap-2.5 rounded-2xl border border-violet-200/70 bg-white p-3.5 shadow-sm">
      <span className="mt-0.5 text-base leading-none" aria-hidden>
        {KIND_EMOJI[c.kind]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-stone-900">{c.label}</p>
        <p className="mt-0.5 text-sm text-stone-700">{c.claim}</p>
        <p className="mt-1 text-[11px] text-stone-400">
          confianza {pct(c.confidence)}
          {c.toTest ? " · lo pondrá a prueba" : c.verified ? " · ya lo comprobó" : ""}
        </p>
      </div>
    </li>
  );
}
