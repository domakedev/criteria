// POST /api/mascotita/seen — el dueño ya leyó el informe "mientras no
// estabas"; desde ahora se acumula uno nuevo.
import { NextRequest, NextResponse } from "next/server";
import { guardMascotita } from "@/lib/mascotita/auth";
import { markSeen } from "@/lib/mascotita/service";
import { errorResponse } from "../_lib";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const g = await guardMascotita(req);
  if ("response" in g) return g.response;
  try {
    await markSeen(g.user.uid);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
