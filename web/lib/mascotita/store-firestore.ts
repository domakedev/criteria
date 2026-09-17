// Store sobre Firestore (misma app "admin" que el resto de la web). Aquí no
// hay lógica cognitiva: solo leer, escribir y el candado del latido. Reglas:
//   · ningún query combina where + orderBy sobre campos distintos (sin índices
//     compuestos); si hace falta, se ordena en memoria.
//   · fechas como ISO string (UTC), nunca Timestamp.
//   · ningún `undefined` llega a un documento: todo pasa por clean().
//   · cada operación suma a los contadores de lecturas/escrituras del proceso.
//
// Colecciones (ver cabecera de types.ts):
//   colonia/{id}                       MundoDoc
//   colonia/{id}/criaturas/{cid}       CriaturaDoc
//   colonia/{id}/cerebros/{cid}        CerebroDoc
//   colonia/{id}/cronica/{YYYY-MM-DD}  CronicaDoc
//   colonia/{id}/meta/linaje           LinajeDoc
//   mascotita_cache/repoTree           RepoTreeCache
import type { CollectionReference, DocumentReference, Transaction, WriteBatch } from "firebase-admin/firestore";
import { adminDb } from "@/lib/admin";
import { cfg } from "./config";
import { clean, type Contadores, type LeaseLatido, type Store } from "./store";
import type { CerebroDoc, CriaturaDoc, CronicaDoc, LinajeDoc, MundoDoc, RepoTreeCache } from "./types";

const COLONIAS = "colonia";
const CACHE = "mascotita_cache";
const BATCH_MAX = 400;
const DELETE_CHUNK = 200;

export class StoreFirestore implements Store {
  readonly id = "firestore" as const;
  private cont: Contadores = { lecturas: 0, escrituras: 0 };

  private mundoRef(): DocumentReference {
    return adminDb().collection(COLONIAS).doc(cfg().colonia);
  }

  private sub(name: string): CollectionReference {
    return this.mundoRef().collection(name);
  }

  contadores(): Contadores {
    return { ...this.cont };
  }

  reiniciarContadores(): void {
    this.cont = { lecturas: 0, escrituras: 0 };
  }

  private async commitInBatches(ops: Array<(b: WriteBatch) => void>): Promise<void> {
    const db = adminDb();
    for (let i = 0; i < ops.length; i += BATCH_MAX) {
      const batch = db.batch();
      for (const op of ops.slice(i, i + BATCH_MAX)) op(batch);
      await batch.commit();
    }
    this.cont.escrituras += ops.length;
  }

  private async deleteCollection(col: CollectionReference): Promise<void> {
    for (;;) {
      const snap = await col.limit(DELETE_CHUNK).select().get();
      this.cont.lecturas += Math.max(1, snap.size);
      if (snap.empty) return;
      await this.commitInBatches(snap.docs.map((d) => (b: WriteBatch) => b.delete(d.ref)));
      if (snap.size < DELETE_CHUNK) return;
    }
  }

  // --- mundo ---

  async getMundo(): Promise<MundoDoc | null> {
    this.cont.lecturas += 1;
    const snap = await this.mundoRef().get();
    return snap.exists ? (snap.data() as MundoDoc) : null;
  }

  async crearMundo(m: MundoDoc): Promise<boolean> {
    this.cont.escrituras += 1;
    try {
      await this.mundoRef().create(clean(m));
      return true;
    } catch (err) {
      const code = (err as { code?: number | string }).code;
      if (code === 6 || code === "already-exists" || code === "ALREADY_EXISTS") return false;
      throw err;
    }
  }

