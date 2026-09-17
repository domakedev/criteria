// Acceso a Firestore de la mascotita. Misma app "admin" que el resto de la
// web (adminDb() de lib/admin). Aquí no hay lógica cognitiva: solo leer,
// escribir y el candado del tick. Reglas de la casa:
//   · ningún query combina where + orderBy sobre campos distintos (sin índices
//     compuestos); si hace falta, se ordena en memoria.
//   · fechas como ISO string (UTC), nunca Timestamp.
//   · ningún `undefined` llega a un documento (Firestore lo rechaza): todo pasa
//     por clean() antes de escribirse.
//   · las escrituras grandes van en lotes de ≤ 400 operaciones.
//
// Colecciones (ver cabecera de types.ts):
//   mascotas/{uid}                      PetDoc
//   mascotas/{uid}/conocimiento/{slug}  ConceptDoc
//   mascotas/{uid}/memorias/{id}        MemoryDoc
//   mascotas/{uid}/diario/{id}          DiaryEntryDoc
//   mascotas/{uid}/charlas/{id}         ChatDoc
//   mascotas/{uid}/entornos/{envId}     EnvStateDoc
//   mascotas/{uid}/ticks/{seq6}         TickDoc (id = seq con 6 dígitos)
//   mascotita_cache/repoTree            RepoTreeCache
//   mascotita_cache/usage               UsageDoc
import {
  FieldValue,
  type CollectionReference,
  type DocumentReference,
  type Query,
  type Transaction,
  type WriteBatch,
} from "firebase-admin/firestore";
import { adminDb } from "@/lib/admin";
import { BOUNDS, CAPS, cfg } from "./config";
import type {
  ChatDoc,
  ConceptDoc,
  DiaryEntryDoc,
  EnvStateDoc,
  MemoryDoc,
  PetDoc,
  RepoTreeCache,
  TickDoc,
  TickReason,
  TickSkipReason,
  UsageDoc,
} from "./types";

const PETS = "mascotas";
const CACHE = "mascotita_cache";
/** Tope de operaciones por WriteBatch (Firestore admite 500; dejamos margen). */
const BATCH_MAX = 400;
/** Tamaño de los lotes al borrar subcolecciones. */
const DELETE_CHUNK = 200;

// --- utilidades ---

/**
 * Quita los `undefined` (y convierte NaN/Infinity en null) de un objeto antes
 * de escribirlo: Firestore rechaza documentos con campos undefined. El viaje
 * por JSON es la forma más simple y segura de hacerlo en profundidad.
 */
