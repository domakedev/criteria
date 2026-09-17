// GET /api/mascotita/criatura?cid=… — la mente de una criatura, viva o muerta.
import { NextRequest, NextResponse } from "next/server";
import { guardMascotita } from "@/lib/mascotita/auth";
import { getCriatura } from "@/lib/mascotita/service";
import { errorResponse, invalidBody } from "../_lib";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const g = await guardMascotita(req);
  if ("response" in g) return g.response;
  const cid = req.nextUrl.searchParams.get("cid") ?? "";
  if (!/^[a-z0-9-]{3,40}$/.test(cid)) return invalidBody();
  try {
    return NextResponse.json({ criatura: await getCriatura(cid) });
  } catch (err) {
    return errorResponse(err);
  }
}
