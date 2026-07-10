// GET /api/community — los casos compartidos, visibles para todos (con o sin sesión).
import { NextResponse } from "next/server";
import { firebaseAdminConfigured, listCommunityCases } from "@/lib/admin";

export async function GET() {
  if (!firebaseAdminConfigured()) {
    return NextResponse.json(
      { error: "El servidor no está configurado (falta FIREBASE_SERVICE_ACCOUNT)." },
      { status: 503 },
    );
  }
  const cases = await listCommunityCases(100);
  return NextResponse.json({ cases });
}
