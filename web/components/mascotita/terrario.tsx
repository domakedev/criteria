"use client";

// El terrario: un canvas con el mapa de tiles, las criaturas como sprites que
// caminan entre zonas, burbujas cuando emiten, comida y fuentes. Se redibuja
// solo (requestAnimationFrame) y recibe el estado del mundo cada vez que la
// página lo refresca; el movimiento se interpola en el cliente para que se
// vea vivo entre dos latidos.
//
// Cámara: el mapa mide 64×44 tiles. En pantallas anchas cabe entero; en el
// celular se muestra una región (32×22, misma proporción) y se pasea con
// arrastre o con los botones de región. Tocar una criatura o una zona la
// selecciona; al elegir una criatura desde otro panel, la cámara la busca.
import { useCallback, useEffect, useRef, useState } from "react";
import type { FotoCriatura, MundoView } from "@/lib/mascotita/types";
import { ALTO, ANCHO, REGIONES, TILE, ZONAS, rectDe, u01 } from "./mapa";
import { burbuja, comida, fuente, letrero, letreroRegion, mapaBase, sprite } from "./dibujo";
import { SILABAS } from "./shared";

/** cuánto dura la burbuja de un símbolo en pantalla (desde que se emitió) */
const BURBUJA_MS = 20 * 60_000;
const MAPA_W = ANCHO * TILE;
const MAPA_H = ALTO * TILE;
/** ancho de contenedor a partir del cual el mapa entero se ve bien */
const ANCHO_ENTERO = 860;
/** píxeles de arrastre a partir de los cuales un toque deja de ser un toque */
const UMBRAL_ARRASTRE = 8;

interface Pos {
  x: number;
  y: number;
  tx: number;
  ty: number;
  mirandoIzq: boolean;
  paseoAt: number;
}

interface Camara {
  /** centro, en píxeles del mapa */
  cx: number;
  cy: number;
  /** tiles visibles a lo ancho: 64 = todo el mapa, 32 = una región */
  tiles: number;
}

export interface Seleccion {
  cid: string | null;
  zona: { env: string; zona: string } | null;
}

