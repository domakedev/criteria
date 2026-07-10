"use client";

// La app: preguntar al criterio, anotar decisiones, cerrar ciclos, ver la
// comunidad y conectar tu propia IA vía MCP. Cinco pestañas y nada más.
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { logout, useSession } from "@/components/auth";
import { CaseCard } from "@/components/case-card";
import { CaseForm } from "@/components/case-form";
import { GuidanceView } from "@/components/guidance-view";
import { Logo } from "@/components/logo";
import { MicButton } from "@/components/mic-button";
import {
  BoltIcon,
  CheckIcon,
  ClipboardIcon,
  CopyIcon,
  PenIcon,
  SearchIcon,
  UsersIcon,
} from "@/components/icons";
import { api } from "@/lib/api";
import { DOMAINS } from "@/lib/labels";
import type { AiAdvice, AiAnalysis } from "@/lib/ai";
import type { McpTokenInfo } from "@/lib/admin";
import type { DecisionCase, Guidance, TrackRecord } from "@/lib/types";

type Tab = "preguntar" | "anotar" | "mias" | "comunidad" | "ia";

const TABS: Array<{ id: Tab; label: string; Icon: typeof SearchIcon }> = [
  { id: "preguntar", label: "Preguntar", Icon: SearchIcon },
  { id: "anotar", label: "Anotar", Icon: PenIcon },
  { id: "mias", label: "Mis decisiones", Icon: ClipboardIcon },
  { id: "comunidad", label: "Comunidad", Icon: UsersIcon },
  { id: "ia", label: "Conectar IA", Icon: BoltIcon },
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
          <span className="hidden max-w-40 truncate text-stone-500 sm:inline">
            {user.displayName ?? user.email}
          </span>
          <button
            onClick={() => logout().then(() => router.replace("/"))}
            className="text-stone-500 underline-offset-2 transition-colors hover:text-stone-800 hover:underline"
          >
            Salir
          </button>
        </div>
      }
    >
      <nav className="-mx-4 mb-6 overflow-x-auto px-4">
        <div className="inline-flex gap-1 rounded-2xl bg-white p-1 shadow-sm ring-1 ring-stone-200">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-all ${
                tab === id
                  ? "bg-emerald-700 text-white shadow-sm"
                  : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </nav>

      {tab === "preguntar" ? <AskTab onAnotar={() => setTab("anotar")} /> : null}
      {tab === "anotar" ? <AnotarTab onSaved={() => setTab("mias")} /> : null}
      {tab === "mias" ? <MiasTab onAnotar={() => setTab("anotar")} /> : null}
      {tab === "comunidad" ? <ComunidadTab onAnotar={() => setTab("anotar")} /> : null}
      {tab === "ia" ? <ConectarIaTab /> : null}
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
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-stone-200/70 bg-stone-50/85 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Logo href="/" />
          {right}
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pt-6 pb-24">{children}</main>
    </div>
  );
}

// --- Preguntar ---

type Scope = "all" | "mine" | "community";

const SCOPES: Array<{ id: Scope; label: string }> = [
  { id: "all", label: "Todo" },
  { id: "mine", label: "Solo mis decisiones" },
  { id: "community", label: "Solo la comunidad" },
];

