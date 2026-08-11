// RSS フィード検出・解析用ヘルパー
// Deno 標準の DOMParser を使用して HTML/XML を解析する。

export interface ArticleItem {
  title: string;
  url: string;
  summary: string;
}

// fetch のデフォルトタイムアウト（ミリ秒）
const DEFAULT_FETCH_TIMEOUT_MS = 8000;
// 最大リダイレクト追跡回数
const MAX_REDIRECTS = 5;

// URL からテキストを取得する
// @param targetUrl 取得対象の URL
// @param maxRedirects 残りリダイレクト追跡回数
// @param timeoutMs タイムアウト時間（ミリ秒）
async function fetchText(targetUrl: string, maxRedirects = MAX_REDIRECTS, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS): Promise<string> {
  if (maxRedirects <= 0) {
    throw new Error('リダイレクト回数が上限に達しました');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'manual',
    });

    // リダイレクト応答の場合は Location ヘッダーを追跡する
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location) {
        return fetchText(new URL(location, targetUrl).toString(), maxRedirects - 1, timeoutMs);
      }
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

// 指定 URL が RSS/Atom フィードかどうかを確認する
// @param candidateUrl 検証する URL
async function validateRssUrl(candidateUrl: string): Promise<boolean> {
  try {
    const text = await fetchText(candidateUrl);
    const trimmed = text.trim();
    return trimmed.startsWith('<?xml') || trimmed.startsWith('<rss') || trimmed.startsWith('<feed');
  } catch {
    return false;
  }
}

// RSS フィード URL を検出する
// @param siteUrl 検出対象サイトの URL
// @return 検出した RSS/Atom URL、失敗時は null
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

  // HTML の link[rel="alternate"] から RSS/Atom 候補を収集する
  doc.querySelectorAll('link[rel="alternate"]').forEach((el) => {
    const type = el.getAttribute('type') || '';
    const href = el.getAttribute('href') || '';
    if (type.includes('rss') || type.includes('atom') || href.includes('feed') || href.includes('rss')) {
      try {
        candidates.push(new URL(href, siteUrl).toString());
      } catch {
        // 無効な URL は無視
      }
    }
  });

  // 一般的な RSS パスを候補に追加する
  const commonPaths = ['/feed', '/feed.xml', '/rss', '/rss.xml', '/index.xml', '/atom.xml', '/feeds/posts/default'];
  for (const path of commonPaths) {
    try {
      candidates.push(new URL(path, siteUrl).toString());
    } catch {
      // 無視
    }
  }

  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);

    if (await validateRssUrl(candidate)) {
      return candidate;
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
// @param xmlText フィードの XML 文字列
// @param siteUrl 記事 URL の相対パス解決用ベース URL
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
// @param html HTML 文字列
// @param siteUrl 記事 URL の相対パス解決用ベース URL
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
// @param siteUrl 対象サイトの URL
// @param rssUrl RSS/Atom URL（未検出の場合は null）
export async function collectArticlesFromSite(siteUrl: string, rssUrl: string | null): Promise<ArticleItem[]> {
  let articles: ArticleItem[] = [];

  // RSS/Atom フィードから取得を試みる
  if (rssUrl) {
    try {
      const xmlText = await fetchText(rssUrl);
      articles = parseRss(xmlText, siteUrl);
    } catch {
      // RSS 取得失敗は無視してスクレイピングへフォールバック
    }
  }

  // RSS で取得できなければ HTML スクレイピングを試みる
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
