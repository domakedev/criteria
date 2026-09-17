// El repositorio: el entorno REAL de la mascotita. Lee archivos de GitHub,
// sigue imports (que a veces no resuelven), nota commits nuevos y pone a
// prueba lo que cree buscando la evidencia literal en el archivo. Los 404, los
// imports externos y los archivos que cambian son fallos y sorpresas de
// verdad: de ahí sale una cautela que ningún mundo imaginado enseña igual.
//
// Seguridad: solo dos hosts (api.github.com y raw.githubusercontent.com),
// rutas que DEBEN existir en el árbol cacheado (nada de traversal ni de URLs
// sacadas de archivos o del LLM), cada fetch con timeout y descontando el
// presupuesto del tick ANTES de llamar. El árbol se baja a lo sumo una vez por
// tick (memo por ctx) y a lo sumo una vez al día entre todas las mascotas
// (caché compartida en Firestore).
import type { ConceptDoc, EnvCursor, RepoCursor, RepoTreeCache, RepoTreeEntry } from "../types";
import type { Action, Environment, EnvContext, Outcome } from "./index";
import { BOUNDS, CAPS, cfg } from "../config";
import { pick, round3, shuffle } from "../rng";
import { getRepoTreeCache, saveRepoTreeCache } from "../db";

const API_HOST = "https://api.github.com";
const RAW_HOST = "https://raw.githubusercontent.com";
const USER_AGENT = "criteria-mascotita";
const RETRY_AFTER_MS = 60 * 60_000;
const TREE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const TEXT_EXTENSIONS = [".ts", ".tsx", ".md", ".json", ".css", ".mjs", ".yml", ".yaml", ".txt", ".rules"];
const EXCLUDED = ["node_modules/", "package-lock.json", ".git/", ".next/"];
/** Carpetas que van primero al recortar el árbol a CAPS.repoTree. */
const PRIORITY_DIRS = ["web/", "src/", "docs/", "spec/"];
const MAX_AFFORDANCES = 8;
const MAX_DIR_DEPTH = 3;
const WINDOW_STEP = 500;
const MAX_LINE_CHARS = 300;
const PROBE_WINDOW_CHARS = 800;
const RESOLVE_SUFFIXES = ["", ".ts", ".tsx", "/index.ts", ".js"];
const RELEER_MAX_VISITS = 3;
const VERIFIED_STALE_DAYS = 7;
const ROOT_DIR = ".";

/**
 * Rutas reales del repo que la mascota puede leer aunque GitHub no responda y
 * no haya caché (s = 0 significa "tamaño desconocido").
 */
const KNOWN_PATHS = [
  "README.md",
  "README.es.md",
  "MANIFESTO.md",
  "MANIFESTO.es.md",
  "package.json",
  "docs/criterio-humano.md",
  "spec/SPEC.md",
  "spec/layers.md",
  "spec/graph.md",
  "interfaces/AI-IMPLEMENTATION-GUIDE.md",
  "interfaces/REGISTRY.md",
  "src/query.ts",
  "src/store.ts",
  "src/graph.ts",
  "src/semantics.ts",
  "src/cli.ts",
  "src/ingest.ts",
  "src/types.ts",
  "web/README.md",
  "web/lib/ai.ts",
  "web/lib/admin.ts",
  "web/lib/api.ts",
  "web/lib/engine.ts",
  "web/lib/types.ts",
  "web/lib/semantics.ts",
  "web/app/app/page.tsx",
  "web/app/api/mcp/route.ts",
  "web/app/api/ask/route.ts",
  "web/components/case-form.tsx",
  "web/lib/mascotita/types.ts",
  "web/lib/mascotita/config.ts",
  "web/lib/mascotita/cognition.ts",
  "web/lib/mascotita/tick.ts",
  "web/lib/mascotita/envs/repo.ts",
  "web/lib/mascotita/brain/gemini.ts",
];

// --- memo por tick ---
// Un ctx vive lo que dura un tick: el árbol se carga una vez y "verCambios" se
// ofrece a lo sumo una vez. WeakMap/WeakSet no retienen el ctx tras el tick.
const treePromises = new WeakMap<EnvContext, Promise<RepoTreeCache>>();
const treesReady = new WeakMap<EnvContext, RepoTreeCache>();
const changesOffered = new WeakSet<EnvContext>();

