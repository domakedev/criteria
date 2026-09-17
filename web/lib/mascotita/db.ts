// Punto único de acceso a datos de la mascotita. Por defecto usa Firestore;
// la prueba de humo llama a setStore(new StoreMemoria()) antes de correr.
// Si mañana la base es otra, se implementa `Store` y se cambia aquí: nada más
// del núcleo sabe de Firestore.
import type { Store } from "./store";
import type { RepoTreeCache } from "./types";

let actual: Store | null = null;

export function setStore(s: Store): void {
  actual = s;
}

export function getStore(): Store {
  if (!actual) {
    // Import perezoso: así la prueba de humo nunca carga firebase-admin.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { StoreFirestore } = require("./store-firestore") as typeof import("./store-firestore");
    actual = new StoreFirestore();
  }
  return actual;
}

// --- atajos que usan los entornos ---

export function getRepoTreeCache(): Promise<RepoTreeCache | null> {
  return getStore().getRepoTree();
}

export function saveRepoTreeCache(c: RepoTreeCache): Promise<void> {
  return getStore().guardarRepoTree(c);
}
