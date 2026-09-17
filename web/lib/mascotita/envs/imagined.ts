// Mundos imaginados: un motor genérico que lee un mundo definido como DATOS
// (envs/data.ts) y lo vuelve un Environment. Cada objeto tiene una tabla de
// reacciones OCULTA (probabilidad de que un verbo salga bien, textos y
// recompensas): la mascota no la ve, la descubre probando. Con el RNG sembrado
// del tick, un reintento reproduce exactamente las mismas tiradas.
//
// Aquí no hay IA: las affordances las arma el servidor, la recompensa la
// decide la tabla y la "observación" es texto concreto ("el hongo rojo… te
// dolió la panza") que va a la crónica; la red solo ve señales crudas.
import type { Drives, EnvCursor, EnvStateDoc, ImaginedCursor } from "../types";

/** Qué clase de cosa es un objeto (solo descriptivo; la red no lo ve). */
export type ConceptKind = "cosa" | "lugar" | "idea" | "regla" | "archivo" | "persona" | "habito" | "duda";
import type { Action, Environment, EnvContext, Outcome } from "./index";
import { BOUNDS, CAL } from "../config";
import { clamp01, pick, round3, shuffle } from "../rng";
import { esDeDia } from "../cognition";

// --- formato de los mundos ---

export interface Reaction {
  /** probabilidad oculta de que el verbo salga bien (0..1) */
  p: number;
  okText: string;
  failText: string;
  /** −1..1 */
  okReward: number;
  /** −1..1 */
  failReward: number;
  /**
   * Cambios en los impulsos como DELTAS (p. ej. energy −0.3): el motor los
   * convierte a valores absolutos antes de devolverlos en el Outcome.
   */
  effects?: Partial<Drives>;
  /** energía mínima para intentarlo; si no llega, falla suave sin contar */
  requiresEnergy?: number;
  /** reservado: si la reacción se puede aprender como regla (no se usa aún) */
  learnable?: boolean;
}

export interface ImaginedObject {
  id: string;
  label: string;
  kind: ConceptKind;
  desc: string;
  /** solo aparece cuando la zona se ha visitado al menos estas veces */
  hiddenAfter?: number;
  /** verbo.id → reacción */
  reactions: Record<string, Reaction>;
}

export interface Zone {
  id: string;
  name: string;
  desc: string;
  /** 0..1 */
  danger: number;
  objects: ImaginedObject[];
  /** ids de zonas vecinas */
  links: string[];
}

export interface Verb {
  id: string;
  label: string;
  riskHint: number;
  costEnergy: number;
  ludic?: boolean;
}

export interface ImaginedEnvSpec {
  id: string;
  name: string;
  emoji: string;
  intro: string;
  zones: Zone[];
  verbs: Verb[];
  ambient: { day: string[]; night: string[] };
}

// Tipos de acción que el motor reserva; ningún verbo puede llamarse así.
const RESERVED_TYPES = new Set(["observar", "explorar", "descansar"]);
const MAX_AFFORDANCES = 8;

