// POST /api/analyze — la IA (Gemini) lee los casos humanos que el motor
// encontró para esta situación y redacta una recomendación basada SOLO en
// ellos. Requiere sesión (evita abuso del endpoint público) y aplica un
// límite de llamadas por usuario.
import { NextRequest, NextResponse } from "next/server";
import { aiEnabled, analyzeCriteria } from "@/lib/ai";
import { topMatches } from "@/lib/engine";
import {
  firebaseAdminConfigured,
  listCommunityCases,
  listPersonalCases,
  verifyRequestUser,
} from "@/lib/admin";

// Límite simple en memoria: N análisis por usuario por ventana. Suficiente
// para el MVP (una sola instancia); con más tráfico iría a Firestore/Redis.
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
      { error: "Demasiados análisis seguidos. Espera un minuto e intenta de nuevo." },
      { status: 429 },
    );
  }

  let body: { situation?: string; domain?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  }
  const situation = (body.situation ?? "").trim();
  if (!situation) {
    return NextResponse.json({ error: "Cuéntame la situación primero." }, { status: 400 });
  }

  const [community, personal] = await Promise.all([
    listCommunityCases(),
    listPersonalCases(user.uid),
  ]);
  const matches = topMatches([...personal, ...community], {
    situation,
    ...(body.domain ? { domain: body.domain } : {}),
  });

  if (matches.length === 0) {
    // Sin casos no hay nada que sintetizar — la IA nunca inventa.
    return NextResponse.json({ analysis: null });
  }

  try {
    const analysis = await analyzeCriteria(
      situation,
      matches.map((m) => m.case),
    );
    return NextResponse.json({ analysis });
  } catch (err) {
    const status = (err as { status?: number }).status;
    return NextResponse.json(
      {
        error:
          status === 429 || status === 503
            ? "La IA está saturada en este momento. Intenta en unos segundos."
            : "No se pudo analizar. Intenta de nuevo.",
      },
      { status: 502 },
    );
  }
}