  async tomarLatido(now: Date, lockMs: number): Promise<LeaseLatido> {
    const ref = this.mundoRef();
    const nowMs = now.getTime();
    this.cont.lecturas += 1;
    return adminDb().runTransaction(async (tx: Transaction): Promise<LeaseLatido> => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { ok: false, skipped: "sinColonia", retryAt: null };
      const mundo = snap.data() as MundoDoc;
      if (mundo.latido.lock && Date.parse(mundo.latido.lock.until) > nowMs) {
        return { ok: false, skipped: "locked", retryAt: mundo.latido.lock.until };
      }
      const seq = mundo.latido.seq + 1;
      const latido = { ...mundo.latido, seq, lock: { until: new Date(nowMs + lockMs).toISOString(), seq } };
      tx.update(ref, { latido, updatedAt: now.toISOString() });
      this.cont.escrituras += 1;
      return { ok: true, mundo: { ...mundo, latido, updatedAt: now.toISOString() }, seq };
    });
  }

  async guardarMundo(m: MundoDoc): Promise<void> {
    this.cont.escrituras += 1;
    await this.mundoRef().set(clean(m));
  }

  async soltarLatido(seq: number): Promise<void> {
    const ref = this.mundoRef();
    this.cont.lecturas += 1;
    await adminDb().runTransaction(async (tx: Transaction) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const mundo = snap.data() as MundoDoc;
      if (mundo.latido.lock && mundo.latido.lock.seq === seq) {
        tx.update(ref, { "latido.lock": null, updatedAt: new Date().toISOString() });
        this.cont.escrituras += 1;
      }
    });
  }

  // --- criaturas ---

  async getCriatura(cid: string): Promise<CriaturaDoc | null> {
    this.cont.lecturas += 1;
    const snap = await this.sub("criaturas").doc(cid).get();
    return snap.exists ? (snap.data() as CriaturaDoc) : null;
  }

  async listarVivas(limit: number): Promise<CriaturaDoc[]> {
    const snap = await this.sub("criaturas").where("viva", "==", true).limit(limit).get();
    this.cont.lecturas += Math.max(1, snap.size);
    return snap.docs.map((d) => d.data() as CriaturaDoc);
  }

  async guardarCriatura(c: CriaturaDoc): Promise<void> {
    this.cont.escrituras += 1;
    await this.sub("criaturas").doc(c.cid).set(clean(c));
  }

  // --- cerebros ---

  async getCerebro(cid: string): Promise<CerebroDoc | null> {
    this.cont.lecturas += 1;
    const snap = await this.sub("cerebros").doc(cid).get();
    return snap.exists ? (snap.data() as CerebroDoc) : null;
  }

  async guardarCerebro(d: CerebroDoc): Promise<void> {
    this.cont.escrituras += 1;
    await this.sub("cerebros").doc(d.cid).set(clean(d));
  }

  async borrarCerebro(cid: string): Promise<void> {
    this.cont.escrituras += 1;
    await this.sub("cerebros").doc(cid).delete();
  }

  // --- crónica ---

  async getCronica(key: string): Promise<CronicaDoc | null> {
    this.cont.lecturas += 1;
    const snap = await this.sub("cronica").doc(key).get();
    return snap.exists ? (snap.data() as CronicaDoc) : null;
  }

  async guardarCronica(doc: CronicaDoc): Promise<void> {
    this.cont.escrituras += 1;
    await this.sub("cronica").doc(doc.key).set(clean(doc));
  }

  async listarCronicas(limit: number): Promise<CronicaDoc[]> {
    const snap = await this.sub("cronica").orderBy("key", "desc").limit(limit).get();
    this.cont.lecturas += Math.max(1, snap.size);
    return snap.docs.map((d) => d.data() as CronicaDoc);
  }

  // --- linaje ---

  async getLinaje(): Promise<LinajeDoc | null> {
    this.cont.lecturas += 1;
    const snap = await this.sub("meta").doc("linaje").get();
    return snap.exists ? (snap.data() as LinajeDoc) : null;
  }

  async guardarLinaje(doc: LinajeDoc): Promise<void> {
    this.cont.escrituras += 1;
    await this.sub("meta").doc("linaje").set(clean(doc));
  }

  // --- caché compartida ---

  async getRepoTree(): Promise<RepoTreeCache | null> {
    this.cont.lecturas += 1;
    const snap = await adminDb().collection(CACHE).doc("repoTree").get();
    return snap.exists ? (snap.data() as RepoTreeCache) : null;
  }

  async guardarRepoTree(c: RepoTreeCache): Promise<void> {
    this.cont.escrituras += 1;
    await adminDb().collection(CACHE).doc("repoTree").set(clean(c));
  }

  // --- borrar ---

  async borrarColonia(): Promise<void> {
    for (const name of ["criaturas", "cerebros", "cronica", "meta"]) await this.deleteCollection(this.sub(name));
    this.cont.escrituras += 1;
    await this.mundoRef().delete();
  }

  async borrarMascotaVieja(uid: string): Promise<void> {
    const ref = adminDb().collection("mascotas").doc(uid);
    this.cont.lecturas += 1;
    const snap = await ref.get();
    if (!snap.exists) return;
    for (const name of ["conocimiento", "memorias", "diario", "charlas", "entornos", "ticks"]) {
      await this.deleteCollection(ref.collection(name));
    }
    this.cont.escrituras += 1;
    await ref.delete();
  }
}
