/**
 * Semantics — local, dependency-free "understanding" for search.
 *
 * Word-for-word search only matches identical letters. This layer normalizes
 * MEANING before comparing, so "jefe" finds "líder", "equipos" finds "equipo",
 * "decisión" finds "decision", and "trabjo" (typo) finds "trabajo" — all
 * offline, instantly, with nothing leaving your machine.
 *
 * This is the AI-as-librarian role: it helps FIND your experiences. It never
 * decides for you. A true embedding model could plug in here later as an
 * optional layer; this gives most of the value with none of the weight.
 */

/** Accent/diacritic stripping: "decisión" → "decision". */
export function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Common words (accent-free) that carry no meaning for matching. */
const STOPWORDS = new Set([
  // English
  'the', 'and', 'but', 'for', 'not', 'with', 'have', 'has', 'this', 'that',
  'what', 'how', 'when', 'should', 'would', 'could', 'are', 'was', 'were',
  'you', 'our', 'its', 'about', 'from', 'into', 'than', 'then', 'them',
  // Spanish (accent-free)
  'los', 'las', 'una', 'unos', 'unas', 'pero', 'que', 'del', 'con', 'para',
  'por', 'como', 'cuando', 'debo', 'deberia', 'hay', 'este', 'esta', 'esto',
  'ese', 'esa', 'eso', 'mas', 'muy', 'sus', 'sin', 'son', 'era', 'ser', 'mi',
  'tu', 'yo', 'nos', 'les', 'algo', 'todo', 'toda', 'ya', 'porque',
]);

/**
 * Synonym groups (life-oriented, accent-free). Every word in a group maps to
 * the group's first word, so all become the same token when compared.
 * Edit freely — this is where "understanding" grows without a model.
 */
const SYNONYM_GROUPS: string[][] = [
  ['trabajo', 'empleo', 'laburo', 'chamba', 'pega', 'puesto'],
  ['jefe', 'jefa', 'lider', 'superior', 'gerente', 'patron', 'patrona'],
  ['renunciar', 'renuncia', 'dimitir', 'renuncie'],
  ['dinero', 'plata', 'sueldo', 'salario', 'paga', 'pago', 'ingreso', 'guita'],
  ['auto', 'carro', 'coche', 'vehiculo', 'automovil'],
  ['casa', 'hogar', 'vivienda', 'depa', 'departamento', 'piso'],
  ['pareja', 'novio', 'novia', 'esposo', 'esposa', 'conyuge'],
  ['estudiar', 'estudio', 'carrera', 'universidad', 'uni', 'estudios'],
  ['mudar', 'mudarme', 'mudarse', 'mudanza', 'trasladarme', 'trasladar'],
  ['miedo', 'temor', 'panico', 'angustia', 'inseguridad'],
  ['comprar', 'compra', 'adquirir'],
  ['vender', 'venta'],
  ['salud', 'enfermedad', 'medico', 'doctor', 'enfermo'],
  ['negocio', 'emprender', 'emprendimiento', 'empresa', 'startup', 'proyecto'],
  ['familia', 'familiar', 'padres', 'hijos'],
  ['amigo', 'amiga', 'amistad', 'amigos'],
  ['viaje', 'viajar', 'viajes'],
  ['tiempo', 'plazo', 'horario'],
  ['decidir', 'decision', 'elegir', 'eleccion', 'escoger'],
  ['ayuda', 'ayudar', 'apoyo', 'consejo'],
];

const SYNONYM: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const group of SYNONYM_GROUPS) {
    const canonical = group[0]!;
    for (const word of group) map.set(word, canonical);
  }
  return map;
})();

const ENCLITICS = ['nos', 'me', 'te', 'se', 'le'];

/**
 * Conservative Spanish stemmer: strips reflexive pronouns and plural endings
 * so "cambiarme" → "cambiar" and "equipos" → "equipo". Deliberately shallow to
 * avoid over-merging unrelated words.
 */
export function stem(word: string): string {
  let w = word;
  for (const suffix of ENCLITICS) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 4) {
      w = w.slice(0, -suffix.length);
      break;
    }
  }
  if (w.endsWith('es') && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith('s') && w.length > 3) w = w.slice(0, -1);
  return w;
}

/** raw word → canonical meaning token (accent-free, stemmed, synonym-mapped). */
export function normalizeWord(raw: string): string {
  let w = stripAccents(raw.toLowerCase());
  if (SYNONYM.has(w)) return SYNONYM.get(w)!;
  w = stem(w);
  if (SYNONYM.has(w)) return SYNONYM.get(w)!;
  return w;
}

/** Split text into a set of meaning tokens. */
export function tokenize(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 3) continue;
    if (STOPWORDS.has(stripAccents(raw))) continue;
    out.add(normalizeWord(raw));
  }
  return out;
}

/** Levenshtein distance, short-circuited for our "≤1" typo use. */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[m]![n]!;
}

/** Two tokens that differ by a likely typo (edit distance 1, both long enough). */
export function fuzzyEqual(a: string, b: string): boolean {
  return a !== b && Math.min(a.length, b.length) >= 5 && editDistance(a, b) <= 1;
}

/**
 * How much two token sets overlap in meaning. Exact match counts 1; a typo-away
 * match counts 0.5. This is what makes the search feel like it "understands".
 */
export function semanticOverlap(a: Set<string>, b: Set<string>): number {
  let score = 0;
  const usedB = new Set<string>();
  for (const t of a) {
    if (b.has(t)) {
      score += 1;
      usedB.add(t);
    }
  }
  for (const t of a) {
    if (b.has(t)) continue;
    for (const u of b) {
      if (usedB.has(u)) continue;
      if (fuzzyEqual(t, u)) {
        score += 0.5;
        usedB.add(u);
        break;
      }
    }
  }
  return score;
}
