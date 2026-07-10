# criteria — Format Specification v0.1

> *Español: este documento define el formato abierto. Los nombres de campos son
> en inglés para adopción global; la explicación clave está duplicada en español.*

## 1. Core idea / Idea central

**criteria** stores *how humans decide*, not what an AI thinks.

The atomic unit is the **Decision Case**: a real decision, seen through the
**lenses** (points of view) a human actually considered, with the **weight**
each lens had, the decision taken, the residual **doubt**, the **expectation**
of what would happen, and — later — the real **outcome**.

An engine built on this format does **not** think. It *retrieves, aggregates
and returns* what humans poured into it, always with provenance.

**ES:** La unidad atómica es el **Caso de Decisión**: una decisión real, vista a
través de las **lentes** (puntos de vista) que un humano consideró, con el
**peso** de cada una, la decisión tomada, la **duda** residual, la
**expectativa** y — después — el **resultado** real. El motor no piensa:
recupera, agrega y devuelve lo que los humanos vertieron, siempre con
procedencia.

## 2. The Decision Case

```jsonc
{
  "id": "case-20260709-a1b2c3",          // unique, generated
  "situation": "Should I refactor or just deliver this module?",
  "context": {
    "domain": "software-development",     // kebab-case domain
    "tags": ["react", "tech-debt", "deadline"]
  },
  "lenses": [
    {
      "name": "delivery-time",            // lens id (kebab-case)
      "weight": "high",                   // high | medium | low (declared by the human)
      "reading": "the ticket is due today" // what was seen through this lens
    },
    {
      "name": "project-impact",
      "weight": "high",
      "reading": "module is rarely used, low risk"
    },
    {
      "name": "personal-state",
      "weight": "low",
      "reading": "end of day, tired"
    }
  ],
  "decision": "Do not refactor now; deliver and log tech debt",
  "reason": "cost does not justify benefit given the available time",
  "doubt": "low",                          // low | medium | high (residual doubt)
  "expectation": "no bugs; refactor next sprint",  // temporal data
  "outcome": {
    "status": "pending",                   // pending | good | bad | mixed
    "note": "",
    "recordedAt": null
  },
  "layer": "personal",                     // personal | community
  "author": "domakedev",
  "createdAt": "2026-07-09T15:00:00Z"
}
```

Formal schema: [`case.schema.json`](./case.schema.json).

### Field semantics / Semántica

| Field | Meaning | ES |
|---|---|---|
| `situation` | The decision faced, in plain language | La decisión enfrentada |
| `context.domain` | Knowledge community it belongs to | Comunidad de conocimiento |
| `lenses[]` | Points of view actually considered (outer layers only — no deep inspection) | Puntos de vista considerados (capas externas) |
| `lenses[].weight` | Declared importance of that lens for THIS decision | Peso declarado de la lente |
| `decision` + `reason` | What was decided and why | Qué se decidió y por qué |
| `doubt` | Residual doubt after deciding — gold for review | Duda residual |
| `expectation` | What the human expected to happen (temporal) | Lo que se esperaba |
| `outcome` | What actually happened — closes the loop | Lo que realmente pasó |
| `layer` | `community` (shared) or `personal` (private, local-first) | Capa |

## 3. Lenses / Lentes

A **lens** is a named point of view (e.g. `delivery-time`,
`stakeholder-relationship`, `patient-safety`). Each domain keeps a catalog
(`lenses.json`) describing known lenses.

**Weights are NOT configured — they EMERGE.** A lens gains weight in a domain
when it repeatedly appears with high declared weight in cases whose outcome was
good. The engine computes this *emergent salience* from accumulated cases.

**ES:** Los pesos no se configuran: **emergen** de los casos acumulados y de
sus resultados. Así el criterio se entrena con humanos reales, no con opiniones
abstractas.

Formal schema: [`lens.schema.json`](./lens.schema.json).

## 4. Layers / Capas

See [`layers.md`](./layers.md). Summary:

```
community criterion  (shared, versioned, forkable)
        │  inherit / subscribe
        ▼
personal criterion   (private, local-first, never published by default)
        │
        ▼
effective criterion = community + personal   (personal weighs more)
```

## 5. Engine contract / Contrato del motor

Any implementation (any language) MUST respect:

1. **Never invent judgment.** Answers come only from stored cases. If there is
   no match: say so and ask the human what they would do (cold start = learn).
2. **Always cite provenance.** Which cases, which layer, which outcomes back
   the answer.
3. **Surface warnings.** Similar cases with `outcome: bad` are warnings, not
   suggestions.
4. **Expose residual doubt.** Confidence must be reported (`none | low |
   medium | high`), derived from quantity and quality of matches.
5. **Close the loop.** Provide a way to record outcomes against expectations.
6. **AI is optional plumbing.** An AI may structure raw input (text, audio,
   photo) into a Decision Case via the `Structurer` interface — but the same
   thing can be done with a form. The engine must work with zero AI.

**ES:** El motor nunca inventa juicio, siempre cita procedencia, muestra
advertencias, expone la confianza, cierra el ciclo con resultados, y la IA es
plomería opcional: puede estructurar el input, jamás sustituir el criterio.

## 6. Storage / Almacenamiento

Reference layout (file-based, local-first, git-friendly):

```
data/
├── community/
│   └── <domain>/
│       ├── lenses.json        # lens catalog for the domain
│       └── case-*.json        # one file per decision case
└── personal/                  # PRIVATE — gitignored by default
    └── <domain>/
        └── case-*.json
```

Any other backend (SQLite, IndexedDB, a server) is valid if it preserves the
format and the layer separation.