function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Clave de día "YYYY-MM-DD" en America/Lima (independiente de cognition.ts). */
function dayKeyLima(d: Date): string {
  // en-CA formatea como YYYY-MM-DD, justo lo que necesitamos
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Id del documento de un tick: seq con 6 dígitos, para que ordene como texto. */
function tickId(seq: number): string {
  return String(seq).padStart(6, "0");
}

function sub(uid: string, name: string): CollectionReference {
  return petRef(uid).collection(name);
}

function docsOf<T>(snap: FirebaseFirestore.QuerySnapshot): T[] {
  return snap.docs.map((d) => d.data() as T);
}

// --- mascota ---

export function petRef(uid: string): DocumentReference {
  return adminDb().collection(PETS).doc(uid);
}

export async function getPet(uid: string): Promise<PetDoc | null> {
  const snap = await petRef(uid).get();
  return snap.exists ? (snap.data() as PetDoc) : null;
}

/** create(): falla si ya existe → devolvemos false en vez de lanzar. */
export async function createPet(pet: PetDoc): Promise<boolean> {
  try {
    await petRef(pet.uid).create(clean(pet));
    return true;
  } catch (err) {
    // ALREADY_EXISTS (código 6 de gRPC)
    const code = (err as { code?: number | string }).code;
    if (code === 6 || code === "already-exists" || code === "ALREADY_EXISTS") return false;
    throw err;
  }
}

export async function savePet(uid: string, patch: Partial<PetDoc>): Promise<void> {
  await petRef(uid).set(clean(patch), { merge: true });
}

// --- candado del tick ---

export type LeaseResult =
  | { ok: true; pet: PetDoc; seq: number; firstTickOfDay: boolean }
  | { ok: false; skipped: TickSkipReason; retryAt: string | null };

/**
 * Toma el candado del tick en UNA transacción: comprueba existencia, candado
 * vigente, cambio de día (reinicia contadores), topes diarios y cooldowns, y
 * si todo pasa escribe lock + tickSeq + contadores. Devuelve el pet YA
 * actualizado para que el orquestador no tenga que releerlo.
 */
export async function acquireLease(uid: string, reason: TickReason, now: Date): Promise<LeaseResult> {
  const ref = petRef(uid);
  const c = cfg();
  const nowMs = now.getTime();
  const nowIso = now.toISOString();
  const today = dayKeyLima(now);

  return adminDb().runTransaction(async (tx: Transaction): Promise<LeaseResult> => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false, skipped: "nopet", retryAt: null };
    const pet = snap.data() as PetDoc;
    if (!pet.active) return { ok: false, skipped: "inactive", retryAt: null };

    // candado vigente de otro tick
    if (pet.lock && Date.parse(pet.lock.until) > nowMs) {
      return { ok: false, skipped: "locked", retryAt: pet.lock.until };
    }

    // cambio de día: se reinician los contadores; sweptKey se conserva porque
    // el barrido lo decide el orquestador comparándola con hoy
    const day = { ...pet.day };
    if (day.key !== today) {
      day.key = today;
      day.ticks = 0;
      day.manualTicks = 0;
      day.llmCalls = 0;
      day.chats = 0;
      day.teachings = 0;
      day.absenceApplied = false;
    }
    const firstTickOfDay = day.ticks === 0;

    // topes y cooldowns
    if (day.ticks >= c.maxTicksDay) return { ok: false, skipped: "cap", retryAt: null };
    if (reason === "manual") {
      if (day.manualTicks >= c.maxManualTicksDay) return { ok: false, skipped: "cap", retryAt: null };
      if (day.lastManualAt) {
        const readyMs = Date.parse(day.lastManualAt) + c.manualCooldownMin * 60_000;
        if (readyMs > nowMs) {
          return { ok: false, skipped: "cooldown", retryAt: new Date(readyMs).toISOString() };
        }
      }
    }
    if (reason === "cron" && pet.lastTickAt) {
      const sinceH = (nowMs - Date.parse(pet.lastTickAt)) / 3_600_000;
      if (sinceH < BOUNDS.cronMinHours) return { ok: false, skipped: "cap", retryAt: null };
    }

    // todo en orden: tomamos el candado
    const seq = pet.tickSeq + 1;
    const lock = { until: new Date(nowMs + BOUNDS.lockMs).toISOString(), seq, reason };
    day.ticks += 1;
    if (reason === "manual") {
      day.manualTicks += 1;
      day.lastManualAt = nowIso;
    }
    tx.update(ref, { lock, tickSeq: seq, day, updatedAt: nowIso });
    return {
      ok: true,
      pet: { ...pet, lock, tickSeq: seq, day, updatedAt: nowIso },
      seq,
      firstTickOfDay,
    };
  });
}

/** Suelta el candado solo si sigue siendo el nuestro (mismo seq). */
export async function releaseLease(uid: string, seq: number): Promise<void> {
  const ref = petRef(uid);
  await adminDb().runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const pet = snap.data() as PetDoc;
    if (pet.lock && pet.lock.seq === seq) {
      tx.update(ref, { lock: null, updatedAt: new Date().toISOString() });
    }
  });
}

// --- conjunto de trabajo del tick ---

