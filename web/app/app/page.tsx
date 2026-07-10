"use client";

// La app: preguntar al criterio, anotar decisiones, cerrar ciclos y ver la
// comunidad. Minimalista a propósito — cuatro pestañas y nada más.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { logout, useSession } from "@/components/auth";
import { CaseCard } from "@/components/case-card";
import { CaseForm } from "@/components/case-form";
import { GuidanceView } from "@/components/guidance-view";
import { MicButton } from "@/components/mic-button";
import { api } from "@/lib/api";
import { DOMAINS } from "@/lib/labels";
import type { AiAnalysis } from "@/lib/ai";
import type { DecisionCase, Guidance, TrackRecord } from "@/lib/types";

type Tab = "preguntar" | "anotar" | "mias" | "comunidad";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "preguntar", label: "Preguntar" },
  { id: "anotar", label: "Anotar decisión" },
  { id: "mias", label: "Mis decisiones" },
  { id: "comunidad", label: "Comunidad" },
];

export default function AppPage() {
  const router = useRouter();
  const { user, enabled } = useSession();
  const [tab, setTab] = useState<Tab>("preguntar");

  useEffect(() => {
    if (enabled && user === null) router.replace("/login");
  }, [enabled, user, router]);

  if (!enabled) {
    return (
      <Shell>
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Falta configurar Firebase. Sigue los pasos de <code>web/README.md</code>.
        </p>
      </Shell>
    );
  }
  if (!user) {
    return (
      <Shell>
        <p className="py-12 text-center text-stone-400">Cargando…</p>
      </Shell>
    );
  }

  return (
    <Shell
      right={
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-stone-500 sm:inline">
            {user.displayName ?? user.email}
          </span>
          <button
            onClick={() => logout().then(() => router.replace("/"))}
            className="text-stone-500 underline-offset-2 hover:text-stone-800 hover:underline"
          >
            Salir
          </button>
        </div>
      }
    >
      <nav className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-emerald-700 text-white"
                : "bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "preguntar" ? <AskTab /> : null}
      {tab === "anotar" ? (
        <AnotarTab onSaved={() => setTab("mias")} />
      ) : null}
      {tab === "mias" ? <MiasTab /> : null}
      {tab === "comunidad" ? <ComunidadTab /> : null}
    </Shell>
  );
}

function Shell({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-16">
      <header className="flex items-center justify-between py-5">
        <Link href="/" className="text-lg font-bold tracking-tight text-emerald-900">
          criteria
        </Link>
        {right}
      </header>
      {children}
    </main>
  );
}

// --- Preguntar ---

