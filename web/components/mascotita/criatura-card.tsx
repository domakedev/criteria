"use client";

// Tarjeta de una criatura: avatar, dónde está, ánimo, impulsos, edad y cifras.
// (Vista provisional hasta el terrario de la fase 6.)
import type { CriaturaView, EnvInfo } from "@/lib/mascotita/types";
import { Avatar } from "./avatar";
import { MOOD_TONE, STAGE_LABEL, ago, envInfoFor, num, zonaNombre } from "./shared";

export function CriaturaCard({ c, envs }: { c: CriaturaView; envs: EnvInfo[] }) {
  const env = envInfoFor(envs, c.env);
  return (
    <section className="rounded-2xl border border-stone-800 bg-stone-900/70 p-4 sm:p-5">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <Avatar
          pet={{ etapa: c.etapa, env: c.env, rasgos: c.rasgos, mood: c.mood, drives: c.drives, tono: c.tono }}
          size={120}
          className="border border-stone-800"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-stone-100">{c.nombre}</h2>
            <span className="rounded-full bg-stone-800 px-2 py-0.5 text-[11px] text-stone-300">
              gen {c.gen} · {STAGE_LABEL[c.etapa]}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${MOOD_TONE[c.mood.word]}`}>
              está {c.mood.word}
            </span>
          </div>
          <p className="mt-1.5 text-sm text-stone-300">
            <span aria-hidden>{env.emoji}</span> En <span className="font-medium text-stone-100">{zonaNombre(envs, c.env, c.zona)}</span>{" "}
            <span className="text-stone-500">({env.name})</span>
          </p>
          <p className="mt-0.5 text-xs text-stone-500">
            {num(c.edadTicks)} ticks de vida · {c.lastTickAt ? `último tick ${ago(c.lastTickAt)}` : "todavía no vive"} · vida esperada{" "}
            {num(c.genes.vida)} ticks
          </p>
          <div className="mt-3 space-y-1.5">
            <Drive label="Energía" value={c.drives.energy} tone="bg-emerald-500" />
            <Drive label="Aburrimiento" value={c.drives.boredom} tone="bg-amber-400" />
            <Drive label="Soledad" value={c.drives.loneliness} tone="bg-sky-400" />
            <Drive label="Daño" value={c.dano} tone="bg-red-500" />
          </div>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-stone-800 pt-3 text-center text-[11px] text-stone-400 sm:grid-cols-6">
        <Stat k="pasos" v={num(c.stats.pasos)} />
        <Stat k="recompensa media" v={c.stats.recompensaMedia.toFixed(2)} />
        <Stat k="pérdida media" v={c.stats.perdidaMedia.toFixed(3)} />
        <Stat k="fallos graves" v={num(c.stats.fallosGraves)} />
        <Stat k="mudanzas" v={num(c.stats.mudanzas)} />
        <Stat k="sueños" v={num(c.stats.suenos)} />
      </dl>
    </section>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt>{k}</dt>
      <dd className="font-medium text-stone-200 tabular-nums">{v}</dd>
    </div>
  );
}

function Drive({ label, value, tone }: { label: string; value: number; tone: string }) {
  const w = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="flex items-center gap-2 text-[11px] text-stone-400">
      <span className="w-24 shrink-0">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-800" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={w}>
        <div className={`h-full rounded-full transition-all duration-700 ${tone}`} style={{ width: `${w}%` }} />
      </div>
      <span className="w-8 text-right tabular-nums">{w}</span>
    </div>
  );
}
