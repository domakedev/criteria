// Operaciones de la mascotita que no son un tick ni una charla: estado para
// la página, nacer, mudarse de entorno, marcar el informe como leído,
// empezar de cero y el barrido del cron.
import { BOUNDS, cfg } from "./config";
import { clamp01 } from "./rng";
import * as C from "./cognition";
import * as DB from "./db";
import { MascotitaError } from "./errors";
import { DEFAULT_ENV, ENVIRONMENTS, getEnvironment, listEnvironments } from "./envs";
import { runTick } from "./tick";
import type { CapsView, DiaryEntryDoc, PetDoc, PetView, StateResponse } from "./types";

const HOUR_MS = 3_600_000;

function emptyCaps(): CapsView {
  const c = cfg();
  return {
    ticksLeft: c.maxTicksDay,
    chatsLeft: c.maxChatsDay,
    teachLeft: c.maxTeachDay,
    manualReadyAt: null,
  };
}

function capsFor(pet: PetDoc, dayKey: string, now: Date): CapsView {
  const c = cfg();
  const today = pet.day.key === dayKey;
  const ticks = today ? pet.day.ticks : 0;
  const manual = today ? pet.day.manualTicks : 0;
  let manualReadyAt: string | null = null;
  if (today && pet.day.lastManualAt) {
    const ready = Date.parse(pet.day.lastManualAt) + c.manualCooldownMin * 60_000;
    if (ready > now.getTime()) manualReadyAt = new Date(ready).toISOString();
  }
  if (manual >= c.maxManualTicksDay || ticks >= c.maxTicksDay) {
    // Hasta mañana (medianoche en Lima ≈ 05:00 UTC).
    const t = Date.parse(`${dayKey}T05:00:00Z`) + 24 * HOUR_MS;
    manualReadyAt = new Date(Math.max(t, now.getTime() + 60_000)).toISOString();
  }
  return {
    ticksLeft: Math.max(0, c.maxTicksDay - ticks),
    chatsLeft: Math.max(0, c.maxChatsDay - (today ? pet.day.chats : 0)),
    teachLeft: Math.max(0, c.maxTeachDay - (today ? pet.day.teachings : 0)),
    manualReadyAt,
  };
}

/** Exploraciones atrasadas que la página debe disparar al abrirse. */
function owedFor(pet: PetDoc, caps: CapsView, now: Date): number {
  if (pet.lock && Date.parse(pet.lock.until) > now.getTime()) return 0;
  if (caps.ticksLeft <= 0) return 0;
  if (!pet.lastTickAt) return 1; // el huevo eclosiona con su primer tick
  const hours = (now.getTime() - Date.parse(pet.lastTickAt)) / HOUR_MS;
  return Math.min(BOUNDS.maxOwed, caps.ticksLeft, Math.floor(hours / BOUNDS.owedHours));
}

export async function getState(uid: string): Promise<StateResponse> {
  const now = new Date();
  const nowIso = now.toISOString();
  const envs = listEnvironments();
  const pet = await DB.getPet(uid);
  if (!pet) {
    return {
      pet: null,
      envs,
      report: null,
      knowledge: [],
      fading: [],
      memories: [],
      chat: [],
      diary: [],
      owed: 0,
      caps: emptyCaps(),
      brainId: cfg().brainMode,
      names: C.suggestNames(uid),
    };
  }
  const [knowledge, fading, memories, chat, diary] = await Promise.all([
    DB.listConcepts(uid, "score", 20),
    DB.listConcepts(uid, "fading", 6),
    DB.listMemories(uid, 8),
    DB.listChats(uid, 12),
    DB.listDiary(uid, 40),
  ]);
  const dayKey = C.limaDayKey(now);
  const caps = capsFor(pet, dayKey, now);
  return {
    pet: C.toPetView(pet, nowIso),
    envs,
    report: C.buildReport(pet, diary, nowIso),
    knowledge: knowledge.map(C.conceptView),
    fading: fading.map(C.conceptView),
    memories: memories.map(C.memoryView),
    chat: chat.map(C.chatView),
    diary: diary.slice(0, 20).map(C.diaryView),
    owed: owedFor(pet, caps, now),
    caps,
    brainId: pet.brainId || cfg().brainMode,
    names: [],
  };
}

