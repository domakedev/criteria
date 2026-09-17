// POST /api/mascotita/hatch — nace la mascota con el nombre que le pongas.
// 201 con `{ pet }`; si ya tenías una, 200 con la que existe (no se pisa).
import { NextRequest, NextResponse } from "next/server";
import { guardMascotita } from "@/lib/mascotita/auth";
import { BOUNDS } from "@/lib/mascotita/config";
import { getPet } from "@/lib/mascotita/db";
import { hatch } from "@/lib/mascotita/service";
import { errorResponse, invalidBody, readBody, textField } from "../_lib";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const g = await guardMascotita(req);
  if ("response" in g) return g.response;

  const body = await readBody(req);
  if (!body) return invalidBody();
  const name = textField(body, "name", BOUNDS.nameMaxChars, {
    singleLine: true,
    tooLong: `El nombre es muy largo: máximo ${BOUNDS.nameMaxChars} letras.`,
  });
  if (name instanceof NextResponse) return name;
  if (!name) {
    return NextResponse.json({ error: "Ponle un nombre primero." }, { status: 400 });
  }

  try {
    // hatch() devuelve la vista en ambos casos; miramos antes si ya existía
    // para responder 201 (nació) o 200 (ya estaba).
    const existed = (await getPet(g.user.uid)) !== null;
    const pet = await hatch(g.user.uid, name);
    return NextResponse.json({ pet }, { status: existed ? 200 : 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
