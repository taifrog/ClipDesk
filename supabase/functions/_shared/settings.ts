// アプリ設定取得用ヘルパー

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0';
import { AiSummarySettings } from './ai.ts';

const SUPPORTED_MODELS = new Set([
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-3.5-turbo',
  'claude-3-haiku',
  'claude-3-sonnet',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
]);

const DEFAULT_SETTINGS: AiSummarySettings = {
  enabled: true,
  apiKey: '',
  model: 'gpt-4o-mini',
  language: 'ja',
};

// 指定ユーザーの AI 要約設定を取得する
// レコードが存在しない場合はデフォルト値を返す
export async function getAppSettings(supabase: SupabaseClient, userId: string): Promise<AiSummarySettings> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('ai_summary_enabled, ai_summary_api_key, ai_summary_model, ai_summary_language')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    return DEFAULT_SETTINGS;
  }

  const model = SUPPORTED_MODELS.has(data.ai_summary_model) ? data.ai_summary_model : DEFAULT_SETTINGS.model;

  return {
    enabled: data.ai_summary_enabled,
    apiKey: data.ai_summary_api_key,
    model,
    language: data.ai_summary_language,
  };
}

// 指定ユーザーの AI 要約設定を保存する
export async function saveAppSettings(
  supabase: SupabaseClient,
  userId: string,
  settings: Partial<AiSummarySettings>,
): Promise<AiSummarySettings> {
  const model = settings.model && SUPPORTED_MODELS.has(settings.model) ? settings.model : DEFAULT_SETTINGS.model;
  const upsert = {
    user_id: userId,
    ai_summary_enabled: typeof settings.enabled === 'boolean' ? settings.enabled : undefined,
    ai_summary_api_key: typeof settings.apiKey === 'string' ? settings.apiKey : undefined,
    ai_summary_model: model,
    ai_summary_language: typeof settings.language === 'string' ? settings.language : undefined,
  };

  await supabase.from('app_settings').upsert(upsert, { onConflict: 'user_id' });
  return getAppSettings(supabase, userId);
}
