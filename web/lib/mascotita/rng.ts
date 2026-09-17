// Aleatoriedad SEMBRADA: cada tick usa un generador sembrado con (uid, seq),
// así un reintento tras un fallo reproduce las mismas decisiones (idempotente)
// y dos mascotas con el mismo uid… no existen. Nada de Math.random en el núcleo.

/** FNV-1a de 32 bits sobre una cadena. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: PRNG pequeño y suficiente. Devuelve () => [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededRng(...parts: Array<string | number>): () => number {
  return mulberry32(hashString(parts.join(":")));
}

/** Índice muestreado de softmax(scores / temperature). */
export function softmaxSample(scores: number[], temperature: number, rng: () => number): number {
  if (scores.length === 0) return -1;
  const t = Math.max(0.01, temperature);
  const max = Math.max(...scores);
  const weights = scores.map((s) => Math.exp((s - max) / t));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

export function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];
}

export function shuffle<T>(rng: () => number, arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function clamp01(x: number): number {
  return clamp(x, 0, 1);
}

/** Redondeo corto para que Firestore no guarde 17 decimales. */
export function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

/** Normal estándar (Box-Muller) a partir de un rng uniforme. */
export function gaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Redondeo a dos decimales (para vistas). */
export function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
