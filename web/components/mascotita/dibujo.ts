// Dibujo procedural del terrario en canvas 2D: tiles de 16 px pintados a mano
// (pasto, agua, adoquín, circuitos…), sprites de 16 px para las criaturas
// (color por genes, tamaño por etapa, dos cuadros de animación), burbujas
// con sílabas, comida y fuentes. Paleta corta y saturada, sin degradados.
import { ALTO, ANCHO, TILE, tileEn, u01, type Tipo } from "./mapa";
import type { LifeStage } from "@/lib/mascotita/types";

export const PALETA: Record<Tipo, readonly string[]> = {
  pasto: ["#5fbf6a", "#4faa5a"],
  pasto2: ["#7ccb7a", "#6bbd69"],
  arbol: ["#2f7a3e", "#1f5a2c", "#3e9a4c"],
  agua: ["#4d8fe3", "#3d7fd3", "#8fc0f5"],
  tierra: ["#c9a065", "#b98e56"],
  roca: ["#9a9a9a", "#6f6f6f"],
  cueva: ["#3c3651", "#2c2740"],
  adoquin: ["#cfc8b4", "#bfb8a4", "#a8a18e"],
  edificio: ["#e2a469", "#b8794a", "#f2e6c9"],
  asfalto: ["#6d6d7a", "#5d5d6a"],
  libros: ["#b9804f", "#8e5f39", "#d64f4f", "#3f7fd6", "#e6b84f"],
  alfombra: ["#b3383a", "#9c2f31", "#e2c55a"],
  butaca: ["#8a2c2e", "#5e1d1f"],
  oscuro: ["#2a2438", "#221d30"],
  cabina: ["#4d4a5e", "#3d3a4e", "#f2e08a"],
  azotea: ["#7e8fb0", "#6e7fa0", "#f4d35e"],
  circuito: ["#17233a", "#122036", "#2b7a8a"],
  circuito2: ["#1c2c48", "#162640", "#4fd1c5"],
  nodo: ["#1c2c48", "#4fd1c5", "#e8fff9"],
  borde: ["#1a1a22", "#1a1a22"],
};

let tilesCache: HTMLCanvasElement | null = null;

/** Pinta el mapa entero una vez en un canvas fuera de pantalla. */
export function mapaBase(): HTMLCanvasElement {
  if (tilesCache) return tilesCache;
  const c = document.createElement("canvas");
  c.width = ANCHO * TILE;
  c.height = ALTO * TILE;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  for (let y = 0; y < ALTO; y++) for (let x = 0; x < ANCHO; x++) tile(g, tileEn(x, y), x, y);
  tilesCache = c;
  return c;
}

function px(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
}

