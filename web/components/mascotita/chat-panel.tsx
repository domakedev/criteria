"use client";

// Charlar: burbujas (tú a la derecha en esmeralda, ella a la izquierda en
// blanco). Responde solo con lo que sabe; si dice que no lo sabe, puedes
// saltar a enseñarle. El mensaje se pinta antes de que llegue la respuesta.
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { ChatResponse, ChatView, PetView } from "@/lib/mascotita/types";
import { MOOD_TONE, errorMessage } from "./shared";

const MAX_CHARS = 500;

interface Bubble {
  id: string;
  from: "dueño" | "mascota";
  text: string;
  used: string[];
  learned: string[];
  moodWord: ChatView["moodWord"];
  /** la mascota reconoció que no lo sabe → ofrecer enseñarle */
  askTeach: boolean;
}

function fromView(c: ChatView): Bubble {
  return {
    id: c.id,
    from: c.from,
    text: c.text,
    used: c.usedConcepts,
    learned: c.learned,
    moodWord: c.moodWord,
    askTeach: false,
  };
}

const DONT_KNOW = /no (lo |la )?s[eé]\b|todav[ií]a no (lo )?s[eé]/i;

export function ChatPanel({
  initial,
  chatsLeft,
  pendingQuestion,
  onPet,
  onTeach,
  onSpent,
}: {
  initial: ChatView[];
  chatsLeft: number;
  pendingQuestion: string | null;
  onPet: (pet: PetView) => void;
  /** ir a la pestaña Enseñar */
  onTeach: () => void;
  /** se gastó un turno de charla del día */
  onSpent: () => void;
}) {
  const [bubbles, setBubbles] = useState<Bubble[]>(initial.map(fromView));
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [bubbles.length, sending]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const msg = text.trim();
    if (!msg || sending) return;
    setError("");
    setSending(true);
    // Optimista: tu burbuja aparece ya; si falla, se quita y recuperas el texto.
    const tempId = `tmp-${Date.now()}`;
    setBubbles((b) => [
      ...b,
      { id: tempId, from: "dueño", text: msg, used: [], learned: [], moodWord: null, askTeach: false },
    ]);
    setText("");
    try {
      const r = await api<ChatResponse>("/api/mascotita/chat", { method: "POST", body: { text: msg } });
      setBubbles((b) => [
        ...b,
        {
          id: `${tempId}-r`,
          from: "mascota",
          text: r.reply,
          used: r.usedConcepts,
          learned: r.learned.map((c) => c.label),
          moodWord: r.moodWord,
          askTeach: DONT_KNOW.test(r.reply),
        },
        ...(r.question
          ? [
              {
                id: `${tempId}-q`,
                from: "mascota" as const,
                text: r.question,
                used: [],
                learned: [],
                moodWord: null,
                askTeach: false,
              },
            ]
          : []),
      ]);
      onPet(r.pet);
      onSpent();
    } catch (err) {
      setBubbles((b) => b.filter((x) => x.id !== tempId));
      setText(msg);
      setError(errorMessage(err, "No se pudo enviar."));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const noQuota = chatsLeft <= 0;

  return (
    <section className="animate-fade rounded-2xl border border-stone-200/70 bg-white p-4 shadow-sm sm:p-5">
      <div className="max-h-[28rem] space-y-2.5 overflow-y-auto pr-1">
        {pendingQuestion ? (
          <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-stone-200/70 bg-stone-50 px-3.5 py-2.5 text-sm text-stone-800">
            <span className="block text-[11px] font-medium text-stone-400">Te quiere preguntar</span>
            {pendingQuestion}
          </div>
        ) : null}
        {bubbles.length === 0 && !pendingQuestion ? (
          <p className="py-6 text-center text-sm text-stone-400">
            Todavía no han hablado. Pregúntale qué vio hoy.
          </p>
        ) : null}
        {bubbles.map((b) =>
          b.from === "dueño" ? (
            <div key={b.id} className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-tr-md bg-emerald-700 px-3.5 py-2 text-sm whitespace-pre-line text-white">
                {b.text}
              </p>
            </div>
          ) : (
            <div key={b.id} className="flex flex-col items-start">
              <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-stone-200/70 bg-white px-3.5 py-2 text-sm whitespace-pre-line text-stone-800 shadow-sm">
                {b.text}
              </div>
              {b.used.length > 0 || b.learned.length > 0 || b.moodWord ? (
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 px-1 text-[11px] text-stone-400">
                  {b.moodWord ? (
                    <span className={`rounded-full px-1.5 py-0.5 font-medium ${MOOD_TONE[b.moodWord]}`}>
                      {b.moodWord}
                    </span>
                  ) : null}
                  {b.used.length > 0 ? <span>usó: {b.used.join(", ")}</span> : null}
                  {b.learned.length > 0 ? (
                    <span className="text-emerald-700">aprendió: {b.learned.join(", ")}</span>
                  ) : null}
                </p>
              ) : null}
              {b.askTeach ? (
                <button
                  type="button"
                  onClick={onTeach}
                  className="mt-1 rounded-full bg-violet-100 px-3 py-1 text-xs font-medium text-violet-800 transition-colors hover:bg-violet-200"
                >
                  Enséñale
                </button>
              ) : null}
            </div>
          ),
        )}
        {sending ? (
          <p className="animate-pulse px-1 text-xs text-stone-400">está pensando…</p>
        ) : null}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="mt-3 border-t border-stone-100 pt-3">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none disabled:bg-stone-50"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
            placeholder={noQuota ? "Hoy ya charlaron bastante." : "Dile algo…"}
            disabled={sending || noQuota}
            aria-label="Mensaje para tu mascota"
          />
          <button
            type="submit"
            disabled={sending || noQuota || !text.trim()}
            className="shrink-0 rounded-full bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:opacity-50"
          >
            {sending ? "…" : "Enviar"}
          </button>
        </div>
        <div className="mt-1.5 flex items-center justify-between px-1 text-[11px] text-stone-400">
          <span>{error ? <span className="text-red-700">{error}</span> : "Solo responde con lo que vivió."}</span>
          <span className="tabular-nums">
            {noQuota ? "sin turnos hoy" : chatsLeft === 1 ? "1 turno hoy" : `${chatsLeft} turnos hoy`}
          </span>
        </div>
      </form>
    </section>
  );
}
