#!/usr/bin/env node
/**
 * criteria CLI — the first reference interface.
 * Any other interface (web, mobile, watch, agent) follows the same engine
 * contract: see /interfaces/AI-IMPLEMENTATION-GUIDE.md
 */
import { parseArgs } from 'node:util';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createCase } from './ingest.js';
import { FileStore } from './store.js';
import { domainLensSalience } from './query.js';
import { askSmart } from './smart.js';
import { recordOutcome, trackRecord } from './feedback.js';
import { deriveGraph } from './graph.js';
import { renderViewerHtml } from './viewer.js';
import { startApp } from './server.js';
import type { CaseDraft, Doubt, Layer, LensReading, OutcomeStatus, Weight } from './types.js';

const HELP = `criteria — human criterion, portable and free

Usage:
  criteria app      [--port 4173]       # open the simple app in your browser
  criteria add      --situation "..." --domain <d> --lens "name:weight:reading" [...]
                    --decision "..." --reason "..." [--doubt low|medium|high]
                    [--tags a,b] [--expect "..."] [--layer personal|community] [--author name]
  criteria ask      --situation "..." [--domain <d>] [--tags a,b]
  criteria outcome  <case-id> --status good|bad|mixed [--note "..."]
  criteria list     [--domain <d>] [--layer personal|community]
  criteria lenses   --domain <d>        # emergent lens weights for a domain
  criteria stats    [--domain <d>]      # track record of stored criterion
  criteria promote  <case-id>           # explicitly publish a personal case
  criteria graph    [--domain <d>] [--json] [--out file.html] [--no-payload]
                                        # derive the criterion graph (spec/graph.md):
                                        # --json prints the open graph format,
                                        # default writes a self-contained HTML viewer

Options:
  --root <dir>   data directory (default: $CRITERIA_HOME or ./data)

ES: add = registrar una decisión · ask = consultar el criterio ·
    outcome = cerrar el ciclo con el resultado real · lenses = pesos emergentes
`;

function getStore(root: string | undefined): FileStore {
  return new FileStore(root ?? process.env.CRITERIA_HOME ?? 'data');
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function parseLens(raw: string): LensReading {
  const [name, weight, ...rest] = raw.split(':');
  const reading = rest.join(':');
  if (!name || !weight || !reading) {
    fail(`invalid --lens "${raw}" — expected "name:weight:reading" (e.g. "delivery-time:high:ticket due today")`);
  }
  if (!['high', 'medium', 'low'].includes(weight)) {
    fail(`invalid lens weight "${weight}" — must be high | medium | low`);
  }
  return { name, weight: weight as Weight, reading };
}

function cmdAdd(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    options: {
      situation: { type: 'string' },
      domain: { type: 'string' },
      tags: { type: 'string', default: '' },
      lens: { type: 'string', multiple: true },
      decision: { type: 'string' },
      reason: { type: 'string' },
      doubt: { type: 'string', default: 'medium' },
      expect: { type: 'string' },
      layer: { type: 'string', default: 'personal' },
      author: { type: 'string' },
      root: { type: 'string' },
    },
  });
  const draft: CaseDraft = {
    situation: values.situation ?? '',
    context: {
      domain: values.domain ?? '',
      tags: (values.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean),
    },
    lenses: (values.lens ?? []).map(parseLens),
    decision: values.decision ?? '',
    reason: values.reason ?? '',
    doubt: values.doubt as Doubt,
    ...(values.expect ? { expectation: values.expect } : {}),
    layer: values.layer as Layer,
    author: values.author ?? process.env.USERNAME ?? process.env.USER ?? 'anonymous',
  };
  const store = getStore(values.root);
  const decisionCase = createCase(draft);
  const file = store.save(decisionCase);
  console.log(`Learned: ${decisionCase.id}  (layer: ${decisionCase.layer})`);
  console.log(`  → ${file}`);
  if (decisionCase.expectation) {
    console.log(`  Expectation recorded. Close the loop later with:`);
    console.log(`  criteria outcome ${decisionCase.id} --status good|bad|mixed`);
  }
}

