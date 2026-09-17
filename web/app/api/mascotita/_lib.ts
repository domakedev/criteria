// Ayudas compartidas por las rutas /api/mascotita/*: lectura estricta del
// cuerpo JSON y traducción de errores a respuestas HTTP sin filtrar detalles
// internos. (No es una ruta: Next solo trata `route.ts` como endpoint.)
import { NextRequest, NextResponse } from "next/server";
import { MascotitaError } from "@/lib/mascotita/errors";

export const GENERIC_ERROR = "Algo salió mal. Intenta de nuevo.";

/** Freno en memoria por usuario (1 petición cada `gapMs`); primera línea contra el doble clic. */
export function makeLimiter(gapMs: number): (uid: string) => boolean {
  const last = new Map<string, number>();
  return (uid) => {
    const now = Date.now();
    const prev = last.get(uid) ?? 0;
    if (now - prev < gapMs) return true;
    last.set(uid, now);
    if (last.size > 1_000) for (const [k, t] of last) if (now - t > gapMs) last.delete(k);
    return false;
  };
}

export function tooFast(): NextResponse {
  return NextResponse.json({ error: "Muy seguido. Espera unos segundos e intenta de nuevo." }, { status: 429 });
}

/** Cuerpo JSON como objeto plano; null si no es JSON válido o no es un objeto. */
export async function readBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const data: unknown = await req.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    return data as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function invalidBody(): NextResponse {
  return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
}

/**
 * Campo de texto del cuerpo: debe ser string; se recorta, opcionalmente se
 * aplanan los saltos de línea y se rechaza si supera `max`. Devuelve el texto
 * limpio o una respuesta 400 lista para retornar.
 */
export function textField(
  body: Record<string, unknown>,
  key: string,
  max: number,
  opts: { singleLine?: boolean; tooLong?: string } = {},
): string | NextResponse {
  const raw = body[key];
  if (typeof raw !== "string") return invalidBody();
  const text = (opts.singleLine ? raw.replace(/\s+/g, " ") : raw).trim();
  if (text.length > max) {
    return NextResponse.json(
      { error: opts.tooLong ?? `Muy largo: máximo ${max} caracteres.` },
      { status: 400 },
    );
  }
  return text;
}

/** Parámetro entero de la query, acotado; `fallback` si falta o no es número. */
export function intParam(req: NextRequest, key: string, fallback: number, lo: number, hi: number): number {
  const raw = req.nextUrl.searchParams.get(key);
  if (raw === null || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

/** MascotitaError → su status y mensaje (y retryAt si lo trae); otro error → 500 genérico. */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof MascotitaError) {
    return NextResponse.json(
      { error: err.message, ...(err.retryAt ? { retryAt: err.retryAt } : {}) },
      { status: err.status },
    );
  }
  // Se registra en el servidor; al cliente solo le llega el mensaje genérico.
  console.error("[mascotita]", err);
  return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
}
