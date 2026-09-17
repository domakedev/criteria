// La interfaz de almacenamiento de la colonia: TODO acceso a datos pasa por
// aquí. Dos implementaciones con la misma API: Firestore (producción) y
// memoria (prueba de humo, sin red). Cada implementación cuenta sus lecturas
// y escrituras para que el latido las sume al presupuesto del día.
import type { CerebroDoc, CriaturaDoc, CronicaDoc, LinajeDoc, MundoDoc, RepoTreeCache } from "./types";

export interface Contadores {
  lecturas: number;
  escrituras: number;
}

export type LeaseLatido =
  | { ok: true; mundo: MundoDoc; seq: number }
  | { ok: false; skipped: "locked" | "sinColonia"; retryAt: string | null };

export interface Store {
  readonly id: "firestore" | "memoria";
  contadores(): Contadores;
  reiniciarContadores(): void;

  getMundo(): Promise<MundoDoc | null>;
  /** false si ya existía */
  crearMundo(m: MundoDoc): Promise<boolean>;
  /** Toma el candado del latido en una transacción e incrementa seq. */
  tomarLatido(now: Date, lockMs: number): Promise<LeaseLatido>;
  /** Guarda el mundo entero (con lock = null libera el candado). */
  guardarMundo(m: MundoDoc): Promise<void>;
  /** Suelta el candado solo si sigue siendo el de `seq`. */
  soltarLatido(seq: number): Promise<void>;

  getCriatura(cid: string): Promise<CriaturaDoc | null>;
  listarVivas(limit: number): Promise<CriaturaDoc[]>;
  guardarCriatura(c: CriaturaDoc): Promise<void>;

  getCerebro(cid: string): Promise<CerebroDoc | null>;
  guardarCerebro(d: CerebroDoc): Promise<void>;
  borrarCerebro(cid: string): Promise<void>;

  getCronica(key: string): Promise<CronicaDoc | null>;
  guardarCronica(doc: CronicaDoc): Promise<void>;
  /** las últimas `limit` crónicas por clave de día, la más reciente primero */
  listarCronicas(limit: number): Promise<CronicaDoc[]>;

  getLinaje(): Promise<LinajeDoc | null>;
  guardarLinaje(doc: LinajeDoc): Promise<void>;

  getRepoTree(): Promise<RepoTreeCache | null>;
  guardarRepoTree(c: RepoTreeCache): Promise<void>;

  /** Borra la colonia entera (mundo, criaturas, cerebros, crónica, linaje). */
  borrarColonia(): Promise<void>;
  /** Borra la mascota de la versión 1 (`mascotas/{uid}` y sus subcolecciones), si existe. */
  borrarMascotaVieja(uid: string): Promise<void>;
}

/**
 * Quita los `undefined` (y convierte NaN/Infinity en null) de un objeto antes
 * de guardarlo: Firestore rechaza documentos con campos undefined. El viaje
 * por JSON es la forma más simple y segura de hacerlo en profundidad.
 */
export function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
