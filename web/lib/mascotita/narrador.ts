// El narrador: Gemini le cuenta AL DUEÑO qué pasó, a partir de hechos y
// números (crónica, léxico, fichas). Es de una sola vía: lo que escribe se
// guarda aparte, ninguna criatura lo lee, no corrige las glosas del intérprete
// ni toca el mundo. Tope diario en config. Sin GEMINI_API_KEY, no existe.
import { GoogleGenAI } from "@google/genai";
import { NARRADOR } from "./config";
import * as C from "./cognition";
import { getStore } from "./db";
import { MascotitaError } from "./errors";
import { lexicoVacio, lexicoVista } from "./lexico";
import { getMundoView } from "./service";
import type { NarracionDoc, NarracionesDoc } from "./types";

export const NARRADOR_MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-latest";

export function narradorDisponible(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

let client: GoogleGenAI | null = null;
function gemini(): GoogleGenAI {
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

export function narracionesVacias(dayKey: string): NarracionesDoc {
  return { items: [], diaKey: dayKey, hoy: 0, updatedAt: new Date().toISOString() };
}

const INSTRUCCION = `Eres el narrador de una colonia de criaturas artificiales que viven en un repositorio de código y en tres mundos imaginados (un bosque, una ciudad, un cine). Cada criatura tiene su propia red neuronal pequeña, aprende sola de lo que vive, come, se reproduce sin pareja, muere de vejez, hambre o golpes, y emite símbolos (sílabas) que nadie sabe qué significan: un intérprete estadístico mide si se repiten en algún contexto. Tú NO intervienes en nada: solo le cuentas al dueño (un humano, en español de Perú, tuteo, tono cálido y claro, sin exagerar) qué pasó según los HECHOS que te doy. Reglas: no inventes hechos ni significados; si el intérprete dice "ruido", di que los símbolos todavía no significan nada; cita nombres y números cuando ayuden; máximo 220 palabras; sin listas ni encabezados, en dos o tres párrafos. Termina con una observación honesta sobre qué valdría la pena mirar mañana.`;

/** Genera una narración nueva (cuenta contra el tope diario) y la guarda. */
export async function narrar(uid: string): Promise<NarracionDoc> {
  if (!narradorDisponible()) throw new MascotitaError("El narrador no está configurado (falta GEMINI_API_KEY).", 503);
  const store = getStore();
  const now = new Date();
  const nowIso = now.toISOString();
  const dayKey = C.limaDayKey(now);
  let doc = (await store.getNarraciones()) ?? narracionesVacias(dayKey);
  if (doc.diaKey !== dayKey) doc = { ...doc, diaKey: dayKey, hoy: 0 };
  if (doc.hoy >= NARRADOR.porDia) throw new MascotitaError(`Hoy ya pediste ${NARRADOR.porDia} narraciones; mañana hay más.`, 429);

  const m = await getMundoView();
  const lex = lexicoVista((await store.getLexico()) ?? lexicoVacio(nowIso));
  const hechos = {
    fecha: dayKey,
    poblacion: m.poblacion,
    latido: { seq: m.latido.seq, ultimo: m.latido.lastAt, latidosHoy: m.dia.latidos },
    presupuesto: m.presupuesto,
    criaturasVivas: m.criaturas.map((c) => ({
      nombre: c.nombre,
      gen: c.gen,
      etapa: c.etapa,
      edadTicks: c.edadTicks,
      energia: c.drives.energy,
      animo: c.mood.word,
      donde: `${c.zona} (${c.env})`,
      creenciasFirmes: c.creencias.slice(0, 4).map((b) => `${b.verbo} ${b.objetivo}: ${b.q} (${b.n}×)`),
      emisiones: c.stats.emisiones,
      crias: c.stats.crias,
      fallosGraves: c.stats.fallosGraves,
    })),
    comida: m.recursos,
    cronicaHoy: m.cronica.slice(0, 60).map((e) => `${e.at.slice(11, 16)} [${e.tipo}] ${e.texto}`),
    lenguaje: {
      emisiones: lex.emisiones,
      bitsContexto: lex.bitsContexto,
      lecturaContexto: lex.lecturaContexto,
      bitsConsecuencia: lex.bitsConsecuencia,
      lecturaConsecuencia: lex.lecturaConsecuencia,
      glosas: lex.glosas.slice(0, 5).map((g) => g.texto),
    },
  };

  const res = await gemini().models.generateContent({
    model: NARRADOR_MODEL,
    contents: [{ role: "user", parts: [{ text: `HECHOS (JSON):\n${JSON.stringify(hechos).slice(0, NARRADOR.maxChars)}` }] }],
    config: { systemInstruction: INSTRUCCION, temperature: 0.7, maxOutputTokens: 600 },
  });
  const texto = (res.text ?? "").trim().slice(0, 2000);
  if (!texto) throw new MascotitaError("El narrador no dijo nada. Intenta de nuevo.", 502);

  const item: NarracionDoc = { at: nowIso, texto, dios: uid, modelo: NARRADOR_MODEL };
  doc.items = [item, ...doc.items].slice(0, NARRADOR.guardadas);
  doc.hoy += 1;
  doc.updatedAt = nowIso;
  await store.guardarNarraciones(doc);
  return item;
}

export async function listarNarraciones(): Promise<{ items: NarracionDoc[]; hoy: number; porDia: number; disponible: boolean }> {
  const dayKey = C.limaDayKey(new Date());
  const doc = (await getStore().getNarraciones()) ?? narracionesVacias(dayKey);
  return { items: doc.items, hoy: doc.diaKey === dayKey ? doc.hoy : 0, porDia: NARRADOR.porDia, disponible: narradorDisponible() };
}
