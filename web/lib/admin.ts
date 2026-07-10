// Lado servidor: Firebase Admin SDK. Aquí vive el acceso a Firestore — el
// cliente nunca toca la base directamente (las reglas lo bloquean); todo pasa
// por las rutas /api/* que verifican el ID token del usuario.
import {
  cert,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";
import type { CaseDraft, DecisionCase, Outcome, OutcomeStatus } from "./types";

export function firebaseAdminConfigured(): boolean {
  return !!process.env.FIREBASE_SERVICE_ACCOUNT;
}

function adminApp(): App {
  const existing = getApps().find((a) => a.name === "admin");
  if (existing) return existing;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT!;
  // acepta el JSON directo o en base64
  const json = raw.trim().startsWith("{")
    ? raw
    : Buffer.from(raw, "base64").toString("utf8");
  return initializeApp({ credential: cert(JSON.parse(json)) }, "admin");
}

function db(): Firestore {
  return getFirestore(adminApp());
}

// --- sesión ---

export interface AuthedUser {
  uid: string;
  name: string;
}

/** Verifica el `Authorization: Bearer <ID token>` que manda el cliente. */
export async function verifyRequestUser(
  req: NextRequest,
): Promise<AuthedUser | null> {
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  try {
    const decoded = await getAuth(adminApp()).verifyIdToken(token);
    return { uid: decoded.uid, name: decoded.name ?? "anónimo" };
  } catch {
    return null;
  }
}

// --- datos ---
// community/{id}          → casos compartidos (visibles para todos)
// users/{uid}/cases/{id}  → casos personales (solo su dueño, vía API)

const MAX_CASES = 500; // tope de lectura por consulta; suficiente para el MVP

function caseFromDoc(data: FirebaseFirestore.DocumentData): DecisionCase {
  return data as DecisionCase;
}

export async function listCommunityCases(limit = MAX_CASES): Promise<DecisionCase[]> {
  const snap = await db()
    .collection("community")
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => caseFromDoc(d.data()));
}

export async function listPersonalCases(uid: string): Promise<DecisionCase[]> {
  const snap = await db()
    .collection("users")
    .doc(uid)
    .collection("cases")
    .orderBy("createdAt", "desc")
    .limit(MAX_CASES)
    .get();
  return snap.docs.map((d) => caseFromDoc(d.data()));
}

/** Guarda un caso nuevo. layer decide si va a la comunidad o a lo privado. */
export async function createCase(
  uid: string,
  draft: CaseDraft,
): Promise<DecisionCase> {
  const layer = draft.layer === "community" ? "community" : "personal";
  const now = new Date().toISOString();
  const record: DecisionCase = {
    id: crypto.randomUUID(),
    situation: draft.situation,
    context: {
      domain: draft.context.domain,
      tags: draft.context.tags.map((t) => t.toLowerCase()),
    },
    lenses: draft.lenses,
    decision: draft.decision,
    reason: draft.reason,
    doubt: draft.doubt,
    ...(draft.expectation ? { expectation: draft.expectation } : {}),
    outcome: { status: "pending" },
    layer,
    author: draft.author,
    createdAt: now,
  };
  const ref =
    layer === "community"
      ? db().collection("community").doc(record.id)
      : db().collection("users").doc(uid).collection("cases").doc(record.id);
  // authorUid solo en el documento (no en el tipo): sirve para saber quién
  // puede cerrar el resultado de un caso comunitario
  await ref.set({ ...record, authorUid: uid });
  return record;
}

/** Cierra el bucle: registra cómo salió una decisión. Solo su autor puede. */
export async function recordOutcome(
  uid: string,
  caseId: string,
  status: Exclude<OutcomeStatus, "pending">,
  note?: string,
): Promise<boolean> {
  const outcome: Outcome = {
    status,
    ...(note ? { note } : {}),
    recordedAt: new Date().toISOString(),
  };
  const personal = db().collection("users").doc(uid).collection("cases").doc(caseId);
  if ((await personal.get()).exists) {
    await personal.update({ outcome });
    return true;
  }
  const community = db().collection("community").doc(caseId);
  const snap = await community.get();
  if (snap.exists && snap.data()?.authorUid === uid) {
    await community.update({ outcome });
    return true;
  }
  return false;
}
