"use client";

// Personalidad: seis rasgos con marcador de cómo nació y flecha de la última
// semana; hábitos, preferencias por lugar, habilidades, cifras, etapa y
// confianza en ti. Al final, "Empezar de cero" (confirmando con BORRAR).
import { useState } from "react";
import { api } from "@/lib/api";
import type { EnvInfo, PetView } from "@/lib/mascotita/types";
import { STAGE_LABEL, TRAIT_LABEL, TRAIT_ORDER, envInfoFor, errorMessage, pct, signed } from "./shared";

export function TraitsPanel({
  pet,
  envs,
  onReset,
}: {
  pet: PetView;
  envs: EnvInfo[];
  /** la mascota ya no existe: volver a la pantalla del huevo */
  onReset: () => void;
}) {
  const xpPct = pet.xpNext ? Math.min(100, Math.round((pet.xp / pet.xpNext) * 100)) : 100;
  const prefEnvs = Object.keys(pet.preferences).filter((k) => pet.preferences[k].length > 0);

  return (
    <section className="animate-fade space-y-4">
      <Card title="Cómo es">
        <div className="space-y-3">
          {TRAIT_ORDER.map((k) => (
            <TraitBar
              key={k}
              label={TRAIT_LABEL[k]}
              value={pet.traits[k]}
              gene={pet.genes[k]}
              delta={pet.traitDelta7d[k] ?? 0}
            />
          ))}
        </div>
        <p className="mt-3 text-[11px] text-stone-400">
          El triángulo marca cómo nació; la flecha, cuánto cambió en 7 días. Deriva despacio, con lo que vive.
        </p>
      </Card>

      <Card title="Etapa">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-900">
            {STAGE_LABEL[pet.stage]}
          </span>
          <span className="text-stone-500 tabular-nums">
            {pet.xpNext ? `${Math.round(pet.xp)} / ${pet.xpNext} xp` : `${Math.round(pet.xp)} xp · ya es sabia`}
          </span>
          <span className="ml-auto text-stone-500">Confía en ti: {pct(pet.trustOwner)}</span>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100"
          role="meter"
          aria-label="progreso a la siguiente etapa"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={xpPct}
        >
          <div className="h-full rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${xpPct}%` }} />
        </div>
      </Card>

      <Card title="Hábitos">
        {pet.habits.length === 0 ? (
          <Empty>Todavía no tiene hábitos. Salen de repetir lo que le funciona.</Empty>
        ) : (
          <ul className="space-y-1.5 text-sm text-stone-700">
            {pet.habits.map((h) => (
              <li key={`${h.env}-${h.action}`} className="flex items-center gap-2">
                <span aria-hidden>{envInfoFor(envs, h.env).emoji}</span>
                <span>
                  En {envInfoFor(envs, h.env).name}, <span className="font-medium">{h.action}</span>
                </span>
                <span className="ml-auto text-xs text-stone-400 tabular-nums">
                  {h.n} veces, {h.ok} bien
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Qué prefiere hacer en cada lugar">
        {prefEnvs.length === 0 ? (
          <Empty>Cuando explore un poco sabrá qué le gusta hacer en cada lugar.</Empty>
        ) : (
          <div className="space-y-3">
            {prefEnvs.map((envId) => {
              const env = envInfoFor(envs, envId);
              return (
                <div key={envId}>
                  <p className="mb-1 text-xs font-medium text-stone-500">
                    <span aria-hidden>{env.emoji}</span> {env.name}
                  </p>
                  <div className="space-y-1">
                    {pet.preferences[envId].map((p) => (
                      <MiniBar key={p.action} label={p.action} q={p.q} n={p.n} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="Habilidades">
        {pet.skills.length === 0 ? (
          <Empty>Aún no ha intentado nada.</Empty>
        ) : (
          <div className="space-y-1">
            {pet.skills.map((s) => (
              <div key={s.action} className="flex items-center gap-2 text-xs text-stone-600">
                <span className="w-24 shrink-0 truncate">{s.action}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100">
                  <div className="h-full rounded-full bg-sky-400" style={{ width: `${Math.round(s.competence * 100)}%` }} />
                </div>
                <span className="w-20 shrink-0 text-right text-[11px] text-stone-400 tabular-nums">
                  {s.ok} bien · {s.fail} mal
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="En cifras">
        <div className="grid grid-cols-3 gap-y-3 sm:grid-cols-4">
          <Stat label="Exploraciones" value={pet.stats.ticks} />
          <Stat label="Pasos" value={pet.stats.steps} />
          <Stat label="Conceptos" value={pet.stats.concepts} />
          <Stat label="Enseñados" value={pet.stats.taughtConcepts} />
          <Stat label="Olvidados" value={pet.stats.forgotten} />
          <Stat label="Charlas" value={pet.stats.chats} />
          <Stat label="Mudanzas" value={pet.stats.envSwitches} />
          <Stat
            label="Predicciones"
            value={pet.stats.predictions > 0 ? `${pet.stats.predictionsOk}/${pet.stats.predictions}` : "—"}
          />
          <Stat
            label="Comprobaciones"
            value={pet.stats.verifications > 0 ? `${pet.stats.verificationsOk}/${pet.stats.verifications}` : "—"}
          />
          <Stat label="Llamadas IA" value={pet.stats.llmCalls} />
        </div>
        <p className="mt-3 border-t border-stone-100 pt-2.5 text-[11px] text-stone-400">
          Cerebro: <span className="font-medium text-violet-700">{pet.brainId}</span> · nació el{" "}
          {new Date(pet.bornAt).toLocaleDateString("es-PE")}
        </p>
      </Card>

      <ResetCard name={pet.name} onReset={onReset} />
    </section>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-stone-200/70 bg-white p-4 shadow-sm sm:p-5">
      <h3 className="mb-3 text-xs font-semibold tracking-wide text-stone-500 uppercase">{title}</h3>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-stone-400">{children}</p>;
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="px-1 text-center">
      <div className="text-lg font-bold text-stone-900 tabular-nums">{value}</div>
      <div className="text-[11px] text-stone-400">{label}</div>
    </div>
  );
}

/** Barra de rasgo: relleno = valor actual, triángulo = genes, flecha = Δ7d. */
function TraitBar({ label, value, gene, delta }: { label: string; value: number; gene: number; delta: number }) {
  const w = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const g = Math.round(Math.min(1, Math.max(0, gene)) * 100);
  const moved = Math.abs(delta) >= 0.001;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 shrink-0 text-stone-600">{label}</span>
      <div className="relative flex-1 pb-2">
        <div
          className="h-2 overflow-hidden rounded-full bg-stone-100"
          role="meter"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={w}
        >
          <div className="h-full rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${w}%` }} />
        </div>
        {/* marcador de nacimiento: un triangulito bajo la barra */}
        <svg
          viewBox="0 0 10 6"
          className="absolute bottom-0 h-1.5 w-2.5 -translate-x-1/2 text-stone-500"
          style={{ left: `${g}%` }}
          aria-hidden
        >
          <polygon points="5,0 10,6 0,6" fill="currentColor" />
        </svg>
      </div>
      <span
        className={`w-14 shrink-0 text-right tabular-nums ${
          moved ? (delta > 0 ? "text-emerald-700" : "text-red-600") : "text-stone-300"
        }`}
        title="cambio en 7 días"
      >
        {moved ? `${delta > 0 ? "↑" : "↓"} ${signed(delta)}` : "—"}
      </span>
    </div>
  );
}

/** Preferencia por acción: q ∈ [−1, 1] pintado desde el centro. */
function MiniBar({ label, q, n }: { label: string; q: number; n: number }) {
  const v = Math.max(-1, Math.min(1, q));
  const half = Math.round(Math.abs(v) * 50);
  return (
    <div className="flex items-center gap-2 text-xs text-stone-600">
      <span className="w-24 shrink-0 truncate">{label}</span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-stone-100">
        <div className="absolute inset-y-0 left-1/2 w-px bg-stone-300" />
        <div
          className={`absolute inset-y-0 rounded-full ${v >= 0 ? "bg-emerald-500" : "bg-red-400"}`}
          style={v >= 0 ? { left: "50%", width: `${half}%` } : { right: "50%", width: `${half}%` }}
        />
      </div>
      <span className="w-16 shrink-0 text-right text-[11px] text-stone-400 tabular-nums">
        {signed(v)} · {n}×
      </span>
    </div>
  );
}

function ResetCard({ name, onReset }: { name: string; onReset: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reset = async () => {
    if (confirm !== "BORRAR" || busy) return;
    setError("");
    setBusy(true);
    try {
      await api("/api/mascotita", { method: "DELETE", body: { confirm: "BORRAR" } });
      onReset();
    } catch (err) {
      setError(errorMessage(err, "No se pudo borrar."));
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-red-200/70 bg-white p-4 shadow-sm sm:p-5">
      <h3 className="text-xs font-semibold tracking-wide text-red-700 uppercase">Empezar de cero</h3>
      <p className="mt-1 text-sm text-stone-600">
        Borra a {name} con todo lo que aprendió, sus recuerdos y su diario. No hay vuelta atrás.
      </p>
      {open ? (
        <div className="mt-3 space-y-2">
          <label htmlFor="mz-reset" className="block text-xs text-stone-500">
            Escribe <span className="font-mono font-semibold text-stone-800">BORRAR</span> para confirmar.
          </label>
          <div className="flex gap-2">
            <input
              id="mz-reset"
              className="w-40 rounded-xl border border-stone-200 px-3.5 py-2 text-sm shadow-sm focus:border-red-500 focus:outline-none"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={reset}
              disabled={confirm !== "BORRAR" || busy}
              className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? "Borrando…" : "Borrar"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setConfirm("");
                setError("");
              }}
              className="text-sm text-stone-500 hover:text-stone-800"
            >
              Cancelar
            </button>
          </div>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 rounded-full border border-red-200 px-4 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
        >
          Empezar de cero
        </button>
      )}
    </div>
  );
}
