"use client";

// Ficha de una criatura: avatar, dónde está, ánimo, impulsos, edad y cifras.
import type { CriaturaView, EnvInfo } from "@/lib/mascotita/types";
import { Avatar } from "./avatar";
import { STAGE_LABEL, ago, envInfoFor, num, zonaNombre } from "./shared";

const CAUSA: Record<string, string> = { vejez: "de vieja", hambre: "de hambre", fallos: "de tantos golpes", dios: "por el dios" };

export function CriaturaCard({ c, envs }: { c: CriaturaView; envs: EnvInfo[] }) {
  const env = envInfoFor(envs, c.env);
  return (
    <div className="text-[#1b1b24]">
      <div className="flex gap-3">
        <Avatar pet={{ etapa: c.etapa, env: c.env, rasgos: c.rasgos, mood: c.mood, drives: c.drives, tono: c.tono }} size={88} className="border-2 border-[#1b1b24]" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-base font-bold">{c.nombre}</span>
            <span className="chip">gen {c.gen}</span>
            <span className="chip">{STAGE_LABEL[c.etapa]}</span>
            {c.viva ? <span className="chip">está {c.mood.word}</span> : <span className="chip">murió {CAUSA[c.causaMuerte ?? ""] ?? ""}</span>}
          </div>
          <p className="mt-1 text-[11px]">
            <span aria-hidden>{env.emoji}</span> {c.viva ? "En" : "Estaba en"} <b>{zonaNombre(envs, c.env, c.zona)}</b> <span className="text-[#5a5a6a]">({env.name})</span>
          </p>
          <p className="text-[11px] text-[#5a5a6a]">
            {num(c.edadTicks)} ticks · vida esperada {num(c.genes.vida)} · {c.lastTickAt ? `último tick ${ago(c.lastTickAt)}` : "sin ticks"}
          </p>
        </div>
      </div>
      <div className="mt-2 space-y-1">
        <Drive label="Energía" value={c.drives.energy} color="#3ca370" />
        <Drive label="Aburrimiento" value={c.drives.boredom} color="#f5c542" />
        <Drive label="Soledad" value={c.drives.loneliness} color="#4d8fe3" />
        <Drive label="Daño" value={c.dano} color="#d64f4f" />
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-1 border-t border-dashed border-[#cfc8b4] pt-2 text-center text-[10px] text-[#5a5a6a] sm:grid-cols-6">
        <Stat k="pasos" v={num(c.stats.pasos)} />
        <Stat k="recomp. media" v={c.stats.recompensaMedia.toFixed(2)} />
        <Stat k="comidas" v={num(c.stats.comidas)} />
        <Stat k="golpes" v={num(c.stats.fallosGraves)} />
        <Stat k="crías" v={num(c.stats.crias)} />
        <Stat k="emisiones" v={num(c.stats.emisiones)} />
      </dl>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt>{k}</dt>
      <dd className="font-bold text-[#1b1b24] tabular-nums">{v}</dd>
    </div>
  );
}

function Drive({ label, value, color }: { label: string; value: number; color: string }) {
  const w = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="w-20 shrink-0 text-[#5a5a6a]">{label}</span>
      <div className="barra flex-1" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={w}>
        <div style={{ width: `${w}%`, background: color }} />
      </div>
      <span className="w-7 text-right tabular-nums">{w}</span>
    </div>
  );
}
