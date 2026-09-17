// Charlar y enseñar. Las dos son EXPERIENCIAS para la mascota: hablar le baja
// la soledad y refuerza lo que recuerda; lo que el dueño le enseña entra con
// confianza 0.6 y queda marcado para ponerse a prueba en el entorno — nunca
// como regla del sistema. Responde SOLO desde su conocimiento (ids validados).
import { BOUNDS, CAL, CAPS, cfg } from "./config";
import { round3 } from "./rng";
import * as C from "./cognition";
import * as DB from "./db";
import { MascotitaError } from "./errors";
import {
  makeBrain,
  makeBudget,
  makeDeadline,
  traceId,
  type BrainTrace,
  type SpeakInput,
} from "./brain";
import { getEnvironment } from "./envs";
import type {
  ChatDoc,
  ChatResponse,
  ConceptDoc,
  DiaryEntryDoc,
  PetDoc,
  TeachResponse,
} from "./types";

const CHAT_MIN_GAP_MS = 5_000;

/** Reset en memoria de los contadores si cambió el día (fuera del candado del tick). */
function rollDay(pet: PetDoc, dayKey: string): void {
  if (pet.day.key === dayKey) return;
  pet.day = {
    ...pet.day,
    key: dayKey,
    ticks: 0,
    manualTicks: 0,
    llmCalls: 0,
    chats: 0,
    teachings: 0,
    absenceApplied: false,
  };
}

async function loadPetOrThrow(uid: string): Promise<PetDoc> {
  const pet = await DB.getPet(uid);
  if (!pet) throw new MascotitaError("Todavía no tienes mascota.", 404);
  if (pet.stage === "huevo") {
    throw new MascotitaError("Todavía está en el huevo: deja que explore una vez para que nazca.", 409);
  }
  return pet;
}

