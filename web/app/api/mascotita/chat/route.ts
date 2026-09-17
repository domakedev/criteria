// POST /api/mascotita/chat — charlar con la mascota `{ text }`. Responde con
// lo que sabe (ChatResponse); 429 cuando se acabó el cupo del día.
import { NextRequest, NextResponse } from "next/server";
import { guardMascotita } from "@/lib/mascotita/auth";
import { chatWithPet } from "@/lib/mascotita/chat";
import { BOUNDS } from "@/lib/mascotita/config";
import { errorResponse, invalidBody, readBody, textField, makeLimiter, tooFast } from "../_lib";

export const dynamic = "force-dynamic";
const limited = makeLimiter(3000);
// La respuesta de la IA puede tardar ~12 s; el default de Hobby (10 s) la mataría.
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const g = await guardMascotita(req);
  if ("response" in g) return g.response;
  if (limited(g.user.uid)) return tooFast();

  const body = await readBody(req);
  if (!body) return invalidBody();
  const text = textField(body, "text", BOUNDS.chatMaxChars, {
    tooLong: `Muy largo: máximo ${BOUNDS.chatMaxChars} caracteres por mensaje.`,
  });
  if (text instanceof NextResponse) return text;
  if (!text) return NextResponse.json({ error: "Dile algo primero." }, { status: 400 });

  try {
    return NextResponse.json(await chatWithPet(g.user.uid, text));
  } catch (err) {
    return errorResponse(err);
  }
}
