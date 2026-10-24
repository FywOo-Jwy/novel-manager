/** Format a nullable numeric value (volume / money) for display. */

export function formatVolume(v: number | null | undefined): string {
  if (v == null) return '';
  return String(v);
}

/** Trim trailing zeros: 7.50 -> 7.5, 7.00 -> 7 */
export function trimNumber(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return String(v).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

/** Money in CNY (人民币). Empty when null. */
export function formatMoney(v: number | null | undefined): string {
  if (v == null) return '';
  return `¥${trimNumber(Math.round(v * 100) / 100)}`;
}

export function formatRating(v: number | null | undefined): string {
  if (v == null) return '';
  return `${v}`;
}

/** Parse a user-typed number, returning null for empty / invalid input. */
export function parseOptionalNumber(text: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  const n = Number(t);
  if (Number.isNaN(n)) return null;
  return n;
}