async function cmdAsk(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      situation: { type: 'string' },
      domain: { type: 'string' },
      tags: { type: 'string', default: '' },
      root: { type: 'string' },
      json: { type: 'boolean', default: false },
      'no-ai': { type: 'boolean', default: false },
    },
  });
  if (!values.situation) fail('--situation is required');
  const store = getStore(values.root);
  const guidance = await askSmart(
    store,
    {
      situation: values.situation,
      ...(values.domain ? { domain: values.domain } : {}),
      tags: (values.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean),
    },
    values['no-ai'] ? null : undefined,
  );

  if (values.json) {
    console.log(JSON.stringify(guidance, null, 2));
    return;
  }

  console.log(`confidence: ${guidance.confidence} · search: ${guidance.mode}`);
  console.log(`\n${guidance.message}\n`);
  if (guidance.topLenses.length > 0) {
    console.log('Lenses that mattered (emergent weights):');
    for (const lens of guidance.topLenses) {
      const bar = '#'.repeat(Math.max(1, Math.round(lens.score * 20)));
      console.log(`  ${lens.name.padEnd(28)} ${bar} ${lens.score} (${lens.appearances}x)`);
    }
  }
  if (guidance.suggestion) {
    console.log(`\nBest-backed decision:`);
    console.log(`  "${guidance.suggestion.decision}"`);
    console.log(`  why: ${guidance.suggestion.reason}`);
    console.log(`  based on: ${guidance.suggestion.basedOn.join(', ')}`);
  }
  if (guidance.warnings.length > 0) {
    console.log(`\nWarnings (similar cases that went BAD):`);
    for (const warning of guidance.warnings) {
      console.log(`  [${warning.caseId}] "${warning.decision}" → ${warning.note}`);
    }
  }
  if (guidance.matchedCases.length > 0) {
    console.log(`\nProvenance:`);
    for (const matched of guidance.matchedCases) {
      console.log(
        `  ${matched.id}  score=${matched.score}  outcome=${matched.outcome}  ` +
          `layer=${matched.layer}  by=${matched.author}`,
      );
    }
  }
}

function cmdOutcome(argv: string[]): void {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      status: { type: 'string' },
      note: { type: 'string' },
      root: { type: 'string' },
    },
    allowPositionals: true,
  });
  const id = positionals[0];
  if (!id) fail('case id is required: criteria outcome <case-id> --status good');
  if (!values.status || !['good', 'bad', 'mixed'].includes(values.status)) {
    fail('--status must be good | bad | mixed');
  }
  const store = getStore(values.root);
  const report = recordOutcome(
    store,
    id,
    values.status as Exclude<OutcomeStatus, 'pending'>,
    values.note,
  );
  console.log(`Outcome recorded for ${id}: ${values.status}`);
  if (report.expectation) {
    console.log(`  Expectation was: "${report.expectation}"`);
    console.log(`  Reality: ${values.note ?? values.status}`);
  }
}

function cmdList(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    options: {
      domain: { type: 'string' },
      layer: { type: 'string' },
      root: { type: 'string' },
    },
  });
  const store = getStore(values.root);
  const cases = store.listCases({
    ...(values.domain ? { domain: values.domain } : {}),
    ...(values.layer ? { layer: values.layer as Layer } : {}),
  });
  if (cases.length === 0) {
    console.log('No cases yet. Teach me one with: criteria add …');
    return;
  }
  for (const c of cases) {
    console.log(
      `${c.id}  [${c.layer}/${c.context.domain}]  outcome=${c.outcome.status}` +
        `\n  ${c.situation}\n  → ${c.decision}`,
    );
  }
  console.log(`\n${cases.length} case(s).`);
}

function cmdLenses(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    options: { domain: { type: 'string' }, root: { type: 'string' } },
  });
  if (!values.domain) fail('--domain is required');
  const store = getStore(values.root);
  const salience = domainLensSalience(store, values.domain);
  const catalog = new Map(
    store.loadLensCatalog(values.domain).map((l) => [l.name, l.description]),
  );
  if (salience.length === 0) {
    console.log(`No lenses have emerged yet in "${values.domain}".`);
    return;
  }
  console.log(`Emergent lens weights in "${values.domain}" (from real cases):\n`);
  for (const lens of salience) {
    const bar = '#'.repeat(Math.max(1, Math.round(lens.score * 20)));
    console.log(`  ${lens.name.padEnd(28)} ${bar} ${lens.score} (${lens.appearances}x)`);
    const description = catalog.get(lens.name);
    if (description) console.log(`  ${''.padEnd(28)} ${description}`);
  }
}

