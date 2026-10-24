import { type SQLiteDatabase } from 'expo-sqlite';
import { Directory, File, Paths } from 'expo-file-system';
import JSZip from 'jszip';
import { ensureDirs, epubsDir, coversDir } from '../utils/files';
import { ZipWriter } from '../utils/zipWriter';

const APP_KEY = 'novel-manager';
const BACKUP_VERSION = 1;

const TABLES = [
  'books',
  'reading_logs',
  'tag_groups',
  'tags',
  'book_tags',
  'epub_files',
  'publishers',
] as const;

type Row = Record<string, unknown>;

interface BackupManifest {
  app: string;
  version: number;
  exportedAt: string;
  tables: Record<string, Row[]>;
  files: string[];
  /** 仅导出数据库（不含 epub/封面）时标记，导入时保留本机已有文件。 */
  dataOnly?: boolean;
}

export interface BackupProgress {
  phase: 'tables' | 'files' | 'done';
  done: number;
  total: number;
  label?: string;
}

export interface ExportOptions {
  /** 是否把 epub / 封面一起打包。false = 只导出书库数据（秒级）。 */
  includeFiles?: boolean;
  onProgress?: (p: BackupProgress) => void;
}

function dateStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function clearFiles(): void {
  for (const d of [epubsDir(), coversDir()]) {
    if (d.exists) d.delete();
  }
  ensureDirs();
}

/** 删掉缓存里旧的备份包，只保留刚生成的那一个。 */
function pruneOldBackups(keep: File): void {
  try {
    const cache = new Directory(Paths.cache);
    for (const entry of cache.list()) {
      if (!(entry instanceof File)) continue;
      if (!entry.name.startsWith(`${APP_KEY}-backup-`)) continue;
      if (entry.uri === keep.uri) continue;
      entry.delete();
    }
  } catch {
    // 清理失败不影响导出结果
  }
}

/**
 * 生成备份 zip：逐条写入磁盘 + STORE（不再整包驻留内存 / 不再重复压缩 epub）。
 * 默认包含 epub 与封面；includeFiles=false 时只导出数据库。
 */
export async function exportBackup(db: SQLiteDatabase, opts: ExportOptions = {}): Promise<File> {
  const includeFiles = opts.includeFiles !== false;
  const report = opts.onProgress ?? (() => {});

  const tables: Record<string, Row[]> = {};
  for (const t of TABLES) {
    tables[t] = await db.getAllAsync<Row>(`SELECT * FROM ${t}`);
  }
  report({ phase: 'tables', done: TABLES.length, total: TABLES.length });

  const files = new Set<string>();
  if (includeFiles) {
    for (const b of tables.books) if (b.cover_path) files.add(String(b.cover_path));
    for (const e of tables.epub_files) if (e.file_path) files.add(String(e.file_path));
  }

  const manifest: BackupManifest = {
    app: APP_KEY,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tables,
    files: [...files],
  };
  if (!includeFiles) manifest.dataOnly = true;

  const out = new File(Paths.cache, `${APP_KEY}-backup-${dateStamp()}.zip`);
  const zip = await ZipWriter.create(out);
  await zip.addBytes('backup.json', new TextEncoder().encode(JSON.stringify(manifest)));

  const list = [...files];
  let done = 0;
  for (const rel of list) {
    const f = new File(Paths.document, rel);
    if (f.exists) {
      const bytes = await f.bytes();
      await zip.addBytes(`files/${rel}`, bytes);
    }
    done += 1;
    report({ phase: 'files', done, total: list.length, label: rel });
  }

  await zip.finish();
  pruneOldBackups(out);
  report({ phase: 'done', done: list.length, total: list.length });
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

function splitRel(rel: string): { dir: string; name: string } {
  const idx = rel.lastIndexOf('/');
  return idx < 0 ? { dir: '', name: rel } : { dir: rel.slice(0, idx), name: rel.slice(idx + 1) };
}

/**
 * Restore a backup zip: clears the local database and file store, then re-inserts
 * every row (preserving ids) and re-writes every referenced file.
 *
 * 由「仅数据」模式导出的包（dataOnly）不会清空本机的 epub/封面文件。
 */
export async function importBackup(
  db: SQLiteDatabase,
  source: File,
  onProgress?: (p: BackupProgress) => void
): Promise<void> {
  const report = onProgress ?? (() => {});
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
    await db.execAsync('DELETE FROM publishers');
  });

  const dataOnly = manifest.dataOnly === true;
  if (!dataOnly) clearFiles();

  const files = manifest.files ?? [];
  let done = 0;
  for (const rel of files) {
    const entry = zip.file(`files/${rel}`);
    if (entry) {
      const b = await entry.async('uint8array');
      const { dir, name } = splitRel(rel);
      const f = dir ? new File(new Directory(Paths.document, dir), name) : new File(Paths.document, name);
      await f.write(b);
    }
    done += 1;
    report({ phase: 'files', done, total: files.length, label: rel });
  }

  await db.withExclusiveTransactionAsync(async () => {
    await insertAll(db, 'books', manifest.tables.books ?? []);
    await insertAll(db, 'tag_groups', manifest.tables.tag_groups ?? []);
    await insertAll(db, 'tags', manifest.tables.tags ?? []);
    await insertAll(db, 'book_tags', manifest.tables.book_tags ?? []);
    await insertAll(db, 'reading_logs', manifest.tables.reading_logs ?? []);
    await insertAll(db, 'epub_files', manifest.tables.epub_files ?? []);
    await insertAll(db, 'publishers', manifest.tables.publishers ?? []);
  });

  report({ phase: 'done', done, total: files.length });
}
