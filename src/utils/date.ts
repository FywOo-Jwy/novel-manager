/** Dates are stored in SQLite as ISO `YYYY-MM-DD` and displayed as `YYYY.MM.DD`. */

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** `YYYY-MM-DD` → `YYYY.MM.DD` */
export function displayDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return iso.replace(/-/g, '.');
}

export function todayIso(): string {
  const d = new Date();
  return toIsoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export function currentYear(): number {
  return new Date().getFullYear();
}

/** Parse an ISO `YYYY-MM-DD` string into a Date (local time). */
export function parseIsoDate(iso: string): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Human-friendly timestamp for "最近修改" display. */
export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}
