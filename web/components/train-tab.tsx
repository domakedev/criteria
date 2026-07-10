"use client";

// Entrenar: el gimnasio del criterio. Escribes un tema, la IA genera
// escenarios de decisión con opciones listas para marcar, y cada respuesta
// se guarda como una decisión TUYA (privada o compartida). La IA propone la
// situación; el criterio registrado es 100 % humano.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { TrainingScenario } from "@/lib/ai";
import type { DecisionCase, Doubt } from "@/lib/types";
import { domainLabel } from "@/lib/labels";
import {
  CheckIcon,
  EyeOffIcon,
  LockIcon,
  SparklesIcon,
  TargetIcon,
  UsersIcon,
} from "./icons";

type Privacy = "private" | "named" | "anonymous";
type Lived = "no" | "yes";
type OutcomePick = "good" | "mixed" | "bad";

const SUGGESTED_TOPICS = [
  "Cambiar de trabajo",
  "React",
  "Emprender",
  "Crianza",
  "Ahorro e inversión",
  "Estudiar o trabajar",
];

const PRIVACY_PILLS: Array<{ id: Privacy; label: string; Icon: typeof LockIcon }> = [
  { id: "private", label: "Solo yo", Icon: LockIcon },
  { id: "named", label: "Comunidad", Icon: UsersIcon },
  { id: "anonymous", label: "Comunidad · anónimo", Icon: EyeOffIcon },
];