export interface WorkingSet {
  concepts: ConceptDoc[];
  toTest: ConceptDoc[];
  memories: MemoryDoc[];
  envState: EnvStateDoc | null;
  recentChats: ChatDoc[];
}

/**
 * Lo que un tick necesita en memoria: conocimiento top por score, enseñanzas
 * por probar, memorias más salientes, cursor del entorno y últimas charlas.
 * Todo en paralelo; cada query es de un solo campo.
 */
export async function loadWorkingSet(
  uid: string,
  envId: string,
  opts?: { concepts?: number; memories?: number; chats?: number },
): Promise<WorkingSet> {
  const nConcepts = opts?.concepts ?? 60;
  const nMemories = opts?.memories ?? 30;
  const nChats = opts?.chats ?? 6;
  const [concepts, toTest, memories, envState, chats] = await Promise.all([
    sub(uid, "conocimiento").orderBy("score", "desc").limit(nConcepts).get(),
    sub(uid, "conocimiento").where("toTest", "==", true).limit(5).get(),
    sub(uid, "memorias").orderBy("salience", "desc").limit(nMemories).get(),
    sub(uid, "entornos").doc(envId).get(),
    sub(uid, "charlas").orderBy("at", "desc").limit(nChats).get(),
  ]);
  return {
    concepts: docsOf<ConceptDoc>(concepts),
    toTest: docsOf<ConceptDoc>(toTest),
    memories: docsOf<MemoryDoc>(memories),
    envState: envState.exists ? (envState.data() as EnvStateDoc) : null,
    // las charlas se devuelven en orden cronológico (la query trae las últimas)
    recentChats: docsOf<ChatDoc>(chats).reverse(),
  };
}

/** Para el barrido diario: todo el conocimiento (≤ CAPS.concepts docs). */
export async function loadAllConcepts(uid: string): Promise<ConceptDoc[]> {
  const snap = await sub(uid, "conocimiento").limit(CAPS.concepts * 2).get();
  return docsOf<ConceptDoc>(snap);
}

/** Para el barrido diario: todas las memorias (≤ CAPS.memories docs). */
export async function loadAllMemories(uid: string): Promise<MemoryDoc[]> {
  const snap = await sub(uid, "memorias").limit(CAPS.memories * 2).get();
  return docsOf<MemoryDoc>(snap);
}

// --- persistir un tick ---

export interface TickWrite {
  pet: PetDoc;
  /** foto del pet al tomar el candado: para fusionar lo que el dueño hizo durante el tick */
  base?: PetDoc;
  concepts: ConceptDoc[];
  deletedConcepts: string[];
  memories: MemoryDoc[];
  deletedMemories: string[];
  diary: DiaryEntryDoc[];
  envStates: EnvStateDoc[];
  tick: TickDoc | null;
}

type BatchOp = (b: WriteBatch) => void;

/** Ejecuta una lista de operaciones en lotes de ≤ BATCH_MAX, en orden. */
async function commitInBatches(ops: BatchOp[]): Promise<void> {
  const db = adminDb();
  for (let i = 0; i < ops.length; i += BATCH_MAX) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + BATCH_MAX)) op(batch);
    await batch.commit();
  }
}

/**
 * Guarda TODO lo que produjo un tick: el pet (con lock = null, que es lo que
 * libera el candado), conceptos (merge), memorias, diario, estados de entorno
 * y el log del tick. Si el commit falla se reintenta una vez (los set son
 * idempotentes); si vuelve a fallar, al menos se intenta soltar el candado
 * para que la mascota no quede bloqueada 55 s y se relanza el error.
 */
