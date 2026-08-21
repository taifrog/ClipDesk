// アプリ設定取得用ヘルパー

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0';
import { AiSummarySettings, ObsidianSettings } from './ai.ts';

// デバッグメッセージ出力用関数
// @param msg 出力する文字列
function debug(msg: string) {
  // 開発時は有効、本番はここをコメントアウト
  console.log(`[DEBUG] ${msg}`);
}

// AI要約設定のデフォルト値
const DEFAULT_AI_SUMMARY_SETTINGS: AiSummarySettings = {
  enabled: true,
  apiKey: '',
  model: 'gpt-4o-mini',
  language: 'ja',
};

// Obsidian 連携設定のデフォルト値
const DEFAULT_OBSIDIAN_SETTINGS: ObsidianSettings = {
  apiKey: '',
  folder: 'ClipDesk',
  filenameTemplate: '{{title}}',
  noteTemplate: `---
registered_at: {{registeredAt}}
url: {{url}}
title: {{title}}
event_start_date: {{eventStartDate}}
event_end_date: {{eventEndDate}}
location: {{location}}
category: {{category}}
comment: {{comment}}
---

# {{title}}

URL: {{url}}

## 要約

{{summary}}

## コメント

{{comment}}
`,
};

// アプリ設定全体（AI 要約設定 + Obsidian 連携設定）
export interface AppSettings {
  aiSummary: AiSummarySettings;
  obsidian: ObsidianSettings;
}

// 指定ユーザーのアプリ設定全体を取得する
// レコードが存在しない場合や各フィールドが未設定の場合はデフォルト値を返す
export async function getAppSettings(
  supabase: SupabaseClient,
  userId: string,
): Promise<AppSettings> {
  const { data, error } = await supabase
    .from('app_settings')
    .select(
      'ai_summary_enabled, ai_summary_api_key, ai_summary_model, ai_summary_language, obsidian_api_key, obsidian_folder, obsidian_filename_template, obsidian_note_template',
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    return {
      aiSummary: DEFAULT_AI_SUMMARY_SETTINGS,
      obsidian: DEFAULT_OBSIDIAN_SETTINGS,
    };
  }

  // モデル名はユーザーが自由に指定できるようにする。空文字や未定義の場合のみデフォルト値を使用する。
  const aiModel = data.ai_summary_model ? data.ai_summary_model : DEFAULT_AI_SUMMARY_SETTINGS.model;

  debug(`getAppSettings DB取得: enabled=${data.ai_summary_enabled}, apiKey存在=${!!data.ai_summary_api_key}, model=${data.ai_summary_model}, language=${data.ai_summary_language}`);

  return {
    aiSummary: {
      enabled: data.ai_summary_enabled ?? DEFAULT_AI_SUMMARY_SETTINGS.enabled,
      apiKey: data.ai_summary_api_key ?? DEFAULT_AI_SUMMARY_SETTINGS.apiKey,
      model: aiModel,
      language: data.ai_summary_language ?? DEFAULT_AI_SUMMARY_SETTINGS.language,
    },
    obsidian: {
      apiKey: data.obsidian_api_key ?? DEFAULT_OBSIDIAN_SETTINGS.apiKey,
      folder: data.obsidian_folder ?? DEFAULT_OBSIDIAN_SETTINGS.folder,
      filenameTemplate: data.obsidian_filename_template ?? DEFAULT_OBSIDIAN_SETTINGS.filenameTemplate,
      noteTemplate: data.obsidian_note_template ?? DEFAULT_OBSIDIAN_SETTINGS.noteTemplate,
    },
  };
}

// 指定ユーザーの AI 要約設定を保存する
export async function saveAiSummarySettings(
  supabase: SupabaseClient,
  userId: string,
  settings: Partial<AiSummarySettings>,
): Promise<AiSummarySettings> {
  // モデル名はユーザーが自由に指定できるようにする。空文字や未定義の場合のみデフォルト値を使用する。
  const model = settings.model ? settings.model : DEFAULT_AI_SUMMARY_SETTINGS.model;
  const upsert: Record<string, unknown> = {
    user_id: userId,
    ai_summary_model: model,
  };
  if (typeof settings.enabled === 'boolean') upsert.ai_summary_enabled = settings.enabled;
  if (typeof settings.apiKey === 'string') upsert.ai_summary_api_key = settings.apiKey;
  if (typeof settings.language === 'string') upsert.ai_summary_language = settings.language;

  debug(`saveAiSummarySettings upsert: ${JSON.stringify({ ...upsert, ai_summary_api_key: typeof upsert.ai_summary_api_key === 'string' ? '(set)' : '(not set)' })}`);
  await supabase.from('app_settings').upsert(upsert, { onConflict: 'user_id' });
  const updated = await getAppSettings(supabase, userId);
  return updated.aiSummary;
}

// 指定ユーザーの Obsidian 連携設定を保存する
export async function saveObsidianSettings(
  supabase: SupabaseClient,
  userId: string,
  settings: Partial<ObsidianSettings>,
): Promise<ObsidianSettings> {
  const upsert: Record<string, unknown> = {
    user_id: userId,
  };
  if (typeof settings.apiKey === 'string') upsert.obsidian_api_key = settings.apiKey;
  if (typeof settings.folder === 'string') upsert.obsidian_folder = settings.folder;
  if (typeof settings.filenameTemplate === 'string') {
    upsert.obsidian_filename_template = settings.filenameTemplate;
  }
  if (typeof settings.noteTemplate === 'string') upsert.obsidian_note_template = settings.noteTemplate;

  debug(`saveObsidianSettings upsert: ${JSON.stringify({ ...upsert, obsidian_api_key: typeof upsert.obsidian_api_key === 'string' ? '(set)' : '(not set)' })}`);
  await supabase.from('app_settings').upsert(upsert, { onConflict: 'user_id' });
  const updated = await getAppSettings(supabase, userId);
  return updated.obsidian;
}
