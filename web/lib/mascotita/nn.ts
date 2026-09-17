// La red neuronal de cada criatura, escrita a mano: un perceptrón de dos capas
// ocultas (tanh) con tres cabezas lineales — valor Q(s, a), modelo del mundo
// (P(éxito), recompensa esperada) y símbolos (valor de emitir cada uno o
// callar). Sin dependencias: forward, backprop y SGD con recorte de gradiente
// sobre un solo Float32Array de parámetros, que es lo que se guarda en base64.
//
// Convención: los pesos de una capa de `o` salidas y `i` entradas viven en
// fila mayor (W[j*i + k] = peso de la entrada k hacia la salida j).

export interface Dims {
  entrada: number;
  oculta1: number;
  oculta2: number;
  q: number;
  mundo: number;
  simbolos: number;
}

export interface Salida {
  h1: Float32Array;
  h2: Float32Array;
  /** valor de la acción */
  q: number;
  /** [logit de P(éxito), recompensa esperada] */
  mundo: Float32Array;
  /** valor de cada símbolo (el último es callar) */
  simbolos: Float32Array;
}

export interface Gradiente {
  /** ∂L/∂q */
  dq: number;
  /** ∂L/∂mundo (2) */
  dMundo: Float32Array | null;
  /** ∂L/∂simbolos (17) o null si esta experiencia no entrena símbolos */
  dSimbolos: Float32Array | null;
}

interface Offsets {
  W1: number;
  b1: number;
  W2: number;
  b2: number;
  Wq: number;
  bq: number;
  Wm: number;
  bm: number;
  Ws: number;
  bs: number;
  total: number;
}

export function offsetsDe(d: Dims): Offsets {
  let at = 0;
  const take = (n: number) => {
    const o = at;
    at += n;
    return o;
  };
  return {
    W1: take(d.oculta1 * d.entrada),
    b1: take(d.oculta1),
    W2: take(d.oculta2 * d.oculta1),
    b2: take(d.oculta2),
    Wq: take(d.q * d.oculta2),
    bq: take(d.q),
    Wm: take(d.mundo * d.oculta2),
    bm: take(d.mundo),
    Ws: take(d.simbolos * d.oculta2),
    bs: take(d.simbolos),
    total: at,
  };
}

export function nParametros(d: Dims): number {
  return offsetsDe(d).total;
}

export function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

/** Gradiente de la pérdida de Huber respecto a la predicción. */
export function huberGrad(pred: number, target: number, delta: number): number {
  const d = pred - target;
  if (d > delta) return delta;
  if (d < -delta) return -delta;
  return d;
}

export function huber(pred: number, target: number, delta: number): number {
  const d = Math.abs(pred - target);
  return d <= delta ? 0.5 * d * d : delta * (d - 0.5 * delta);
}

export class Red {
  readonly dims: Dims;
  readonly off: Offsets;
  /** todos los parámetros, en un solo bloque */
  readonly p: Float32Array;

  constructor(dims: Dims, p?: Float32Array) {
    this.dims = dims;
    this.off = offsetsDe(dims);
    if (p && p.length !== this.off.total) {
      throw new Error(`Red: se esperaban ${this.off.total} parámetros y llegaron ${p.length}`);
    }
    this.p = p ?? new Float32Array(this.off.total);
  }

  /** Inicialización Xavier uniforme sembrada; sesgos en cero. */
  static inicial(dims: Dims, rng: () => number): Red {
    const red = new Red(dims);
    const { p, off } = red;
    const fill = (from: number, n: number, fanIn: number, fanOut: number) => {
      const lim = Math.sqrt(6 / (fanIn + fanOut));
      for (let i = 0; i < n; i++) p[from + i] = (rng() * 2 - 1) * lim;
    };
    fill(off.W1, dims.oculta1 * dims.entrada, dims.entrada, dims.oculta1);
    fill(off.W2, dims.oculta2 * dims.oculta1, dims.oculta1, dims.oculta2);
    fill(off.Wq, dims.q * dims.oculta2, dims.oculta2, dims.q);
    fill(off.Wm, dims.mundo * dims.oculta2, dims.oculta2, dims.mundo);
    fill(off.Ws, dims.simbolos * dims.oculta2, dims.oculta2, dims.simbolos);
    return red;
  }

