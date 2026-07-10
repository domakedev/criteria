/**
 * Store: file-based, local-first, git-friendly reference backend.
 *
 * Layout:
 *   <root>/community/<domain>/case-*.json + lenses.json
 *   <root>/personal/<domain>/case-*.json          (private by default)
 *
 * Any other backend is valid if it preserves the format and the layers.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type {
  DecisionCase,
  Layer,
  LensCatalog,
  LensDefinition,
} from './types.js';

const LAYERS: Layer[] = ['community', 'personal'];

export interface CaseFilter {
  domain?: string;
  layer?: Layer;
  tag?: string;
}

export class FileStore {
  constructor(readonly root: string) {}

  private dirFor(layer: Layer, domain: string): string {
    return join(this.root, layer, domain);
  }

  /** Persists a case as one JSON file. Returns the file path. */
  save(decisionCase: DecisionCase): string {
    const dir = this.dirFor(decisionCase.layer, decisionCase.context.domain);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${decisionCase.id}.json`);
    writeFileSync(file, JSON.stringify(decisionCase, null, 2) + '\n', 'utf8');
    return file;
  }

  /** Finds a case by id across both layers. */
  load(id: string): DecisionCase | undefined {
    return this.listCases().find((c) => c.id === id);
  }

  /** Overwrites an existing case (same id, layer and domain). */
  update(decisionCase: DecisionCase): string {
    const file = join(
      this.dirFor(decisionCase.layer, decisionCase.context.domain),
      `${decisionCase.id}.json`,
    );
    if (!existsSync(file)) {
      throw new Error(`Case not found on disk: ${decisionCase.id}`);
    }
    writeFileSync(file, JSON.stringify(decisionCase, null, 2) + '\n', 'utf8');
    return file;
  }

  listDomains(): string[] {
    const domains = new Set<string>();
    for (const layer of LAYERS) {
      const dir = join(this.root, layer);
      if (!existsSync(dir)) continue;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) domains.add(entry.name);
      }
    }
    return [...domains].sort();
  }

  listCases(filter: CaseFilter = {}): DecisionCase[] {
    const cases: DecisionCase[] = [];
    const layers = filter.layer ? [filter.layer] : LAYERS;
    for (const layer of layers) {
      const layerDir = join(this.root, layer);
      if (!existsSync(layerDir)) continue;
      const domains = filter.domain
        ? [filter.domain]
        : readdirSync(layerDir, { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .map((e) => e.name);
      for (const domain of domains) {
        const dir = join(layerDir, domain);
        if (!existsSync(dir)) continue;
        for (const file of readdirSync(dir)) {
          if (!file.startsWith('case-') || !file.endsWith('.json')) continue;
          const parsed = JSON.parse(
            readFileSync(join(dir, file), 'utf8'),
          ) as DecisionCase;
          if (filter.tag && !parsed.context.tags.includes(filter.tag)) continue;
          cases.push(parsed);
        }
      }
    }
    return cases;
  }

  /** Lens catalog lives in the community layer of each domain. */
  loadLensCatalog(domain: string): LensDefinition[] {
    const file = join(this.dirFor('community', domain), 'lenses.json');
    if (!existsSync(file)) return [];
    const catalog = JSON.parse(readFileSync(file, 'utf8')) as LensCatalog;
    return catalog.lenses ?? [];
  }

  saveLensCatalog(catalog: LensCatalog): string {
    const dir = this.dirFor('community', catalog.domain);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'lenses.json');
    writeFileSync(file, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
    return file;
  }

  /**
   * Promote a personal case to the community layer (explicit, deliberate act —
   * personal criterion is never published implicitly).
   */
  promote(id: string): DecisionCase {
    const found = this.load(id);
    if (!found) throw new Error(`Case not found: ${id}`);
    if (found.layer === 'community') return found;
    const promoted: DecisionCase = { ...found, layer: 'community' };
    this.save(promoted);
    return promoted;
  }
}
