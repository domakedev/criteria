// /api/mascotita/narrar — el narrador (Gemini) le cuenta al dueño qué pasó.
// GET: las narraciones guardadas y el cupo de hoy. POST: una nueva (cuenta
// contra el tope diario). Nada de esto llega a las criaturas.
import { NextRequest, NextResponse } from "next/server";
import { guardMascotita } from "@/lib/mascotita/auth";
import { listarNarraciones, narrar } from "@/lib/mascotita/narrador";
import { errorResponse, makeLimiter, tooFast } from "../_lib";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const limited = makeLimiter(8_000);

export async function GET(req: NextRequest) {
  const g = await guardMascotita(req);
  if ("response" in g) return g.response;
  try {
    return NextResponse.json(await listarNarraciones());
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  const g = await guardMascotita(req);
  if ("response" in g) return g.response;
  if (limited(g.user.uid)) return tooFast();
  try {
    return NextResponse.json({ narracion: await narrar(g.user.uid) });
  } catch (err) {
    return errorResponse(err);
  }
}
