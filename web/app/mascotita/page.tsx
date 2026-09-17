"use client";

// El terrario de la colonia: un mapa de tiles donde se ven las criaturas
// moverse entre zonas, comer, multiplicarse y emitir símbolos; alrededor,
// cajas de diálogo con la crónica, la mente de la criatura tocada, el léxico,
// el linaje, los recursos del dios (comida, fuentes, hablar), los límites y
// el narrador. Al abrirse, si el latido programado no llegó, dispara uno.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { logout, useSession } from "@/components/auth";
import { CriaturaCard } from "@/components/mascotita/criatura-card";
import { CronicaPanel } from "@/components/mascotita/cronica-panel";
import { DiosPanel } from "@/components/mascotita/dios-panel";
import { LexicoPanel } from "@/components/mascotita/lexico-panel";
import { LimitesPanel } from "@/components/mascotita/limites-panel";
import { LinajePanel } from "@/components/mascotita/linaje-panel";
import { MentePanel } from "@/components/mascotita/mente-panel";
import { NarradorPanel } from "@/components/mascotita/narrador-panel";
import { PetApiError, ago, errorMessage, petApi } from "@/components/mascotita/shared";
import { Terrario, type Seleccion } from "@/components/mascotita/terrario";
import type { CriaturaView, LatidoResult, MundoView } from "@/lib/mascotita/types";
import "./terrario.css";

type Tab = "cronica" | "mente" | "dios" | "lexico" | "linaje" | "narrador" | "limites";
type Status = "loading" | "forbidden" | "error" | "ready";

const TABS: Array<[Tab, string]> = [
  ["cronica", "Crónica"],
  ["mente", "Mente"],
  ["dios", "Dios"],
  ["lexico", "Léxico"],
  ["linaje", "Linaje"],
  ["narrador", "Narrador"],
  ["limites", "Límites"],
];

const REFRESH_MS = 20_000;
const DOS_HORAS = 2 * 60 * 60_000;
/** en vigilia, la página late cada 15 min (mientras la pestaña siga abierta) */
const VIGILIA_MS = 15 * 60_000;
const VIGILIA_KEY = "mascotitas.vigilia";

