// GET /api/mascotita/diary?limit=60 — el diario de la mascota, de la entrada
// más nueva a la más vieja.
import { NextRequest, NextResponse } from "next/server";
import { guardMascotita } from "@/lib/mascotita/auth";
import { diaryView } from "@/lib/mascotita/cognition";
import { listDiary } from "@/lib/mascotita/db";
import { errorResponse, intParam } from "../_lib";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const g = await guardMascotita(req);
  if ("response" in g) return g.response;

  const limit = intParam(req, "limit", 60, 1, 200);

  try {
    const entries = await listDiary(g.user.uid, limit);
    return NextResponse.json({ entries: entries.map(diaryView) });
  } catch (err) {
    return errorResponse(err);
  }
}
