// POST /api/mascotita/latido — un latido pedido desde la página (`manual`) o
// disparado por ella al notar atraso (`catchup`). Mismo ciclo que el cron,
// con la sesión del dueño en vez del secreto. 1 petición cada 5 s por usuario.
import { NextRequest, NextResponse } from "next/server";
import { guardMascotita } from "@/lib/mascotita/auth";
import { latir } from "@/lib/mascotita/latido";
import { errorResponse, invalidBody, makeLimiter, readBody, tooFast } from "../_lib";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const limited = makeLimiter(5_000);

export async function POST(req: NextRequest) {
  const g = await guardMascotita(req);
  if ("response" in g) return g.response;
  const body = await readBody(req);
  if (!body) return invalidBody();
  const reason = body.reason;
  if (reason !== "manual" && reason !== "catchup") return invalidBody();
  if (limited(g.user.uid)) return tooFast();
  try {
    const result = await latir(reason);
    if (result.skipped === "locked") {
      return NextResponse.json({ error: "La colonia ya está latiendo. Espera a que termine.", result }, { status: 409 });
    }
    if (result.skipped === "sinColonia") {
      return NextResponse.json({ error: "Todavía no hay colonia. Fúndala primero.", result }, { status: 404 });
    }
    return NextResponse.json({ result });
  } catch (err) {
    return errorResponse(err);
  }
}
