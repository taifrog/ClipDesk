// WebページのURLからHTMLを取得し、要約用のテキストを抽出するヘルパー

const FETCH_TIMEOUT_MS = 5000; // 外部サイト取得時のタイムアウト（ミリ秒）
const MAX_BODY_BYTES = 200 * 1024; // 取得するレスポンスボディの最大バイト数

// HTML文字列からタグを除去してプレーンテキストにする
// @param html HTML文字列
// @returns タグ除去後のテキスト
function stripHtmlTags(html: string): string {
  // script/style タグとその内容を除去する
  const withoutBlocks = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');

  // 残りのタグを除去し、連続する空白を整える
  // HTML エンティティは基本的にそのままでも要約に影響が少ないため、最低限の &nbsp; のみ置換する
  return withoutBlocks
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 指定セレクタに一致する要素群からテキストを抽出し連結する
// @param html HTML文字列
// @param selector 抽出対象の要素を表す正規表現
// @returns 抽出されたテキスト（空の場合もある）
function extractTextByTag(html: string, selector: RegExp): string {
  const matches: string[] = [];
  const regex = new RegExp(selector.source, selector.flags.includes('g') ? selector.flags : selector.flags + 'g');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const inner = match[1] || '';
    const text = stripHtmlTags(inner).trim();
    if (text) {
      matches.push(text);
    }
  }
  return matches.join('\n\n').trim();
}

// HTMLから主要な本文テキストを抽出する
// article/main/p タグを優先し、取得できなければ body 全体からタグを除去したテキストを返す
// @param html HTML文字列
// @returns 抽出された本文テキスト
function extractMainText(html: string): string {
  // 1. <article> タグの内容を優先して抽出
  const articleText = extractTextByTag(html, /<article[^>]*>([\s\S]*?)<\/article>/i);
  if (articleText.length >= 200) {
    return articleText;
  }

  // 2. <main> タグの内容を抽出
  const mainText = extractTextByTag(html, /<main[^>]*>([\s\S]*?)<\/main>/i);
  if (mainText.length >= 200) {
    return mainText;
  }

  // 3. <p> タグを連結して抽出
  const paragraphText = extractTextByTag(html, /<p[^>]*>([\s\S]*?)<\/p>/i);
  if (paragraphText.length >= 200) {
    return paragraphText;
  }

  // 4. フォールバック: body 全体からタグを除去
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return stripHtmlTags(bodyMatch ? bodyMatch[1] : html);
}

// URLからHTMLを取得し、要約用のテキストを抽出する
// @param url 取得対象のURL
// @returns 抽出された本文テキスト。取得失敗やHTMLでない場合は null
export async function fetchPageText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        // 一部サイトは UA がないとブロックするため、一般的なブラウザの UA を設定
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en;q=0.9',
      },
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('text/html')) {
      return null;
    }

    // ボディを最大指定バイト数まで読み取る
    const buffer = await response.arrayBuffer();
    const truncated = buffer.slice(0, MAX_BODY_BYTES);
    const html = new TextDecoder('utf-8', { fatal: false }).decode(truncated);

    const text = extractMainText(html);
    return text || null;
  } catch {
    return null;
  }
}
