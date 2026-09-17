// POST /api/mascotita/fundar — nace la fundadora (solo si no hay vivas).
import { NextRequest, NextResponse } from "next/server";
import { guardMascotita } from "@/lib/mascotita/auth";
import { fundar } from "@/lib/mascotita/service";
import { errorResponse, makeLimiter, tooFast } from "../_lib";

export const dynamic = "force-dynamic";

const limited = makeLimiter(5_000);

export async function POST(req: NextRequest) {
  const g = await guardMascotita(req);
  if ("response" in g) return g.response;
  if (limited(g.user.uid)) return tooFast();
  try {
    return NextResponse.json({ criatura: await fundar(g.user.uid) });
  } catch (err) {
    return errorResponse(err);
  }
}
