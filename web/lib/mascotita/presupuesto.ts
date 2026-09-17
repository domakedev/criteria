// El presupuesto gratis y cómo limita la población. Firestore cuenta
// documentos (no bytes): cada latido cuesta ~2 lecturas y ~2 escrituras por
// criatura viva más un puñado fijo. Aquí se proyecta el día siguiente con N
// vivas y se decide si cabe una más. Los números salen de config.ts y se
// muestran tal cual en la UI.
import { LIMITES } from "./config";
import type { MundoDoc, PresupuestoView } from "./types";

/** Escrituras de un latido con `n` criaturas tickeando (criatura + cerebro cada una, más mundo, crónica y léxico). */
export function escriturasPorLatido(n: number): number {
  return 2 * n + 4;
}

export function lecturasPorLatido(n: number): number {
  return 2 * n + 5;
}

/** Proyección de escrituras de un día entero con `n` vivas (más un margen por nacimientos/muertes y la página). */
export function proyeccionEscrituras(n: number): number {
  const porLatidos = LIMITES.latidosDia * escriturasPorLatido(Math.min(n, LIMITES.ticksPorLatido));
  const extras = Math.ceil(n * 0.5) + 20;
  return porLatidos + extras;
}

export function proyeccionLecturas(n: number): number {
  return LIMITES.latidosDia * lecturasPorLatido(Math.min(n, LIMITES.ticksPorLatido)) + 1_500;
}

export function topeSeguro(): number {
  return Math.floor(LIMITES.escriturasDia * LIMITES.fraccionSegura);
}

/** ¿Está el día en modo ahorro? (ya se gastó demasiado del tope real) */
export function modoAhorro(m: MundoDoc): boolean {
  return (
    m.dia.escrituras >= LIMITES.escriturasDia * LIMITES.fraccionAhorro ||
    m.dia.lecturas >= LIMITES.lecturasDia * LIMITES.fraccionAhorro
  );
}

/**
 * ¿Puede nacer una más? Devuelve el motivo si no. Mira el tope de vivas, la
 * proyección de mañana con N+1 y lo gastado hoy.
 */
export function cabeOtra(m: MundoDoc, vivas: number, maxVivas: number): { ok: boolean; motivo: string | null } {
  if (vivas >= maxVivas) return { ok: false, motivo: `tope de vivas (${maxVivas})` };
  const manana = proyeccionEscrituras(vivas + 1);
  if (manana > topeSeguro()) return { ok: false, motivo: `sin presupuesto: mañana costaría ${manana} escrituras` };
  if (modoAhorro(m)) return { ok: false, motivo: "modo ahorro: hoy ya se gastó demasiado" };
  return { ok: true, motivo: null };
}

export function presupuestoVista(m: MundoDoc | null, vivas: number, maxVivas: number): PresupuestoView {
  const proy = proyeccionEscrituras(vivas);
  const proyMas = proyeccionEscrituras(vivas + 1);
  const cabe = m ? cabeOtra(m, vivas, maxVivas) : { ok: vivas < maxVivas, motivo: null };
  return {
    topeSeguro: topeSeguro(),
    proyeccionManana: proy,
    proyeccionConUnaMas: proyMas,
    lecturasManana: proyeccionLecturas(vivas),
    cabeOtra: cabe.ok,
    motivo: cabe.motivo,
    ahorro: m ? modoAhorro(m) : false,
  };
}
