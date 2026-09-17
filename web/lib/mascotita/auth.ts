// Quién puede entrar a la mascotita. Reutiliza la sesión de Firebase (ID token
// en `Authorization: Bearer …`, igual que lib/admin.ts) y añade la lista de
// dueños (MASCOTITA_OWNERS): si está vacía, cualquier usuario con sesión
// tiene su propia mascota; si no, solo los uids o correos verificados listados.
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { adminAuth, firebaseAdminConfigured } from "@/lib/admin";
import { cfg } from "./config";

export interface PetUser {
  uid: string;
  name: string;
  email: string | null;
  emailVerified: boolean;
}

/** Lee y verifica el ID token del cliente; null si falta o es inválido. */
export async function verifyPetUser(req: NextRequest): Promise<PetUser | null> {
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    return {
      uid: decoded.uid,
      name: typeof decoded.name === "string" && decoded.name.trim() ? decoded.name : "anónimo",
      email: typeof decoded.email === "string" ? decoded.email : null,
      emailVerified: decoded.email_verified === true,
    };
  } catch {
    return null;
  }
}

/**
 * Lista de dueños vacía → cualquiera con sesión. Si no, entra por uid o por
 * correo (sin distinguir mayúsculas) siempre que el correo esté verificado.
 */
export function isOwner(u: PetUser): boolean {
  const owners = cfg().owners;
  if (owners.length === 0) return true;
  if (owners.includes(u.uid)) return true;
  if (!u.email || !u.emailVerified) return false;
  const email = u.email.toLowerCase();
  return owners.some((o) => o.toLowerCase() === email);
}

/**
 * Guardia de las rutas /api/mascotita/*: devuelve el usuario o la respuesta
 * de error lista para retornar (patrón de /api/tokens).
 */
export async function guardMascotita(
  req: NextRequest,
): Promise<{ user: PetUser } | { response: NextResponse }> {
  if (!firebaseAdminConfigured()) {
    return {
      response: NextResponse.json(
        { error: "El servidor no está configurado (falta FIREBASE_SERVICE_ACCOUNT)." },
        { status: 503 },
      ),
    };
  }
  const user = await verifyPetUser(req);
  if (!user) {
    return {
      response: NextResponse.json({ error: "Inicia sesión primero." }, { status: 401 }),
    };
  }
  if (!isOwner(user)) {
    return {
      response: NextResponse.json({ error: "Esta puerta es solo para su dueño." }, { status: 403 }),
    };
  }
  return { user };
}

/**
 * Comprueba el secreto del cron (`Authorization: Bearer <CRON_SECRET>`) en
 * tiempo constante. Sin secreto configurado → "unconfigured" (la ruta responde
 * 503); longitud distinta o contenido distinto → "forbidden".
 */
export function verifyCronSecret(req: NextRequest): "ok" | "unconfigured" | "forbidden" {
  const secret = cfg().cronSecret;
  if (!secret) return "unconfigured";
  const given = Buffer.from(req.headers.get("authorization") ?? "", "utf8");
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  // timingSafeEqual exige buffers del mismo largo; si difieren, ya no coinciden
  if (given.length !== expected.length) return "forbidden";
  return timingSafeEqual(given, expected) ? "ok" : "forbidden";
}