  forward(x: Float32Array): Salida {
    const { dims: d, off, p } = this;
    if (x.length !== d.entrada) throw new Error(`Red: entrada de ${x.length}, se esperaban ${d.entrada}`);
    const h1 = new Float32Array(d.oculta1);
    for (let j = 0; j < d.oculta1; j++) {
      let s = p[off.b1 + j];
      const row = off.W1 + j * d.entrada;
      for (let k = 0; k < d.entrada; k++) s += p[row + k] * x[k];
      h1[j] = Math.tanh(s);
    }
    const h2 = new Float32Array(d.oculta2);
    for (let j = 0; j < d.oculta2; j++) {
      let s = p[off.b2 + j];
      const row = off.W2 + j * d.oculta1;
      for (let k = 0; k < d.oculta1; k++) s += p[row + k] * h1[k];
      h2[j] = Math.tanh(s);
    }
    let q = p[off.bq];
    for (let k = 0; k < d.oculta2; k++) q += p[off.Wq + k] * h2[k];
    const mundo = new Float32Array(d.mundo);
    for (let j = 0; j < d.mundo; j++) {
      let s = p[off.bm + j];
      const row = off.Wm + j * d.oculta2;
      for (let k = 0; k < d.oculta2; k++) s += p[row + k] * h2[k];
      mundo[j] = s;
    }
    const simbolos = new Float32Array(d.simbolos);
    for (let j = 0; j < d.simbolos; j++) {
      let s = p[off.bs + j];
      const row = off.Ws + j * d.oculta2;
      for (let k = 0; k < d.oculta2; k++) s += p[row + k] * h2[k];
      simbolos[j] = s;
    }
    return { h1, h2, q, mundo, simbolos };
  }

  /** Acumula en `g` el gradiente de la pérdida para la entrada `x` y la salida `s` (ya calculada). */
  backward(x: Float32Array, s: Salida, grad: Gradiente, g: Float32Array): void {
    const { dims: d, off, p } = this;
    const { h1, h2 } = s;
    const dh2 = new Float32Array(d.oculta2);

    // cabeza Q
    if (grad.dq !== 0) {
      for (let k = 0; k < d.oculta2; k++) {
        g[off.Wq + k] += grad.dq * h2[k];
        dh2[k] += p[off.Wq + k] * grad.dq;
      }
      g[off.bq] += grad.dq;
    }
    // cabeza mundo
    if (grad.dMundo) {
      for (let j = 0; j < d.mundo; j++) {
        const dj = grad.dMundo[j];
        if (dj === 0) continue;
        const row = off.Wm + j * d.oculta2;
        for (let k = 0; k < d.oculta2; k++) {
          g[row + k] += dj * h2[k];
          dh2[k] += p[row + k] * dj;
        }
        g[off.bm + j] += dj;
      }
    }
    // cabeza símbolos
    if (grad.dSimbolos) {
      for (let j = 0; j < d.simbolos; j++) {
        const dj = grad.dSimbolos[j];
        if (dj === 0) continue;
        const row = off.Ws + j * d.oculta2;
        for (let k = 0; k < d.oculta2; k++) {
          g[row + k] += dj * h2[k];
          dh2[k] += p[row + k] * dj;
        }
        g[off.bs + j] += dj;
      }
    }
    // capa 2
    const dh1 = new Float32Array(d.oculta1);
    for (let j = 0; j < d.oculta2; j++) {
      const dz = dh2[j] * (1 - h2[j] * h2[j]);
      if (dz === 0) continue;
      const row = off.W2 + j * d.oculta1;
      for (let k = 0; k < d.oculta1; k++) {
        g[row + k] += dz * h1[k];
        dh1[k] += p[row + k] * dz;
      }
      g[off.b2 + j] += dz;
    }
    // capa 1
    for (let j = 0; j < d.oculta1; j++) {
      const dz = dh1[j] * (1 - h1[j] * h1[j]);
      if (dz === 0) continue;
      const row = off.W1 + j * d.entrada;
      for (let k = 0; k < d.entrada; k++) g[row + k] += dz * x[k];
      g[off.b1 + j] += dz;
    }
  }

