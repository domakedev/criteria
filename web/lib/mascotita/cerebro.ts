// El cerebro en uso: envuelve la red (nn.ts) con lo que el tick necesita —
// elegir entre candidatas, aprender de un episodio, recordar experiencias en
// el anillo de memorias, soñar (replay) y heredar con ruido. Todo sembrado:
// nada de Math.random.
import { LIMITES, RED } from "./config";
import { Red, base64AInt8, huber, huberGrad, int8ABase64, nParametros, sigmoid, type Dims, type Salida } from "./nn";
import { clamp, gaussian, round3, seededRng, softmaxSample } from "./rng";
import type { CerebroDoc, MemoriasDoc } from "./types";

export const DIMS: Dims = {
  entrada: RED.entrada,
  oculta1: RED.oculta1,
  oculta2: RED.oculta2,
  q: RED.salidaQ,
  mundo: RED.salidaMundo,
  simbolos: RED.salidaSimbolos,
};

export const N_PARAMETROS = nParametros(DIMS);

/** Una experiencia lista para entrenar. */
export interface Experiencia {
  x: Float32Array;
  /** retorno descontado (objetivo de Q) */
  g: number;
  exito: boolean;
  /** recompensa total del paso (objetivo de r̂) */
  r: number;
}

// --- crear, cargar, guardar ---

export function cerebroNuevo(cid: string): Red {
  return Red.inicial(DIMS, seededRng(cid, "cerebro"));
}

/**
 * Carga la red de su documento. Si falta, está corrupta o es de otro formato
 * con distinto tamaño, devuelve una nueva (y lo dice) — una criatura nunca se
 * queda sin cerebro.
 */
export function cargarCerebro(doc: CerebroDoc | null, cid: string): { red: Red; nueva: boolean } {
  if (doc && doc.formato === RED.formato) {
    const red = Red.deserializar(DIMS, doc.pesos);
    if (red) return { red, nueva: false };
  }
  return { red: cerebroNuevo(cid), nueva: true };
}

export function cerebroDoc(cid: string, red: Red, pasos: number, perdida: number, now: string): CerebroDoc {
  return {
    cid,
    formato: RED.formato,
    dims: [DIMS.entrada, DIMS.oculta1, DIMS.oculta2, DIMS.q, DIMS.mundo, DIMS.simbolos],
    pesos: red.serializar(),
    pasos,
    perdida: round3(perdida),
    updatedAt: now,
  };
}

// --- elegir ---

export interface Eleccion {
  index: number;
  qs: number[];
  salidas: Salida[];
}

/** Softmax sobre los valores Q de las candidatas a temperatura `tau`. */
export function elegir(red: Red, xs: Float32Array[], tau: number, rng: () => number): Eleccion {
  const salidas = xs.map((x) => red.forward(x));
  const qs = salidas.map((s) => s.q);
  const index = softmaxSample(qs, tau, rng);
  return { index, qs, salidas };
}

/**
 * Índice del símbolo a emitir (0..15) o 16 = callar. Primero decide si habla
 * (softmax de dos entre el mejor símbolo y callar), luego cuál: así callar no
 * compite en desventaja numérica contra dieciséis alternativas.
 */
export function elegirSimbolo(s: Salida, tau: number, rng: () => number): number {
  const n = DIMS.simbolos - 1;
  const qs = Array.from(s.simbolos.subarray(0, n));
  const mejor = Math.max(...qs);
  const callar = s.simbolos[n];
  const t = Math.max(0.02, tau * RED.tauSimbolos);
  const habla = softmaxSample([mejor, callar], t, rng) === 0;
  if (!habla) return n;
  return softmaxSample(qs, t, rng);
}

/**
 * Entrena la cabeza de símbolos con lo que cobraron las emisiones del tick
 * anterior: objetivo = recompensa social repartida − costo de emitir (callar
 * no cuesta ni cobra). Bandit contextual: solo la salida elegida recibe gradiente.
 */
