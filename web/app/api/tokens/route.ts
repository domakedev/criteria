// Token MCP personal del usuario en sesión.
// GET    /api/tokens — estado actual (prefijo y fecha, nunca el token).
// POST   /api/tokens — crea o rota el token; devuelve el valor en claro UNA vez.
// DELETE /api/tokens — lo revoca.
import { NextRequest, NextResponse } from "next/server";
import {
  createMcpToken,
  firebaseAdminConfigured,
  getMcpTokenInfo,
  revokeMcpToken,
  verifyRequestUser,
  type AuthedUser,
} from "@/lib/admin";

async function guard(req: NextRequest): Promise<AuthedUser | NextResponse> {
  if (!firebaseAdminConfigured()) {
    return NextResponse.json(
      { error: "El servidor no está configurado (falta FIREBASE_SERVICE_ACCOUNT)." },
      { status: 503 },
    );
  }
  const user = await verifyRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Inicia sesión primero." }, { status: 401 });
  }
  return user;
}

export async function GET(req: NextRequest) {
  const user = await guard(req);
  if (user instanceof NextResponse) return user;
  return NextResponse.json({ token: await getMcpTokenInfo(user.uid) });
}

export async function POST(req: NextRequest) {
  const user = await guard(req);
  if (user instanceof NextResponse) return user;
  const token = await createMcpToken(user.uid, user.name);
  return NextResponse.json(
    { token, info: await getMcpTokenInfo(user.uid) },
    { status: 201 },
  );
}

export async function DELETE(req: NextRequest) {
  const user = await guard(req);
  if (user instanceof NextResponse) return user;
  await revokeMcpToken(user.uid);
  return NextResponse.json({ ok: true });
}
