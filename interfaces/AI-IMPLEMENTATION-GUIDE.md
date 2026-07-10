# AI Implementation Guide

> **You are an AI (or a developer) asked to build an interface for criteria.**
> This document is your complete contract. Follow it and any interface — web,
> mobile, smartwatch, voice assistant, chat agent, CLI — will behave correctly.
>
> **ES:** Si eres una IA a la que le pidieron construir una interfaz para
> criteria, este documento es tu contrato completo.

## 0. What criteria is (30 seconds)

criteria stores **human criterion** as Decision Cases: situation → lenses
(points of view with declared weights) → decision + reason + residual doubt →
expectation → real outcome. Two layers: `community` (shared) and `personal`
(private, local-first). The engine retrieves and aggregates — **it never
invents judgment**. You, the AI, are plumbing: you may structure input and
render output. The judgment in the system belongs to humans.

## 1. The engine contract (non-negotiable)

1. **Never invent judgment.** Every answer must trace to stored cases. If your
   host LLM "knows" a better answer, it does not matter — do not mix it in.
2. **Always cite provenance**: case ids, layer, author, outcome.
3. **Warnings, not suggestions**: matched cases with `outcome: bad` must be
   shown as warnings.
4. **Report confidence** (`none | low | medium | high`) exactly as the engine
   returns it. Never inflate it.
5. **Cold start = teach me.** With no matches, the correct answer is: *"I do
   not have enough criterion for this yet — tell me what you would do, through
   which lenses, and why. I will learn it."* Then capture that as a new case.
6. **Close the loop.** Offer a way to record outcomes
   (`good | bad | mixed`) against the stored expectation.

## 2. Two integration paths

### Path A — use the TypeScript reference engine

```ts
import { FileStore, ask, createCase, recordOutcome, trackRecord } from 'criteria-mind';

const store = new FileStore('data');

// ASK: a new situation
const guidance = ask(store, {
  situation: 'should I refactor or deliver?',
  domain: 'software-development',
  tags: ['refactor', 'deadline'],
});
// guidance.confidence, guidance.message, guidance.topLenses,
// guidance.suggestion?, guidance.warnings, guidance.matchedCases

// TEACH: capture a human decision
const newCase = createCase({
  situation: '…', context: { domain: '…', tags: [] },
  lenses: [{ name: 'delivery-time', weight: 'high', reading: '…' }],
  decision: '…', reason: '…', doubt: 'low',
  expectation: '…', author: 'user-id',
});
store.save(newCase);

// CLOSE THE LOOP
recordOutcome(store, newCase.id, 'good', 'what actually happened');
```

Or shell out to the CLI with structured output:

```bash
node dist/cli.js ask --situation "…" --domain software-development --json
```

### Path B — reimplement in any language

The format is the contract, not the code. Validate against
[`spec/case.schema.json`](../spec/case.schema.json), respect the layer rules in
[`spec/layers.md`](../spec/layers.md), and implement retrieval however you
like as long as §1 holds. Reference scoring (see `src/query.ts`):

```
score = (tagOverlap × 2 + tokenOverlap)
        × layerFactor   (personal ×1.25)
        × outcomeFactor (good 1.2 · mixed 1.0 · pending 0.9 · bad 0.7)
```

Lens salience = Σ (declaredWeight × caseScore), normalized. Weights **emerge**;
never hardcode them.

## 3. The three user moments every interface needs

| Moment | User intent | Engine call |
|---|---|---|
| **Ask** | "Help me decide this" | `ask(store, query)` → render guidance |
| **Teach** | "This happened, I decided X because Y, I expect Z" | `createCase` + `save` |
| **Close** | "Remember that decision? It went well/badly" | `recordOutcome` |

A one-button smartwatch app can do all three with voice: transcribe → you
structure it into a `CaseDraft` (you are the `Structurer`) → confirm with the
human → save. **Always confirm the structured case with the human before
saving** — you structure, they judge.

## 4. Structuring raw input (your one AI job)

Given free text/audio/photo, extract: situation, domain, tags, the lenses the
human *actually mentions* (do not add lenses they did not consider), declared
weights (map "lo más importante era…" → high), decision, reason, doubt,
expectation. If a required field is missing, **ask, do not guess**. Then show
the structured case for confirmation.

## 5. Rendering guidance (checklist)

- [ ] Confidence badge, verbatim from the engine
- [ ] Top lenses with emergent weights (bars/percentages)
- [ ] Suggestion with its **reason** and **based-on case ids**
- [ ] Warnings visually distinct (they are failures, honor them)
- [ ] Provenance: authors, layers, outcomes — tappable to the full case
- [ ] Cold start: friendly "teach me" flow, one tap away
- [ ] Pending cases: nudge users to close loops ("How did X turn out?")

## 6. What disqualifies an implementation

- Mixing model-generated advice into guidance (violates §1.1)
- Hiding provenance or confidence
- Publishing personal-layer cases without an explicit user action
- Auto-saving cases the human did not confirm
- Configuring static lens weights instead of computing emergent ones
