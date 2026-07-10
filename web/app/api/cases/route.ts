// GET  /api/cases — los casos del usuario en sesión (privados) + su historial.
// POST /api/cases — guarda una decisión nueva (privada, compartida o anónima).
import { NextRequest, NextResponse } from "next/server";
import { trackRecord } from "@/lib/engine";
import {
  createCase,
  firebaseAdminConfigured,
  listOwnCommunityCases,
  listPersonalCases,
  verifyRequestUser,
} from "@/lib/admin";
import { sanitizeDomain, sanitizeDoubt, sanitizeLenses } from "@/lib/validate";
import type { CaseDraft } from "@/lib/types";

function notConfigured() {
  return NextResponse.json(
    { error: "El servidor no está configurado (falta FIREBASE_SERVICE_ACCOUNT)." },
    { status: 503 },
  );
}

export async function GET(req: NextRequest) {
  if (!firebaseAdminConfigured()) return notConfigured();
  const user = await verifyRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Inicia sesión primero." }, { status: 401 });
  }
  // Privados + los que compartió a la comunidad: ambos son SUS decisiones y
  // de ambos debe poder cerrar el ciclo.
  const [personal, shared] = await Promise.all([
    listPersonalCases(user.uid),
    listOwnCommunityCases(user.uid),
  ]);
  const cases = [...personal, ...shared].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  );
  return NextResponse.json({ cases, record: trackRecord(cases) });
}

export async function POST(req: NextRequest) {
  if (!firebaseAdminConfigured()) return notConfigured();
  const user = await verifyRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Inicia sesión primero." }, { status: 401 });
  }

  let body: Partial<CaseDraft> & { share?: boolean; anonymous?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  }

  const situation = (body.situation ?? "").trim();
  const decision = (body.decision ?? "").trim();
  const reason = (body.reason ?? "").trim();
  if (!situation || !decision || !reason) {
    return NextResponse.json(
      { error: "Faltan la situación, la decisión o el porqué." },
      { status: 400 },
    );
  }

  const share = !!body.share;
  const record = await createCase(user.uid, {
    situation,
    decision,
    reason,
    doubt: sanitizeDoubt(body.doubt),
    ...(body.expectation?.trim() ? { expectation: body.expectation.trim() } : {}),
    context: {
      domain: sanitizeDomain(body.context?.domain),
      tags: Array.isArray(body.context?.tags) ? body.context.tags : [],
    },
    lenses: sanitizeLenses(body.lenses),
    layer: share ? "community" : "personal",
    // Compartir en anónimo: el caso sale público sin el nombre. El authorUid
    // se guarda igual en el documento (nunca se expone) para poder cerrar el ciclo.
    author: share && body.anonymous ? "anónimo" : user.name,
  });
  return NextResponse.json({ case: record }, { status: 201 });
}
