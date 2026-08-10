// RSS フィード検出・解析用ヘルパー
// Deno 標準の DOMParser を使用して HTML/XML を解析する。

export interface ArticleItem {
  title: string;
  url: string;
  summary: string;
}

// URL からテキストを取得する
async function fetchText(targetUrl: string, maxRedirects = 5): Promise<string> {
  if (maxRedirects <= 0) {
    throw new Error('リダイレクト回数が上限に達しました');
  }
  const response = await fetch(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    redirect: 'manual',
  });

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    if (location) {
      return fetchText(new URL(location, targetUrl).toString(), maxRedirects - 1);
    }
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.text();
}

// RSS フィード URL を検出する
export async function detectRssUrl(siteUrl: string): Promise<string | null> {
  let html = '';
  try {
    html = await fetchText(siteUrl);
  } catch {
    return null;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const candidates: string[] = [];
  doc.querySelectorAll('link[rel="alternate"]').forEach((el) => {
    const type = el.getAttribute('type') || '';
    const href = el.getAttribute('href') || '';
    if (type.includes('rss') || type.includes('atom') || href.includes('feed') || href.includes('rss')) {
      candidates.push(new URL(href, siteUrl).toString());
    }
  });

  const commonPaths = ['/feed', '/feed.xml', '/rss', '/rss.xml', '/index.xml', '/atom.xml', '/feeds/posts/default'];
  for (const path of commonPaths) {
    candidates.push(new URL(path, siteUrl).toString());
  }

  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      const text = await fetchText(candidate);
      const trimmed = text.trim();
      if (trimmed.startsWith('<?xml') || trimmed.startsWith('<rss') || trimmed.startsWith('<feed')) {
        return candidate;
      }
    } catch {
      // 無視
    }
  }
  return null;
}

// シンプルな XML タグ内のテキストを抽出する
function extractText(node: Node | null, tagName: string): string {
  if (!node) return '';
  const el = (node as Element).querySelector ? (node as Element).querySelector(tagName) : null;
  if (!el) return '';
  return (el.textContent || '').trim();
}

// RSS/Atom を解析する
export function parseRss(xmlText: string, siteUrl: string): ArticleItem[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  const items: ArticleItem[] = [];

  const isRss = doc.querySelector('rss') !== null || doc.querySelector('channel') !== null;
  if (isRss) {
    doc.querySelectorAll('item').forEach((item) => {
      const title = extractText(item, 'title') || 'タイトルなし';
      let link = extractText(item, 'link');
      const guid = extractText(item, 'guid');
      if (!link && guid) link = guid;
      let summary = extractText(item, 'description');
      if (!summary) summary = extractText(item, 'content\\:encoded') || extractText(item, 'encoded');
      summary = summary.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (summary.length > 300) summary = summary.slice(0, 300) + '…';
      if (link) {
        items.push({ title, url: new URL(link, siteUrl).toString(), summary });
      }
    });
  } else {
    // Atom
    doc.querySelectorAll('entry').forEach((entry) => {
      const title = extractText(entry, 'title') || 'タイトルなし';
      let link = '';
      const linkEl = entry.querySelector('link');
      if (linkEl) {
        link = linkEl.getAttribute('href') || linkEl.textContent || '';
      }
      let summary = extractText(entry, 'summary');
      if (!summary) summary = extractText(entry, 'content');
      summary = summary.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (summary.length > 300) summary = summary.slice(0, 300) + '…';
      if (link) {
        items.push({ title, url: new URL(link, siteUrl).toString(), summary });
      }
    });
  }
  return items;
}

// HTML から記事リンクをスクレイピングする
export function scrapeArticles(html: string, siteUrl: string): ArticleItem[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const items: ArticleItem[] = [];
  const seen = new Set<string>();
  const baseHost = new URL(siteUrl).hostname;

  doc.querySelectorAll('a[href]').forEach((el) => {
    const href = el.getAttribute('href') || '';
    const title = (el.textContent || '').trim();
    if (!href || !title || title.length < 5) return;
    try {
      const url = new URL(href, siteUrl).toString();
      if (seen.has(url)) return;
      seen.add(url);
      const parsed = new URL(url);
      const hostMatch = parsed.hostname === baseHost;
      const isArticleLike = /\/(\d{4}\/\d{2}|\d{4}\/\d{2}\/\d{2}|\d{4}-\d{2}-\d{2}|articles?|posts?|news|entry|p=|post_id=)/i.test(parsed.pathname);
      if (hostMatch && isArticleLike) {
        items.push({ title, url, summary: '' });
      }
    } catch {
      // 無視
    }
  });
  return items;
}

// 指定サイトから記事を収集する
export async function collectArticlesFromSite(siteUrl: string, rssUrl: string | null): Promise<ArticleItem[]> {
  let articles: ArticleItem[] = [];
  if (rssUrl) {
    try {
      const xmlText = await fetchText(rssUrl);
      articles = parseRss(xmlText, siteUrl);
    } catch {
      // RSS 取得失敗は無視
    }
  }
  if (articles.length === 0) {
    try {
      const html = await fetchText(siteUrl);
      articles = scrapeArticles(html, siteUrl);
    } catch {
      // スクレイピング失敗は無視
    }
  }
  return articles;
}
