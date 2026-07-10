// Validación compartida de los borradores de caso. La usan la ruta /api/cases,
// el borrador de la IA (/api/draft) y el servidor MCP (/api/mcp): una sola
// fuente de verdad para lo que puede entrar a Firestore.
import { DOMAINS } from "./labels";
import type { Doubt, LensReading, Weight } from "./types";

const WEIGHTS = new Set<Weight>(["high", "medium", "low"]);
const DOUBTS = new Set<Doubt>(["low", "medium", "high"]);
const DOMAIN_IDS = new Set(DOMAINS.map((d) => d.id));

export function sanitizeDoubt(value: unknown): Doubt {
  return DOUBTS.has(value as Doubt) ? (value as Doubt) : "medium";
}

export function sanitizeDomain(value: unknown): string {
  const id = typeof value === "string" ? value.trim().toLowerCase() : "";
  return DOMAIN_IDS.has(id) ? id : "vida-diaria";
}

export function sanitizeLenses(value: unknown): LensReading[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (l): l is LensReading =>
        !!l &&
        typeof l === "object" &&
        typeof (l as LensReading).name === "string" &&
        (l as LensReading).name.trim().length > 0 &&
        typeof (l as LensReading).reading === "string" &&
        WEIGHTS.has((l as LensReading).weight),
    )
    .map((l) => ({
      name: l.name.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 60),
      weight: l.weight,
      reading: l.reading.trim().slice(0, 300),
    }))
    .slice(0, 8);
}

export type AskScope = "all" | "mine" | "community";

export function sanitizeScope(value: unknown): AskScope {
  return value === "mine" || value === "community" ? value : "all";
}
