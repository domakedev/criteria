"use client";

// Dónde vive: chips por entorno (emoji + nombre + visitas). Tocar uno la
// muda; el actual queda marcado.
import { useState } from "react";
import { api } from "@/lib/api";
import type { EnvInfo, PetView } from "@/lib/mascotita/types";
import { errorMessage } from "./shared";

export function EnvPicker({
  envs,
  pet,
  disabled = false,
  onMove,
}: {
  envs: EnvInfo[];
  pet: PetView;
  disabled?: boolean;
  onMove: (pet: PetView) => void;
}) {
  const [moving, setMoving] = useState<string | null>(null);
  const [error, setError] = useState("");

  const move = async (id: string) => {
    if (id === pet.env || moving) return;
    setError("");
    setMoving(id);
    try {
      const { pet: next } = await api<{ pet: PetView }>("/api/mascotita/env", {
        method: "POST",
        body: { env: id },
      });
      onMove(next);
    } catch (err) {
      setError(errorMessage(err, "No se pudo mudar."));
    } finally {
      setMoving(null);
    }
  };

  const allowed = envs.filter((e) => pet.allowedEnvs.length === 0 || pet.allowedEnvs.includes(e.id));

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-stone-500">Dónde vive</p>
      <div className="flex flex-wrap gap-1.5">
        {allowed.map((e) => {
          const current = e.id === pet.env;
          const visits = pet.envVisits[e.id] ?? 0;
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => move(e.id)}
              disabled={disabled || moving !== null || current}
              aria-pressed={current}
              title={e.intro}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-default ${
                current
                  ? "border-emerald-200 bg-emerald-100 text-emerald-900"
                  : "border-stone-200 bg-white text-stone-600 hover:border-emerald-200 hover:text-emerald-800 disabled:opacity-50"
              }`}
            >
              <span aria-hidden>{e.emoji}</span>
              {moving === e.id ? "Mudando…" : e.name}
              <span className="text-[10px] text-stone-400 tabular-nums">
                {visits === 1 ? "1 visita" : `${visits} visitas`}
              </span>
            </button>
          );
        })}
      </div>
      {error ? <p className="mt-1.5 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
