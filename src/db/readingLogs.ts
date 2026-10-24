import { type SQLiteDatabase } from 'expo-sqlite';
import type { ReadingLog } from '../types/models';

export type ReadingLogDraft = Omit<ReadingLog, 'id'>;

export async function listReadingLogs(db: SQLiteDatabase, bookId: number): Promise<ReadingLog[]> {
  return db.getAllAsync<ReadingLog>(
    'SELECT * FROM reading_logs WHERE book_id = ? ORDER BY start_date IS NULL, start_date ASC, id ASC',
    [bookId]
  );
}

export async function createReadingLog(db: SQLiteDatabase, draft: ReadingLogDraft): Promise<number> {
  const r = await db.runAsync(
    'INSERT INTO reading_logs (book_id, start_date, end_date, start_volume, end_volume) VALUES (?, ?, ?, ?, ?)',
    [draft.book_id, draft.start_date, draft.end_date, draft.start_volume, draft.end_volume]
  );
  return r.lastInsertRowId;
}

export async function updateReadingLog(db: SQLiteDatabase, id: number, draft: ReadingLogDraft): Promise<void> {
  await db.runAsync(
    'UPDATE reading_logs SET book_id = ?, start_date = ?, end_date = ?, start_volume = ?, end_volume = ? WHERE id = ?',
    [draft.book_id, draft.start_date, draft.end_date, draft.start_volume, draft.end_volume, id]
  );
}

export async function deleteReadingLog(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM reading_logs WHERE id = ?', [id]);
}

/** Replace every reading log of a book with the given set (used by the edit form). */
export async function replaceReadingLogs(db: SQLiteDatabase, bookId: number, drafts: ReadingLogDraft[]): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM reading_logs WHERE book_id = ?', [bookId]);
    for (const d of drafts) {
      await createReadingLog(db, { ...d, book_id: bookId });
    }
  });
}
