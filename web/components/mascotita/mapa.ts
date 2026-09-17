// El mapa del terrario: una cuadrícula de tiles de 16 px con cuatro regiones
// (los entornos) y sus zonas como parches con letrero. Todo es dato: el
// dibujo (dibujo.ts) pinta cada tipo de tile de forma procedural. Inspirado en
// la vista cenital de los juegos de GBA; sin ningún asset externo.

export const TILE = 16;
export const ANCHO = 64;
export const ALTO = 44;

export type Tipo =
  | "pasto"
  | "pasto2"
  | "arbol"
  | "agua"
  | "tierra"
  | "roca"
  | "cueva"
  | "adoquin"
  | "edificio"
  | "asfalto"
  | "libros"
  | "alfombra"
  | "butaca"
  | "oscuro"
  | "cabina"
  | "azotea"
  | "circuito"
  | "circuito2"
  | "nodo"
  | "borde";

export interface ZonaRect {
  env: string;
  zona: string;
  nombre: string;
  /** en tiles */
  x: number;
  y: number;
  w: number;
  h: number;
  piso: Tipo;
  /** tile decorativo que se esparce dentro (por ejemplo árboles) */
  adorno?: Tipo;
  /** densidad del adorno 0..1 */
  densidad?: number;
}

export interface Region {
  env: string;
  nombre: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fondo: Tipo;
  adorno?: Tipo;
  densidad?: number;
}

export const REGIONES: Region[] = [
  { env: "bosque", nombre: "El bosque", x: 0, y: 0, w: 32, h: 22, fondo: "pasto", adorno: "arbol", densidad: 0.35 },
  { env: "ciudad", nombre: "La ciudad", x: 32, y: 0, w: 32, h: 22, fondo: "adoquin", adorno: "edificio", densidad: 0.18 },
  { env: "repo", nombre: "El repositorio", x: 0, y: 22, w: 32, h: 22, fondo: "circuito", adorno: "nodo", densidad: 0.08 },
  { env: "cine", nombre: "El cine", x: 32, y: 22, w: 32, h: 22, fondo: "oscuro", adorno: "butaca", densidad: 0.12 },
];

export const ZONAS: ZonaRect[] = [
  // bosque
  { env: "bosque", zona: "claro", nombre: "el claro", x: 3, y: 3, w: 11, h: 8, piso: "pasto2" },
  { env: "bosque", zona: "arroyo", nombre: "el arroyo", x: 17, y: 2, w: 12, h: 8, piso: "agua", adorno: "roca", densidad: 0.1 },
  { env: "bosque", zona: "espesura", nombre: "la espesura", x: 3, y: 13, w: 12, h: 7, piso: "tierra", adorno: "arbol", densidad: 0.5 },
  { env: "bosque", zona: "cueva", nombre: "la cueva", x: 19, y: 13, w: 9, h: 7, piso: "cueva", adorno: "roca", densidad: 0.25 },
  // ciudad
  { env: "ciudad", zona: "plaza", nombre: "la plaza", x: 35, y: 3, w: 11, h: 8, piso: "adoquin" },
  { env: "ciudad", zona: "mercado", nombre: "el mercado", x: 49, y: 2, w: 12, h: 8, piso: "tierra", adorno: "edificio", densidad: 0.15 },
  { env: "ciudad", zona: "callejon", nombre: "el callejón", x: 35, y: 13, w: 11, h: 7, piso: "asfalto", adorno: "edificio", densidad: 0.3 },
  { env: "ciudad", zona: "biblioteca", nombre: "la biblioteca", x: 49, y: 13, w: 12, h: 7, piso: "libros" },
  // repo (las carpetas de primer nivel)
  { env: "repo", zona: "raiz", nombre: "la raíz", x: 3, y: 25, w: 9, h: 7, piso: "circuito2" },
  { env: "repo", zona: "web", nombre: "web/", x: 14, y: 25, w: 9, h: 7, piso: "circuito2" },
  { env: "repo", zona: "src", nombre: "src/", x: 25, y: 25, w: 5, h: 7, piso: "circuito2" },
  { env: "repo", zona: "docs", nombre: "docs/", x: 3, y: 35, w: 8, h: 6, piso: "circuito2" },
  { env: "repo", zona: "spec", nombre: "spec/", x: 13, y: 35, w: 8, h: 6, piso: "circuito2" },
  { env: "repo", zona: "interfaces", nombre: "interfaces/", x: 23, y: 35, w: 7, h: 6, piso: "circuito2" },
  // cine
  { env: "cine", zona: "lobby", nombre: "el lobby", x: 35, y: 25, w: 11, h: 7, piso: "alfombra" },
  { env: "cine", zona: "sala", nombre: "la sala", x: 49, y: 25, w: 12, h: 8, piso: "oscuro", adorno: "butaca", densidad: 0.45 },
  { env: "cine", zona: "proyeccion", nombre: "la cabina", x: 35, y: 35, w: 11, h: 6, piso: "cabina" },
  { env: "cine", zona: "azotea", nombre: "la azotea", x: 49, y: 35, w: 12, h: 6, piso: "azotea" },
];

/** Cualquier zona desconocida del repo (una carpeta nueva) cae en la raíz. */
export function rectDe(env: string, zona: string): ZonaRect | null {
  const z = ZONAS.find((r) => r.env === env && r.zona === zona);
  if (z) return z;
  if (env === "repo") return ZONAS.find((r) => r.env === "repo" && r.zona === "raiz") ?? null;
  return ZONAS.find((r) => r.env === env) ?? null;
}

export function regionDe(env: string): Region | null {
  return REGIONES.find((r) => r.env === env) ?? null;
}

/** Hash pequeño y estable para esparcir adornos y jitter (sin Math.random). */
export function h32(...parts: Array<string | number>): number {
  let h = 0x811c9dc5;
  const s = parts.join(":");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function u01(...parts: Array<string | number>): number {
  return h32(...parts) / 4294967296;
}

/** Tipo de tile en (x, y) según región, zonas y adornos. */
export function tileEn(x: number, y: number): Tipo {
  for (const z of ZONAS) {
    if (x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h) {
      if (z.adorno && z.densidad && u01("z", z.env, z.zona, x, y) < z.densidad) {
        // no tapar el centro (los letreros y las criaturas viven ahí)
        const cx = z.x + z.w / 2;
        const cy = z.y + z.h / 2;
        if (Math.abs(x + 0.5 - cx) > z.w * 0.28 || Math.abs(y + 0.5 - cy) > z.h * 0.3) return z.adorno;
      }
      return z.piso;
    }
  }
  const r = regionDe(REGIONES.find((g) => x >= g.x && x < g.x + g.w && y >= g.y && y < g.y + g.h)?.env ?? "");
  if (!r) return "borde";
  if (x === r.x || y === r.y || x === r.x + r.w - 1 || y === r.y + r.h - 1) return "borde";
  if (r.adorno && r.densidad && u01("r", r.env, x, y) < r.densidad) return r.adorno;
  return r.fondo;
}