// --- utilidades puras ---

function repoTarget(): { repo: string; branch: string } {
  const c = cfg();
  // Nunca dejamos que un env var raro arme una URL fuera del patrón owner/repo.
  const repo = /^[\w.-]+\/[\w.-]+$/.test(c.repo) ? c.repo : "domakedev/criteria";
  const branch = /^[\w./-]+$/.test(c.repoBranch) && !c.repoBranch.includes("..") ? c.repoBranch : "main";
  return { repo, branch };
}

function isTextPath(p: string): boolean {
  const lower = p.toLowerCase();
  if (EXCLUDED.some((x) => lower.includes(x))) return false;
  return TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function priorityOf(p: string): number {
  const i = PRIORITY_DIRS.findIndex((d) => p.startsWith(d));
  if (i >= 0) return i;
  if (!p.includes("/")) return PRIORITY_DIRS.length; // raíz
  return PRIORITY_DIRS.length + 1;
}

function dirname(p: string): string {
  const i = p.lastIndexOf("/");
  return i < 0 ? ROOT_DIR : p.slice(0, i);
}

function basename(p: string): string {
  const i = p.lastIndexOf("/");
  return i < 0 ? p : p.slice(i + 1);
}

/** Normaliza una ruta relativa ("web/lib/../ai.ts" → "web/ai.ts"); null si escapa de la raíz. */
function normalizePath(p: string): string | null {
  const out: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (out.length === 0) return null;
      out.pop();
      continue;
    }
    out.push(seg);
  }
  return out.join("/");
}

/** minúsculas, sin acentos, espacios colapsados — igual criterio que brain/sanitize. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Limpia texto de archivo: sin bytes nulos, líneas de ≤ 300 caracteres. */
function cleanText(raw: string): string {
  return raw
    .replace(/\0/g, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => (line.length > MAX_LINE_CHARS ? line.slice(0, MAX_LINE_CHARS) + "…" : line))
    .join("\n");
}

/** Heurística barata: mucho carácter de control o de reemplazo → binario. */
function looksBinary(raw: string): boolean {
  if (raw.length === 0) return false;
  let bad = 0;
  const n = Math.min(raw.length, 4000);
  for (let i = 0; i < n; i++) {
    const c = raw.charCodeAt(i);
    if (c === 0xfffd || (c < 32 && c !== 9 && c !== 10 && c !== 13)) bad += 1;
  }
  return bad / n > 0.05;
}

/**
 * Pistas heurísticas de un texto: encabezados markdown, nombres exportados,
 * especificadores de import y nombres de función. Sin repetir, ≤ 12.
 */
export function extractHints(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (h: string) => {
    const t = h.replace(/\s+/g, " ").trim().slice(0, 60);
    if (!t) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  };
  const run = (re: RegExp) => {
    for (const m of text.matchAll(re)) {
      if (out.length >= BOUNDS.hintsPerObservation) return;
      add(m[1]);
    }
  };
  run(/^#{1,4}\s+(.+?)\s*#*$/gm);
  run(/export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g);
  run(/(?:^|[^\w$])(?:async\s+)?function\*?\s+([A-Za-z_$][\w$]*)\s*[(<]/g);
  run(/\bfrom\s+["']([^"'\n]+)["']/g);
  return out.slice(0, BOUNDS.hintsPerObservation);
}

function extractImports(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\bfrom\s+["']([^"'\n]+)["']/g)) {
    const spec = m[1].trim();
    if (spec && !out.includes(spec)) out.push(spec);
    if (out.length >= 20) break;
  }
  return out;
}

/** Resuelve un import relativo o "@/…" contra el árbol; null si no está (npm, alias raro). */
function resolveImport(spec: string, fromPath: string, paths: Set<string>): string | null {
  let base: string | null = null;
  if (spec.startsWith("@/")) base = "web/" + spec.slice(2);
  else if (spec.startsWith("./") || spec.startsWith("../")) {
    const dir = dirname(fromPath);
    base = normalizePath((dir === ROOT_DIR ? "" : dir + "/") + spec);
  }
  if (!base) return null;
  // ESM escribe "./store.js" apuntando a "./store.ts": se prueba también sin extensión.
  const bases = /\.(m?js)$/.test(base) ? [base, base.replace(/\.(m?js)$/, "")] : [base];
  for (const b of bases) {
    for (const suffix of RESOLVE_SUFFIXES) {
      const candidate = b + suffix;
      if (paths.has(candidate)) return candidate;
    }
  }
  return null;
}

