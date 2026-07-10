// POST /api/advise — consejo de criterio de la IA para el arranque en frío.
// Se usa cuando el motor NO encontró experiencias humanas parecidas: Gemini
// aconseja aplicando el método criteria (lentes ponderados, preguntas, sesgos
// a vigilar) y la UI lo etiqueta claramente como consejo de IA — nunca se
// presenta como experiencia real. Requiere sesión y aplica límite por usuario.
import { NextRequest, NextResponse } from "next/server";
import { aiEnabled, adviseCriteria } from "@/lib/ai";
import { firebaseAdminConfigured, verifyRequestUser } from "@/lib/admin";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 6;
const hits = new Map<string, number[]>();

function rateLimited(uid: string): boolean {
  const now = Date.now();
  const recent = (hits.get(uid) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) return true;
  recent.push(now);
  hits.set(uid, recent);
  return false;
}

export async function POST(req: NextRequest) {
  if (!firebaseAdminConfigured()) {
    return NextResponse.json(
      { error: "El servidor no está configurado (falta FIREBASE_SERVICE_ACCOUNT)." },
      { status: 503 },
    );
  }
  if (!aiEnabled()) {
    return NextResponse.json({ error: "La IA no está configurada." }, { status: 503 });
  }

  const user = await verifyRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Inicia sesión primero." }, { status: 401 });
  }
  if (rateLimited(user.uid)) {
    return NextResponse.json(
      { error: "Demasiadas consultas seguidas. Espera un minuto e intenta de nuevo." },
      { status: 429 },
    );
  }

  let body: { situation?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  }
  const situation = (body.situation ?? "").trim();
  if (!situation) {
    return NextResponse.json({ error: "Cuéntame la situación primero." }, { status: 400 });
  }

  try {
    const advice = await adviseCriteria(situation);
    return NextResponse.json({ advice });
  } catch (err) {
    const status = (err as { status?: number }).status;
    return NextResponse.json(
      {
        error:
          status === 429 || status === 503
            ? "La IA está saturada en este momento. Intenta en unos segundos."
            : "No se pudo generar el consejo. Intenta de nuevo.",
      },
      { status: 502 },
    );
  }
}