function tile(g: CanvasRenderingContext2D, t: Tipo, tx: number, ty: number): void {
  const x = tx * TILE;
  const y = ty * TILE;
  const r = (k: number) => u01("t", tx, ty, k);
  const p = PALETA[t];
  switch (t) {
    case "pasto":
    case "pasto2": {
      px(g, x, y, TILE, TILE, p[(tx + ty) % 2]);
      for (let i = 0; i < 3; i++) px(g, x + Math.floor(r(i) * 14), y + Math.floor(r(i + 5) * 14), 2, 1, p[1 - ((tx + ty) % 2)]);
      break;
    }
    case "arbol": {
      px(g, x, y, TILE, TILE, PALETA.pasto[(tx + ty) % 2]);
      px(g, x + 3, y + 2, 10, 10, p[0]);
      px(g, x + 5, y + 1, 6, 12, p[0]);
      px(g, x + 4, y + 3, 4, 3, p[2]);
      px(g, x + 6, y + 12, 4, 3, "#6b4a2b");
      px(g, x + 9, y + 8, 3, 3, p[1]);
      break;
    }
    case "agua": {
      px(g, x, y, TILE, TILE, p[(tx + ty) % 2]);
      px(g, x + Math.floor(r(1) * 8), y + 4 + ((tx * 3) % 6), 6, 1, p[2]);
      px(g, x + 2 + Math.floor(r(2) * 6), y + 10 + ((ty * 5) % 4), 4, 1, p[2]);
      break;
    }
    case "tierra": {
      px(g, x, y, TILE, TILE, p[(tx * 7 + ty) % 2]);
      px(g, x + Math.floor(r(1) * 12), y + Math.floor(r(2) * 12), 3, 2, p[1]);
      break;
    }
    case "roca": {
      px(g, x, y, TILE, TILE, PALETA.tierra[0]);
      px(g, x + 3, y + 5, 10, 8, p[1]);
      px(g, x + 4, y + 4, 7, 6, p[0]);
      break;
    }
    case "cueva": {
      px(g, x, y, TILE, TILE, p[(tx + ty) % 2]);
      if (r(1) < 0.2) px(g, x + Math.floor(r(2) * 14), y + Math.floor(r(3) * 14), 1, 1, "#b7a6ff");
      break;
    }
    case "adoquin": {
      px(g, x, y, TILE, TILE, p[0]);
      px(g, x, y + 7, TILE, 1, p[2]);
      px(g, x + ((ty % 2) * 8 + 7) % TILE, y, 1, 7, p[2]);
      px(g, x + ((ty % 2) * 8 + 15) % TILE, y + 8, 1, 8, p[2]);
      px(g, x + 2, y + 2, 4, 3, p[1]);
      break;
    }
    case "edificio": {
      px(g, x, y, TILE, TILE, PALETA.adoquin[0]);
      px(g, x + 1, y + 1, 14, 14, p[1]);
      px(g, x + 2, y + 2, 12, 12, p[0]);
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) px(g, x + 4 + i * 6, y + 4 + j * 5, 3, 3, r(i + j * 2) < 0.6 ? p[2] : "#4a3b2c");
      break;
    }
    case "asfalto": {
      px(g, x, y, TILE, TILE, p[(tx + ty) % 2]);
      if (r(1) < 0.3) px(g, x + 6, y + Math.floor(r(2) * 12), 4, 2, "#8c8c9a");
      break;
    }
    case "libros": {
      px(g, x, y, TILE, TILE, p[0]);
      px(g, x, y + 14, TILE, 2, p[1]);
      for (let i = 0; i < 4; i++) px(g, x + 1 + i * 4, y + 3 + Math.floor(r(i) * 3), 3, 10, p[2 + ((tx + i + ty) % 3)]);
      break;
    }
    case "alfombra": {
      px(g, x, y, TILE, TILE, p[(tx + ty) % 2]);
      if ((tx + ty) % 4 === 0) px(g, x + 6, y + 6, 4, 4, p[2]);
      break;
    }
    case "butaca": {
      px(g, x, y, TILE, TILE, PALETA.oscuro[0]);
      px(g, x + 3, y + 4, 10, 9, p[1]);
      px(g, x + 4, y + 3, 8, 6, p[0]);
      break;
    }
    case "oscuro": {
      px(g, x, y, TILE, TILE, p[(tx + ty) % 2]);
      break;
    }
    case "cabina": {
      px(g, x, y, TILE, TILE, p[(tx + ty) % 2]);
      if (r(1) < 0.25) px(g, x + 5, y + 5, 6, 3, p[2]);
      break;
    }
    case "azotea": {
      px(g, x, y, TILE, TILE, p[(tx + ty) % 2]);
      if (r(1) < 0.08) px(g, x + Math.floor(r(2) * 12), y + Math.floor(r(3) * 12), 2, 2, p[2]);
      break;
    }
    case "circuito":
    case "circuito2": {
      px(g, x, y, TILE, TILE, p[(tx + ty) % 2]);
      if (r(1) < 0.5) px(g, x, y + 7, TILE, 1, p[2] + "66");
      if (r(2) < 0.3) px(g, x + 7, y, 1, TILE, p[2] + "66");
      break;
    }
    case "nodo": {
      px(g, x, y, TILE, TILE, p[0]);
      px(g, x, y + 7, TILE, 1, p[1] + "88");
      px(g, x + 5, y + 5, 6, 6, p[1]);
      px(g, x + 7, y + 7, 2, 2, p[2]);
      break;
    }
    default:
      px(g, x, y, TILE, TILE, PALETA.borde[0]);
  }
}

// --- sprites ---

const ESCALA_ETAPA: Record<LifeStage, number> = { huevo: 0.7, cria: 0.75, joven: 0.9, adulta: 1, sabia: 1.05 };

export interface SpriteArgs {
  x: number;
  y: number;
  tono: number;
  etapa: LifeStage;
  energia: number;
  /** 0 | 1: cuadro de animación */
  cuadro: number;
  seleccionada: boolean;
  viva: boolean;
  mirandoIzq: boolean;
}

