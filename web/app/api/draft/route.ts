// GET  /api/draft — ¿está disponible la IA que ordena? (para que la UI decida
//                   qué modo de captura mostrar)
// POST /api/draft — relato libre → borrador estructurado del caso (Gemini).
//                   La IA solo ordena lo que la persona contó; el humano
//                   revisa y decide guardar. Requiere sesión y tiene límite.
import { NextRequest, NextResponse } from "next/server";
import { aiEnabled, draftFromText } from "@/lib/ai";
import { firebaseAdminConfigured, verifyRequestUser } from "@/lib/admin";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const hits = new Map<string, number[]>();

function rateLimited(uid: string): boolean {
  const now = Date.now();
  const recent = (hits.get(uid) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) return true;
  recent.push(now);
  hits.set(uid, recent);
  return false;
}

export async function GET() {
  return NextResponse.json({ enabled: aiEnabled() });
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
      { error: "Demasiados intentos seguidos. Espera un minuto e intenta de nuevo." },
      { status: 429 },
    );
  }

  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  }
  const text = (body.text ?? "").trim();
  if (text.length < 20) {
    return NextResponse.json(
      { error: "Cuéntame un poco más — al menos qué pasó y qué decidiste." },
      { status: 400 },
    );
  }

  try {
    const draft = await draftFromText(text);
    return NextResponse.json({ draft });
  } catch (err) {
    const status = (err as { status?: number }).status;
    return NextResponse.json(
      {
        error:
          status === 429 || status === 503
            ? "La IA está saturada en este momento. Intenta en unos segundos."
            : "No se pudo ordenar el relato. Intenta de nuevo o llena el formulario.",
      },
      { status: 502 },
    );
  }
}
