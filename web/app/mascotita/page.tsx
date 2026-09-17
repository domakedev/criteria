"use client";

// La colonia (vista provisional de las fases 1-5; el terrario llega en la 6):
// estado del latido, la criatura viva con su mente, la crónica del día y los
// límites. Al abrirse, si el último latido está atrasado, dispara uno
// (catch-up) — el respaldo del latido programado.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { logout, useSession } from "@/components/auth";
import { ArrowLeftIcon, LockIcon, LogoutIcon } from "@/components/icons";
import { CriaturaCard } from "@/components/mascotita/criatura-card";
import { CronicaPanel } from "@/components/mascotita/cronica-panel";
import { LimitesPanel } from "@/components/mascotita/limites-panel";
import { Card, MentePanel } from "@/components/mascotita/mente-panel";
import { PetApiError, ago, errorMessage, petApi } from "@/components/mascotita/shared";
import type { LatidoResult, MundoView } from "@/lib/mascotita/types";

type Tab = "mente" | "cronica" | "limites";
type Status = "loading" | "forbidden" | "error" | "ready";

const REFRESH_MS = 30_000;

export default function ColoniaPage() {
  const router = useRouter();
  const { user, enabled } = useSession();
  const [status, setStatus] = useState<Status>("loading");
  const [m, setM] = useState<MundoView | null>(null);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState<Tab>("mente");
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState<"latir" | "fundar" | "borrar" | null>(null);
  const [msg, setMsg] = useState("");
  const [confirm, setConfirm] = useState("");
  const catchupRan = useRef(false);

  useEffect(() => {
    if (enabled && user === null) router.replace("/login");
  }, [enabled, user, router]);

  const load = useCallback(async (initial = false) => {
    if (initial) setStatus("loading");
    try {
      const v = await petApi<MundoView>("/api/mascotita/mundo");
      setM(v);
      setStatus("ready");
    } catch (err) {
      if (err instanceof PetApiError && err.status === 403) {
        setStatus("forbidden");
        return;
      }
      if (initial) {
        setLoadError(errorMessage(err, "No se pudo cargar."));
        setStatus("error");
      } else {
        setMsg(errorMessage(err, "No se pudo actualizar."));
      }
    }
  }, []);

  useEffect(() => {
    if (user) load(true);
  }, [user, load]);

  // refresco periódico (1 lectura del mundo + las vivas)
  useEffect(() => {
    if (status !== "ready") return;
    const id = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(id);
  }, [status, load]);

  const latir = useCallback(
    async (reason: "manual" | "catchup") => {
      setBusy("latir");
      setMsg("");
      try {
        const { result } = await petApi<{ result: LatidoResult }>("/api/mascotita/latido", {
          method: "POST",
          body: { reason },
        });
        setMsg(
          `Latido #${result.seq}: ${result.procesadas.length} criatura${result.procesadas.length === 1 ? "" : "s"} en ${result.ms} ms` +
            (result.saltadas.length ? ` · ${result.saltadas.length} saltadas` : ""),
        );
      } catch (err) {
        setMsg(errorMessage(err));
      } finally {
        setBusy(null);
        await load();
      }
    },
    [load],
  );

  // catch-up: una vez por carga, si el latido programado no llegó
  useEffect(() => {
    if (status !== "ready" || !m?.atrasado || catchupRan.current) return;
    catchupRan.current = true;
    void latir("catchup");
  }, [status, m, latir]);

  const fundar = async () => {
    setBusy("fundar");
    setMsg("");
    try {
      await petApi("/api/mascotita/fundar", { method: "POST", body: {} });
      catchupRan.current = false;
    } catch (err) {
      setMsg(errorMessage(err));
    } finally {
      setBusy(null);
      await load();
    }
  };

  const borrar = async () => {
    if (confirm !== "BORRAR") return;
    setBusy("borrar");
    try {
      await petApi("/api/mascotita", { method: "DELETE", body: { confirm } });
      setConfirm("");
      setSel(null);
    } catch (err) {
      setMsg(errorMessage(err));
    } finally {
      setBusy(null);
      await load();
    }
  };

  if (!enabled || user === undefined || status === "loading") {
    return <Shell>{null}</Shell>;
  }
  if (status === "forbidden") {
    return (
      <Shell>
        <div className="mx-auto max-w-md rounded-2xl border border-stone-800 bg-stone-900/70 p-6 text-center">
          <LockIcon className="mx-auto h-8 w-8 text-stone-500" />
          <p className="mt-3 text-stone-200">Esta puerta es solo para los dioses de la colonia.</p>
          <p className="mt-1 text-xs text-stone-500">Tu cuenta no está en la lista de dueños.</p>
        </div>
      </Shell>
    );
  }
  if (status === "error" || !m) {
    return (
      <Shell>
        <div className="mx-auto max-w-md rounded-2xl border border-red-900/60 bg-red-950/30 p-6 text-center text-sm text-red-200">
          {loadError || "No se pudo cargar."}
          <button onClick={() => load(true)} className="mt-3 block w-full rounded-lg bg-stone-800 px-3 py-2 text-stone-100">
            Reintentar
          </button>
        </div>
      </Shell>
    );
  }

  const vivas = m.criaturas;
  const actual = vivas.find((c) => c.cid === sel) ?? vivas[0] ?? null;

  return (
    <Shell>
      <header className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-stone-400">
        <span>
          Latido <span className="text-stone-200 tabular-nums">#{m.latido.seq}</span>{" "}
          {m.latido.lastAt ? `· último ${ago(m.latido.lastAt)}` : "· nunca"}
          {m.latido.ocupado ? <span className="ml-2 animate-pulse text-violet-300">latiendo…</span> : null}
          {m.atrasado ? <span className="ml-2 text-amber-300">atrasado</span> : null}
        </span>
        <span>
          Vivas <span className="text-stone-200 tabular-nums">{m.poblacion.vivas}</span> / {m.limites.maxVivas}
        </span>
        <span>
          Escrituras hoy <span className="text-stone-200 tabular-nums">{m.dia.escrituras}</span> / {m.limites.escriturasDia}
        </span>
        <div className="ml-auto flex gap-2">
          {vivas.length > 0 ? (
            <button
              onClick={() => latir("manual")}
              disabled={busy !== null || m.latido.ocupado}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {busy === "latir" ? "Latiendo…" : "Latir ahora"}
            </button>
          ) : null}
        </div>
      </header>

      {msg ? <p className="mb-4 rounded-lg border border-stone-800 bg-stone-900/70 px-3 py-2 text-xs text-stone-300">{msg}</p> : null}

      {vivas.length === 0 ? (
        <div className="mx-auto max-w-md rounded-2xl border border-stone-800 bg-stone-900/70 p-6 text-center">
          <p className="text-lg font-semibold text-stone-100">{m.hay ? "La colonia se extinguió." : "No hay colonia todavía."}</p>
          <p className="mt-2 text-sm text-stone-400">
            Nace una fundadora en un lugar al azar, con genes al centro y un cerebro recién sorteado. De ahí en adelante, todo lo que
            sepa lo aprende sola.
          </p>
          <button
            onClick={fundar}
            disabled={busy !== null}
            className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy === "fundar" ? "Naciendo…" : "Fundar la colonia"}
          </button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            {vivas.length > 1 ? (
              <div className="flex flex-wrap gap-1.5">
                {vivas.map((c) => (
                  <button
                    key={c.cid}
                    onClick={() => setSel(c.cid)}
                    className={`rounded-full px-2.5 py-1 text-xs ${actual?.cid === c.cid ? "bg-stone-100 text-stone-900" : "bg-stone-800 text-stone-300"}`}
                  >
                    {c.nombre}
                  </button>
                ))}
              </div>
            ) : null}
            {actual ? <CriaturaCard c={actual} envs={m.envs} /> : null}
            <Card title="Crónica de hoy">
              <CronicaPanel eventos={m.cronica} />
            </Card>
          </div>
          <div className="space-y-4">
            <nav className="flex gap-1 rounded-xl bg-stone-900/70 p-1 text-xs">
              {(
                [
                  ["mente", "Mente"],
                  ["cronica", "Crónica"],
                  ["limites", "Límites"],
                ] as Array<[Tab, string]>
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`flex-1 rounded-lg px-2 py-1.5 ${tab === id ? "bg-stone-100 text-stone-900" : "text-stone-400 hover:text-stone-200"}`}
                >
                  {label}
                </button>
              ))}
            </nav>
            {tab === "mente" && actual ? <MentePanel c={actual} envs={m.envs} /> : null}
            {tab === "cronica" ? (
              <Card title="Crónica de hoy">
                <CronicaPanel eventos={m.cronica} />
              </Card>
            ) : null}
            {tab === "limites" ? (
              <Card title="Límites y presupuesto (config.ts)">
                <LimitesPanel m={m} />
              </Card>
            ) : null}
          </div>
        </div>
      )}

      {m.hay ? (
        <details className="mt-8 rounded-2xl border border-stone-800/70 p-4 text-xs text-stone-500">
          <summary className="cursor-pointer">Empezar de cero</summary>
          <p className="mt-2">Borra la colonia entera: mundo, criaturas, cerebros y crónica. No hay vuelta atrás.</p>
          <div className="mt-2 flex gap-2">
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Escribe BORRAR"
              className="rounded-lg border border-stone-800 bg-stone-950 px-2 py-1 text-stone-200"
            />
            <button
              onClick={borrar}
              disabled={confirm !== "BORRAR" || busy !== null}
              className="rounded-lg bg-red-900/60 px-3 py-1 text-red-100 disabled:opacity-40"
            >
              Borrar
            </button>
          </div>
        </details>
      ) : null}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-stone-950 text-stone-200">
      <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
        <div className="mb-4 flex items-center justify-between">
          <Link href="/app" className="inline-flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-100">
            <ArrowLeftIcon className="h-4 w-4" />
            criteria
          </Link>
          <h1 className="text-sm font-semibold tracking-wide text-stone-100">Mascotitas · la colonia</h1>
          <button onClick={() => logout()} className="inline-flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-100">
            <LogoutIcon className="h-4 w-4" />
            Salir
          </button>
        </div>
        {children}
      </div>
    </main>
  );
}
