// Etiquetas en lenguaje llano. El formato guarda valores técnicos
// (high/medium/low, good/bad/mixed…); el usuario nunca los ve.
import type { Confidence, Doubt, OutcomeStatus, Weight } from "./types";

export const DOMAINS: Array<{ id: string; label: string }> = [
  { id: "trabajo", label: "Trabajo" },
  { id: "dinero", label: "Dinero" },
  { id: "familia-relaciones", label: "Familia y relaciones" },
  { id: "salud", label: "Salud" },
  { id: "negocio", label: "Negocio" },
  { id: "estudios", label: "Estudios" },
  { id: "vida-diaria", label: "Vida diaria" },
];

export function domainLabel(id: string): string {
  return DOMAINS.find((d) => d.id === id)?.label ?? id.replace(/-/g, " ");
}

export const WEIGHT_LABEL: Record<Weight, string> = {
  high: "Pesó mucho",
  medium: "Pesó algo",
  low: "Pesó poco",
};

export const DOUBT_LABEL: Record<Doubt, string> = {
  low: "Casi seguro",
  medium: "Con algo de duda",
  high: "Con mucha duda",
};

export const OUTCOME_LABEL: Record<OutcomeStatus, string> = {
  pending: "Sin resultado aún",
  good: "Salió bien",
  bad: "Salió mal",
  mixed: "Más o menos",
};

export const OUTCOME_STYLE: Record<OutcomeStatus, string> = {
  pending: "bg-stone-100 text-stone-600",
  good: "bg-emerald-100 text-emerald-800",
  bad: "bg-red-100 text-red-700",
  mixed: "bg-amber-100 text-amber-800",
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  none: "Sin experiencias aún",
  low: "Pocas experiencias",
  medium: "Respaldo moderado",
  high: "Buen respaldo",
};