export default function ColoniaPage() {
  const router = useRouter();
  const { user, enabled } = useSession();
  const [status, setStatus] = useState<Status>("loading");
  const [m, setM] = useState<MundoView | null>(null);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState<Tab>("cronica");
  const [sel, setSel] = useState<Seleccion>({ cid: null, zona: null });
  const [muerta, setMuerta] = useState<CriaturaView | null>(null);
  const [busy, setBusy] = useState<"latir" | "fundar" | "borrar" | null>(null);
  const [msg, setMsg] = useState("");
  const [confirm, setConfirm] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [vigilia, setVigilia] = useState(true);
  const catchupRan = useRef(false);
  const latiendo = useRef(false);

  // la preferencia de vigilia se recuerda en este navegador
  useEffect(() => {
    try {
      const v = localStorage.getItem(VIGILIA_KEY);
      if (v === "0") setVigilia(false);
    } catch {
      // sin localStorage (modo privado): queda encendida
    }
  }, []);
  const toggleVigilia = () => {
    setVigilia((v) => {
      try {
        localStorage.setItem(VIGILIA_KEY, v ? "0" : "1");
      } catch {
        // da igual
      }
      return !v;
    });
  };

  useEffect(() => {
    if (enabled && user === null) router.replace("/login");
  }, [enabled, user, router]);

  const load = useCallback(async (initial = false) => {
    if (initial) setStatus("loading");
    try {
      const v = await petApi<MundoView>("/api/mascotita/mundo");
      setM(v);
      setStatus("ready");
      setRefreshKey((k) => k + 1);
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

  useEffect(() => {
    if (status !== "ready") return;
    const id = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(id);
  }, [status, load]);

  const latir = useCallback(
    async (reason: "manual" | "catchup") => {
      if (latiendo.current) return;
      latiendo.current = true;
      setBusy("latir");
      setMsg("");
      try {
        const { result } = await petApi<{ result: LatidoResult }>("/api/mascotita/latido", { method: "POST", body: { reason } });
        setMsg(
          `Latido #${result.seq}: ${result.procesadas.length} criatura${result.procesadas.length === 1 ? "" : "s"} en ${result.ms} ms` +
            (result.nacidas.length ? ` · ${result.nacidas.length} nació` : "") +
            (result.muertas.length ? ` · ${result.muertas.length} murió` : ""),
        );
      } catch (err) {
        setMsg(errorMessage(err));
      } finally {
        latiendo.current = false;
        setBusy(null);
        await load();
      }
    },
    [load],
  );

  // Catch-up al abrir (una vez) y, en vigilia, un latido cada 15 min mientras
  // la pestaña siga abierta: reemplaza a la GitHub Action si no la configuras.
  // Con la pestaña en segundo plano el navegador frena los temporizadores a
  // ~1/min, que para esta cadencia da igual; con la pantalla del celular
  // apagada, se detiene.
  useEffect(() => {
    if (status !== "ready" || !m || m.poblacion.vivas === 0 || m.latido.ocupado) return;
    const hace = m.latido.lastAt ? Date.now() - Date.parse(m.latido.lastAt) : Infinity;
    if (!catchupRan.current && m.atrasado) {
      catchupRan.current = true;
      void latir("catchup");
      return;
    }
    if (vigilia && hace >= VIGILIA_MS) void latir("catchup");
  }, [status, m, vigilia, latir]);

  // criatura elegida: viva (viene en el mundo) o muerta (se pide aparte)
  const viva = m?.criaturas.find((c) => c.cid === sel.cid) ?? null;
  useEffect(() => {
    if (!sel.cid || viva) {
      setMuerta(null);
      return;
    }
    let ok = true;
    petApi<{ criatura: CriaturaView }>(`/api/mascotita/criatura?cid=${encodeURIComponent(sel.cid)}`)
      .then((r) => ok && setMuerta(r.criatura))
      .catch(() => ok && setMuerta(null));
    return () => {
      ok = false;
    };
  }, [sel.cid, viva]);
  const actual = viva ?? muerta;

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
      setSel({ cid: null, zona: null });
    } catch (err) {
      setMsg(errorMessage(err));
    } finally {
      setBusy(null);
      await load();
    }
  };

  if (!enabled || user === undefined || status === "loading") return <Shell>{null}</Shell>;
  if (status === "forbidden") {
    return (
      <Shell>
        <div className="caja mx-auto max-w-md text-center text-sm">
          Esta puerta es solo para los dioses de la colonia. Tu cuenta no está en la lista.
        </div>
      </Shell>
    );
  }
  if (status === "error" || !m) {
    return (
      <Shell>
        <div className="caja mx-auto max-w-md text-center text-sm">
          {loadError || "No se pudo cargar."}
          <button onClick={() => load(true)} className="boton mt-3 block w-full">
            Reintentar
          </button>
        </div>
      </Shell>
    );
  }

  const sinLatido = m.latido.lastAt && Date.now() - Date.parse(m.latido.lastAt) > DOS_HORAS;

  return (
    <Shell>
      <div className="caja caja-oscura mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
        <span>
          LATIDO <b className="tabular-nums">#{m.latido.seq}</b> {m.latido.lastAt ? `· ${ago(m.latido.lastAt)}` : "· nunca"}
          {m.latido.ocupado ? <span className="parpadeo ml-2 text-[#f5c542]">latiendo…</span> : null}
        </span>
        <span>
          VIVAS <b className="tabular-nums">{m.poblacion.vivas}</b>/{m.limites.maxVivas} · gen {m.poblacion.generacionMax}
        </span>
        <span>
          ESCRITURAS HOY <b className="tabular-nums">{m.dia.escrituras}</b>/{m.limites.escriturasDia}
        </span>
        {sinLatido && !vigilia ? <span className="text-[#f5c542]">⚠ sin latido hace más de 2 h: enciende la vigilia o configura la Action</span> : null}
        <span className="ml-auto flex items-center gap-2">
          <button
            onClick={toggleVigilia}
            className={`boton ${vigilia ? "boton-2" : "boton-3"}`}
            title="En vigilia, esta pestaña hace latir la colonia cada 15 minutos mientras siga abierta"
          >
            {vigilia ? "Vigilia: sí" : "Vigilia: no"}
          </button>
          {m.poblacion.vivas > 0 ? (
            <button onClick={() => latir("manual")} disabled={busy !== null || m.latido.ocupado} className="boton">
              {busy === "latir" ? "Latiendo…" : "Latir ahora"}
            </button>
          ) : null}
        </span>
      </div>

      {msg ? <p className="caja mb-3 text-[11px]">{msg}</p> : null}

      {m.poblacion.vivas === 0 && !Object.values(m.fotos).some((f) => f.viva) ? (
        <div className="caja mx-auto mb-3 max-w-md text-center text-sm">
          <p className="font-bold">{m.hay ? "La colonia se extinguió." : "No hay colonia todavía."}</p>
          <p className="mt-2 text-[11px] text-[#5a5a6a]">
            Nace una fundadora en un lugar al azar, con genes al centro y un cerebro recién sorteado. De ahí en adelante, todo lo que sepa lo aprende
            sola.
          </p>
          <button onClick={fundar} disabled={busy !== null} className="boton mt-3">
            {busy === "fundar" ? "Naciendo…" : "Fundar la colonia"}
          </button>
        </div>
      ) : null}

      <div className="terrario-grid">
        <div>
          <Terrario mundo={m} seleccion={sel} onSeleccion={setSel} />
          <p className="mt-1 text-[10px] text-[#9aa3b8]">
            Toca una criatura para ver su mente; toca una zona para intervenir ahí. Los puntos ámbar son comida; el anillo azul, una fuente. En el
            celular, arrastra para moverte por la región o usa los botones de arriba.
          </p>
        </div>
        <div className="space-y-3">
          <div className="pestanas" role="tablist">
            {TABS.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} className="pestana" onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
          {tab === "cronica" ? (
            <div className="caja">
              <h3>Crónica de hoy</h3>
              <CronicaPanel eventos={m.cronica} cid={sel.cid} />
            </div>
          ) : null}
          {tab === "mente" ? (
            <div className="caja">
              <h3>Mente</h3>
              {actual ? (
                <>
                  <CriaturaCard c={actual} envs={m.envs} />
                  <div className="my-3 border-t-2 border-dashed border-[#cfc8b4]" />
                  <MentePanel c={actual} envs={m.envs} />
                </>
              ) : (
                <p className="text-[11px] text-[#5a5a6a]">Toca una criatura en el mapa (o en el linaje).</p>
              )}
            </div>
          ) : null}
          {tab === "dios" ? (
            <div className="caja">
              <h3>El dios</h3>
              <DiosPanel envs={m.envs} zona={sel.zona} onHecho={(t) => (setMsg(t), void load())} />
            </div>
          ) : null}
          {tab === "lexico" ? (
            <div className="caja">
              <h3>Léxico</h3>
              <LexicoPanel refreshKey={refreshKey} />
            </div>
          ) : null}
          {tab === "linaje" ? (
            <div className="caja">
              <h3>Linaje</h3>
              <LinajePanel
                refreshKey={refreshKey}
                seleccion={sel.cid}
                onElegir={(cid) => {
                  const f = m.fotos[cid];
                  setSel({ cid, zona: f ? { env: f.env, zona: f.zona } : sel.zona });
                  setTab("mente");
                }}
              />
            </div>
          ) : null}
          {tab === "narrador" ? (
            <div className="caja">
              <h3>Narrador</h3>
              <NarradorPanel />
            </div>
          ) : null}
          {tab === "limites" ? (
            <div className="caja">
              <h3>Límites y presupuesto (config.ts)</h3>
              <LimitesPanel m={m} />
            </div>
          ) : null}
        </div>
      </div>

      {m.hay ? (
        <details className="caja caja-oscura mt-4 text-[11px]">
          <summary className="cursor-pointer">Empezar de cero</summary>
          <p className="mt-2 text-[#9aa3b8]">Borra la colonia entera: mundo, criaturas, cerebros, crónica, linaje y léxico. No hay vuelta atrás.</p>
          <div className="mt-2 flex gap-2">
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Escribe BORRAR" className="campo" />
            <button onClick={borrar} disabled={confirm !== "BORRAR" || busy !== null} className="boton boton-rojo">
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
    <main className="terrario-root">
      <div className="mx-auto max-w-6xl px-3 py-3 sm:px-5">
        <div className="mb-3 flex items-center justify-between text-[11px] uppercase tracking-wider text-[#9aa3b8]">
          <Link href="/app" className="hover:text-white">
            ← criteria
          </Link>
          <span className="text-[#f6f1dc]">Mascotitas · el terrario</span>
          <button onClick={() => logout()} className="hover:text-white">
            Salir
          </button>
        </div>
        {children}
      </div>
    </main>
  );
}
