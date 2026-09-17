// Plazo de una operación (latido o tick): reparte AbortSignals a cada fetch
// para que ninguna criatura se coma el tiempo de las demás.
export interface Deadline {
  startedAt: number;
  totalMs: number;
  elapsed(): number;
  remaining(): number;
  /** Señal que aborta en min(maxMs, remaining − margen). */
  signal(maxMs: number, marginMs?: number): AbortSignal;
}

export function makeDeadline(totalMs: number, startedAt = Date.now()): Deadline {
  return {
    startedAt,
    totalMs,
    elapsed: () => Date.now() - startedAt,
    remaining: () => Math.max(0, startedAt + totalMs - Date.now()),
    signal(maxMs, marginMs = 500) {
      const ms = Math.max(200, Math.min(maxMs, startedAt + totalMs - Date.now() - marginMs));
      return AbortSignal.timeout(ms);
    },
  };
}