function AskTab({ onAnotar }: { onAnotar: () => void }) {
  const [situation, setSituation] = useState("");
  const [domain, setDomain] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [guidance, setGuidance] = useState<Guidance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [advice, setAdvice] = useState<AiAdvice | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setGuidance(null);
    setAnalysis(null);
    setAdvice(null);
    try {
      const body = { situation, scope, ...(domain ? { domain } : {}) };
      const g = await api<Guidance>("/api/ask", { method: "POST", body });
      setGuidance(g);
      // Con casos encontrados, la IA los lee y redacta su recomendación.
      // Sin casos (arranque en frío), la IA aconseja con el método criteria
      // en vez de dejar al usuario con las manos vacías. Si la IA falla o no
      // está configurada, la respuesta del motor ya está en pantalla — es un
      // extra, nunca un bloqueo.
      setAnalyzing(true);
      try {
        if (g.matchedCases.length > 0) {
          const { analysis: a } = await api<{ analysis: AiAnalysis | null }>(
            "/api/analyze",
            { method: "POST", body },
          );
          setAnalysis(a);
        } else {
          const { advice: c } = await api<{ advice: AiAdvice | null }>(
            "/api/advise",
            { method: "POST", body: { situation } },
          );
          setAdvice(c);
        }
      } catch {
        // silencioso: la guía humana ya se muestra
      } finally {
        setAnalyzing(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Algo salió mal.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade space-y-6">
      <form
        onSubmit={submit}
        className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
      >
        <div className="flex items-center justify-between gap-2">
          <label className="text-base font-semibold text-stone-900">
            ¿Qué decisión enfrentas?
          </label>
          <MicButton onText={setSituation} />
        </div>
        <textarea
          className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm transition-colors focus:border-emerald-600 focus:outline-none"
          rows={3}
          value={situation}
          onChange={(e) => setSituation(e.target.value)}
          placeholder="Ej.: Me ofrecen mudarme a otra ciudad por trabajo, ¿acepto?"
          required
        />

        <div>
          <span className="mb-1.5 block text-xs font-medium tracking-wide text-stone-500 uppercase">
            Buscar en
          </span>
          <div className="flex flex-wrap gap-2">
            {SCOPES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setScope(s.id)}
                aria-pressed={scope === s.id}
                className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                  scope === s.id
                    ? "bg-emerald-700 text-white shadow-sm"
                    : "bg-stone-100 text-stone-700 ring-1 ring-stone-200 hover:bg-stone-200"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            className="rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm"
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
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:opacity-50"
          >
            <SearchIcon className="h-4 w-4" />
            {loading ? "Buscando…" : "Preguntar"}
          </button>
        </div>
      </form>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {guidance ? (
        <div className="animate-rise rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <GuidanceView g={guidance} />
        </div>
      ) : !loading ? (
        <p className="px-1 text-sm text-stone-400">
          La respuesta sale de experiencias reales — tuyas y de la comunidad —
          siempre con su procedencia. Nada es inventado.
        </p>
      ) : null}

      {analyzing ? (
        <div className="animate-pulse rounded-2xl border border-violet-200 bg-violet-50 p-5 text-sm text-violet-700">
          {guidance && guidance.matchedCases.length === 0
            ? "Aún no hay experiencias parecidas — la IA está preparando un consejo de criterio…"
            : "La IA está leyendo las experiencias encontradas…"}
        </div>
      ) : null}
      {analysis ? <AnalysisCard a={analysis} /> : null}
      {advice ? <AdviceCard a={advice} onAnotar={onAnotar} /> : null}
    </div>
  );
}

/**
 * Consejo de criterio de la IA para el arranque en frío: aplica el método
 * criteria (lentes ponderados, preguntas, sesgos) y se etiqueta como consejo
 * de IA — nunca se disfraza de experiencia humana.
 */
function AdviceCard({ a, onAnotar }: { a: AiAdvice; onAnotar: () => void }) {
  return (
    <section className="animate-rise rounded-2xl border border-violet-200 bg-violet-50 p-5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-violet-900">
          Consejo de criterio de la IA
        </h3>
        <span className="rounded-full bg-violet-200 px-2 py-0.5 text-xs font-medium text-violet-800">
          sin experiencias reales aún
        </span>
      </div>

      {a.recommendation ? (
        <p className="text-lg font-medium text-violet-950">{a.recommendation}</p>
      ) : null}
      {a.reasoning ? (
        <p className="mt-2 text-sm text-violet-900">{a.reasoning}</p>
      ) : null}

      {a.lenses.length > 0 ? (
        <div className="mt-4">
          <h4 className="text-xs font-semibold tracking-wide text-violet-800 uppercase">
            Qué conviene pesar
          </h4>
          <ul className="mt-2 space-y-2">
            {a.lenses.map((l) => (
              <li key={l.name} className="text-sm text-violet-950">
                <span className="font-medium">{l.name.replace(/-/g, " ")}</span>
                <span className="ml-1.5 rounded-full bg-violet-200 px-1.5 py-0.5 text-[11px] text-violet-800">
                  {l.weight === "high" ? "pesa mucho" : l.weight === "medium" ? "pesa algo" : "pesa poco"}
                </span>
                <span className="block text-violet-900/80">{l.why}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {a.questions.length > 0 ? (
        <div className="mt-4">
          <h4 className="text-xs font-semibold tracking-wide text-violet-800 uppercase">
            Respóndete antes de decidir
          </h4>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-violet-950">
            {a.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {a.risks.length > 0 ? (
        <ul className="mt-4 space-y-1">
          {a.risks.map((r, i) => (
            <li key={i} className="text-sm text-red-800">
              ⚠ {r}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 border-t border-violet-200 pt-3">
        <p className="text-xs text-violet-700">
          Esto es consejo general de la IA con el método criteria — todavía
          nadie registró una experiencia real parecida. La decisión es tuya, y
          cuando la tomes puedes dejarla anotada para la próxima persona.
        </p>
        <button
          onClick={onAnotar}
          className="mt-2 rounded-xl bg-violet-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-800"
        >
          Anotar mi decisión
        </button>
      </div>
    </section>
  );
}

/** Recomendación de Gemini: síntesis de los casos humanos, nunca juicio propio. */
function AnalysisCard({ a }: { a: AiAnalysis }) {
  return (
    <section className="animate-rise rounded-2xl border border-violet-200 bg-violet-50 p-5">
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
    <div className="animate-fade rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
      <CaseForm onSaved={onSaved} />
    </div>
  );
}

// --- Mis decisiones ---

function MiasTab({ onAnotar }: { onAnotar: () => void }) {
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
    <div className="animate-fade space-y-8">
      {record && record.total > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Decisiones" value={String(record.total)} />
          <Stat label="Salieron bien" value={String(record.good)} tone="good" />
          <Stat label="Salieron mal" value={String(record.bad)} tone="bad" />
          <Stat
            label="Aciertos"
            value={record.reliability !== null ? `${Math.round(record.reliability * 100)}%` : "—"}
          />
        </div>
      ) : null}

      {cases.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center">
          <ClipboardIcon className="mx-auto h-8 w-8 text-stone-300" />
          <p className="mt-3 font-medium text-stone-700">
            Aún no anotas ninguna decisión
          </p>
          <p className="mt-1 text-sm text-stone-500">
            Cuéntala con tus palabras y la IA la ordena — toma menos de un minuto.
          </p>
          <button
            onClick={onAnotar}
            className="mt-4 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-800"
          >
            Anotar mi primera decisión
          </button>
        </div>
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
                showLayer
                footer={
                  <div className="mt-3 border-t border-stone-100 pt-3">
                    {closing?.id === c.id ? (
                      <div className="space-y-2">
                        <input
                          className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="¿Qué pasó al final? (opcional)"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={saveOutcome}
                            disabled={saving}
                            className="rounded-xl bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-800 disabled:opacity-50"
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
                            className={`rounded-full px-3 py-1 font-medium transition-colors ${cls}`}
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
              <CaseCard key={c.id} c={c} showLayer />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm">
      <div
        className={`text-xl font-bold ${
          tone === "good"
            ? "text-emerald-700"
            : tone === "bad"
              ? "text-red-600"
              : "text-stone-900"
        }`}
      >
        {value}
      </div>
      <div className="text-xs text-stone-500">{label}</div>
    </div>
  );
}

// --- Comunidad ---

function ComunidadTab({ onAnotar }: { onAnotar: () => void }) {
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
      <div className="animate-fade rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center">
        <UsersIcon className="mx-auto h-8 w-8 text-stone-300" />
        <p className="mt-3 font-medium text-stone-700">
          Todavía no hay experiencias compartidas
        </p>
        <p className="mt-1 text-sm text-stone-500">
          Al anotar una decisión puedes compartirla con tu nombre o en anónimo.
        </p>
        <button
          onClick={onAnotar}
          className="mt-4 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-800"
        >
          Aportar la primera
        </button>
      </div>
    );
  }
  return (
    <div className="animate-fade space-y-3">
      {cases.map((c) => (
        <CaseCard key={c.id} c={c} />
      ))}
    </div>
  );
}

// --- Conectar IA (MCP) ---

function ConectarIaTab() {
  const [info, setInfo] = useState<McpTokenInfo | null | undefined>(undefined);
  const [fresh, setFresh] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    api<{ token: McpTokenInfo | null }>("/api/tokens")
      .then((d) => setInfo(d.token))
      .catch((err) => {
        setInfo(null);
        setError(err instanceof Error ? err.message : "No se pudo cargar.");
      });
  }, []);

  const generate = async () => {
    setError("");
    setBusy(true);
    try {
      const d = await api<{ token: string; info: McpTokenInfo }>("/api/tokens", {
        method: "POST",
      });
      setFresh(d.token);
      setInfo(d.info);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    setError("");
    setBusy(true);
    try {
      await api("/api/tokens", { method: "DELETE" });
      setInfo(null);
      setFresh("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo revocar.");
    } finally {
      setBusy(false);
    }
  };

  const mcpUrl = `${origin || "https://tu-dominio"}/api/mcp`;
  const tokenShown = fresh || "TU_TOKEN";
  const cliSnippet = `claude mcp add --transport http criteria ${mcpUrl} --header "Authorization: Bearer ${tokenShown}"`;
  const jsonSnippet = JSON.stringify(
    {
      mcpServers: {
        criteria: {
          type: "http",
          url: mcpUrl,
          headers: { Authorization: `Bearer ${tokenShown}` },
        },
      },
    },
    null,
    2,
  );

  return (
    <div className="animate-fade space-y-5">
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold text-stone-900">
          <BoltIcon className="h-5 w-5 text-emerald-700" />
          Conecta tu IA a tu criterio
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-stone-600">
          criteria incluye un servidor <strong>MCP</strong> (Model Context
          Protocol). Conéctalo a Claude — o a cualquier IA compatible — y desde
          tu chat podrá <strong>preguntar a tu criterio</strong> antes de
          aconsejarte, <strong>guardar decisiones</strong> que le cuentes y{" "}
          <strong>revisar tu historial</strong>. Siempre en tu nombre y solo
          con tu token.
        </p>
        <ul className="mt-3 space-y-1.5 text-sm text-stone-600">
          <li className="flex gap-2">
            <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <span><code className="text-emerald-800">ask_criteria</code> — consulta experiencias reales (tuyas, de la comunidad o ambas).</span>
          </li>
          <li className="flex gap-2">
            <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <span><code className="text-emerald-800">save_decision</code> — guarda una decisión conversada en el chat (privada, con nombre o anónima).</span>
          </li>
          <li className="flex gap-2">
            <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <span><code className="text-emerald-800">list_my_decisions</code> — tu historial y cuántas salieron bien.</span>
          </li>
        </ul>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="text-sm font-semibold text-stone-900">1 · Tu token personal</h3>
        {info === undefined ? (
          <p className="mt-2 text-sm text-stone-400">Cargando…</p>
        ) : (
          <>
            {fresh ? (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs font-medium text-emerald-900">
                  Cópialo ahora — no se volverá a mostrar:
                </p>
                <CopyRow value={fresh} mono />
              </div>
            ) : info ? (
              <p className="mt-2 text-sm text-stone-600">
                Tienes un token activo{" "}
                <code className="rounded bg-stone-100 px-1.5 py-0.5 text-xs">{info.prefix}</code>{" "}
                creado el {new Date(info.createdAt).toLocaleDateString("es-PE")}. Si
                lo perdiste, genera uno nuevo (el anterior deja de funcionar).
              </p>
            ) : (
              <p className="mt-2 text-sm text-stone-600">
                Aún no tienes token. Genera uno y trátalo como una contraseña:
                da acceso a tus decisiones.
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={generate}
                disabled={busy}
                className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:opacity-50"
              >
                {info ? "Regenerar token" : "Generar token"}
              </button>
              {info ? (
                <button
                  onClick={revoke}
                  disabled={busy}
                  className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
                >
                  Revocar
                </button>
              ) : null}
            </div>
          </>
        )}
        {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="text-sm font-semibold text-stone-900">2 · Conéctalo</h3>
        <p className="mt-2 text-sm text-stone-600">
          Con <strong>Claude Code</strong>, un solo comando:
        </p>
        <CopyRow value={cliSnippet} mono block />
        <p className="mt-4 text-sm text-stone-600">
          Con <strong>Claude Desktop</strong> u otro cliente MCP, agrega esto a
          su configuración:
        </p>
        <CopyRow value={jsonSnippet} mono block />
        <p className="mt-3 text-xs text-stone-400">
          El token viaja solo por HTTPS y puedes revocarlo cuando quieras desde
          esta pestaña.
        </p>
      </section>
    </div>
  );
}

function CopyRow({
  value,
  mono = false,
  block = false,
}: {
  value: string;
  mono?: boolean;
  block?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // sin permiso de portapapeles: el usuario puede seleccionar el texto
    }
  };
  return (
    <div className="mt-2 flex items-start gap-2">
      <pre
        className={`min-w-0 flex-1 overflow-x-auto rounded-xl bg-stone-900 px-3.5 py-2.5 text-xs leading-relaxed text-stone-100 ${
          mono ? "font-mono" : ""
        } ${block ? "whitespace-pre" : "whitespace-pre-wrap break-all"}`}
      >
        {value}
      </pre>
      <button
        onClick={copy}
        className="mt-1 shrink-0 rounded-lg bg-stone-100 p-2 text-stone-600 ring-1 ring-stone-200 transition-colors hover:bg-stone-200"
        aria-label="Copiar"
        title="Copiar"
      >
        {copied ? (
          <CheckIcon className="h-4 w-4 text-emerald-600" />
        ) : (
          <CopyIcon className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