export async function persistTick(uid: string, w: TickWrite): Promise<void> {
  const ref = petRef(uid);
  const ops: BatchOp[] = [];

  const conocimiento = sub(uid, "conocimiento");
  for (const c of w.concepts) {
    const data = clean(c);
    ops.push((b) => b.set(conocimiento.doc(c.id), data, { merge: true }));
  }
  for (const id of w.deletedConcepts) ops.push((b) => b.delete(conocimiento.doc(id)));

  const memorias = sub(uid, "memorias");
  for (const m of w.memories) {
    const data = clean(m);
    ops.push((b) => b.set(memorias.doc(m.id), data));
  }
  for (const id of w.deletedMemories) ops.push((b) => b.delete(memorias.doc(id)));

  const diario = sub(uid, "diario");
  for (const e of w.diary) {
    const data = clean(e);
    ops.push((b) => b.set(diario.doc(e.id), data));
  }

  const entornos = sub(uid, "entornos");
  for (const s of w.envStates) {
    const data = clean(s);
    ops.push((b) => b.set(entornos.doc(s.envId), data));
  }

  if (w.tick) {
    const data = clean(w.tick);
    const id = tickId(w.tick.seq);
    ops.push((b) => b.set(sub(uid, "ticks").doc(id), data));
  }

  // El pet va AL FINAL y en transacción: fusiona lo que el dueño hizo
  // mientras el tick corría (charlas, enseñanzas, mudanzas, "ya lo leí") y es
  // lo que libera el candado — si lo anterior falló, el candado sigue puesto
  // hasta el reintento o hasta que caduque.
  const writePet = async () => {
    await adminDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return; // la borraron durante el tick: no la resucitamos
      const fresh = snap.data() as PetDoc;
      const merged = mergePetAfterTick(fresh, w.pet, w.base ?? w.pet);
      tx.set(ref, clean({ ...merged, lock: null }));
    });
  };

  try {
    await commitInBatches(ops);
    await writePet();
  } catch (first) {
    try {
      await commitInBatches(ops);
      await writePet();
    } catch {
      // no pudimos guardar: que al menos no quede el candado puesto
      try {
        await releaseLease(uid, w.pet.tickSeq);
      } catch {
        // si ni esto sale, el candado caduca solo en BOUNDS.lockMs
      }
      throw first;
    }
  }
}

/**
 * Fusión pet tras el tick: el tick manda en lo que es suyo (política, rasgos,
 * xp, ánimo…); en los campos que también toca el dueño se aplican DELTAS sobre
 * el valor fresco (contadores) o gana el más reciente (fechas, entorno).
 */
function mergePetAfterTick(fresh: PetDoc, ours: PetDoc, base: PetDoc): PetDoc {
  const inc = (f: number, o: number, b: number) => Math.max(0, f + (o - b));
  const later = (a: string | null, b: string | null) => (a && b ? (a > b ? a : b) : a ?? b);
  const day =
    fresh.day.key === ours.day.key
      ? {
          ...ours.day,
          chats: inc(fresh.day.chats, ours.day.chats, base.day.chats),
          teachings: inc(fresh.day.teachings, ours.day.teachings, base.day.teachings),
          llmCalls: inc(fresh.day.llmCalls, ours.day.llmCalls, base.day.llmCalls),
        }
      : ours.day;
  return {
    ...ours,
    env: ours.env !== base.env ? ours.env : fresh.env,
    allowedEnvs: Array.from(new Set([...fresh.allowedEnvs, ...ours.allowedEnvs])),
    stats: {
      ...ours.stats,
      chats: inc(fresh.stats.chats, ours.stats.chats, base.stats.chats),
      teachings: inc(fresh.stats.teachings, ours.stats.teachings, base.stats.teachings),
      llmCalls: inc(fresh.stats.llmCalls, ours.stats.llmCalls, base.stats.llmCalls),
      concepts: inc(fresh.stats.concepts, ours.stats.concepts, base.stats.concepts),
      taughtConcepts: inc(fresh.stats.taughtConcepts, ours.stats.taughtConcepts, base.stats.taughtConcepts),
    },
    day,
    lastChatAt: later(fresh.lastChatAt, ours.lastChatAt),
    lastSeenAt: later(fresh.lastSeenAt, ours.lastSeenAt) ?? ours.lastSeenAt,
    pendingQuestion:
      ours.pendingQuestion !== base.pendingQuestion ? ours.pendingQuestion : fresh.pendingQuestion,
    active: fresh.active,
  };
}