export function entrenarSimbolos(red: Red, emisiones: Array<{ x: string; sim: number }>, social: number, lr: number): ResultadoEntreno {
  const g = new Float32Array(red.p.length);
  const dSim = new Float32Array(DIMS.simbolos);
  const emitidas = emisiones.filter((e) => e.sim < DIMS.simbolos - 1).length;
  let perdida = 0;
  let norma = 0;
  let pasos = 0;
  for (const e of emisiones) {
    const q = base64AInt8(e.x);
    if (!q || q.length !== DIMS.entrada) continue;
    const x = new Float32Array(DIMS.entrada);
    for (let i = 0; i < x.length; i++) x[i] = q[i] / 127;
    const s = red.forward(x);
    const callo = e.sim >= DIMS.simbolos - 1;
    const objetivo = callo ? 0 : (emitidas > 0 ? social / emitidas : 0) - RED.costoEmitirValor;
    dSim.fill(0);
    dSim[e.sim] = huberGrad(s.simbolos[e.sim], objetivo, RED.huberDelta);
    perdida += huber(s.simbolos[e.sim], objetivo, RED.huberDelta);
    red.backward(x, s, { dq: 0, dMundo: null, dSimbolos: dSim }, g);
    norma += red.aplicar(g, lr, RED.clipNorm);
    pasos += 1;
  }
  return { pasos, perdidaMedia: round3(perdida / Math.max(1, pasos)), normaMedia: round3(norma / Math.max(1, pasos)) };
}

export function pExito(s: Salida): number {
  return sigmoid(s.mundo[0]);
}

/** Error de predicción del modelo del mundo: media de |éxito − p| y |r − r̂| (0..1). */
export function sorpresaDe(s: Salida, exito: boolean, r: number): number {
  const ep = Math.abs((exito ? 1 : 0) - pExito(s));
  const er = Math.min(1, Math.abs(clamp(r, -1, 1) - s.mundo[1]) / 2);
  return round3(0.5 * (ep + er));
}

// --- aprender ---

export interface ResultadoEntreno {
  pasos: number;
  perdidaMedia: number;
  normaMedia: number;
}

/**
 * Un paso de SGD por experiencia, en orden. Pérdida = Huber(Q, G) +
 * BCE(P(éxito), éxito) + MSE(r̂, r). Devuelve la pérdida media y la norma
 * media del gradiente antes del recorte (para verla en la UI).
 */
export function entrenar(red: Red, exps: Experiencia[], lr: number, g?: Float32Array): ResultadoEntreno {
  const grad = g ?? new Float32Array(red.p.length);
  let perdida = 0;
  let norma = 0;
  const dMundo = new Float32Array(DIMS.mundo);
  for (const e of exps) {
    const s = red.forward(e.x);
    const y = e.exito ? 1 : 0;
    const p = sigmoid(s.mundo[0]);
    const r = clamp(e.r, -1, 1);
    dMundo[0] = p - y;
    dMundo[1] = s.mundo[1] - r;
    const dq = huberGrad(s.q, e.g, RED.huberDelta);
    perdida +=
      huber(s.q, e.g, RED.huberDelta) -
      (y * Math.log(Math.max(1e-6, p)) + (1 - y) * Math.log(Math.max(1e-6, 1 - p))) +
      0.5 * dMundo[1] * dMundo[1];
    red.backward(e.x, s, { dq, dMundo, dSimbolos: null }, grad);
    norma += red.aplicar(grad, lr, RED.clipNorm);
  }
  const n = Math.max(1, exps.length);
  return { pasos: exps.length, perdidaMedia: round3(perdida / n), normaMedia: round3(norma / n) };
}

/** Retornos descontados hacia atrás: G_t = r_t + γ·G_{t+1}. */
export function retornos(rs: number[], gamma = RED.gamma): number[] {
  const out = new Array<number>(rs.length);
  let acc = 0;
  for (let t = rs.length - 1; t >= 0; t--) {
    acc = rs[t] + gamma * acc;
    out[t] = round3(acc);
  }
  return out;
}

