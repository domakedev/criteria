/**
 * criteria — tiny zero-dependency HTTP server for the app.
 *
 * Translates the friendly, plain-language app language into the Decision Case
 * format, and stores everything through the existing FileStore (your files,
 * your machine). No AI, no cloud — the app just processes and remembers.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { FileStore } from './store.js';
import { createCase } from './ingest.js';
import { recordOutcome, trackRecord } from './feedback.js';
import { OUTCOME_FACTOR, WEIGHT_VALUE } from './query.js';
import { askSmart } from './smart.js';
import { getLocalEmbedder, getLocalEmbedderIfReady, embedCases } from './embeddings.js';
import type { Embedder } from './embeddings.js';
import { renderAppHtml } from './webapp.js';
import type { DecisionCase, Doubt, OutcomeStatus, Weight } from './types.js';

const IMPORTANCE_TO_WEIGHT: Record<string, Weight> = { mucho: 'high', algo: 'medium', poco: 'low' };
const WEIGHT_TO_IMPORTANCE: Record<Weight, string> = { high: 'mucho', medium: 'algo', low: 'poco' };
const DOUBT_MAP: Record<string, Doubt> = { no: 'low', 'un-poco': 'medium', si: 'high' };
const RESULT_SET = new Set(['good', 'bad', 'mixed']);

function slug(text: string): string {
  const s = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return s || 'factor';
}

interface AppFactor {
  label: string;
  importance: string;
}

/** App language → Decision Case. This IS the "processing" the user asked for. */
function toCase(store: FileStore, body: Record<string, unknown>): DecisionCase {
  const rawFactors = Array.isArray(body.factors) ? (body.factors as AppFactor[]) : [];
  const lenses = rawFactors
    .filter((f) => f && typeof f.label === 'string' && f.label.trim())
    .map((f) => ({
      name: slug(f.label),
      weight: IMPORTANCE_TO_WEIGHT[f.importance] ?? 'medium',
      reading: f.label.trim(),
    }));
  const draft = {
    situation: String(body.situation ?? ''),
    context: {
      domain: slug(String(body.category ?? 'general')),
      tags: [] as string[],
    },
    lenses,
    decision: String(body.decision ?? ''),
    reason: String(body.reason ?? '').trim() || String(body.decision ?? ''),
    doubt: DOUBT_MAP[String(body.doubt ?? 'un-poco')] ?? 'medium',
    ...(String(body.expectation ?? '').trim() ? { expectation: String(body.expectation).trim() } : {}),
    layer: 'personal' as const,
    author: process.env.CRITERIA_USER ?? process.env.USERNAME ?? process.env.USER ?? 'yo',
  };
  const created = createCase(draft);
  store.save(created);
  return created;
}

/** Decision Case → app language (plain, for the list). */
function toApp(c: DecisionCase) {
  const d = new Date(c.createdAt);
  const date = isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
  return {
    id: c.id,
    situation: c.situation,
    decision: c.decision,
    reason: c.reason,
    expectation: c.expectation ?? '',
    factors: c.lenses.map((l) => ({ label: l.reading, importance: WEIGHT_TO_IMPORTANCE[l.weight] })),
    result: c.outcome.status,
    note: c.outcome.note ?? '',
    category: c.context.domain,
    date,
    createdAt: c.createdAt,
  };
}

