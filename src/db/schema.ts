import { type SQLiteDatabase } from 'expo-sqlite';

const SCHEMA_VERSION = 1;

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title_cn TEXT NOT NULL,
  title_jp TEXT,
  author TEXT,
  illustrator TEXT,
  publisher TEXT,
  total_volumes REAL,
  reading_status TEXT NOT NULL DEFAULT '未读',
  publication_status TEXT,
  reading_volume REAL,
  reading_method TEXT,
  cost REAL,
  recovered REAL,
  rating INTEGER,
  review TEXT,
  cover_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reading_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  start_date TEXT,
  end_date TEXT,
  start_volume REAL,
  end_volume REAL
);
CREATE INDEX IF NOT EXISTS idx_reading_logs_book ON reading_logs(book_id);

CREATE TABLE IF NOT EXISTS tag_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  group_id INTEGER REFERENCES tag_groups(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS book_tags (
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, tag_id)
);

CREATE TABLE IF NOT EXISTS epub_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  file_path TEXT,
  volume_number REAL,
  type TEXT NOT NULL,
  is_cover_source INTEGER NOT NULL DEFAULT 0,
  UNIQUE (book_id, type, volume_number)
);
`;

export async function migrateDbIfNeeded(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version < 1) {
    await db.execAsync(SCHEMA_V1);
    await db.execAsync('PRAGMA user_version = 1');
  }
}
