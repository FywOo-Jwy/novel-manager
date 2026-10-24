import { type SQLiteDatabase } from 'expo-sqlite';
import type { Tag, TagGroup, TagWithGroup } from '../types/models';

export async function listTagGroups(db: SQLiteDatabase): Promise<TagGroup[]> {
  return db.getAllAsync<TagGroup>('SELECT * FROM tag_groups ORDER BY name COLLATE NOCASE');
}

export async function listTags(db: SQLiteDatabase): Promise<TagWithGroup[]> {
  return db.getAllAsync<TagWithGroup>(
    `SELECT t.id, t.name, t.group_id, g.name AS group_name, g.color AS group_color
     FROM tags t LEFT JOIN tag_groups g ON g.id = t.group_id
     ORDER BY t.name COLLATE NOCASE`
  );
}

export async function createTagGroup(db: SQLiteDatabase, name: string, color: string | null): Promise<number> {
  const r = await db.runAsync('INSERT INTO tag_groups (name, color) VALUES (?, ?)', [name, color]);
  return r.lastInsertRowId;
}

export async function updateTagGroup(db: SQLiteDatabase, id: number, name: string, color: string | null): Promise<void> {
  await db.runAsync('UPDATE tag_groups SET name = ?, color = ? WHERE id = ?', [name, color, id]);
}

export async function deleteTagGroup(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM tag_groups WHERE id = ?', [id]);
}

export async function createTag(db: SQLiteDatabase, name: string, groupId: number | null): Promise<number> {
  const r = await db.runAsync('INSERT INTO tags (name, group_id) VALUES (?, ?)', [name, groupId]);
  return r.lastInsertRowId;
}

export async function updateTag(db: SQLiteDatabase, id: number, name: string, groupId: number | null): Promise<void> {
  await db.runAsync('UPDATE tags SET name = ?, group_id = ? WHERE id = ?', [name, groupId, id]);
}

export async function deleteTag(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM tags WHERE id = ?', [id]);
}

/** Find a tag by exact name (case-insensitive), or null if it doesn't exist. */
export async function findTagByName(db: SQLiteDatabase, name: string): Promise<Tag | null> {
  return db.getFirstAsync<Tag>('SELECT * FROM tags WHERE name = ? COLLATE NOCASE', [name]);
}

export async function countTagsInGroup(db: SQLiteDatabase, groupId: number): Promise<number> {
  const r = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM tags WHERE group_id = ?', [groupId]);
  return r?.c ?? 0;
}
