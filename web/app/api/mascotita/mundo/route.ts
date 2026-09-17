// GET /api/mascotita/mundo — el estado de la colonia para la página: latido,
// contadores del día, población, fotos, criaturas vivas (sin memorias ni
// pesos), crónica de hoy y límites. Solo dueños.
import { NextRequest, NextResponse } from "next/server";
import { guardMascotita } from "@/lib/mascotita/auth";
import { getMundoView } from "@/lib/mascotita/service";
import { errorResponse } from "../_lib";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const g = await guardMascotita(req);
  if ("response" in g) return g.response;
  try {
    return NextResponse.json(await getMundoView());
  } catch (err) {
    return errorResponse(err);
  }
}
