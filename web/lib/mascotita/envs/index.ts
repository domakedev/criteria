// Entornos donde vive la mascotita. Un entorno propone acciones posibles
// (affordances — SIEMPRE construidas por el servidor, nunca por el LLM),
// ejecuta la elegida y devuelve un resultado con recompensa numérica y, si
// hay algo que ver, una observación en texto que el cerebro percibirá después.
//
// Dos familias:
//   · real      → el repositorio en GitHub (envs/repo.ts): 404s de verdad,
//                 imports que no resuelven, archivos que cambian con commits.
//   · imaginado → mundos definidos como DATOS (envs/data.ts) con tablas de
//                 reacción ocultas y RNG sembrado (envs/imagined.ts).
import type { ConceptDoc, Drives, EnvCursor, EnvInfo, EnvStateDoc, PetDoc } from "../types";
import type { Deadline } from "../brain";
import { repoEnv } from "./repo";
import { fromData, assertImagined } from "./imagined";
import { IMAGINED } from "./data";

export interface Action {
  /** tipo (clave de la política): "leer", "explorar", "oler"… */
  type: string;
  /** objetivo concreto: ruta, zona, objeto */
  target: string;
  /** para el diario y la UI: "leer web/lib/ai.ts" */
  label: string;
  /** 0..1 riesgo estimado (se pondera con cautela y competencia) */
  riskHint: number;
  /** 0..1 energía que cuesta */
  costEnergy: number;
  /** acción lúdica (pesa con el rasgo juego) */
  ludic?: boolean;
  /** acción de exploración (pesa con el aburrimiento) */
  explore?: boolean;
  /** datos extra que el entorno necesita al actuar (nunca se muestran al LLM) */
  meta?: Record<string, string | number | boolean>;
}

export interface Outcome {
  success: boolean;
  /** −1..1, decidido por el entorno, jamás por el LLM */
  reward: number;
  observation?: {
    /** ≤ BOUNDS.observationChars, ya limpio */
    text: string;
    /** pistas heurísticas (encabezados, exports, imports, objetos presentes) */
    hints: string[];
    /** ruta u objeto del que trata (para `ref` de los conceptos) */
    ref: string | null;
  };
  /** cambios directos en impulsos (p. ej. descansar → energy +0.4) */
  effects?: Partial<Drives>;
  tags: string[];
  /** en mundos imaginados: lo que predijo antes de actuar vs. lo que pasó */
  prediction?: { predicted: boolean; actual: boolean; counted: boolean };
  /** en el repo: resultado de poner a prueba un concepto (hipótesis) */
  verification?: { conceptId: string; result: "confirma" | "contradice"; detail: string };
}

export interface EnvContext {
  pet: PetDoc;
  /** se muta durante el tick; se persiste al final */
  envState: EnvStateDoc;
  /** conjunto de trabajo (top por score) */
  concepts: ConceptDoc[];
  /** enseñanzas pendientes de probar */
  toTest: ConceptDoc[];
  rng: () => number;
  fetchBudget: { remaining: number };
  deadline: Deadline;
  now: string;
  /** competencia 0..1 por tipo de acción (beta-binomial de skills) */
  competence: (actionType: string) => number;
}

export interface Environment {
  id: string;
  name: string;
  emoji: string;
  kind: "real" | "imaginado";
  /** frase corta para el selector */
  intro: string;
  initCursor(): EnvCursor;
  /** ≤ 8 candidatos; puede ser async si necesita el árbol del repo */
  affordances(ctx: EnvContext): Promise<Action[]>;
  act(a: Action, ctx: EnvContext): Promise<Outcome>;
  /** 0..1 novedad estimada ANTES de actuar (sin LLM) */
  noveltyOf(a: Action, ctx: EnvContext): number;
}

/** Descansar existe en todos los entornos; la inyecta el orquestador. */
export const REST_ACTION: Action = {
  type: "descansar",
  target: "",
  label: "descansar un rato",
  riskHint: 0,
  costEnergy: 0,
};

export function restOutcome(pet: PetDoc): Outcome {
  const tired = pet.drives.energy < 0.3;
  return {
    success: true,
    reward: tired ? 0.3 : -0.1,
    effects: { energy: Math.min(1, pet.drives.energy + 0.4) },
    tags: ["descanso"],
  };
}

for (const spec of IMAGINED) assertImagined(spec);

export const ENVIRONMENTS: Record<string, Environment> = {
  [repoEnv.id]: repoEnv,
  ...Object.fromEntries(IMAGINED.map((spec) => [spec.id, fromData(spec)])),
};

export const DEFAULT_ENV = repoEnv.id;

export function getEnvironment(id: string): Environment | null {
  return ENVIRONMENTS[id] ?? null;
}

export function listEnvironments(): EnvInfo[] {
  return Object.values(ENVIRONMENTS).map((e) => ({
    id: e.id,
    name: e.name,
    emoji: e.emoji,
    kind: e.kind,
    intro: e.intro,
  }));
}

export function newEnvState(env: Environment, now: string): EnvStateDoc {
  return { envId: env.id, visits: 0, updatedAt: now, cursor: env.initCursor() };
}
