"use client";

// La mente de una criatura: el último tick paso a paso (qué candidatas vio,
// qué valor les dio su red y cuál eligió), lo que aprendió (pérdida, sorpresa),
// sus creencias más firmes, sus rasgos frente a sus genes y la activación de
// su capa 2. Todo son números del servidor: aquí solo se pintan.
import type { CriaturaView, EnvInfo } from "@/lib/mascotita/types";
import { TRAIT_LABEL, TRAIT_ORDER, num, signed, zonaNombre } from "./shared";

export function MentePanel({ c, envs }: { c: CriaturaView; envs: EnvInfo[] }) {
  const t = c.ultimoTick;
  return (
    <div className="space-y-4">
      <Card title={t ? `Último tick (#${t.seq}) en ${zonaNombre(envs, t.env, t.zona)}` : "Último tick"}>
        {!t || t.pasos.length === 0 ? (
          <p className="text-sm text-stone-400">Todavía no ha vivido ningún tick.</p>
        ) : (
          <>
            <p className="mb-3 text-[11px] text-stone-500">
              temperatura {t.temperatura} · pérdida {t.perdida} · gradiente {t.gradiente} · {t.ms} ms
            </p>
            <ol className="space-y-3">
              {t.pasos.map((p, i) => (
                <li key={i} className="rounded-xl border border-stone-800 bg-stone-950/50 p-3">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                    <span className="font-medium text-stone-100">{p.label}</span>
                    <span className={`tabular-nums ${p.r >= 0 ? "text-emerald-300" : "text-red-300"}`}>{signed(p.r)}</span>
                    <span className="text-[11px] text-stone-500">
                      {p.exito ? "salió bien" : "falló"} · predijo éxito {Math.round(p.pExito * 100)} % · sorpresa {p.sorpresa} ·
                      retorno {signed(p.g)}
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {[...p.candidatas]
                      .sort((a, b) => b.q - a.q)
                      .map((k, j) => {
                        const elegida = k.accion === p.accion && k.objetivo === p.objetivo;
                        return <QBar key={j} label={k.label} q={k.q} elegida={elegida} />;
                      })}
                  </ul>
                  {p.tags.length ? <p className="mt-1.5 text-[10px] text-stone-500">{p.tags.join(" · ")}</p> : null}
                </li>
              ))}
            </ol>
            {t.activacion.length ? (
              <div className="mt-3">
                <p className="mb-1 text-[11px] text-stone-500">capa 2 (24 neuronas) en el último paso</p>
                <div className="flex gap-0.5">
                  {t.activacion.map((v, i) => (
                    <span
                      key={i}
                      title={v.toFixed(2)}
                      className="h-4 flex-1 rounded-sm"
                      style={{ background: v >= 0 ? `rgba(52,211,153,${Math.abs(v)})` : `rgba(248,113,113,${Math.abs(v)})` }}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </Card>

      <Card title={`Creencias (${c.creencias.length} de ≤ 120)`}>
        {c.creencias.length === 0 ? (
          <p className="text-sm text-stone-400">Aún no cree nada: no ha vivido lo suficiente.</p>
        ) : (
          <ul className="space-y-1">
            {c.creencias.map((b) => (
              <li key={b.clave} className="flex items-center gap-2 text-xs">
                <span className="w-16 shrink-0 text-stone-400">{b.verbo}</span>
                <span className="min-w-0 flex-1 truncate text-stone-200">{b.objetivo}</span>
                <span className={`w-12 text-right tabular-nums ${b.q >= 0 ? "text-emerald-300" : "text-red-300"}`}>{signed(b.q)}</span>
                <span className="w-10 text-right text-stone-500 tabular-nums">{b.n}×</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-stone-500">
          Lo que ella misma vivió con cada (objetivo, verbo): valor medio y veces. La red lo recibe como entrada y decide cuánto fiarse.
        </p>
      </Card>

      <Card title="Rasgos y genes">
        <div className="space-y-2">
          {TRAIT_ORDER.map((k) => (
            <TraitBar key={k} label={TRAIT_LABEL[k]} value={c.rasgos[k]} gene={c.genes.rasgos[k]} delta={c.traitDelta7d[k] ?? 0} />
          ))}
        </div>
        <p className="mt-3 text-[11px] text-stone-500">
          El triángulo marca cómo nació; la flecha, cuánto cambió en 7 días. Genes del cerebro: lr {c.genes.lr} · τ {c.genes.tau} · σ{" "}
          {c.genes.sigma} · vida {num(c.genes.vida)} ticks. Red de {num(c.parametros)} parámetros · {c.memorias} memorias en el anillo.
        </p>
      </Card>

      {c.skills.length ? (
        <Card title="Competencia por verbo">
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
            {c.skills.map((s) => (
              <li key={s.action} className="flex justify-between text-stone-300">
                <span>{s.action}</span>
                <span className="text-stone-500 tabular-nums">
                  {Math.round(s.competence * 100)} % · {s.ok}/{s.ok + s.fail}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-stone-800 bg-stone-900/70 p-4">
      <h3 className="mb-3 text-sm font-semibold text-stone-200">{title}</h3>
      {children}
    </section>
  );
}

/** Valor Q ∈ [−1, 1] pintado desde el centro; la elegida, resaltada. */
function QBar({ label, q, elegida }: { label: string; q: number; elegida: boolean }) {
  const v = Math.max(-1, Math.min(1, q));
  const half = Math.round(Math.abs(v) * 50);
  return (
    <li className={`flex items-center gap-2 text-[11px] ${elegida ? "text-stone-100" : "text-stone-500"}`}>
      <span className="w-40 shrink-0 truncate sm:w-56">{elegida ? "▸ " : ""}{label}</span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-stone-800">
        <div className="absolute inset-y-0 left-1/2 w-px bg-stone-600" />
        <div
          className={`absolute inset-y-0 rounded-full ${v >= 0 ? (elegida ? "bg-emerald-400" : "bg-emerald-800") : elegida ? "bg-red-400" : "bg-red-900"}`}
          style={v >= 0 ? { left: "50%", width: `${half}%` } : { right: "50%", width: `${half}%` }}
        />
      </div>
      <span className="w-12 text-right tabular-nums">{signed(v)}</span>
    </li>
  );
}

function TraitBar({ label, value, gene, delta }: { label: string; value: number; gene: number; delta: number }) {
  const w = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const g = Math.round(Math.min(1, Math.max(0, gene)) * 100);
  const moved = Math.abs(delta) >= 0.001;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 shrink-0 text-stone-400">{label}</span>
      <div className="relative flex-1 pb-2">
        <div className="h-2 overflow-hidden rounded-full bg-stone-800" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={w}>
          <div className="h-full rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${w}%` }} />
        </div>
        <svg viewBox="0 0 10 6" className="absolute bottom-0 h-1.5 w-2.5 -translate-x-1/2 text-stone-400" style={{ left: `${g}%` }} aria-hidden>
          <polygon points="5,0 10,6 0,6" fill="currentColor" />
        </svg>
      </div>
      <span className={`w-14 shrink-0 text-right tabular-nums ${moved ? (delta > 0 ? "text-emerald-300" : "text-red-300") : "text-stone-600"}`}>
        {moved ? `${delta > 0 ? "↑" : "↓"} ${signed(delta)}` : "—"}
      </span>
    </div>
  );
}