export async function hatch(uid: string, rawName: string): Promise<PetView> {
  const name = rawName
    .replace(/[^\p{L}\p{N} .'\-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, BOUNDS.nameMaxChars);
  if (!name) throw new MascotitaError("Ponle un nombre primero.", 400);
  const nowIso = new Date().toISOString();
  const pet = C.newPet(uid, name, nowIso, DEFAULT_ENV, Object.keys(ENVIRONMENTS));
  const created = await DB.createPet(pet);
  if (!created) {
    const existing = await DB.getPet(uid);
    if (existing) return C.toPetView(existing, nowIso);
  }
  return C.toPetView(pet, nowIso);
}

export async function moveEnv(uid: string, envId: string): Promise<PetView> {
  const env = getEnvironment(envId);
  if (!env) throw new MascotitaError("Ese lugar no existe.", 400);
  const pet = await DB.getPet(uid);
  if (!pet) throw new MascotitaError("Todavía no tienes mascota.", 404);
  if (!pet.allowedEnvs.includes(envId)) pet.allowedEnvs.push(envId);
  const nowIso = new Date().toISOString();
  if (pet.env !== envId) {
    const prevEnv = getEnvironment(pet.env);
    pet.env = envId;
    pet.drives.boredom = clamp01(pet.drives.boredom - 0.3);
    pet.lastSeenAt = nowIso;
    pet.updatedAt = nowIso;
    const t = moveTemplate(pet, C.envNameInSentence(prevEnv?.name ?? pet.env), C.envNameInSentence(env.name));
    const entry: DiaryEntryDoc = {
      id: `${nowIso}-entorno`,
      at: nowIso,
      kind: "entorno",
      env: envId,
      title: t.title,
      text: t.text,
      moodWord: pet.mood.word,
      brainId: "simple",
      seq: null,
      delta: C.emptyDelta(),
    };
    await Promise.all([
      DB.savePet(uid, {
        env: pet.env,
        allowedEnvs: pet.allowedEnvs,
        drives: pet.drives,
        lastSeenAt: pet.lastSeenAt,
        updatedAt: pet.updatedAt,
      }),
      DB.addDiary(uid, [entry]),
    ]);
  }
  return C.toPetView(pet, nowIso);
}

/** Mudanza pedida por el dueño: texto propio (el de "entorno" es para cuando se va sola). */
function moveTemplate(pet: PetDoc, from: string, to: string): { title: string; text: string } {
  const v = pet.stage === "huevo" || pet.stage === "cria" ? 0 : pet.stage === "joven" ? 1 : 2;
  const titles = ["Me llevaron a otro lado", "¡Viaje!", "Cambio de paisaje"];
  const texts = [
    `Mi dueño me cargó y me trajo a ${to}. Antes estaba en ${from}. Huele distinto. Voy a mirar todo.`,
    `¡Mi dueño me trajo a ${to}! Ya me sabía ${from} casi de memoria. Tengo ganas de meter la nariz en todo lo nuevo.`,
    `Mi dueño decidió que hoy tocaba ${to}. Dejo ${from} un tiempo; volveré a verlo con otros ojos.`,
  ];
  return { title: C.polish(titles[v]), text: C.polish(texts[v]) };
}

export async function markSeen(uid: string): Promise<void> {
  const nowIso = new Date().toISOString();
  await DB.savePet(uid, { lastSeenAt: nowIso, updatedAt: nowIso });
}

export async function deletePet(uid: string): Promise<void> {
  const pet = await DB.getPet(uid);
  if (pet?.lock && Date.parse(pet.lock.until) > Date.now()) {
    throw new MascotitaError("Está explorando ahora mismo; espera a que termine.", 409);
  }
  await DB.resetPet(uid);
}

/**
 * Barrido diario del cron: un tick por mascota activa, en serie (la API de
 * Gemini y el límite de GitHub son compartidos), mientras quede presupuesto
 * de tiempo. Las que no alcancen se ponen al día solas cuando su dueño abra
 * la página.
 */
export async function runCron(): Promise<{
  processed: string[];
  skipped: Array<{ uid: string; why: string }>;
  ms: number;
}> {
  const started = Date.now();
  const TOTAL_MS = 50_000;
  const pets = await DB.listActivePets(20);
  pets.sort((a, b) => (a.lastTickAt ?? "").localeCompare(b.lastTickAt ?? ""));
  const processed: string[] = [];
  const skipped: Array<{ uid: string; why: string }> = [];
  for (const pet of pets) {
    const remaining = TOTAL_MS - (Date.now() - started);
    if (remaining < 30_000) {
      skipped.push({ uid: pet.uid, why: "sin tiempo" });
      continue;
    }
    try {
      const r = await runTick(pet.uid, "cron", { deadlineMs: Math.min(BOUNDS.tickMs, remaining - 5_000) });
      if (r.skipped) skipped.push({ uid: pet.uid, why: r.skipped });
      else processed.push(pet.uid);
    } catch (err) {
      skipped.push({ uid: pet.uid, why: err instanceof Error ? err.message.slice(0, 80) : "error" });
    }
  }
  return { processed, skipped, ms: Date.now() - started };
}
