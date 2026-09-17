"use client";

// La mente de una criatura: el último tick paso a paso (qué candidatas vio,
// qué valor les dio su red y cuál eligió, qué dijo y qué oyó), lo que
// aprendió, sus creencias más firmes, sus rasgos frente a sus genes y la
// activación de su capa 2. Todo son números del servidor: aquí solo se pintan.
import type { CriaturaView, EnvInfo } from "@/lib/mascotita/types";
import { SILABAS, TRAIT_LABEL, TRAIT_ORDER, num, signed, zonaNombre } from "./shared";

export function MentePanel({ c, envs }: { c: CriaturaView; envs: EnvInfo[] }) {
  const t = c.ultimoTick;
  return (
    <div className="space-y-3 text-[#1b1b24]">
      <Bloque titulo={t ? `Último tick #${t.seq} en ${zonaNombre(envs, t.env, t.zona)}` : "Último tick"}>
        {!t || t.pasos.length === 0 ? (
          <p className="text-[11px] text-[#5a5a6a]">Todavía no vivió ningún tick.</p>
        ) : (
          <>
            <p className="mb-2 text-[10px] text-[#5a5a6a]">
              temperatura {t.temperatura} · pérdida {t.perdida} · gradiente {t.gradiente}
              {t.oido ? ` · oyó ${t.oido.simbolos.map((k) => SILABAS[k]).join(" ")} de ${t.oido.de.length}` : " · no oyó nada"}
              {t.social ? ` · cobró ${signed(t.social)} por lo que dijo antes` : ""}
            </p>
            <ol className="space-y-2">
              {t.pasos.map((p, i) => (
                <li key={i} className="rounded border-2 border-[#1b1b24] bg-white p-2">
                  <div className="flex flex-wrap items-baseline gap-x-2 text-[11px]">
                    <b>{p.label}</b>
                    <span className="tabular-nums" style={{ color: p.r >= 0 ? "#2c8a5a" : "#d64f4f" }}>
                      {signed(p.r)}
                    </span>
                    {p.simbolo !== null ? <span className="chip">dijo «{SILABAS[p.simbolo]}»</span> : null}
                    <span className="text-[10px] text-[#5a5a6a]">
                      {p.exito ? "salió bien" : "falló"} · predijo éxito {Math.round(p.pExito * 100)} % · sorpresa {p.sorpresa} · retorno {signed(p.g)}
                    </span>
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {[...p.candidatas]
                      .sort((a, b) => b.q - a.q)
                      .map((k, j) => (
                        <QBar key={j} label={k.label} q={k.q} elegida={k.accion === p.accion && k.objetivo === p.objetivo} />
                      ))}
                  </ul>
                </li>
              ))}
            </ol>
            {t.activacion.length ? (
              <div className="mt-2">
                <p className="mb-1 text-[10px] text-[#5a5a6a]">capa 2 (24 neuronas) en el último paso</p>
                <div className="flex gap-0.5">
                  {t.activacion.map((v, i) => (
                    <span
                      key={i}
                      title={v.toFixed(2)}
                      className="h-3 flex-1 border border-[#1b1b24]"
                      style={{ background: v >= 0 ? `rgba(60,163,112,${Math.abs(v)})` : `rgba(214,79,79,${Math.abs(v)})` }}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </Bloque>

      <Bloque titulo={`Creencias (${c.creencias.length} de ≤ 120)`}>
        {c.creencias.length === 0 ? (
          <p className="text-[11px] text-[#5a5a6a]">Aún no cree nada.</p>
        ) : (
          <ul className="space-y-0.5">
            {c.creencias.map((b) => (
              <li key={b.clave} className="flex items-center gap-2 text-[11px]">
                <span className="w-16 shrink-0 text-[#5a5a6a]">{b.verbo}</span>
                <span className="min-w-0 flex-1 truncate">{b.objetivo}</span>
                <span className="w-12 text-right tabular-nums" style={{ color: b.q >= 0 ? "#2c8a5a" : "#d64f4f" }}>
                  {signed(b.q)}
                </span>
                <span className="w-9 text-right text-[#5a5a6a] tabular-nums">{b.n}×</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-[10px] text-[#5a5a6a]">Lo que ella misma vivió con cada (objetivo, verbo). La red lo recibe y decide cuánto fiarse.</p>
      </Bloque>

      <Bloque titulo="Rasgos y genes">
        <div className="space-y-1.5">
          {TRAIT_ORDER.map((k) => (
            <TraitBar key={k} label={TRAIT_LABEL[k]} value={c.rasgos[k]} gene={c.genes.rasgos[k]} delta={c.traitDelta7d[k] ?? 0} />
          ))}
        </div>
        <p className="mt-2 text-[10px] text-[#5a5a6a]">
          Triángulo = cómo nació; flecha = cambio en 7 días. Genes del cerebro: lr {c.genes.lr} · τ {c.genes.tau} · σ {c.genes.sigma} · vida{" "}
          {num(c.genes.vida)}. Red de {num(c.parametros)} parámetros · {c.memorias} memorias.
          {c.padre ? ` Madre: ${c.padre}.` : " Fundadora."}
        </p>
      </Bloque>
    </div>
  );
}

export function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[#5a5a6a]">{titulo}</h4>
      {children}
    </section>
  );
}

function QBar({ label, q, elegida }: { label: string; q: number; elegida: boolean }) {
  const v = Math.max(-1, Math.min(1, q));
  const half = Math.round(Math.abs(v) * 50);
  return (
    <li className="flex items-center gap-2 text-[10px]" style={{ color: elegida ? "#1b1b24" : "#8a8a9a" }}>
      <span className="w-36 shrink-0 truncate sm:w-52">
        {elegida ? "▸ " : ""}
        {label}
      </span>
      <div className="relative h-1.5 flex-1 overflow-hidden border border-[#cfc8b4] bg-[#f6f1dc]">
        <div className="absolute inset-y-0 left-1/2 w-px bg-[#8a8a9a]" />
        <div
          className="absolute inset-y-0"
          style={{
            background: v >= 0 ? (elegida ? "#3ca370" : "#9fd3b8") : elegida ? "#d64f4f" : "#e9a3a3",
            ...(v >= 0 ? { left: "50%", width: `${half}%` } : { right: "50%", width: `${half}%` }),
          }}
        />
      </div>
      <span className="w-11 text-right tabular-nums">{signed(v)}</span>
    </li>
  );
}

function TraitBar({ label, value, gene, delta }: { label: string; value: number; gene: number; delta: number }) {
  const w = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const g = Math.round(Math.min(1, Math.max(0, gene)) * 100);
  const moved = Math.abs(delta) >= 0.001;
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="w-20 shrink-0 text-[#5a5a6a]">{label}</span>
      <div className="relative flex-1 pb-1.5">
        <div className="barra">
          <div style={{ width: `${w}%`, background: "#3ca370" }} />
        </div>
        <svg viewBox="0 0 10 6" className="absolute bottom-0 h-1.5 w-2.5 -translate-x-1/2" style={{ left: `${g}%` }} aria-hidden>
          <polygon points="5,0 10,6 0,6" fill="#1b1b24" />
        </svg>
      </div>
      <span className="w-12 shrink-0 text-right tabular-nums" style={{ color: moved ? (delta > 0 ? "#2c8a5a" : "#d64f4f") : "#8a8a9a" }}>
        {moved ? `${delta > 0 ? "↑" : "↓"} ${signed(delta)}` : "—"}
      </span>
    </div>
  );
}
