import type { Book, EpubType } from '../types/models';

const BRACKET_RE = /[\[\(（【〔［][^\]\)）】〕］]*[\]\)）】〕］]/g;
const PUNCT_RE = /[\s\-_·・.,，。、:：;；!！?？'"“”‘’~～/\\|@#$%^&*+=<>《》「」『』]/g;
/** Volume markers (`第7卷`, `7卷`, `巻7`, `vol.7`, `v7`) are stripped so file names and titles line up. */
const VOLUME_RES: RegExp[] = [
  /第\s*\d+(?:\.\d+)?\s*[卷巻]/g,
  /\d+(?:\.\d+)?\s*[卷巻]/g,
  /[卷巻]\s*\d+(?:\.\d+)?/g,
  /\b(?:vol|v)\.?\s*\d+(?:\.\d+)?/g,
];

/** Normalize a title for fuzzy comparison: drop brackets, volume markers, punctuation and spacing. */
export function normalizeTitle(s: string): string {
  let out = s.toLowerCase().replace(BRACKET_RE, '');
  for (const re of VOLUME_RES) out = out.replace(re, '');
  return out.replace(PUNCT_RE, '').trim();
}

function baseName(fileName: string): string {
  return fileName.replace(/\.[^.\\/]+$/, '');
}

/**
 * Guess a volume number from a file name.
 * Supports `第7卷`, `卷7`, `7卷`, `vol.7`, `v7`, and falls back to the last small number.
 */
export function guessVolumeFromName(fileName: string): number | null {
  const base = baseName(fileName);
  const patterns: RegExp[] = [
    /第\s*(\d+(?:\.\d+)?)\s*[卷巻]/,
    /[卷巻]\s*(\d+(?:\.\d+)?)/,
    /(\d+(?:\.\d+)?)\s*[卷巻]/,
    /(?:vol\.?|v)\s*(\d+(?:\.\d+)?)/i,
  ];
  for (const p of patterns) {
    const m = base.match(p);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  const all = Array.from(base.matchAll(/(\d+(?:\.\d+)?)/g)).map((x) => Number(x[1]));
  const last = all.length ? all[all.length - 1] : null;
  if (last != null && Number.isFinite(last) && last > 0 && last < 200) return last;
  return null;
}

/** Guess whether a file is a main volume or a short story. */
export function guessTypeFromName(name: string): EpubType {
  return /短篇|短編|番外|外传|外伝|特典/i.test(name) ? '短篇' : '正文';
}

/**
 * Pick the best-matching book for a set of candidate strings (file name, epub title, ...).
 * Returns null when nothing matches confidently enough.
 */
export function matchBook(books: Book[], candidates: string[]): Book | null {
  const cands = Array.from(
    new Set(candidates.map((c) => normalizeTitle(c ?? '')).filter((c) => c.length >= 2))
  );
  if (!cands.length) return null;

  let best: { book: Book; score: number } | null = null;

  for (const b of books) {
    const titles = [b.title_cn, b.title_jp]
      .filter((t): t is string => !!t)
      .map((t) => normalizeTitle(t))
      .filter((t) => t.length >= 2);

    for (const t of titles) {
      /* 纯数字标题（如「86」）只接受完全一致，避免误匹配 ISBN / 年份 */
      const digitsOnly = /^\d+(\.\d+)?$/.test(t);
      for (const c of cands) {
        let score = 0;
        if (t === c) score = 1000 + t.length;
        else if (digitsOnly) score = 0;
        else if (c.includes(t)) score = 500 + t.length;
        else if (t.includes(c) && c.length >= 3) score = 300 + c.length;
        if (score > (best?.score ?? 0)) best = { book: b, score };
      }
    }
  }

  return best && best.score >= 300 ? best.book : null;
}