function clampCamara(c: Camara): Camara {
  const vw = c.tiles * TILE;
  const vh = vw * (ALTO / ANCHO);
  return {
    tiles: c.tiles,
    cx: Math.max(vw / 2, Math.min(MAPA_W - vw / 2, c.cx)),
    cy: Math.max(vh / 2, Math.min(MAPA_H - vh / 2, c.cy)),
  };
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
  const wrapRef = useRef<HTMLDivElement>(null);
  const posRef = useRef<Map<string, Pos>>(new Map());
  const mundoRef = useRef(mundo);
  const selRef = useRef(seleccion);
  const camRef = useRef<Camara>({ cx: MAPA_W / 2, cy: MAPA_H / 2, tiles: ANCHO });
  const [zoom, setZoom] = useState<"todo" | "region">("todo");
  const [regionActual, setRegionActual] = useState<string>("bosque");
  const [angosto, setAngosto] = useState(false);
  const arrastre = useRef<{ x: number; y: number; cx: number; cy: number; movido: boolean } | null>(null);
  mundoRef.current = mundo;
  selRef.current = seleccion;

  // --- tamaño: el canvas ocupa el ancho del contenedor con la proporción del mapa ---
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ajustar = () => {
      const w = Math.max(200, Math.floor(wrap.clientWidth));
      const h = Math.floor(w * (ALTO / ANCHO));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      const esAngosto = w < ANCHO_ENTERO;
      setAngosto(esAngosto);
    };
    ajustar();
    const ro = new ResizeObserver(ajustar);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // En pantallas angostas se arranca viendo una región; en anchas, todo.
  useEffect(() => {
    setZoom(angosto ? "region" : "todo");
  }, [angosto]);

  const irARegion = useCallback((env: string) => {
    const r = REGIONES.find((g) => g.env === env);
    if (!r) return;
    setRegionActual(env);
    camRef.current = clampCamara({ cx: (r.x + r.w / 2) * TILE, cy: (r.y + r.h / 2) * TILE, tiles: 32 });
  }, []);

  useEffect(() => {
    if (zoom === "todo") camRef.current = { cx: MAPA_W / 2, cy: MAPA_H / 2, tiles: ANCHO };
    else irARegion(regionActual);
    // solo al cambiar el zoom; la región se maneja aparte
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  // Al elegir una criatura desde otro panel, la cámara la busca (si está en modo región).
  useEffect(() => {
    if (!seleccion.cid || zoom !== "region") return;
    const f = mundo.fotos[seleccion.cid];
    if (f && f.env !== regionActual) irARegion(f.env);
  }, [seleccion.cid, zoom, mundo.fotos, regionActual, irARegion]);

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

  // --- bucle de dibujo ---
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
      const cam = camRef.current;
      const vw = cam.tiles * TILE;
      const s = canvas.width / vw;
      const vx = cam.cx - vw / 2;
      const vy = cam.cy - (vw * (ALTO / ANCHO)) / 2;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = "#10131c";
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.setTransform(s, 0, 0, s, -vx * s, -vy * s);
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

  // --- puntero: toque = seleccionar; arrastre = mover la cámara (modo región) ---
  const aMapa = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const cam = camRef.current;
    const vw = cam.tiles * TILE;
    const escala = vw / rect.width; // píxeles del mapa por píxel CSS
    return {
      x: cam.cx - vw / 2 + (e.clientX - rect.left) * escala,
      y: cam.cy - (vw * (ALTO / ANCHO)) / 2 + (e.clientY - rect.top) * escala,
      escala,
    };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    arrastre.current = { x: e.clientX, y: e.clientY, cx: camRef.current.cx, cy: camRef.current.cy, movido: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const a = arrastre.current;
    if (!a || zoom !== "region") return;
    const dx = e.clientX - a.x;
    const dy = e.clientY - a.y;
    if (!a.movido && Math.hypot(dx, dy) < UMBRAL_ARRASTRE) return;
    a.movido = true;
    const { escala } = aMapa(e);
    camRef.current = clampCamara({ ...camRef.current, cx: a.cx - dx * escala, cy: a.cy - dy * escala });
  };

  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const a = arrastre.current;
    arrastre.current = null;
    if (!a) return;
    if (a.movido) {
      // al soltar tras arrastrar, se recuerda la región donde quedó la cámara
      const r = REGIONES.find((g) => camRef.current.cx >= g.x * TILE && camRef.current.cx < (g.x + g.w) * TILE && camRef.current.cy >= g.y * TILE && camRef.current.cy < (g.y + g.h) * TILE);
      if (r) setRegionActual(r.env);
      return;
    }
    const { x, y } = aMapa(e);
    let mejor: { cid: string; d: number } | null = null;
    for (const [cid, p] of posRef.current) {
      const f: FotoCriatura | undefined = mundoRef.current.fotos[cid];
      if (!f) continue;
      const d = Math.hypot(p.x - x, p.y - y + 3);
      if (d < 16 && (!mejor || d < mejor.d)) mejor = { cid, d };
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

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1">
        <button className="pestana" onClick={() => setZoom(zoom === "todo" ? "region" : "todo")} title="Ver todo el mundo o una región">
          {zoom === "todo" ? "🔍 acercar" : "🗺 todo"}
        </button>
        {zoom === "region"
          ? REGIONES.map((r) => (
              <button key={r.env} className="pestana" aria-selected={regionActual === r.env} onClick={() => irARegion(r.env)}>
                {r.nombre.replace(/^(El|La) /, "")}
              </button>
            ))
          : null}
      </div>
      <div ref={wrapRef} className="w-full">
        <canvas
          ref={canvasRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => (arrastre.current = null)}
          className="block w-full rounded-sm border-[3px] border-[#0b0d14]"
          style={{ boxShadow: "0 0 0 2px #1b1f2e, 0 0 0 4px #2d3348", cursor: zoom === "region" ? "grab" : "pointer" }}
          aria-label="El terrario: mapa de la colonia"
        />
      </div>
    </div>
  );
}
