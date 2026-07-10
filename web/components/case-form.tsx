"use client";

// Anotar una decisión, sin fricción: la cuentas con tus palabras (texto o
// voz) y la IA SOLO la ordena en el formato del caso — nunca inventa. Tú
// revisas el borrador y guardas. En la revisión solo lo esencial está a la
// vista; lo opcional (qué pesaste, qué esperas, el tema) vive plegado.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { DOMAINS } from "@/lib/labels";
import type { AiDraft } from "@/lib/ai";
import type { DecisionCase, Doubt, LensReading, Weight } from "@/lib/types";
import { MicButton } from "./mic-button";
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  EyeOffIcon,
  LockIcon,
  SparklesIcon,
  UsersIcon,
} from "./icons";

interface LensRow {
  name: string;
  weight: Weight;
  reading: string;
}

const EMPTY_LENS: LensRow = { name: "", weight: "medium", reading: "" };

type Step = "cuenta" | "revisa";
type Privacy = "private" | "named" | "anonymous";

const MISSING_LABEL: Record<string, string> = {
  situation: "qué situación enfrentaste",
  decision: "qué decidiste",
  reason: "por qué lo decidiste",
  expectation: "qué esperas que pase",
  lenses: "qué pesaste al decidir",
};

const PRIVACY_OPTIONS: Array<{
  id: Privacy;
  label: string;
  desc: string;
  Icon: typeof LockIcon;
}> = [
  {
    id: "private",
    label: "Solo yo",
    desc: "Privada — nadie más la ve.",
    Icon: LockIcon,
  },
  {
    id: "named",
    label: "Con mi nombre",
    desc: "Se comparte con la comunidad con tu nombre (nunca tu correo).",
    Icon: UsersIcon,
  },
  {
    id: "anonymous",
    label: "Anónima",
    desc: "Se comparte con la comunidad firmada como “anónimo”.",
    Icon: EyeOffIcon,
  },
];

