// POST /api/ask — el motor responde desde el servidor.
// `scope` decide dónde buscar: "all" (mis casos + comunidad, por defecto),
// "mine" (solo lo mío, incluido lo que compartí) o "community" (solo la
// comunidad). Nunca inventa: recupera y agrega criterio humano con procedencia.
import { NextRequest, NextResponse } from "next/server";
import { ask } from "@/lib/engine";
import {
  firebaseAdminConfigured,
  listCommunityCases,
  listOwnCommunityCases,
  listPersonalCases,
  verifyRequestUser,
} from "@/lib/admin";
import { sanitizeScope } from "@/lib/validate";
import type { DecisionCase } from "@/lib/types";

export async function POST(req: NextRequest) {
  if (!firebaseAdminConfigured()) {
    return NextResponse.json(
      { error: "El servidor no está configurado (falta FIREBASE_SERVICE_ACCOUNT)." },
      { status: 503 },
    );
  }

  let body: { situation?: string; domain?: string; scope?: string };
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

  const scope = sanitizeScope(body.scope);
  const user = scope !== "community" ? await verifyRequestUser(req) : null;
  if (scope === "mine" && !user) {
    return NextResponse.json(
      { error: "Inicia sesión para buscar solo en tus decisiones." },
      { status: 401 },
    );
  }

  const none = Promise.resolve<DecisionCase[]>([]);
  const [community, personal, ownShared] = await Promise.all([
    scope !== "mine" ? listCommunityCases() : none,
    user ? listPersonalCases(user.uid) : none,
    // En "mine" los casos que el usuario compartió también son suyos; en los
    // demás alcances ya vienen dentro de la comunidad.
    scope === "mine" && user ? listOwnCommunityCases(user.uid) : none,
  ]);

  const guidance = ask([...personal, ...ownShared, ...community], {
    situation,
    ...(body.domain ? { domain: body.domain } : {}),
  });
  return NextResponse.json(guidance);
}
