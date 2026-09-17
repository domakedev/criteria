// Punto único de acceso a datos de la mascotita. Por defecto usa Firestore;
// la prueba de humo llama a setStore(new StoreMemoria()) antes de correr.
// Si mañana la base es otra, se implementa `Store` y se cambia aquí: nada más
// del núcleo sabe de Firestore.
//
// El import de StoreFirestore es ESTÁTICO a propósito: firebase-admin es un
// paquete externo ESM y Turbopack compila ese módulo como asíncrono; un
// `require()` perezoso lo recibía a medio cargar (StoreFirestore undefined)
// y la API respondía 500 en producción. Importarlo no inicializa nada: la
// app "admin" se crea recién al usarla.
import type { Store } from "./store";
import { StoreFirestore } from "./store-firestore";
import type { RepoTreeCache } from "./types";

let actual: Store | null = null;

export function setStore(s: Store): void {
  actual = s;
}

export function getStore(): Store {
  if (!actual) actual = new StoreFirestore();
  return actual;
}

// --- atajos que usan los entornos ---

export function getRepoTreeCache(): Promise<RepoTreeCache | null> {
  return getStore().getRepoTree();
}

export function saveRepoTreeCache(c: RepoTreeCache): Promise<void> {
  return getStore().guardarRepoTree(c);
}
