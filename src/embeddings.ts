/**
 * Embeddings — optional LOCAL AI understanding for search.
 *
 * Uses transformers.js to run a multilingual sentence-embedding model on YOUR
 * machine. The model downloads once (~100MB) and then works offline forever.
 * Nothing you write ever leaves your computer.
 *
 * This layer is strictly optional plumbing (AI-as-librarian): if the library
 * is missing, the model can't download, or anything fails, callers fall back
 * to the lexical search in semantics.ts. The engine never depends on it.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DecisionCase } from './types.js';

const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

export interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
}

let loader: Promise<Embedder | null> | null = null;
let readyEmbedder: Embedder | null | undefined;

/**
 * Non-blocking: returns the local embedder ONLY if it is already loaded;
 * otherwise kicks off loading in the background and returns null so callers
 * (like the app server) answer instantly via the lexical path meanwhile.
 */
export function getLocalEmbedderIfReady(): Embedder | null {
  if (readyEmbedder !== undefined) return readyEmbedder;
  void getLocalEmbedder();
  return null;
}

/**
 * Loads the local embedding model. Returns null (never throws) when the
 * optional dependency is not installed or the model cannot be loaded.
 */
export function getLocalEmbedder(): Promise<Embedder | null> {
  if (!loader) {
    loader = (async () => {
      try {
        const lib = await import('@xenova/transformers');
        const pipe = await lib.pipeline('feature-extraction', MODEL, { quantized: true });
        return {
          async embed(texts: string[]): Promise<number[][]> {
            const out = await pipe(texts, { pooling: 'mean', normalize: true });
            const [rows, dims] = out.dims as [number, number];
            const data = out.data as Float32Array;
            const vectors: number[][] = [];
            for (let i = 0; i < rows; i++) {
              vectors.push(Array.from(data.slice(i * dims, (i + 1) * dims)));
            }
            return vectors;
          },
        };
      } catch {
        return null;
      }
    })().then((embedder) => {
      readyEmbedder = embedder;
      return embedder;
    });
  }
  return loader;
}

/** Cosine similarity. Vectors from the model are normalized → dot product. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) dot += a[i]! * b[i]!;
  return dot;
}

/** The text a case "means": situation + decision + reason + factors. */
export function caseText(c: DecisionCase): string {
  return [c.situation, c.decision, c.reason, ...c.lenses.map((l) => l.reading)].join('. ');
}

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return String(h);
}

interface CacheEntry {
  hash: string;
  vector: number[];
}

/**
 * Embeds cases with a disk cache (<root>/.embeddings-cache.json) so each case
 * is only embedded once — later questions are instant.
 */
export async function embedCases(
  embedder: Embedder,
  root: string,
  cases: DecisionCase[],
): Promise<Map<string, number[]>> {
  const file = join(root, '.embeddings-cache.json');
  let cache: Record<string, CacheEntry> = {};
  if (existsSync(file)) {
    try {
      cache = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      cache = {};
    }
  }
  const result = new Map<string, number[]>();
  const missing: DecisionCase[] = [];
  for (const c of cases) {
    const text = caseText(c);
    const entry = cache[c.id];
    if (entry && entry.hash === hash(text)) result.set(c.id, entry.vector);
    else missing.push(c);
  }
  if (missing.length > 0) {
    const vectors = await embedder.embed(missing.map(caseText));
    missing.forEach((c, i) => {
      const vector = vectors[i]!.map((v) => Number(v.toFixed(6)));
      result.set(c.id, vector);
      cache[c.id] = { hash: hash(caseText(c)), vector };
    });
    try {
      writeFileSync(file, JSON.stringify(cache), 'utf8');
    } catch {
      /* cache is best-effort */
    }
  }
  return result;
}