export function sprite(g: CanvasRenderingContext2D, a: SpriteArgs): void {
  const s = ESCALA_ETAPA[a.etapa] ?? 1;
  const cuerpo = `hsl(${a.tono} 70% ${a.viva ? 58 : 30}%)`;
  const oscuro = `hsl(${a.tono} 70% ${a.viva ? 38 : 22}%)`;
  const claro = `hsl(${a.tono} 70% 76%)`;
  g.save();
  g.translate(Math.round(a.x), Math.round(a.y));
  g.scale(s, s);
  if (a.mirandoIzq) g.scale(-1, 1);
  const bob = a.cuadro === 1 ? -1 : 0;
  // sombra
  px(g, -6, 6, 12, 2, "rgba(0,0,0,0.25)");
  if (!a.viva) {
    px(g, -5, -2, 10, 7, "#3a3a44");
    px(g, -3, -4, 6, 3, "#3a3a44");
    px(g, -1, -7, 2, 4, "#3a3a44");
    g.restore();
    return;
  }
  // brotes
  if (a.etapa !== "huevo") {
    px(g, -1, -11 + bob, 2, 3, oscuro);
    px(g, 0, -13 + bob, 3, 2, "#4ade80");
  }
  if (a.etapa === "adulta" || a.etapa === "sabia") px(g, -3, -12 + bob, 2, 2, "#4ade80");
  if (a.etapa === "sabia") px(g, -4, -15 + bob, 8, 1, "#f5c542");
  // cuerpo (semilla)
  px(g, -5, -6 + bob, 10, 11, cuerpo);
  px(g, -6, -3 + bob, 12, 6, cuerpo);
  px(g, -4, -8 + bob, 8, 2, cuerpo);
  px(g, -6, 3 + bob, 12, 1, oscuro);
  px(g, -4, -7 + bob, 3, 2, claro);
  // ojos
  const dormida = a.energia < 0.15;
  if (dormida) {
    px(g, -4, -2 + bob, 3, 1, "#1b1b24");
    px(g, 1, -2 + bob, 3, 1, "#1b1b24");
  } else {
    px(g, -4, -3 + bob, 2, 3, "#ffffff");
    px(g, 2, -3 + bob, 2, 3, "#ffffff");
    px(g, -3, -2 + bob, 1, 2, "#1b1b24");
    px(g, 3, -2 + bob, 1, 2, "#1b1b24");
  }
  // patitas
  px(g, -4, 5 + (a.cuadro === 1 ? 0 : 1), 3, 1, oscuro);
  px(g, 1, 5 + (a.cuadro === 1 ? 1 : 0), 3, 1, oscuro);
  if (a.seleccionada) {
    g.strokeStyle = "#fff8c2";
    g.lineWidth = 1;
    g.strokeRect(-8.5, -16.5 + bob, 17, 24);
  }
  g.restore();
}

export function burbuja(g: CanvasRenderingContext2D, x: number, y: number, texto: string, dios = false): void {
  g.save();
  g.font = "bold 9px ui-monospace, monospace";
  const w = Math.max(18, g.measureText(texto).width + 8);
  const h = 13;
  const bx = Math.round(x - w / 2);
  const by = Math.round(y - 30);
  px(g, bx - 1, by - 1, w + 2, h + 2, "#1b1b24");
  px(g, bx, by, w, h, dios ? "#fff3b0" : "#ffffff");
  px(g, Math.round(x) - 2, by + h, 4, 2, "#1b1b24");
  px(g, Math.round(x) - 1, by + h, 2, 1, dios ? "#fff3b0" : "#ffffff");
  g.fillStyle = "#1b1b24";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(texto, x, by + h / 2 + 0.5);
  g.restore();
}

export function comida(g: CanvasRenderingContext2D, x: number, y: number, k: number): void {
  const c = ["#f7b32b", "#ff7b54", "#f9e07f"][k % 3];
  px(g, x - 2, y - 2, 4, 4, c);
  px(g, x - 1, y - 3, 2, 1, "#5a8f3a");
}

export function fuente(g: CanvasRenderingContext2D, x: number, y: number, fase: number): void {
  g.save();
  // pedestal de piedra y un anillo que respira
  px(g, x - 5, y - 3, 10, 8, "#6f6f6f");
  px(g, x - 4, y - 4, 8, 8, "#c9c9c9");
  px(g, x - 2, y - 2, 4, 4, "#4d8fe3");
  g.strokeStyle = `rgba(232,255,249,${0.55 + 0.4 * Math.sin(fase)})`;
  g.lineWidth = 2;
  g.beginPath();
  g.arc(x, y, 8 + 2 * Math.sin(fase), 0, Math.PI * 2);
  g.stroke();
  g.restore();
}

export function letrero(g: CanvasRenderingContext2D, x: number, y: number, texto: string, resaltado: boolean): void {
  g.save();
  g.font = "bold 8px ui-monospace, monospace";
  const w = g.measureText(texto).width + 8;
  px(g, Math.round(x - w / 2), y, Math.round(w), 11, resaltado ? "#fff3b0" : "rgba(27,27,36,0.82)");
  g.fillStyle = resaltado ? "#1b1b24" : "#f6f1dc";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(texto, x, y + 6);
  g.restore();
}

export function letreroRegion(g: CanvasRenderingContext2D, x: number, y: number, texto: string): void {
  g.save();
  g.font = "bold 10px ui-monospace, monospace";
  const t = texto.toUpperCase();
  const w = g.measureText(t).width + 10;
  px(g, x - 3, y - 2, Math.round(w), 14, "rgba(27,27,36,0.85)");
  px(g, x - 3, y + 12, Math.round(w), 1, "#f5c542");
  g.fillStyle = "#f6f1dc";
  g.textAlign = "left";
  g.textBaseline = "top";
  g.fillText(t, x + 2, y);
  g.restore();
}
