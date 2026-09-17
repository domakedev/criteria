// Cerebro propio por HTTP: el día que exista un modelo entrenado con el
// dataset de ticks (TickDoc.io), se expone con tres endpoints JSON y la
// mascota lo usa sin cambiar nada más. MASCOTITA_BRAIN=custom +
// MASCOTITA_BRAIN_URL (+ MASCOTITA_BRAIN_TOKEN). Cualquier fallo (status ≠ 200,
// JSON inválido, timeout) se lanza y withFallback cae a SimpleBrain; la
// respuesta pasa por sanitize.ts igual que la de Gemini: un cerebro remoto
// tampoco puede inventar ids ni saltarse los topes.
import { BOUNDS } from "../config";
import type {
  Brain,
  BrainOpts,
  PerceiveInput,
  PerceiveOutput,
  ReflectInput,
  ReflectOutput,
  SpeakInput,
  SpeakOutput,
} from "./index";
import { sanitizePerceive, sanitizeReflect, sanitizeSpeak } from "./sanitize";

type Op = "perceive" | "reflect" | "speak";

export class CustomBrain implements Brain {
  readonly id = "custom";
  private readonly base: string;
  private readonly token: string;

  constructor(url: string, token: string) {
    this.base = url.trim().replace(/\/+$/, "");
    this.token = token.trim();
  }

  /** POST {url}/{op} con el input tal cual; lanza si algo no es un 200 con JSON. */
  private async call(op: Op, input: unknown, opts: BrainOpts): Promise<unknown> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const res = await fetch(`${this.base}/${op}`, {
      method: "POST",
      headers,
      body: JSON.stringify(input),
      signal: opts.deadline.signal(BOUNDS.llmTimeoutMs),
      cache: "no-store",
    });
    if (res.status !== 200) {
      // Sin cuerpo en el mensaje: no filtrar lo que devuelva un servidor ajeno.
      throw new Error(`CustomBrain ${op}: HTTP ${res.status}`);
    }
    return res.json();
  }

  async perceive(input: PerceiveInput, opts: BrainOpts): Promise<PerceiveOutput> {
    return sanitizePerceive(await this.call("perceive", input, opts), input);
  }

  async reflect(input: ReflectInput, opts: BrainOpts): Promise<ReflectOutput> {
    return sanitizeReflect(await this.call("reflect", input, opts), input);
  }

  async speak(input: SpeakInput, opts: BrainOpts): Promise<SpeakOutput> {
    return sanitizeSpeak(await this.call("speak", input, opts), input);
  }
}
