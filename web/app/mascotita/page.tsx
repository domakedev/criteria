"use client";

// La mascotita: una criatura que vive en el repositorio (o en mundos
// imaginados), aprende solo de lo que vive y te cuenta qué hizo mientras no
// estabas. Esta página pinta su estado, dispara las exploraciones atrasadas
// al abrirse y ofrece cinco pestañas: charlar, enseñar, lo que sabe, diario
// y personalidad. Todo el conocimiento llega ya calculado del servidor.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { logout, useSession } from "@/components/auth";
import { ArrowLeftIcon, BoltIcon, LockIcon, LogoutIcon } from "@/components/icons";
import { Logo } from "@/components/logo";
import { Avatar } from "@/components/mascotita/avatar";
import { ChatPanel } from "@/components/mascotita/chat-panel";
import { DiaryEntry, DiaryPanel } from "@/components/mascotita/diary-panel";
import { EnvPicker } from "@/components/mascotita/env-picker";
import { KnowledgePanel } from "@/components/mascotita/knowledge-panel";
import { PetCard } from "@/components/mascotita/pet-card";
import { ReportCard } from "@/components/mascotita/report-card";
import { PetApiError, STAGE_LABEL, errorMessage, mmss, petApi } from "@/components/mascotita/shared";
import { TeachPanel } from "@/components/mascotita/teach-panel";
import { TraitsPanel } from "@/components/mascotita/traits-panel";
import { api } from "@/lib/api";
import type { DiaryEntryView, PetView, StateResponse, TickResult } from "@/lib/mascotita/types";

type Tab = "charlar" | "ensenar" | "sabe" | "diario" | "personalidad";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "charlar", label: "Charlar" },
  { id: "ensenar", label: "Enseñar" },
  { id: "sabe", label: "Lo que sabe" },
  { id: "diario", label: "Diario" },
  { id: "personalidad", label: "Personalidad" },
];

type Status = "loading" | "forbidden" | "error" | "ready";

/** Entre dos ticks seguidos: la ruta frena a 1 por 5 s por usuario. */
const TICK_GAP_MS = 5_200;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function tickEntries(r: TickResult): DiaryEntryView[] {
  return [...(r.entry ? [r.entry] : []), ...r.extraEntries];
}

/** Segundos que faltan para `until` (0 si no hay o ya pasó), refrescado cada segundo. */
function useCountdown(until: string | null): number {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!until) {
      setLeft(0);
      return;
    }
    const target = Date.parse(until);
    const update = () => setLeft(Math.max(0, Math.ceil((target - Date.now()) / 1000)));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [until]);
  return left;
}

