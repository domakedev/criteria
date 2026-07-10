# criteria — Graph Specification v0.1

> The criterion graph is a **derived view**: a deterministic projection of the
> Decision Cases. It is never stored — same cases in, same graph out. The
> *derivation* is the contract; the *visualization* is free.
>
> **ES:** El grafo se deriva, no se guarda. Mismos casos → mismo grafo. La
> derivación es el contrato; la visualización es libre.

## 1. Nodes

| Type | One per | Required fields | Visual convention (suggested) |
|---|---|---|---|
| `case` | Decision Case included in the projection | `id` (`case:<caseId>`), `label`, `outcome`, `layer` | color = outcome · dashed ring = personal layer |
| `lens` | distinct lens used by ≥1 included case | `id` (`lens:<name>`), `label`, `salience`, `appearances` | size grows with emergent salience |

`salience` is the emergent weight of the lens across the included cases,
normalized to `0..1`:

```
salience(lens) = Σ over cases using it: declaredWeightValue × outcomeFactor
                 ÷ max over all lenses
declaredWeightValue: high=3 · medium=2 · low=1
outcomeFactor:       good=1.2 · mixed=1.0 · pending=0.9 · bad=0.7
```

## 2. Edges (derivation rules)

**R1 — looked-through** (case → lens). One edge per lens reading in each case.
Carries the declared `weight` (`high | medium | low`).

**R2 — similar** (case ↔ case, undirected, emitted once with
`source.id < target.id` lexicographically). Emitted when the symmetric
similarity score reaches the threshold:

```
sim(a, b) = 2 × |sharedTags| + |sharedTokens|
sharedTokens: tokenized situation + decision + tags (lowercased,
              stopwords removed, length > 2 — same tokenizer as the engine)
threshold: minSimilarity (default 3)
```

Carries `score` (the sim value).

**R3 — tagged** (case → tag) — OPTIONAL detail level. Implementations MAY
emit tag nodes/edges; if they do, tag node ids are `tag:<tag>`.

## 3. Export format

Formal schema: [`graph.schema.json`](./graph.schema.json).

```jsonc
{
  "version": "0.1",
  "derivedFrom": {
    "domain": "software-development",   // null = all domains
    "cases": 6,
    "generatedAt": "2026-07-09T20:00:00Z"
  },
  "nodes": [
    { "id": "lens:delivery-time", "type": "lens", "label": "delivery-time",
      "salience": 1, "appearances": 4, "description": "Deadlines, tickets…" },
    { "id": "case:case-seed-rush-rewrite", "type": "case",
      "label": "The legacy payment module is ugly…", "outcome": "bad",
      "layer": "community", "case": { /* full DecisionCase, for detail views */ } }
  ],
  "edges": [
    { "source": "case:case-seed-rush-rewrite", "target": "lens:delivery-time",
      "type": "looked-through", "weight": "high" },
    { "source": "case:case-seed-refactor-deliver",
      "target": "case:case-seed-rush-rewrite", "type": "similar", "score": 5 }
  ]
}
```

Embedding the full `case` payload in case nodes is RECOMMENDED (enables
offline detail views) but MAY be omitted with `--no-payload` style options for
privacy-sensitive exports.

## 4. Conformance

An implementation conforms if, given the same set of Decision Cases and the
same options (`domain`, `minSimilarity`), it produces the same node set, edge
set, weights and salience values (float tolerance 0.001). Node/edge **order**
in the arrays is not significant; implementations SHOULD sort by `id` for
reproducible diffs.

## 5. Freedom of visualization / Libertad de visualización

Anything that reads this format is a valid viewer: a canvas force-directed
viewer (the reference), D3, Cytoscape, Gephi (via converter), a printed
poster, or a Markdown exporter that turns cases into `[[wikilinked]]` notes so
Obsidian itself renders your criterion. The graph travels; the tool is free.