function insights(store: FileStore) {
  const cases = store.listCases({ layer: 'personal' });
  const record = trackRecord(store, { layer: 'personal' });
  const acc = new Map<string, { label: string; score: number }>();
  for (const c of cases) {
    for (const lens of c.lenses) {
      const entry = acc.get(lens.name) ?? { label: lens.reading, score: 0 };
      entry.score += WEIGHT_VALUE[lens.weight] * OUTCOME_FACTOR[c.outcome.status];
      acc.set(lens.name, entry);
    }
  }
  const topFactors = [...acc.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((f) => ({ label: f.label }));
  return {
    total: record.total,
    pending: record.pending,
    resolved: record.good + record.bad + record.mixed,
    reliabilityPct: record.reliability === null ? null : Math.round(record.reliability * 100),
    topFactors,
  };
}

/**
 * Ask your own criterion about a new situation, translated to plain language.
 * Pure (no HTTP) so it is unit-testable; pass embedder null in tests to force
 * the lexical path.
 */
export async function askForApp(
  store: FileStore,
  situation: string,
  domain?: string,
  embedder?: Embedder | null,
) {
  /* Never block a question on a model that is still loading: if the AI is not
     ready yet, answer instantly via the lexical path. */
  const effective = embedder === undefined ? getLocalEmbedderIfReady() : embedder;
  const guidance = await askSmart(store, { situation, ...(domain ? { domain } : {}) }, effective);

  const readings = new Map<string, string>();
  for (const c of store.listCases({ layer: 'personal' })) {
    for (const l of c.lenses) if (!readings.has(l.name)) readings.set(l.name, l.reading);
  }
  const label = (name: string) => readings.get(name) ?? name.replace(/-/g, ' ');

  const warnings = guidance.warnings.map((w) => {
    const c = store.load(w.caseId);
    return { situation: c?.situation ?? '', decision: w.decision, note: w.note };
  });

  return {
    confidence: guidance.confidence,
    mode: guidance.mode,
    hasAnswer: guidance.matchedCases.length > 0,
    situation,
    factors: guidance.topLenses.slice(0, 3).map((l) => ({ label: label(l.name) })),
    suggestion: guidance.suggestion
      ? { decision: guidance.suggestion.decision, reason: guidance.suggestion.reason }
      : null,
    warnings,
    similar: guidance.matchedCases.map((m) => ({
      situation: m.situation,
      decision: m.decision,
      result: m.outcome,
    })),
  };
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) reject(new Error('body too large'));
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, payload: unknown): void {
  const text = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(text);
}

export function startApp(root: string, port: number): Promise<number> {
  const store = new FileStore(root);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    try {
      if (req.method === 'GET' && path === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderAppHtml());
        return;
      }
      if (req.method === 'GET' && path === '/api/experiences') {
        const list = store
          .listCases({ layer: 'personal' })
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map(toApp);
        json(res, 200, list);
        return;
      }
      if (req.method === 'GET' && path === '/api/insights') {
        json(res, 200, insights(store));
        return;
      }
      if (req.method === 'POST' && path === '/api/experiences') {
        const body = await readBody(req);
        try {
          json(res, 201, toApp(toCase(store, body)));
        } catch (e) {
          json(res, 400, { error: e instanceof Error ? e.message : 'invalid' });
        }
        return;
      }
      if (req.method === 'POST' && path === '/api/ask') {
        const body = await readBody(req);
        const situation = String(body.situation ?? '').trim();
        if (!situation) {
          json(res, 400, { error: 'situation is required' });
          return;
        }
        const cat = String(body.category ?? '').trim();
        const domain = cat && cat !== 'todas' ? slug(cat) : undefined;
        json(res, 200, await askForApp(store, situation, domain));
        return;
      }
      const outcomeMatch = path.match(/^\/api\/experiences\/([^/]+)\/outcome$/);
      if (req.method === 'POST' && outcomeMatch) {
        const id = decodeURIComponent(outcomeMatch[1]!);
        const body = await readBody(req);
        const result = String(body.result ?? '');
        if (!RESULT_SET.has(result)) {
          json(res, 400, { error: 'result must be good | bad | mixed' });
          return;
        }
        try {
          const report = recordOutcome(
            store,
            id,
            result as Exclude<OutcomeStatus, 'pending'>,
            String(body.note ?? '').trim() || undefined,
          );
          json(res, 200, toApp(report.updated));
        } catch (e) {
          json(res, 404, { error: e instanceof Error ? e.message : 'not found' });
        }
        return;
      }
      json(res, 404, { error: 'not found' });
    } catch (e) {
      json(res, 500, { error: e instanceof Error ? e.message : 'server error' });
    }
  });
  /* Warm up the local AI in the background: first run downloads the model
     (~100MB, one time); afterwards it loads from disk. Questions asked before
     it is ready are answered by the lexical path — the app never waits. */
  void (async () => {
    const embedder = await getLocalEmbedder();
    if (!embedder) {
      console.log('semantic AI: not available — using word search (install @xenova/transformers to enable)');
      return;
    }
    try {
      await embedCases(embedder, root, store.listCases());
      console.log('semantic AI: ready (local model, nothing leaves your machine)');
    } catch {
      console.log('semantic AI: could not warm up — using word search for now');
    }
  })();

  return new Promise((resolve) => {
    server.listen(port, () => resolve(port));
  });
}
