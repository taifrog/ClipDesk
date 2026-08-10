// OpenCode Go API を使った AI 要約ヘルパー

export interface AiSummarySettings {
  enabled: boolean;
  apiKey: string;
  model: string;
  language: string;
}

// テキストを指定文字数に制限する
function truncateText(text: string, maxChars: number): string {
  if (!text) return '';
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n…（以下省略）';
}

// OpenCode Go でテキストを要約する
// @param text 要約対象の本文
// @param title Webページのタイトル
// @param settings AI要約設定
// @returns 要約文字列
export async function summarizeWithOpenCodeGo(
  text: string,
  title: string,
  settings: AiSummarySettings,
): Promise<string> {
  if (!settings.apiKey) {
    throw new Error('OpenCode Go APIキーが設定されていません');
  }
  const bodyText = truncateText(text, 4000);
  const languageLabel = settings.language === 'ja' ? '日本語' : settings.language;
  const prompt = `以下のWebページを「${languageLabel}」で簡潔に要約してください。\n\nタイトル: ${title}\n\n本文:\n${bodyText}`;

  const response = await fetch('https://opencode.ai/zen/go/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        { role: 'system', content: 'あなたはWebページの内容を要約するアシスタントです。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.5,
      max_tokens: 500,
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
  return String(data.choices[0].message.content || '').trim();
}
