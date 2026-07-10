"use client";

// La app, con la mínima carga posible: tres destinos (Inicio, Mis decisiones,
// Comunidad) y un botón "+" para anotar. Entrenar se abre desde Inicio y
// "Conectar IA" vive en el menú de perfil — son secundarios, no pestañas.
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { logout, useSession } from "@/components/auth";
import { CaseCard } from "@/components/case-card";
import { CaseForm } from "@/components/case-form";
import { GuidanceView } from "@/components/guidance-view";
import { Logo } from "@/components/logo";
import { MicButton } from "@/components/mic-button";
import { TrainTab } from "@/components/train-tab";
import {
  ArrowLeftIcon,
  BoltIcon,
  CheckIcon,
  ClipboardIcon,
  ClockIcon,
  CopyIcon,
  HomeIcon,
  LogoutIcon,
  PenIcon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
  TargetIcon,
  UsersIcon,
} from "@/components/icons";
import { api } from "@/lib/api";
import type { AiAdvice, AiAnalysis } from "@/lib/ai";
import type { McpTokenInfo } from "@/lib/admin";
import type { DecisionCase, Guidance, TrackRecord } from "@/lib/types";

type Tab = "inicio" | "anotar" | "entrenar" | "mias" | "comunidad" | "ia";

const NAV: Array<{ id: Tab; label: string; short: string; Icon: typeof HomeIcon }> = [
  { id: "inicio", label: "Inicio", short: "Inicio", Icon: HomeIcon },
  { id: "mias", label: "Mis decisiones", short: "Mías", Icon: ClipboardIcon },
  { id: "comunidad", label: "Comunidad", short: "Comunidad", Icon: UsersIcon },
];

