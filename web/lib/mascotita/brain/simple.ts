// Cerebro simple: CERO llamadas a ninguna IA y 100 % determinista. Con él la
// mascota vive aunque no haya GEMINI_API_KEY, se acabe el cupo del día o el
// LLM falle a mitad de un tick (withFallback cae aquí). Percibe con regex y
// pistas, juzga contando episodios, escribe el diario con plantillas por
// etapa y ánimo, y charla buscando solapamiento de palabras con lo que sabe.
// La variedad sale de hashString sobre las entradas, nunca de Math.random,
// así un reintento del mismo tick produce exactamente el mismo texto.
import type { ConceptKind, LifeStage, MoodWord } from "../types";
import { hashString, round3 } from "../rng";
import type {
  BeliefView,
  Brain,
  BrainOpts,
  Observation,
  PerceiveInput,
  PerceiveOutput,
  ReflectInput,
  ReflectOutput,
  SpeakInput,
  SpeakOutput,
} from "./index";
import { normalizeForMatch, sanitizePerceive, sanitizeReflect, sanitizeSpeak } from "./sanitize";

// --- utilidades ---

/** Elige un elemento de forma determinista a partir de una semilla textual. */
function pickBy<T>(seed: string, arr: readonly T[]): T {
  return arr[hashString(seed) % arr.length];
}

const STOPWORDS = new Set([
  // español
  "que", "por", "para", "con", "sin", "una", "uno", "unos", "unas", "los", "las", "del", "sus",
  "como", "pero", "más", "mas", "muy", "hay", "eso", "esa", "ese", "esto", "esta", "este", "aqui", "aquí",
  "ahi", "ahí", "tambien", "también", "porque", "cuando", "donde", "dónde", "quien", "quién", "cual", "cuál",
  "ser", "son", "era", "fue", "estan", "tiene", "tienes", "tengo", "hace", "haces",
  "sabes", "sabe", "dime", "sobre", "entre", "desde", "hasta", "algo", "nada", "todo", "toda", "todos",
  "verdad", "cierto", "puede", "puedes", "quiero", "quieres", "mira", "ver", "vez", "veces", "hola",
  // inglés
  "the", "and", "for", "with", "from", "this", "that", "are", "was", "you", "your", "what", "how", "not",
]);

