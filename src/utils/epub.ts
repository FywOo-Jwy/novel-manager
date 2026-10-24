import { File, Paths } from 'expo-file-system';
import JSZip from 'jszip';
import { ensureDirs, uniqueRelName, COVER_DIR } from './files';

export interface ExtractedCover {
  bytes: Uint8Array;
  ext: string;
}

function extFromHref(href: string): string {
  const lower = href.toLowerCase();
  const m = lower.match(/\.(jpe?g|png|gif|webp|bmp)$/);
  return m ? `.${m[1] === 'jpeg' ? 'jpg' : m[1]}` : '.jpg';
}

function resolvePath(baseDir: string, href: string): string {
  let h = href;
  try {
    h = decodeURIComponent(h);
  } catch {
    // keep raw
  }
  return baseDir + h;
}

/** Locate the package document (`.opf`) inside an opened epub archive. */
async function findOpfPath(zip: JSZip): Promise<string | null> {
  const container = zip.file('META-INF/container.xml');
  if (container) {
    const xml = await container.async('text');
    const m = xml.match(/full-path="([^"]+)"/i);
    if (m) return m[1];
  }
  return (
    Object.keys(zip.files).find(
      (n) => n.toLowerCase().endsWith('.opf') && !n.startsWith('__MACOSX')
    ) ?? null
  );
}

function xmlText(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function firstTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = xml.match(re);
  if (!m) return null;
  const text = xmlText(m[1]);
  return text.length ? text : null;
}

export interface EpubMeta {
  title: string | null;
  creator: string | null;
}

/** Read `dc:title` / `dc:creator` from an epub, used to auto-match books on batch import. */
export async function readEpubMeta(srcBytes: Uint8Array): Promise<EpubMeta> {
  try {
    const zip = await JSZip.loadAsync(srcBytes);
    const opfPath = await findOpfPath(zip);
    if (!opfPath) return { title: null, creator: null };
    const entry = zip.file(opfPath);
    if (!entry) return { title: null, creator: null };
    const opfXml = await entry.async('text');
    return {
      title: firstTag(opfXml, 'dc:title'),
      creator: firstTag(opfXml, 'dc:creator'),
    };
  } catch {
    return { title: null, creator: null };
  }
}

/** Parse an epub's bytes and locate its cover image, returning the image bytes + extension. */
export async function extractEpubCover(srcBytes: Uint8Array): Promise<ExtractedCover | null> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(srcBytes);
  } catch {
    return null;
  }

  // 1. Locate the OPF path.
  const opfPath = await findOpfPath(zip);
  if (!opfPath) return null;

  const opfEntry = zip.file(opfPath);
  if (!opfEntry) return null;
  const opfXml = await opfEntry.async('text');
  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';

  // 2. Find the cover image href.
  let coverId: string | null = null;
  let coverHref: string | null = null;

  const metaCover = opfXml.match(/<meta[^>]*name=["']cover["'][^>]*content=["']([^"']+)["']/i);
  if (metaCover) coverId = metaCover[1];

  const coverPropItem = opfXml.match(/<item[^>]*properties=["'][^"']*cover-image[^"']*["'][^>]*\/?>/i);
  if (coverPropItem) {
    const href = coverPropItem[0].match(/href=["']([^"']+)["']/i);
    const id = coverPropItem[0].match(/id=["']([^"']+)["']/i);
    if (href) coverHref = href[1];
    if (!coverId && id) coverId = id[1];
  }

  if (!coverHref && coverId) {
    const esc = coverId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m1 = opfXml.match(new RegExp(`<item[^>]*id=["']${esc}["'][^>]*href=["']([^"']+)["']`, 'i'));
    const m2 = opfXml.match(new RegExp(`<item[^>]*href=["']([^"']+)["'][^>]*id=["']${esc}["']`, 'i'));
    if (m1) coverHref = m1[1];
    else if (m2) coverHref = m2[1];
  }

  if (!coverHref) return null;
  const coverPath = resolvePath(opfDir, coverHref);
  const coverEntry = zip.file(coverPath) ?? zip.file(coverHref);
  if (!coverEntry) return null;

  let bytes: Uint8Array;
  try {
    bytes = await coverEntry.async('uint8array');
  } catch {
    return null;
  }
  return { bytes, ext: extFromHref(coverHref) };
}

/** Extract the cover and write it into the app's covers directory, returning the relative path. */
export async function extractEpubCoverToStorage(srcBytes: Uint8Array): Promise<string | null> {
  const cover = await extractEpubCover(srcBytes);
  if (!cover) return null;
  ensureDirs();
  const rel = uniqueRelName(COVER_DIR, cover.ext);
  await new File(Paths.document, rel).write(cover.bytes);
  return rel;
}
