/**
 * Graph derivation — spec/graph.md.
 *
 * The criterion graph is a DERIVED view: a deterministic projection of the
 * Decision Cases. It is never stored. Same cases + same options → same graph.
 */
import type { FileStore } from './store.js';
import { tokenize, OUTCOME_FACTOR, WEIGHT_VALUE } from './query.js';
import type { DecisionCase, Layer, OutcomeStatus, Weight } from './types.js';

export interface GraphNode {
  id: string;
  type: 'case' | 'lens';
  label: string;
  /* case nodes */
  outcome?: OutcomeStatus;
  layer?: Layer;
  case?: DecisionCase;
  /* lens nodes */
  salience?: number;
  appearances?: number;
  description?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: 'looked-through' | 'similar';
  weight?: Weight;
  score?: number;
}

export interface CriterionGraph {
  version: '0.1';
  derivedFrom: {
    domain: string | null;
    cases: number;
    generatedAt: string;
  };
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface DeriveOptions {
  domain?: string;
  /** R2 threshold — see spec/graph.md §2. */
  minSimilarity?: number;
  /** Embed the full DecisionCase in case nodes (default true). */
  includePayload?: boolean;
  now?: Date;
}

function caseTokens(c: DecisionCase): Set<string> {
  return tokenize(`${c.situation} ${c.decision} ${c.context.tags.join(' ')}`);
}

/** R2 similarity: symmetric, pure overlap — sim(a,b) = 2·|sharedTags| + |sharedTokens|. */
export function similarity(a: DecisionCase, b: DecisionCase): number {
  const tagsA = new Set(a.context.tags);
  let sharedTags = 0;
  for (const tag of b.context.tags) if (tagsA.has(tag)) sharedTags++;
  const tokensA = caseTokens(a);
  let sharedTokens = 0;
  for (const token of caseTokens(b)) if (tokensA.has(token)) sharedTokens++;
  return 2 * sharedTags + sharedTokens;
}

function truncate(text: string, max = 64): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function deriveGraph(store: FileStore, options: DeriveOptions = {}): CriterionGraph {
  const { domain, minSimilarity = 3, includePayload = true, now = new Date() } = options;
  const cases = store
    .listCases(domain ? { domain } : {})
    .sort((a, b) => a.id.localeCompare(b.id));

  /* Lens salience — emergent, per spec/graph.md §1 */
  const lensAcc = new Map<string, { score: number; appearances: number }>();
  for (const c of cases) {
    for (const lens of c.lenses) {
      const entry = lensAcc.get(lens.name) ?? { score: 0, appearances: 0 };
      entry.score += WEIGHT_VALUE[lens.weight] * OUTCOME_FACTOR[c.outcome.status];
      entry.appearances += 1;
      lensAcc.set(lens.name, entry);
    }
  }
  const maxScore = Math.max(...[...lensAcc.values()].map((e) => e.score), 1);

  /* Lens descriptions from the catalogs of every involved domain */
  const descriptions = new Map<string, string>();
  const domains = [...new Set(cases.map((c) => c.context.domain))];
  for (const d of domains) {
    for (const def of store.loadLensCatalog(d)) {
      if (!descriptions.has(def.name)) descriptions.set(def.name, def.description);
    }
  }

  const nodes: GraphNode[] = [];
  for (const [name, entry] of lensAcc) {
    nodes.push({
      id: `lens:${name}`,
      type: 'lens',
      label: name,
      salience: Number((entry.score / maxScore).toFixed(3)),
      appearances: entry.appearances,
      ...(descriptions.has(name) ? { description: descriptions.get(name) } : {}),
    });
  }
  for (const c of cases) {
    nodes.push({
      id: `case:${c.id}`,
      type: 'case',
      label: truncate(c.situation),
      outcome: c.outcome.status,
      layer: c.layer,
      ...(includePayload ? { case: c } : {}),
    });
  }
  nodes.sort((a, b) => a.id.localeCompare(b.id));

  const edges: GraphEdge[] = [];
  /* R1 — looked-through */
  for (const c of cases) {
    for (const lens of c.lenses) {
      edges.push({
        source: `case:${c.id}`,
        target: `lens:${lens.name}`,
        type: 'looked-through',
        weight: lens.weight,
      });
    }
  }
  /* R2 — similar (undirected, emitted once, source < target) */
  for (let i = 0; i < cases.length; i++) {
    for (let j = i + 1; j < cases.length; j++) {
      const a = cases[i]!;
      const b = cases[j]!;
      const score = similarity(a, b);
      if (score >= minSimilarity) {
        edges.push({
          source: `case:${a.id}`,
          target: `case:${b.id}`,
          type: 'similar',
          score,
        });
      }
    }
  }
  edges.sort(
    (a, b) =>
      a.source.localeCompare(b.source) ||
      a.target.localeCompare(b.target) ||
      a.type.localeCompare(b.type),
  );

  return {
    version: '0.1',
    derivedFrom: {
      domain: domain ?? null,
      cases: cases.length,
      generatedAt: now.toISOString(),
    },
    nodes,
    edges,
  };
}
