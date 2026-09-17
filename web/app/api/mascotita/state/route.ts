// GET /api/mascotita/state — todo lo que la página necesita para pintarse:
// la mascota (o null y nombres sugeridos), entornos, informe "mientras no
// estabas", conocimiento, charla, diario, cupos y exploraciones atrasadas.
import { NextRequest, NextResponse } from "next/server";
import { guardMascotita } from "@/lib/mascotita/auth";
import { getState } from "@/lib/mascotita/service";
import { errorResponse } from "../_lib";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const g = await guardMascotita(req);
  if ("response" in g) return g.response;
  try {
    return NextResponse.json(await getState(g.user.uid));
  } catch (err) {
    return errorResponse(err);
  }
}