export function CaseForm({ onSaved }: { onSaved: (c: DecisionCase) => void }) {
  // ¿Hay IA que ordene? Mientras se consulta, asumimos que sí (es lo común);
  // si no la hay, se pasa directo al formulario clásico.
  const [aiOn, setAiOn] = useState<boolean | null>(null);
  const [step, setStep] = useState<Step>("cuenta");
  const [story, setStory] = useState("");
  const [organizing, setOrganizing] = useState(false);
  const [fromAi, setFromAi] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);

  const [situation, setSituation] = useState("");
  const [decision, setDecision] = useState("");
  const [reason, setReason] = useState("");
  const [expectation, setExpectation] = useState("");
  const [doubt, setDoubt] = useState<Doubt>("medium");
  const [domain, setDomain] = useState("vida-diaria");
  const [lenses, setLenses] = useState<LensRow[]>([{ ...EMPTY_LENS }]);
  const [showExtras, setShowExtras] = useState(false);
  const [privacy, setPrivacy] = useState<Privacy>("private");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ enabled: boolean }>("/api/draft")
      .then((d) => {
        setAiOn(d.enabled);
        if (!d.enabled) setStep("revisa");
      })
      .catch(() => {
        setAiOn(false);
        setStep("revisa");
      });
  }, []);

  const setLens = (i: number, patch: Partial<LensRow>) =>
    setLenses((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const organize = async () => {
    setError("");
    setOrganizing(true);
    try {
      const { draft } = await api<{ draft: AiDraft }>("/api/draft", {
        method: "POST",
        body: { text: story },
      });
      setSituation(draft.situation);
      setDecision(draft.decision);
      setReason(draft.reason);
      setExpectation(draft.expectation);
      setDoubt(draft.doubt);
      setDomain(draft.domain);
      setLenses(
        draft.lenses.length > 0
          ? draft.lenses.map((l: LensReading) => ({ ...l }))
          : [{ ...EMPTY_LENS }],
      );
      // Si la IA encontró algo para los campos opcionales, se muestran ya
      // llenos; si no, quedan plegados para no estorbar.
      setShowExtras(draft.lenses.length > 0 || Boolean(draft.expectation));
      setMissing(draft.missing);
      setFromAi(true);
      setStep("revisa");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo ordenar el relato.");
    } finally {
      setOrganizing(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const { case: saved } = await api<{ case: DecisionCase }>("/api/cases", {
        method: "POST",
        body: {
          situation,
          decision,
          reason,
          doubt,
          expectation,
          context: { domain, tags: [] },
          lenses: lenses.filter((l) => l.name.trim()),
          share: privacy !== "private",
          anonymous: privacy === "anonymous",
        },
      });
      setStory("");
      setSituation("");
      setDecision("");
      setReason("");
      setExpectation("");
      setDoubt("medium");
      setDomain("vida-diaria");
      setLenses([{ ...EMPTY_LENS }]);
      setShowExtras(false);
      setPrivacy("private");
      setMissing([]);
      setFromAi(false);
      setStep(aiOn ? "cuenta" : "revisa");
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  const field =
    "w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm shadow-sm transition-colors focus:border-emerald-500 focus:outline-none";

  // --- Paso 1: cuéntalo con tus palabras ---
  if (step === "cuenta") {
    return (
      <div className="animate-fade space-y-4">
        <div className="rounded-2xl border border-stone-200/70 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-stone-900">
                Cuéntala como a un amigo
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                Todo junto y en desorden está bien — la IA lo ordena y tú
                revisas antes de guardar.
              </p>
            </div>
            <MicButton onText={setStory} />
          </div>

          <textarea
            className={`${field} mt-4 text-base leading-relaxed`}
            rows={7}
            value={story}
            onChange={(e) => setStory(e.target.value)}
            placeholder="Ej.: Me ofrecieron otro trabajo con mejor sueldo pero lejos de casa. Al final me quedé y pedí un aumento, porque el tiempo con mi familia vale más. Lo que más pesó fue el viaje de dos horas…"
          />

          {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

          <button
            type="button"
            onClick={organize}
            disabled={organizing || story.trim().length < 20}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 font-medium text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:opacity-40"
          >
            <SparklesIcon className="h-4.5 w-4.5" />
            {organizing ? "Ordenando tu relato…" : "Continuar"}
          </button>

          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-xs text-stone-400">
              Nada se guarda hasta que tú lo confirmes.
            </p>
            <button
              type="button"
              onClick={() => {
                setFromAi(false);
                setMissing([]);
                setStep("revisa");
              }}
              className="shrink-0 text-xs font-medium text-stone-400 underline-offset-2 hover:text-emerald-700 hover:underline"
            >
              Llenar campo por campo
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Paso 2: revisa (o formulario clásico) ---
  return (
    <form onSubmit={submit} className="animate-fade space-y-5">
      {aiOn ? (
        <button
          type="button"
          onClick={() => setStep("cuenta")}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-500 hover:text-emerald-700"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Volver a contarlo
        </button>
      ) : null}

      {fromAi ? (
        <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-100">
          <p className="flex items-center gap-2 font-medium">
            <SparklesIcon className="h-4 w-4" />
            Listo — revisa que diga lo que quisiste decir.
          </p>
          {missing.length > 0 ? (
            <p className="mt-1 text-emerald-800">
              No contaste {missing.map((m) => MISSING_LABEL[m] ?? m).join(", ")}.
              Puedes completarlo o guardar así.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-4 rounded-2xl border border-stone-200/70 bg-white p-5 shadow-sm sm:p-6">
        <Field label="¿Qué situación enfrentaste?" onDictate={setSituation}>
          <textarea
            className={field}
            rows={2}
            value={situation}
            onChange={(e) => setSituation(e.target.value)}
            placeholder="Ej.: Me ofrecieron otro trabajo con mejor sueldo pero lejos de casa…"
            required
          />
        </Field>

        <Field label="¿Qué decidiste?" onDictate={setDecision}>
          <textarea
            className={field}
            rows={2}
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
            placeholder="Ej.: Me quedé donde estaba, pero pedí un aumento."
            required
          />
        </Field>

        <Field label="¿Por qué?" onDictate={setReason}>
          <textarea
            className={field}
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej.: El tiempo con mi familia vale más que la diferencia de sueldo."
            required
          />
        </Field>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-stone-800">
            ¿Qué tan seguro estabas?
          </span>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["low", "Casi seguro"],
                ["medium", "Con algo de duda"],
                ["high", "Con mucha duda"],
              ] as Array<[Doubt, string]>
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setDoubt(value)}
                aria-pressed={doubt === value}
                className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                  doubt === value
                    ? "bg-emerald-700 text-white shadow-sm"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Lo opcional, plegado: menos campos a la vista, misma potencia. */}
        <div className="border-t border-stone-100 pt-3">
          <button
            type="button"
            onClick={() => setShowExtras((v) => !v)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-500 transition-colors hover:text-emerald-700"
          >
            <ChevronDownIcon
              className={`h-4 w-4 transition-transform ${showExtras ? "rotate-180" : ""}`}
            />
            Más detalles (opcional)
          </button>

          {showExtras ? (
            <div className="mt-4 space-y-4">
              <div>
                <span className="mb-1.5 block text-sm font-medium text-stone-800">
                  ¿Qué pesaste al decidir?
                </span>
                <div className="space-y-2">
                  {lenses.map((l, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <input
                        className={`${field} basis-36 flex-1`}
                        value={l.name}
                        onChange={(e) => setLens(i, { name: e.target.value })}
                        placeholder="Qué miraste (ej.: dinero)"
                      />
                      <select
                        className={`${field} w-auto`}
                        value={l.weight}
                        onChange={(e) =>
                          setLens(i, { weight: e.target.value as Weight })
                        }
                      >
                        <option value="high">Pesó mucho</option>
                        <option value="medium">Pesó algo</option>
                        <option value="low">Pesó poco</option>
                      </select>
                      <input
                        className={`${field} basis-48 flex-[2]`}
                        value={l.reading}
                        onChange={(e) => setLens(i, { reading: e.target.value })}
                        placeholder="Qué viste (ej.: no compensaba el viaje)"
                      />
                      {lenses.length > 1 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setLenses((rows) => rows.filter((_, j) => j !== i))
                          }
                          className="text-stone-400 transition-colors hover:text-red-600"
                          aria-label="Quitar"
                        >
                          ✕
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setLenses((rows) => [...rows, { ...EMPTY_LENS }])}
                  className="mt-2 text-sm font-medium text-emerald-700 hover:text-emerald-900"
                >
                  + Agregar otro
                </button>
              </div>

              <Field
                label="¿Qué esperas que pase?"
                hint="Sirve para comparar después con lo que pasó de verdad."
                onDictate={setExpectation}
              >
                <textarea
                  className={field}
                  rows={2}
                  value={expectation}
                  onChange={(e) => setExpectation(e.target.value)}
                  placeholder="Ej.: En seis meses debería tener el aumento."
                />
              </Field>

              <label className="block text-sm font-medium text-stone-800">
                Tema{" "}
                <select
                  className={`${field} mt-1 w-auto`}
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                >
                  {DOMAINS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-stone-200/70 bg-white p-5 shadow-sm sm:p-6">
        <span className="mb-2 block text-sm font-medium text-stone-800">
          ¿Quién puede verla?
        </span>
        <div className="flex flex-wrap gap-2">
          {PRIVACY_OPTIONS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setPrivacy(id)}
              aria-pressed={privacy === id}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                privacy === id
                  ? "bg-emerald-700 text-white shadow-sm"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-stone-400">
          {PRIVACY_OPTIONS.find((o) => o.id === privacy)?.desc}
        </p>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-xl bg-emerald-700 px-5 py-3 font-medium text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:opacity-50"
      >
        {saving ? "Guardando…" : "Guardar mi decisión"}
      </button>
    </form>
  );
}

function Field({
  label,
  hint,
  onDictate,
  children,
}: {
  label: string;
  hint?: string;
  onDictate: (text: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="text-sm font-medium text-stone-800">{label}</label>
        <MicButton onText={onDictate} />
      </div>
      {children}
      {hint ? <p className="mt-1 text-xs text-stone-400">{hint}</p> : null}
    </div>
  );
}