/** Ruta del repo mencionada en un texto que exista en el árbol cacheado. */
async function refFromText(text: string): Promise<string | null> {
  const cache = await DB.getRepoTreeCache().catch(() => null);
  if (!cache) return null;
  const paths = new Set(cache.tree.map((t) => t.p));
  const candidates = text.match(/[\w.-]+(?:\/[\w.-]+)+/g) ?? [];
  for (const c of candidates) {
    const clean = c.replace(/^\.?\//, "").replace(/[.,;:)]+$/, "");
    if (paths.has(clean)) return clean;
  }
  return null;
}

async function speak(
  pet: PetDoc,
  uid: string,
  kind: "charla" | "ensenanza",
  text: string,
  dayKey: string,
) {
  const c = cfg();
  const nowIso = new Date().toISOString();
  const [concepts, memories, chats, diary] = await Promise.all([
    DB.listConcepts(uid, "score", 80),
    DB.listMemories(uid, 8),
    DB.listChats(uid, BOUNDS.chatHistoryTurns),
    DB.listDiary(uid, 3),
  ]);
  // Lo más relacionado con el mensaje primero; se completa con lo más sólido.
  const ranked = C.lexicalRank(concepts, text, 12);
  const seen = new Set(ranked.map((k) => k.id));
  const pool: ConceptDoc[] = [...ranked];
  for (const k of concepts) {
    if (pool.length >= 15) break;
    if (!seen.has(k.id)) {
      pool.push(k);
      seen.add(k.id);
    }
  }
  const globalUsed = await DB.getGlobalLlm(dayKey).catch(() => 0);
  const remaining = Math.max(
    0,
    Math.min(1, c.maxLlmDay - pet.day.llmCalls, c.maxLlmGlobalDay - globalUsed),
  );
  const budget = makeBudget(remaining);
  const trace: BrainTrace = { used: [] };
  const brain = await makeBrain(trace, remaining <= 0);
  const env = getEnvironment(pet.env);
  const input: SpeakInput = {
    kind,
    self: C.selfView(pet, env?.name ?? pet.env, nowIso),
    message: text,
    history: chats.map((h) => ({ from: h.from, text: h.text })),
    beliefs: pool.map(C.beliefView),
    memories: memories.map((m) => ({ text: m.text, at: m.at, env: m.env })),
    recentDiary: diary.map(C.diaryView),
    pendingQuestion: pet.pendingQuestion,
    trustOwner: pet.trustOwner,
  };
  const out = await brain.speak(input, { budget, deadline: makeDeadline(25_000) });
  return { out, pool, budget, trace, brain, nowIso };
}

export async function chatWithPet(uid: string, rawText: string): Promise<ChatResponse> {
  const text = rawText.trim().slice(0, BOUNDS.chatMaxChars);
  if (!text) throw new MascotitaError("Dile algo primero.", 400);
  const c = cfg();
  const now = new Date();
  const dayKey = C.limaDayKey(now);
  const pet = await loadPetOrThrow(uid);
  const base = { day: { ...pet.day } };
  rollDay(pet, dayKey);
  if (pet.day.chats >= c.maxChatsDay) {
    throw new MascotitaError("Por hoy ya conversaron bastante. Mañana sigue.", 429);
  }
  if (pet.lastChatAt && now.getTime() - Date.parse(pet.lastChatAt) < CHAT_MIN_GAP_MS) {
    const retryAt = new Date(Date.parse(pet.lastChatAt) + CHAT_MIN_GAP_MS).toISOString();
    throw new MascotitaError("Espera un momentito, está pensando.", 429, retryAt);
  }

  const { out, pool, budget, trace, brain, nowIso } = await speak(pet, uid, "charla", text, dayKey);

  // Efectos: la compañía baja la soledad; recordar afianza un poco.
  C.applyChatMood(pet, out.moodShift); // ya incluye el alivio de la soledad
  const touched: ConceptDoc[] = [];
  for (const id of out.usedConcepts) {
    const doc = pool.find((k) => k.id === id);
    if (doc) {
      C.recallConcept(doc, nowIso);
      touched.push(doc);
    }
  }
  const learned: ConceptDoc[] = [];
  const candidateIds = out.learned.slice(0, 2).map((l) => C.slugify(l.label)).filter(Boolean);
  const existingOutsidePool = await DB.getConcepts(
    uid,
    candidateIds.filter((id) => !pool.some((k) => k.id === id)),
  ).catch(() => [] as ConceptDoc[]);
  for (const l of out.learned.slice(0, 2)) {
    const id = C.slugify(l.label);
    if (!id || pool.some((k) => k.id === id) || learned.some((k) => k.id === id)) continue;
    const prior = existingOutsidePool.find((k) => k.id === id);
    if (prior) {
      // Ya lo sabía (fuera del conjunto cargado): recordarlo refuerza, no lo pisa.
      C.recallConcept(prior, nowIso);
      touched.push(prior);
      continue;
    }
    learned.push(
      C.newConcept(
        { id, label: l.label, kind: l.kind, claim: l.claim, source: "dueño", evidence: l.evidence, conf0: CAL.conf0Chat },
        nowIso,
      ),
    );
  }
  const rolled = pet.day.key !== base.day.key;
  pet.stats.concepts += learned.length;
  pet.stats.chats += 1;
  pet.day.chats += 1;
  pet.day.llmCalls += budget.spent;
  pet.stats.llmCalls += budget.spent;
  pet.lastChatAt = nowIso;
  pet.lastSeenAt = nowIso;
  pet.pendingQuestion = out.question ?? null;
  pet.brainId = traceId(trace, brain.id);
  pet.updatedAt = nowIso;
  const moodWord = C.moodWordFor(pet, false);

  const docs: ChatDoc[] = [
    {
      id: `${nowIso}-a-${crypto.randomUUID().slice(0, 8)}`,
      at: nowIso,
      from: "dueño",
      text,
      kind: "charla",
      usedConcepts: [],
      learned: [],
      moodWord: null,
    },
    {
      id: `${nowIso}-b-${crypto.randomUUID().slice(0, 8)}`,
      at: new Date(now.getTime() + 1).toISOString(),
      from: "mascota",
      text: out.reply,
      kind: "charla",
      usedConcepts: out.usedConcepts,
      learned: learned.map((k) => k.id),
      moodWord,
    },
  ];

  // Los contadores van como incrementos atómicos: un tick en curso no los pisa
  // ni los pisa esta charla a él.
  await DB.savePet(uid, {
    mood: pet.mood,
    drives: pet.drives,
    lastChatAt: pet.lastChatAt,
    lastSeenAt: pet.lastSeenAt,
    pendingQuestion: pet.pendingQuestion,
    brainId: pet.brainId,
    updatedAt: pet.updatedAt,
    ...(rolled ? { day: { ...pet.day, chats: 0, llmCalls: 0 } } : {}),
  });
  await Promise.all([
    DB.bumpPetCounters(uid, {
      "day.chats": 1,
      "day.llmCalls": budget.spent,
      "stats.chats": 1,
      "stats.llmCalls": budget.spent,
      "stats.concepts": learned.length,
    }),
    DB.upsertConcepts(uid, [...touched, ...learned]),
    DB.addChats(uid, docs),
    budget.spent > 0 ? DB.bumpGlobalLlm(dayKey, budget.spent).catch(() => {}) : Promise.resolve(),
  ]);

  return {
    reply: out.reply,
    usedConcepts: out.usedConcepts,
    learned: learned.map(C.conceptView),
    moodWord,
    question: out.question,
    pet: C.toPetView(pet, nowIso),
  };
}

export async function teachPet(uid: string, rawText: string): Promise<TeachResponse> {
  const text = rawText.trim().slice(0, BOUNDS.teachMaxChars);
  if (!text) throw new MascotitaError("Escribe lo que quieres enseñarle.", 400);
  const c = cfg();
  const now = new Date();
  const dayKey = C.limaDayKey(now);
  const pet = await loadPetOrThrow(uid);
  const base = { day: { ...pet.day } };
  rollDay(pet, dayKey);
  if (pet.day.teachings >= c.maxTeachDay) {
    throw new MascotitaError("Por hoy ya le enseñaste bastante. Deja que lo compruebe explorando.", 429);
  }

  const { out, pool, budget, trace, brain, nowIso } = await speak(pet, uid, "ensenanza", text, dayKey);
  const ref = await refFromText(text);

  const learned: ConceptDoc[] = [];
  const createdIds = new Set<string>();
  let contradiction: TeachResponse["contradiction"] = null;
  const teachIds = out.learned.slice(0, 3).map((l) => C.slugify(l.label)).filter(Boolean);
  const outsidePool = await DB.getConcepts(
    uid,
    teachIds.filter((id) => !pool.some((k) => k.id === id)),
  ).catch(() => [] as ConceptDoc[]);
  for (const l of out.learned.slice(0, 3)) {
    const id = C.slugify(l.label);
    if (!id || learned.some((k) => k.id === id)) continue;
    const existing = pool.find((k) => k.id === id) ?? outsidePool.find((k) => k.id === id);
    if (existing) {
      // Ya conocía algo con ese nombre. Si lo comprobó en el entorno y el
      // dueño dice otra cosa, no lo pisa: lo dice ("Pero yo vi que…").
      const same =
        C.tokenize(existing.claim).join(" ") === C.tokenize(l.claim).join(" ");
      if (existing.verified && !same) {
        contradiction = contradiction ?? {
          conceptId: existing.id,
          label: existing.label,
          why: existing.claim,
        };
        continue;
      }
      existing.claim = l.claim.slice(0, 160);
      existing.taught = true;
      existing.toTest = true;
      existing.sources["dueño"] = (existing.sources["dueño"] ?? 0) + 1;
      existing.confidence = Math.max(existing.confidence, CAL.conf0Taught);
      existing.ref = existing.ref ?? ref;
      existing.evidence = existing.evidence ?? l.evidence;
      existing.lastSeenAt = nowIso;
      existing.lastChangeAt = nowIso;
      C.recomputeScore(existing);
      learned.push(existing);
      continue;
    }
    learned.push(
      C.newConcept(
        {
          id,
          label: l.label,
          kind: l.kind,
          claim: l.claim,
          source: "dueño",
          ref,
          evidence: l.evidence,
          taught: true,
          conf0: CAL.conf0Taught,
        },
        nowIso,
      ),
    );
    createdIds.add(id);
    pet.stats.concepts += 1;
    pet.stats.taughtConcepts += 1;
  }

  // Tope de enseñanzas: si se pasa, se olvida la más floja de las enseñadas.
  const deleted: string[] = [];
  if (pet.stats.taughtConcepts > CAPS.taughtConcepts) {
    const all = await DB.loadAllConcepts(uid);
    const merged = new Map(all.map((k) => [k.id, k] as const));
    for (const k of learned) merged.set(k.id, k);
    for (const id of C.pruneConcepts([...merged.values()])) {
      if (learned.some((k) => k.id === id)) continue;
      deleted.push(id);
    }
    pet.stats.taughtConcepts = Math.max(0, pet.stats.taughtConcepts - deleted.length);
    pet.stats.concepts = Math.max(0, pet.stats.concepts - deleted.length);
  }

  C.applyChatMood(pet, out.moodShift); // ya incluye el alivio de la soledad
  const rolled = pet.day.key !== base.day.key;
  const newTaught = learned.filter((k) => createdIds.has(k.id)).length;
  pet.stats.teachings += 1;
  pet.day.teachings += 1;
  pet.day.llmCalls += budget.spent;
  pet.stats.llmCalls += budget.spent;
  pet.lastChatAt = nowIso;
  pet.lastSeenAt = nowIso;
  pet.brainId = traceId(trace, brain.id);
  pet.updatedAt = nowIso;
  const moodWord = C.moodWordFor(pet, false);

  const env = getEnvironment(pet.env);
  const t = C.templateEntry("ensenanza", {
    pet,
    env: pet.env,
    envName: env?.name ?? pet.env,
    detail: text,
    slugs: learned.map((k) => k.id),
  });
  const entry: DiaryEntryDoc = {
    id: `${nowIso}-ensenanza`,
    at: nowIso,
    kind: "ensenanza",
    env: pet.env,
    title: t.title,
    text: t.text,
    moodWord,
    brainId: pet.brainId,
    seq: null,
    delta: {
      ...C.emptyDelta(),
      newConcepts: learned.filter((k) => createdIds.has(k.id)).map((k) => k.id).slice(0, 6),
      question: out.question,
    },
  };
  const docs: ChatDoc[] = [
    {
      id: `${nowIso}-a-${crypto.randomUUID().slice(0, 8)}`,
      at: nowIso,
      from: "dueño",
      text,
      kind: "ensenanza",
      usedConcepts: [],
      learned: [],
      moodWord: null,
    },
    {
      id: `${nowIso}-b-${crypto.randomUUID().slice(0, 8)}`,
      at: new Date(now.getTime() + 1).toISOString(),
      from: "mascota",
      text: out.reply,
      kind: "ensenanza",
      usedConcepts: out.usedConcepts,
      learned: learned.map((k) => k.id),
      moodWord,
    },
  ];

  await DB.savePet(uid, {
    mood: pet.mood,
    drives: pet.drives,
    lastChatAt: pet.lastChatAt,
    lastSeenAt: pet.lastSeenAt,
    brainId: pet.brainId,
    updatedAt: pet.updatedAt,
    ...(rolled ? { day: { ...pet.day, teachings: 0, llmCalls: 0 } } : {}),
  });
  await Promise.all([
    DB.bumpPetCounters(uid, {
      "day.teachings": 1,
      "day.llmCalls": budget.spent,
      "stats.teachings": 1,
      "stats.llmCalls": budget.spent,
      "stats.concepts": newTaught - deleted.length,
      "stats.taughtConcepts": newTaught - deleted.length,
    }),
    DB.upsertConcepts(uid, learned),
    deleted.length ? DB.deleteConcepts(uid, deleted) : Promise.resolve(),
    DB.addChats(uid, docs),
    DB.addDiary(uid, [entry]),
    budget.spent > 0 ? DB.bumpGlobalLlm(dayKey, budget.spent).catch(() => {}) : Promise.resolve(),
  ]);

  return {
    ack: out.reply,
    concepts: learned.map((k) => ({ ...C.conceptView(k), confidence: round3(k.confidence) })),
    contradiction,
    pet: C.toPetView(pet, nowIso),
  };
}
