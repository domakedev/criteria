// GET /api/mascotita/linaje — el árbol genealógico completo (≤ 600 entradas).
import { NextRequest, NextResponse } from "next/server";
import { guardMascotita } from "@/lib/mascotita/auth";
import { getLinaje } from "@/lib/mascotita/service";
import { errorResponse } from "../_lib";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const g = await guardMascotita(req);
  if ("response" in g) return g.response;
  try {
    return NextResponse.json(await getLinaje());
  } catch (err) {
    return errorResponse(err);
  }
}
