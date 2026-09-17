// Un TICK es un pedazo de vida de la mascotita: despierta, elige un entorno,
// actúa unas pocas veces (ensayo y error de verdad: 404s, imports que no
// resuelven, hongos que caen mal), percibe lo que vio, reflexiona y se va a
// dormir dejando su diario. Todo lo que aprende queda en NÚMEROS (política,
// confianzas, rasgos); el cerebro solo pone palabras.
//
// Garantías:
//   · ≤ 2 llamadas LLM (percibir + reflexionar), ≤ 4 fetches, < 40 s.
//   · Idempotente: el tick N usa RNG sembrado con (uid, N) y sus documentos
//     tienen ids derivados de N — un reintento sobreescribe, no duplica.
//   · Si algo falla a mitad, lo numérico igual se guarda (finally) con un
//     diario de plantilla y el error anotado en ticks/{N}.
import { BOUNDS, CAL, cfg } from "./config";
import { clamp, clamp01, round3, seededRng } from "./rng";
import * as C from "./cognition";
import * as DB from "./db";
import {
  makeBrain,
  makeBudget,
  makeDeadline,
  traceId,
  type BeliefView,
  type Brain,
  type BrainTrace,
  type EpisodeView,
  type Observation,
  type PerceiveInput,
  type ReflectInput,
  type ReflectOutput,
  type TickNumbers,
} from "./brain";
import {
  DEFAULT_ENV,
  ENVIRONMENTS,
  REST_ACTION,
  getEnvironment,
  newEnvState,
  restOutcome,
  type Action,
  type EnvContext,
  type Environment,
  type Outcome,
} from "./envs";
import type {
  ConceptDoc,
  DiaryDelta,
  DiaryEntryDoc,
  EnvStateDoc,
  LifeStage,
  MemoryDoc,
  PetDoc,
  TickDoc,
  TickReason,
  TickResult,
  TickStep,
  Traits,
} from "./types";

const ORDER_ACTIONS = new Set(["releer", "seguir", "probar", "revisar"]);
const DAY_MS = 86_400_000;

function seq6(seq: number): string {
  return String(seq).padStart(6, "0");
}

function daysSinceDayKey(key: string, now: Date): number {
  // La clave es un día de Lima (UTC−5): su medianoche es 05:00Z.
  const t = Date.parse(`${key}T05:00:00Z`);
  if (!Number.isFinite(t)) return 0;
  return clamp((now.getTime() - t) / DAY_MS, 0, 30);
}

/**
 * Novedad de un paso: la percibida si hubo percepción; si no, la estimada
 * solo cuando el paso salió bien y trajo algo que ver — un fetch fallido no
 * cuenta como "novedad" (o un entorno muerto la mantendría curiosa y sin
 * aburrirse jamás).
 */