function cmdStats(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    options: { domain: { type: 'string' }, root: { type: 'string' } },
  });
  const store = getStore(values.root);
  const record = trackRecord(store, values.domain ? { domain: values.domain } : {});
  console.log(`Track record${values.domain ? ` — ${values.domain}` : ''}:`);
  console.log(`  total: ${record.total}`);
  console.log(`  good: ${record.good} · bad: ${record.bad} · mixed: ${record.mixed} · pending: ${record.pending}`);
  console.log(
    record.reliability === null
      ? '  reliability: — (no outcomes recorded yet — close some loops!)'
      : `  reliability: ${(record.reliability * 100).toFixed(1)}% of resolved decisions turned out good`,
  );
}

function cmdPromote(argv: string[]): void {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { root: { type: 'string' } },
    allowPositionals: true,
  });
  const id = positionals[0];
  if (!id) fail('case id is required: criteria promote <case-id>');
  const store = getStore(values.root);
  const promoted = store.promote(id);
  console.log(`Published to community layer: ${promoted.id} (${promoted.context.domain})`);
  console.log('Remember: publishing personal criterion is a deliberate act. It is now shareable.');
}

function cmdGraph(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    options: {
      domain: { type: 'string' },
      json: { type: 'boolean', default: false },
      out: { type: 'string' },
      'no-payload': { type: 'boolean', default: false },
      'min-similarity': { type: 'string' },
      root: { type: 'string' },
    },
  });
  const store = getStore(values.root);
  const graph = deriveGraph(store, {
    ...(values.domain ? { domain: values.domain } : {}),
    includePayload: !values['no-payload'],
    ...(values['min-similarity']
      ? { minSimilarity: Number(values['min-similarity']) }
      : {}),
  });
  if (values.json) {
    console.log(JSON.stringify(graph, null, 2));
    return;
  }
  if (graph.derivedFrom.cases === 0) {
    fail('no cases to graph yet — teach some criterion first: criteria add …');
  }
  const file = resolve(values.out ?? 'criteria-graph.html');
  writeFileSync(file, renderViewerHtml(graph), 'utf8');
  const lensCount = graph.nodes.filter((n) => n.type === 'lens').length;
  console.log(`Graph derived: ${graph.derivedFrom.cases} cases · ${lensCount} lenses · ${graph.edges.length} edges`);
  console.log(`Viewer written (self-contained, works offline):`);
  console.log(`  ${file}`);
  console.log(`Open it with a double click, or share it — it is just a file.`);
}

function cmdApp(argv: string[]): void {
  const { values } = parseArgs({
    args: argv,
    options: { port: { type: 'string' }, root: { type: 'string' } },
  });
  const port = Number(values.port ?? process.env.PORT ?? 4173);
  const root = values.root ?? process.env.CRITERIA_HOME ?? 'data';
  startApp(root, port).then((p) => {
    console.log(`criteria app running — open in your browser:`);
    console.log(`  http://localhost:${p}`);
    console.log(`Your experiences are saved to: ${root}/personal/  (they never leave your machine)`);
    console.log(`Press Ctrl+C to stop.`);
  });
}

const [command, ...rest] = process.argv.slice(2);
try {
  switch (command) {
    case 'app': cmdApp(rest); break;
    case 'add': cmdAdd(rest); break;
    case 'ask': cmdAsk(rest).catch((e) => fail(e instanceof Error ? e.message : String(e))); break;
    case 'outcome': cmdOutcome(rest); break;
    case 'list': cmdList(rest); break;
    case 'lenses': cmdLenses(rest); break;
    case 'stats': cmdStats(rest); break;
    case 'promote': cmdPromote(rest); break;
    case 'graph': cmdGraph(rest); break;
    case 'help':
    case '--help':
    case undefined:
      console.log(HELP);
      break;
    default:
      fail(`unknown command "${command}" — run: criteria help`);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