/** Incrementos atómicos de contadores (rutas con punto: "day.chats"). */
export async function bumpPetCounters(uid: string, inc: Record<string, number>): Promise<void> {
  const entries = Object.entries(inc).filter(([, n]) => Number.isFinite(n) && n !== 0);
  if (entries.length === 0) return;
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const [k, n] of entries) patch[k] = FieldValue.increment(n);
  await petRef(uid).update(patch);
}

/** Conceptos por id (los que no existen se omiten). */
export async function getConcepts(uid: string, ids: string[]): Promise<ConceptDoc[]> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return [];
  const col = sub(uid, "conocimiento");
  const snaps = await adminDb().getAll(...unique.map((id) => col.doc(id)));
  return snaps.filter((s) => s.exists).map((s) => s.data() as ConceptDoc);
}

// --- conocimiento ---

export async function listConcepts(
  uid: string,
  order: "score" | "recent" | "fading",
  limit: number,
): Promise<ConceptDoc[]> {
  const col = sub(uid, "conocimiento");
  let q: Query;
  if (order === "score") q = col.orderBy("score", "desc").limit(limit);
  else if (order === "recent") q = col.orderBy("lastSeenAt", "desc").limit(limit);
  else q = col.orderBy("confidence", "asc").limit(limit * 2);
  const docs = docsOf<ConceptDoc>(await q.get());
  if (order !== "fading") return docs;
  // "se le olvida": lo que no fue enseñado y anda flojo de confianza
  return docs.filter((c) => !c.taught && c.confidence < 0.3).slice(0, limit);
}

export async function upsertConcepts(uid: string, concepts: ConceptDoc[]): Promise<void> {
  if (concepts.length === 0) return;
  const col = sub(uid, "conocimiento");
  await commitInBatches(
    concepts.map((c) => {
      const data = clean(c);
      return (b: WriteBatch) => b.set(col.doc(c.id), data, { merge: true });
    }),
  );
}

export async function deleteConcepts(uid: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const col = sub(uid, "conocimiento");
  await commitInBatches(ids.map((id) => (b: WriteBatch) => b.delete(col.doc(id))));
}

// --- memorias ---

export async function listMemories(uid: string, limit: number): Promise<MemoryDoc[]> {
  const snap = await sub(uid, "memorias").orderBy("salience", "desc").limit(limit).get();
  return docsOf<MemoryDoc>(snap);
}

// --- diario ---

export async function listDiary(uid: string, limit: number): Promise<DiaryEntryDoc[]> {
  const snap = await sub(uid, "diario").orderBy("at", "desc").limit(limit).get();
  return docsOf<DiaryEntryDoc>(snap);
}

export async function addDiary(uid: string, entries: DiaryEntryDoc[]): Promise<void> {
  if (entries.length === 0) return;
  const col = sub(uid, "diario");
  await commitInBatches(
    entries.map((e) => {
      const data = clean(e);
      return (b: WriteBatch) => b.set(col.doc(e.id), data);
    }),
  );
}

// --- charlas ---

/** Últimas `limit` charlas, devueltas en orden cronológico (viejas → nuevas). */
export async function listChats(uid: string, limit: number): Promise<ChatDoc[]> {
  const snap = await sub(uid, "charlas").orderBy("at", "desc").limit(limit).get();
  return docsOf<ChatDoc>(snap).reverse();
}

/** Guarda charlas y, si la colección pasa de CAPS.chats, borra las más viejas. */
export async function addChats(uid: string, docs: ChatDoc[]): Promise<void> {
  if (docs.length === 0) return;
  const col = sub(uid, "charlas");
  await commitInBatches(
    docs.map((d) => {
      const data = clean(d);
      return (b: WriteBatch) => b.set(col.doc(d.id), data);
    }),
  );
  // poda perezosa: un count agregado (barato) y solo si sobra algo, un query
  const total = (await col.count().get()).data().count;
  const over = total - CAPS.chats;
  if (over <= 0) return;
  const old = await col.orderBy("at", "asc").limit(over).select().get();
  await commitInBatches(old.docs.map((d) => (b: WriteBatch) => b.delete(d.ref)));
}

