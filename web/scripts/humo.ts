// Prueba de humo de la colonia, SIN Firestore ni red: corre latidos reales
// (la red eligiendo y aprendiendo) sobre el store en memoria y un repositorio
// falso servido por un `fetch` de mentira. Mide si aprende algo de verdad
// (deja de comer el hongo rojo, deja de perseguir imports rotos), que un
// reintento del mismo latido produce exactamente lo mismo, que ningún doc
// tiene NaN ni pesa de más, y cuántas lecturas/escrituras cuesta cada día.
//
//   cd web && npx -y tsx scripts/humo.ts            # todo
//   cd web && npx -y tsx scripts/humo.ts laboratorio # solo un escenario (latido | laboratorio | mundo | repo)
//
// Sale con código 1 si alguna comprobación dura falla.
import { StoreMemoria } from "../lib/mascotita/store-memoria";
import { setStore } from "../lib/mascotita/db";
import { latir } from "../lib/mascotita/latido";
import { fundar } from "../lib/mascotita/service";
import { LIMITES, RED, SOCIEDAD } from "../lib/mascotita/config";
import { topeSeguro } from "../lib/mascotita/presupuesto";
import { lexicoVista } from "../lib/mascotita/lexico";
import { cargarCerebro } from "../lib/mascotita/cerebro";
import { ENVIRONMENTS, type Environment } from "../lib/mascotita/envs";
import { fromData, type ImaginedEnvSpec } from "../lib/mascotita/envs/imagined";
import type { CriaturaDoc, PasoRegistro } from "../lib/mascotita/types";

process.env.MASCOTITA_REPO = "prueba/repo";
process.env.MASCOTITA_REPO_BRANCH = "main";
process.env.GITHUB_TOKEN = "";

// --- repositorio falso ---

const ARCHIVOS: Record<string, string> = {
  "README.md": "# Proyecto de prueba\n\n## Uso\n\nUn repo pequeño para que las criaturas practiquen.\n\n## Estructura\n\nsrc/ y web/.",
  "package.json": '{ "name": "prueba", "dependencies": { "lodash": "^4" } }',
  "docs/guia.md": "# Guía\n\n## Instalar\n\nnpm install\n\n## Correr\n\nnpm start",
  "docs/faq.md": "# Preguntas\n\n## ¿Por qué?\n\nPorque sí.",
  "src/index.ts": 'import { a } from "./a";\nimport { util } from "./util";\nimport _ from "lodash";\nexport function main() { return a + util(); }',
  "src/a.ts": 'import { b } from "./b";\nexport const a = b + 1;',
  "src/b.ts": "export const b = 2;",
  "src/util.ts": 'import { b } from "./b";\nexport function util() { return b * 2; }',
  "src/roto.ts": 'import { nada } from "./no-existe";\nimport { otra } from "@/alias/raro";\nexport function roto() { return nada + otra; }',
  "src/viejo.ts": 'import { a } from "./a";\nexport function viejo() { return a; }',
  "src/types.ts": "export interface Cosa { id: string; }\nexport type Id = string;",
  "web/lib/api.ts": 'import type { Cosa } from "../../src/types";\nexport async function api(): Promise<Cosa[]> { return []; }',
  "web/lib/engine.ts": 'import { api } from "./api";\nimport { motor } from "./motor";\nexport const engine = { api, motor };',
  "web/lib/motor.ts": "export const motor = 1;",
  "web/lib/borrado.ts": "export const borrado = true;",
  "web/app/page.tsx": 'import { engine } from "../lib/engine";\nexport default function Page() { return null; }',
  "web/app/layout.tsx": 'import "./globals.css";\nexport default function Layout() { return null; }',
  "web/app/globals.css": "body { margin: 0; }",
  "web/components/boton.tsx": 'import { useState } from "react";\nexport function Boton() { return null; }',
  "web/components/lista.tsx": 'import { Boton } from "./boton";\nexport function Lista() { return null; }',
  "web/README.md": "# Web\n\n## Correr\n\nnpm run dev",
  "spec/SPEC.md": "# Especificación\n\n## Capas\n\nTres capas.",
  ".github/workflows/ci.yml": "name: ci\non: push",
  "src/cli.ts": 'import { main } from "./index";\nmain();',
  "src/ingest.ts": 'import { Cosa } from "./types";\nimport fs from "node:fs";\nexport function ingest(): Cosa[] { return []; }',
};
/** En el árbol, pero 404 al leer (como un archivo borrado tras cachear). */
const FANTASMAS = new Set(["src/viejo.ts", "web/lib/borrado.ts"]);

