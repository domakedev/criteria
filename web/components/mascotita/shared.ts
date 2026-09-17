// Ayudas compartidas por la página de la mascotita y sus paneles: llamadas
// que conservan el código HTTP (el tick necesita distinguir 409/429 y leer
// `retryAt`), etiquetas en español y formato de fechas. Solo tipos de
// `@/lib/mascotita/types` — nada del servidor entra al cliente.
import { idToken } from "@/lib/firebase";
import type {
  ConceptKind,
  EnvInfo,
  LifeStage,
  MoodWord,
  TickResult,
  TraitKey,
} from "@/lib/mascotita/types";

/** Error de /api/mascotita/* con lo que la UI necesita para reaccionar. */
export class PetApiError extends Error {
  status: number;
  retryAt: string | null;
  result: TickResult | null;

  constructor(message: string, status: number, retryAt: string | null, result: TickResult | null) {
    super(message);
    this.name = "PetApiError";
    this.status = status;
    this.retryAt = retryAt;
    this.result = result;
  }
}

/**
 * Como `api()` de lib/api, pero el error trae `status`, `retryAt` y el
 * `result` del tick saltado. Se usa donde el código HTTP cambia la pantalla
 * (403 → puerta cerrada; 409/429 → esperar).
 */
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
    const result =
      data.result && typeof data.result === "object" ? (data.result as TickResult) : null;
    const retryAt =
      typeof data.retryAt === "string" ? data.retryAt : (result?.retryAt ?? null);
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

/** Orden fijo de los rasgos en la UI (solo tipos desde lib/mascotita/types). */
export const TRAIT_ORDER: TraitKey[] = ["curiosidad", "cautela", "sociabilidad", "juego", "constancia", "orden"];

export const TRAIT_LABEL: Record<TraitKey, string> = {
  curiosidad: "Curiosidad",
  cautela: "Cautela",
  sociabilidad: "Sociabilidad",
  juego: "Juego",
  constancia: "Constancia",
  orden: "Orden",
};

export const KIND_EMOJI: Record<ConceptKind, string> = {
  cosa: "🧩",
  lugar: "📍",
  idea: "💡",
  regla: "📏",
  archivo: "📄",
  persona: "🙂",
  habito: "🔁",
  duda: "❓",
};

/** Tinte del chip de ánimo: cálido si está bien, frío si no. */
export const MOOD_TONE: Record<MoodWord, string> = {
  alegre: "bg-emerald-100 text-emerald-900",
  tranquila: "bg-emerald-50 text-emerald-800",
  curiosa: "bg-sky-100 text-sky-900",
  inquieta: "bg-amber-100 text-amber-900",
  aburrida: "bg-stone-100 text-stone-600",
  asustada: "bg-red-100 text-red-800",
  triste: "bg-sky-50 text-sky-700",
  orgullosa: "bg-violet-100 text-violet-900",
};

export function envInfoFor(envs: EnvInfo[], id: string): EnvInfo {
  return envs.find((e) => e.id === id) ?? { id, name: id, emoji: "·", kind: "imaginado", intro: "" };
}

// --- fechas y números ---

export function dateEs(iso: string, opts?: Intl.DateTimeFormatOptions): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-PE", opts);
}

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

/** Δ con signo y dos decimales: "+0.03" / "−0.02". */
export function signed(x: number, digits = 2): string {
  const v = x.toFixed(digits);
  return x > 0 ? `+${v}` : x < 0 ? `−${v.slice(1)}` : v;
}

/** "mm:ss" para las cuentas regresivas. */
export function mmss(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
