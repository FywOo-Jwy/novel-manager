import { type SQLiteDatabase } from 'expo-sqlite';
import type { Book, DashboardStats } from '../types/models';

const BOOK_COLUMNS =
  'id, title_cn, title_jp, author, illustrator, publisher, total_volumes, reading_status, publication_status, reading_volume, reading_method, cost, recovered, rating, review, cover_path, created_at, updated_at';

export async function getDashboardStats(db: SQLiteDatabase): Promise<DashboardStats> {
  const year = new Date().getFullYear();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const total = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM books');
  const readThisYear = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) AS c FROM books b
     WHERE b.reading_status = '已读'
       AND (SELECT MAX(r.end_date) FROM reading_logs r WHERE r.book_id = b.id) BETWEEN ? AND ?`,
    [yearStart, yearEnd]
  );
  const cost = await db.getFirstAsync<{ s: number | null }>(
    'SELECT SUM(cost) AS s FROM books WHERE cost IS NOT NULL'
  );
  const recovered = await db.getFirstAsync<{ s: number | null }>(
    'SELECT SUM(recovered) AS s FROM books WHERE recovered IS NOT NULL'
  );

  const currentlyReading = await db.getAllAsync<Book>(
    `SELECT ${BOOK_COLUMNS} FROM books WHERE reading_status = '在读' ORDER BY updated_at DESC`
  );
  const ongoingSeries = await db.getAllAsync<Book>(
    `SELECT ${BOOK_COLUMNS} FROM books WHERE publication_status = '连载中' ORDER BY updated_at DESC`
  );
  const lastFinished = await db.getFirstAsync<Book>(
    `SELECT ${BOOK_COLUMNS} FROM books b
     WHERE b.reading_status = '已读'
       AND (SELECT MAX(r.end_date) FROM reading_logs r WHERE r.book_id = b.id) IS NOT NULL
     ORDER BY (SELECT MAX(r.end_date) FROM reading_logs r WHERE r.book_id = b.id) DESC, b.id DESC
     LIMIT 1`
  );

  return {
    totalBooks: total?.c ?? 0,
    readThisYear: readThisYear?.c ?? 0,
    totalCost: cost?.s ?? 0,
    totalRecovered: recovered?.s ?? 0,
    currentlyReading,
    ongoingSeries,
    lastFinished,
  };
}
