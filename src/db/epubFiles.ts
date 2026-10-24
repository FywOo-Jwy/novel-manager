import { type SQLiteDatabase } from 'expo-sqlite';
import type { EpubFile } from '../types/models';
import { deleteRelFile } from '../utils/files';

export type EpubFileDraft = Omit<EpubFile, 'id'>;

export async function listEpubFiles(db: SQLiteDatabase, bookId: number): Promise<EpubFile[]> {
  return db.getAllAsync<EpubFile>(
    'SELECT * FROM epub_files WHERE book_id = ? ORDER BY type ASC, volume_number ASC, id ASC',
    [bookId]
  );
}

export async function addEpubFile(db: SQLiteDatabase, draft: EpubFileDraft): Promise<number> {
  const r = await db.runAsync(
    'INSERT INTO epub_files (book_id, file_path, volume_number, type, is_cover_source) VALUES (?, ?, ?, ?, ?)',
    [draft.book_id, draft.file_path, draft.volume_number, draft.type, draft.is_cover_source]
  );
  return r.lastInsertRowId;
}

export async function updateEpubFile(db: SQLiteDatabase, id: number, draft: EpubFileDraft): Promise<void> {
  await db.runAsync(
    'UPDATE epub_files SET book_id = ?, file_path = ?, volume_number = ?, type = ?, is_cover_source = ? WHERE id = ?',
    [draft.book_id, draft.file_path, draft.volume_number, draft.type, draft.is_cover_source, id]
  );
}

export async function deleteEpubFile(db: SQLiteDatabase, id: number): Promise<void> {
  const row = await db.getFirstAsync<{ file_path: string | null }>(
    'SELECT file_path FROM epub_files WHERE id = ?',
    [id]
  );
  await db.runAsync('DELETE FROM epub_files WHERE id = ?', [id]);
  deleteRelFile(row?.file_path);
}

/** Clear the cover-source flag on every epub of a book. */
export async function clearCoverSource(db: SQLiteDatabase, bookId: number): Promise<void> {
  await db.runAsync('UPDATE epub_files SET is_cover_source = 0 WHERE book_id = ?', [bookId]);
}

/** Mark one epub as the cover source for its book (clearing the others first). */
export async function setCoverSource(db: SQLiteDatabase, id: number, bookId: number): Promise<void> {
  await db.withTransactionAsync(async () => {
    await clearCoverSource(db, bookId);
    await db.runAsync('UPDATE epub_files SET is_cover_source = 1 WHERE id = ?', [id]);
  });
}
