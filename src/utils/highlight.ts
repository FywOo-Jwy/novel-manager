export interface HighlightSegment {
  text: string;
  hit: boolean;
}

/** Split `text` into segments, marking case-insensitive matches of `query` as hits. */
export function splitHighlight(text: string, query: string): HighlightSegment[] {
  const q = query.trim();
  if (!q) return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  const segments: HighlightSegment[] = [];
  let idx = 0;
  let pos = lower.indexOf(ql);
  while (pos !== -1) {
    if (pos > idx) segments.push({ text: text.slice(idx, pos), hit: false });
    segments.push({ text: text.slice(pos, pos + q.length), hit: true });
    idx = pos + q.length;
    pos = lower.indexOf(ql, idx);
  }
  if (idx < text.length) segments.push({ text: text.slice(idx), hit: false });
  return segments.length > 0 ? segments : [{ text, hit: false }];
}
