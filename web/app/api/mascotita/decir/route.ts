// POST /api/mascotita/decir — el dios deja 1-3 símbolos en una zona.
// Cuerpo: { env, zona, simbolos: number[] }.
import { NextRequest, NextResponse } from "next/server";
import { guardMascotita } from "@/lib/mascotita/auth";
import { decir } from "@/lib/mascotita/service";
import { errorResponse, invalidBody, makeLimiter, readBody, tooFast } from "../_lib";

export const dynamic = "force-dynamic";

const limited = makeLimiter(2_000);

export async function POST(req: NextRequest) {
  const g = await guardMascotita(req);
  if ("response" in g) return g.response;
  const body = await readBody(req);
  if (!body) return invalidBody();
  const env = typeof body.env === "string" ? body.env : "";
  const zona = typeof body.zona === "string" ? body.zona : "";
  const simbolos = Array.isArray(body.simbolos) ? body.simbolos.filter((x): x is number => typeof x === "number") : [];
  if (!/^[a-z0-9-]{1,30}$/.test(env) || !/^[a-z0-9-]{1,40}$/.test(zona)) return invalidBody();
  if (limited(g.user.uid)) return tooFast();
  try {
    return NextResponse.json(await decir(g.user.uid, env, zona, simbolos));
  } catch (err) {
    return errorResponse(err);
  }
}