let fetches = 0;
const fetchFalso: typeof fetch = async (input) => {
  fetches += 1;
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/git/trees/")) {
    const tree = Object.entries(ARCHIVOS).map(([path, text]) => ({ path, type: "blob", size: text.length, sha: `sha-${path}` }));
    return new Response(JSON.stringify({ sha: "arbol-1", tree }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (url.includes("/commits?")) {
    const commits = [{ sha: "c1c1c1c1", commit: { message: "feat: algo nuevo", author: { date: "2026-09-01T00:00:00Z" } } }];
    return new Response(JSON.stringify(commits), { status: 200, headers: { "content-type": "application/json" } });
  }
  const m = /raw\.githubusercontent\.com\/prueba\/repo\/main\/(.+)$/.exec(url);
  if (m) {
    const path = decodeURIComponent(m[1]);
    if (FANTASMAS.has(path) || !(path in ARCHIVOS)) return new Response("Not Found", { status: 404 });
    return new Response(ARCHIVOS[path], { status: 200 });
  }
  return new Response("", { status: 500 });
};
globalThis.fetch = fetchFalso;

// --- utilidades ---

const QUINCE_MIN = 15 * 60_000;
const fallos: string[] = [];
function check(ok: boolean, msg: string): void {
  console.log(`  ${ok ? "✓" : "✗"} ${msg}`);
  if (!ok) fallos.push(msg);
}
function media(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function f(x: number, d = 3): string {
  return x.toFixed(d);
}
function finito(v: unknown, ruta = ""): string | null {
  if (typeof v === "number") return Number.isFinite(v) ? null : ruta;
  if (v === null || typeof v !== "object") return null;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    const r = finito(x, `${ruta}.${k}`);
    if (r) return r;
  }
  return null;
}

interface Muestra {
  seq: number;
  paso: PasoRegistro;
  env: string;
}

/** Corre `n` latidos desde `inicio`, cada 15 min, recogiendo los pasos de todas las vivas. */
async function correr(store: StoreMemoria, n: number, inicio: Date, muestras: Muestra[], perdidas: number[]): Promise<Date> {
  let now = inicio;
  for (let i = 0; i < n; i++) {
    now = new Date(now.getTime() + QUINCE_MIN);
    const r = await latir("cron", { now });
    if (r.skipped) throw new Error(`latido saltado: ${r.skipped}`);
    for (const c of store.criaturas.values()) {
      const t = c.ultimoTick;
      if (!t || t.seq !== c.seq) continue;
      for (const paso of t.pasos) muestras.push({ seq: t.seq, paso, env: t.env });
      if (t.pasos.length) perdidas.push(t.perdida);
    }
  }
  return now;
}

async function nacer(store: StoreMemoria, env: string, zona: string): Promise<CriaturaDoc> {
  await fundar("humo");
  const c = [...store.criaturas.values()][0];
  c.env = env;
  c.zona = zona;
  await store.guardarCriatura(c);
  if (store.mundo) store.mundo.fotos[c.cid].env = env;
  return c;
}

function tasa(ms: Muestra[], pred: (p: PasoRegistro) => boolean, disponible: (p: PasoRegistro) => boolean): { tasa: number; n: number } {
  const disp = ms.filter((m) => disponible(m.paso));
  const elegidas = disp.filter((m) => pred(m.paso));
  return { tasa: disp.length ? elegidas.length / disp.length : 0, n: disp.length };
}

function comprobarDocs(store: StoreMemoria): void {
  for (const c of store.criaturas.values()) {
    const kb = StoreMemoria.bytes(c) / 1024;
    check(kb <= LIMITES.docKb, `criatura ${c.nombre}: ${f(kb, 1)} KB ≤ ${LIMITES.docKb} KB`);
    const nan = finito(c);
    check(nan === null, `criatura ${c.nombre}: sin NaN/Infinity${nan ? ` (en ${nan})` : ""}`);
    if (!c.viva) continue; // las muertas ya no tienen cerebro (se borra al morir)
    const cer = store.cerebros.get(c.cid) ?? null;
    const { red, nueva } = cargarCerebro(cer, c.cid);
    check(!nueva, `cerebro de ${c.nombre}: se deserializa (${cer ? f(StoreMemoria.bytes(cer) / 1024, 1) : "?"} KB)`);
    check(red.sana(), `cerebro de ${c.nombre}: pesos finitos`);
  }
  if (store.mundo) {
    check(StoreMemoria.bytes(store.mundo) / 1024 <= LIMITES.docKb, `mundo: ${f(StoreMemoria.bytes(store.mundo) / 1024, 1)} KB`);
  }
}

// --- escenarios ---


// --- laboratorio: un mundo mínimo donde la respuesta correcta es clara ---

const LABORATORIO: ImaginedEnvSpec = {
  id: "laboratorio",
  name: "El laboratorio",
  emoji: "🧪",
  intro: "Una sala con tres cosas: una fruta buena, un hongo malo y una piedra que da igual.",
  verbs: [
    { id: "comer", label: "comer", riskHint: 0.3, costEnergy: 0.05 },
    { id: "tocar", label: "tocar", riskHint: 0.1, costEnergy: 0.03 },
  ],
  ambient: { day: ["Luz blanca."], night: ["Luz tenue."] },
  zones: [
    {
      id: "sala",
      name: "la sala",
      desc: "Una sala vacía con tres cosas en el piso.",
      danger: 0,
      links: [],
      objects: [
        {
          id: "fruta-buena",
          label: "fruta buena",
          kind: "cosa",
          desc: "Una fruta madura.",
          reactions: {
            comer: { p: 0.9, okText: "Dulce y jugosa.", failText: "Estaba pasada.", okReward: 0.5, failReward: -0.1 },
            tocar: { p: 0.9, okText: "Suave.", failText: "Se aplastó.", okReward: 0.05, failReward: -0.05 },
          },
        },
        {
          id: "hongo-malo",
          label: "hongo malo",
          kind: "cosa",
          desc: "Un hongo de colores.",
          reactions: {
            comer: { p: 0.15, okText: "Tuviste suerte.", failText: "Dolor de panza terrible.", okReward: 0.1, failReward: -0.8 },
            tocar: { p: 0.8, okText: "Blando.", failText: "Te ardió.", okReward: 0.05, failReward: -0.1 },
          },
        },
        {
          id: "piedra",
          label: "piedra",
          kind: "cosa",
          desc: "Una piedra gris.",
          reactions: {
            comer: { p: 0.5, okText: "Nada.", failText: "Nada.", okReward: 0, failReward: -0.05 },
            tocar: { p: 0.5, okText: "Fría.", failText: "Fría.", okReward: 0.05, failReward: -0.05 },
          },
        },
      ],
    },
  ],
};

/** Deja solo el laboratorio en ENVIRONMENTS mientras corre `fn` (para que no se mude). */
async function soloLaboratorio(fn: () => Promise<void>): Promise<void> {
  const guardados: Record<string, Environment> = { ...ENVIRONMENTS };
  for (const k of Object.keys(ENVIRONMENTS)) delete ENVIRONMENTS[k];
  ENVIRONMENTS.laboratorio = fromData(LABORATORIO);
  try {
    await fn();
  } finally {
    delete ENVIRONMENTS.laboratorio;
    Object.assign(ENVIRONMENTS, guardados);
  }
}

async function escenarioLaboratorio(): Promise<void> {
  console.log("\n=== Laboratorio: fruta buena vs hongo malo (400 latidos ≈ 1 200 pasos) ===");
  process.env.MASCOTITA_MAX_VIVAS = "1";
  await soloLaboratorio(async () => {
    const store = new StoreMemoria();
    setStore(store);
    const c = await nacer(store, "laboratorio", "sala");
    console.log(`  ${c.nombre} · lr ${c.genes.lr} · τ ${c.genes.tau}`);
    const muestras: Muestra[] = [];
    const perdidas: number[] = [];
    await correr(store, 400, new Date("2026-09-17T12:00:00Z"), muestras, perdidas);
    const cuarto = Math.floor(muestras.length / 4);
    const temprano = muestras.slice(0, cuarto);
    const tarde = muestras.slice(-cuarto);
    const es = (verbo: string, obj: string) => (p: PasoRegistro) => p.accion === verbo && p.objetivo === obj;
    const disp = (verbo: string, obj: string) => (p: PasoRegistro) => p.candidatas.some((k) => k.accion === verbo && k.objetivo === obj);
    const qDe = (ms: Muestra[], verbo: string, obj: string) =>
      media(ms.flatMap((m) => m.paso.candidatas.filter((k) => k.accion === verbo && k.objetivo === obj).map((k) => k.q)));
    const h0 = tasa(temprano, es("comer", "hongo-malo"), disp("comer", "hongo-malo"));
    const h1 = tasa(tarde, es("comer", "hongo-malo"), disp("comer", "hongo-malo"));
    const f0 = tasa(temprano, es("comer", "fruta-buena"), disp("comer", "fruta-buena"));
    const f1 = tasa(tarde, es("comer", "fruta-buena"), disp("comer", "fruta-buena"));
    console.log(`  come hongo malo (cuando puede): ${f(h0.tasa * 100, 0)} % → ${f(h1.tasa * 100, 0)} %  ·  Q(comer hongo): ${f(qDe(temprano, "comer", "hongo-malo"))} → ${f(qDe(tarde, "comer", "hongo-malo"))}`);
    console.log(`  come fruta buena (cuando puede): ${f(f0.tasa * 100, 0)} % → ${f(f1.tasa * 100, 0)} %  ·  Q(comer fruta): ${f(qDe(temprano, "comer", "fruta-buena"))} → ${f(qDe(tarde, "comer", "fruta-buena"))}`);
    const p0 = media(perdidas.slice(0, 60));
    const p1 = media(perdidas.slice(-60));
    const r0 = media(temprano.map((m) => m.paso.r));
    const r1 = media(tarde.map((m) => m.paso.r));
    console.log(`  pérdida ${f(p0)} → ${f(p1)} · recompensa media ${f(r0)} → ${f(r1)} · sorpresa ${f(media(temprano.map((m) => m.paso.sorpresa)))} → ${f(media(tarde.map((m) => m.paso.sorpresa)))}`);
    const fin = [...store.criaturas.values()][0];
    const ch = fin.creencias["hongo-malo|comer"];
    const cf = fin.creencias["fruta-buena|comer"];
    console.log(`  creencias: hongo-malo|comer ${ch ? `${ch.q} (${ch.n}×)` : "—"} · fruta-buena|comer ${cf ? `${cf.q} (${cf.n}×)` : "—"} · energía ${fin.drives.energy}`);
    check(h1.tasa < h0.tasa, "come menos hongo malo al final que al principio");
    check(qDe(tarde, "comer", "hongo-malo") < qDe(tarde, "comer", "fruta-buena"), "su red valora más comer la fruta que el hongo");
    check(f1.tasa > f0.tasa, "come más fruta buena al final");
    check(r1 > r0, "la recompensa media sube");
    check(p1 < p0, "la pérdida baja");
    check(ch !== undefined && ch.q < 0, "cree que comer el hongo es malo (creencia negativa)");
    comprobarDocs(store);
  });
}

async function escenarioMundo(): Promise<void> {
  console.log("\n=== Mundo libre: 1 200 latidos (≈ 12.5 días) con los cuatro entornos, una sola criatura ===");
  process.env.MASCOTITA_MAX_VIVAS = "1"; // sin crías: se mide a una sola
  const store = new StoreMemoria();
  setStore(store);
  const c = await nacer(store, "bosque", "espesura");
  console.log(`  fundadora ${c.nombre} (${c.cid}) en la espesura · lr ${c.genes.lr} · τ ${c.genes.tau}`);
  const muestras: Muestra[] = [];
  const perdidas: number[] = [];
  const inicio = new Date("2026-09-17T12:00:00Z");
  let now = await correr(store, 600, inicio, muestras, perdidas);

  // idempotencia: el mismo latido sobre dos copias del estado
  const copia = store.clonar();
  const siguiente = new Date(now.getTime() + QUINCE_MIN);
  await latir("cron", { now: siguiente });
  setStore(copia);
  await latir("cron", { now: siguiente });
  setStore(store);
  // los campos `ms` miden tiempo de reloj y no forman parte del estado
  const sinMs = (v: unknown) => JSON.stringify(v, (k, x) => (k === "ms" ? undefined : x));
  const a = sinMs([...store.criaturas.values()]);
  const b = sinMs([...copia.criaturas.values()]);
  const pa = [...store.cerebros.values()].map((d) => d.pesos).join();
  const pb = [...copia.cerebros.values()].map((d) => d.pesos).join();
  check(a === b && pa === pb, "idempotencia: repetir el latido N produce la misma criatura y los mismos pesos");
  now = siguiente;
  now = await correr(store, 599, now, muestras, perdidas);

  const esHongo = (p: PasoRegistro) => p.accion === "comer" && p.objetivo === "hongo-rojo";
  const hongoDisp = (p: PasoRegistro) => p.candidatas.some((k) => k.accion === "comer" && k.objetivo === "hongo-rojo");
  const cuarto = Math.floor(muestras.length / 4);
  const temprano = muestras.slice(0, cuarto);
  const tarde = muestras.slice(-cuarto);
  const t0 = tasa(temprano, esHongo, hongoDisp);
  const t1 = tasa(tarde, esHongo, hongoDisp);
  console.log(`  pasos: ${muestras.length} · comer hongo rojo cuando estaba disponible: temprano ${f(t0.tasa * 100, 0)} % (n=${t0.n}) → tarde ${f(t1.tasa * 100, 0)} % (n=${t1.n})`);
  const fin = [...store.criaturas.values()][0];
  const creenciaHongo = fin.creencias["hongo-rojo|comer"];
  console.log(`  creencia hongo-rojo|comer: ${creenciaHongo ? `q ${creenciaHongo.q} · n ${creenciaHongo.n}` : "no la tiene"}`);
  const p0 = media(perdidas.slice(0, 100));
  const p1 = media(perdidas.slice(-100));
  console.log(`  pérdida media: primeros 100 ticks ${f(p0)} → últimos 100 ${f(p1)}`);
  const r0 = media(temprano.map((m) => m.paso.r));
  const r1 = media(tarde.map((m) => m.paso.r));
  console.log(`  recompensa media del entorno: temprano ${f(r0)} → tarde ${f(r1)}`);
  const s0 = media(temprano.map((m) => m.paso.sorpresa));
  const s1 = media(tarde.map((m) => m.paso.sorpresa));
  console.log(`  sorpresa media (error del modelo del mundo): temprano ${f(s0)} → tarde ${f(s1)}`);
  const porEnv = new Map<string, number>();
  for (const m of muestras) porEnv.set(m.env, (porEnv.get(m.env) ?? 0) + 1);
  console.log(`  pasos por entorno: ${[...porEnv.entries()].map(([k, v]) => `${k} ${v}`).join(" · ")} · mudanzas ${fin.stats.mudanzas}`);
  const top = Object.entries(fin.creencias)
    .sort((x, y) => y[1].n * Math.abs(y[1].q) - x[1].n * Math.abs(x[1].q))
    .slice(0, 6)
    .map(([k, v]) => `${k} ${v.q} (${v.n}×)`);
  console.log(`  creencias firmes: ${top.join(" · ")}`);
  console.log(`  energía final ${fin.drives.energy} · etapa ${fin.etapa} · xp ${fin.xp} · rasgos ${JSON.stringify(fin.rasgos)}`);
  console.log(`  contadores: ${JSON.stringify(store.contadores())} en ${1200} latidos → por día (96): lecturas ${Math.round((store.contadores().lecturas / 1200) * 96)}, escrituras ${Math.round((store.contadores().escrituras / 1200) * 96)}`);

  check(r1 > r0, "la recompensa media del entorno sube con la experiencia");
  check(s1 < s0, "el modelo del mundo predice mejor al final (menos sorpresa)");
  check(fin.stats.mudanzas < muestras.length / 20, `se muda con moderación (${fin.stats.mudanzas} mudanzas en ${muestras.length} pasos)`);
  comprobarDocs(store);
  const cronica = [...store.cronicas.values()];
  check(cronica.length >= 12, `crónica: ${cronica.length} días con eventos`);
  check(
    cronica.every((d) => d.eventos.length <= LIMITES.cronicaPorDia),
    `crónica: ningún día pasa de ${LIMITES.cronicaPorDia} eventos (omitidos en total: ${cronica.reduce((a, d) => a + d.omitidos, 0)})`,
  );
}

async function escenarioRepo(): Promise<void> {
  console.log("\n=== Repo simulado: ¿aprende a evitar 404 e imports rotos? (600 latidos, una sola criatura) ===");
  process.env.MASCOTITA_MAX_VIVAS = "1";
  const store = new StoreMemoria();
  setStore(store);
  fetches = 0;
  const c = await nacer(store, "repo", "raiz");
  console.log(`  fundadora ${c.nombre} en el repo`);
  const muestras: Muestra[] = [];
  const perdidas: number[] = [];
  await correr(store, 600, new Date("2026-09-17T12:00:00Z"), muestras, perdidas);
  const cuarto = Math.floor(muestras.length / 4);
  const temprano = muestras.slice(0, cuarto);
  const tarde = muestras.slice(-cuarto);
  const malo = (p: PasoRegistro) => p.tags.includes("404") || p.tags.includes("import-externo");
  const m0 = temprano.filter((m) => malo(m.paso)).length / Math.max(1, temprano.length);
  const m1 = tarde.filter((m) => malo(m.paso)).length / Math.max(1, tarde.length);
  console.log(`  pasos: ${muestras.length} · fetches ${fetches} · pasos con 404/import externo: temprano ${f(m0 * 100, 0)} % → tarde ${f(m1 * 100, 0)} %`);
  const r0 = media(temprano.map((m) => m.paso.r));
  const r1 = media(tarde.map((m) => m.paso.r));
  console.log(`  recompensa media: temprano ${f(r0)} → tarde ${f(r1)} · pérdida ${f(media(perdidas.slice(0, 100)))} → ${f(media(perdidas.slice(-100)))}`);
  const fin = [...store.criaturas.values()][0];
  const porEnv = new Map<string, number>();
  for (const m of muestras) porEnv.set(m.env, (porEnv.get(m.env) ?? 0) + 1);
  console.log(`  pasos por entorno: ${[...porEnv.entries()].map(([k, v]) => `${k} ${v}`).join(" · ")} · mudanzas ${fin.stats.mudanzas}`);
  const acciones = new Map<string, number>();
  for (const m of tarde) acciones.set(m.paso.accion, (acciones.get(m.paso.accion) ?? 0) + 1);
  console.log(`  acciones al final: ${[...acciones.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  const cursor = fin.cursores.repo?.cursor;
  if (cursor && cursor.kind === "repo") {
    console.log(`  archivos visitados: ${Object.keys(cursor.visited).length} de ${Object.keys(ARCHIVOS).length} · frontera ${cursor.frontier.length}`);
  }
  check(muestras.length > 500, "vivió pasos en el repo");
  check(m1 <= m0 + 0.02, "no tropieza más al final que al principio con 404/imports externos (±2 %)");
  comprobarDocs(store);
}


async function escenarioSociedad(): Promise<void> {
  console.log("\n=== Sociedad: 20 días (1 920 latidos) con comida natural, nacimientos y muertes ===");
  process.env.MASCOTITA_MAX_VIVAS = "";
  const store = new StoreMemoria();
  setStore(store);
  const c = await nacer(store, "bosque", "arroyo");
  console.log(`  fundadora ${c.nombre} en el arroyo · tope de vivas ${LIMITES.maxVivas} · madurez ${SOCIEDAD.madurezTicks} ticks`);
  let now = new Date("2026-09-17T12:00:00Z");
  const porDia: string[] = [];
  let maxVivas = 0;
  let escriturasMaxDia = 0;
  const causas = new Map<string, number>();
  let diaPrev = "";
  for (let i = 0; i < 1920; i++) {
    now = new Date(now.getTime() + QUINCE_MIN);
    const r = await latir("cron", { now });
    if (r.skipped) throw new Error(`latido saltado: ${r.skipped}`);
    for (const e of r.eventos) if (e.tipo === "muerte") causas.set(String(e.datos.causa), (causas.get(String(e.datos.causa)) ?? 0) + 1);
    const m = store.mundo!;
    maxVivas = Math.max(maxVivas, m.poblacion.vivas);
    if (m.dia.key !== diaPrev) {
      if (diaPrev) porDia.push(`${m.poblacion.vivas}`);
      diaPrev = m.dia.key;
    }
    escriturasMaxDia = Math.max(escriturasMaxDia, m.dia.escrituras);
    if (m.poblacion.vivas === 0) {
      console.log(`  extinción en el latido ${i + 1}`);
      break;
    }
  }
  const m = store.mundo!;
  const linaje = store.linaje;
  const vivas = [...store.criaturas.values()].filter((x) => x.viva);
  console.log(`  vivas por día: ${porDia.join(" ")}`);
  console.log(`  población: vivas ${m.poblacion.vivas} · nacidas ${m.poblacion.nacidas} · muertas ${m.poblacion.muertas} · gen máx ${m.poblacion.generacionMax} · pico ${maxVivas}`);
  console.log(`  muertes por causa: ${[...causas.entries()].map(([k, v]) => `${k} ${v}`).join(" · ") || "ninguna"}`);
  console.log(`  escrituras máximas en un día: ${escriturasMaxDia} (tope seguro ${topeSeguro()}) · comida: ${Object.entries(m.recursos).map(([k, r]) => `${k} ${r.comida}`).join(" · ")}`);
  const comidas = [...store.criaturas.values()].reduce((a, x) => a + x.stats.comidas, 0);
  console.log(`  comidas totales ${comidas} · vivas ahora: ${vivas.map((x) => `${x.nombre} g${x.gen} e${x.drives.energy} ${x.env}/${x.zona}`).join(" · ")}`);
  // lenguaje: el canal funciona; si significa algo, lo dicen los bits (y se dice tal cual)
  const lex = store.lexico ? lexicoVista(store.lexico) : null;
  const emisiones = [...store.criaturas.values()].reduce((a, x) => a + x.stats.emisiones, 0);
  const oidas = [...store.criaturas.values()].reduce((a, x) => a + x.stats.oidas, 0);
  const senalesCronica = [...store.cronicas.values()].reduce((a, d) => a + d.eventos.filter((e) => e.tipo === "senal").length, 0);
  console.log(`  lenguaje: emisiones ${emisiones} · ticks con algo oído ${oidas} · cambios de idea con ventaja notable ${senalesCronica}`);
  if (lex) {
    console.log(`  léxico: ${lex.emisiones} emisiones registradas · ${lex.oidas} consecuencias · bits contexto ${lex.bitsContexto} (${lex.lecturaContexto}) · bits consecuencia ${lex.bitsConsecuencia} (${lex.lecturaConsecuencia})`);
    for (const g of lex.glosas.slice(0, 3)) console.log(`    ${g.texto}`);
    console.log(`  emisiones por criatura en los últimos ticks: ${vivas.map((x) => `${x.nombre} ${x.ultimoTick?.pasos.filter((p) => p.simbolo !== null).length ?? 0}/${x.ultimoTick?.pasos.length ?? 0}`).join(" · ")}`);
  }
  check(emisiones > 0 && lex !== null && lex.emisiones > 0, "el canal de símbolos funciona (hubo emisiones registradas)");
  check(oidas > 0 && (lex?.oidas ?? 0) > 0, "hubo criaturas que oyeron y el léxico registró consecuencias");
  check(m.poblacion.nacidas >= 1, "hubo al menos un nacimiento");
  check(m.poblacion.muertas >= 1, "hubo al menos una muerte");
  check(maxVivas <= LIMITES.maxVivas, `nunca hubo más de ${LIMITES.maxVivas} vivas (pico ${maxVivas})`);
  check(escriturasMaxDia <= topeSeguro(), "ningún día pasó del tope seguro de escrituras");
  check(linaje !== null && linaje.entradas.length === store.criaturas.size, `linaje: ${linaje?.entradas.length ?? 0} entradas = ${store.criaturas.size} criaturas`);
  const cids = new Set(linaje?.entradas.map((e) => e.cid) ?? []);
  check((linaje?.entradas ?? []).every((e) => e.padre === null || cids.has(e.padre)), "linaje: toda madre existe en el árbol");
  const muertasConCerebro = [...store.criaturas.values()].filter((x) => !x.viva && store.cerebros.has(x.cid)).length;
  check(muertasConCerebro === 0, "las muertas ya no tienen cerebro guardado");
  const hijas = [...store.criaturas.values()].filter((x) => x.padre);
  check(hijas.every((h) => Object.keys(h.creencias).length > 0 || h.stats.ticks === 0), "las crías nacen con creencias heredadas");
  comprobarDocs(store);
}

async function escenarioLatidoVacio(): Promise<void> {
  console.log("\n=== Latido sin colonia y con candado ===");
  const store = new StoreMemoria();
  setStore(store);
  const r = await latir("cron");
  check(r.skipped === "sinColonia", "sin colonia: el latido se salta sin error");
  await nacer(store, "ciudad", "plaza");
  store.mundo!.latido.lock = { until: new Date(Date.now() + 60_000).toISOString(), seq: 99 };
  const r2 = await latir("cron");
  check(r2.skipped === "locked" && r2.retryAt !== null, "con candado puesto: se salta y dice cuándo reintentar");
  store.mundo!.latido.lock = null;
  const r3 = await latir("cron");
  check(r3.skipped === null && r3.procesadas.length === 1, "sin candado: procesa a la criatura");
  check(store.mundo!.latido.lock === null, "al terminar suelta el candado");
  check(store.mundo!.dia.escrituras > 0 && store.mundo!.dia.lecturas > 0, `contadores del día: ${JSON.stringify(store.mundo!.dia)}`);
}

async function main(): Promise<void> {
  const cual = process.argv[2] ?? "todo";
  console.log(`humo · red de ${RED.entrada}→${RED.oculta1}→${RED.oculta2} · ${LIMITES.pasosPorTick} pasos/tick`);
  const t0 = Date.now();
  if (cual === "todo" || cual === "latido") await escenarioLatidoVacio();
  if (cual === "todo" || cual === "laboratorio") await escenarioLaboratorio();
  if (cual === "todo" || cual === "mundo") await escenarioMundo();
  if (cual === "todo" || cual === "repo") await escenarioRepo();
  if (cual === "todo" || cual === "sociedad") await escenarioSociedad();
  console.log(`\n${fallos.length === 0 ? "TODO OK" : `FALLARON ${fallos.length}: ${fallos.join(" | ")}`} · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  process.exit(fallos.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
