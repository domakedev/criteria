// POST /api/train — genera escenarios de entrenamiento de criterio para un
// tema. La IA solo propone las situaciones y opciones; lo que se guarda
// después (vía /api/cases) es la elección y el porqué del humano. Requiere
// sesión y tiene límite por usuario (la generación es la llamada más pesada).
import { NextRequest, NextResponse } from "next/server";
import { aiEnabled, generateScenarios } from "@/lib/ai";
import { firebaseAdminConfigured, verifyRequestUser } from "@/lib/admin";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 4;
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
      { error: "Demasiadas generaciones seguidas. Espera un minuto e intenta de nuevo." },
      { status: 429 },
    );
  }

  let body: { topic?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  }
  const topic = (body.topic ?? "").trim();
  if (topic.length < 2) {
    return NextResponse.json({ error: "Escribe un tema primero." }, { status: 400 });
  }

  try {
    const scenarios = await generateScenarios(topic);
    if (scenarios.length === 0) {
      return NextResponse.json(
        { error: "No salieron escenarios útiles para ese tema. Prueba con otras palabras." },
        { status: 502 },
      );
    }
    return NextResponse.json({ scenarios });
  } catch (err) {
    const status = (err as { status?: number }).status;
    return NextResponse.json(
      {
        error:
          status === 429 || status === 503
            ? "La IA está saturada en este momento. Intenta en unos segundos."
            : "No se pudieron generar los escenarios. Intenta de nuevo.",
      },
      { status: 502 },
    );
  }
}