function AskTab() {
  const [situation, setSituation] = useState("");
  const [domain, setDomain] = useState("");
  const [guidance, setGuidance] = useState<Guidance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setGuidance(null);
    setAnalysis(null);
    try {
      const g = await api<Guidance>("/api/ask", {
        method: "POST",
        body: { situation, ...(domain ? { domain } : {}) },
      });
      setGuidance(g);
      // Con casos encontrados, la IA los lee y redacta su recomendación.
      // Si falla o no está configurada, la respuesta del motor ya está en
      // pantalla — el análisis es un extra, nunca un bloqueo.
      if (g.matchedCases.length > 0) {
        setAnalyzing(true);
        try {
          const { analysis: a } = await api<{ analysis: AiAnalysis | null }>(
            "/api/analyze",
            { method: "POST", body: { situation, ...(domain ? { domain } : {}) } },
          );
          setAnalysis(a);
        } catch {
          // silencioso: la guía humana ya se muestra
        } finally {
          setAnalyzing(false);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Algo salió mal.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <label className="text-sm font-medium text-stone-800">
            ¿Qué decisión enfrentas?
          </label>
          <MicButton onText={setSituation} />
        </div>
        <textarea
          className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
          rows={3}
          value={situation}
          onChange={(e) => setSituation(e.target.value)}
          placeholder="Ej.: Me ofrecen mudarme a otra ciudad por trabajo, ¿acepto?"
          required
        />
        <div className="flex flex-wrap items-center gap-3">
          <select
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
          >
            <option value="">Todos los temas</option>
            {DOMAINS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-emerald-700 px-5 py-2 font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {loading ? "Buscando…" : "Preguntar"}
          </button>
        </div>
      </form>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {guidance ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <GuidanceView g={guidance} />
        </div>
      ) : (
        <p className="text-sm text-stone-400">
          La respuesta sale de experiencias reales — tuyas y de la comunidad —
          siempre con su procedencia. Nada es inventado.
        </p>
      )}

      {analyzing ? (
        <p className="animate-pulse text-sm text-violet-700">
          La IA está leyendo las experiencias encontradas…
        </p>
      ) : null}
      {analysis ? <AnalysisCard a={analysis} /> : null}
    </div>
  );
}

/** Recomendación de Gemini: síntesis de los casos humanos, nunca juicio propio. */
function AnalysisCard({ a }: { a: AiAnalysis }) {
  return (
    <section className="rounded-2xl border border-violet-200 bg-violet-50 p-5">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-violet-900">
          Lectura de la IA sobre estas experiencias
        </h3>
        <span className="rounded-full bg-violet-200 px-2 py-0.5 text-xs font-medium text-violet-800">
          confianza {a.confidence}
        </span>
      </div>

      {a.recommendation ? (
        <p className="text-lg font-medium text-violet-950">{a.recommendation}</p>
      ) : (
        <p className="text-violet-900">
          Las experiencias registradas no alcanzan para recomendar algo con
          honestidad.
        </p>
      )}
      {a.reasoning ? (
        <p className="mt-2 text-sm text-violet-900">{a.reasoning}</p>
      ) : null}

      {a.warnings.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {a.warnings.map((w, i) => (
            <li key={i} className="text-sm text-red-800">
              ⚠ {w}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-3 border-t border-violet-200 pt-2 text-xs text-violet-700">
        La IA solo resume lo que {a.basedOn.length > 0 ? `${a.basedOn.length} ` : ""}
        persona(s) reales vivieron — no sabe más que ellas. La decisión sigue
        siendo tuya.
      </p>
    </section>
  );
}

// --- Anotar ---

function AnotarTab({ onSaved }: { onSaved: () => void }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <CaseForm onSaved={onSaved} />
    </div>
  );
}

// --- Mis decisiones ---

function MiasTab() {
  const [cases, setCases] = useState<DecisionCase[] | null>(null);
  const [record, setRecord] = useState<TrackRecord | null>(null);
  const [error, setError] = useState("");
  const [closing, setClosing] = useState<{ id: string; status: "good" | "bad" | "mixed" } | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ cases: DecisionCase[]; record: TrackRecord }>(
        "/api/cases",
      );
      setCases(data.cases);
      setRecord(data.record);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveOutcome = async () => {
    if (!closing) return;
    setSaving(true);
    try {
      await api(`/api/cases/${closing.id}/outcome`, {
        method: "POST",
        body: { status: closing.status, note },
      });
      setClosing(null);
      setNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!cases) return <p className="py-8 text-center text-stone-400">Cargando…</p>;

  const pending = cases.filter((c) => c.outcome.status === "pending");
  const resolved = cases.filter((c) => c.outcome.status !== "pending");

  return (
    <div className="space-y-8">
      {record && record.total > 0 ? (
        <div className="flex flex-wrap gap-3">
          <Stat label="Decisiones" value={String(record.total)} />
          <Stat label="Salieron bien" value={String(record.good)} />
          <Stat label="Salieron mal" value={String(record.bad)} />
          <Stat
            label="Aciertos"
            value={record.reliability !== null ? `${Math.round(record.reliability * 100)}%` : "—"}
          />
        </div>
      ) : null}

      {cases.length === 0 ? (
        <p className="rounded-xl border border-stone-200 bg-white p-5 text-sm text-stone-500">
          Aún no anotas ninguna decisión. Empieza en la pestaña{" "}
          <strong>Anotar decisión</strong> — toma menos de un minuto.
        </p>
      ) : null}

      {pending.length > 0 ? (
        <section>
          <h2 className="mb-3 font-semibold text-stone-800">
            Esperando resultado ({pending.length})
          </h2>
          <div className="space-y-3">
            {pending.map((c) => (
              <CaseCard
                key={c.id}
                c={c}
                footer={
                  <div className="mt-3 border-t border-stone-100 pt-3">
                    {closing?.id === c.id ? (
                      <div className="space-y-2">
                        <input
                          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="¿Qué pasó al final? (opcional)"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={saveOutcome}
                            disabled={saving}
                            className="rounded-lg bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                          >
                            Guardar
                          </button>
                          <button
                            onClick={() => setClosing(null)}
                            className="text-sm text-stone-500 hover:text-stone-800"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-stone-500">¿Cómo salió?</span>
                        {(
                          [
                            ["good", "Bien", "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"],
                            ["mixed", "Más o menos", "bg-amber-100 text-amber-800 hover:bg-amber-200"],
                            ["bad", "Mal", "bg-red-100 text-red-700 hover:bg-red-200"],
                          ] as Array<["good" | "mixed" | "bad", string, string]>
                        ).map(([status, label, cls]) => (
                          <button
                            key={status}
                            onClick={() => setClosing({ id: c.id, status })}
                            className={`rounded-full px-3 py-1 font-medium ${cls}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                }
              />
            ))}
          </div>
        </section>
      ) : null}

      {resolved.length > 0 ? (
        <section>
          <h2 className="mb-3 font-semibold text-stone-800">Con resultado</h2>
          <div className="space-y-3">
            {resolved.map((c) => (
              <CaseCard key={c.id} c={c} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white px-4 py-2.5">
      <div className="text-lg font-bold text-stone-900">{value}</div>
      <div className="text-xs text-stone-500">{label}</div>
    </div>
  );
}

// --- Comunidad ---

function ComunidadTab() {
  const [cases, setCases] = useState<DecisionCase[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ cases: DecisionCase[] }>("/api/community")
      .then((d) => setCases(d.cases))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "No se pudo cargar."),
      );
  }, []);

  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!cases) return <p className="py-8 text-center text-stone-400">Cargando…</p>;
  if (cases.length === 0) {
    return (
      <p className="rounded-xl border border-stone-200 bg-white p-5 text-sm text-stone-500">
        Todavía no hay experiencias compartidas. Al anotar una decisión, marca{" "}
        <strong>“Compartir con la comunidad”</strong> para aportar la primera.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {cases.map((c) => (
        <CaseCard key={c.id} c={c} />
      ))}
    </div>
  );
}