export function TrainTab({ onDone }: { onDone: () => void }) {
  const [aiOn, setAiOn] = useState<boolean | null>(null);
  const [topic, setTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const [scenarios, setScenarios] = useState<TrainingScenario[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const [privacy, setPrivacy] = useState<Privacy>("private");

  // respuesta del escenario actual
  const [selected, setSelected] = useState<number | "custom" | null>(null);
  const [customDecision, setCustomDecision] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [doubt, setDoubt] = useState<Doubt>("medium");
  const [lived, setLived] = useState<Lived>("no");
  const [outcome, setOutcome] = useState<OutcomePick | null>(null);
  const [expectation, setExpectation] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<{ enabled: boolean }>("/api/draft")
      .then((d) => setAiOn(d.enabled))
      .catch(() => setAiOn(false));
  }, []);

  const resetAnswer = () => {
    setSelected(null);
    setCustomDecision("");
    setCustomReason("");
    setDoubt("medium");
    setLived("no");
    setOutcome(null);
    setExpectation("");
  };

  const generate = async (t?: string) => {
    const theTopic = (t ?? topic).trim();
    if (!theTopic) return;
    setTopic(theTopic);
    setError("");
    setGenerating(true);
    try {
      const { scenarios: sc } = await api<{ scenarios: TrainingScenario[] }>(
        "/api/train",
        { method: "POST", body: { topic: theTopic } },
      );
      setScenarios(sc);
      setIdx(0);
      setSavedCount(0);
      resetAnswer();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar.");
    } finally {
      setGenerating(false);
    }
  };

  const advance = () => {
    resetAnswer();
    setIdx((i) => i + 1);
  };

  const save = async () => {
    if (!scenarios || selected === null) return;
    const sc = scenarios[idx];
    const answer =
      selected === "custom"
        ? { decision: customDecision.trim(), reason: customReason.trim() }
        : sc.options[selected];
    if (!answer.decision || !answer.reason) {
      setError("Cuéntanos qué harías y por qué — el porqué es el criterio.");
      return;
    }
    if (lived === "yes" && !outcome) {
      setError("Marca cómo salió, o cambia a “Nunca me pasó”.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const topicTag = topic.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 40);
      const { case: saved } = await api<{ case: DecisionCase }>("/api/cases", {
        method: "POST",
        body: {
          situation: sc.situation,
          decision: answer.decision,
          reason: answer.reason,
          doubt,
          ...(lived === "no" && expectation.trim()
            ? { expectation: expectation.trim() }
            : {}),
          context: { domain: sc.domain, tags: [topicTag, "entrenamiento"] },
          lenses: [],
          share: privacy !== "private",
          anonymous: privacy === "anonymous",
        },
      });
      // Si ya la vivió, se cierra el ciclo de una vez: eso es criterio con peso.
      if (lived === "yes" && outcome) {
        await api(`/api/cases/${saved.id}/outcome`, {
          method: "POST",
          body: { status: outcome },
        });
      }
      setSavedCount((n) => n + 1);
      advance();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  const field =
    "w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm transition-colors focus:border-emerald-600 focus:outline-none";

  if (aiOn === false) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        El entrenamiento necesita la IA configurada (<code>GEMINI_API_KEY</code>).
        Mientras tanto puedes anotar decisiones reales con el botón{" "}
        <strong>Anotar</strong>.
      </p>
    );
  }

  // --- Pantalla final ---
  if (scenarios && idx >= scenarios.length) {
    return (
      <div className="animate-rise rounded-2xl border border-stone-200/70 bg-white p-8 text-center shadow-sm">
        <span className="mx-auto inline-flex rounded-full bg-emerald-100 p-3 text-emerald-700">
          <CheckIcon className="h-7 w-7" />
        </span>
        <h2 className="mt-3 text-lg font-semibold text-stone-900">
          Entrenamiento completado
        </h2>
        <p className="mt-1 text-sm text-stone-600">
          Guardaste <strong>{savedCount}</strong> decisión(es) sobre{" "}
          <strong>{topic}</strong>
          {privacy === "private" ? " en tu criterio personal." : " y las compartiste con la comunidad."}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              setScenarios(null);
              setTopic("");
              resetAnswer();
            }}
            className="rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-800"
          >
            Entrenar otro tema
          </button>
          <button
            onClick={onDone}
            className="rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:border-emerald-600 hover:text-emerald-800"
          >
            Ver mis decisiones
          </button>
        </div>
      </div>
    );
  }

  // --- Sesión de entrenamiento ---
  if (scenarios) {
    const sc = scenarios[idx];
    return (
      <div className="animate-fade space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm text-stone-600">
            <TargetIcon className="h-4 w-4 text-emerald-700" />
            <strong className="text-stone-800">{topic}</strong>
            <span>
              · escenario {idx + 1} de {scenarios.length}
            </span>
          </div>
          <div className="flex gap-1.5">
            {PRIVACY_PILLS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setPrivacy(id)}
                aria-pressed={privacy === id}
                title={
                  id === "private"
                    ? "Se guarda privado"
                    : id === "named"
                      ? "Se comparte con tu nombre"
                      : "Se comparte como “anónimo”"
                }
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  privacy === id
                    ? "bg-emerald-700 text-white"
                    : "bg-stone-100 text-stone-600 ring-1 ring-stone-200 hover:bg-stone-200"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-stone-200">
          <div
            className="h-full rounded-full bg-emerald-600 transition-all"
            style={{ width: `${(idx / scenarios.length) * 100}%` }}
          />
        </div>

        <div className="animate-rise rounded-2xl border border-stone-200/70 bg-white p-5 shadow-sm sm:p-6">
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">
            {domainLabel(sc.domain)}
          </span>
          <p className="mt-3 text-base leading-relaxed font-medium text-stone-900">
            {sc.situation}
          </p>

          <p className="mt-4 mb-2 text-sm font-medium text-stone-700">
            ¿Qué harías tú?
          </p>
          <div className="space-y-2">
            {sc.options.map((o, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSelected(i)}
                aria-pressed={selected === i}
                className={`w-full rounded-xl border p-3.5 text-left transition-all ${
                  selected === i
                    ? "border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600"
                    : "border-stone-200 bg-white hover:border-stone-300"
                }`}
              >
                <span className="block text-sm font-medium text-stone-900">
                  {o.decision}
                </span>
                <span className="mt-0.5 block text-sm text-stone-500">
                  Porque {o.reason.charAt(0).toLowerCase() + o.reason.slice(1)}
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSelected("custom")}
              aria-pressed={selected === "custom"}
              className={`w-full rounded-xl border border-dashed p-3.5 text-left text-sm font-medium transition-all ${
                selected === "custom"
                  ? "border-emerald-600 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-600"
                  : "border-stone-300 bg-white text-stone-600 hover:border-stone-400"
              }`}
            >
              Yo haría otra cosa…
            </button>
            {selected === "custom" ? (
              <div className="space-y-2 pt-1">
                <textarea
                  className={field}
                  rows={2}
                  value={customDecision}
                  onChange={(e) => setCustomDecision(e.target.value)}
                  placeholder="¿Qué harías?"
                />
                <textarea
                  className={field}
                  rows={2}
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="¿Por qué? (esto es lo que vale)"
                />
              </div>
            ) : null}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <span className="mb-1.5 block text-sm font-medium text-stone-700">
                ¿Qué tan seguro estarías?
              </span>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["low", "Casi seguro"],
                    ["medium", "Con dudas"],
                    ["high", "Muy dudoso"],
                  ] as Array<[Doubt, string]>
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setDoubt(v)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      doubt === v
                        ? "bg-emerald-700 text-white"
                        : "bg-stone-100 text-stone-600 ring-1 ring-stone-200 hover:bg-stone-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="mb-1.5 block text-sm font-medium text-stone-700">
                ¿Viviste algo así de verdad?
              </span>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["no", "Nunca me pasó"],
                    ["yes", "Ya lo viví"],
                  ] as Array<[Lived, string]>
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      setLived(v);
                      setOutcome(null);
                    }}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      lived === v
                        ? "bg-emerald-700 text-white"
                        : "bg-stone-100 text-stone-600 ring-1 ring-stone-200 hover:bg-stone-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {lived === "yes" ? (
            <div className="mt-4">
              <span className="mb-1.5 block text-sm font-medium text-stone-700">
                ¿Y cómo salió?
              </span>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["good", "Bien", "bg-emerald-100 text-emerald-800 ring-emerald-200"],
                    ["mixed", "Más o menos", "bg-amber-100 text-amber-800 ring-amber-200"],
                    ["bad", "Mal", "bg-red-100 text-red-700 ring-red-200"],
                  ] as Array<[OutcomePick, string, string]>
                ).map(([v, label, cls]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setOutcome(v)}
                    className={`rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 transition-all ${cls} ${
                      outcome === v ? "ring-2 ring-offset-1" : "opacity-70 hover:opacity-100"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <input
                className={field}
                value={expectation}
                onChange={(e) => setExpectation(e.target.value)}
                placeholder="¿Qué esperarías que pase? (opcional)"
              />
            </div>
          )}

          {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              onClick={save}
              disabled={saving || selected === null}
              className="rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Guardar y seguir"}
            </button>
            <button
              onClick={advance}
              disabled={saving}
              className="text-sm font-medium text-stone-500 underline-offset-2 hover:text-stone-800 hover:underline"
            >
              Saltar este escenario
            </button>
            {savedCount > 0 ? (
              <span className="ml-auto text-xs text-stone-400">
                {savedCount} guardada(s)
              </span>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  // --- Pantalla inicial: elegir tema ---
  return (
    <div className="animate-fade space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-stone-900">
          Entrena tu criterio
        </h1>
        <p className="mt-1 text-stone-500">
          Elige un tema y responde escenarios rápidos. Tus respuestas se
          guardan como tu criterio.
        </p>
      </div>
      <div className="rounded-2xl border border-stone-200/70 bg-white p-5 shadow-sm sm:p-6">

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className={field}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                generate();
              }
            }}
            placeholder="Ej.: React, emprender, crianza, mudanza…"
            maxLength={120}
          />
          <button
            onClick={() => generate()}
            disabled={generating || topic.trim().length < 2 || aiOn === null}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:opacity-50"
          >
            <SparklesIcon className="h-4 w-4" />
            {generating ? "Generando escenarios…" : "Generar escenarios"}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {SUGGESTED_TOPICS.map((t) => (
            <button
              key={t}
              onClick={() => generate(t)}
              disabled={generating}
              className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600 ring-1 ring-stone-200 transition-colors hover:bg-emerald-50 hover:text-emerald-800 hover:ring-emerald-200 disabled:opacity-50"
            >
              {t}
            </button>
          ))}
        </div>

        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
        <p className="mt-4 text-xs text-stone-400">
          La IA solo propone las situaciones — lo que respondes es criterio
          100 % humano, tuyo.
        </p>
      </div>
    </div>
  );
}