function stepNovelty(si: StepInfo): number {
  if (si.perceived) return si.perceived.novelty;
  return si.outcome.success && si.outcome.observation ? si.noveltyPrior : 0;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** Recorte para el dataset del cerebro propio: nunca guardamos megas. */
function ioLog(v: unknown): string {
  return JSON.stringify(v).slice(0, BOUNDS.ioLogChars);
}

interface StepInfo {
  action: Action;
  outcome: Outcome;
  obsId: number | null;
  /** novedad estimada por el entorno antes de actuar */
  noveltyPrior: number;
  ref: string | null;
  perceived: { novelty: number; ids: string[]; summary: string } | null;
  rTotal: number;
}

function emptyResult(
  skipped: TickResult["skipped"],
  retryAt: string | null,
  ms: number,
): TickResult {
  return {
    skipped,
    seq: null,
    entry: null,
    extraEntries: [],
    steps: [],
    llmCalls: 0,
    ms,
    brainId: "",
    pet: null,
    retryAt,
  };
}

export async function runTick(
  uid: string,
  reason: TickReason,
  opts: { deadlineMs?: number } = {},
): Promise<TickResult> {
  const now = new Date();
  const nowIso = now.toISOString();
  const deadline = makeDeadline(opts.deadlineMs ?? BOUNDS.tickMs);
  const c = cfg();

  const lease = await DB.acquireLease(uid, reason, now);
  if (!lease.ok) return emptyResult(lease.skipped, lease.retryAt, deadline.elapsed());
  const { pet, seq, firstTickOfDay } = lease;
  const base: PetDoc = JSON.parse(JSON.stringify(pet));
  const rng = seededRng(uid, seq);
  const dayKey = C.limaDayKey(now);
  const ticksBefore = pet.stats.ticks;

  // Cupo de LLM: por tick, por mascota/día y global/día. Sin cupo, la mascota
  // vive igual con el cerebro simple (más tonta ese día, pero viva).
  const globalUsed = await DB.getGlobalLlm(dayKey).catch(() => 0);
  const llmRemaining = Math.max(
    0,
    Math.min(
      BOUNDS.llmCallsPerTick,
      c.maxLlmDay - pet.day.llmCalls,
      c.maxLlmGlobalDay - globalUsed,
    ),
  );
  const budget = makeBudget(llmRemaining);
  const trace: BrainTrace = { used: [] };
  let brain: Brain;
  try {
    brain = await makeBrain(trace, llmRemaining <= 0);
  } catch {
    // Si el cerebro principal ni siquiera carga, el simple siempre está.
    const { SimpleBrain } = await import("./brain/simple");
    brain = new SimpleBrain();
    trace.used.push("simple");
  }
  let persisted = false;

  // Estado de trabajo: se acumula aquí y se persiste en el finally.
  const touched = new Map<string, ConceptDoc>();
  const newMemories: MemoryDoc[] = [];
  const updatedMemories: MemoryDoc[] = [];
  const deletedMemories: string[] = [];
  const deletedConcepts: string[] = [];
  const extraEntries: DiaryEntryDoc[] = [];
  const steps: TickStep[] = [];
  const stepInfo: StepInfo[] = [];
  const io: TickDoc["io"] = { perceive: null, reflect: null };
  let entry: DiaryEntryDoc | null = null;
  let error: string | null = null;
  let envId = pet.env;
  let envState: EnvStateDoc | null = null;
  let fetchesUsed = 0;
  const delta: DiaryDelta = C.emptyDelta();

  const pushExtra = (
    kind: "nacimiento" | "entorno" | "etapa" | "olvido" | "cambio",
    env: Environment,
    detail?: string,
    slugs?: string[],
  ) => {
    const t = C.templateEntry(kind, { pet, env: env.id, envName: env.name, detail, slugs });
    extraEntries.push({
      id: `${seq6(seq)}-${kind}`,
      at: new Date(now.getTime() - 1 + extraEntries.length).toISOString(),
      kind,
      env: env.id,
      title: t.title,
      text: t.text,
      moodWord: pet.mood.word,
      brainId: "simple",
      seq,
      delta: C.emptyDelta(),
    });
  };

  try {
    pet.stats.ticks = ticksBefore + 1;
    // --- 1. conjunto de trabajo y paso del tiempo ---
    const ws = await DB.loadWorkingSet(uid, pet.env);
    // Un mismo concepto puede venir por las dos consultas (top por score y
    // toTest): una sola instancia, o se verificaría dos veces en un tick.
    {
      const canon = new Map(ws.concepts.map((k) => [k.id, k] as const));
      ws.toTest = ws.toTest.map((k) => canon.get(k.id) ?? k);
    }
    const hours = pet.lastTickAt
      ? clamp((now.getTime() - Date.parse(pet.lastTickAt)) / 3_600_000, 0, 24 * 30)
      : 0;
    C.applyTime(pet, hours);
    const hoursSinceOwner = clamp(
      (now.getTime() - Date.parse(pet.lastSeenAt)) / 3_600_000,
      0,
      24 * 365,
    );

    // Entorno: el actual, salvo que el aburrimiento la mueva sola.
    let env = getEnvironment(envId);
    if (!env) {
      envId = DEFAULT_ENV;
      pet.env = envId;
      env = ENVIRONMENTS[DEFAULT_ENV];
    }
    const switched = C.maybeSwitchEnv(pet, rng);
    if (switched && getEnvironment(switched)) {
      const prevName = C.envNameInSentence(env.name);
      envId = switched;
      env = getEnvironment(switched)!;
      pet.env = envId;
      pushExtra("entorno", env, prevName);
    }
    envState =
      ws.envState && ws.envState.envId === envId
        ? ws.envState
        : (await DB.getEnvState(uid, envId)) ?? newEnvState(env, nowIso);
    envState.visits += 1;
    envState.updatedAt = nowIso;
    pet.envVisits[envId] = (pet.envVisits[envId] ?? 0) + 1;
    if (envState.cursor.kind === "imaginado") envState.cursor.clock += 1;

    const ctx: EnvContext = {
      pet,
      envState,
      concepts: ws.concepts,
      toTest: ws.toTest,
      rng,
      fetchBudget: { remaining: BOUNDS.fetchesPerTick },
      deadline,
      now: nowIso,
      competence: (t) => C.competence(pet, t),
    };

    // --- 2. episodio: K acciones con recompensa del entorno ---
    const K = C.stepsFor(pet.stage);
    const observations: Observation[] = [];
    const failedKeys = new Set<string>();
    const retryResults: number[] = [];
    let successesAfterFail = 0;
    let hadFail = false;

    // El episodio se corta en proporción al plazo (el cron da plazos cortos) y
    // nunca empieza un paso sin tiempo para su fetch + la percepción.
    const episodeMs = Math.min(BOUNDS.episodeMs, deadline.totalMs * 0.45);
    for (let i = 0; i < K; i++) {
      if (deadline.elapsed() > episodeMs || deadline.remaining() < 14_000) break;
      let cands: Action[] = [];
      try {
        cands = (await env.affordances(ctx)).slice(0, 8);
      } catch {
        cands = [];
      }
      cands.push(REST_ACTION);
      const novelty = cands.map((a) =>
        a.type === REST_ACTION.type ? 0 : clamp01(env!.noveltyOf(a, ctx)),
      );
      const { index } = C.selectAction(cands, novelty, pet, envId, rng);
      const a = cands[Math.max(0, Math.min(cands.length - 1, index))];
      const t0 = Date.now();
      const fetchesBefore = ctx.fetchBudget.remaining;
      let out: Outcome;
      if (a.type === REST_ACTION.type) {
        out = restOutcome(pet);
      } else {
        try {
          out = await env.act(a, ctx);
        } catch {
          out = { success: false, reward: -0.3, tags: ["error"] };
        }
      }
      fetchesUsed += Math.max(0, fetchesBefore - ctx.fetchBudget.remaining);
      out.reward = clamp(out.reward, -1, 1);

      // Efectos numéricos inmediatos (energía, competencia, predicción, verificación).
      C.applyStepEnergy(pet, a, out.success, novelty[index]);
      C.applyEffects(pet, out.effects);
      C.updateSkill(pet, a.type, out.success);
      if (out.prediction?.counted) {
        pet.stats.predictions += 1;
        delta.predictions.made += 1;
        if (out.prediction.predicted === out.prediction.actual) {
          pet.stats.predictionsOk += 1;
          delta.predictions.ok += 1;
        }
      }
      if (out.verification) {
        const doc =
          touched.get(out.verification.conceptId) ??
          ws.concepts.find((k) => k.id === out.verification!.conceptId) ??
          ws.toTest.find((k) => k.id === out.verification!.conceptId);
        if (doc) {
          const d = C.applyVerification(doc, out.verification.result, nowIso);
          if (d > 0) delta.reinforced += 1;
          else if (d < 0) delta.weakened += 1;
          if (doc.taught) {
            pet.trustOwner = clamp01(
              pet.trustOwner +
                (out.verification.result === "confirma" ? CAL.trustGain : -CAL.trustLoss),
            );
          }
          doc.toTest = false;
          pet.stats.verifications += 1;
          if (out.verification.result === "confirma") pet.stats.verificationsOk += 1;
          touched.set(doc.id, doc);
        }
      }

      // Reintentos: ¿volvió a intentar algo que ya le había fallado?
      const key = `${a.type}|${a.target}`;
      if (failedKeys.has(key)) retryResults.push(out.success ? 1 : -1);
      if (!out.success) {
        failedKeys.add(key);
        hadFail = true;
      } else if (hadFail) {
        successesAfterFail += 1;
      }

      let obsId: number | null = null;
      if (out.observation && observations.length < BOUNDS.observationsPerTick) {
        obsId = observations.length + 1;
        observations.push({
          id: obsId,
          env: envId,
          action: a.type,
          target: a.target,
          text: out.observation.text.slice(0, BOUNDS.observationChars),
          hints: out.observation.hints.slice(0, BOUNDS.hintsPerObservation),
        });
      }
      stepInfo.push({
        action: a,
        outcome: out,
        obsId,
        noveltyPrior: novelty[index],
        ref: out.observation?.ref ?? null,
        perceived: null,
        rTotal: 0,
      });
      steps.push({
        action: a.type,
        target: a.target,
        label: a.label,
        reward: round3(out.reward),
        rTotal: 0,
        success: out.success,
        novelty: round3(novelty[index]),
        ms: Date.now() - t0,
        tags: out.tags.slice(0, 6),
      });
    }

    // --- 3. percepción: texto → conceptos (1 llamada LLM como máximo) ---
    const byId = new Map<string, ConceptDoc>();
    for (const k of ws.concepts) byId.set(k.id, k);
    for (const k of ws.toTest) byId.set(k.id, k);
    const reinforcedThisTick = new Set<string>();
    const newSlugs: string[] = [];

    if (observations.length > 0) {
      const input: PerceiveInput = {
        observations,
        knownLabels: ws.concepts
          .slice(0, BOUNDS.knownLabelsForPerceive)
          .map((k) => k.label),
        envKind: env.kind,
      };
      let out: Awaited<ReturnType<Brain["perceive"]>>;
      try {
        out = await brain.perceive(input, { budget, deadline });
      } catch {
        out = { percepts: [] }; // sin percepción hoy; la experiencia numérica igual cuenta
        trace.used.push("simple");
      }
      io.perceive = { input: ioLog(input), output: ioLog(out) };
      const conf0 = env.kind === "real" ? CAL.conf0Repo : CAL.conf0Imagined;

      // Lo que ya sabía pero no estaba en el conjunto de trabajo (top por
      // score) se carga antes de decidir "nuevo" vs "reforzar": si no, el
      // cerebro pisaría conceptos enseñados o comprobados eligiendo etiquetas.
      const unknownIds = Array.from(
        new Set(
          out.percepts
            .flatMap((p) => p.concepts.map((pc) => C.slugify(pc.label)))
            .filter((id) => id && !touched.has(id) && !byId.has(id)),
        ),
      );
      if (unknownIds.length > 0) {
        const prior = await DB.getConcepts(uid, unknownIds).catch(() => [] as ConceptDoc[]);
        for (const k of prior) byId.set(k.id, k);
      }

      for (const p of out.percepts) {
        const si = stepInfo.find((s) => s.obsId === p.id);
        if (!si) continue;
        let newN = 0;
        let knownN = 0;
        const ids: string[] = [];
        for (const pc of p.concepts) {
          const id = C.slugify(pc.label);
          if (!id) continue;
          let doc = touched.get(id) ?? byId.get(id);
          if (doc) {
            const d = C.reinforceConcept(doc, envId, nowIso, reinforcedThisTick.has(id));
            reinforcedThisTick.add(id);
            knownN += 1;
            if (d > 0) delta.reinforced += 1;
            // La evidencia solo vale si es del mismo archivo/objeto que `ref`.
            if (pc.evidence && !doc.evidence && si.ref && (!doc.ref || doc.ref === si.ref)) {
              doc.ref = si.ref;
              doc.evidence = pc.evidence;
            }
          } else {
            doc = C.newConcept(
              {
                id,
                label: pc.label,
                kind: pc.kind,
                claim: pc.claim,
                source: envId,
                ref: si.ref,
                evidence: pc.evidence,
                conf0,
              },
              nowIso,
            );
            byId.set(id, doc);
            newN += 1;
            newSlugs.push(id);
            pet.stats.concepts += 1;
          }
          touched.set(id, doc);
          ids.push(id);
          for (const rel of pc.relatedTo) {
            const rid = C.slugify(rel);
            if (rid && rid !== id) C.addEdge(doc, rid, "relacionado");
          }
        }
        // Lo que se vio junto queda enlazado (co-ocurrencia).
        for (let x = 0; x < ids.length; x++) {
          for (let y = x + 1; y < ids.length; y++) {
            const dx = touched.get(ids[x]);
            const dy = touched.get(ids[y]);
            if (dx && dy) {
              C.addEdge(dx, ids[y], "junto-a");
              C.addEdge(dy, ids[x], "junto-a");
            }
          }
        }
        const noveltyPerceived =
          newN + knownN > 0 ? newN / (newN + knownN) : si.noveltyPrior;
        si.perceived = { novelty: noveltyPerceived, ids, summary: p.summary };
      }
    }

    // Recompensa total (extrínseca + curiosidad) y UNA actualización de la
    // política por paso; memorias de lo que valió la pena recordar.
    const qChanges: TickNumbers["qChanges"] = [];
    stepInfo.forEach((si, i) => {
      const nov = stepNovelty(si);
      const rTotal = clamp(si.outcome.reward + C.intrinsicReward(nov, pet), -1, 1);
      si.rTotal = rTotal;
      steps[i].rTotal = round3(rTotal);
      const { before, after } = C.updatePolicy(pet, envId, si.action.type, rTotal);
      qChanges.push({ env: envId, action: si.action.type, before: round3(before), after: round3(after) });
      C.applyStepMood(pet, rTotal, nov);
      pet.stats.steps += 1;
      if (si.perceived || Math.abs(si.outcome.reward) >= 0.3) {
        newMemories.push(
          C.newMemory({
            id: `${seq6(seq)}-${i}`,
            at: nowIso,
            env: envId,
            action: si.action.type,
            target: si.action.target,
            reward: rTotal,
            success: si.outcome.success,
            novelty: nov,
            concepts: si.perceived?.ids.slice(0, 8) ?? [],
            text: si.perceived?.summary ?? si.action.label,
            ownerInvolved: si.action.meta?.taught === true,
          }),
        );
      }
    });

    // --- 4. consolidación, barrido diario, deriva de rasgos, xp ---
    const habitMap = new Map<string, ConceptDoc>();
    for (const k of ws.concepts) if (k.kind === "habito") habitMap.set(k.id, k);
    for (const k of touched.values()) if (k.kind === "habito") habitMap.set(k.id, k);
    const cons = C.consolidate([...ws.memories, ...newMemories], habitMap, nowIso);
    // Un hábito puede existir fuera del conjunto de trabajo: se refuerza, no se pisa.
    const unknownHabits = cons.changed.filter((k) => !byId.has(k.id) && !touched.has(k.id));
    const existingHabits = unknownHabits.length
      ? await DB.getConcepts(uid, unknownHabits.map((k) => k.id)).catch(() => [] as ConceptDoc[])
      : [];
    for (const k of cons.changed) {
      const prior = existingHabits.find((e) => e.id === k.id);
      if (prior) {
        prior.confidence = clamp01(prior.confidence + 0.15 * (1 - prior.confidence));
        prior.hits += 1;
        prior.lastSeenAt = nowIso;
        C.recomputeScore(prior);
        byId.set(prior.id, prior);
        touched.set(prior.id, prior);
        continue;
      }
      if (!byId.has(k.id) && !touched.has(k.id)) {
        newSlugs.push(k.id);
        pet.stats.concepts += 1;
      }
      byId.set(k.id, k);
      touched.set(k.id, k);
    }
    for (const m of cons.memories) {
      if (!newMemories.some((n) => n.id === m.id)) updatedMemories.push(m);
    }

    const forgotten: string[] = [];
    let sweepData: [ConceptDoc[], MemoryDoc[]] | null = null;
    if (pet.day.sweptKey !== dayKey) {
      try {
        sweepData = await Promise.all([DB.loadAllConcepts(uid), DB.loadAllMemories(uid)]);
      } catch {
        sweepData = null; // sin lectura completa no hay barrido hoy; sweptKey no avanza
      }
    }
    if (sweepData) {
      const days = daysSinceDayKey(pet.day.sweptKey, now);
      const [all, allMem] = sweepData;
      const merged = new Map<string, ConceptDoc>();
      for (const k of all) merged.set(k.id, k);
      for (const k of touched.values()) merged.set(k.id, k);
      for (const k of merged.values()) {
        const before = k.confidence;
        const r = C.sweepConcept(k, days, nowIso);
        if (r.prune) {
          deletedConcepts.push(k.id);
          forgotten.push(k.id);
          touched.delete(k.id);
          merged.delete(k.id);
        } else if (k.confidence !== before || touched.has(k.id)) {
          touched.set(k.id, k);
        }
      }
      for (const id of C.pruneConcepts([...merged.values()])) {
        if (!deletedConcepts.includes(id)) {
          deletedConcepts.push(id);
          forgotten.push(id);
        }
        touched.delete(id);
        merged.delete(id);
      }
      pet.stats.forgotten += forgotten.length;
      pet.stats.concepts = merged.size;
      pet.stats.taughtConcepts = [...merged.values()].filter((k) => k.taught).length;
      const memById = new Map<string, MemoryDoc>();
      for (const m of allMem) memById.set(m.id, m);
      for (const m of updatedMemories) memById.set(m.id, m);
      for (const m of memById.values()) {
        if (C.sweepMemory(m, days, pet.stage)) deletedMemories.push(m.id);
        else if (!updatedMemories.some((u) => u.id === m.id)) updatedMemories.push(m);
      }
      for (const id of deletedMemories) {
        const i = updatedMemories.findIndex((u) => u.id === id);
        if (i >= 0) updatedMemories.splice(i, 1);
      }
      pet.day.sweptKey = dayKey;
      if (forgotten.length > 0) pushExtra("olvido", env, undefined, forgotten.slice(0, 4));
    }

    const noveltyMean = mean(stepInfo.map(stepNovelty));
    const failFrac = stepInfo.length
      ? stepInfo.filter((s) => !s.outcome.success).length / stepInfo.length
      : 0;
    const ludic = stepInfo.filter((s) => s.action.ludic);
    const orderSteps = stepInfo.filter((s) => ORDER_ACTIONS.has(s.action.type) && s.rTotal > 0);
    const retryOutcome: -1 | 0 | 1 =
      retryResults.length === 0
        ? 0
        : retryResults.every((r) => r > 0)
          ? 1
          : retryResults.every((r) => r < 0)
            ? -1
            : 0;
    const traitShift = C.driftTraits(pet, {
      noveltyMean,
      failFrac,
      hadBigFail: stepInfo.some((s) => s.outcome.reward <= -0.5),
      retryOutcome,
      chattedSinceLastTick:
        !!pet.lastChatAt && (!pet.lastTickAt || pet.lastChatAt > pet.lastTickAt),
      daysSinceOwner: hoursSinceOwner / 24,
      ludicMeanReward: ludic.length ? mean(ludic.map((s) => s.rTotal)) : null,
      orderFrac: env.kind === "real" && stepInfo.length ? orderSteps.length / stepInfo.length : null,
      ticksToday: Math.max(1, pet.day.ticks),
      firstTickOfDay: firstTickOfDay && !pet.day.absenceApplied,
    });
    if (firstTickOfDay) pet.day.absenceApplied = true;
    // Se guarda el cambio crudo (redondeado): el informe suma varios ticks y
    // decide qué se nota; filtrar aquí escondería la deriva lenta de una adulta.
    delta.traitShift = Object.fromEntries(
      Object.entries(traitShift)
        .filter(([, v]) => typeof v === "number" && Math.abs(v) >= 0.001)
        .map(([k, v]) => [k, round3(v as number)]),
    ) as Partial<Traits>;

    const xpGain =
      stepInfo.reduce((a, s) => a + Math.abs(s.rTotal), 0) + 0.5 * Math.min(newSlugs.length, 4) + 1;
    const stageChanged: LifeStage | null = C.addXp(pet, xpGain);
    if (stageChanged) pushExtra("etapa", env, stageChanged);
    pet.recentNovelty = [...pet.recentNovelty, round3(noveltyMean)].slice(-3);
    C.computeHabits(pet);

    // --- 5. reflexión: veredictos, reglas y diario en su voz (≤ 1 llamada) ---
    const comeback = successesAfterFail >= 2;
    const moodWordCalc = C.moodWordFor(pet, comeback);
    const beliefsPool = new Map<string, ConceptDoc>();
    for (const k of touched.values()) beliefsPool.set(k.id, k);
    for (const k of ws.concepts) if (!beliefsPool.has(k.id)) beliefsPool.set(k.id, k);
    const maxBeliefs =
      pet.stage === "sabia" ? BOUNDS.beliefsForReflectSabia : BOUNDS.beliefsForReflect;
    const beliefs: BeliefView[] = [...beliefsPool.values()]
      .filter((k) => !deletedConcepts.includes(k.id))
      .sort((a, b) => (touched.has(b.id) ? 1 : 0) - (touched.has(a.id) ? 1 : 0) || b.score - a.score)
      .slice(0, maxBeliefs)
      .map(C.beliefView);
    const teachingsToTest = ws.toTest
      .filter((k) => k.toTest && !deletedConcepts.includes(k.id))
      .map(C.beliefView);
    const episodes: EpisodeView[] = stepInfo.map((s) => ({
      action: s.action.type,
      target: s.action.target,
      label: s.action.label,
      success: s.outcome.success,
      reward: round3(s.rTotal),
      summary: s.perceived?.summary ?? "",
      concepts: s.perceived?.ids ?? [],
      tags: s.outcome.tags.slice(0, 6),
    }));
    const numbers: TickNumbers = {
      newConcepts: newSlugs.length,
      reinforced: delta.reinforced,
      weakened: delta.weakened,
      forgotten: forgotten.slice(0, 4),
      qChanges: qChanges
        .slice()
        .sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before))
        .slice(0, 3),
      traitShift,
      predictions: { ...delta.predictions },
      verifications: stepInfo
        .filter((s) => s.outcome.verification)
        .map((s) => ({
          id: s.outcome.verification!.conceptId,
          result: s.outcome.verification!.result,
        })),
      envSwitched: switched,
      stageChanged,
      hoursSinceOwner: Math.round(hoursSinceOwner),
    };
    const reflectInput: ReflectInput = {
      self: C.selfView(pet, env.name, nowIso),
      episodes,
      beliefs,
      teachingsToTest,
      numbers,
    };
    let reflect: ReflectOutput;
    try {
      if (deadline.remaining() > BOUNDS.reflectMinRemainingMs) {
        reflect = await brain.reflect(reflectInput, { budget, deadline });
      } else {
        // Sin tiempo para el LLM: la voz simple escribe el diario igual.
        const { SimpleBrain } = await import("./brain/simple");
        reflect = await new SimpleBrain().reflect(reflectInput, { budget: makeBudget(0), deadline });
        trace.used.push("simple");
      }
    } catch {
      reflect = {
        verdicts: [],
        newRules: [],
        diaryTitle: "",
        diaryText: "",
        questionForOwner: null,
        moodWord: null,
      };
    }
    io.reflect = { input: ioLog(reflectInput), output: ioLog(reflect) };

    for (const v of reflect.verdicts) {
      const doc = touched.get(v.id) ?? byId.get(v.id);
      if (!doc || deletedConcepts.includes(doc.id)) continue;
      const d = C.applyVerdict(doc, v.verdict, nowIso);
      if (d > 0) delta.reinforced += 1;
      else if (d < 0) delta.weakened += 1;
      if (doc.toTest && v.verdict !== "duda") doc.toTest = false;
      touched.set(doc.id, doc);
    }
    const ruleIds = reflect.newRules
      .map((r) => C.slugify(r.label))
      .filter((id) => id && !touched.has(id) && !byId.has(id));
    if (ruleIds.length > 0) {
      const prior = await DB.getConcepts(uid, ruleIds).catch(() => [] as ConceptDoc[]);
      for (const k of prior) byId.set(k.id, k);
    }
    for (const rule of reflect.newRules) {
      const id = C.slugify(rule.label);
      if (!id || touched.has(id) || byId.has(id)) continue;
      const doc = C.newConcept(
        { id, label: rule.label, kind: "regla", claim: rule.claim, source: envId, conf0: CAL.conf0Rule },
        nowIso,
      );
      for (const b of rule.basedOn) C.addEdge(doc, b, "se-basa-en");
      touched.set(id, doc);
      byId.set(id, doc);
      newSlugs.push(id);
      pet.stats.concepts += 1;
    }
    if (reflect.questionForOwner) pet.pendingQuestion = reflect.questionForOwner;
    pet.mood.word = reflect.moodWord ?? moodWordCalc;

    delta.newConcepts = newSlugs.slice(0, 6);
    delta.forgotten = forgotten.slice(0, 4);
    delta.reward = round3(mean(stepInfo.map((s) => s.rTotal)));
    delta.question = pet.pendingQuestion;

    const brainId = traceId(trace, brain.id);
    if (ticksBefore === 0 && !extraEntries.some((e) => e.kind === "nacimiento")) {
      pushExtra("nacimiento", env);
    }
    entry = {
      id: `${seq6(seq)}-tick`,
      at: nowIso,
      kind: "tick",
      env: envId,
      title: reflect.diaryTitle || `Un rato en ${env.name}`,
      text: reflect.diaryText || C.templateEntry("cambio", { pet, env: envId, envName: env.name }).text,
      moodWord: pet.mood.word,
      brainId,
      seq,
      delta,
    };
    pet.brainId = brainId;
  } catch (err) {
    error = err instanceof Error ? `${err.name}: ${err.message}`.slice(0, 300) : "error";
  } finally {
    // Pase lo que pase, lo vivido se guarda: números primero, palabras después.
    const env = getEnvironment(envId) ?? ENVIRONMENTS[DEFAULT_ENV];
    if (ticksBefore === 0 && !extraEntries.some((e) => e.kind === "nacimiento")) {
      pushExtra("nacimiento", env);
    }
    if (!entry) {
      const t = C.templateEntry("cambio", {
        pet,
        env: envId,
        envName: env.name,
        detail: "Hoy algo se me cruzó y no pude ordenar mis ideas.",
      });
      entry = {
        id: `${seq6(seq)}-tick`,
        at: nowIso,
        kind: "tick",
        env: envId,
        title: t.title,
        text: t.text,
        moodWord: pet.mood.word,
        brainId: traceId(trace, brain.id),
        seq,
        delta,
      };
      pet.brainId = entry.brainId;
    }
    pet.stats.ticks = ticksBefore + 1;
    // "Explorar ahora": el dueño está mirando; lo de este tick no va al informe.
    if (reason === "manual") pet.lastSeenAt = nowIso;
    pet.stats.llmCalls += budget.spent;
    pet.day.llmCalls += budget.spent;
    pet.lastTickAt = nowIso;
    pet.updatedAt = nowIso;
    if (pet.stage === "huevo") C.addXp(pet, 0);
    C.snapshotTraits(pet, dayKey);
    for (const k of touched.values()) C.recomputeScore(k);
    const tick: TickDoc = {
      id: seq6(seq),
      seq,
      at: nowIso,
      reason,
      env: envId,
      steps,
      llmCalls: budget.spent,
      fetches: fetchesUsed,
      ms: deadline.elapsed(),
      brainId: pet.brainId,
      error,
      io,
    };
    const write: DB.TickWrite = {
      pet,
      base,
      concepts: [...touched.values()],
      deletedConcepts,
      memories: [...newMemories, ...updatedMemories],
      deletedMemories,
      diary: [...extraEntries, entry],
      envStates: envState ? [envState] : [],
      tick,
    };
    try {
      await DB.persistTick(uid, write);
      persisted = true;
    } catch (err) {
      console.error("[mascotita] no se pudo guardar el tick", seq, err instanceof Error ? err.message : err);
      await DB.releaseLease(uid, seq).catch(() => {});
    }
    if (budget.spent > 0) await DB.bumpGlobalLlm(dayKey, budget.spent).catch(() => {});
    if (seq % 10 === 0) await DB.pruneTicks(uid).catch(() => {});
  }

  if (!persisted) return emptyResult("error", null, deadline.elapsed());

  return {
    skipped: null,
    seq,
    entry: C.diaryView(entry),
    extraEntries: extraEntries.map(C.diaryView),
    steps: steps.map((s) => ({
      action: s.action,
      target: s.target,
      label: s.label,
      reward: s.reward,
      success: s.success,
      novelty: s.novelty,
      tags: s.tags,
    })),
    llmCalls: budget.spent,
    ms: deadline.elapsed(),
    brainId: pet.brainId,
    pet: C.toPetView(pet, nowIso),
    retryAt: null,
  };
}

/** Palabras de rasgos para el prompt — reexport cómodo para service/chat. */
export function traitsSummary(t: Traits): string {
  return C.traitsWords(t).join(", ");
}
