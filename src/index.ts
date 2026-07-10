/**
 * criteria — an open format and reference library for human criterion.
 *
 * Human-first, AI-optional: the engine retrieves, aggregates and returns
 * criterion contributed by humans. It never invents judgment.
 *
 * Spec: /spec/SPEC.md · Engine contract: /spec/SPEC.md §5
 */
export * from './types.js';
export { validateDraft, createCase, generateCaseId } from './ingest.js';
export { FileStore, type CaseFilter } from './store.js';
export { ask, scoreCase, lensSalience, domainLensSalience, tokenize } from './query.js';
export { recordOutcome, trackRecord, type OutcomeReport } from './feedback.js';
export {
  deriveGraph,
  similarity,
  type CriterionGraph,
  type GraphNode,
  type GraphEdge,
  type DeriveOptions,
} from './graph.js';
export { renderViewerHtml } from './viewer.js';
export { renderAppHtml } from './webapp.js';
export { startApp } from './server.js';
export * as semantics from './semantics.js';
export { getLocalEmbedder, cosine, embedCases, type Embedder } from './embeddings.js';
export { askSmart, type SmartGuidance, type AskMode } from './smart.js';
