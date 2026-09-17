// GET /api/mascotita/allowed — ¿este usuario puede criar una mascota?
// La usa el menú de la app para mostrar el enlace solo a quien corresponde
// (la lista está en MASCOTITA_OWNERS). No toca la base: es una comprobación
// barata de sesión + allowlist.
import { NextRequest, NextResponse } from "next/server";
import { isOwner, verifyPetUser } from "@/lib/mascotita/auth";
import { firebaseAdminConfigured } from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!firebaseAdminConfigured()) return NextResponse.json({ allowed: false });
  const user = await verifyPetUser(req);
  return NextResponse.json({ allowed: !!user && isOwner(user) });
}
