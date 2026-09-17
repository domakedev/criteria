// Ayudas compartidas por la página de la colonia y sus paneles: llamadas que
// conservan el código HTTP (el latido necesita distinguir 409/429 y leer
// `retryAt`), etiquetas en español y formato de fechas. Solo tipos de
// `@/lib/mascotita/types` — nada del servidor entra al cliente.
import { idToken } from "@/lib/firebase";
import type { EnvInfo, LatidoResult, LifeStage, MoodWord, TraitKey } from "@/lib/mascotita/types";

/** Error de /api/mascotita/* con lo que la UI necesita para reaccionar. */
export class PetApiError extends Error {
  status: number;
  retryAt: string | null;
  result: LatidoResult | null;

  constructor(message: string, status: number, retryAt: string | null, result: LatidoResult | null) {
    super(message);
    this.name = "PetApiError";
    this.status = status;
    this.retryAt = retryAt;
    this.result = result;
  }
}

export async function petApi<T>(
  path: string,
  init?: { method?: "GET" | "POST" | "DELETE"; body?: unknown },
): Promise<T> {
  const token = await idToken();
  const res = await fetch(path, {
    method: init?.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  const data: Record<string, unknown> = await res.json().catch(() => ({}));
  if (!res.ok) {
    const result = data.result && typeof data.result === "object" ? (data.result as LatidoResult) : null;
    const retryAt = typeof data.retryAt === "string" ? data.retryAt : (result?.retryAt ?? null);
    throw new PetApiError(
      typeof data.error === "string" ? data.error : "Algo salió mal. Intenta de nuevo.",
      res.status,
      retryAt,
      result,
    );
  }
  return data as T;
}

export function errorMessage(err: unknown, fallback = "Algo salió mal."): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

// --- etiquetas ---

export const STAGE_LABEL: Record<LifeStage, string> = {
  huevo: "Huevo",
  cria: "Cría",
  joven: "Joven",
  adulta: "Adulta",
  sabia: "Sabia",
};

export const TRAIT_ORDER: TraitKey[] = ["curiosidad", "cautela", "sociabilidad", "juego", "constancia", "orden"];

export const TRAIT_LABEL: Record<TraitKey, string> = {
  curiosidad: "Curiosidad",
  cautela: "Cautela",
  sociabilidad: "Sociabilidad",
  juego: "Juego",
  constancia: "Constancia",
  orden: "Orden",
};

/** Tinte del chip de ánimo (fondo oscuro). */
export const MOOD_TONE: Record<MoodWord, string> = {
  alegre: "bg-emerald-900/60 text-emerald-200",
  tranquila: "bg-emerald-900/40 text-emerald-300",
  curiosa: "bg-sky-900/60 text-sky-200",
  inquieta: "bg-amber-900/60 text-amber-200",
  aburrida: "bg-stone-800 text-stone-300",
  asustada: "bg-red-900/60 text-red-200",
  triste: "bg-sky-900/40 text-sky-300",
  orgullosa: "bg-violet-900/60 text-violet-200",
};

export function envInfoFor(envs: EnvInfo[], id: string): EnvInfo {
  return envs.find((e) => e.id === id) ?? { id, name: id, emoji: "·", kind: "imaginado", intro: "", zonas: [] };
}

export function zonaNombre(envs: EnvInfo[], envId: string, zona: string): string {
  return envInfoFor(envs, envId).zonas.find((z) => z.id === zona)?.name ?? zona;
}

// --- fechas y números ---

export function timeEs(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}

/** "hace 5 min" · "hace 3 h" · "hace 2 días". */
export function ago(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "hace un momento";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} días`;
}

export function pct(x: number): string {
  return `${Math.round(Math.min(1, Math.max(0, x)) * 100)} %`;
}

/** Con signo y dos decimales: "+0.03" / "−0.02". */
export function signed(x: number, digits = 2): string {
  const v = x.toFixed(digits);
  return x > 0 ? `+${v}` : x < 0 ? `−${v.slice(1)}` : v;
}

export function num(x: number): string {
  return x.toLocaleString("es-PE");
}

/** Las 16 sílabas del canal de símbolos (etiquetas para mostrar; el significado, si surge, lo mide el intérprete). */
export const SILABAS = ["ka", "ti", "mo", "su", "ra", "ne", "pi", "lo", "wa", "ki", "ta", "chu", "yu", "mi", "ño", "sa"];
