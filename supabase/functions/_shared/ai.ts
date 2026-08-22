// OpenCode Go API を使った AI 要約ヘルパー

export interface AiSummarySettings {
  enabled: boolean;
  apiKey: string;
  model: string;
  language: string;
}

// AI 要約結果に含まれるイベント情報
export interface AiSummaryResult {
  summary: string;
  eventStartDate: string | null;
  eventEndDate: string | null;
  location: string | null;
}

// Obsidian 連携設定を表す型
// PC 版 ClipDesk ローカルサーバー経由で Obsidian Local REST API へ書き出す設定
export interface ObsidianSettings {
  apiKey: string;
  folder: string;
  filenameTemplate: string;
  noteTemplate: string;
}

// Chrome 拡張機能連携設定を表す型
// Web アプリから拡張機能へ sendMessage する際の拡張機能 ID を保持する
export interface ExtensionSettings {
  // Chrome 拡張機能の ID（空文字の場合は ID を指定せずに送信する）
  extensionId: string;
}

// テキストを指定文字数に制限する
function truncateText(text: string, maxChars: number): string {
  if (!text) return '';
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n…（以下省略）';
}

// 日本語の日付表記を ISO 8601 形式に変換する試行を行う
// 例: "2026年9月1日" -> "2026-09-01T00:00:00+09:00"
// 例: "2026/09/01 10:00" -> "2026-09-01T10:00:00+09:00"
// @param dateText 変換対象の日付文字列
// @returns ISO 8601 形式の日付文字列、変換できない場合は null
function parseDateText(dateText: string): string | null {
  if (!dateText || typeof dateText !== 'string') return null;

  const normalized = dateText
    .trim()
    // 和暦や漢数字は扱わず、一般的な日本語表記を正規化する
    .replace(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/, '$1/$2/$3')
    .replace(/(\d{4})年\s*(\d{1,2})月/, '$1/$2/1')
    .replace(/(\d{1,2})月\s*(\d{1,2})日/, `${new Date().getFullYear()}/$1/$2`);

  // 時刻部分があるか確認する
  const hasTime = /\d{1,2}:\d{2}/.test(normalized);

  // 日付部分を抽出する
  const dateMatch = normalized.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if (!dateMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);

  let hours = 0;
  let minutes = 0;
  if (hasTime) {
    const timeMatch = normalized.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) {
      hours = Number(timeMatch[1]);
      minutes = Number(timeMatch[2]);
    }
  }

  // 日本時間（UTC+9）として Date オブジェクトを作成する
  const date = new Date(Date.UTC(year, month - 1, day, hours - 9, minutes));
  if (isNaN(date.getTime())) return null;

  // ISO 8601 形式で返す（+09:00 タイムゾーン）
  return date.toISOString().replace('Z', '+09:00');
}

// LLM 応答から JSON 部分を抽出する
// コードブロックで囲まれている場合は中身を取り出す
// @param text LLM からの生の応答文字列
// @returns パース済みオブジェクト、失敗時は null
function extractJsonFromResponse(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const trimmed = text.trim();

  // コードブロックに囲まれている場合は中身を取り出す
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = codeBlockMatch ? codeBlockMatch[1].trim() : trimmed;

  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

// OpenCode Go でテキストを要約し、イベント情報も同時に抽出する
// @param text 要約対象の本文
// @param title Webページのタイトル
// @param settings AI要約設定
// @returns 要約文字列とイベント情報を含むオブジェクト
export async function summarizeWithOpenCodeGo(
  text: string,
  title: string,
  settings: AiSummarySettings,
): Promise<AiSummaryResult> {
  if (!settings.apiKey) {
    throw new Error('OpenCode Go APIキーが設定されていません');
  }
  const bodyText = truncateText(text, 4000);
  const languageLabel = settings.language === 'ja' ? '日本語' : settings.language;

  const prompt = `以下のWebページを「${languageLabel}」で簡潔に要約してください。

さらに、ページの内容がイベント、展示、フェスティバル、セミナー、ライブ、会議などの開催情報を含む場合は、以下の情報も抽出してください。
- event_start_date: 開始日時（ISO 8601形式、例: 2026-09-01T10:00:00+09:00）
- event_end_date: 終了日時（ISO 8601形式、例: 2026-09-10T18:00:00+09:00）
- location: 開催場所（会場名、住所、地域名など）

該当しない場合は event_start_date, event_end_date, location を null にしてください。
時刻が不明な場合は 00:00:00+09:00 としてください。

応答は以下の JSON 形式のみで返してください。余計な説明は不要です。

{
  "summary": "要約文をここに記述",
  "event_start_date": "2026-09-01T10:00:00+09:00",
  "event_end_date": "2026-09-10T18:00:00+09:00",
  "location": "東京都港区六本木"
}

タイトル: ${title}

本文:\n${bodyText}`;

  const response = await fetch('https://opencode.ai/zen/go/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        { role: 'system', content: 'あなたはWebページの内容を要約し、イベント情報をJSON形式で抽出するアシスタントです。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 700,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`AI APIの呼び出しに失敗しました: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  if (!data.choices || data.choices.length === 0) {
    throw new Error('AIからの応答が空です');
  }

  const rawContent = String(data.choices[0].message.content || '').trim();

  // JSON 応答を解析する
  const parsed = extractJsonFromResponse(rawContent);

  let summary = '';
  let eventStartDate: string | null = null;
  let eventEndDate: string | null = null;
  let location: string | null = null;

  if (parsed && typeof parsed.summary === 'string') {
    summary = parsed.summary.trim();
    eventStartDate = parseDateText(String(parsed.event_start_date ?? ''));
    eventEndDate = parseDateText(String(parsed.event_end_date ?? ''));
    const rawLocation = parsed.location;
    if (rawLocation && typeof rawLocation === 'string' && rawLocation.trim()) {
      location = rawLocation.trim();
    }
  } else {
    // JSON パースに失敗した場合は従来通り要約文のみを返す
    summary = rawContent;
  }

  return {
    summary,
    eventStartDate,
    eventEndDate,
    location,
  };
}
