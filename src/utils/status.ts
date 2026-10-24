import { theme } from '@/theme/theme';
import type { ReadingStatus, PublicationStatus } from '@/types/models';

export function readingStatusColor(s: ReadingStatus): string {
  switch (s) {
    case '在读':
      return '#90CAF9';
    case '已读':
      return '#A5D6A7';
    case '弃书':
      return '#FFAB91';
    case '未读':
    default:
      return theme.colors.onSurfaceVariant;
  }
}

export function publicationStatusColor(s: PublicationStatus): string {
  switch (s) {
    case '连载中':
      return '#FFCC80';
    case '已完结':
      return '#A5D6A7';
    default:
      return theme.colors.onSurfaceVariant;
  }
}

/** Short supporting line for a book card, e.g. "在读 · 第 3 卷 / 共 7 卷". */
export function bookSupporting(book: {
  reading_status: ReadingStatus;
  reading_volume: number | null;
  total_volumes: number | null;
}): string {
  const parts: string[] = [book.reading_status];
  if (book.reading_volume != null || book.total_volumes != null) {
    const cur = book.reading_volume != null ? `第 ${book.reading_volume} 卷` : null;
    const total = book.total_volumes != null ? `共 ${book.total_volumes} 卷` : null;
    const vol = [cur, total].filter(Boolean).join(' / ');
    if (vol) parts.push(vol);
  }
  return parts.join(' · ');
}
