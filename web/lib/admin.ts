// Lado servidor: Firebase Admin SDK. Aquí vive el acceso a Firestore — el
// cliente nunca toca la base directamente (las reglas lo bloquean); todo pasa
// por las rutas /api/* que verifican el ID token del usuario.
import { createHash, randomBytes } from "node:crypto";
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

/**
 * Los casos comunitarios que ESTE usuario aportó: en "Mis decisiones" debe
 * poder cerrar también el ciclo de lo que compartió. Sin orderBy en la query
 * (where + orderBy sobre campos distintos exigiría un índice compuesto);
 * se ordena en memoria.
 */
export async function listOwnCommunityCases(uid: string): Promise<DecisionCase[]> {
  const snap = await db()
    .collection("community")
    .where("authorUid", "==", uid)
    .limit(MAX_CASES)
    .get();
  return snap.docs
    .map((d) => caseFromDoc(d.data()))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
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

// --- Tokens MCP ---
// Un token personal (formato "crit_…") permite que una IA externa — Claude u
// otro cliente MCP — use /api/mcp en nombre del usuario. Solo se guarda el
// hash SHA-256: el token en claro se muestra UNA vez al crearlo.
// apiTokens/{hash} → { uid, name, createdAt }   (búsqueda inversa al verificar)
// users/{uid}.mcpToken → { hash, prefix, createdAt }   (estado para la UI)

export interface McpTokenInfo {
  /** Primeros caracteres, para que el usuario reconozca su token. */
  prefix: string;
  createdAt: string;
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function getMcpTokenInfo(uid: string): Promise<McpTokenInfo | null> {
  const doc = await db().collection("users").doc(uid).get();
  const t = doc.data()?.mcpToken;
  return t?.hash ? { prefix: t.prefix ?? "crit_", createdAt: t.createdAt ?? "" } : null;
}

/** Crea (o rota) el token del usuario y devuelve el valor en claro — única vez. */
export async function createMcpToken(uid: string, name: string): Promise<string> {
  const plain = "crit_" + randomBytes(24).toString("base64url");
  const hash = tokenHash(plain);
  const prefix = plain.slice(0, 10) + "…";
  const createdAt = new Date().toISOString();

  const userRef = db().collection("users").doc(uid);
  const prevHash = (await userRef.get()).data()?.mcpToken?.hash;

  const batch = db().batch();
  if (prevHash) batch.delete(db().collection("apiTokens").doc(prevHash));
  batch.set(db().collection("apiTokens").doc(hash), { uid, name, createdAt });
  batch.set(userRef, { mcpToken: { hash, prefix, createdAt } }, { merge: true });
  await batch.commit();
  return plain;
}

export async function revokeMcpToken(uid: string): Promise<void> {
  const userRef = db().collection("users").doc(uid);
  const hash = (await userRef.get()).data()?.mcpToken?.hash;
  const batch = db().batch();
  if (hash) batch.delete(db().collection("apiTokens").doc(hash));
  batch.set(userRef, { mcpToken: null }, { merge: true });
  await batch.commit();
}

/** Resuelve un token MCP a su usuario, o null si no existe/fue revocado. */
export async function verifyMcpToken(token: string): Promise<AuthedUser | null> {
  if (!token.startsWith("crit_") || token.length < 20) return null;
  const doc = await db().collection("apiTokens").doc(tokenHash(token)).get();
  if (!doc.exists) return null;
  const data = doc.data()!;
  return { uid: String(data.uid), name: typeof data.name === "string" ? data.name : "anónimo" };
}
