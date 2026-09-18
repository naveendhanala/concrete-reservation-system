// Lightweight client-side similarity scoring used to surface possible
// duplicate contractor names before a new one is created.

function normalize(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[.,&\-_/]/g, ' ')
    .replace(/\s+/g, ' ');
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function tokenJaccard(a: string, b: string): number {
  const setA = new Set(a.split(' ').filter(Boolean));
  const setB = new Set(b.split(' ').filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const tok of setA) if (setB.has(tok)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Similarity score between 0 and 100. */
export function similarityScore(query: string, candidate: string): number {
  const a = normalize(query);
  const b = normalize(candidate);
  if (!a || !b) return 0;
  if (a === b) return 100;

  const substringScore = a.includes(b) || b.includes(a)
    ? 85 + 15 * (Math.min(a.length, b.length) / Math.max(a.length, b.length))
    : 0;

  const editScore = (1 - levenshtein(a, b) / Math.max(a.length, b.length)) * 100;
  const jaccardScore = tokenJaccard(a, b) * 100;

  return Math.max(substringScore, editScore, jaccardScore);
}

export type MatchStrength = 'Strong' | 'Possible' | 'Weak';

export function matchStrength(score: number): MatchStrength {
  if (score >= 75) return 'Strong';
  if (score >= 45) return 'Possible';
  return 'Weak';
}

export interface ScoredMatch<T> {
  item: T;
  score: number;
  strength: MatchStrength;
}

/** Ranks candidates by similarity to `query`, best first. */
export function topMatches<T>(
  query: string,
  candidates: T[],
  getName: (item: T) => string,
  limit = 6
): ScoredMatch<T>[] {
  return candidates
    .map((item) => {
      const score = similarityScore(query, getName(item));
      return { item, score, strength: matchStrength(score) };
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
}