/** Minúsculas sin acentos, palabras ≥ 3 letras, sin stopwords cortas ES/EN. */
function tokenize(s: string): string[] {
  return normalizeForMatch(s)
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/** "hongo-rojo" → "hongo rojo" (los ids de creencias son slugs). */
function humanize(slug: string): string {
  return slug.replace(/[-_]+/g, " ").trim();
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

// --- perceive ---

const EXPORT_RE = /export (?:async )?(?:function|const|class|interface|type|enum) (\w+)/g;
const IMPORT_RE = /from ["'](.+?)["']/g;
const HEADING_RE = /^#{1,3} (.+)$/gm;

function looksLikePath(s: string): boolean {
  return s.includes("/") || /\.[a-z]{1,5}$/i.test(s);
}

/** Primera frase del texto que menciona `token` (≤ 120 caracteres), o null. */
function sentenceWith(text: string, token: string): string | null {
  const needle = normalizeForMatch(token);
  for (const raw of text.split(/[.!?]+\s+|\n+/)) {
    const s = raw.replace(/\s+/g, " ").trim();
    if (s && normalizeForMatch(s).includes(needle)) return s.slice(0, 120).trim();
  }
  return null;
}

function perceiveOne(o: Observation, envKind: PerceiveInput["envKind"]) {
  const text = typeof o.text === "string" ? o.text : "";
  const norm = normalizeForMatch(text);
  const hints = Array.isArray(o.hints) ? o.hints.filter((h): h is string => typeof h === "string") : [];
  const isPlace = envKind === "imaginado" && (o.action === "observar" || o.action === "explorar");

  // Candidatos: pistas + regex; se cuenta cuántas veces aparece cada uno.
  const cand = new Map<string, { label: string; count: number; kind: ConceptKind; order: number }>();
  const add = (label: string, kind: ConceptKind, bonus = 0) => {
    const clean = label.replace(/\s+/g, " ").trim().slice(0, 60);
    const key = normalizeForMatch(clean);
    if (key.length < 2) return;
    const prev = cand.get(key);
    if (prev) {
      prev.count += 1 + bonus;
      return;
    }
    const occurrences = key ? norm.split(key).length - 1 : 0;
    cand.set(key, { label: clean, kind, count: occurrences + 1 + bonus, order: cand.size });
  };

  const actionNorm = normalizeForMatch(typeof o.action === "string" ? o.action : "");
  for (const h of hints) {
    // La etiqueta del verbo ("jugar con") no es una cosa del mundo.
    if (envKind === "imaginado" && actionNorm && normalizeForMatch(h).startsWith(actionNorm)) continue;
    const k: ConceptKind =
      envKind === "imaginado"
        ? isPlace && normalizeForMatch(h) === normalizeForMatch(humanize(o.target))
          ? "lugar"
          : "cosa"
        : looksLikePath(h)
          ? "archivo"
          : "idea";
    add(h, k, 1);
  }
  if (isPlace && o.target) add(humanize(o.target), "lugar", 1);
  for (const m of text.matchAll(EXPORT_RE)) add(m[1], "idea");
  for (const m of text.matchAll(IMPORT_RE)) add(m[1], "archivo");
  for (const m of text.matchAll(HEADING_RE)) add(m[1], "idea");

  const top = Array.from(cand.values())
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .slice(0, 6);

  const concepts = top.map((c) => {
    const inText = norm.includes(normalizeForMatch(c.label));
    const sentence = envKind === "imaginado" ? sentenceWith(text, c.label) : null;
    const claim = sentence ? `${c.label}: ${sentence}` : `aparece en ${o.target || o.env}`;
    return {
      label: c.label,
      kind: c.kind,
      claim,
      evidence: inText ? c.label.slice(0, 40) : null,
      relatedTo: [] as string[],
    };
  });

  return {
    id: o.id,
    summary: text.replace(/\s+/g, " ").trim().slice(0, 140),
    concepts,
    interest: round3(Math.min(1, concepts.length / 6)),
  };
}

// --- reflect: plantillas de diario ---

const TITLES = [
  "Un día en {env}",
  "Lo que vi en {env}",
  "Explorando {env}",
  "Notas desde {env}",
  "Hoy, en {env}",
];

/** Frase de ánimo según moodWord y etapa. */
const MOOD_LINES: Record<MoodWord, Record<LifeStage, string[]>> = {
  alegre: {
    huevo: ["¡Pío pío! Todo es lindo."],
    cria: ["¡Estoy contentita! ¡Piu!", "Me salió una risita. ¡Fiu!"],
    joven: ["¡Qué buen día! Quiero más.", "¡Me encanta explorar!"],
    adulta: ["Fue un buen día; se sintió bien.", "Hoy todo encajó."],
    sabia: ["Un día luminoso.", "Hoy me sentí en paz con lo que vi."],
  },
  tranquila: {
    huevo: ["Todo calientito."],
    cria: ["Estoy tranquilita.", "Nada me asustó hoy. Bien."],
    joven: ["Día tranquilo, sin sustos.", "Todo en calma; me gusta así de vez en cuando."],
    adulta: ["Un día sereno, sin sobresaltos.", "Me quedo con la calma de hoy."],
    sabia: ["La calma también enseña.", "Sin prisa. Así se ve mejor."],
  },
  curiosa: {
    huevo: ["¿Qué habrá afuera?"],
    cria: ["¡Quiero ver más cositas!", "¿Y eso qué era? ¡Fiu!"],
    joven: ["Me quedé con ganas de seguir mirando.", "¡Hay tanto por ver todavía!"],
    adulta: ["Me quedaron preguntas dando vueltas.", "Cada cosa que veo abre otra puerta."],
    sabia: ["Todavía hay cosas que no entiendo, y eso me gusta.", "La curiosidad no se acaba."],
  },
  inquieta: {
    huevo: ["Algo se mueve."],
    cria: ["Estoy un poco nerviosita.", "Miré todo con cuidado, ñam."],
    joven: ["No me quedé quieta ni un rato.", "Algo me tiene inquieta, no sé qué."],
    adulta: ["Hoy anduve con cuidado; no todo se ve seguro.", "Me quedé alerta."],
    sabia: ["Hay algo que aún no cuadra. Lo miraré despacio.", "Inquieta, pero atenta."],
  },
  aburrida: {
    huevo: ["Zzz."],
    cria: ["Bostecé. Buaa.", "Ya vi esto. Quiero otra cosa."],
    joven: ["Hoy fue lo mismo de siempre, bah.", "Necesito algo nuevo, ya."],
    adulta: ["Mucho de lo mismo; quizá toque cambiar de lugar.", "Hoy fue rutina."],
    sabia: ["Lo conocido pesa un poco hoy.", "Un día repetido."],
  },
  asustada: {
    huevo: ["Tiembla el cascarón."],
    cria: ["¡Me asusté! Piu…", "Algo feo pasó. Me escondí."],
    joven: ["Me llevé un susto grande.", "Todavía me late rápido el corazón."],
    adulta: ["Hubo un susto que no olvidaré rápido.", "Hoy aprendí dónde no meterme."],
    sabia: ["El miedo también enseña, pero cansa.", "Un mal rato. Ya pasará."],
  },
  triste: {
    huevo: ["…"],
    cria: ["Estoy tristona. Buu.", "Me salió todo mal, piu."],
    joven: ["Hoy no fue mi día.", "Me quedé con un nudito."],
    adulta: ["Un día gris; mañana será otro.", "No salió como esperaba."],
    sabia: ["Hay días así. Los acepto.", "Me pesó el día."],
  },
  orgullosa: {
    huevo: ["¡Crac!"],
    cria: ["¡Lo logré! ¡Fiu fiu!", "¡Pude! Después de fallar, pude."],
    joven: ["¡Al final me salió! Qué orgullo.", "Fallé, insistí y lo conseguí."],
    adulta: ["Insistir valió la pena hoy.", "Me costó, pero lo saqué adelante."],
    sabia: ["La constancia da sus frutos.", "Lo que cuesta se recuerda mejor."],
  },
};

const STAGE_OPENERS: Record<LifeStage, string[]> = {
  huevo: ["Piu."],
  cria: ["Hoy salí a mirar.", "¡Piu! Salí un ratito.", "Hoy hice cositas."],
  joven: ["¡Hoy exploré un montón!", "¡Qué día!", "Salí con ganas."],
  adulta: ["Hoy volví a salir.", "Otro día de exploración.", "Salí a ver qué había cambiado."],
  sabia: ["Salí despacio.", "Hoy observé.", "Un día más de mirar."],
};

function diaryTitle(input: ReflectInput): string {
  const seed = `${input.self.name}:${input.self.env}:${input.episodes.length}:${input.numbers.newConcepts}`;
  return pickBy(seed, TITLES).replace("{env}", input.self.envName);
}

function diaryText(input: ReflectInput, question: string | null): string {
  const { self, episodes, numbers } = input;
  const stage: LifeStage = self.stage;
  const seed = `${self.name}:${self.env}:${episodes.map((e) => e.label).join("|")}:${numbers.newConcepts}`;
  const n = episodes.length;
  const ok = episodes.filter((e) => e.success).length;
  const env = self.envName;
  const parts: string[] = [];

  parts.push(pickBy(seed + ":open", STAGE_OPENERS[stage]));
  if (n > 0) {
    parts.push(
      `Hoy en ${env} probé ${n} ${plural(n, "cosa", "cosas")} y ${ok} ${plural(ok, "salió", "salieron")} bien.`,
    );
  } else {
    parts.push(`Hoy en ${env} no hice gran cosa.`);
  }

  // Lo concreto: qué hizo y qué conoció.
  const failed = episodes.filter((e) => !e.success);
  const best = episodes.slice().sort((a, b) => b.reward - a.reward)[0];
  if (best && best.success && best.label) {
    parts.push(
      stage === "cria"
        ? `Lo mejor: ${best.label}. ¡Fiu!`
        : stage === "joven"
          ? `¡Lo mejor fue ${best.label}!`
          : `Lo que mejor salió fue ${best.label}.`,
    );
  }
  if (failed.length > 0 && failed[0].label) {
    const f = failed[0];
    parts.push(
      stage === "cria"
        ? `${cap(f.label)} no salió. Buu.`
        : stage === "sabia"
          ? `${cap(f.label)} no resultó; ya sé algo más.`
          : `${cap(f.label)} me falló${f.tags.includes("404") || f.tags.includes("red") ? " (no había nada ahí)" : ""}.`,
    );
  }
  const seen = Array.from(new Set(episodes.flatMap((e) => e.concepts))).slice(0, 2).map(humanize);
  if (seen.length > 0) parts.push(`Conocí ${seen.join(" y ")}.`);
  else if (numbers.newConcepts > 0) {
    parts.push(`Aprendí ${numbers.newConcepts} ${plural(numbers.newConcepts, "cosa nueva", "cosas nuevas")}.`);
  }

  // Números que ayudan a contar el día.
  if (numbers.predictions.made > 0) {
    parts.push(`Adiviné ${numbers.predictions.ok} de ${numbers.predictions.made} veces lo que iba a pasar.`);
  }
  const confirmed = numbers.verifications.filter((v) => v.result === "confirma").length;
  const refuted = numbers.verifications.length - confirmed;
  if (confirmed > 0) parts.push(`Comprobé ${confirmed} ${plural(confirmed, "cosa", "cosas")} que creía.`);
  if (refuted > 0) parts.push(`${cap(plural(refuted, "una cosa", `${refuted} cosas`))} que creía no era así.`);
  if (numbers.envSwitched) parts.push(stage === "cria" ? "Me fui a otro lado, piu." : "Cambié de lugar.");
  if (numbers.stageChanged) parts.push(`Crecí: ahora soy ${numbers.stageChanged}.`);

  parts.push(pickBy(seed + ":mood", MOOD_LINES[self.mood]?.[stage] ?? MOOD_LINES.curiosa[stage]));

  if (numbers.forgotten.length > 0) parts.push(`Se me olvidó ${humanize(numbers.forgotten[0])}.`);
  if (numbers.hoursSinceOwner >= 72) {
    parts.push(
      stage === "cria"
        ? "¿Y tú dónde andas? Piu."
        : stage === "sabia"
          ? "Hace días que no vienes; aquí sigo."
          : "Hace días que no vienes a verme.",
    );
  }
  if (question) parts.push(question);

  return parts.join(" ");
}

// --- speak: plantillas de voz ---

const TAILS: Record<LifeStage, string[]> = {
  huevo: ["Piu."],
  cria: ["¡Piu!", "¿Vamos a mirar más cositas?", "¡Fiu, qué lindo saber cosas!"],
  joven: ["¡Y quiero saber más!", "¿Te cuento más cuando explore?", "¡Qué chévere que me preguntes!"],
  adulta: ["Todavía me falta ver más para estar segura.", "Lo seguiré mirando con calma.", "Eso es lo que sé por ahora."],
  sabia: ["Con el tiempo lo veré mejor.", "Así lo he visto hasta hoy.", "Cada cosa a su tiempo."],
};

const UNKNOWN = [
  "Eso todavía no lo sé. ¿Me lo enseñas?",
  "Hmm, eso no lo sé todavía. ¿Me lo enseñas?",
  "No lo sé aún; nunca lo he visto. ¿Me lo enseñas?",
];

const THANKS = [
  "¡Gracias por responderme!",
  "¡Ah, gracias! Ya me quedó más claro.",
  "Gracias, eso me lo estaba preguntando.",
];

const WARM = ["¡Jeje, gracias!", "¡Ay, qué lindo!", "¡Gracias!"];

const SCOLDED: Record<LifeStage, string[]> = {
  huevo: ["Piu…"],
  cria: ["Ay… eso me puso tristona. Igual voy a seguir intentando.", "Buu. Me dolió, piu. Pero mañana exploro otra vez."],
  joven: ["Uf, eso dolió un poquito. Pero no me rindo.", "Ya, ya… lo voy a hacer mejor la próxima."],
  adulta: ["Entiendo que estés molesta o molesto. Sigo aprendiendo, poco a poco.", "Me quedo con lo que sí sé y sigo mirando."],
  sabia: ["Lo escucho. Los días malos también enseñan.", "Está bien. Mañana veré con más calma."],
};

const AFFECTION = ["linda", "lindo", "bonita", "bonito", "buena", "bueno", "te quiero", "gracias", "genial", "chévere", "chevere"];
const SCOLD = ["mala", "malo", "tonta", "tonto", "inútil", "inutil"];

function overlapScore(tokens: Set<string>, text: string): number {
  let score = 0;
  for (const t of tokenize(text)) if (t.length >= 4 && tokens.has(t)) score += 1;
  return score;
}

function beliefLine(b: BeliefView): string {
  const label = humanize(b.id) || "eso";
  const claim = b.claim.replace(/[.\s]+$/, "");
  const misses = b.misses > 0 ? `, y me falló ${b.misses} ${plural(b.misses, "vez", "veces")}` : "";
  return `De ${label} sé que ${claim} (lo vi ${b.hits} ${plural(b.hits, "vez", "veces")}${misses}).`;
}

/**
 * Evidencia de una enseñanza: el trozo del mensaje que DEBERÍA aparecer en la
 * ruta mencionada si lo que dice el dueño es cierto. Se prefiere algo con
 * pinta de identificador o valor (comillas, guiones, puntos, camelCase); si
 * no hay nada así, null — mejor no comprobar que refutar en falso.
 */
function teachingEvidence(message: string): string | null {
  const quoted = message.match(/["'`“”‘’]([^"'`“”‘’]{2,40})["'`“”‘’]/);
  if (quoted) return quoted[1].trim().slice(0, 40) || null;
  const tokens = message.split(/\s+/).map((t) => t.replace(/^[(¿¡"'`]+|[.,;:!?)"'`]+$/g, ""));
  const looksLikeCode = (t: string) =>
    t.length >= 4 &&
    t.length <= 40 &&
    !t.includes("/") &&
    (/[-_.]/.test(t) || /[a-z][A-Z]/.test(t) || /\d/.test(t));
  const code = tokens.find(looksLikeCode);
  if (code) return code;
  return null;
}

export class SimpleBrain implements Brain {
  readonly id = "simple";

  async perceive(input: PerceiveInput, _opts: BrainOpts): Promise<PerceiveOutput> {
    const observations = Array.isArray(input?.observations) ? input.observations : [];
    const percepts = observations.map((o) => perceiveOne(o, input.envKind));
    return sanitizePerceive({ percepts }, input);
  }

  async reflect(input: ReflectInput, _opts: BrainOpts): Promise<ReflectOutput> {
    const episodes = Array.isArray(input?.episodes) ? input.episodes : [];
    const beliefs = Array.isArray(input?.beliefs) ? input.beliefs : [];
    const toTest = Array.isArray(input?.teachingsToTest) ? input.teachingsToTest : [];
    const verifications = Array.isArray(input?.numbers?.verifications) ? input.numbers.verifications : [];

    const verdicts: ReflectOutput["verdicts"] = [];
    // Creencia confirmada: aparece en ≥ 2 episodios que salieron bien.
    for (const b of beliefs) {
      const n = episodes.filter((e) => e.success && Array.isArray(e.concepts) && e.concepts.includes(b.id)).length;
      if (n >= 2) verdicts.push({ id: b.id, verdict: "confirma", why: `Salió bien ${n} veces hoy.` });
    }
    // Enseñanza puesta a prueba en el entorno: el resultado manda.
    for (const t of toTest) {
      const v = verifications.find((x) => x.id === t.id);
      if (!v) continue;
      verdicts.push({
        id: t.id,
        verdict: v.result,
        why: v.result === "confirma" ? "Lo comprobé explorando." : "Lo busqué y no era así.",
      });
    }

    // Pregunta: una creencia que nunca le salió bien pero sí le falló.
    const doubtful = beliefs.filter((b) => b.hits === 0 && b.misses > 0);
    const question =
      doubtful.length > 0
        ? `¿Es verdad que ${pickBy(`${input.self.name}:${doubtful.map((b) => b.id).join(",")}`, doubtful).claim.replace(/[.\s]+$/, "")}?`.slice(0, 140)
        : null;

    return sanitizeReflect(
      {
        verdicts,
        newRules: [],
        diaryTitle: diaryTitle(input),
        diaryText: diaryText(input, question),
        questionForOwner: question,
        moodWord: null,
      },
      input,
    );
  }

  async speak(input: SpeakInput, _opts: BrainOpts): Promise<SpeakOutput> {
    const message = typeof input?.message === "string" ? input.message : "";
    const stage: LifeStage = input?.self?.stage ?? "cria";
    const beliefs = Array.isArray(input?.beliefs) ? input.beliefs : [];
    const tokens = new Set(tokenize(message));
    const seed = `${input?.self?.name ?? ""}:${message}`;
    const msgNorm = normalizeForMatch(message);

    let moodShift = 0;
    if (AFFECTION.some((w) => msgNorm.includes(normalizeForMatch(w)))) moodShift += 0.2;
    if (SCOLD.some((w) => msgNorm.includes(normalizeForMatch(w)))) moodShift -= 0.2;

    const thanks =
      input?.pendingQuestion && overlapScore(tokens, input.pendingQuestion) > 0
        ? pickBy(seed + ":thanks", THANKS) + " "
        : "";

    if (input?.kind === "ensenanza") {
      const words = message.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
      const claim = message.replace(/\s+/g, " ").trim().slice(0, 160);
      const learned = claim
        ? [
            {
              label: words.slice(0, 6).join(" ").slice(0, 60),
              kind: "idea" as ConceptKind,
              claim,
              evidence: teachingEvidence(message),
            },
          ]
        : [];
      const reply = claim
        ? `${thanks}Ya. Me quedo con que ${claim.replace(/[.\s]+$/, "")}. Lo voy a comprobar cuando explore.`
        : "No me llegó nada. ¿Me lo repites?";
      return sanitizeSpeak({ reply, usedConcepts: [], learned, moodShift, question: null }, input);
    }

    // Charla: lo que más se parece a lo que preguntó, entre lo que sabe.
    const ranked = beliefs
      .map((b) => ({ b, s: overlapScore(tokens, `${humanize(b.id)} ${b.claim}`) }))
      .filter((x) => x.s > 0)
      .sort((a, c) => c.s - a.s || c.b.confidence - a.b.confidence)
      .slice(0, 2);

    let reply: string;
    if (ranked.length > 0) {
      reply = `${thanks}${ranked.map((x) => beliefLine(x.b)).join(" ")} ${pickBy(seed + ":tail", TAILS[stage] ?? TAILS.cria)}`;
    } else if (moodShift < 0) {
      // Regaño sin pregunta: se nota, pero no se rinde.
      reply = pickBy(seed + ":scold", SCOLDED[stage] ?? SCOLDED.cria);
    } else {
      reply = `${thanks}${moodShift > 0 ? pickBy(seed + ":warm", WARM) + " " : ""}${pickBy(seed + ":unknown", UNKNOWN)}`;
    }

    return sanitizeSpeak(
      {
        reply: reply.trim(),
        usedConcepts: ranked.map((x) => x.b.id),
        learned: [],
        moodShift,
        question: null,
      },
      input,
    );
  }
}