// --- memorias (anillo int8) ---

/** entrada + [g, exito, r] */
const ANCHO = RED.entrada + 3;
const ESCALA_X = 127;
const ESCALA_G = 60;
const ESCALA_R = 100;

export function memoriasVacias(): MemoriasDoc {
  return { n: 0, cursor: 0, datos: "" };
}

/** Anillo decodificado; se trabaja en memoria durante el tick y se vuelve a codificar al guardar. */
export class Anillo {
  readonly datos: Int8Array;
  n: number;
  cursor: number;
  readonly cap: number;

  constructor(doc: MemoriasDoc, cap = LIMITES.memorias) {
    this.cap = cap;
    const decoded = doc.datos ? base64AInt8(doc.datos) : null;
    if (decoded && decoded.length === cap * ANCHO && doc.n <= cap && doc.cursor < cap) {
      this.datos = decoded;
      this.n = doc.n;
      this.cursor = doc.cursor;
    } else {
      // vacío o corrupto: se empieza de cero (se pierde el replay, no la red)
      this.datos = new Int8Array(cap * ANCHO);
      this.n = 0;
      this.cursor = 0;
    }
  }

  recordar(e: Experiencia): void {
    const base = this.cursor * ANCHO;
    for (let i = 0; i < RED.entrada; i++) this.datos[base + i] = Math.round(clamp(e.x[i], -1, 1) * ESCALA_X);
    this.datos[base + RED.entrada] = Math.round(clamp(e.g, -2, 2) * ESCALA_G);
    this.datos[base + RED.entrada + 1] = e.exito ? 127 : -127;
    this.datos[base + RED.entrada + 2] = Math.round(clamp(e.r, -1, 1) * ESCALA_R);
    this.cursor = (this.cursor + 1) % this.cap;
    this.n = Math.min(this.cap, this.n + 1);
  }

  leer(i: number): Experiencia {
    const base = i * ANCHO;
    const x = new Float32Array(RED.entrada);
    for (let k = 0; k < RED.entrada; k++) x[k] = this.datos[base + k] / ESCALA_X;
    return {
      x,
      g: this.datos[base + RED.entrada] / ESCALA_G,
      exito: this.datos[base + RED.entrada + 1] > 0,
      r: this.datos[base + RED.entrada + 2] / ESCALA_R,
    };
  }

  /** `k` experiencias distintas al azar (sembrado). */
  muestra(k: number, rng: () => number): Experiencia[] {
    const idx = Array.from({ length: this.n }, (_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return idx.slice(0, Math.min(k, this.n)).map((i) => this.leer(i));
  }

  doc(): MemoriasDoc {
    return { n: this.n, cursor: this.cursor, datos: this.n === 0 ? "" : int8ABase64(this.datos) };
  }
}

/** Sueño: `pasadas` sobre una muestra del anillo con lr reducido. */
export function sonar(red: Red, anillo: Anillo, lr: number, rng: () => number): ResultadoEntreno {
  if (anillo.n === 0) return { pasos: 0, perdidaMedia: 0, normaMedia: 0 };
  const g = new Float32Array(red.p.length);
  let pasos = 0;
  let perdida = 0;
  let norma = 0;
  for (let p = 0; p < RED.suenoPasadas; p++) {
    const exps = anillo.muestra(RED.suenoMuestra, rng);
    const r = entrenar(red, exps, lr * RED.suenoLrFactor, g);
    pasos += r.pasos;
    perdida += r.perdidaMedia * r.pasos;
    norma += r.normaMedia * r.pasos;
  }
  return { pasos, perdidaMedia: round3(perdida / Math.max(1, pasos)), normaMedia: round3(norma / Math.max(1, pasos)) };
}

// --- herencia ---

export function heredarRed(madre: Red, sigma: number, cidHija: string): Red {
  const rng = seededRng(cidHija, "herencia");
  return madre.conRuido(sigma, RED.reinicioHeredado, rng, gaussian);
}
