// POST /api/mascotita/env — mudar la mascota a otro entorno `{ env }`.
// Devuelve `{ pet }`; 400 si el lugar no existe.
import { NextRequest, NextResponse } from "next/server";
import { guardMascotita } from "@/lib/mascotita/auth";
import { moveEnv } from "@/lib/mascotita/service";
import { errorResponse, invalidBody, readBody, textField } from "../_lib";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const g = await guardMascotita(req);
  if ("response" in g) return g.response;

  const body = await readBody(req);
  if (!body) return invalidBody();
  const env = textField(body, "env", 40, { singleLine: true });
  if (env instanceof NextResponse) return env;
  if (!env) return NextResponse.json({ error: "Ese lugar no existe." }, { status: 400 });

  try {
    const pet = await moveEnv(g.user.uid, env);
    return NextResponse.json({ pet });
  } catch (err) {
    return errorResponse(err);
  }
}
