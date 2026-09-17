"use client";

// El terrario: un canvas con el mapa de tiles, las criaturas como sprites que
// caminan entre zonas, burbujas cuando emiten, comida y fuentes. Se redibuja
// solo (requestAnimationFrame) y recibe el estado del mundo cada vez que la
// página lo refresca; el movimiento se interpola en el cliente para que se
// vea vivo entre dos latidos. Tocar una criatura o una zona la selecciona.
import { useEffect, useRef } from "react";
import type { FotoCriatura, MundoView } from "@/lib/mascotita/types";
import { ALTO, ANCHO, REGIONES, TILE, ZONAS, rectDe, u01 } from "./mapa";
import { burbuja, comida, fuente, letrero, letreroRegion, mapaBase, sprite } from "./dibujo";
import { SILABAS } from "./shared";

/** cuánto dura la burbuja de un símbolo en pantalla (desde que se emitió) */
const BURBUJA_MS = 20 * 60_000;

interface Pos {
  x: number;
  y: number;
  tx: number;
  ty: number;
  mirandoIzq: boolean;
  paseoAt: number;
}

export interface Seleccion {
  cid: string | null;
  zona: { env: string; zona: string } | null;
}

export function Terrario({
  mundo,
  seleccion,
  onSeleccion,
}: {
  mundo: MundoView;
  seleccion: Seleccion;
  onSeleccion: (s: Seleccion) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const posRef = useRef<Map<string, Pos>>(new Map());
  const mundoRef = useRef(mundo);
  const selRef = useRef(seleccion);
  mundoRef.current = mundo;
  selRef.current = seleccion;

  // objetivo de cada criatura: el centro de su zona con un desvío propio
  useEffect(() => {
    const pos = posRef.current;
    const vivos = new Set<string>();
    for (const [cid, f] of Object.entries(mundo.fotos)) {
      const r = rectDe(f.env, f.zona);
      if (!r) continue;
      vivos.add(cid);
      const jx = (u01(cid, "jx") - 0.5) * (r.w - 2) * TILE * 0.6;
      const jy = (u01(cid, "jy") - 0.5) * (r.h - 2) * TILE * 0.6;
      const tx = (r.x + r.w / 2) * TILE + jx;
      const ty = (r.y + r.h / 2) * TILE + jy;
      const p = pos.get(cid);
      if (!p) pos.set(cid, { x: tx, y: ty, tx, ty, mirandoIzq: false, paseoAt: 0 });
      else {
        p.mirandoIzq = tx < p.x;
        p.tx = tx;
        p.ty = ty;
      }
    }
    for (const k of Array.from(pos.keys())) if (!vivos.has(k)) pos.delete(k);
  }, [mundo]);

  // bucle de dibujo
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;
    let raf = 0;
    const base = mapaBase();

    const frame = (t: number) => {
      const m = mundoRef.current;
      const sel = selRef.current;
      g.imageSmoothingEnabled = false;
      g.drawImage(base, 0, 0);

      // regiones y zonas
      for (const r of REGIONES) letreroRegion(g, (r.x + 1) * TILE + 3, (r.y + 1) * TILE + 2, r.nombre);
      for (const z of ZONAS) {
        const resaltada = !!sel.zona && sel.zona.env === z.env && sel.zona.zona === z.zona;
        letrero(g, (z.x + z.w / 2) * TILE, (z.y + z.h) * TILE - 12, z.nombre, resaltada);
        const rec = m.recursos[`${z.env}/${z.zona}`];
        if (rec) {
          const n = Math.min(12, Math.floor(rec.comida));
          for (let i = 0; i < n; i++) {
            const cx = (z.x + 1 + u01(z.zona, "cx", i) * (z.w - 2)) * TILE + 8;
            const cy = (z.y + 1 + u01(z.zona, "cy", i) * (z.h - 2)) * TILE + 8;
            comida(g, cx, cy, i);
          }
          if (rec.fuente) fuente(g, (z.x + 1.5) * TILE, (z.y + 1.5) * TILE, t / 400);
        }
      }

      // criaturas (las muertas quedan como una piedrita un rato)
      const ahora = Date.now();
      const cuadro = Math.floor(t / 350) % 2;
      const entradas = Object.entries(m.fotos).sort((a, b) => (posRef.current.get(a[0])?.y ?? 0) - (posRef.current.get(b[0])?.y ?? 0));
      for (const [cid, f] of entradas) {
        const p = posRef.current.get(cid);
        if (!p) continue;
        // caminar hacia el objetivo; si ya llegó, pasear un poco por la zona
        const dx = p.tx - p.x;
        const dy = p.ty - p.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.8 && f.viva) {
          const v = Math.min(d, 0.9);
          p.x += (dx / d) * v;
          p.y += (dy / d) * v;
        } else if (f.viva && t - p.paseoAt > 2500 + u01(cid, "paseo") * 3000) {
          p.paseoAt = t;
          const r = rectDe(f.env, f.zona);
          if (r) {
            const nx = (r.x + 1 + u01(cid, "px", Math.floor(t / 1000)) * (r.w - 2)) * TILE;
            const ny = (r.y + 1 + u01(cid, "py", Math.floor(t / 1000)) * (r.h - 2)) * TILE;
            p.tx = nx;
            p.ty = ny;
            p.mirandoIzq = nx < p.x;
          }
        }
        sprite(g, {
          x: p.x,
          y: p.y,
          tono: f.tono,
          etapa: f.etapa,
          energia: f.energia,
          cuadro: f.viva && d > 0.8 ? cuadro : 0,
          seleccionada: sel.cid === cid,
          viva: f.viva,
          mirandoIzq: p.mirandoIzq,
        });
        if (f.viva && f.ultimoSimbolo !== null && f.simboloAt && ahora - Date.parse(f.simboloAt) < BURBUJA_MS) {
          burbuja(g, p.x, p.y, SILABAS[f.ultimoSimbolo] ?? "?");
        }
        if (f.viva) {
          g.save();
          g.font = "7px ui-monospace, monospace";
          g.fillStyle = "rgba(246,241,220,0.9)";
          g.textAlign = "center";
          g.fillText(f.nombre, p.x, p.y + 16);
          g.restore();
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    // primero criaturas (más cercana en 14 px), luego zonas
    let mejor: { cid: string; d: number } | null = null;
    for (const [cid, p] of posRef.current) {
      const f: FotoCriatura | undefined = mundoRef.current.fotos[cid];
      if (!f) continue;
      const d = Math.hypot(p.x - x, p.y - y + 3);
      if (d < 14 && (!mejor || d < mejor.d)) mejor = { cid, d };
    }
    if (mejor) {
      const f = mundoRef.current.fotos[mejor.cid];
      onSeleccion({ cid: mejor.cid, zona: { env: f.env, zona: f.zona } });
      return;
    }
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    const z = ZONAS.find((r) => tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h);
    if (z) onSeleccion({ cid: null, zona: { env: z.env, zona: z.zona } });
    else onSeleccion({ cid: null, zona: null });
  };

  // En pantallas chicas el mapa no se encoge por debajo de 768 px: se desplaza
  // de lado (a 360 px los sprites serían de 5 px y no se vería nada).
  return (
    <div className="overflow-x-auto">
      <canvas
        ref={canvasRef}
        width={ANCHO * TILE}
        height={ALTO * TILE}
        onPointerDown={onPointer}
        className="w-full min-w-[768px] rounded-sm border-[3px] border-[#0b0d14]"
        style={{ aspectRatio: `${ANCHO} / ${ALTO}`, boxShadow: "0 0 0 2px #1b1f2e, 0 0 0 4px #2d3348" }}
        aria-label="El terrario: mapa de la colonia"
      />
    </div>
  );
}
