/**
 * 「绿站」(n.novelia.cc) 书籍页信息抓取。
 *
 * 站点是 SSR 渲染的 Vue 页面，关键信息都能从 HTML 里直接读到：
 *  - 中文译名：<h2 class="n-h n-h2 …"><b>书名</b></h2>
 *  - 日文原名：<p class="n-p …">原名：…</p>
 *  - 最新出版：<p class="n-p …"> 最新出版于 <time>2026-10-20</time></p>
 *  - 作者 / 画师 / 出版：<div label="作者" tags="枩葉松">，值在 tags 属性里（英文逗号分隔）
 *  - 封面：<img … alt="cover">
 *
 * 注意：书籍页没有「总卷数」字段，故不抓取。
 */

export interface NoveliaInfo {
  /** 中文译名 */
  titleCn: string | null;
  /** 日文原名 */
  titleJp: string | null;
  author: string | null;
  illustrator: string | null;
  /** 文库（出版标签的第二个值，如「オーバーラップ文庫」） */
  publisher: string | null;
  /** 出版社（出版标签的第一个值，如「オーバーラップ」） */
  label: string | null;
  /** 最新一卷出版日期，ISO YYYY-MM-DD */
  latestPublishDate: string | null;
  /** 封面图地址（用户未勾选封面时不使用） */
  coverUrl: string | null;
  /** 原始书页地址 */
  sourceUrl: string;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-zA-Z]+);/g, (m, name: string) => ENTITIES[name] ?? m);
}

function stripTags(input: string): string {
  return decodeEntities(input.replace(/<[^>]*>/g, '')).trim();
}

/** 从 label="作者" tags="A,B" 属性里取值（站点把值放在 tags 上，最省事也最稳）。 */
function readTaggedField(html: string, label: string): string[] | null {
  const re = new RegExp(`label="${label}"\\s+tags="([^"]*)"`);
  const m = re.exec(html);
  if (!m) return null;
  const values = decodeEntities(m[1])
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return values.length ? values : null;
}

function firstMatch(html: string, re: RegExp): string | null {
  const m = re.exec(html);
  return m ? decodeEntities(m[1]).trim() : null;
}

export function parseNoveliaHtml(html: string, sourceUrl = ''): NoveliaInfo {
  const titleCn = firstMatch(html, /<h2[^>]*class="[^"]*n-h2[^"]*"[^>]*>\s*<b>([\s\S]*?)<\/b>/i)
    ?? firstMatch(html, /<h2[^>]*>\s*<b>([\s\S]*?)<\/b>/i);

  const titleJp = firstMatch(html, /原名[:：]\s*([^<]+)/);
  const latest = firstMatch(html, /最新出版于\s*<time>([^<]+)<\/time>/i);
  const dateMatch = latest ? /(\d{4})[-./年](\d{1,2})[-./月](\d{1,2})/.exec(latest) : null;
  const latestPublishDate = dateMatch
    ? `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`
    : null;

  const authors = readTaggedField(html, '作者');
  const illustrators = readTaggedField(html, '画师');
  const published = readTaggedField(html, '出版');

  const coverUrl = firstMatch(html, /<img[^>]*alt="cover"[^>]*src="([^"]+)"/i)
    ?? firstMatch(html, /<img[^>]*src="([^"]+)"[^>]*alt="cover"/i);

  return {
    titleCn: titleCn ? stripTags(titleCn) : null,
    titleJp,
    author: authors ? authors.join(' / ') : null,
    illustrator: illustrators ? illustrators.join(' / ') : null,
    // 出版标签通常是「出版社, 文库」，取文库；只有一个值时就用它
    publisher: published ? published[published.length - 1] : null,
    label: published && published.length > 1 ? published[0] : null,
    latestPublishDate,
    coverUrl,
    sourceUrl,
  };
}

const UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

/** 接受完整 URL，也接受 `/wenku/<id>` 这样的相对路径。 */
export function normalizeNoveliaUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) {
    const lower = raw.toLowerCase();
    if (!lower.includes('novelia.cc')) return null;
    return raw;
  }
  const path = raw.startsWith('/') ? raw : `/${raw}`;
  if (!/^\/wenku\//.test(path)) return null;
  return `https://n.novelia.cc${path}`;
}

export async function fetchNovelia(url: string): Promise<NoveliaInfo> {
  const normalized = normalizeNoveliaUrl(url);
  if (!normalized) throw new Error('请填写绿站书籍页链接（n.novelia.cc/wenku/…）');

  let res: Response;
  try {
    res = await fetch(normalized, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9,ja;q=0.8',
      },
    });
  } catch {
    throw new Error('网络请求失败，请检查网络或链接是否正确');
  }
  if (!res.ok) throw new Error(`请求失败（HTTP ${res.status}）`);

  const html = await res.text();
  if (!html.includes('n-tag__content') && !html.includes('n-h2')) {
    throw new Error('返回内容不是书籍页，请确认链接');
  }
  const info = parseNoveliaHtml(html, normalized);
  if (!info.titleCn && !info.titleJp) throw new Error('未能识别书籍信息，页面结构可能已变化');
  return info;
}
