// POST /api/mascotita/tick — una exploración ahora mismo (`reason: "manual"`)
// o una atrasada que la página dispara al abrirse (`reason: "catchup"`).
// El tick dura hasta 40 s; además de los cupos diarios del servicio, aquí se
// frena a 1 petición por 5 s por usuario para que el doble clic no duela.
import { NextRequest, NextResponse } from "next/server";
import { guardMascotita } from "@/lib/mascotita/auth";
import { runTick } from "@/lib/mascotita/tick";
import type { TickResult, TickSkipReason } from "@/lib/mascotita/types";
import { errorResponse, invalidBody, readBody } from "../_lib";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MIN_GAP_MS = 5_000;
const lastHit = new Map<string, number>();

function rateLimited(uid: string): boolean {
  const now = Date.now();
  const prev = lastHit.get(uid) ?? 0;
  if (now - prev < MIN_GAP_MS) return true;
  lastHit.set(uid, now);
  // Poda perezosa para que el Map no crezca sin fin.
  if (lastHit.size > 1_000) {
    for (const [k, t] of lastHit) if (now - t > MIN_GAP_MS) lastHit.delete(k);
  }
  return false;
}

const SKIPPED: Record<TickSkipReason, { status: number; error: string }> = {
  cap: { status: 429, error: "Hoy ya exploró suficiente. Mañana sigue." },
  cooldown: { status: 429, error: "Acaba de explorar. Dale un respiro antes de la siguiente." },
  locked: { status: 409, error: "Ya está explorando ahora mismo. Espera a que termine." },
  nopet: { status: 404, error: "Todavía no tienes mascota." },
  inactive: { status: 404, error: "Tu mascota ya no está activa." },
  error: { status: 503, error: "Exploró, pero no pude guardar lo que vivió. Intenta de nuevo en un rato." },
};

export async function POST(req: NextRequest) {
  const g = await guardMascotita(req);
  if ("response" in g) return g.response;

  const body = await readBody(req);
  if (!body) return invalidBody();
  const reason = body.reason;
  if (reason !== "manual" && reason !== "catchup") return invalidBody();

  if (rateLimited(g.user.uid)) {
    return NextResponse.json(
      { error: "Muy seguido. Espera unos segundos e intenta de nuevo." },
      { status: 429 },
    );
  }

  try {
    const result: TickResult = await runTick(g.user.uid, reason);
    if (result.skipped) {
      const s = SKIPPED[result.skipped];
      return NextResponse.json({ error: s.error, result }, { status: s.status });
    }
    return NextResponse.json({ result });
  } catch (err) {
    return errorResponse(err);
  }
}
