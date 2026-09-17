// GET /api/mascotita/cron — barrido programado (Vercel Cron): una exploración
// por mascota activa mientras alcance el tiempo. NO usa sesión de usuario:
// solo el secreto `Authorization: Bearer <CRON_SECRET>`.
import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/mascotita/auth";
import { runCron } from "@/lib/mascotita/service";
import { errorResponse } from "../_lib";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const check = verifyCronSecret(req);
  if (check === "unconfigured") {
    return NextResponse.json(
      { error: "El cron no está configurado (falta CRON_SECRET)." },
      { status: 503 },
    );
  }
  if (check === "forbidden") {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    return NextResponse.json(await runCron());
  } catch (err) {
    return errorResponse(err);
  }
}
