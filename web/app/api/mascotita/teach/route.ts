// POST /api/mascotita/teach — enseñarle algo `{ text }`. Lo guarda como
// creencia con confianza media que solo se afianza si lo comprueba explorando
// (TeachResponse, con `contradiction` si choca con lo que ya vio).
import { NextRequest, NextResponse } from "next/server";
import { guardMascotita } from "@/lib/mascotita/auth";
import { teachPet } from "@/lib/mascotita/chat";
import { BOUNDS } from "@/lib/mascotita/config";
import { errorResponse, invalidBody, readBody, textField } from "../_lib";

export const dynamic = "force-dynamic";
// La respuesta de la IA puede tardar ~12 s; el default de Hobby (10 s) la mataría.
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const g = await guardMascotita(req);
  if ("response" in g) return g.response;

  const body = await readBody(req);
  if (!body) return invalidBody();
  const text = textField(body, "text", BOUNDS.teachMaxChars, {
    tooLong: `Muy largo: máximo ${BOUNDS.teachMaxChars} caracteres por enseñanza.`,
  });
  if (text instanceof NextResponse) return text;
  if (!text) {
    return NextResponse.json({ error: "Escribe lo que quieres enseñarle." }, { status: 400 });
  }

  try {
    return NextResponse.json(await teachPet(g.user.uid, text));
  } catch (err) {
    return errorResponse(err);
  }
}
