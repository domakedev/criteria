// Store en memoria: la misma API que Firestore, sin red. Lo usa la prueba de
// humo (scripts/humo.ts) para correr miles de latidos con nacimientos,
// muertes y reintentos sin tocar la base. Cuenta lecturas y escrituras igual
// que el real, y copia por JSON al leer/escribir para que nadie mute un doc
// "guardado" por accidente (como pasaría con Firestore).
import { clean, type Contadores, type LeaseLatido, type Store } from "./store";
import type { CerebroDoc, CriaturaDoc, CronicaDoc, LexicoDoc, LinajeDoc, MundoDoc, NarracionesDoc, RepoTreeCache } from "./types";

export class StoreMemoria implements Store {
  readonly id = "memoria" as const;
  private cont: Contadores = { lecturas: 0, escrituras: 0 };
  mundo: MundoDoc | null = null;
  criaturas = new Map<string, CriaturaDoc>();
  cerebros = new Map<string, CerebroDoc>();
  cronicas = new Map<string, CronicaDoc>();
  repoTree: RepoTreeCache | null = null;
  linaje: LinajeDoc | null = null;
  lexico: LexicoDoc | null = null;
  narraciones: NarracionesDoc | null = null;

  contadores(): Contadores {
    return { ...this.cont };
  }

  reiniciarContadores(): void {
    this.cont = { lecturas: 0, escrituras: 0 };
  }

  /** Copia profunda de todo el estado (para comprobar idempotencia). */
  clonar(): StoreMemoria {
    const s = new StoreMemoria();
    s.mundo = this.mundo ? clean(this.mundo) : null;
    for (const [k, v] of this.criaturas) s.criaturas.set(k, clean(v));
    for (const [k, v] of this.cerebros) s.cerebros.set(k, clean(v));
    for (const [k, v] of this.cronicas) s.cronicas.set(k, clean(v));
    s.repoTree = this.repoTree ? clean(this.repoTree) : null;
    s.linaje = this.linaje ? clean(this.linaje) : null;
    s.lexico = this.lexico ? clean(this.lexico) : null;
    return s;
  }

  async getMundo(): Promise<MundoDoc | null> {
    this.cont.lecturas += 1;
    return this.mundo ? clean(this.mundo) : null;
  }

  async crearMundo(m: MundoDoc): Promise<boolean> {
    this.cont.escrituras += 1;
    if (this.mundo) return false;
    this.mundo = clean(m);
    return true;
  }

  async tomarLatido(now: Date, lockMs: number): Promise<LeaseLatido> {
    this.cont.lecturas += 1;
    if (!this.mundo) return { ok: false, skipped: "sinColonia", retryAt: null };
    const nowMs = now.getTime();
    if (this.mundo.latido.lock && Date.parse(this.mundo.latido.lock.until) > nowMs) {
      return { ok: false, skipped: "locked", retryAt: this.mundo.latido.lock.until };
    }
    const seq = this.mundo.latido.seq + 1;
    this.mundo.latido.seq = seq;
    this.mundo.latido.lock = { until: new Date(nowMs + lockMs).toISOString(), seq };
    this.mundo.updatedAt = now.toISOString();
    this.cont.escrituras += 1;
    return { ok: true, mundo: clean(this.mundo), seq };
  }

  async guardarMundo(m: MundoDoc): Promise<void> {
    this.cont.escrituras += 1;
    this.mundo = clean(m);
  }

  async soltarLatido(seq: number): Promise<void> {
    this.cont.lecturas += 1;
    if (this.mundo?.latido.lock && this.mundo.latido.lock.seq === seq) {
      this.mundo.latido.lock = null;
      this.cont.escrituras += 1;
    }
  }

  async getCriatura(cid: string): Promise<CriaturaDoc | null> {
    this.cont.lecturas += 1;
    const c = this.criaturas.get(cid);
    return c ? clean(c) : null;
  }

  async listarVivas(limit: number): Promise<CriaturaDoc[]> {
    const out: CriaturaDoc[] = [];
    for (const c of this.criaturas.values()) {
      if (c.viva) out.push(clean(c));
      if (out.length >= limit) break;
    }
    this.cont.lecturas += Math.max(1, out.length);
    return out;
  }

  async guardarCriatura(c: CriaturaDoc): Promise<void> {
    this.cont.escrituras += 1;
    this.criaturas.set(c.cid, clean(c));
  }

  async getCerebro(cid: string): Promise<CerebroDoc | null> {
    this.cont.lecturas += 1;
    const d = this.cerebros.get(cid);
    return d ? clean(d) : null;
  }

  async guardarCerebro(d: CerebroDoc): Promise<void> {
    this.cont.escrituras += 1;
    this.cerebros.set(d.cid, clean(d));
  }

  async borrarCerebro(cid: string): Promise<void> {
    this.cont.escrituras += 1;
    this.cerebros.delete(cid);
  }

  async getCronica(key: string): Promise<CronicaDoc | null> {
    this.cont.lecturas += 1;
    const d = this.cronicas.get(key);
    return d ? clean(d) : null;
  }

  async guardarCronica(doc: CronicaDoc): Promise<void> {
    this.cont.escrituras += 1;
    this.cronicas.set(doc.key, clean(doc));
  }

  async listarCronicas(limit: number): Promise<CronicaDoc[]> {
    const keys = Array.from(this.cronicas.keys()).sort().reverse().slice(0, limit);
    this.cont.lecturas += Math.max(1, keys.length);
    return keys.map((k) => clean(this.cronicas.get(k)!));
  }

  async getLinaje(): Promise<LinajeDoc | null> {
    this.cont.lecturas += 1;
    return this.linaje ? clean(this.linaje) : null;
  }

  async guardarLinaje(doc: LinajeDoc): Promise<void> {
    this.cont.escrituras += 1;
    this.linaje = clean(doc);
  }

  async getLexico(): Promise<LexicoDoc | null> {
    this.cont.lecturas += 1;
    return this.lexico ? clean(this.lexico) : null;
  }

  async guardarLexico(doc: LexicoDoc): Promise<void> {
    this.cont.escrituras += 1;
    this.lexico = clean(doc);
  }

  async getNarraciones(): Promise<NarracionesDoc | null> {
    this.cont.lecturas += 1;
    return this.narraciones ? clean(this.narraciones) : null;
  }

  async guardarNarraciones(doc: NarracionesDoc): Promise<void> {
    this.cont.escrituras += 1;
    this.narraciones = clean(doc);
  }

  async getRepoTree(): Promise<RepoTreeCache | null> {
    this.cont.lecturas += 1;
    return this.repoTree ? clean(this.repoTree) : null;
  }

  async guardarRepoTree(c: RepoTreeCache): Promise<void> {
    this.cont.escrituras += 1;
    this.repoTree = clean(c);
  }

  async borrarColonia(): Promise<void> {
    this.cont.escrituras += 1 + this.criaturas.size + this.cerebros.size + this.cronicas.size;
    this.mundo = null;
    this.criaturas.clear();
    this.cerebros.clear();
    this.cronicas.clear();
    this.linaje = null;
    this.lexico = null;
    this.narraciones = null;
  }

  async borrarMascotaVieja(): Promise<void> {
    // en memoria no hay versión 1 que borrar
  }

  /** Tamaño aproximado en bytes de un doc (como lo contaría Firestore, a grandes rasgos). */
  static bytes(doc: unknown): number {
    return Buffer.byteLength(JSON.stringify(doc), "utf8");
  }
}
