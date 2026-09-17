// GET /api/mascotita/knowledge?order=score|recent|fading&limit=100 — lo que
// sabe la mascota: lo más seguro, lo más reciente o lo que se le está olvidando.
import { NextRequest, NextResponse } from "next/server";
import { guardMascotita } from "@/lib/mascotita/auth";
import { conceptView } from "@/lib/mascotita/cognition";
import { listConcepts } from "@/lib/mascotita/db";
import { errorResponse, intParam } from "../_lib";

export const dynamic = "force-dynamic";

const ORDERS = ["score", "recent", "fading"] as const;
type Order = (typeof ORDERS)[number];

export async function GET(req: NextRequest) {
  const g = await guardMascotita(req);
  if ("response" in g) return g.response;

  const orderRaw = req.nextUrl.searchParams.get("order") ?? "score";
  if (!(ORDERS as readonly string[]).includes(orderRaw)) {
    return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  }
  const order = orderRaw as Order;
  const limit = intParam(req, "limit", 100, 1, 200);

  try {
    const concepts = await listConcepts(g.user.uid, order, limit);
    return NextResponse.json({ concepts: concepts.map(conceptView) });
  } catch (err) {
    return errorResponse(err);
  }
}
