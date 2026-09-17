// GET /api/mascotita/lexico — las glosas del intérprete estadístico y el medidor de bits.
import { NextRequest, NextResponse } from "next/server";
import { guardMascotita } from "@/lib/mascotita/auth";
import { getLexico } from "@/lib/mascotita/service";
import { errorResponse } from "../_lib";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const g = await guardMascotita(req);
  if ("response" in g) return g.response;
  try {
    return NextResponse.json(await getLexico());
  } catch (err) {
    return errorResponse(err);
  }
}
