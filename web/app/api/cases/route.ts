// GET  /api/cases — los casos del usuario en sesión (privados) + su historial.
// POST /api/cases — guarda una decisión nueva (privada o compartida).
import { NextRequest, NextResponse } from "next/server";
import { trackRecord } from "@/lib/engine";
import {
  createCase,
  firebaseAdminConfigured,
  listPersonalCases,
  verifyRequestUser,
} from "@/lib/admin";
import type { CaseDraft, Doubt, LensReading, Weight } from "@/lib/types";

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
  const cases = await listPersonalCases(user.uid);
  return NextResponse.json({ cases, record: trackRecord(cases) });
}

const WEIGHTS = new Set<Weight>(["high", "medium", "low"]);
const DOUBTS = new Set<Doubt>(["low", "medium", "high"]);

export async function POST(req: NextRequest) {
  if (!firebaseAdminConfigured()) return notConfigured();
  const user = await verifyRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Inicia sesión primero." }, { status: 401 });
  }

  let body: Partial<CaseDraft> & { share?: boolean };
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
  const doubt: Doubt = DOUBTS.has(body.doubt as Doubt) ? (body.doubt as Doubt) : "medium";
  const lenses: LensReading[] = Array.isArray(body.lenses)
    ? body.lenses
        .filter(
          (l): l is LensReading =>
            !!l &&
            typeof l.name === "string" &&
            l.name.trim().length > 0 &&
            typeof l.reading === "string" &&
            WEIGHTS.has(l.weight as Weight),
        )
        .map((l) => ({
          name: l.name.trim().toLowerCase().replace(/\s+/g, "-"),
          weight: l.weight,
          reading: l.reading.trim(),
        }))
    : [];

  const record = await createCase(user.uid, {
    situation,
    decision,
    reason,
    doubt,
    ...(body.expectation?.trim() ? { expectation: body.expectation.trim() } : {}),
    context: {
      domain: (body.context?.domain ?? "vida-diaria").trim() || "vida-diaria",
      tags: Array.isArray(body.context?.tags) ? body.context.tags : [],
    },
    lenses,
    layer: body.share ? "community" : "personal",
    author: user.name,
  });
  return NextResponse.json({ case: record }, { status: 201 });
}
