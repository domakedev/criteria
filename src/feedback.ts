/**
 * Feedback: closes the loop. A criterion without outcomes is just opinion;
 * expectation vs result is what turns stored decisions into track record.
 */
import type { FileStore } from './store.js';
import type {
  DecisionCase,
  OutcomeStatus,
  TrackRecord,
} from './types.js';
import type { CaseFilter } from './store.js';

export interface OutcomeReport {
  updated: DecisionCase;
  /** Echoed back so the human can compare expectation vs reality. */
  expectation?: string;
}

export function recordOutcome(
  store: FileStore,
  caseId: string,
  status: Exclude<OutcomeStatus, 'pending'>,
  note?: string,
  now: Date = new Date(),
): OutcomeReport {
  const found = store.load(caseId);
  if (!found) {
    throw new Error(`Case not found: ${caseId}`);
  }
  const updated: DecisionCase = {
    ...found,
    outcome: {
      status,
      ...(note ? { note } : {}),
      recordedAt: now.toISOString(),
    },
  };
  store.update(updated);
  return {
    updated,
    ...(found.expectation ? { expectation: found.expectation } : {}),
  };
}

export function trackRecord(store: FileStore, filter: CaseFilter = {}): TrackRecord {
  const cases = store.listCases(filter);
  const counts = { good: 0, bad: 0, mixed: 0, pending: 0 };
  for (const c of cases) counts[c.outcome.status] += 1;
  const resolved = counts.good + counts.bad + counts.mixed;
  return {
    total: cases.length,
    ...counts,
    reliability: resolved === 0 ? null : Number((counts.good / resolved).toFixed(3)),
  };
}