// --- entornos ---

export async function getEnvState(uid: string, envId: string): Promise<EnvStateDoc | null> {
  const snap = await sub(uid, "entornos").doc(envId).get();
  return snap.exists ? (snap.data() as EnvStateDoc) : null;
}

export async function saveEnvState(uid: string, s: EnvStateDoc): Promise<void> {
  await sub(uid, "entornos").doc(s.envId).set(clean(s));
}

// --- cron y mantenimiento ---

/** Mascotas activas para el cron. Sin orderBy (ordena quien llama). */
export async function listActivePets(limit: number): Promise<PetDoc[]> {
  const snap = await adminDb().collection(PETS).where("active", "==", true).limit(limit).get();
  return docsOf<PetDoc>(snap);
}

/** Borra una subcolección entera en lotes de DELETE_CHUNK. */
async function deleteCollection(col: CollectionReference): Promise<void> {
  for (;;) {
    const snap = await col.limit(DELETE_CHUNK).select().get();
    if (snap.empty) return;
    await commitInBatches(snap.docs.map((d) => (b: WriteBatch) => b.delete(d.ref)));
    if (snap.size < DELETE_CHUNK) return;
  }
}

/** "Empezar de cero": borra subcolecciones y luego el documento de la mascota. */
export async function resetPet(uid: string): Promise<void> {
  for (const name of ["conocimiento", "memorias", "diario", "charlas", "entornos", "ticks"]) {
    await deleteCollection(sub(uid, name));
  }
  await petRef(uid).delete();
}

/** Deja como máximo CAPS.ticks logs de tick, borrando los de menor seq. */
export async function pruneTicks(uid: string): Promise<void> {
  const col = sub(uid, "ticks");
  const snap = await col.orderBy("seq", "asc").select().get();
  const over = snap.size - CAPS.ticks;
  if (over <= 0) return;
  await commitInBatches(snap.docs.slice(0, over).map((d) => (b: WriteBatch) => b.delete(d.ref)));
}

// --- caché compartida ---

export async function getRepoTreeCache(): Promise<RepoTreeCache | null> {
  const snap = await adminDb().collection(CACHE).doc("repoTree").get();
  return snap.exists ? (snap.data() as RepoTreeCache) : null;
}

export async function saveRepoTreeCache(c: RepoTreeCache): Promise<void> {
  await adminDb().collection(CACHE).doc("repoTree").set(clean(c));
}

/**
 * Suma `n` llamadas LLM al contador global del día. Si el doc es de otro día
 * (o no existe) se reinicia; si no, se incrementa. Transacción para que dos
 * ticks en paralelo no se pisen el reinicio.
 */
export async function bumpGlobalLlm(dayKey: string, n: number): Promise<void> {
  const ref = adminDb().collection(CACHE).doc("usage");
  await adminDb().runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    const usage = snap.exists ? (snap.data() as UsageDoc) : null;
    if (!usage || usage.day !== dayKey) {
      tx.set(ref, { day: dayKey, calls: n } satisfies UsageDoc);
    } else {
      tx.update(ref, { calls: FieldValue.increment(n) });
    }
  });
}

/** Llamadas LLM globales hechas hoy (0 si el contador es de otro día). */
export async function getGlobalLlm(dayKey: string): Promise<number> {
  const snap = await adminDb().collection(CACHE).doc("usage").get();
  if (!snap.exists) return 0;
  const usage = snap.data() as UsageDoc;
  return usage.day === dayKey && typeof usage.calls === "number" ? usage.calls : 0;
}
