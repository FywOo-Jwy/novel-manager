import { type SQLiteDatabase } from 'expo-sqlite';
import { Directory, File, Paths } from 'expo-file-system';
import JSZip from 'jszip';
import { ensureDirs, epubsDir, coversDir } from '../utils/files';

const APP_KEY = 'novel-manager';
const BACKUP_VERSION = 1;

const TABLES = ['books', 'reading_logs', 'tag_groups', 'tags', 'book_tags', 'epub_files'] as const;

type Row = Record<string, unknown>;

interface BackupManifest {
  app: string;
  version: number;
  exportedAt: string;
  tables: Record<string, Row[]>;
  files: string[];
}

function dateStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function splitRel(rel: string): { dir: string; name: string } {
  const idx = rel.lastIndexOf('/');
  return idx < 0 ? { dir: '', name: rel } : { dir: rel.slice(0, idx), name: rel.slice(idx + 1) };
}

function clearFiles(): void {
  for (const d of [epubsDir(), coversDir()]) {
    if (d.exists) d.delete();
  }
  ensureDirs();
}

/** Build a backup zip in the cache directory and return its File (ready to share). */
export async function exportBackup(db: SQLiteDatabase): Promise<File> {
  const tables: Record<string, Row[]> = {};
  for (const t of TABLES) {
    tables[t] = await db.getAllAsync<Row>(`SELECT * FROM ${t}`);
  }

  const files = new Set<string>();
  for (const b of tables.books) if (b.cover_path) files.add(String(b.cover_path));
  for (const e of tables.epub_files) if (e.file_path) files.add(String(e.file_path));

  const manifest: BackupManifest = {
    app: APP_KEY,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tables,
    files: [...files],
  };

  const zip = new JSZip();
  zip.file('backup.json', JSON.stringify(manifest));
  for (const rel of manifest.files) {
    const f = new File(Paths.document, rel);
    if (f.exists) zip.file(`files/${rel}`, await f.bytes());
  }

  const zipBytes = await zip.generateAsync({ type: 'uint8array' });
  const out = new File(Paths.cache, `${APP_KEY}-backup-${dateStamp()}.zip`);
  await out.write(zipBytes);
  return out;
}

async function insertAll(db: SQLiteDatabase, table: string, rows: Row[]): Promise<void> {
  for (const row of rows) {
    const cols = Object.keys(row);
    if (!cols.length) continue;
    const placeholders = cols.map(() => '?').join(',');
    const sql = `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${placeholders})`;
    await db.runAsync(sql, cols.map((c) => row[c] as string | number | null));
  }
}

/**
 * Restore a backup zip: clears the local database and file store, then re-inserts
 * every row (preserving ids) and re-writes every referenced file.
 */
export async function importBackup(db: SQLiteDatabase, source: File): Promise<void> {
  const bytes = await source.bytes();
  const zip = await JSZip.loadAsync(bytes);

  const manifestEntry = zip.file('backup.json');
  if (!manifestEntry) throw new Error('无效的备份文件（缺少 backup.json）');
  const manifest = JSON.parse(await manifestEntry.async('text')) as BackupManifest;
  if (manifest.app !== APP_KEY) throw new Error('无效的备份文件（app 标识不符）');

  await db.withExclusiveTransactionAsync(async () => {
    await db.execAsync('DELETE FROM book_tags');
    await db.execAsync('DELETE FROM epub_files');
    await db.execAsync('DELETE FROM reading_logs');
    await db.execAsync('DELETE FROM tags');
    await db.execAsync('DELETE FROM tag_groups');
    await db.execAsync('DELETE FROM books');
  });

  clearFiles();

  for (const rel of manifest.files) {
    const entry = zip.file(`files/${rel}`);
    if (!entry) continue;
    const b = await entry.async('uint8array');
    const { dir, name } = splitRel(rel);
    const f = dir ? new File(new Directory(Paths.document, dir), name) : new File(Paths.document, name);
    await f.write(b);
  }

  await db.withExclusiveTransactionAsync(async () => {
    await insertAll(db, 'books', manifest.tables.books ?? []);
    await insertAll(db, 'tag_groups', manifest.tables.tag_groups ?? []);
    await insertAll(db, 'tags', manifest.tables.tags ?? []);
    await insertAll(db, 'book_tags', manifest.tables.book_tags ?? []);
    await insertAll(db, 'reading_logs', manifest.tables.reading_logs ?? []);
    await insertAll(db, 'epub_files', manifest.tables.epub_files ?? []);
  });
}