export default function AppPage() {
  const router = useRouter();
  const { user, enabled } = useSession();
  const [tab, setTab] = useState<Tab>("inicio");

  useEffect(() => {
    if (enabled && user === null) router.replace("/login");
  }, [enabled, user, router]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

  if (!enabled) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Falta configurar Firebase. Sigue los pasos de <code>web/README.md</code>.
        </p>
      </div>
    );
  }
  if (!user) {
    return <p className="py-16 text-center text-stone-400">Cargando…</p>;
  }

  const name = user.displayName ?? user.email ?? "";
  const initial = (name.trim()[0] ?? "?").toUpperCase();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-stone-200/60 bg-stone-50/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-2 px-4">
          <Logo href="/" />

          <nav className="ml-4 hidden items-center gap-1 sm:flex">
            {NAV.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                aria-current={tab === id ? "page" : undefined}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                  tab === id
                    ? "bg-emerald-100 text-emerald-900"
                    : "text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setTab("anotar")}
              className="hidden items-center gap-1.5 rounded-full bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-800 sm:inline-flex"
            >
              <PlusIcon className="h-4 w-4" />
              Anotar
            </button>
            <ProfileMenu
              name={name}
              initial={initial}
              onConnectAi={() => setTab("ia")}
              onLogout={() => logout().then(() => router.replace("/"))}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-6 pb-32 sm:pb-16">
        {tab === "inicio" ? <HomeTab userName={user.displayName} go={setTab} /> : null}
        {tab === "anotar" ? <AnotarTab onSaved={() => setTab("mias")} /> : null}
        {tab === "entrenar" ? (
          <SubScreen onBack={() => setTab("inicio")}>
            <TrainTab onDone={() => setTab("mias")} />
          </SubScreen>
        ) : null}
        {tab === "mias" ? <MiasTab onAnotar={() => setTab("anotar")} /> : null}
        {tab === "comunidad" ? <ComunidadTab onAnotar={() => setTab("anotar")} /> : null}
        {tab === "ia" ? (
          <SubScreen onBack={() => setTab("inicio")}>
            <ConectarIaTab />
          </SubScreen>
        ) : null}
      </main>

      {/* Botón flotante para anotar — la acción principal, siempre a un toque. */}
      {tab !== "anotar" ? (
        <button
          onClick={() => setTab("anotar")}
          aria-label="Anotar una decisión"
          className="fixed right-4 bottom-20 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-700 text-white shadow-lg shadow-emerald-900/20 transition-transform hover:bg-emerald-800 active:scale-95 sm:hidden"
        >
          <PlusIcon className="h-6 w-6" />
        </button>
      ) : null}

      {/* Navegación inferior en móvil: tres destinos, nada más. */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200/70 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
        <div className="mx-auto grid max-w-2xl grid-cols-3">
          {NAV.map(({ id, short, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-current={tab === id ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ${
                tab === id ? "text-emerald-700" : "text-stone-400"
              }`}
            >
              <Icon className="h-5 w-5" />
              {short}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function ProfileMenu({
  name,
  initial,
  onConnectAi,
  onLogout,
}: {
  name: string;
  initial: string;
  onConnectAi: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Tu cuenta"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800 ring-1 ring-emerald-200 transition-colors hover:bg-emerald-200"
      >
        {initial}
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-stone-200/70 bg-white shadow-lg">
            <p className="truncate border-b border-stone-100 px-4 py-3 text-sm font-medium text-stone-800">
              {name}
            </p>
            <button
              onClick={() => {
                setOpen(false);
                onConnectAi();
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-stone-600 transition-colors hover:bg-stone-50 hover:text-stone-900"
            >
              <BoltIcon className="h-4 w-4 text-stone-400" />
              Conectar mi IA
            </button>
            <button
              onClick={onLogout}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-stone-600 transition-colors hover:bg-stone-50 hover:text-stone-900"
            >
              <LogoutIcon className="h-4 w-4 text-stone-400" />
              Salir
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Pantalla secundaria (Entrenar, Conectar IA): siempre con vuelta a Inicio. */
function SubScreen({
  onBack,
  children,
}: {
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="animate-fade space-y-4">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-500 hover:text-emerald-700"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Inicio
      </button>
      {children}
    </div>
  );
}

// --- Inicio: una pregunta al centro ---

type Scope = "all" | "mine" | "community";

const SCOPES: Array<{ id: Scope; label: string }> = [
  { id: "all", label: "Todo" },
  { id: "mine", label: "Solo lo mío" },
  { id: "community", label: "Solo comunidad" },
];

function HomeTab({
  userName,
  go,
}: {
  userName: string | null;
  go: (t: Tab) => void;
}) {
  const firstName = userName?.trim().split(/\s+/)[0] ?? "";
  const [situation, setSituation] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [guidance, setGuidance] = useState<Guidance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [advice, setAdvice] = useState<AiAdvice | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    api<{ cases: DecisionCase[] }>("/api/cases")
      .then((d) =>
        setPendingCount(
          d.cases.filter((c) => c.outcome.status === "pending").length,
        ),
      )
      .catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setGuidance(null);
    setAnalysis(null);
    setAdvice(null);
    try {
      const body = { situation, scope };
      const g = await api<Guidance>("/api/ask", { method: "POST", body });
      setGuidance(g);
      // Con casos encontrados, la IA los lee y redacta su recomendación.
      // Sin casos (arranque en frío), la IA aconseja con el método criteria.
      // Si la IA falla o no está configurada, la respuesta del motor ya está
      // en pantalla — es un extra, nunca un bloqueo.
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

  const idle = !guidance && !loading;

  return (
    <div className="animate-fade space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          {firstName ? `Hola, ${firstName}` : "Hola"}
        </h1>
        <p className="mt-1 text-stone-500">¿Qué decisión tienes en mente?</p>
      </div>

      <form
        onSubmit={submit}
        className="rounded-2xl border border-stone-200/70 bg-white p-4 shadow-sm sm:p-5"
      >
        <div className="flex items-start gap-2">
          <textarea
            className="min-h-20 w-full resize-none rounded-xl border-0 bg-transparent px-1 py-1 text-base leading-relaxed placeholder:text-stone-400 focus:outline-none"
            rows={3}
            value={situation}
            onChange={(e) => setSituation(e.target.value)}
            placeholder="Ej.: Me ofrecen mudarme a otra ciudad por trabajo, ¿acepto?"
            required
          />
          <MicButton onText={setSituation} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
          <div className="flex gap-1.5">
            {SCOPES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setScope(s.id)}
                aria-pressed={scope === s.id}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  scope === s.id
                    ? "bg-emerald-100 text-emerald-900"
                    : "text-stone-400 hover:bg-stone-100 hover:text-stone-600"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="ml-auto inline-flex items-center gap-2 rounded-full bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:opacity-50"
          >
            <SearchIcon className="h-4 w-4" />
            {loading ? "Buscando…" : "Preguntar"}
          </button>
        </div>
      </form>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {guidance ? (
        <div className="animate-rise rounded-2xl border border-stone-200/70 bg-white p-5 shadow-sm">
          <GuidanceView g={guidance} />
        </div>
      ) : null}

      {analyzing ? (
        <div className="animate-pulse rounded-2xl border border-violet-200/70 bg-violet-50 p-4 text-sm text-violet-700">
          {guidance && guidance.matchedCases.length === 0
            ? "Aún no hay experiencias parecidas — la IA está preparando un consejo…"
            : "La IA está leyendo las experiencias encontradas…"}
        </div>
      ) : null}
      {analysis ? <AnalysisCard a={analysis} /> : null}
      {advice ? <AdviceCard a={advice} onAnotar={() => go("anotar")} /> : null}

      {idle ? (
        <div className="space-y-3">
          {pendingCount > 0 ? (
            <button
              onClick={() => go("mias")}
              className="flex w-full items-center gap-3 rounded-2xl border border-amber-200/70 bg-amber-50 p-4 text-left shadow-sm transition-colors hover:bg-amber-100"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <ClockIcon className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-amber-900">
                  {pendingCount === 1
                    ? "Tienes 1 decisión esperando resultado"
                    : `Tienes ${pendingCount} decisiones esperando resultado`}
                </span>
                <span className="block text-xs text-amber-700">
                  Cuenta cómo salieron — así tu criterio gana peso.
                </span>
              </span>
            </button>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <ShortcutCard
              Icon={PenIcon}
              title="Anotar una decisión"
              body="Cuéntala con tu voz o por escrito; la IA la ordena."
              onClick={() => go("anotar")}
            />
            <ShortcutCard
              Icon={TargetIcon}
              title="Entrenar mi criterio"
              body="Escenarios rápidos sobre el tema que elijas."
              onClick={() => go("entrenar")}
            />
          </div>

          <p className="px-1 text-xs text-stone-400">
            Las respuestas salen de experiencias reales — tuyas y de la
            comunidad. Nada es inventado.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ShortcutCard({
  Icon,
  title,
  body,
  onClick,
}: {
  Icon: typeof PenIcon;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-start gap-3 rounded-2xl border border-stone-200/70 bg-white p-4 text-left shadow-sm transition-all hover:border-emerald-200 hover:shadow-md"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
        <Icon className="h-5 w-5" />
      </span>
      <span>
        <span className="block text-sm font-semibold text-stone-800">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-stone-500">
          {body}
        </span>
      </span>
    </button>
  );
}

/**
 * Consejo de criterio de la IA para el arranque en frío: aplica el método
 * criteria (lentes ponderados, preguntas, sesgos) y se etiqueta como consejo
 * de IA — nunca se disfraza de experiencia humana.
 */
function AdviceCard({ a, onAnotar }: { a: AiAdvice; onAnotar: () => void }) {
  return (
    <section className="animate-rise rounded-2xl border border-violet-200/70 bg-white p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <AiChip />
        <span className="text-xs text-stone-400">sin experiencias reales aún</span>
      </div>

      {a.recommendation ? (
        <p className="leading-snug font-medium text-stone-900">
          {a.recommendation}
        </p>
      ) : null}
      {a.reasoning ? (
        <p className="mt-2 text-sm leading-relaxed text-stone-600">{a.reasoning}</p>
      ) : null}

      {a.lenses.length > 0 ? (
        <div className="mt-4">
          <h4 className="text-xs font-semibold tracking-wide text-violet-700 uppercase">
            Qué conviene pesar
          </h4>
          <ul className="mt-2 space-y-2">
            {a.lenses.map((l) => (
              <li key={l.name} className="text-sm text-stone-700">
                <span className="font-medium">{l.name.replace(/-/g, " ")}</span>
                <span className="ml-1.5 rounded-full bg-violet-50 px-1.5 py-0.5 text-[11px] text-violet-700">
                  {l.weight === "high"
                    ? "pesa mucho"
                    : l.weight === "medium"
                      ? "pesa algo"
                      : "pesa poco"}
                </span>
                <span className="block text-stone-500">{l.why}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {a.questions.length > 0 ? (
        <div className="mt-4">
          <h4 className="text-xs font-semibold tracking-wide text-violet-700 uppercase">
            Respóndete antes de decidir
          </h4>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-stone-700">
            {a.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {a.risks.length > 0 ? (
        <ul className="mt-4 space-y-1">
          {a.risks.map((r, i) => (
            <li key={i} className="text-sm text-red-700">
              ⚠ {r}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 border-t border-stone-100 pt-3">
        <p className="text-xs text-stone-400">
          Consejo general de la IA — todavía nadie registró una experiencia
          real parecida. Cuando decidas, déjala anotada para la próxima persona.
        </p>
        <button
          onClick={onAnotar}
          className="mt-2.5 rounded-full bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-800"
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
    <section className="animate-rise rounded-2xl border border-violet-200/70 bg-white p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <AiChip />
        <span className="text-xs text-stone-400">confianza {a.confidence}</span>
      </div>

      {a.recommendation ? (
        <p className="leading-snug font-medium text-stone-900">
          {a.recommendation}
        </p>
      ) : (
        <p className="text-stone-600">
          Las experiencias registradas no alcanzan para recomendar algo con
          honestidad.
        </p>
      )}
      {a.reasoning ? (
        <p className="mt-2 text-sm leading-relaxed text-stone-600">{a.reasoning}</p>
      ) : null}

      {a.warnings.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {a.warnings.map((w, i) => (
            <li key={i} className="text-sm text-red-700">
              ⚠ {w}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-3 border-t border-stone-100 pt-2.5 text-xs text-stone-400">
        La IA solo resume lo que{" "}
        {a.basedOn.length > 0 ? `${a.basedOn.length} ` : ""}persona(s) reales
        vivieron. La decisión sigue siendo tuya.
      </p>
    </section>
  );
}

function AiChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">
      <SparklesIcon className="h-3.5 w-3.5" />
      Lectura de la IA
    </span>
  );
}

// --- Anotar ---

function AnotarTab({ onSaved }: { onSaved: () => void }) {
  return (
    <div className="animate-fade space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          Anota una decisión
        </h1>
        <p className="mt-1 text-stone-500">
          Tomará menos de un minuto. Es privada hasta que digas lo contrario.
        </p>
      </div>
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
    <div className="animate-fade space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-stone-900">
        Mis decisiones
      </h1>

      {record && record.total > 0 ? (
        <div className="grid grid-cols-4 divide-x divide-stone-100 rounded-2xl border border-stone-200/70 bg-white py-3 shadow-sm">
          <Stat label="Anotadas" value={String(record.total)} />
          <Stat label="Bien" value={String(record.good)} tone="good" />
          <Stat label="Mal" value={String(record.bad)} tone="bad" />
          <Stat
            label="Aciertos"
            value={
              record.reliability !== null
                ? `${Math.round(record.reliability * 100)}%`
                : "—"
            }
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
            className="mt-4 rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-800"
          >
            Anotar mi primera decisión
          </button>
        </div>
      ) : null}

      {pending.length > 0 ? (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-stone-500">
            <ClockIcon className="h-4 w-4" />
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
                          className="w-full rounded-xl border border-stone-200 px-3.5 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none"
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="¿Qué pasó al final? (opcional)"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={saveOutcome}
                            disabled={saving}
                            className="rounded-full bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-800 disabled:opacity-50"
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
          <h2 className="mb-3 text-sm font-semibold text-stone-500">
            Con resultado
          </h2>
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
    <div className="px-2 text-center">
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
      <div className="text-[11px] text-stone-400">{label}</div>
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

  return (
    <div className="animate-fade space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          Comunidad
        </h1>
        <p className="mt-1 text-stone-500">
          Decisiones reales que otras personas compartieron.
        </p>
      </div>

      {cases.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center">
          <UsersIcon className="mx-auto h-8 w-8 text-stone-300" />
          <p className="mt-3 font-medium text-stone-700">
            Todavía no hay experiencias compartidas
          </p>
          <p className="mt-1 text-sm text-stone-500">
            Al anotar una decisión puedes compartirla con tu nombre o en anónimo.
          </p>
          <button
            onClick={onAnotar}
            className="mt-4 rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-800"
          >
            Aportar la primera
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {cases.map((c) => (
            <CaseCard key={c.id} c={c} />
          ))}
        </div>
      )}
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
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          Conecta tu IA
        </h1>
        <p className="mt-1 text-stone-500">
          Para usuarios avanzados: tu asistente consulta tu criterio vía MCP.
        </p>
      </div>

      <section className="rounded-2xl border border-stone-200/70 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm leading-relaxed text-stone-600">
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

      <section className="rounded-2xl border border-stone-200/70 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="text-sm font-semibold text-stone-900">1 · Tu token personal</h3>
        {info === undefined ? (
          <p className="mt-2 text-sm text-stone-400">Cargando…</p>
        ) : (
          <>
            {fresh ? (
              <div className="mt-3 rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-100">
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
                className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:opacity-50"
              >
                {info ? "Regenerar token" : "Generar token"}
              </button>
              {info ? (
                <button
                  onClick={revoke}
                  disabled={busy}
                  className="rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
                >
                  Revocar
                </button>
              ) : null}
            </div>
          </>
        )}
        {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      </section>

      <section className="rounded-2xl border border-stone-200/70 bg-white p-5 shadow-sm sm:p-6">
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
          esta pantalla.
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
