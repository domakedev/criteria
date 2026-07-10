// POST /api/ask — el motor responde desde el servidor.
// Busca en la comunidad y, si hay sesión, también en los casos personales del
// usuario. Nunca inventa: recupera y agrega criterio humano con procedencia.
import { NextRequest, NextResponse } from "next/server";
import { ask } from "@/lib/engine";
import {
  firebaseAdminConfigured,
  listCommunityCases,
  listPersonalCases,
  verifyRequestUser,
} from "@/lib/admin";

export async function POST(req: NextRequest) {
  if (!firebaseAdminConfigured()) {
    return NextResponse.json(
      { error: "El servidor no está configurado (falta FIREBASE_SERVICE_ACCOUNT)." },
      { status: 503 },
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
    return NextResponse.json(
      { error: "Cuéntame la situación primero." },
      { status: 400 },
    );
  }

  const user = await verifyRequestUser(req);
  const [community, personal] = await Promise.all([
    listCommunityCases(),
    user ? listPersonalCases(user.uid) : Promise.resolve([]),
  ]);

  const guidance = ask([...personal, ...community], {
    situation,
    ...(body.domain ? { domain: body.domain } : {}),
  });
  return NextResponse.json(guidance);
}
