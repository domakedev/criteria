// Entornos donde viven las criaturas. Un entorno propone acciones posibles
// (affordances — SIEMPRE construidas por el servidor), ejecuta la elegida y
// devuelve un resultado con recompensa numérica y, si hay algo que contar, una
// observación en texto para la crónica. La red de cada criatura elige entre
// las candidatas viendo solo señales crudas (senales.ts): ni riskHint ni las
// probabilidades ocultas le llegan.
//
// Dos familias:
//   · real      → el repositorio en GitHub (envs/repo.ts): 404s de verdad,
//                 imports que no resuelven, archivos que cambian con commits.
//   · imaginado → mundos definidos como DATOS (envs/data.ts) con tablas de
//                 reacción ocultas y RNG sembrado (envs/imagined.ts).
import type { CriaturaDoc, Drives, EnvCursor, EnvInfo, EnvStateDoc } from "../types";
import type { Deadline } from "../plazo";
import { CAL } from "../config";
import { repoEnv } from "./repo";
import { fromData, assertImagined } from "./imagined";
import { IMAGINED } from "./data";

export interface Action {
  /** tipo (verbo): "leer", "explorar", "oler"… */
  type: string;
  /** objetivo concreto: ruta, zona, objeto */
  target: string;
  /** para la crónica y la UI: "leer web/lib/ai.ts" */
  label: string;
  /** 0..1 riesgo estimado por el entorno: solo afecta el costo físico de fallar, NUNCA entra a la red */
  riskHint: number;
  /** 0..1 energía que cuesta */
  costEnergy: number;
  /** acción lúdica (pesa en la deriva del rasgo juego) */
  ludic?: boolean;
  /** acción de exploración */
  explore?: boolean;
  /** datos extra que el entorno necesita al actuar */
  meta?: Record<string, string | number | boolean>;
}

export interface Outcome {
  success: boolean;
  /** −1..1, decidido por el entorno */
  reward: number;
  observation?: {
    /** ≤ BOUNDS.observationChars, ya limpio */
    text: string;
    /** pistas heurísticas (encabezados, exports, imports, objetos presentes) */
    hints: string[];
    /** ruta u objeto del que trata */
    ref: string | null;
  };
  /** cambios directos en impulsos (p. ej. descansar → energy +0.4) */
  effects?: Partial<Drives>;
  tags: string[];
}

export interface EnvContext {
  criatura: CriaturaDoc;
  /** se muta durante el tick; se persiste al final dentro de la criatura */
  envState: EnvStateDoc;
  rng: () => number;
  /** compartido por todas las criaturas del latido */
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
  /** frase corta para la UI */
  intro: string;
  initCursor(): EnvCursor;
  /** ≤ 8 candidatos; puede ser async si necesita el árbol del repo */
  affordances(ctx: EnvContext): Promise<Action[]>;
  act(a: Action, ctx: EnvContext): Promise<Outcome>;
  /** 0..1 novedad estimada ANTES de actuar */
  noveltyOf(a: Action, ctx: EnvContext): number;
  /** zona actual según el cursor */
  zonaDe(state: EnvStateDoc): string;
  /** zonas conocidas (para el mapa) */
  zonas(): Array<{ id: string; name: string }>;
  nombreZona(id: string): string;
}

/** Descansar existe en todos los entornos; la inyecta el orquestador. */
export const REST_ACTION: Action = {
  type: "descansar",
  target: "",
  label: "descansar un rato",
  riskHint: 0,
  costEnergy: 0,
};

export function restOutcome(c: CriaturaDoc): Outcome {
  const tired = c.drives.energy < 0.3;
  return {
    success: true,
    reward: tired ? 0.3 : -0.1,
    effects: { energy: Math.min(1, c.drives.energy + CAL.energyRest) },
    tags: ["descanso"],
  };
}

/** Mudarse a otro entorno: la red decide; cuesta energía y no da recompensa inmediata. */
export function moveAction(envId: string, name: string): Action {
  return {
    type: "mudarse",
    target: envId,
    label: `mudarse a ${name}`,
    riskHint: 0,
    costEnergy: CAL.mudanzaCosto,
    explore: true,
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
    zonas: e.zonas(),
  }));
}

export function newEnvState(env: Environment, now: string): EnvStateDoc {
  return { envId: env.id, visits: 0, updatedAt: now, cursor: env.initCursor() };
}

/** Nombre de una zona de un entorno (o el id si no se conoce). */
export function nombreZona(envId: string, zona: string): string {
  return getEnvironment(envId)?.nombreZona(zona) ?? zona;
}

/** Lugar al azar (sembrado): un entorno y una de sus zonas. */
export function lugarAlAzar(rng: () => number): { env: string; zona: string } {
  const envs = Object.values(ENVIRONMENTS);
  const env = envs[Math.floor(rng() * envs.length)];
  const zonas = env.zonas();
  const zona = zonas[Math.floor(rng() * zonas.length)];
  return { env: env.id, zona: zona.id };
}
