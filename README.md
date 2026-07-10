# criteria

*[Versión en español →](./README.es.md)*

**An open format and reference engine for human criterion.**
Capture how humans actually decide, layer it (community ↔ personal), query it
from any interface, and close the loop with real outcomes.

> Read the [MANIFESTO](./MANIFESTO.md). The short version: **human-first,
> AI-optional** — delete the AI and criteria still works.

## The idea

A human with criterion does not scan everything they know. Facing a decision,
they glance through a few **lenses** (points of view: time, impact,
relationships, risk, their own tiredness…), pick the ones that matter, weigh
them, decide — and keep a small residual **doubt**. Later, reality grades the
decision.

**criteria** stores exactly that as a **Decision Case**:

```
situation → lenses (weight + reading) → decision + reason + doubt
         → expectation → outcome (the closed loop)
```

The engine never thinks. It **retrieves and aggregates** cases humans
contributed, always with provenance. Weights are not configured — they
**emerge** from decisions that turned out well.

## Start here — the app

The simplest way in: an app to write down your decisions and learn from them.
No jargon, no cloud. Your experiences are saved as files on your machine.

```bash
npm install
npm run build
node dist/cli.js app          # opens http://localhost:4173 in your browser
```

You write what happened, what you decided and what you weighed; it gets saved.
When you know how it turned out, you tell it, and the app learns from your own
track record.

The "ask" tab searches your experiences by **meaning**, using local AI
(transformers.js): a one-time model download (~100MB), then fully offline. The
AI only *finds* your experiences — it never decides for you. If unavailable,
the word search (synonyms, plurals, typo tolerance) answers instantly instead.

## Advanced use (CLI)

```bash
# Ask your own criterion (empty until you add cases — cold start asks you to teach it)
node dist/cli.js ask --situation "should I refactor this module or deliver the ticket?" \
  --domain software-development --tags refactor,deadline

# Teach it a decision of your own (goes to your PRIVATE personal layer)
node dist/cli.js add \
  --situation "adopt framework X or stay with vanilla?" \
  --domain software-development --tags framework,adopt \
  --lens "maintenance-cost:high:framework updates break yearly" \
  --lens "team-capacity:medium:only I know framework X" \
  --decision "stay with vanilla for now" \
  --reason "bus factor of one is too expensive" \
  --doubt medium \
  --expect "we revisit in two quarters"

# Later, close the loop
node dist/cli.js outcome <case-id> --status good --note "vanilla was enough"

# See which lenses have earned weight in a domain
node dist/cli.js lenses --domain software-development

# Track record of the stored criterion
node dist/cli.js stats

# SEE your criterion — Obsidian-style interactive graph, one offline file
node dist/cli.js graph --domain software-development
# → writes criteria-graph.html (self-contained: open it with a double click)
# → or export the open graph format for any other tool: criteria graph --json
```

Agents and other programs can consume structured output with
`ask --json`.

## Layout

```
spec/         The open format (JSON Schemas + layer rules) — the real product
src/          Reference engine in TypeScript (zero runtime dependencies)
data/         community/ (shared, seeded) · personal/ (private, gitignored)
interfaces/   How ANY AI or developer builds an interface on top
docs/         Research and background
```

## Build an interface for it

Web, mobile, watch, voice, agent — anything. The engine contract lives in
[spec/SPEC.md §5](./spec/SPEC.md) and the step-by-step guide for AIs in
[interfaces/AI-IMPLEMENTATION-GUIDE.md](./interfaces/AI-IMPLEMENTATION-GUIDE.md).
The six rules, in short:

1. Never invent judgment — answer only from stored cases.
2. Always cite provenance.
3. Similar cases that went bad are **warnings**, not suggestions.
4. Report confidence; cold start = *"teach me."*
5. Provide a way to record outcomes.
6. AI may structure input; it may never replace the human's judgment.

## Contributing criterion

A domain is a folder under `data/community/`. Add cases via PR — every case
carries its author. Personal cases are published only through an explicit
`criteria promote <id>`.

## License

[MIT](./LICENSE) — free to use, connect, store, fork.
