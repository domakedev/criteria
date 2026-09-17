// GET /api/mascotita/cron — un latido de la colonia. Lo llama la GitHub Action
// cada 15 minutos (y el cron diario de Vercel como respaldo). NO usa sesión
// de usuario: solo el secreto `Authorization: Bearer <CRON_SECRET>`.
import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/mascotita/auth";
import { latir } from "@/lib/mascotita/latido";
import { errorResponse } from "../_lib";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const check = verifyCronSecret(req);
  if (check === "unconfigured") {
    return NextResponse.json({ error: "El cron no está configurado (falta CRON_SECRET)." }, { status: 503 });
  }
  if (check === "forbidden") {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  try {
    const r = await latir("cron");
    // Sin colonia o con candado puesto no es un error del cron: se reporta y ya.
    return NextResponse.json(r);
  } catch (err) {
    return errorResponse(err);
  }
}
