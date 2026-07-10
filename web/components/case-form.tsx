"use client";

// Formulario para anotar una decisión. Lenguaje llano, dictado por voz en los
// campos de texto largos. La IA no interviene: lo que escribes es lo que se guarda.
import { useState } from "react";
import { api } from "@/lib/api";
import { DOMAINS } from "@/lib/labels";
import type { DecisionCase, Doubt, Weight } from "@/lib/types";
import { MicButton } from "./mic-button";

interface LensRow {
  name: string;
  weight: Weight;
  reading: string;
}

const EMPTY_LENS: LensRow = { name: "", weight: "medium", reading: "" };

export function CaseForm({ onSaved }: { onSaved: (c: DecisionCase) => void }) {
  const [situation, setSituation] = useState("");
  const [decision, setDecision] = useState("");
  const [reason, setReason] = useState("");
  const [expectation, setExpectation] = useState("");
  const [doubt, setDoubt] = useState<Doubt>("medium");
  const [domain, setDomain] = useState("vida-diaria");
  const [lenses, setLenses] = useState<LensRow[]>([{ ...EMPTY_LENS }]);
  const [share, setShare] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setLens = (i: number, patch: Partial<LensRow>) =>
    setLenses((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

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
          share,
        },
      });
      setSituation("");
      setDecision("");
      setReason("");
      setExpectation("");
      setDoubt("medium");
      setLenses([{ ...EMPTY_LENS }]);
      setShare(false);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  const field =
    "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none";

  return (
    <form onSubmit={submit} className="space-y-5">
      <Field
        label="¿Qué situación enfrentaste?"
        hint="Cuéntalo como se lo contarías a un amigo."
        onDictate={setSituation}
      >
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
          ¿Qué pesaste al decidir?{" "}
          <span className="font-normal text-stone-400">(opcional)</span>
        </span>
        <div className="space-y-2">
          {lenses.map((l, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                className={`${field} basis-40 flex-1`}
                value={l.name}
                onChange={(e) => setLens(i, { name: e.target.value })}
                placeholder="Qué miraste (ej.: dinero)"
              />
              <select
                className={`${field} w-auto`}
                value={l.weight}
                onChange={(e) => setLens(i, { weight: e.target.value as Weight })}
              >
                <option value="high">Pesó mucho</option>
                <option value="medium">Pesó algo</option>
                <option value="low">Pesó poco</option>
              </select>
              <input
                className={`${field} basis-52 flex-[2]`}
                value={l.reading}
                onChange={(e) => setLens(i, { reading: e.target.value })}
                placeholder="Qué viste (ej.: el sueldo no compensaba el viaje)"
              />
              {lenses.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setLenses((rows) => rows.filter((_, j) => j !== i))}
                  className="text-stone-400 hover:text-red-600"
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

      <div>
        <span className="mb-1.5 block text-sm font-medium text-stone-800">
          ¿Qué tan seguro estabas?
        </span>
        <div className="flex gap-2">
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
              className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                doubt === value
                  ? "bg-emerald-700 text-white"
                  : "bg-stone-200 text-stone-700 hover:bg-stone-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <Field
        label="¿Qué esperas que pase?"
        hint="Opcional — sirve para comparar después con lo que pasó de verdad."
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

      <div className="flex flex-wrap items-center gap-4">
        <label className="text-sm font-medium text-stone-800">
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

        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            checked={share}
            onChange={(e) => setShare(e.target.checked)}
            className="h-4 w-4 accent-emerald-700"
          />
          Compartir con la comunidad (aparece con tu nombre, nunca tu correo)
        </label>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-emerald-700 px-5 py-2.5 font-medium text-white transition-colors hover:bg-emerald-800 disabled:opacity-50"
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