/** Valida un mundo al cargar el módulo: mejor fallar al arrancar que a mitad de un tick. */
export function assertImagined(spec: ImaginedEnvSpec): void {
  const where = `mundo "${spec.id}"`;
  if (!spec.id || !/^[a-z0-9-]+$/.test(spec.id)) throw new Error(`${where}: id inválido`);
  if (!spec.name || !spec.emoji || !spec.intro) throw new Error(`${where}: faltan name/emoji/intro`);
  if (!Array.isArray(spec.zones) || spec.zones.length === 0)
    throw new Error(`${where}: necesita al menos una zona (la primera es la inicial)`);
  if (!Array.isArray(spec.verbs) || spec.verbs.length === 0)
    throw new Error(`${where}: necesita al menos un verbo`);
  if (spec.ambient.day.length === 0 || spec.ambient.night.length === 0)
    throw new Error(`${where}: ambient.day y ambient.night necesitan frases`);

  const inRange = (x: number, lo: number, hi: number) =>
    typeof x === "number" && Number.isFinite(x) && x >= lo && x <= hi;

  const verbIds = new Set<string>();
  for (const v of spec.verbs) {
    if (!v.id || !/^[a-z0-9-]+$/.test(v.id)) throw new Error(`${where}: verbo con id inválido "${v.id}"`);
    if (RESERVED_TYPES.has(v.id)) throw new Error(`${where}: el verbo "${v.id}" usa un nombre reservado`);
    if (verbIds.has(v.id)) throw new Error(`${where}: verbo repetido "${v.id}"`);
    verbIds.add(v.id);
    if (!v.label) throw new Error(`${where}: el verbo "${v.id}" no tiene label`);
    if (!inRange(v.riskHint, 0, 1)) throw new Error(`${where}: riskHint fuera de [0,1] en verbo "${v.id}"`);
    if (!inRange(v.costEnergy, 0, 1)) throw new Error(`${where}: costEnergy fuera de [0,1] en verbo "${v.id}"`);
  }

  const zoneIds = new Set<string>();
  const objectIds = new Set<string>();
  for (const z of spec.zones) {
    if (!z.id || !/^[a-z0-9-]+$/.test(z.id)) throw new Error(`${where}: zona con id inválido "${z.id}"`);
    if (zoneIds.has(z.id)) throw new Error(`${where}: zona repetida "${z.id}"`);
    zoneIds.add(z.id);
    if (!z.name || !z.desc) throw new Error(`${where}: la zona "${z.id}" necesita name y desc`);
    if (!inRange(z.danger, 0, 1)) throw new Error(`${where}: danger fuera de [0,1] en zona "${z.id}"`);
    if (!Array.isArray(z.objects)) throw new Error(`${where}: la zona "${z.id}" no tiene objects`);
    for (const o of z.objects) {
      if (!o.id || !/^[a-z0-9-]+$/.test(o.id)) throw new Error(`${where}: objeto con id inválido "${o.id}" en "${z.id}"`);
      if (objectIds.has(o.id) || zoneIds.has(o.id))
        throw new Error(`${where}: id de objeto repetido o igual a una zona: "${o.id}"`);
      objectIds.add(o.id);
      if (!o.label || !o.desc) throw new Error(`${where}: el objeto "${o.id}" necesita label y desc`);
      if (o.hiddenAfter !== undefined && (!Number.isInteger(o.hiddenAfter) || o.hiddenAfter < 0))
        throw new Error(`${where}: hiddenAfter inválido en "${o.id}"`);
      const keys = Object.keys(o.reactions ?? {});
      if (keys.length === 0) throw new Error(`${where}: el objeto "${o.id}" no tiene reacciones`);
      for (const k of keys) {
        if (!verbIds.has(k)) throw new Error(`${where}: "${o.id}" reacciona a un verbo inexistente "${k}"`);
        const r = o.reactions[k];
        if (!inRange(r.p, 0, 1)) throw new Error(`${where}: p fuera de [0,1] en ${o.id}.${k}`);
        if (!inRange(r.okReward, -1, 1) || !inRange(r.failReward, -1, 1))
          throw new Error(`${where}: reward fuera de [−1,1] en ${o.id}.${k}`);
        if (!r.okText || !r.failText) throw new Error(`${where}: faltan okText/failText en ${o.id}.${k}`);
        if (r.requiresEnergy !== undefined && !inRange(r.requiresEnergy, 0, 1))
          throw new Error(`${where}: requiresEnergy fuera de [0,1] en ${o.id}.${k}`);
        for (const [dk, dv] of Object.entries(r.effects ?? {})) {
          if (!inRange(dv as number, -1, 1)) throw new Error(`${where}: effects.${dk} fuera de [−1,1] en ${o.id}.${k}`);
        }
      }
    }
  }
  for (const z of spec.zones) {
    for (const l of z.links) {
      if (!zoneIds.has(l)) throw new Error(`${where}: la zona "${z.id}" enlaza a una zona inexistente "${l}"`);
      if (l === z.id) throw new Error(`${where}: la zona "${z.id}" se enlaza a sí misma`);
    }
  }
}

// --- motor ---

function initCursorFor(spec: ImaginedEnvSpec): ImaginedCursor {
  return {
    kind: "imaginado",
    zone: spec.zones[0].id,
    zoneVisits: {},
    objectTries: {},
    discovered: [],
    clock: 0,
  };
}

/** Día entre las 06:00 y las 18:00 de Lima (los mundos viven en la hora real). */
export function isDayAt(nowIso: string): boolean {
  return esDeDia(new Date(nowIso));
}

function visibleObjects(zone: Zone, cursor: ImaginedCursor): ImaginedObject[] {
  const visits = cursor.zoneVisits[zone.id] ?? 0;
  return zone.objects.filter((o) => o.hiddenAfter === undefined || visits >= o.hiddenAfter);
}

function triesOf(cursor: ImaginedCursor, objId: string): { ok: number; fail: number } {
  return cursor.objectTries[objId] ?? { ok: 0, fail: 0 };
}

function markDiscovered(cursor: ImaginedCursor, objects: ImaginedObject[]): string[] {
  const fresh: string[] = [];
  for (const o of objects) {
    if (!cursor.discovered.includes(o.id)) {
      cursor.discovered.push(o.id);
      fresh.push(o.id);
    }
  }
  return fresh;
}

function listing(objects: ImaginedObject[]): string {
  if (objects.length === 0) return "Aquí no hay nada que llame la atención.";
  return `Aquí hay: ${objects.map((o) => o.label).join(", ")}.`;
}

