// POST /api/cases/:id/outcome — cierra el bucle: cómo salió la decisión.
import { NextRequest, NextResponse } from "next/server";
import {
  firebaseAdminConfigured,
  recordOutcome,
  verifyRequestUser,
} from "@/lib/admin";

const STATUSES = new Set(["good", "bad", "mixed"]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!firebaseAdminConfigured()) {
    return NextResponse.json(
      { error: "El servidor no está configurado (falta FIREBASE_SERVICE_ACCOUNT)." },
      { status: 503 },
    );
  }
  const user = await verifyRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Inicia sesión primero." }, { status: 401 });
  }

  let body: { status?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  }
  if (!body.status || !STATUSES.has(body.status)) {
    return NextResponse.json(
      { error: "Dime cómo salió: bien, mal o regular." },
      { status: 400 },
    );
  }

  const { id } = await params;
  const ok = await recordOutcome(
    user.uid,
    id,
    body.status as "good" | "bad" | "mixed",
    body.note?.trim() || undefined,
  );
  if (!ok) {
    return NextResponse.json(
      { error: "No encontré esa decisión entre las tuyas." },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
}