export default function MascotitaPage() {
  const router = useRouter();
  const { user, enabled } = useSession();

  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<StateResponse | null>(null);
  const [loadError, setLoadError] = useState("");
  const [showReport, setShowReport] = useState(false);
  const [tab, setTab] = useState<Tab>("charlar");
  const [visited, setVisited] = useState<Tab[]>(["charlar"]);
  /** exploraciones atrasadas en curso */
  const [catchup, setCatchup] = useState<{ total: number; done: number; entries: DiaryEntryView[] } | null>(null);
  /** entradas recién escritas con "Explorar ahora" (la más nueva primero) */
  const [fresh, setFresh] = useState<DiaryEntryView[]>([]);
  const [exploring, setExploring] = useState(false);
  const [exploreMsg, setExploreMsg] = useState("");
  const [retryAt, setRetryAt] = useState<string | null>(null);
  /** sube tras cada tick para que los paneles vuelvan a pedir sus datos */
  const [refreshKey, setRefreshKey] = useState(0);
  const catchupRan = useRef(false);

  useEffect(() => {
    if (enabled && user === null) router.replace("/login");
  }, [enabled, user, router]);

  /**
   * Carga el estado. `revealReport` decide si un informe pendiente se
   * muestra (al abrir y tras las atrasadas) o se respeta que ya lo cerraste
   * (recarga suave tras un tick manual o una charla).
   */
  const load = useCallback(async (opts: { initial?: boolean; revealReport?: boolean } = {}) => {
    if (opts.initial) setStatus("loading");
    try {
      const s = await petApi<StateResponse>("/api/mascotita/state");
      setData(s);
      setRetryAt(s.caps.manualReadyAt);
      if (opts.initial || opts.revealReport) setShowReport(s.report !== null);
      setStatus("ready");
    } catch (err) {
      if (err instanceof PetApiError && err.status === 403) {
        setStatus("forbidden");
        return;
      }
      if (opts.initial) {
        setLoadError(errorMessage(err, "No se pudo cargar."));
        setStatus("error");
      } else {
        setExploreMsg(errorMessage(err, "No se pudo actualizar."));
      }
    }
  }, []);

  useEffect(() => {
    if (user) load({ initial: true });
  }, [user, load]);

  const setPet = useCallback((pet: PetView) => {
    setData((d) => (d ? { ...d, pet } : d));
  }, []);

  const spend = useCallback((key: "chatsLeft" | "teachLeft") => {
    setData((d) => (d ? { ...d, caps: { ...d.caps, [key]: Math.max(0, d.caps[key] - 1) } } : d));
  }, []);

  // Exploraciones atrasadas: una tras otra (nunca en paralelo: hay un solo
  // candado por mascota), pintando cada entrada al llegar. 409/429 paran sin
  // ruido; al final se recarga todo y aparece el informe.
  const runCatchup = useCallback(
    async (n: number) => {
      setCatchup({ total: n, done: 0, entries: [] });
      for (let i = 0; i < n; i++) {
        const started = Date.now();
        try {
          const { result } = await petApi<{ result: TickResult }>("/api/mascotita/tick", {
            method: "POST",
            body: { reason: "catchup" },
          });
          const entries = tickEntries(result);
          setCatchup((c) => (c ? { ...c, done: c.done + 1, entries: [...c.entries, ...entries] } : c));
          if (result.pet) setPet(result.pet);
        } catch (err) {
          if (err instanceof PetApiError && (err.status === 409 || err.status === 429)) break;
          setExploreMsg(errorMessage(err, "Una exploración no salió; sigue con lo demás."));
          break;
        }
        if (i < n - 1) {
          const wait = TICK_GAP_MS - (Date.now() - started);
          if (wait > 0) await sleep(wait);
        }
      }
      setRefreshKey((k) => k + 1);
      await load({ revealReport: true });
      setCatchup(null);
    },
    [load, setPet],
  );

  useEffect(() => {
    if (status !== "ready" || !data?.pet || data.owed <= 0 || catchupRan.current) return;
    catchupRan.current = true;
    runCatchup(data.owed);
  }, [status, data, runCatchup]);

  const explore = async () => {
    if (exploring || catchup) return;
    setExploreMsg("");
    setExploring(true);
    try {
      const { result } = await petApi<{ result: TickResult }>("/api/mascotita/tick", {
        method: "POST",
        body: { reason: "manual" },
      });
      setFresh((f) => [...tickEntries(result), ...f]);
      if (result.pet) setPet(result.pet);
      setRefreshKey((k) => k + 1);
      await load();
    } catch (err) {
      if (err instanceof PetApiError && (err.status === 429 || err.status === 409)) {
        if (err.result?.skipped === "cap") {
          setExploreMsg("Hoy ya exploró suficiente, mañana sigue.");
        } else if (err.retryAt) {
          setRetryAt(err.retryAt);
        } else {
          setExploreMsg(err.message);
        }
      } else {
        setExploreMsg(errorMessage(err, "No pudo explorar. Intenta de nuevo."));
      }
    } finally {
      setExploring(false);
    }
  };

  const go = (t: Tab) => {
    setTab(t);
    setVisited((v) => (v.includes(t) ? v : [...v, t]));
  };

  const secondsLeft = useCountdown(retryAt);

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

  const pet = data?.pet ?? null;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-stone-200/60 bg-stone-50/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
          <Logo href="/app" />
          {pet ? (
            <div className="flex min-w-0 items-center gap-2 border-l border-stone-200 pl-3">
              <span className="truncate font-semibold text-stone-900">{pet.name}</span>
              <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-900">
                {STAGE_LABEL[pet.stage]}
              </span>
            </div>
          ) : null}
          <button
            onClick={() => logout().then(() => router.replace("/"))}
            aria-label="Salir"
            title="Salir"
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-800"
          >
            <LogoutIcon className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 pt-5 pb-24">
        {status === "loading" ? <p className="py-16 text-center text-stone-400">Cargando…</p> : null}

        {status === "forbidden" ? <Forbidden /> : null}

        {status === "error" ? (
          <div className="rounded-2xl border border-stone-200/70 bg-white p-6 text-center shadow-sm">
            <p className="text-sm text-red-700">{loadError}</p>
            <button
              onClick={() => load({ initial: true })}
              className="mt-3 rounded-full bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
            >
              Reintentar
            </button>
          </div>
        ) : null}

        {status === "ready" && data && !pet ? (
          <EggScreen names={data.names} onHatched={() => load({ initial: true })} />
        ) : null}

        {status === "ready" && data && pet ? (
          <>
            <PetCard pet={pet} envs={data.envs} />

            {catchup ? (
              <section className="animate-fade rounded-2xl border border-violet-200/70 bg-violet-50 p-4 text-sm text-violet-900">
                <p className="flex items-center gap-2 font-medium">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-violet-500" />
                  {pet.stage === "huevo" && catchup.done === 0
                    ? "Está por salir del huevo…"
                    : catchup.total === 1
                      ? "Tiene 1 exploración atrasada… despertando"
                      : `Tiene ${catchup.total} exploraciones atrasadas… despertando (${catchup.done}/${catchup.total})`}
                </p>
                {catchup.entries.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs text-violet-800">
                    {catchup.entries.map((e) => (
                      <li key={e.id} className="animate-rise">
                        · {e.title}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ) : null}

            {showReport && data.report ? (
              <ReportCard report={data.report} envs={data.envs} onSeen={() => setShowReport(false)} />
            ) : null}

            <section className="rounded-2xl border border-stone-200/70 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={explore}
                  disabled={exploring || catchup !== null || pet.busy || secondsLeft > 0 || data.caps.ticksLeft <= 0}
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:opacity-50"
                >
                  <BoltIcon className="h-4 w-4" />
                  {exploring
                    ? "Explorando…"
                    : catchup || pet.busy
                      ? "Está explorando…"
                      : data.caps.ticksLeft <= 0 || secondsLeft > 3600
                        ? "Hoy ya exploró suficiente"
                        : secondsLeft > 0
                          ? `Puede volver en ${mmss(secondsLeft)}`
                          : "Explorar ahora"}
                </button>
                <span className="text-xs text-stone-400 tabular-nums">
                  {data.caps.ticksLeft <= 0 || secondsLeft > 3600
                    ? "Mañana sigue."
                    : data.caps.ticksLeft === 1
                      ? "1 exploración más hoy"
                      : `${data.caps.ticksLeft} exploraciones más hoy`}
                </span>
              </div>
              {exploring ? (
                <p className="mt-2 animate-pulse text-xs text-violet-700">
                  Está mirando, probando y anotando… tarda hasta un minuto.
                </p>
              ) : null}
              {exploreMsg ? <p className="mt-2 text-xs text-red-700">{exploreMsg}</p> : null}

              <div className="mt-4 border-t border-stone-100 pt-3">
                <EnvPicker envs={data.envs} pet={pet} disabled={exploring || catchup !== null} onMove={setPet} />
              </div>
            </section>

            {fresh.length > 0 ? (
              <section className="space-y-2">
                <h2 className="text-xs font-semibold text-stone-500">Recién explorado</h2>
                {fresh.map((e) => (
                  <DiaryEntry key={e.id} entry={e} envs={data.envs} highlight />
                ))}
              </section>
            ) : null}

            <nav className="flex gap-1 overflow-x-auto pb-1" aria-label="Secciones">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => go(t.id)}
                  aria-current={tab === t.id ? "page" : undefined}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                    tab === t.id
                      ? "bg-emerald-100 text-emerald-900"
                      : "text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </nav>

            {/* Los paneles se montan la primera vez que los abres y se quedan
                montados: la charla no pierde sus burbujas al cambiar de pestaña. */}
            <div hidden={tab !== "charlar"}>
              <ChatPanel
                initial={data.chat}
                chatsLeft={data.caps.chatsLeft}
                pendingQuestion={pet.pendingQuestion}
                onPet={setPet}
                onTeach={() => go("ensenar")}
                onSpent={() => spend("chatsLeft")}
              />
            </div>
            {visited.includes("ensenar") ? (
              <div hidden={tab !== "ensenar"}>
                <TeachPanel teachLeft={data.caps.teachLeft} onPet={setPet} onSpent={() => spend("teachLeft")} />
              </div>
            ) : null}
            {visited.includes("sabe") ? (
              <div hidden={tab !== "sabe"}>
                <KnowledgePanel initial={data.knowledge} refreshKey={refreshKey} />
              </div>
            ) : null}
            {visited.includes("diario") ? (
              <div hidden={tab !== "diario"}>
                <DiaryPanel initial={data.diary} envs={data.envs} refreshKey={refreshKey} />
              </div>
            ) : null}
            {visited.includes("personalidad") ? (
              <div hidden={tab !== "personalidad"}>
                <TraitsPanel
                  pet={pet}
                  envs={data.envs}
                  onReset={() => {
                    catchupRan.current = false;
                    setFresh([]);
                    setTab("charlar");
                    setVisited(["charlar"]);
                    load({ initial: true });
                  }}
                />
              </div>
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  );
}

function Forbidden() {
  return (
    <div className="animate-fade rounded-2xl border border-stone-200/70 bg-white p-8 text-center shadow-sm">
      <LockIcon className="mx-auto h-8 w-8 text-stone-300" />
      <p className="mt-3 font-medium text-stone-800">Esta puerta es solo para su dueño.</p>
      <p className="mt-1 text-sm text-stone-500">La mascotita vive con quien la cuida. Tu cuenta no está en esa lista.</p>
      <Link
        href="/app"
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-900"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Volver a criteria
      </Link>
    </div>
  );
}

/** Sin mascota: el huevo, tres nombres sugeridos y el tuyo. */
function EggScreen({ names, onHatched }: { names: string[]; onHatched: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const hatch = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n || busy) return;
    setError("");
    setBusy(true);
    try {
      await api<{ pet: PetView }>("/api/mascotita/hatch", { method: "POST", body: { name: n } });
      onHatched();
    } catch (err) {
      setError(errorMessage(err, "No pudo nacer. Intenta de nuevo."));
      setBusy(false);
    }
  };

  return (
    <section className="animate-rise rounded-2xl border border-stone-200/70 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col items-center text-center">
        <Avatar pet={null} size={160} className="border border-stone-100" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-stone-900">Un huevo te espera</h1>
        <p className="mt-1 max-w-sm text-stone-500">
          Va a aprender solo de lo que viva. Al principio no sabe nada.
        </p>
      </div>

      <form onSubmit={hatch} className="mt-5">
        <label htmlFor="mz-name" className="block text-sm font-medium text-stone-800">
          ¿Cómo se va a llamar?
        </label>
        {names.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {names.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setName(n)}
                aria-pressed={name === n}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  name === n
                    ? "bg-emerald-100 text-emerald-900"
                    : "bg-stone-100 text-stone-600 hover:bg-emerald-50 hover:text-emerald-800"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        ) : null}
        <div className="mt-2 flex gap-2">
          <input
            id="mz-name"
            className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm shadow-sm focus:border-emerald-500 focus:outline-none"
            value={name}
            onChange={(e) => setName(e.target.value.replace(/\s+/g, " ").slice(0, 30))}
            placeholder="Escribe un nombre o elige uno"
            maxLength={30}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="shrink-0 rounded-full bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:opacity-50"
          >
            {busy ? "Naciendo…" : "Que nazca"}
          </button>
        </div>
        {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      </form>
    </section>
  );
}
