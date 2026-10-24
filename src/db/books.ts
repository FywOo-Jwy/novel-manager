import { type SQLiteDatabase } from 'expo-sqlite';
import type { Book, BookWithTags, Filters, SortState, TagWithGroup } from '../types/models';
import { deleteRelFile } from '../utils/files';

export type BookDraft = Omit<Book, 'id' | 'created_at' | 'updated_at'>;

const BOOK_COLUMNS =
  'id, title_cn, title_jp, author, illustrator, publisher, total_volumes, reading_status, publication_status, reading_volume, reading_method, cost, recovered, rating, review, cover_path, created_at, updated_at';

function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => '\\' + c);
}

export async function getBook(db: SQLiteDatabase, id: number): Promise<Book | null> {
  return db.getFirstAsync<Book>(`SELECT ${BOOK_COLUMNS} FROM books WHERE id = ?`, [id]);
}

export async function getBookWithTags(db: SQLiteDatabase, id: number): Promise<BookWithTags | null> {
  const book = await getBook(db, id);
  if (!book) return null;
  const tags = await getBookTags(db, id);
  return { ...book, tags };
}

export async function getBookTags(db: SQLiteDatabase, bookId: number): Promise<TagWithGroup[]> {
  return db.getAllAsync<TagWithGroup>(
    `SELECT t.id, t.name, t.group_id, g.name AS group_name, g.color AS group_color
     FROM tags t
     JOIN book_tags bt ON bt.tag_id = t.id
     LEFT JOIN tag_groups g ON g.id = t.group_id
     WHERE bt.book_id = ? ORDER BY t.name COLLATE NOCASE`,
    [bookId]
  );
}

export async function createBook(db: SQLiteDatabase, draft: BookDraft): Promise<number> {
  const now = new Date().toISOString();
  const r = await db.runAsync(
    `INSERT INTO books
       (title_cn, title_jp, author, illustrator, publisher, total_volumes, reading_status,
        publication_status, reading_volume, reading_method, cost, recovered, rating, review,
        cover_path, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      draft.title_cn,
      draft.title_jp,
      draft.author,
      draft.illustrator,
      draft.publisher,
      draft.total_volumes,
      draft.reading_status,
      draft.publication_status,
      draft.reading_volume,
      draft.reading_method,
      draft.cost,
      draft.recovered,
      draft.rating,
      draft.review,
      draft.cover_path,
      now,
      now,
    ]
  );
  return r.lastInsertRowId;
}

export async function updateBook(db: SQLiteDatabase, id: number, draft: BookDraft): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE books SET
       title_cn = ?, title_jp = ?, author = ?, illustrator = ?, publisher = ?,
       total_volumes = ?, reading_status = ?, publication_status = ?, reading_volume = ?,
       reading_method = ?, cost = ?, recovered = ?, rating = ?, review = ?,
       cover_path = ?, updated_at = ?
     WHERE id = ?`,
    [
      draft.title_cn,
      draft.title_jp,
      draft.author,
      draft.illustrator,
      draft.publisher,
      draft.total_volumes,
      draft.reading_status,
      draft.publication_status,
      draft.reading_volume,
      draft.reading_method,
      draft.cost,
      draft.recovered,
      draft.rating,
      draft.review,
      draft.cover_path,
      now,
      id,
    ]
  );
}

export async function setBookTags(db: SQLiteDatabase, bookId: number, tagIds: number[]): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM book_tags WHERE book_id = ?', [bookId]);
    for (const tagId of tagIds) {
      await db.runAsync('INSERT OR IGNORE INTO book_tags (book_id, tag_id) VALUES (?, ?)', [bookId, tagId]);
    }
  });
}

/** Set (or clear) a book's cover path, touching its updated_at timestamp. */
export async function setBookCover(db: SQLiteDatabase, id: number, coverPath: string | null): Promise<void> {
  await db.runAsync('UPDATE books SET cover_path = ?, updated_at = ? WHERE id = ?', [
    coverPath,
    new Date().toISOString(),
    id,
  ]);
}

