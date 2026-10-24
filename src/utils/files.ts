import { Directory, File, Paths } from 'expo-file-system';

/** Subdirectories under the app document directory. */
export const EPUB_DIR = 'epubs';
export const COVER_DIR = 'covers';

export function epubsDir(): Directory {
  return new Directory(Paths.document, EPUB_DIR);
}

export function coversDir(): Directory {
  return new Directory(Paths.document, COVER_DIR);
}

export function ensureDirs(): void {
  for (const d of [epubsDir(), coversDir()]) {
    if (!d.exists) d.create({ intermediates: true, idempotent: true });
  }
}

/** Resolve a stored relative path (e.g. `epubs/x.epub`) to a full `file://` URI. */
export function resolveFileUri(relPath: string | null | undefined): string | null {
  if (!relPath) return null;
  return new File(Paths.document, relPath).uri;
}

export function fileFromRel(relPath: string): File {
  return new File(Paths.document, relPath);
}

export function deleteRelFile(relPath: string | null | undefined): void {
  if (!relPath) return;
  try {
    const f = new File(Paths.document, relPath);
    if (f.exists) f.delete();
  } catch {
    // best-effort cleanup
  }
}

/** Generate a unique relative filename under a subdirectory. */
export function uniqueRelName(subdir: string, ext: string): string {
  const slug = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${subdir}/${slug}${ext}`;
}

/** Copy a picked source file's bytes into a subdirectory under app storage; returns the relative path. */
export async function importFileToStorage(src: File, subdir: string): Promise<string> {
  ensureDirs();
  const bytes = await src.bytes();
  const ext = src.extension || '';
  const rel = uniqueRelName(subdir, ext);
  await new File(Paths.document, rel).write(bytes);
  return rel;
}
