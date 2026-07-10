/**
 * askSmart — hybrid retrieval: lexical (semantics.ts) + local AI (embeddings.ts).
 *
 * The AI here is a librarian, never a judge: it only helps FIND your own
 * experiences by meaning. What comes back is still 100% human-contributed,
 * with provenance, warnings and confidence — via the same buildGuidance the
 * lexical path uses. If the AI layer is unavailable, this IS the lexical path.
 */
import type { FileStore } from './store.js';
import {
  ask,
  buildGuidance,
  scoreCase,
  OUTCOME_FACTOR,
  PERSONAL_MULTIPLIER,
} from './query.js';
import { cosine, embedCases, getLocalEmbedder, type Embedder } from './embeddings.js';
import type { CriterionQuery, Guidance, MatchedCase } from './types.js';

/** Below this cosine, two texts are considered unrelated (multilingual MiniLM). */
const SEMANTIC_FLOOR = 0.45;
/** Scale that makes a strong semantic match comparable to a few shared words. */
const SEMANTIC_SCALE = 15;

export type AskMode = 'semantic' | 'lexical';

export interface SmartGuidance extends Guidance {
  mode: AskMode;
}

/**
 * @param embedder pass explicitly for tests; omit to auto-load the local
 *                 model; pass null to force the lexical path.
 */
export async function askSmart(
  store: FileStore,
  query: CriterionQuery,
  embedder?: Embedder | null,
): Promise<SmartGuidance> {
  const lexicalOnly = (): SmartGuidance => ({ ...ask(store, query), mode: 'lexical' });

  const resolved = embedder === undefined ? await getLocalEmbedder() : embedder;
  if (!resolved) return lexicalOnly();

  const candidates = store.listCases(query.domain ? { domain: query.domain } : {});
  if (candidates.length === 0) return lexicalOnly();

  try {
    const vectors = await embedCases(resolved, store.root, candidates);
    const [queryVector] = await resolved.embed([query.situation]);
    if (!queryVector) return lexicalOnly();

    const matches: MatchedCase[] = candidates
      .map((c) => {
        const lexical = scoreCase(query, c);
        const vector = vectors.get(c.id);
        const sim = vector ? cosine(queryVector, vector) : 0;
        const layerFactor = c.layer === 'personal' ? PERSONAL_MULTIPLIER : 1;
        const semantic =
          sim >= SEMANTIC_FLOOR
            ? (sim - SEMANTIC_FLOOR) * SEMANTIC_SCALE * layerFactor * OUTCOME_FACTOR[c.outcome.status]
            : 0;
        return { case: c, score: lexical + semantic };
      })
      .filter((m) => m.score > 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    return { ...buildGuidance(matches), mode: 'semantic' };
  } catch {
    return lexicalOnly();
  }
}
