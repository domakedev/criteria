// POST /api/mascotita/dios — intervenciones del dios, todas a la crónica:
//   { accion: "comida", env, zona, unidades }
//   { accion: "fuente", env, zona, porHora, horas }
import { NextRequest, NextResponse } from "next/server";
import { guardMascotita } from "@/lib/mascotita/auth";
import { dejarComida, plantarFuente } from "@/lib/mascotita/service";
import { errorResponse, invalidBody, makeLimiter, readBody, tooFast } from "../_lib";

export const dynamic = "force-dynamic";

const limited = makeLimiter(1_500);

export async function POST(req: NextRequest) {
  const g = await guardMascotita(req);
  if ("response" in g) return g.response;
  const body = await readBody(req);
  if (!body) return invalidBody();
  const env = typeof body.env === "string" ? body.env : "";
  const zona = typeof body.zona === "string" ? body.zona : "";
  if (!/^[a-z0-9-]{1,30}$/.test(env) || !/^[a-z0-9-]{1,40}$/.test(zona)) return invalidBody();
  if (limited(g.user.uid)) return tooFast();
  try {
    if (body.accion === "comida") {
      const unidades = typeof body.unidades === "number" ? body.unidades : 1;
      return NextResponse.json(await dejarComida(g.user.uid, env, zona, unidades));
    }
    if (body.accion === "fuente") {
      const porHora = typeof body.porHora === "number" ? body.porHora : 0.5;
      const horas = typeof body.horas === "number" ? body.horas : 24;
      return NextResponse.json(await plantarFuente(g.user.uid, env, zona, porHora, horas));
    }
    return invalidBody();
  } catch (err) {
    return errorResponse(err);
  }
}
