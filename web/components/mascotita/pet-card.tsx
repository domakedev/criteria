"use client";

// Tarjeta principal: cómo está la mascota ahora mismo — avatar, ánimo, dónde
// vive, sus impulsos y cuándo exploró por última vez.
import type { EnvInfo, PetView } from "@/lib/mascotita/types";
import { Avatar } from "./avatar";
import { MOOD_TONE, STAGE_LABEL, ago, envInfoFor } from "./shared";

export function PetCard({ pet, envs }: { pet: PetView; envs: EnvInfo[] }) {
  const env = envInfoFor(envs, pet.env);
  return (
    <section className="animate-fade rounded-2xl border border-stone-200/70 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <Avatar pet={pet} size={128} className="border border-stone-100" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${MOOD_TONE[pet.mood.word]}`}>
              está {pet.mood.word}
            </span>
            {pet.busy ? (
              <span className="animate-pulse rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-800">
                explorando…
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-stone-700">
            <span aria-hidden>{env.emoji}</span> Vive en{" "}
            <span className="font-medium text-stone-900">{env.name}</span>
          </p>
          <p className="mt-0.5 text-xs text-stone-500">
            {STAGE_LABEL[pet.stage]} · {pet.ageDays === 1 ? "1 día" : `${pet.ageDays} días`} ·{" "}
            {pet.lastTickAt ? `Última exploración ${ago(pet.lastTickAt)}` : "Todavía no explora"}
          </p>

          <div className="mt-3 space-y-1.5">
            <Drive label="Energía" value={pet.drives.energy} tone="bg-emerald-500" />
            <Drive label="Aburrimiento" value={pet.drives.boredom} tone="bg-amber-400" />
            <Drive label="Soledad" value={pet.drives.loneliness} tone="bg-sky-400" />
          </div>
        </div>
      </div>
      <p className="mt-3 border-t border-stone-100 pt-2.5 text-[11px] text-stone-400">
        Cerebro: <span className="font-medium text-violet-700">{pet.brainId}</span>
        {pet.pendingQuestion ? (
          <>
            <span className="mx-1.5 text-stone-300">·</span>
            tiene una pregunta para ti
          </>
        ) : null}
      </p>
    </section>
  );
}

function Drive({ label, value, tone }: { label: string; value: number; tone: string }) {
  const w = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="flex items-center gap-2 text-[11px] text-stone-500">
      <span className="w-22 shrink-0">{label}</span>
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={w}
      >
        <div className={`h-full rounded-full transition-all duration-700 ${tone}`} style={{ width: `${w}%` }} />
      </div>
      <span className="w-8 text-right tabular-nums">{w}</span>
    </div>
  );
}