function clip(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, BOUNDS.observationChars);
}

export function fromData(spec: ImaginedEnvSpec): Environment {
  const zoneById = new Map(spec.zones.map((z) => [z.id, z]));
  const verbById = new Map(spec.verbs.map((v) => [v.id, v]));

  /** Devuelve el cursor del ctx; si viene de otro entorno o roto, lo reinicia. */
  function cursorOf(ctx: EnvContext): ImaginedCursor {
    const c = ctx.envState.cursor;
    if (c.kind === "imaginado" && zoneById.has(c.zone)) return c;
    const fresh = initCursorFor(spec);
    ctx.envState.cursor = fresh;
    return fresh;
  }

  function currentZone(cursor: ImaginedCursor): Zone {
    return zoneById.get(cursor.zone) ?? spec.zones[0];
  }

  function ambient(nowIso: string, rng: () => number): string {
    return pick(rng, isDayAt(nowIso) ? spec.ambient.day : spec.ambient.night);
  }

  /**
   * Convierte los deltas de una reacción en valores absolutos, imitando lo que
   * el tick hará justo antes (costo de energía, extra por riesgo, alivio del
   * aburrimiento por novedad) para no pisar esos cambios.
   */
  function absoluteEffects(
    a: Action,
    ctx: EnvContext,
    ok: boolean,
    novelty: number,
    delta: Partial<Drives> | undefined,
  ): Partial<Drives> | undefined {
    if (!delta) return undefined;
    const d = ctx.criatura.drives;
    const out: Partial<Drives> = {};
    if (typeof delta.energy === "number") {
      let cost = clamp01(a.costEnergy);
      if (a.riskHint > 0.5 && !ok) cost += CAL.energyRisky;
      out.energy = round3(clamp01(d.energy - cost * CAL.energiaEscala + delta.energy));
    }
    if (typeof delta.boredom === "number") {
      const relief = novelty > 0.5 ? CAL.boredomNoveltyRelief : 0;
      out.boredom = round3(clamp01(d.boredom - relief + delta.boredom));
    }
    if (typeof delta.loneliness === "number") {
      out.loneliness = round3(clamp01(d.loneliness + delta.loneliness));
    }
    return out;
  }

  const env: Environment = {
    id: spec.id,
    name: spec.name,
    emoji: spec.emoji,
    kind: "imaginado",
    intro: spec.intro,

    initCursor(): EnvCursor {
      return initCursorFor(spec);
    },

    zonaDe(state: EnvStateDoc): string {
      const c = state.cursor;
      return c.kind === "imaginado" && zoneById.has(c.zone) ? c.zone : spec.zones[0].id;
    },

    zonas() {
      return spec.zones.map((z) => ({ id: z.id, name: z.name }));
    },

    nombreZona(id: string): string {
      return zoneById.get(id)?.name ?? id;
    },

    async affordances(ctx: EnvContext): Promise<Action[]> {
      const cursor = cursorOf(ctx);
      const zone = currentZone(cursor);
      const base: Action[] = [
        {
          type: "observar",
          target: zone.id,
          label: `observar ${zone.name}`,
          riskHint: 0,
          costEnergy: 0.03,
          explore: true,
        },
      ];
      for (const link of zone.links) {
        const dest = zoneById.get(link);
        if (!dest) continue;
        base.push({
          type: "explorar",
          target: dest.id,
          label: `explorar ${dest.name}`,
          riskHint: round3(dest.danger * 0.5),
          costEnergy: 0.08,
          explore: true,
        });
      }

      // Acciones sobre objetos: la mitad del cupo va a las menos probadas
      // (para que siempre haya algo nuevo que intentar) y la otra mitad se
      // sortea entre el resto (para que pueda repetir lo que ya sabe que le
      // gusta). Sin esta mezcla, lo bien conocido desaparecería del menú.
      const objActions: Array<{ a: Action; tries: number }> = [];
      for (const o of visibleObjects(zone, cursor)) {
        const t = triesOf(cursor, o.id);
        for (const verbId of Object.keys(o.reactions)) {
          const verb = verbById.get(verbId);
          if (!verb) continue;
          objActions.push({
            tries: t.ok + t.fail,
            a: {
              type: verb.id,
              target: o.id,
              label: `${verb.label} ${o.label}`,
              riskHint: round3(clamp01(verb.riskHint + 0.3 * zone.danger)),
              costEnergy: verb.costEnergy,
              ...(verb.ludic ? { ludic: true } : {}),
            },
          });
        }
      }
      const ordered = shuffle(ctx.rng, objActions).sort((x, y) => x.tries - y.tries);
      const room = Math.max(0, MAX_AFFORDANCES - base.length);
      const nuevas = Math.ceil(room / 2);
      const elegidas = ordered.slice(0, nuevas);
      const resto = shuffle(ctx.rng, ordered.slice(nuevas)).slice(0, room - elegidas.length);
      return base.concat(shuffle(ctx.rng, [...elegidas, ...resto]).map((x) => x.a)).slice(0, MAX_AFFORDANCES);
    },

    async act(a: Action, ctx: EnvContext): Promise<Outcome> {
      const cursor = cursorOf(ctx);
      const zone = currentZone(cursor);
      const rng = ctx.rng;

      if (a.type === "observar") {
        const seen = visibleObjects(zone, cursor);
        markDiscovered(cursor, seen);
        return {
          success: true,
          reward: 0.05,
          observation: {
            text: clip(`${ambient(ctx.now, rng)} ${zone.desc} ${listing(seen)}`),
            hints: seen.map((o) => o.label),
            ref: zone.id,
          },
          tags: ["observar", isDayAt(ctx.now) ? "dia" : "noche"],
        };
      }

      if (a.type === "explorar") {
        const dest = zoneById.get(a.target);
        if (!dest || !zone.links.includes(dest.id)) {
          return { success: false, reward: -0.1, tags: ["invalido"] };
        }
        // Zonas peligrosas: a veces un ruido la espanta antes de entrar.
        if (dest.danger > 0.5 && rng() < dest.danger * 0.3) {
          return {
            success: false,
            reward: -0.3,
            observation: {
              text: clip(
                `${dest.desc} Apenas entraste, un ruido seco te asustó y volviste corriendo a ${zone.name}.`,
              ),
              hints: [dest.name, "ruido"],
              ref: dest.id,
            },
            tags: ["explorar", "susto"],
          };
        }
        cursor.zone = dest.id;
        cursor.zoneVisits[dest.id] = (cursor.zoneVisits[dest.id] ?? 0) + 1;
        const first = cursor.zoneVisits[dest.id] === 1;
        const seen = visibleObjects(dest, cursor);
        const fresh = markDiscovered(cursor, seen);
        return {
          success: true,
          reward: first ? 0.15 : 0.02,
          observation: {
            text: clip(`${ambient(ctx.now, rng)} ${dest.desc} ${listing(seen)}`),
            hints: [dest.name, ...seen.map((o) => o.label)],
            ref: dest.id,
          },
          tags: ["explorar", first ? "nuevo" : "conocido", ...(fresh.length ? ["descubrimiento"] : [])],
        };
      }

      // Un verbo sobre un objeto visible de la zona actual.
      const verb = verbById.get(a.type);
      const obj = visibleObjects(zone, cursor).find((o) => o.id === a.target);
      const reaction = verb && obj ? obj.reactions[verb.id] : undefined;
      if (!verb || !obj || !reaction) {
        return { success: false, reward: -0.1, tags: ["invalido"] };
      }
      if (reaction.requiresEnergy !== undefined && ctx.criatura.drives.energy < reaction.requiresEnergy) {
        return {
          success: false,
          reward: -0.2,
          observation: {
            text: clip(`${obj.desc} Quisiste ${verb.label} ${obj.label}, pero estás sin fuerzas.`),
            hints: [obj.label, verb.label],
            ref: obj.id,
          },
          tags: ["sin-energia"],
        };
      }

      const novelty = env.noveltyOf(a, ctx);
      const tries = triesOf(cursor, obj.id);

      const pEff = clamp01(reaction.p + 0.1 * ctx.competence(verb.id));
      const ok = rng() < pEff;
      const reward = ok ? reaction.okReward : reaction.failReward;
      const tags = [verb.id, ok ? "ok" : "fallo"];
      if (ok) tries.ok += 1;
      else tries.fail += 1;
      cursor.objectTries[obj.id] = tries;
      markDiscovered(cursor, [obj]);

      const effects = absoluteEffects(a, ctx, ok, novelty, reaction.effects);
      return {
        success: ok,
        reward: round3(Math.max(-1, Math.min(1, reward))),
        observation: {
          text: clip(`${obj.desc} ${ok ? reaction.okText : reaction.failText}`),
          hints: [obj.label, verb.label],
          ref: obj.id,
        },
        ...(effects ? { effects } : {}),
        tags,
      };
    },

    noveltyOf(a: Action, ctx: EnvContext): number {
      const cursor = cursorOf(ctx);
      if (a.type === "observar") {
        const visits = cursor.zoneVisits[a.target] ?? 0;
        return 0.3 * (1 - Math.min(1, visits / 4));
      }
      if (a.type === "explorar") {
        const visits = cursor.zoneVisits[a.target] ?? 0;
        return 1 - Math.min(1, visits / 4);
      }
      const t = triesOf(cursor, a.target);
      return 1 / (1 + t.ok + t.fail);
    },
  };

  return env;
}