export async function deleteBook(db: SQLiteDatabase, id: number): Promise<void> {
  const cover = await db.getFirstAsync<{ cover_path: string | null }>(
    'SELECT cover_path FROM books WHERE id = ?',
    [id]
  );
  const epubs = await db.getAllAsync<{ file_path: string | null }>(
    'SELECT file_path FROM epub_files WHERE book_id = ?',
    [id]
  );
  await db.runAsync('DELETE FROM books WHERE id = ?', [id]);
  deleteRelFile(cover?.cover_path);
  for (const e of epubs) deleteRelFile(e.file_path);
}

export async function getDistinctAuthors(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ author: string | null }>(
    `SELECT DISTINCT author FROM books WHERE author IS NOT NULL AND author != '' ORDER BY author COLLATE NOCASE`
  );
  return rows.map((r) => r.author as string);
}

export async function getDistinctPublishers(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ publisher: string | null }>(
    `SELECT DISTINCT publisher FROM books WHERE publisher IS NOT NULL AND publisher != '' ORDER BY publisher COLLATE NOCASE`
  );
  return rows.map((r) => r.publisher as string);
}

interface ListBooksArgs {
  sort: SortState;
  filters?: Filters;
  search?: string;
}

export async function listBooks(db: SQLiteDatabase, args: ListBooksArgs): Promise<Book[]> {
  const { sort, filters, search } = args;
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (search && search.trim()) {
    const pat = `%${escapeLike(search.trim())}%`;
    const field = (col: string) =>
      `(b.${col} IS NOT NULL AND b.${col} LIKE ? ESCAPE '\\')`;
    where.push(
      `(${field('title_cn')} OR ${field('title_jp')} OR ${field('author')} OR ${field('illustrator')} OR ${field('publisher')} OR ${field('review')} ` +
        `OR EXISTS (SELECT 1 FROM book_tags bt JOIN tags t ON t.id = bt.tag_id ` +
        `WHERE bt.book_id = b.id AND t.name LIKE ? ESCAPE '\\'))`
    );
    params.push(pat, pat, pat, pat, pat, pat, pat);
  }

  if (filters) {
    const inClause = (col: string, values: unknown[]) => {
      where.push(`b.${col} IN (${values.map(() => '?').join(',')})`);
      params.push(...(values as (string | number)[]));
    };
    if (filters.readingStatuses.length) inClause('reading_status', filters.readingStatuses);
    if (filters.publicationStatuses.length) inClause('publication_status', filters.publicationStatuses);
    if (filters.authors.length) inClause('author', filters.authors);
    if (filters.publishers.length) inClause('publisher', filters.publishers);
    if (filters.readingMethods.length) inClause('reading_method', filters.readingMethods);
    if (filters.includeTagIds.length) {
      where.push(
        `EXISTS (SELECT 1 FROM book_tags bt WHERE bt.book_id = b.id AND bt.tag_id IN (${filters.includeTagIds.map(() => '?').join(',')}))`
      );
      params.push(...filters.includeTagIds);
    }
    if (filters.excludeTagIds.length) {
      where.push(
        `NOT EXISTS (SELECT 1 FROM book_tags bt WHERE bt.book_id = b.id AND bt.tag_id IN (${filters.excludeTagIds.map(() => '?').join(',')}))`
      );
      params.push(...filters.excludeTagIds);
    }
  }

  const dir = sort.direction === 'asc' ? 'ASC' : 'DESC';
  let orderBy: string;
  switch (sort.key) {
    case 'rating':
      orderBy = `(b.rating IS NULL), b.rating ${dir}`;
      break;
    case 'title_cn':
      orderBy = `b.title_cn COLLATE NOCASE ${dir}`;
      break;
    case 'author':
      orderBy = `(b.author IS NULL OR b.author = ''), b.author COLLATE NOCASE ${dir}`;
      break;
    case 'total_volumes':
      orderBy = `(b.total_volumes IS NULL), b.total_volumes ${dir}`;
      break;
    case 'updated_at':
    default:
      orderBy = `b.updated_at ${dir}`;
      break;
  }

  const sql = `SELECT ${BOOK_COLUMNS} FROM books b ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${orderBy}, b.id DESC`;
  return db.getAllAsync<Book>(sql, params);
}
