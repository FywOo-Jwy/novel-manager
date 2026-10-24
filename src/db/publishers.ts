import { type SQLiteDatabase } from 'expo-sqlite';
import type { Publisher } from '../types/models';

export async function listPublishers(db: SQLiteDatabase): Promise<Publisher[]> {
  return db.getAllAsync<Publisher>('SELECT id, name FROM publishers ORDER BY name COLLATE NOCASE');
}

export async function findPublisherByName(db: SQLiteDatabase, name: string): Promise<Publisher | null> {
  return db.getFirstAsync<Publisher>('SELECT id, name FROM publishers WHERE name = ? COLLATE NOCASE', [name]);
}

/** 把名称加入文库清单（已存在则复用），返回其 id。 */
export async function ensurePublisher(db: SQLiteDatabase, name: string): Promise<number | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const existing = await findPublisherByName(db, trimmed);
  if (existing) return existing.id;
  const r = await db.runAsync('INSERT INTO publishers (name) VALUES (?)', [trimmed]);
  return r.lastInsertRowId;
}

/** 重命名文库，同时把书籍里引用旧名称的记录一起改掉。 */
export async function renamePublisher(db: SQLiteDatabase, id: number, newName: string): Promise<void> {
  const trimmed = newName.trim();
  if (!trimmed) return;
  const row = await db.getFirstAsync<{ name: string }>('SELECT name FROM publishers WHERE id = ?', [id]);
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE publishers SET name = ? WHERE id = ?', [trimmed, id]);
    if (row?.name && row.name !== trimmed) {
      await db.runAsync('UPDATE books SET publisher = ?, updated_at = ? WHERE publisher = ?', [
        trimmed,
        new Date().toISOString(),
        row.name,
      ]);
    }
  });
}

/** 从清单里移除文库（已引用它的书籍保持原样）。 */
export async function deletePublisher(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM publishers WHERE id = ?', [id]);
}

/** 统计某个文库名称被多少本书使用。 */
export async function countBooksInPublisher(db: SQLiteDatabase, name: string): Promise<number> {
  const row = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM books WHERE publisher = ?', [name]);
  return row?.c ?? 0;
}
