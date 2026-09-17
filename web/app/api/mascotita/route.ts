// DELETE /api/mascotita — empezar de cero: borra la colonia entera (mundo,
// criaturas, cerebros, crónica). Exige `{ confirm: "BORRAR" }`.
import { NextRequest, NextResponse } from "next/server";
import { guardMascotita } from "@/lib/mascotita/auth";
import { borrarTodo } from "@/lib/mascotita/service";
import { errorResponse, readBody } from "./_lib";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest) {
  const g = await guardMascotita(req);
  if ("response" in g) return g.response;

  const body = await readBody(req);
  if (body?.confirm !== "BORRAR") {
    return NextResponse.json({ error: "Escribe BORRAR para confirmar que quieres empezar de cero." }, { status: 400 });
  }

  try {
    await borrarTodo();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
