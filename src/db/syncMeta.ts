import { type SQLiteDatabase } from 'expo-sqlite';

/**
 * 抓取来源记录：记住每本书对应的绿站链接，方便下次一键重新抓取。
 * 这张表不参与备份导出（导出导入格式保持不变）。
 */
export async function getSyncUrl(db: SQLiteDatabase, bookId: number): Promise<string | null> {
  const row = await db.getFirstAsync<{ url: string }>(
    'SELECT url FROM sync_meta WHERE book_id = ?',
    [bookId]
  );
  return row?.url ?? null;
}

export async function setSyncUrl(db: SQLiteDatabase, bookId: number, url: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO sync_meta (book_id, url, synced_at) VALUES (?, ?, ?)
     ON CONFLICT(book_id) DO UPDATE SET url = excluded.url, synced_at = excluded.synced_at`,
    [bookId, url, new Date().toISOString()]
  );
}

export async function clearSyncUrl(db: SQLiteDatabase, bookId: number): Promise<void> {
  await db.runAsync('DELETE FROM sync_meta WHERE book_id = ?', [bookId]);
}