/** Ventana de lectura: trozo de ≤ observationChars con offset sembrado si el archivo es largo. */
function windowOf(text: string, rng: () => number): string {
  const max = BOUNDS.observationChars;
  if (text.length <= max) return text;
  const slack = Math.max(0, text.length - max);
  const offset = Math.floor((rng() * slack) / WINDOW_STEP) * WINDOW_STEP;
  return text.slice(offset, offset + max);
}

/** Mantiene un record con ≤ cap claves, soltando las más antiguas (orden de inserción). */
function capRecord<T>(rec: Record<string, T>, cap: number): void {
  const keys = Object.keys(rec);
  for (let i = 0; i < keys.length - cap; i++) delete rec[keys[i]];
}

function fallbackTree(repo: string, branch: string, now: string): RepoTreeCache {
  return {
    repo,
    branch,
    sha: "",
    fetchedAt: now,
    tree: KNOWN_PATHS.map((p) => ({ p, s: 0, h: "" })),
  };
}

function daysBetween(aIso: string, bIso: string): number {
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.abs(b - a) / 86_400_000;
}

// --- red ---

/** Único punto de salida a la red: hosts fijos, timeout y presupuesto descontado antes. */
async function ghFetch(ctx: EnvContext, url: string): Promise<Response> {
  if (!url.startsWith(API_HOST + "/") && !url.startsWith(RAW_HOST + "/")) {
    throw new Error("host no permitido");
  }
  ctx.fetchBudget.remaining -= 1;
  const headers: Record<string, string> = {
    "user-agent": USER_AGENT,
    accept: url.startsWith(API_HOST) ? "application/vnd.github+json" : "text/plain",
  };
  const token = cfg().githubToken;
  if (token) headers.authorization = `Bearer ${token}`;
  return fetch(url, { headers, signal: AbortSignal.timeout(BOUNDS.fetchTimeoutMs), redirect: "error" });
}

function rawUrl(repo: string, branch: string, path: string): string {
  const segs = path.split("/").map(encodeURIComponent).join("/");
  return `${RAW_HOST}/${repo}/${encodeURIComponent(branch)}/${segs}`;
}

interface GitTreeResponse {
  sha?: string;
  tree?: Array<{ path?: string; type?: string; size?: number; sha?: string }>;
}