  /**
   * Un paso de SGD: p ← p − lr·g (con g recortado a norma ≤ clip). Devuelve la
   * norma del gradiente antes del recorte y deja `g` en cero para reutilizarlo.
   */
  aplicar(g: Float32Array, lr: number, clip: number): number {
    let ss = 0;
    for (let i = 0; i < g.length; i++) ss += g[i] * g[i];
    const norma = Math.sqrt(ss);
    const escala = norma > clip && norma > 0 ? clip / norma : 1;
    const paso = lr * escala;
    const p = this.p;
    for (let i = 0; i < g.length; i++) {
      if (g[i] !== 0) {
        p[i] -= paso * g[i];
        g[i] = 0;
      }
    }
    return norma;
  }

  clonar(): Red {
    return new Red(this.dims, new Float32Array(this.p));
  }

  /**
   * Herencia: cada peso recibe ruido N(0, σ) y una fracción `reinicio` se
   * vuelve a sortear como si naciera de cero (pequeñas ideas propias).
   */
  conRuido(sigma: number, reinicio: number, rng: () => number, gauss: (r: () => number) => number): Red {
    const hijo = this.clonar();
    const p = hijo.p;
    const lim = Math.sqrt(6 / (this.dims.entrada + this.dims.oculta1));
    for (let i = 0; i < p.length; i++) {
      if (rng() < reinicio) p[i] = (rng() * 2 - 1) * lim;
      else p[i] += sigma * gauss(rng);
    }
    return hijo;
  }

  /** ¿Algún parámetro dejó de ser un número finito? (guardia antes de guardar) */
  sana(): boolean {
    for (let i = 0; i < this.p.length; i++) if (!Number.isFinite(this.p[i])) return false;
    return true;
  }

  /** Pesos como base64 (float32 little-endian). */
  serializar(): string {
    return float32ABase64(this.p);
  }

  /** null si el base64 no tiene exactamente los bytes que piden las dims. */
  static deserializar(dims: Dims, b64: string): Red | null {
    const p = base64AFloat32(b64);
    if (!p || p.length !== nParametros(dims)) return null;
    for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i])) return null;
    return new Red(dims, p);
  }
}

// --- base64 sin depender de Buffer (corre igual en Node y en el navegador) ---

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_INV = new Int16Array(128).fill(-1);
for (let i = 0; i < B64.length; i++) B64_INV[B64.charCodeAt(i)] = i;

export function bytesABase64(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  if (i < bytes.length) {
    const n = (bytes[i] << 16) | ((i + 1 < bytes.length ? bytes[i + 1] : 0) << 8);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=";
    out += "=";
  }
  return out;
}

export function base64ABytes(s: string): Uint8Array | null {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    const c = clean.charCodeAt(i);
    const v = c < 128 ? B64_INV[c] : -1;
    if (v < 0) return null;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 255;
    }
  }
  return out.subarray(0, o);
}

/** float32 → base64, siempre little-endian aunque la máquina no lo sea. */
export function float32ABase64(a: Float32Array): string {
  const bytes = new Uint8Array(a.length * 4);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < a.length; i++) view.setFloat32(i * 4, a[i], true);
  return bytesABase64(bytes);
}

export function base64AFloat32(s: string): Float32Array | null {
  const bytes = base64ABytes(s);
  if (!bytes || bytes.length % 4 !== 0) return null;
  const out = new Float32Array(bytes.length / 4);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < out.length; i++) out[i] = view.getFloat32(i * 4, true);
  return out;
}

export function int8ABase64(a: Int8Array): string {
  return bytesABase64(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
}

export function base64AInt8(s: string): Int8Array | null {
  const bytes = base64ABytes(s);
  if (!bytes) return null;
  const out = new Int8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = (bytes[i] << 24) >> 24;
  return out;
}