async function fetchTree(ctx: EnvContext, repo: string, branch: string): Promise<RepoTreeCache> {
  const res = await ghFetch(ctx, `${API_HOST}/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  if (!res.ok) throw new Error(`árbol: HTTP ${res.status}`);
  const data = (await res.json()) as GitTreeResponse;
  const entries: RepoTreeEntry[] = [];
  for (const e of data.tree ?? []) {
    if (e.type !== "blob" || typeof e.path !== "string" || typeof e.sha !== "string") continue;
    const size = typeof e.size === "number" ? e.size : 0;
    if (!isTextPath(e.path) || size > CAPS.repoFileBytes) continue;
    entries.push({ p: e.path, s: size, h: e.sha });
  }
  entries.sort((a, b) => priorityOf(a.p) - priorityOf(b.p) || a.p.localeCompare(b.p));
  return {
    repo,
    branch,
    sha: typeof data.sha === "string" ? data.sha : "",
    fetchedAt: ctx.now,
    tree: entries.slice(0, CAPS.repoTree),
  };
}

async function loadTreeOnce(ctx: EnvContext): Promise<RepoTreeCache> {
  const { repo, branch } = repoTarget();
  let cached: RepoTreeCache | null = null;
  try {
    cached = await getRepoTreeCache();
  } catch {
    cached = null;
  }
  if (cached && (cached.repo !== repo || cached.branch !== branch || !Array.isArray(cached.tree))) {
    cached = null;
  }
  const nowMs = Date.parse(ctx.now) || Date.now();
  const fresh = cached && cached.sha !== "" && nowMs - (Date.parse(cached.fetchedAt) || 0) < TREE_MAX_AGE_MS;
  if (cached && fresh && cached.tree.length > 0) return cached;
  // Si GitHub falló hace poco (límite de peticiones), no se insiste cada tick.
  const triedRecently =
    cached?.lastAttemptAt && nowMs - (Date.parse(cached.lastAttemptAt) || 0) < RETRY_AFTER_MS;
  if (cached && triedRecently && cached.tree.length > 0) return cached;
  if (ctx.fetchBudget.remaining <= 0) return cached ?? fallbackTree(repo, branch, ctx.now);
  try {
    const tree = await fetchTree(ctx, repo, branch);
    if (tree.tree.length === 0) throw new Error("árbol vacío");
    try {
      await saveRepoTreeCache(tree);
    } catch {
      // La caché es una optimización; si Firestore falla, el tick sigue.
    }
    return tree;
  } catch {
    // Sin GitHub: caché stale si la hay, si no las rutas semilla; y se anota
    // el intento para esperar antes de volver a probar.
    const stale = cached && cached.tree.length > 0 ? cached : fallbackTree(repo, branch, ctx.now);
    try {
      await saveRepoTreeCache({ ...stale, lastAttemptAt: ctx.now });
    } catch {
      // idem
    }
    return stale;
  }
}

/** Árbol del repo, cargado UNA vez por tick. */
function loadTree(ctx: EnvContext): Promise<RepoTreeCache> {
  let p = treePromises.get(ctx);
  if (!p) {
    p = loadTreeOnce(ctx).then((t) => {
      treesReady.set(ctx, t);
      return t;
    });
    treePromises.set(ctx, p);
  }
  return p;
}

// --- cursor ---

function initRepoCursor(): RepoCursor {
  return { kind: "repo", visited: {}, frontier: [], lastRead: null, lastCommitSha: null, fileSha: {} };
}

function cursorOf(ctx: EnvContext): RepoCursor {
  const c = ctx.envState.cursor;
  if (c.kind === "repo") {
    // Campos que pudieron faltar en documentos viejos.
    c.visited ??= {};
    c.frontier ??= [];
    c.fileSha ??= {};
    c.lastRead ??= null;
    c.lastCommitSha ??= null;
    return c;
  }
  const fresh = initRepoCursor();
  ctx.envState.cursor = fresh;
  return fresh;
}

// --- árbol: carpetas e hijos ---

interface DirInfo {
  dir: string;
  files: string[];
  subdirs: string[];
}

function dirsOf(tree: RepoTreeCache): Map<string, DirInfo> {
  const dirs = new Map<string, DirInfo>();
  const ensure = (d: string) => {
    let info = dirs.get(d);
    if (!info) {
      info = { dir: d, files: [], subdirs: [] };
      dirs.set(d, info);
    }
    return info;
  };
  for (const e of tree.tree) {
    const parts = e.p.split("/");
    ensure(ROOT_DIR);
    for (let i = 1; i < parts.length && i <= MAX_DIR_DEPTH; i++) {
      const dir = parts.slice(0, i).join("/");
      const parent = i === 1 ? ROOT_DIR : parts.slice(0, i - 1).join("/");
      const pinfo = ensure(parent);
      if (!pinfo.subdirs.includes(dir)) pinfo.subdirs.push(dir);
      ensure(dir);
    }
    const depth = parts.length - 1;
    if (depth <= MAX_DIR_DEPTH) ensure(depth === 0 ? ROOT_DIR : parts.slice(0, depth).join("/")).files.push(e.p);
  }
  return dirs;
}

// --- lectura de archivos ---

type ReadResult =
  | { kind: "ok"; text: string; status: number }
  | { kind: "empty" }
  | { kind: "404" }
  | { kind: "http"; status: number }
  | { kind: "red" };

async function readFile(ctx: EnvContext, tree: RepoTreeCache, path: string): Promise<ReadResult> {
  try {
    const res = await ghFetch(ctx, rawUrl(tree.repo, tree.branch, path));
    if (res.status === 404) return { kind: "404" };
    if (!res.ok) return { kind: "http", status: res.status };
    const raw = await res.text();
    if (!raw.trim() || looksBinary(raw)) return { kind: "empty" };
    return { kind: "ok", text: cleanText(raw.slice(0, CAPS.repoFileBytes)), status: res.status };
  } catch {
    return { kind: "red" };
  }
}

function failureOutcome(r: Exclude<ReadResult, { kind: "ok" }>, path: string): Outcome {
  switch (r.kind) {
    case "404":
      return { success: false, reward: -0.5, tags: ["404"], observation: { text: `${path}: no existe (404).`, hints: [], ref: path } };
    case "http":
      if (r.status === 403 || r.status === 429) {
        // Límite de GitHub, no un fallo del mundo: castigo leve.
        return { success: false, reward: -0.1, tags: ["rate-limit", `http-${r.status}`] };
      }
      return { success: false, reward: -0.5, tags: ["red", `http-${r.status}`] };
    case "empty":
      return { success: false, reward: -0.3, tags: ["vacio"] };
    default:
      return { success: false, reward: -0.3, tags: ["red"] };
  }
}

/** Registra una lectura exitosa en el cursor y arma la observación. */
function noteRead(ctx: EnvContext, tree: RepoTreeCache, path: string, text: string): Outcome["observation"] {
  const cursor = cursorOf(ctx);
  const window = windowOf(text, ctx.rng);
  cursor.visited[path] = (cursor.visited[path] ?? 0) + 1;
  capRecord(cursor.visited, CAPS.visited);
  const entry = tree.tree.find((e) => e.p === path);
  if (entry && entry.h) {
    cursor.fileSha[path] = entry.h;
    capRecord(cursor.fileSha, CAPS.fileSha);
  }
  cursor.lastRead = { path, imports: extractImports(text) };
  cursor.frontier = cursor.frontier.filter((p) => p !== path);
  return { text: window, hints: extractHints(window), ref: path };
}

// --- el entorno ---

export const repoEnv: Environment = {
  id: "repo",
  name: "El repositorio",
  emoji: "🧬",
  kind: "real",
  intro: "El código real de criteria en GitHub: archivos, imports que a veces no existen y commits nuevos.",

  initCursor(): EnvCursor {
    return initRepoCursor();
  },

  async affordances(ctx: EnvContext): Promise<Action[]> {
    const cursor = cursorOf(ctx);
    const tree = await loadTree(ctx);
    const paths = new Set(tree.tree.map((e) => e.p));
    const sizeOf = new Map(tree.tree.map((e) => [e.p, e.s]));
    const canFetch = ctx.fetchBudget.remaining > 0;
    const rng = ctx.rng;

    // Limpiamos la frontera de rutas que ya no existen o ya se leyeron.
    cursor.frontier = cursor.frontier.filter((p) => paths.has(p) && !cursor.visited[p]).slice(0, CAPS.frontier);

    const revisar: Action[] = [];
    const probar: Action[] = [];
    const leer: Action[] = [];
    const seguir: Action[] = [];
    const explorar: Action[] = [];
    const releer: Action[] = [];
    const cambios: Action[] = [];

    if (canFetch) {
      // revisar(enseñanza): lo que el dueño dijo y apunta a un archivo real.
      const teachings = ctx.toTest.filter(
        (c) => c.ref && paths.has(c.ref) && c.evidence && (sizeOf.get(c.ref) ?? 0) <= CAPS.repoFileBytes,
      );
      if (teachings.length > 0) {
        const c = pick(rng, teachings);
        revisar.push({
          type: "revisar",
          target: c.ref!,
          label: `revisar si "${c.label}" es cierto en ${basename(c.ref!)}`,
          riskHint: 0.2,
          costEnergy: 0.12,
          meta: { conceptId: c.id, taught: true },
        });
      }

      // probar(concepto): hipótesis propias con ref + evidence, no verificadas (o rancias).
      const testable = ctx.concepts.filter(
        (c) =>
          !c.toTest &&
          c.ref &&
          paths.has(c.ref) &&
          c.evidence &&
          (sizeOf.get(c.ref) ?? 0) <= CAPS.repoFileBytes &&
          (!c.verified || daysBetween(c.lastSeenAt, ctx.now) > VERIFIED_STALE_DAYS),
      );
      if (testable.length > 0) {
        const c = pick(rng, testable);
        probar.push({
          type: "probar",
          target: c.ref!,
          label: `probar si "${c.label}" sigue en ${basename(c.ref!)}`,
          riskHint: 0.2,
          costEnergy: 0.12,
          meta: { conceptId: c.id },
        });
      }

      // leer(path): primero la frontera, luego algo no visitado al azar.
      const leerAction = (path: string): Action => ({
        type: "leer",
        target: path,
        label: `leer ${path}`,
        riskHint: 0.1,
        costEnergy: 0.15,
        explore: true,
      });
      const fromFrontier = cursor.frontier[0];
      if (fromFrontier) leer.push(leerAction(fromFrontier));
      const unvisited = tree.tree.filter((e) => !cursor.visited[e.p] && e.p !== fromFrontier);
      if (unvisited.length > 0) leer.push(leerAction(pick(rng, unvisited).p));

      // seguir(import): del último archivo leído.
      if (cursor.lastRead && cursor.lastRead.imports.length > 0 && paths.has(cursor.lastRead.path)) {
        const from = cursor.lastRead.path;
        const spec = pick(rng, cursor.lastRead.imports);
        const resolved = resolveImport(spec, from, paths);
        seguir.push({
          type: "seguir",
          target: spec,
          label: `seguir el import "${spec}" desde ${basename(from)}`,
          riskHint: 0.3,
          costEnergy: 0.1,
          explore: true,
          meta: { from, resolved: resolved ?? "" },
        });
      }

      // releer(path): solo desde joven; archivos leídos pocas veces.
      if (ctx.pet.stage !== "huevo" && ctx.pet.stage !== "cria") {
        const again = Object.entries(cursor.visited)
          .filter(([p, n]) => n < RELEER_MAX_VISITS && paths.has(p))
          .map(([p]) => p);
        if (again.length > 0) {
          const path = pick(rng, again);
          releer.push({
            type: "releer",
            target: path,
            label: `releer ${path}`,
            riskHint: 0.05,
            costEnergy: 0.12,
          });
        }
      }

      // verCambios(): a lo sumo una vez por tick, y no siempre.
      if (!changesOffered.has(ctx) && rng() < 0.5) {
        changesOffered.add(ctx);
        cambios.push({
          type: "verCambios",
          target: "commits",
          label: "ver qué cambió en el repositorio",
          riskHint: 0.05,
          costEnergy: 0.05,
        });
      }
    }

    // explorar(dir): sin fetch, siempre disponible; carpetas con hijos que aún
    // no están ni visitados ni en la frontera.
    const dirs = Array.from(dirsOf(tree).values()).filter((d) => d.files.length > 0);
    const candidates = dirs
      .map((d) => {
        const unseen = d.files.filter((f) => !cursor.visited[f]);
        const fresh = unseen.filter((f) => !cursor.frontier.includes(f));
        return { d, unseen, fresh };
      })
      .filter((x) => x.fresh.length > 0);
    for (const x of shuffle(rng, candidates).slice(0, 2)) {
      explorar.push({
        type: "explorar",
        target: x.d.dir,
        label: x.d.dir === ROOT_DIR ? "explorar la raíz del repositorio" : `explorar la carpeta ${x.d.dir}/`,
        riskHint: 0,
        costEnergy: 0.05,
        explore: true,
        meta: { unseenFrac: round3(x.unseen.length / x.d.files.length), unseen: x.unseen.length },
      });
    }

    return [...revisar, ...probar, ...leer.slice(0, 1), ...seguir, ...explorar, ...leer.slice(1), ...releer, ...cambios].slice(
      0,
      MAX_AFFORDANCES,
    );
  },

  async act(a: Action, ctx: EnvContext): Promise<Outcome> {
    const cursor = cursorOf(ctx);
    const tree = await loadTree(ctx);
    const paths = new Set(tree.tree.map((e) => e.p));
    const needsFetch = a.type !== "explorar";
    if (needsFetch && ctx.fetchBudget.remaining <= 0) {
      return { success: false, reward: -0.1, tags: ["sin-presupuesto"] };
    }

    switch (a.type) {
      case "explorar": {
        const info = dirsOf(tree).get(a.target);
        if (!info) return { success: false, reward: -0.1, tags: ["invalido"] };
        const unseen = info.files.filter((f) => !cursor.visited[f]);
        for (const f of unseen) {
          if (cursor.frontier.length >= CAPS.frontier) break;
          if (!cursor.frontier.includes(f)) cursor.frontier.push(f);
        }
        const names = info.files.map(basename);
        const subs = info.subdirs.map((d) => basename(d) + "/");
        let text =
          `La carpeta ${info.dir === ROOT_DIR ? "raíz" : info.dir + "/"} contiene: ${names.join(", ")}` +
          ` (${info.files.length} archivo${info.files.length === 1 ? "" : "s"}` +
          (subs.length ? `; carpetas: ${subs.join(", ")}` : "") +
          ").";
        if (text.length > 600) text = text.slice(0, 597) + "…";
        return {
          success: true,
          reward: round3(0.1 + (0.1 * Math.min(4, unseen.length)) / 4),
          observation: { text, hints: names.slice(0, BOUNDS.hintsPerObservation), ref: info.dir },
          tags: ["explorar", unseen.length ? "nuevo" : "conocido"],
        };
      }

      case "leer":
      case "seguir": {
        let path = a.target;
        const tags: string[] = [];
        if (a.type === "seguir") {
          const from = typeof a.meta?.from === "string" ? a.meta.from : cursor.lastRead?.path ?? "";
          const resolved = from ? resolveImport(a.target, from, paths) : null;
          if (!resolved) {
            // Fallo REAL sin gastar red: un paquete npm o un alias que no está en el repo.
            return {
              success: false,
              reward: -0.4,
              observation: {
                text: `El import "${a.target}" no lleva a ningún archivo del repositorio: es un paquete externo o un alias desconocido.`,
                hints: [a.target],
                ref: null,
              },
              tags: ["import-externo"],
            };
          }
          path = resolved;
          tags.push("import-resuelto");
        }
        if (!paths.has(path)) return { success: false, reward: -0.1, tags: ["invalido"] };
        const r = await readFile(ctx, tree, path);
        if (r.kind !== "ok") return failureOutcome(r, path);
        const observation = noteRead(ctx, tree, path, r.text);
        return {
          success: true,
          reward: a.type === "seguir" ? 0.3 : 0.2,
          observation,
          tags: [a.type === "seguir" ? "seguir" : "leido", ...tags],
        };
      }

      case "releer": {
        const path = a.target;
        if (!paths.has(path)) return { success: false, reward: -0.1, tags: ["invalido"] };
        const shaBefore = cursor.fileSha[path];
        const entry = tree.tree.find((e) => e.p === path);
        const r = await readFile(ctx, tree, path);
        if (r.kind !== "ok") return failureOutcome(r, path);
        const observation = noteRead(ctx, tree, path, r.text);
        const about = ctx.concepts.filter((c) => c.ref === path);
        let reward: number;
        const tags = ["releer"];
        if (shaBefore && entry?.h && shaBefore !== entry.h) {
          reward = 0.3;
          tags.push("cambio");
        } else if (about.some((c) => c.confidence < 0.5)) {
          reward = 0.1;
        } else if (about.length === 0 || about.every((c) => c.confidence > 0.7)) {
          reward = -0.1;
        } else {
          reward = 0;
        }
        return { success: true, reward, observation, tags };
      }

      case "probar":
      case "revisar": {
        const conceptId = typeof a.meta?.conceptId === "string" ? a.meta.conceptId : "";
        const pool: ConceptDoc[] = a.type === "revisar" ? ctx.toTest : ctx.concepts;
        const concept = pool.find((c) => c.id === conceptId) ?? ctx.concepts.find((c) => c.id === conceptId) ?? ctx.toTest.find((c) => c.id === conceptId);
        const path = a.target;
        if (
          !concept ||
          !concept.evidence ||
          norm(concept.evidence).length < 4 ||
          concept.ref !== path ||
          !paths.has(path)
        ) {
          return { success: false, reward: -0.1, tags: ["invalido"] };
        }
        const r = await readFile(ctx, tree, path);
        if (r.kind !== "ok") return failureOutcome(r, path);
        const needle = norm(concept.evidence);
        const hay = norm(r.text);
        const idx = needle ? hay.indexOf(needle) : -1;
        const found = idx >= 0;
        const result: "confirma" | "contradice" = found ? "confirma" : "contradice";
        const tags = [a.type === "revisar" ? "revisado" : "probado", found ? "verificado" : "refutado"];
        cursor.visited[path] = (cursor.visited[path] ?? 0) + 1;
        capRecord(cursor.visited, CAPS.visited);
        let observation: Outcome["observation"];
        if (found) {
          // Ventana alrededor del hallazgo en el texto ORIGINAL (posiciones
          // aproximadas: la normalización no cambia mucho las longitudes).
          const approx = Math.min(r.text.length, Math.round((idx / Math.max(1, hay.length)) * r.text.length));
          const start = Math.max(0, approx - PROBE_WINDOW_CHARS / 2);
          const text = r.text.slice(start, start + PROBE_WINDOW_CHARS);
          observation = { text, hints: extractHints(text), ref: path };
        }
        return {
          success: found,
          reward: found ? 0.5 : -0.4,
          ...(observation ? { observation } : {}),
          tags,
          verification: {
            conceptId: concept.id,
            result,
            detail: found
              ? `"${concept.evidence}" aparece en ${path}`
              : `"${concept.evidence}" ya no aparece en ${path}`,
          },
        };
      }

      case "verCambios": {
        let res: Response;
        try {
          res = await ghFetch(ctx, `${API_HOST}/repos/${tree.repo}/commits?per_page=5&sha=${encodeURIComponent(tree.branch)}`);
        } catch {
          return { success: false, reward: -0.3, tags: ["red"] };
        }
        if (res.status === 403 || res.status === 429) {
          return { success: false, reward: -0.1, tags: ["rate-limit", `http-${res.status}`] };
        }
        if (!res.ok) return { success: false, reward: -0.3, tags: ["red", `http-${res.status}`] };
        const data = (await res.json().catch(() => null)) as unknown;
        const commits = Array.isArray(data) ? data.slice(0, 5) : [];
        const lines: string[] = [];
        let first: string | null = null;
        for (const c of commits) {
          const sha = typeof c?.sha === "string" ? c.sha : "";
          const msg = typeof c?.commit?.message === "string" ? c.commit.message.split("\n")[0].slice(0, 120) : "";
          const date = typeof c?.commit?.author?.date === "string" ? c.commit.author.date.slice(0, 10) : "";
          if (!sha) continue;
          if (!first) first = sha;
          lines.push(`${sha.slice(0, 7)} ${msg} — ${date}`);
        }
        if (!first) return { success: false, reward: -0.3, tags: ["red", "sin-commits"] };
        const novel = first !== cursor.lastCommitSha;
        cursor.lastCommitSha = first;
        return {
          success: true,
          reward: novel ? 0.4 : -0.2,
          observation: {
            text: cleanText("Últimos cambios:\n" + lines.join("\n")),
            hints: lines.map((l) => l.slice(0, 60)),
            ref: "commits",
          },
          tags: ["verCambios", novel ? "novedad" : "sin-novedad"],
        };
      }

      default:
        return { success: false, reward: -0.1, tags: ["invalido"] };
    }
  },

  noveltyOf(a: Action, ctx: EnvContext): number {
    const cursor = cursorOf(ctx);
    switch (a.type) {
      case "leer": {
        const v = cursor.visited[a.target] ?? 0;
        return v ? 0.6 / (1 + v) : 1;
      }
      case "seguir": {
        const resolved = typeof a.meta?.resolved === "string" ? a.meta.resolved : "";
        if (!resolved) return 0.5;
        const v = cursor.visited[resolved] ?? 0;
        return v ? 0.6 / (1 + v) : 1;
      }
      case "explorar":
        return typeof a.meta?.unseenFrac === "number" ? a.meta.unseenFrac : 0.5;
      case "releer":
        return 0.4 / (1 + (cursor.visited[a.target] ?? 0));
      case "probar":
      case "revisar":
        return 0.5;
      case "verCambios":
        return 0.6;
      default:
        return 0.3;
    }
  },
};

/** Árbol ya cargado en este tick (si affordances corrió); útil para pruebas. */
export function treeFor(ctx: EnvContext): RepoTreeCache | null {
  return treesReady.get(ctx) ?? null;
}
